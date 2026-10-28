// Vercel Serverless Function: same-origin JSON-RPC proxy to Robinhood Chain.
// Browsers may not be able to call the public RPC directly (CORS / rate
// limits), so the launch flow reads chain state through here. Read-only
// methods only — transactions are always signed and sent by the user's wallet.
const UPSTREAM = "https://rpc.mainnet.chain.robinhood.com";
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

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST only" });
  }
  let body = req.body;
  try {
    if (typeof body === "string") body = JSON.parse(body);
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
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const text = await upstream.text();
    res.setHeader("content-type", "application/json");
    res.setHeader("cache-control", "no-store");
    return res.status(upstream.status).send(text);
  } catch {
    return res.status(502).json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Robinhood Chain RPC unavailable" } });
  }
};
