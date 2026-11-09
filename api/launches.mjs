// Vercel Serverless Function: every token launched through Zoza, read from
// Elysium. Zoza's launch factory (contracts/ZozaLaunchpad.sol) keeps a
// registry of its launches, so this reads the newest ones straight from it —
// no log scanning — with each token's on-chain metadata. Cached at the edge
// for a minute.
import { createPublicClient, http, parseAbi } from "viem";

const RPC = process.env.ZOZA_RPC_URL || process.env.NEXT_PUBLIC_ELYSIUM_MAINNET_RPC || "https://testnet-rpc.elysium.kinetiq.xyz";
const FACTORY = process.env.NEXT_PUBLIC_ZOZA_FACTORY || "";
const MAX_TOKENS = 120;

const factoryAbi = parseAbi([
  "function recentTokens(uint256 offset, uint256 count) view returns (address[])",
  "function launches(address token) view returns (address curve, address deployer, uint64 block, uint64 time)",
]);
const tokenAbi = parseAbi([
  "struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function getTokenInfo() view returns (address tokenDeployer, string tokenLogo, string tokenDescription, Socials tokenSocials)",
]);

const client = createPublicClient({
  transport: http(RPC, { timeout: 12_000, retryCount: 1, fetchOptions: { headers: { "user-agent": "zoza-launches/1.0 (+https://usezoza.app)" } } }),
});

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
  if (!/^0x[0-9a-fA-F]{40}$/.test(FACTORY)) {
    // launchpad not deployed yet: nothing to list
    res.setHeader("cache-control", "public, s-maxage=60");
    return res.status(200).json({ head: 0, tokens: [] });
  }
  try {
    const [head, addresses] = await Promise.all([
      client.getBlockNumber(),
      client.readContract({ address: FACTORY, abi: factoryAbi, functionName: "recentTokens", args: [BigInt(0), BigInt(MAX_TOKENS)] }),
    ]);
    const tokens = await inBatches([...addresses], 8, async (address) => {
      try {
        const t = { address, abi: tokenAbi };
        const [name, symbol, info, launch] = await Promise.all([
          client.readContract({ ...t, functionName: "name" }),
          client.readContract({ ...t, functionName: "symbol" }),
          client.readContract({ ...t, functionName: "getTokenInfo" }),
          client.readContract({ address: FACTORY, abi: factoryAbi, functionName: "launches", args: [address] }),
        ]);
        const [, logo, description, socials] = info;
        const [curve, deployer, block, time] = launch;
        const website = siteFrom(socials.website);
        return {
          name,
          ticker: symbol,
          x: handleFrom(socials.twitter),
          website,
          address,
          curve,
          logo: logo || undefined,
          block: Number(block),
          creator: deployer,
          tx: "",
          createdAt: Number(time) * 1000,
          profile: profileFrom(description, website),
        };
      } catch {
        return null;
      }
    });

    res.setHeader("cache-control", "public, s-maxage=60, stale-while-revalidate=600");
    return res.status(200).json({ head: Number(head), tokens: tokens.filter(Boolean) });
  } catch {
    res.setHeader("cache-control", "no-store");
    return res.status(502).json({ error: "Elysium did not respond." });
  }
}
