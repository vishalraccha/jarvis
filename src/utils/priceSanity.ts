/**
 * Price Scale Sanity Guard for Multi-Instrument Accuracy
 * Prevents cross-instrument price scale leaks (e.g., Gold $3,660 leaking into Nasdaq $26,800,
 * or Bitcoin $91,000 leaking into Gold).
 */

export function isPricePlausibleForSymbol(symbol: string, price: number | null | undefined): boolean {
  if (price === null || price === undefined || !Number.isFinite(price) || price <= 0) {
    return false;
  }

  const clean = (symbol || '').toUpperCase().replace(/[-_/]/g, '');

  // 1. Equity Indices (NAS100, NDX, US100, NASDAQ, NQ, QQQ, SPX, US500, US30, DOW)
  if (
    clean.includes('NAS100') ||
    clean.includes('NDX') ||
    clean.includes('US100') ||
    clean.includes('NASDAQ') ||
    clean.includes('NQ') ||
    clean === 'QQQ'
  ) {
    return price >= 5000 && price <= 60000;
  }

  if (clean.includes('US500') || clean.includes('SPX') || clean.includes('ES')) {
    return price >= 2000 && price <= 15000;
  }

  if (clean.includes('US30') || clean.includes('DJI') || clean.includes('DOW') || clean.includes('YM')) {
    return price >= 15000 && price <= 90000;
  }

  // 2. Precious Metals (Gold: XAUUSD, XAU, GC, GOLD)
  if (clean.includes('XAU') || clean.includes('GOLD') || clean === 'GC') {
    return price >= 1000 && price <= 10000;
  }

  // Silver (XAGUSD, SI)
  if (clean.includes('XAG') || clean.includes('SILVER') || clean === 'SI') {
    return price >= 10 && price <= 150;
  }

  // 3. Crypto Assets
  if (clean.includes('BTC')) {
    return price >= 10000 && price <= 500000;
  }

  if (clean.includes('ETH')) {
    return price >= 400 && price <= 30000;
  }

  if (clean.includes('SOL')) {
    return price >= 5 && price <= 2000;
  }

  if (clean.includes('BNB')) {
    return price >= 50 && price <= 10000;
  }

  // 4. Forex Major & Minor Pairs
  if (
    clean.includes('EURUSD') ||
    clean.includes('GBPUSD') ||
    clean.includes('AUDUSD') ||
    clean.includes('NZDUSD') ||
    clean.includes('USDCAD') ||
    clean.includes('USDCHF')
  ) {
    return price >= 0.4 && price <= 3.0;
  }

  if (clean.includes('USDJPY') || clean.includes('EURJPY') || clean.includes('GBPJPY')) {
    return price >= 50 && price <= 350;
  }

  // Default: Must be positive finite number
  return price > 0;
}
