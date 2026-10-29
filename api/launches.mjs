// Vercel Serverless Function: every token launched through Zoza, read from
// Robinhood Chain. Explore used to list only launches made in the visitor's
// own browser; this scans the launch factory's TokenLaunched events and keeps
// the tokens whose on-chain description says "Launched with Zoza" (Zoza writes
// that into every token it launches). Cached at the edge for a minute.
import { createPublicClient, http, parseAbi } from "viem";

const RPC = process.env.ZOZA_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const FACTORY = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e";
// how far back to look; launches are sparse, so wide ranges are cheap
const LOOKBACK = BigInt(process.env.ZOZA_LOOKBACK_BLOCKS || 40_000_000);
const MAX_TOKENS = 120;
const ZOZA_MARK = /launched with zoza/i;

const factoryAbi = parseAbi([
  "event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)",
]);
const tokenAbi = parseAbi([
  "struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function getTokenInfo() view returns (address tokenDeployer, string tokenLogo, string tokenDescription, Socials tokenSocials)",
]);

const client = createPublicClient({ transport: http(RPC, { timeout: 12_000, retryCount: 1 }) });

/** TokenLaunched logs in [from, to], newest range first, shrinking a range the RPC rejects. */
async function launchLogs(from, to) {
  const out = [];
  let size = BigInt(5_000_000);
  let end = to;
  while (end >= from) {
    const start = end - size + BigInt(1) > from ? end - size + BigInt(1) : from;
    try {
      const logs = await client.getLogs({ address: FACTORY, event: factoryAbi[0], fromBlock: start, toBlock: end });
      out.push(...logs.reverse());
      if (out.length >= MAX_TOKENS * 4) break;
      end = start - BigInt(1);
    } catch (err) {
      if (size <= BigInt(10_000)) throw err;
      size /= BigInt(4);
    }
  }
  return out;
}

async function inBatches(items, n, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += n) out.push(...(await Promise.all(items.slice(i, i + n).map(fn))));
  return out;
}

const handleFrom = (url) => url.match(/(?:x|twitter)\.com\/@?([A-Za-z0-9_]{1,15})/i)?.[1] ?? null;
const siteFrom = (url) => url.replace(/^https?:\/\//i, "").replace(/\/$/, "") || null;

function profileFrom(description, website) {
  const m = description.match(/a tokenized (fomo|pump\.fun) profile: (https:\/\/\S+?)\.?(\s|$)/i);
  if (!m) return undefined;
  return { platform: m[1].toLowerCase() === "fomo" ? "fomo" : "pumpfun", url: m[2] || `https://${website}`, ...(/unofficial:/i.test(description) ? { unofficial: true } : {}) };
}

export default async function handler(req, res) {
  try {
    const head = await client.getBlockNumber();
    const from = head > LOOKBACK ? head - LOOKBACK : BigInt(0);
    const logs = (await launchLogs(from, head)).slice(0, MAX_TOKENS * 4);

    const tokens = await inBatches(logs, 8, async (l) => {
      try {
        const t = { address: l.args.token, abi: tokenAbi };
        const [name, symbol, info] = await Promise.all([
          client.readContract({ ...t, functionName: "name" }),
          client.readContract({ ...t, functionName: "symbol" }),
          client.readContract({ ...t, functionName: "getTokenInfo" }),
        ]);
        const [, logo, description, socials] = info;
        if (!ZOZA_MARK.test(description)) return null;
        const website = siteFrom(socials.website);
        return {
          name,
          ticker: symbol,
          x: handleFrom(socials.twitter),
          website,
          address: l.args.token,
          curve: l.args.curve,
          logo: logo || undefined,
          block: Number(l.blockNumber),
          creator: l.args.deployer,
          tx: l.transactionHash,
          profile: profileFrom(description, website),
        };
      } catch {
        return null;
      }
    });
    const zoza = tokens.filter(Boolean).slice(0, MAX_TOKENS);

    // launch times, one block read per distinct block
    const times = new Map();
    await inBatches([...new Set(zoza.map((t) => t.block))], 8, async (b) => {
      try {
        const block = await client.getBlock({ blockNumber: BigInt(b) });
        times.set(b, Number(block.timestamp) * 1000);
      } catch {
        // leave it out; the card shows no age
      }
    });
    for (const t of zoza) t.createdAt = times.get(t.block) ?? 0;

    res.setHeader("cache-control", "public, s-maxage=60, stale-while-revalidate=600");
    return res.status(200).json({ head: Number(head), tokens: zoza });
  } catch {
    res.setHeader("cache-control", "no-store");
    return res.status(502).json({ error: "Robinhood Chain did not respond." });
  }
}
