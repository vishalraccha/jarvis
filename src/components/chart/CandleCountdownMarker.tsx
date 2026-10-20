/**
 * Candle Countdown Marker Component
 * Displays live countdown timer directly attached to the price marker on the right scale.
 * Dynamically matches market direction (green #00e676 when up, red #ff2d55 when down)
 * just like TradingView with 60 FPS RAF positioning and zero React re-render overhead.
 */

import React, { useEffect, useRef } from 'react';
import { IChartApi, ISeriesApi, CandlestickData } from 'lightweight-charts';
import { Clock } from 'lucide-react';
import { getCandleTimeRemaining } from '../../utils/candleCountdown';

interface CandleCountdownMarkerProps {
  chart: IChartApi;
  series: ISeriesApi<'Candlestick'>;
  timeframe: string;
  currentCandle?: CandlestickData | null;
  currentCandleRef?: React.MutableRefObject<CandlestickData | null>;
  width: number;
  height: number;
}

const GREEN_COLOR = '#00e676';
const GREEN_BG = 'rgba(4, 18, 12, 0.95)';
const GREEN_BORDER = 'rgba(0, 230, 118, 0.85)';
const GREEN_SHADOW = '0 2px 8px rgba(0, 0, 0, 0.85), 0 0 8px rgba(0, 230, 118, 0.3)';

const RED_COLOR = '#ff2d55';
const RED_BG = 'rgba(22, 6, 10, 0.95)';
const RED_BORDER = 'rgba(255, 45, 85, 0.85)';
const RED_SHADOW = '0 2px 8px rgba(0, 0, 0, 0.85), 0 0 8px rgba(255, 45, 85, 0.3)';

const CandleCountdownMarkerComponent: React.FC<CandleCountdownMarkerProps> = ({
  chart,
  series,
  timeframe,
  currentCandle,
  currentCandleRef,
  height,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textSpanRef = useRef<HTMLSpanElement>(null);
  const iconRef = useRef<SVGSVGElement>(null);

  const localCandleRef = useRef<CandlestickData | null>(currentCandle || null);
  if (currentCandle) {
    localCandleRef.current = currentCandle;
  }
  const activeCandleRef = currentCandleRef || localCandleRef;

  const lastFormattedRef = useRef<string>('');
  const lastIsUpRef = useRef<boolean | null>(null);
  const lastNearBottomRef = useRef<boolean | null>(null);
  const lastTopPosRef = useRef<number | null>(null);
  const lastBadgeWRef = useRef<number | null>(null);
  const lastDisplayRef = useRef<string>('none');
  const cachedScaleWRef = useRef<number>(65);
  const lastScaleWCheckRef = useRef<number>(0);
  const lastTimeCheckRef = useRef<number>(0);

  useEffect(() => {
    let animId: number | null = null;
    let isRunning = true;

    // Initial scale width measurement
    try {
      cachedScaleWRef.current = chart.priceScale('right')?.width() || 65;
    } catch {
      cachedScaleWRef.current = 65;
    }

    const updateFrame = () => {
      if (!isRunning) return;

      const container = containerRef.current;
      const textSpan = textSpanRef.current;
      const icon = iconRef.current;
      const cur = activeCandleRef.current;

      if (!container || !textSpan || !cur || cur.close === undefined || cur.close === null) {
        if (container && lastDisplayRef.current !== 'none') {
          container.style.display = 'none';
          lastDisplayRef.current = 'none';
        }
        animId = requestAnimationFrame(updateFrame);
        return;
      }

      try {
        const y = series.priceToCoordinate(cur.close);
        if (y === null || y < 0 || y > height) {
          if (lastDisplayRef.current !== 'none') {
            container.style.display = 'none';
            lastDisplayRef.current = 'none';
          }
          animId = requestAnimationFrame(updateFrame);
          return;
        }

        const now = Date.now();

        // Sample scale width at most once every 3 seconds without forced reflow in every frame
        if (now - lastScaleWCheckRef.current > 3000) {
          lastScaleWCheckRef.current = now;
          try {
            const w = chart.priceScale('right')?.width();
            if (w && w > 20) cachedScaleWRef.current = w;
          } catch {}
        }

        // Market direction: Green if bullish/flat (close >= open), Red if bearish (close < open)
        const isUp = cur.close >= (cur.open ?? cur.close);
        const isNearBottom = y + 28 > height;

        // Position directly attached to the price marker
        const topPos = isNearBottom ? Math.round(y - 25) : Math.round(y + 9);
        const badgeW = Math.max(52, cachedScaleWRef.current - 4);

        if (lastDisplayRef.current !== 'flex') {
          container.style.display = 'flex';
          container.style.right = '2px';
          lastDisplayRef.current = 'flex';
        }

        if (lastTopPosRef.current !== topPos) {
          lastTopPosRef.current = topPos;
          container.style.top = `${topPos}px`;
        }

        if (lastBadgeWRef.current !== badgeW) {
          lastBadgeWRef.current = badgeW;
          container.style.width = `${badgeW}px`;
        }

        // Apply dynamic color theme matching marker only on state change
        if (lastIsUpRef.current !== isUp || lastNearBottomRef.current !== isNearBottom) {
          lastIsUpRef.current = isUp;
          lastNearBottomRef.current = isNearBottom;

          const color = isUp ? GREEN_COLOR : RED_COLOR;
          const bg = isUp ? GREEN_BG : RED_BG;
          const border = isUp ? GREEN_BORDER : RED_BORDER;
          const shadow = isUp ? GREEN_SHADOW : RED_SHADOW;

          container.style.color = color;
          container.style.background = bg;
          container.style.borderColor = border;
          container.style.boxShadow = shadow;
          container.style.borderRadius = isNearBottom ? '3px 3px 0 0' : '0 0 3px 3px';

          if (icon) {
            icon.style.color = color;
          }
        }

        // Compute candle countdown at most twice a second (500ms throttle)
        if (now - lastTimeCheckRef.current >= 500) {
          lastTimeCheckRef.current = now;
          const candleTimeSec = typeof cur.time === 'number' ? cur.time : undefined;
          const res = getCandleTimeRemaining(candleTimeSec, timeframe);
          if (res.formatted !== lastFormattedRef.current) {
            lastFormattedRef.current = res.formatted;
            textSpan.textContent = res.formatted;
            container.title = `Time remaining in ${timeframe} candle: ${res.formatted}`;
          }
        }
      } catch {
        if (container && lastDisplayRef.current !== 'none') {
          container.style.display = 'none';
          lastDisplayRef.current = 'none';
        }
      }

      animId = requestAnimationFrame(updateFrame);
    };

    animId = requestAnimationFrame(updateFrame);

    return () => {
      isRunning = false;
      if (animId !== null) {
        cancelAnimationFrame(animId);
      }
    };
  }, [chart, series, timeframe, height, activeCandleRef]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 0,
        right: 2,
        height: 16,
        display: 'none',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        border: `1px solid ${GREEN_BORDER}`,
        borderRadius: '0 0 3px 3px',
        color: GREEN_COLOR,
        background: GREEN_BG,
        boxShadow: GREEN_SHADOW,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: 0.5,
        pointerEvents: 'none',
        zIndex: 25,
        userSelect: 'none',
        transition: 'color 120ms ease, border-color 120ms ease, background 120ms ease, box-shadow 120ms ease',
      }}
    >
      <Clock ref={iconRef} size={9} style={{ opacity: 0.9, flexShrink: 0, color: GREEN_COLOR }} />
      <span ref={textSpanRef}>00:00</span>
    </div>
  );
};

export const CandleCountdownMarker = React.memo(CandleCountdownMarkerComponent);

