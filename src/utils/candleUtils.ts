/**
 * Candle Utilities: Merging, Deduplication, and Validation
 * JARVIS HEATMAP TERMINAL - SECTIONS 5 & 6
 */

import { Candle } from '../types/market';

/**
 * Merges two candle arrays, deduplicating by timestamp and ensuring strictly ascending order.
 * Fresh candles overwrite existing candles at the same timestamp.
 */
export function mergeAndDeduplicateCandles(
  existingCandles: Candle[],
  newCandles: Candle[]
): Candle[] {
  if (existingCandles.length === 0) return [...newCandles].sort((a, b) => a.time - b.time);
  if (newCandles.length === 0) return [...existingCandles].sort((a, b) => a.time - b.time);

  // Use newCandles median price as benchmark reference to purge cross-symbol pollution
  const newSample = newCandles.slice(-30).map((c) => c.close).sort((a, b) => a - b);
  const benchmarkPrice = newSample[Math.floor(newSample.length / 2)];

  const candleMap = new Map<number, Candle>();

  // Insert existing candles first (filtering out cross-symbol pollution)
  for (const c of existingCandles) {
    if (c.time > 0 && c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0) {
      if (benchmarkPrice > 0 && (c.close < benchmarkPrice * 0.3 || c.close > benchmarkPrice * 3.0)) {
        continue; // Discard rogue cross-symbol candle
      }
      candleMap.set(c.time, c);
    }
  }

  // Overwrite or append with new candles
  for (const c of newCandles) {
    if (c.time > 0 && c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0) {
      if (benchmarkPrice > 0 && (c.close < benchmarkPrice * 0.3 || c.close > benchmarkPrice * 3.0)) {
        continue;
      }
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
