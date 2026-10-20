/**
 * JARVIS Bottom Volume & Delta Histogram Panel
 * Aligned 1:1 with chart horizontal time scale
 * Renders volume bars, buy vs sell split, candle delta bars, and Cumulative Volume Delta (CVD)
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { IChartApi } from 'lightweight-charts';
import { FootprintEngine } from '../../services/footprint/FootprintEngine';
import { FootprintSettings } from '../../types/footprint';
import { ChevronDown, ChevronUp, X, Activity } from 'lucide-react';

interface BottomVolumeDeltaPanelProps {
  chart: IChartApi | null;
  footprintEngine: FootprintEngine;
  settings: FootprintSettings;
  onUpdateSettings: (settings: Partial<FootprintSettings>) => void;
  width: number;
}

const BottomVolumeDeltaPanelComponent: React.FC<BottomVolumeDeltaPanelProps> = ({
  chart,
  footprintEngine,
  settings,
  onUpdateSettings,
  width,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDirtyRef = useRef<boolean>(true);
  const lastRenderTimeRef = useRef<number>(0);
  const [isMinimized, setIsMinimized] = useState<boolean>(settings.bottomPanelMinimized || false);
  const panelHeight = isMinimized ? 28 : (settings.bottomPanelHeight || 120);

  // Mark dirty on prop changes
  useEffect(() => {
    isDirtyRef.current = true;
  }, [settings, isMinimized, panelHeight, width]);

  // Subscribe to FootprintEngine trade/candle events
  useEffect(() => {
    return footprintEngine.subscribe(() => {
      isDirtyRef.current = true;
    });
  }, [footprintEngine]);

  // Subscribe to viewport pan/zoom
  useEffect(() => {
    if (!chart) return;
    const markDirty = () => {
      isDirtyRef.current = true;
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(markDirty);
    chart.timeScale().subscribeVisibleTimeRangeChange(markDirty);
    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(markDirty);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(markDirty);
    };
  }, [chart]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !chart || width <= 0 || !settings.showBottomPanel || isMinimized) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const drawHeight = panelHeight - 28; // minus header
    if (canvas.width !== width * dpr || canvas.height !== drawHeight * dpr) {
      canvas.width = width * dpr;
      canvas.height = drawHeight * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, drawHeight);

    const range = chart.timeScale().getVisibleRange();
    if (!range || (range.to as number) <= (range.from as number)) {
      ctx.restore();
      return;
    }

    const tFromSec = range.from as number;
    const tToSec = range.to as number;
    const visibleCandles = footprintEngine.getVisibleCandles(tFromSec, tToSec);
    if (visibleCandles.length === 0) {
      ctx.restore();
      return;
    }

    const timeScale = chart.timeScale();

    // Compute session-wide Cumulative Volume Delta (CVD) map
    const allCandles = footprintEngine.getAllCandles();
    let accumulatedCvd = 0;
    const candleCvdMap = new Map<number, number>();
    for (const c of allCandles) {
      accumulatedCvd += c.delta;
      candleCvdMap.set(c.candleStart, accumulatedCvd);
    }

    // Determine bar spacing with precision from visible candles
    let barSpacing = 24;
    if (visibleCandles.length >= 2) {
      const diffs: number[] = [];
      for (let i = 0; i < visibleCandles.length - 1; i++) {
        const xA = timeScale.timeToCoordinate(visibleCandles[i].candleStart as any);
        const xB = timeScale.timeToCoordinate(visibleCandles[i + 1].candleStart as any);
        if (xA !== null && xB !== null) {
          const d = Math.abs(xB - xA);
          if (d > 4 && Number.isFinite(d)) diffs.push(d);
        }
      }
      if (diffs.length > 0) {
        diffs.sort((a, b) => a - b);
        barSpacing = diffs[Math.floor(diffs.length / 2)];
      }
    }
    const barWidth = Math.max(2, Math.min(barSpacing * 0.88, barSpacing - 4));

    // Find max total volume and max delta for scaling
    let maxVol = 0.001;
    let maxDeltaAbs = 0.001;
    for (const c of visibleCandles) {
      if (c.totalVolume > maxVol) maxVol = c.totalVolume;
      const absD = Math.abs(c.delta);
      if (absD > maxDeltaAbs) maxDeltaAbs = absD;
    }

    // Zero line in middle of lower half
    const halfH = drawHeight / 2;
    const zeroY = drawHeight * 0.75;
    const deltaMaxH = drawHeight * 0.22;
    const volMaxH = drawHeight * 0.45;

    // Background horizontal divider & zero line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, halfH);
    ctx.lineTo(width, halfH);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.beginPath();
    ctx.moveTo(0, zeroY);
    ctx.lineTo(width, zeroY);
    ctx.stroke();

    // Labels
    ctx.fillStyle = '#64748b';
    ctx.font = `600 9px 'JetBrains Mono', monospace`;
    ctx.textAlign = 'left';
    ctx.fillText('VOLUME (BUY/SELL)', 8, 12);
    ctx.fillText('CANDLE DELTA', 8, halfH + 12);

    // Compute CVD path points from true session accumulation
    const cvdPoints: Array<{ x: number; cvd: number }> = [];

    // Render bars for each candle
    for (const candle of visibleCandles) {
      const cx = timeScale.timeToCoordinate(candle.candleStart as any);
      if (cx === null || cx < -barWidth || cx > width + barWidth) continue;

      const currentCvd = candleCvdMap.get(candle.candleStart) ?? 0;
      cvdPoints.push({ x: cx, cvd: currentCvd });

      if (candle.totalVolume <= 0) continue;

      // 1. Top Section: Buy vs Sell Volume stacked bar
      const volH = Math.min(volMaxH, (candle.totalVolume / maxVol) * volMaxH);
      const buyH = candle.totalVolume > 0 ? (candle.buyVolume / candle.totalVolume) * volH : 0;
      const sellH = volH - buyH;

      const bx = cx - barWidth / 2;
      const baseVolY = halfH - 2;

      // Sell volume (red bottom)
      ctx.fillStyle = 'rgba(239, 68, 68, 0.75)';
      ctx.fillRect(bx, baseVolY - sellH, barWidth, sellH);

      // Buy volume (green top)
      ctx.fillStyle = 'rgba(16, 185, 129, 0.75)';
      ctx.fillRect(bx, baseVolY - sellH - buyH, barWidth, buyH);

      // 2. Bottom Section: Candle Delta Histogram
      const isPositive = candle.delta >= 0;
      const deltaH = Math.min(deltaMaxH, (Math.abs(candle.delta) / maxDeltaAbs) * deltaMaxH);

      if (isPositive) {
        ctx.fillStyle = '#00e676';
        ctx.fillRect(bx, zeroY - deltaH, barWidth, Math.max(1, deltaH));
      } else {
        ctx.fillStyle = '#ff2d55';
        ctx.fillRect(bx, zeroY, barWidth, Math.max(1, deltaH));
      }
    }

    // 3. Render CVD Trend Line overlay
    if (cvdPoints.length >= 2) {
      let minCvd = Infinity;
      let maxCvd = -Infinity;
      for (const p of cvdPoints) {
        if (p.cvd < minCvd) minCvd = p.cvd;
        if (p.cvd > maxCvd) maxCvd = p.cvd;
      }
      const cvdRange = Math.max(0.001, maxCvd - minCvd);

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < cvdPoints.length; i++) {
        const pt = cvdPoints[i];
        const py = drawHeight * 0.95 - ((pt.cvd - minCvd) / cvdRange) * (drawHeight * 0.4);
        if (i === 0) ctx.moveTo(pt.x, py);
        else ctx.lineTo(pt.x, py);
      }
      ctx.stroke();

      const latestCvd = cvdPoints[cvdPoints.length - 1].cvd;
      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'right';
      ctx.fillText(`CVD: ${latestCvd >= 0 ? '+' : ''}${latestCvd.toFixed(1)}`, width - 12, halfH + 12);
    }

    ctx.restore();
  }, [chart, footprintEngine, settings.showBottomPanel, isMinimized, panelHeight, width]);

  useEffect(() => {
    if (!settings.showBottomPanel || isMinimized) return;
    let animId: number;
    let active = true;

    const tick = () => {
      if (!active) return;
      const now = performance.now();
      if (isDirtyRef.current && now - lastRenderTimeRef.current >= 30) {
        lastRenderTimeRef.current = now;
        isDirtyRef.current = false;
        render();
      }
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => {
      active = false;
      cancelAnimationFrame(animId);
    };
  }, [render, settings.showBottomPanel, isMinimized]);

  if (!settings.showBottomPanel) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: `${width}px`,
        height: `${panelHeight}px`,
        background: 'rgba(9, 13, 22, 0.95)',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        zIndex: 15,
        display: 'flex',
        flexDirection: 'column',
        backdropFilter: 'blur(8px)',
        userSelect: 'none',
      }}
    >
      {/* Header Bar */}
      <div
        style={{
          height: '28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 10px',
          background: 'rgba(15, 23, 42, 0.7)',
          borderBottom: isMinimized ? 'none' : '1px solid rgba(255, 255, 255, 0.05)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity size={13} color="#00b4d8" />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#f8fafc', letterSpacing: '0.02em' }}>
            ORDER FLOW DELTA & VOLUME
          </span>
          <span
            style={{
              fontSize: 10,
              padding: '1px 6px',
              borderRadius: 3,
              background: 'rgba(0, 180, 216, 0.15)',
              color: '#38bdf8',
              fontWeight: 600,
            }}
          >
            REAL TRADES
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* Height adjustment presets */}
          {!isMinimized && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginRight: 8 }}>
              {[90, 130, 180].map((h) => (
                <button
                  key={h}
                  onClick={() => onUpdateSettings({ bottomPanelHeight: h })}
                  style={{
                    height: 18,
                    padding: '0 5px',
                    fontSize: 9,
                    fontWeight: 600,
                    borderRadius: 2,
                    background: settings.bottomPanelHeight === h ? 'rgba(0, 180, 216, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                    color: settings.bottomPanelHeight === h ? '#38bdf8' : '#94a3b8',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {h}px
                </button>
              ))}
            </div>
          )}

          {/* Minimize / Expand */}
          <button
            onClick={() => {
              const next = !isMinimized;
              setIsMinimized(next);
              onUpdateSettings({ bottomPanelMinimized: next });
            }}
            title={isMinimized ? 'Expand Panel' : 'Minimize Panel'}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: 2,
            }}
          >
            {isMinimized ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {/* Close Panel */}
          <button
            onClick={() => onUpdateSettings({ showBottomPanel: false })}
            title="Close Bottom Panel"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: 2,
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Main Histogram Canvas */}
      {!isMinimized && (
        <canvas
          ref={canvasRef}
          style={{
            flex: 1,
            width: `${width}px`,
            height: `${panelHeight - 28}px`,
          }}
        />
      )}
    </div>
  );
};

export const BottomVolumeDeltaPanel = React.memo(BottomVolumeDeltaPanelComponent);
