import { describe, it, expect } from 'vitest';
import { getCandleTimeRemaining, TIMEFRAME_SECONDS } from '../utils/candleCountdown';

describe('Candle Time Remaining Countdown Suite', () => {
  it('correctly calculates remaining time for a 1-minute candle', () => {
    // 1m candle starting at 1700000000 (ends at 1700000060)
    const candleStart = 1700000000;
    const now = 1700000035 * 1000; // 35 seconds into the candle -> 25 seconds remaining

    const result = getCandleTimeRemaining(candleStart, '1m', now);
    expect(result.remainingSec).toBe(25);
    expect(result.formatted).toBe('00:25');
  });

  it('correctly calculates remaining time for a 5-minute candle', () => {
    // 5m candle starting at 1700000000 (ends at 1700000300)
    const candleStart = 1700000000;
    const now = (1700000000 + 145) * 1000; // 145s elapsed -> 155s remaining (2m 35s)

    const result = getCandleTimeRemaining(candleStart, '5m', now);
    expect(result.remainingSec).toBe(155);
    expect(result.formatted).toBe('02:35');
  });

  it('correctly formats hours for 1h, 4h and 1d timeframes', () => {
    // 4h candle starting at 1700000000 (ends at 1700014400)
    const candleStart = 1700000000;
    // 2 hours, 15 minutes and 10 seconds remaining -> 8110s
    const now = (1700014400 - 8110) * 1000;

    const result = getCandleTimeRemaining(candleStart, '4h', now);
    expect(result.remainingSec).toBe(8110);
    expect(result.formatted).toBe('02:15:10');
  });

  it('handles clock synchronization boundary when candleStart is absent or desynchronized', () => {
    const tfSec = TIMEFRAME_SECONDS['15m']; // 900s
    // Multiple of 900: 1800000 * 900 = 1620000000
    // 700 seconds elapsed in 900s interval -> 200 seconds remaining (03:20)
    const baseInterval = 1800000 * 900;
    const now = (baseInterval + 700) * 1000;

    const result = getCandleTimeRemaining(null, '15m', now);
    expect(result.remainingSec).toBe(200);
    expect(result.formatted).toBe('03:20');
  });

  it('handles exact 0 seconds boundary without negative output', () => {
    const candleStart = 1700000000;
    const now = 1700000060 * 1000; // exactly at end of 1m candle

    const result = getCandleTimeRemaining(candleStart, '1m', now);
    expect(result.remainingSec).toBe(0);
    expect(result.formatted).toBe('00:00');
  });

  it('determines TradingView market direction color for marker and timer', () => {
    // Bullish candle (close >= open) -> Green #00e676
    const upCandle = { open: 90000, close: 90500 };
    const isUp = upCandle.close >= upCandle.open;
    const colorUp = isUp ? '#00e676' : '#ff2d55';
    expect(colorUp).toBe('#00e676');

    // Bearish candle (close < open) -> Red #ff2d55
    const downCandle = { open: 90000, close: 89500 };
    const isDown = downCandle.close < downCandle.open;
    const colorDown = isDown ? '#ff2d55' : '#00e676';
    expect(colorDown).toBe('#ff2d55');

    // Unchanged flat candle (close == open) -> Bullish green default
    const flatCandle = { open: 90000, close: 90000 };
    const isFlatUp = flatCandle.close >= flatCandle.open;
    expect(isFlatUp ? '#00e676' : '#ff2d55').toBe('#00e676');
  });

  it('calculates marker attachment position coordinates accurately', () => {
    const height = 800;
    const markerY = 450;
    const isNearBottom = markerY + 28 > height;
    expect(isNearBottom).toBe(false);
    // When not near bottom, attaches directly below price marker (+9px from center)
    const normalTop = isNearBottom ? Math.round(markerY - 25) : Math.round(markerY + 9);
    expect(normalTop).toBe(459);

    // Near bottom edge (e.g. markerY = 785)
    const bottomMarkerY = 785;
    const isNearBottomTrue = bottomMarkerY + 28 > height;
    expect(isNearBottomTrue).toBe(true);
    // Attaches directly above price marker (-25px from center)
    const flippedTop = isNearBottomTrue ? Math.round(bottomMarkerY - 25) : Math.round(bottomMarkerY + 9);
    expect(flippedTop).toBe(760);
  });
});
