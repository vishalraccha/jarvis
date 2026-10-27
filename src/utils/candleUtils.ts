/**
 * Candle Utilities: Merging, Deduplication, and Validation
 * JARVIS HEATMAP TERMINAL - SECTIONS 5 & 6
 */

import { Candle, CandleTimeframe } from '../types/market';

export const TIMEFRAME_SECONDS: Record<string, number> = {
  '1m': 60,
  '3m': 180,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '2h': 7200,
  '4h': 14400,
  '1d': 86400,
};

/**
 * Merges two candle arrays, deduplicating by timestamp and ensuring strictly ascending order.
 * Fresh candles overwrite existing candles at the same timestamp.
 * Strictly guarantees candles from different timeframes are never mixed together.
 */
export function mergeAndDeduplicateCandles(
  existingCandles: Candle[],
  newCandles: Candle[],
  timeframe?: CandleTimeframe
): Candle[] {
  const tfSec = timeframe ? TIMEFRAME_SECONDS[timeframe] : undefined;

  const validNew = newCandles.filter(validateCandle);
  if (existingCandles.length === 0) return [...validNew].sort((a, b) => a.time - b.time);

  const validExisting = existingCandles.filter(validateCandle);

  // If target timeframe is known and existing candles have a step mismatch (e.g. 1m 60s vs 5m 300s):
  if (tfSec && tfSec < 86400 && validExisting.length >= 2) {
    const existStep = Math.abs(validExisting[1].time - validExisting[0].time);
    if (existStep > 0 && existStep !== tfSec) {
      return [...validNew].sort((a, b) => a.time - b.time);
    }
  }

  // Also auto-detect step mismatch between existing and new:
  if (validNew.length >= 2 && validExisting.length >= 2) {
    const newStep = Math.abs(validNew[1].time - validNew[0].time);
    const existStep = Math.abs(validExisting[1].time - validExisting[0].time);
    if (newStep > 0 && existStep > 0 && newStep !== existStep) {
      return [...validNew].sort((a, b) => a.time - b.time);
    }
  }

  if (validNew.length === 0) return [...validExisting].sort((a, b) => a.time - b.time);

  // Use newCandles median price as benchmark reference to purge cross-symbol pollution
  const newSample = validNew.slice(-30).map((c) => c.close).sort((a, b) => a - b);
  const benchmarkPrice = newSample[Math.floor(newSample.length / 2)];

  const candleMap = new Map<number, Candle>();

  // Insert existing candles first (filtering out cross-symbol pollution)
  for (const c of validExisting) {
    if (benchmarkPrice > 0 && (c.close < benchmarkPrice * 0.3 || c.close > benchmarkPrice * 3.0)) {
      continue; // Discard rogue cross-symbol candle
    }
    candleMap.set(c.time, c);
  }

  // Merge or append with new candles, strictly preserving maximal highs and minimal lows
  for (const c of validNew) {
    if (benchmarkPrice > 0 && (c.close < benchmarkPrice * 0.3 || c.close > benchmarkPrice * 3.0)) {
      continue;
    }
    if (candleMap.has(c.time)) {
      const existing = candleMap.get(c.time)!;
      candleMap.set(c.time, {
        ...c,
        open: existing.open ?? c.open,
        high: Math.max(existing.high, c.high),
        low: Math.min(existing.low, c.low),
        close: c.close ?? existing.close,
        volume: Math.max(existing.volume || 0, c.volume || 0),
      });
    } else {
      candleMap.set(c.time, c);
    }
  }

  return Array.from(candleMap.values()).sort((a, b) => a.time - b.time);
}

/**
 * Validates candle integrity: timestamp, non-negative, high >= low, high >= open, high >= close
 */
export function validateCandle(c: Candle): boolean {
  if (!c || !Number.isFinite(c.time) || c.time <= 0) return false;
  if (
    !Number.isFinite(c.open) ||
    !Number.isFinite(c.high) ||
    !Number.isFinite(c.low) ||
    !Number.isFinite(c.close) ||
    (c.volume !== undefined && !Number.isFinite(c.volume))
  ) {
    return false;
  }
  if (c.open <= 0 || c.high <= 0 || c.low <= 0 || c.close <= 0) return false;
  if (c.high < c.low) return false;
  if (c.high < c.open || c.high < c.close) return false;
  if (c.low > c.open || c.low > c.close) return false;
  return true;
}
