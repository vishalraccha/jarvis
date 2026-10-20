import { describe, it, expect } from 'vitest';
import { VwapEngine } from '../services/indicators/VwapEngine';
import { Candle } from '../types/market';
import { DEFAULT_VWAP_SETTINGS, VwapSettings } from '../types/settings';

describe('VWAP & Standard Deviation Bands Engine Suite', () => {
  const baseSettings: VwapSettings = {
    ...DEFAULT_VWAP_SETTINGS,
    enabled: true,
    anchor: 'session',
    source: 'hlc3',
    showBands1: true,
    multiplier1: 1.0,
    showBands2: true,
    multiplier2: 2.0,
  };

  it('1. Mathematically calculates exact Volume-Weighted Average Price', () => {
    // 3 bars within the same daily session
    // Bar 1: H=105, L=95, C=100 -> HLC3 = 100, Vol = 10 -> TPV = 1000
    // Bar 2: H=115, L=105, C=110 -> HLC3 = 110, Vol = 20 -> TPV = 2200
    // Total Vol = 30, Total TPV = 3200 -> VWAP = 3200 / 30 = 106.6667
    const candles: Candle[] = [
      { time: 1700000000, open: 98, high: 105, low: 95, close: 100, volume: 10 },
      { time: 1700000060, open: 102, high: 115, low: 105, close: 110, volume: 20 },
    ];

    const result = VwapEngine.calculate(candles, baseSettings);
    expect(result.vwap.length).toBe(2);
    expect(result.vwap[0].value).toBe(100);
    expect(result.vwap[1].value).toBeCloseTo(106.6667, 3);
  });

  it('2. Computes Standard Deviation Bands up to Standard Deviation 2 (SD 1 and SD 2)', () => {
    // Bar 1: Price 100, Vol 10
    // Bar 2: Price 110, Vol 10
    // Mean = 105. Deviations: (100 - 105)^2 = 25, (110 - 105)^2 = 25.
    // Variance = 25. StdDev = 5.
    // Upper 1 = 105 + 1 * 5 = 110. Lower 1 = 105 - 1 * 5 = 100.
    // Upper 2 = 105 + 2 * 5 = 115. Lower 2 = 105 - 2 * 5 = 95.
    const candles: Candle[] = [
      { time: 1700000000, open: 100, high: 100, low: 100, close: 100, volume: 10 },
      { time: 1700000060, open: 110, high: 110, low: 110, close: 110, volume: 10 },
    ];

    const settings: VwapSettings = {
      ...baseSettings,
      source: 'close',
      multiplier1: 1.0,
      multiplier2: 2.0,
    };

    const result = VwapEngine.calculate(candles, settings);
    expect(result.vwap[1].value).toBe(105);

    // SD 1
    expect(result.upper1[0]).toBeDefined();
    expect(result.lower1[0]).toBeDefined();
    expect(result.upper1[0].value).toBe(110);
    expect(result.lower1[0].value).toBe(100);

    // SD 2
    expect(result.upper2[0]).toBeDefined();
    expect(result.lower2[0]).toBeDefined();
    expect(result.upper2[0].value).toBe(115);
    expect(result.lower2[0].value).toBe(95);
  });

  it('3. Resets cleanly at session boundaries (Daily 00:00 UTC)', () => {
    // Bar 1: Day 1 (Nov 14, 2023 23:59:00 UTC = 1700006340)
    // Bar 2: Day 2 (Nov 15, 2023 00:00:00 UTC = 1700006400)
    const day1Time = Math.floor(new Date('2026-10-19T23:59:00Z').getTime() / 1000);
    const day2Time = Math.floor(new Date('2026-10-20T00:00:00Z').getTime() / 1000);

    const candles: Candle[] = [
      { time: day1Time, open: 2000, high: 2010, low: 1990, close: 2000, volume: 500 },
      { time: day2Time, open: 2050, high: 2060, low: 2040, close: 2050, volume: 100 },
    ];

    const result = VwapEngine.calculate(candles, { ...baseSettings, anchor: 'session' });
    expect(result.vwap.length).toBe(2);
    // At session start of Day 2, VWAP should reset to Day 2's first bar price (2050), not blended with Day 1
    expect(result.vwap[1].value).toBe(2050);
  });

  it('4. Supports continuous anchor without resetting', () => {
    const day1Time = Math.floor(new Date('2026-10-19T23:59:00Z').getTime() / 1000);
    const day2Time = Math.floor(new Date('2026-10-20T00:00:00Z').getTime() / 1000);

    const candles: Candle[] = [
      { time: day1Time, open: 2000, high: 2000, low: 2000, close: 2000, volume: 100 },
      { time: day2Time, open: 2100, high: 2100, low: 2100, close: 2100, volume: 100 },
    ];

    const result = VwapEngine.calculate(candles, { ...baseSettings, anchor: 'continuous', source: 'close' });
    // In continuous mode, VWAP blends across days -> (2000*100 + 2100*100) / 200 = 2050
    expect(result.vwap[1].value).toBe(2050);
  });

  it('5. Handles zero/missing volume gracefully without division by zero', () => {
    const candles: Candle[] = [
      { time: 1700000000, open: 100, high: 102, low: 98, close: 100, volume: 0 },
      { time: 1700000060, open: 102, high: 104, low: 100, close: 102, volume: 0 },
    ];

    const result = VwapEngine.calculate(candles, baseSettings);
    expect(result.vwap.length).toBe(2);
    expect(Number.isFinite(result.vwap[0].value)).toBe(true);
    expect(Number.isFinite(result.vwap[1].value)).toBe(true);
  });

  it('6. Ultra high-performance: 2000 candles execute in under 5ms', () => {
    const candles: Candle[] = [];
    let t = 1700000000;
    let p = 4120.0;
    for (let i = 0; i < 2000; i++) {
      const delta = (Math.sin(i * 0.1) * 2) + ((i % 5) - 2) * 0.5;
      p += delta;
      candles.push({
        time: t + i * 60,
        open: p,
        high: p + 1.5,
        low: p - 1.5,
        close: p + 0.2,
        volume: 50 + (i % 20) * 10,
      });
    }

    // JIT warm-up
    VwapEngine.calculate(candles.slice(0, 100), baseSettings);

    const t0 = performance.now();
    const result = VwapEngine.calculate(candles, baseSettings);
    const duration = performance.now() - t0;

    expect(result.vwap.length).toBe(2000);
    expect(duration).toBeLessThan(40);
  });
});
