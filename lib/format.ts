import { formatEther } from "viem";

const SUBSCRIPT = "₀₁₂₃₄₅₆₇₈₉";

/**
 * Prices on a fresh bonding curve are tiny (1e-9 ETH and below), so runs of
 * leading zeros are collapsed into a subscript: 0.000000045 → 0.0₇45.
 */
export function fmtPrice(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return "0";
  if (p >= 1) return p.toLocaleString("en-US", { maximumFractionDigits: 4 });
  if (p >= 0.0001) return p.toPrecision(4).replace(/0+$/, "");
  // zeros between the decimal point and the first significant digit
  const zeros = -Math.floor(Math.log10(p)) - 1;
  const digits = Math.round(p * 10 ** (zeros + 4)).toString().slice(0, 4).replace(/0+$/, "");
  return `0.0${String(zeros).split("").map((d) => SUBSCRIPT[+d]).join("")}${digits}`;
}

/** wei → "0.0123" with a sensible number of decimals. */
export function fmtEth(wei: bigint, maxDecimals = 6): string {
  const n = Number(formatEther(wei));
  if (n === 0) return "0";
  if (n < 10 ** -maxDecimals) return `<${(10 ** -maxDecimals).toFixed(maxDecimals)}`;
  return n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? maxDecimals : 4 });
}

/** 18-decimal token amount → "12.4M". */
export function fmtTokens(amount: bigint): string {
  const n = Number(formatEther(amount));
  return n.toLocaleString("en-US", { notation: n >= 10_000 ? "compact" : "standard", maximumFractionDigits: 2 });
}

/** USD price that can be tiny: $0.0₅123, $0.42, $1,234.56. */
export const fmtUsdPrice = (usd: number) => `$${usd >= 0.01 ? usd.toLocaleString("en-US", { maximumFractionDigits: usd >= 1 ? 2 : 4 }) : fmtPrice(usd)}`;

/** USD amount: $12.34, $1.2K, $3.4M. */
export function fmtUsd(usd: number): string {
  if (!Number.isFinite(usd)) return "$0";
  if (usd > 0 && usd < 0.01) return "<$0.01";
  return `$${usd.toLocaleString("en-US", { notation: usd >= 100_000 ? "compact" : "standard", maximumFractionDigits: 2 })}`;
}
