/**
 * Candle Time Remaining & Countdown Utilities
 * Computes exact remaining duration for active bar across all supported timeframes.
 */

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

export interface CandleCountdownResult {
  remainingSec: number;
  formatted: string;
}

/**
 * Calculates remaining seconds and formatted string (mm:ss or hh:mm:ss)
 * for the current candle to close.
 */
export function getCandleTimeRemaining(
  candleTimeSec: number | null | undefined,
  timeframe: string,
  currentTimestampMs: number = Date.now()
): CandleCountdownResult {
  const tfSec = TIMEFRAME_SECONDS[timeframe] || 60;
  const nowSec = Math.floor(currentTimestampMs / 1000);

  let remaining = 0;

  if (candleTimeSec && typeof candleTimeSec === 'number' && candleTimeSec > 0) {
    const candleEnd = candleTimeSec + tfSec;
    const diff = candleEnd - nowSec;

    // Verify diff is reasonable within [-2, tfSec + 5]
    if (diff >= 0 && diff <= tfSec + 5) {
      remaining = diff;
    } else {
      // Periodic modulo fallback synchronized to timeframe
      remaining = tfSec - (nowSec % tfSec);
    }
  } else {
    // Synchronize to clock boundary if candle time is unavailable
    remaining = tfSec - (nowSec % tfSec);
  }

  remaining = Math.max(0, Math.floor(remaining));

  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;

  let formatted = '';
  if (hours > 0) {
    formatted = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  } else {
    formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return { remainingSec: remaining, formatted };
}
