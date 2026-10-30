// Vercel Serverless Function: the $ZOZA holder leaderboard, rebuilt from the
// token's Transfer events on Robinhood Chain (no indexer needed). Balances,
// whether a wallet ever sent tokens away (other than burning them), and when it
// first received any all come from the same replay. Contracts (the bonding
// curve, the graduated pool, vaults) and burn addresses are left out so only
// real holders rank. Cached at the edge for a minute; `?me=0x…` also returns
// that wallet's own rank.
import { createPublicClient, getAddress, http, isAddress, parseAbi } from "viem";

const RPC = process.env.ZOZA_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const FACTORY = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e";
const TOKEN = getAddress(process.env.ZOZA_TOKEN || "0x597DAe22ABD24eef9F73E033b37B7a406E7F8ACe");
const LOOKBACK = BigInt(process.env.ZOZA_LOOKBACK_BLOCKS || 40_000_000);
const TOP = 50;
const ZERO = "0x0000000000000000000000000000000000000000";
const DEAD = "0x000000000000000000000000000000000000dead";
const WHALE_BPS = BigInt(100); // 1% of supply

const transferEvent = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"])[0];
const launchEvent = parseAbi([
  "event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)",
])[0];
const tokenAbi = parseAbi(["function totalSupply() view returns (uint256)"]);

const client = createPublicClient({ transport: http(RPC, { timeout: 15_000, retryCount: 1 }) });

/** Logs in [from, to] oldest first, shrinking a range the RPC rejects. */
async function logsIn(from, to, get) {
  const out = [];
  let size = BigInt(5_000_000);
  let start = from;
  while (start <= to) {
    const end = start + size - BigInt(1) < to ? start + size - BigInt(1) : to;
    try {
      out.push(...(await get(start, end)));
      start = end + BigInt(1);
    } catch (err) {
      if (size <= BigInt(2_000)) throw err;
      size /= BigInt(4);
    }
  }
  return out;
}

let launchBlock = null; // found once per warm instance

async function findLaunchBlock(head) {
  if (launchBlock !== null) return launchBlock;
  const from = head > LOOKBACK ? head - LOOKBACK : BigInt(0);
  const logs = await logsIn(from, head, (f, t) =>
    client.getLogs({ address: FACTORY, event: launchEvent, args: { token: TOKEN }, fromBlock: f, toBlock: t }),
  );
  launchBlock = logs.length ? logs[0].blockNumber : from;
  return launchBlock;
}

async function inBatches(items, n, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += n) out.push(...(await Promise.all(items.slice(i, i + n).map(fn))));
  return out;
}

export default async function handler(req, res) {
  try {
    const head = await client.getBlockNumber();
    const start = await findLaunchBlock(head);
    const [supply, logs] = await Promise.all([
      client.readContract({ address: TOKEN, abi: tokenAbi, functionName: "totalSupply" }),
      logsIn(start, head, (f, t) => client.getLogs({ address: TOKEN, event: transferEvent, fromBlock: f, toBlock: t })),
    ]);

    // replay every transfer
    const wallets = new Map();
    const at = (a) => {
      const k = a.toLowerCase();
      let w = wallets.get(k);
      if (!w) wallets.set(k, (w = { address: a, balance: BigInt(0), sold: false, burned: BigInt(0), since: null }));
      return w;
    };
    for (const l of logs) {
      const { from, to, value } = l.args;
      const burn = to.toLowerCase() === ZERO || to.toLowerCase() === DEAD;
      if (from.toLowerCase() !== ZERO) {
        const w = at(from);
        w.balance -= value;
        if (burn) w.burned += value;
        else w.sold = true;
      }
      if (!burn) {
        const w = at(to);
        w.balance += value;
        if (w.since === null) w.since = Number(l.blockNumber);
      }
    }

    // rank by balance, then drop contracts (curve, pool, vaults) from the top of the list
    const ranked = [...wallets.values()].filter((w) => w.balance > BigInt(0)).sort((a, b) => (b.balance > a.balance ? 1 : b.balance < a.balance ? -1 : 0));
    const holders = [];
    let contracts = 0;
    for (let i = 0; i < ranked.length && holders.length < TOP; i += 10) {
      const batch = ranked.slice(i, i + 10);
      const codes = await inBatches(batch, 10, (w) => client.getCode({ address: w.address }).catch(() => "0x"));
      batch.forEach((w, j) => {
        if (codes[j] && codes[j] !== "0x") contracts++;
        else if (holders.length < TOP) holders.push(w);
      });
    }
    const people = ranked.length - contracts;

    const row = (w, rank) => ({
      rank,
      address: getAddress(w.address),
      balance: w.balance.toString(),
      pct: Number((w.balance * BigInt(1_000_000)) / (supply || BigInt(1))) / 10_000, // share of supply, in percent
      whale: w.balance * BigInt(10_000) >= supply * WHALE_BPS,
      diamond: !w.sold,
      burner: w.burned > BigInt(0),
      since: w.since,
    });
    const top = holders.map((w, i) => row(w, i + 1));

    // the visitor's own standing, if asked for
    let me = null;
    const q = String(req.query?.me || "");
    if (isAddress(q)) {
      const k = q.toLowerCase();
      const idx = top.findIndex((h) => h.address.toLowerCase() === k);
      if (idx >= 0) me = top[idx];
      else {
        const w = wallets.get(k);
        if (w && w.balance > BigInt(0)) {
          // rank among everyone above it who isn't one of the contracts already seen
          const above = ranked.filter((r) => r.balance > w.balance).length;
          me = row(w, Math.max(1, above + 1 - contracts));
        }
      }
    }

    res.setHeader("cache-control", isAddress(q) ? "public, s-maxage=30" : "public, s-maxage=60, stale-while-revalidate=600");
    return res.status(200).json({
      token: TOKEN,
      head: Number(head),
      supply: supply.toString(),
      holders: people,
      diamonds: top.filter((h) => h.diamond).length,
      whales: top.filter((h) => h.whale).length,
      top,
      me,
    });
  } catch {
    res.setHeader("cache-control", "no-store");
    return res.status(502).json({ error: "Robinhood Chain did not respond." });
  }
}
