/**
 * Absorption Overlay Canvas Component
 * Renders pure yellow circular A & A+ absorption bubbles anchored to price & time.
 * JARVIS HEATMAP TERMINAL - ORDER FLOW ABSORPTION
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { AbsorptionEngine } from '../../services/absorption/AbsorptionEngine';
import { AbsorptionEvent, AbsorptionSettings } from '../../types/absorption';

interface AbsorptionOverlayProps {
  chart: IChartApi | null;
  series: ISeriesApi<'Candlestick'> | null;
  absorptionEngine: AbsorptionEngine;
  settings: AbsorptionSettings;
  width: number;
  height: number;
  timeframe?: string;
  onUpdateCoords?: (
    coords: Array<{ event: AbsorptionEvent; cx: number; cy: number; radius: number }>
  ) => void;
}

const TIMEFRAME_SECS: Record<string, number> = {
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

export const AbsorptionOverlay: React.FC<AbsorptionOverlayProps> = ({
  chart,
  series,
  absorptionEngine,
  settings,
  width,
  height,
  timeframe = '1m',
  onUpdateCoords,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isDirtyRef = useRef<boolean>(true);
  const visibleCoordsRef = useRef<
    Array<{ event: AbsorptionEvent; cx: number; cy: number; radius: number }>
  >([]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !chart || !series || width <= 0 || height <= 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!settings.enabled) {
      ctx.clearRect(0, 0, width, height);
      visibleCoordsRef.current = [];
      if (onUpdateCoords) onUpdateCoords([]);
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const timeScale = chart.timeScale();
    const visibleRange = timeScale.getVisibleRange();

    let tFromSec = 0;
    let tToSec = 0;

    if (visibleRange) {
      tFromSec = typeof visibleRange.from === 'number'
        ? visibleRange.from
        : (visibleRange.from as any).timestamp || 0;
      tToSec = typeof visibleRange.to === 'number'
        ? visibleRange.to
        : (visibleRange.to as any).timestamp || 0;
    }

    if (tFromSec === 0 || tToSec === 0 || tToSec <= tFromSec) {
      const now = Math.floor(Date.now() / 1000);
      tFromSec = now - 3600;
      tToSec = now + 300;
    }

    const priceToY = (p: number): number => {
      const coord = series.priceToCoordinate(p);
      if (coord !== null && Number.isFinite(coord)) return coord;
      return -9999;
    };

    // Query events in visible range with wide padding (covering full visible window)
    const fromMs = (tFromSec - 86400 * 2) * 1000;
    const toMs = (tToSec + 86400 * 2) * 1000;
    const visibleEvents = absorptionEngine.getVisibleEvents(fromMs, toMs);

    if (visibleEvents.length === 0) {
      ctx.restore();
      visibleCoordsRef.current = [];
      if (onUpdateCoords) onUpdateCoords([]);
      return;
    }

    // Determine min and max absorbed volume in visible set for proportional logarithmic scaling
    let minVol = Infinity;
    let maxVol = -Infinity;
    for (const ev of visibleEvents) {
      if (ev.totalAbsorbedVolume < minVol) minVol = ev.totalAbsorbedVolume;
      if (ev.totalAbsorbedVolume > maxVol) maxVol = ev.totalAbsorbedVolume;
    }
    if (!Number.isFinite(minVol) || minVol <= 0) minVol = 1;
    if (!Number.isFinite(maxVol) || maxVol <= minVol) maxVol = minVol * 10;

    const minR = settings.bubbleMinRadius || 14;
    const maxR = settings.bubbleMaxRadius || 38;
    const logMin = Math.log(minVol);
    const logMax = Math.log(maxVol);
    const logRange = logMax - logMin || 1;

    const coordsList: Array<{ event: AbsorptionEvent; cx: number; cy: number; radius: number }> = [];
    const tfSec = TIMEFRAME_SECS[timeframe] || 60;

    // Calculate coordinates and radii - strictly pinned on the candle where absorption happened
    for (const ev of visibleEvents) {
      const rawSec = ev.candleTime || Math.floor(ev.timestamp / 1000);
      const candleSec = Math.floor(rawSec / tfSec) * tfSec;

      // Coordinate from Lightweight Charts timeScale for the candle
      const coordX = timeScale.timeToCoordinate(candleSec as any);
      if (coordX === null || !Number.isFinite(coordX)) {
        // NEVER project bubbles into empty right whitespace or off-candle!
        continue;
      }

      const cx = coordX;
      const cy = priceToY(ev.price);

      // Skip invalid or off-screen events
      if (cy === -9999 || cx < -50 || cx > width + 50 || cy < -50 || cy > height + 50) continue;

      // Logarithmic volume scaling (grade and volume size are independent)
      const evLog = Math.log(Math.max(minVol, ev.totalAbsorbedVolume));
      const t = Math.max(0, Math.min(1, (evLog - logMin) / logRange));
      const radius = Math.round(minR + t * (maxR - minR));

      coordsList.push({ event: ev, cx, cy, radius });
    }

    // Render Absorption Bubbles (Semi-Transparent Yellow with Dark Center Text matching Image 2)
    for (const item of coordsList) {
      const { event: ev, cx, cy, radius } = item;
      const isAPlus = ev.grade === 'A+';

      ctx.save();

      // 1. Subtle Glow for A+ (Exceptional Absorption)
      if (isAPlus && settings.showGlowForAPlus) {
        ctx.beginPath();
        ctx.arc(cx, cy, radius + 5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(250, 204, 21, 0.20)';
        ctx.shadowColor = '#facc15';
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // 2. Yellow Gradient Sphere Fill with Clean Semi-Transparency (Matching Image 2)
      ctx.globalAlpha = 0.70; // Transparent yellow so candlesticks, wicks and footprint show through
      const grad = ctx.createRadialGradient(
        cx - radius * 0.25,
        cy - radius * 0.25,
        radius * 0.1,
        cx,
        cy,
        radius
      );
      grad.addColorStop(0, 'rgba(254, 240, 138, 0.95)'); // Lemon yellow highlight
      grad.addColorStop(0.55, 'rgba(250, 204, 21, 0.82)'); // Vivid golden yellow
      grad.addColorStop(1, 'rgba(234, 179, 8, 0.70)'); // Warm amber edge

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // 3. Border Outlines (Subtle clean rim)
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.80)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (isAPlus) {
        // A+ has a prominent dual golden border
        ctx.beginPath();
        ctx.arc(cx, cy, radius + 2.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.95)';
        ctx.lineWidth = 2.0;
        ctx.stroke();
      }

      ctx.globalAlpha = 1.0; // Restore full opacity for dark typography

      // 4. Center Typography: Bold dark letter "A" or "A+"
      const fontSize = Math.max(10, Math.min(16, Math.round(radius * 0.72)));
      ctx.font = `900 ${fontSize}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#0f172a'; // Bold dark slate / black text for maximum readability

      ctx.fillText(ev.grade, cx, cy + 0.5);

      ctx.restore();
    }

    ctx.restore();

    visibleCoordsRef.current = coordsList;
    if (onUpdateCoords) {
      onUpdateCoords(coordsList);
    }
  }, [chart, series, absorptionEngine, settings, width, height, timeframe, onUpdateCoords]);

  // Smooth RequestAnimationFrame animation render loop
  useEffect(() => {
    let active = true;

    const loop = () => {
      if (!active) return;
      if (isDirtyRef.current) {
        render();
        isDirtyRef.current = false;
      }
      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      active = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [render]);

  // Listen to absorption engine updates
  useEffect(() => {
    const unsub = absorptionEngine.subscribe(() => {
      isDirtyRef.current = true;
    });
    return unsub;
  }, [absorptionEngine]);

  // Listen to chart view changes (smooth sync on scroll/zoom/pan)
  useEffect(() => {
    if (!chart) return;
    const handleRange = () => {
      isDirtyRef.current = true;
      render();
    };
    chart.timeScale().subscribeVisibleTimeRangeChange(handleRange);
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleRange);
    return () => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(handleRange);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleRange);
    };
  }, [chart, render]);

  useEffect(() => {
    isDirtyRef.current = true;
    render();
  }, [settings, width, height, render]);

  if (!settings.enabled) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: `${width}px`,
        height: `${height}px`,
        pointerEvents: 'none',
        zIndex: 7, // On top of candlesticks (zIndex 2) and footprint (zIndex 4), aligned with bubbles
      }}
    />
  );
};
