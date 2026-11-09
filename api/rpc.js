// Vercel Serverless Function: same-origin JSON-RPC proxy to Elysium (Kinetiq's
// L2; testnet until NEXT_PUBLIC_ELYSIUM_MAINNET_RPC is set).
// Browsers may not be able to call the public RPC directly (CORS / rate
// limits), so the launch flow reads chain state through here. Read-only
// methods only — transactions are always signed and sent by the user's wallet.
const UPSTREAM = process.env.ZOZA_RPC_URL || process.env.NEXT_PUBLIC_ELYSIUM_MAINNET_RPC || "https://testnet-rpc.elysium.kinetiq.xyz";
const ALLOWED = new Set([
  "eth_chainId",
  "net_version",
  "eth_blockNumber",
  "eth_call",
  "eth_estimateGas",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_feeHistory",
  "eth_getBalance",
  "eth_getCode",
  "eth_getBlockByNumber",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  // trade history for token pages (CurveBuy / CurveSell events)
  "eth_getLogs",
]);
const MAX_BATCH = 20;

// Reads may also come as GET /api/rpc?b=<base64url JSON>, which Vercel's edge
// caches for a few seconds: visitors asking for the same thing at the same
// moment (the ticker, the burn tracker, a token page) then share one call.
const GET_CACHE = "public, s-maxage=4, stale-while-revalidate=10";

module.exports = async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "GET or POST only" });
  }
  let body = req.method === "GET" ? String(req.query.b || "") : req.body;
  try {
    if (req.method === "GET") body = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    else if (typeof body === "string") body = JSON.parse(body);
  } catch {
    return res.status(400).json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
  }
  const calls = Array.isArray(body) ? body : [body];
  if (!calls.length || calls.length > MAX_BATCH || calls.some((c) => !c || !ALLOWED.has(c.method))) {
    return res.status(400).json({ jsonrpc: "2.0", id: null, error: { code: -32601, message: "Method not allowed" } });
  }
  try {
    const upstream = await fetch(UPSTREAM, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "zoza-rpc-proxy/1.0 (+https://usezoza.app)" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const text = await upstream.text();
    res.setHeader("content-type", "application/json");
    res.setHeader("cache-control", req.method === "GET" && upstream.ok ? GET_CACHE : "no-store");
    return res.status(upstream.status).send(text);
  } catch {
    return res.status(502).json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Elysium RPC unavailable" } });
  }
};
