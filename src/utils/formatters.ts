/**
 * High precision formatting utilities for financial market data
 */

export function formatPrice(price: number, decimals: number = 2): string {
  if (isNaN(price) || price === 0) return '0.00';
  const dec = Math.max(0, Math.min(8, decimals));
  return price.toLocaleString('en-US', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

export function formatQuantity(qty: number, decimals: number = 2): string {
  if (isNaN(qty) || qty === 0) return '0.00';
  if (qty >= 1_000_000) {
    return (qty / 1_000_000).toFixed(2) + 'M';
  }
  if (qty >= 1000) {
    return (qty / 1000).toFixed(2) + 'K';
  }
  const maxDec = Math.max(0, Math.min(8, decimals));
  const minDec = Math.min(2, maxDec);
  return qty.toLocaleString('en-US', {
    minimumFractionDigits: minDec,
    maximumFractionDigits: maxDec,
  });
}

export function formatNotional(usd: number): string {
  if (isNaN(usd) || usd === 0) return '$0.00';
  if (usd >= 1_000_000) {
    return `$${(usd / 1_000_000).toFixed(2)}M`;
  }
  if (usd >= 1_000) {
    return `$${(usd / 1_000).toFixed(1)}K`;
  }
  return `$${usd.toFixed(2)}`;
}

export function formatTimePrecise(timestampMs: number): string {
  const d = new Date(timestampMs);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

export function formatTimeShort(timestampMs: number): string {
  const d = new Date(timestampMs);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}
