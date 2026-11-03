/**
 * J.A.R.V.I.S 2.0 - On-Chart GEX Profile Ladder Canvas (MenthorQ Inspired)
 * Renders price-aligned horizontal Net GEX exposure bars directly on the chart:
 *   - Strike prices aligned 1:1 with Lightweight Charts price coordinates
 *   - Negative GEX (Crimson/Red) bars extending to the left with dollar values
 *   - Positive GEX (Emerald/Green) bars extending to the right with dollar values
 *   - High Volatility Level (HVL) and Gamma Flip / Wall badges
 *   - Put/Call Open Interest split indicators
 *   - Current spot price highlighted active row
 *   - Interactive expiration filter tabs and show/hide toggle
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { GexMetrics, GexSettings, GexStrikeLevel } from '../../types/gex';
import { Candle } from '../../types/market';
import { X, Sliders } from 'lucide-react';

interface GexProfileCanvasProps {
  chart: IChartApi | null;
  series: ISeriesApi<'Candlestick'> | null;
  metrics: GexMetrics | null;
  settings: GexSettings;
  width: number;
  height: number;
  candles?: Candle[];
  isCobActive?: boolean;
  cobWidth?: number;
  onClose?: () => void;
  onOpenSettings?: () => void;
}

function formatGexValue(val: number): string {
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '+';
  if (abs >= 1e9) {
    return `${sign}${(abs / 1e9).toFixed(2)}B`;
  }
  if (abs >= 1e6) {
    return `${sign}${(abs / 1e6).toFixed(2)}M`;
  }
  if (abs >= 1e3) {
    return `${sign}${(abs / 1e3).toFixed(1)}K`;
  }
  return `${sign}${abs.toFixed(0)}`;
}

const GexProfileCanvasComponent: React.FC<GexProfileCanvasProps> = ({
  chart,
  series,
  metrics,
  settings,
  width,
  height,
  candles,
  isCobActive = false,
  cobWidth = 210,
  onClose,
  onOpenSettings,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isDirtyRef = useRef<boolean>(true);
  const [selectedExpTab, setSelectedExpTab] = useState<string>('ALL');
  const [hoveredStrike, setHoveredStrike] = useState<GexStrikeLevel | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  const isMobile = width < 640;
  const maxAllowedWidth = isMobile ? Math.min(180, Math.floor(width * 0.45)) : 320;
  const minAllowedWidth = isMobile ? 120 : 200;
  const baseWidth = isMobile ? Math.min(settings.profileWidthPx || 260, maxAllowedWidth) : (settings.profileWidthPx || 260);
  const profileWidth = Math.max(minAllowedWidth, Math.min(maxAllowedWidth, baseWidth));

  // Determine horizontal offset: adjacent to price axis (65px) or next to COB if visible
  const rightOffset = 65 + (isCobActive ? cobWidth : 0);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !chart || !series || width <= 0 || height <= 0 || !settings.enabled) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
    if (canvas.width !== profileWidth * dpr || canvas.height !== height * dpr) {
      canvas.width = profileWidth * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, profileWidth, height);

    // 1. Obsidian Glass Background
    const bgGrad = ctx.createLinearGradient(0, 0, profileWidth, 0);
    bgGrad.addColorStop(0, 'rgba(8, 12, 22, 0.94)');
    bgGrad.addColorStop(1, 'rgba(10, 15, 28, 0.97)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, profileWidth, height);

    // Left Border separator
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, height);
    ctx.stroke();

    if (!metrics || !metrics.strikes || metrics.strikes.length === 0) {
      // Empty state
      ctx.fillStyle = '#64748b';
      ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Loading GEX Profile...', profileWidth / 2, height / 2);
      ctx.restore();
      return;
    }

    // 2. Determine Current Spot Price
    const lastCandle = candles && candles.length > 0 ? candles[candles.length - 1] : null;
    const currentSpot = lastCandle ? lastCandle.close : (metrics.spotPrice || metrics.gammaFlip?.price || metrics.callWall?.strike || 0);
    const currentSpotY = series.priceToCoordinate(currentSpot);

    // 3. Filter Strikes
    const strikes = metrics.strikes;
    const maxAbsGex = Math.max(1, ...strikes.map((s) => Math.max(Math.abs(s.netGex), Math.abs(s.callGex), Math.abs(s.putGex))));

    // Column Partition
    const strikeColWidth = 65;
    const oiColWidth = 28;
    const barAreaWidth = profileWidth - strikeColWidth - oiColWidth - 10;
    const zeroX = strikeColWidth + barAreaWidth * 0.55;

    // 4. Render Grid Centerline (Zero Gamma Line)
    const headerHeight = 70;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(zeroX, headerHeight);
    ctx.lineTo(zeroX, height);
    ctx.stroke();
    ctx.setLineDash([]);

    // 5. Draw Strike Rows (Aligned 1:1 with Candlestick Price Coordinates)
    for (const lvl of strikes) {
      const y = series.priceToCoordinate(lvl.strike);
      if (y === null || !Number.isFinite(y)) continue;
      if (y < headerHeight - 10 || y > height + 10) continue;

      const isAtm = Math.abs(lvl.strike - currentSpot) <= (strikes[1]?.strike - strikes[0]?.strike || 50) * 0.5;
      const rowHeight = 16;
      const rowY = Math.round(y - rowHeight / 2);

      // Active / ATM Row Highlight
      if (isAtm) {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
        ctx.fillRect(0, rowY - 1, profileWidth, rowHeight + 2);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, rowY - 1, profileWidth, rowHeight + 2);
      }

      // Strike Price Label
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = '600 10px "JetBrains Mono", monospace';
      ctx.fillStyle = isAtm ? '#38bdf8' : lvl.isGammaFlip ? '#facc15' : '#94a3b8';
      ctx.fillText(lvl.strike.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }), 6, y);

      // Badge (HVL / Call Wall / Put Wall)
      if (lvl.isGammaFlip || lvl.isCallWall || lvl.isPutWall) {
        const badgeText = lvl.isGammaFlip ? 'HVL' : lvl.isCallWall ? 'CW' : 'PW';
        const badgeBg = lvl.isGammaFlip
          ? 'rgba(0, 180, 216, 0.28)'
          : lvl.isCallWall
          ? 'rgba(6, 182, 212, 0.28)'
          : 'rgba(236, 72, 153, 0.28)';
        const badgeColor = lvl.isGammaFlip ? '#38bdf8' : lvl.isCallWall ? '#22d3ee' : '#f472b6';

        ctx.fillStyle = badgeBg;
        ctx.beginPath();
        ctx.roundRect(42, y - 5, 20, 10, 3);
        ctx.fill();

        ctx.fillStyle = badgeColor;
        ctx.font = '700 7.5px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(badgeText, 52, y);
      }

      // Net GEX Horizontal Bar
      const netGex = lvl.netGex;
      const barH = 9;
      const maxHalfWidth = (barAreaWidth * 0.5) - 4;

      if (netGex < 0) {
        // Red / Crimson Negative Gamma (extends left from zeroX)
        const barLen = Math.max(3, (Math.abs(netGex) / maxAbsGex) * maxHalfWidth);
        const barStartX = zeroX - barLen;

        const redGrad = ctx.createLinearGradient(barStartX, 0, zeroX, 0);
        redGrad.addColorStop(0, 'rgba(239, 68, 68, 0.95)');
        redGrad.addColorStop(1, 'rgba(185, 28, 28, 0.55)');

        ctx.fillStyle = redGrad;
        ctx.beginPath();
        ctx.roundRect(barStartX, y - barH / 2, barLen, barH, [3, 0, 0, 3]);
        ctx.fill();

        // Numeric Label
        ctx.textAlign = 'right';
        ctx.fillStyle = '#fecaca';
        ctx.font = '600 8.5px "JetBrains Mono", monospace';
        ctx.fillText(formatGexValue(netGex), barStartX - 3, y);
      } else if (netGex > 0) {
        // Green / Emerald Positive Gamma (extends right from zeroX)
        const barLen = Math.max(3, (netGex / maxAbsGex) * maxHalfWidth);

        const greenGrad = ctx.createLinearGradient(zeroX, 0, zeroX + barLen, 0);
        greenGrad.addColorStop(0, 'rgba(16, 185, 129, 0.55)');
        greenGrad.addColorStop(1, 'rgba(16, 185, 129, 0.95)');

        ctx.fillStyle = greenGrad;
        ctx.beginPath();
        ctx.roundRect(zeroX, y - barH / 2, barLen, barH, [0, 3, 3, 0]);
        ctx.fill();

        // Numeric Label
        ctx.textAlign = 'left';
        ctx.fillStyle = '#a7f3d0';
        ctx.font = '600 8.5px "JetBrains Mono", monospace';
        ctx.fillText(formatGexValue(netGex), zeroX + barLen + 3, y);
      }

      // Put / Call OI Split Indicator Column on Right
      const totalOi = (lvl.callOpenInterest || 0) + (lvl.putOpenInterest || 0);
      if (totalOi > 0) {
        const oiX = profileWidth - oiColWidth - 4;
        const putRatio = (lvl.putOpenInterest || 0) / totalOi;
        const callRatio = (lvl.callOpenInterest || 0) / totalOi;

        // Put segment (Red)
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(oiX, y - 4, Math.round(oiColWidth * putRatio * 0.8), 8);

        // Call segment (Green)
        ctx.fillStyle = '#10b981';
        ctx.fillRect(oiX + Math.round(oiColWidth * putRatio * 0.8) + 1, y - 4, Math.round(oiColWidth * callRatio * 0.8), 8);
      }
    }

    // 6. Draw Horizontal Spot Price Line across ladder
    if (currentSpotY !== null && currentSpotY >= headerHeight && currentSpotY <= height) {
      ctx.strokeStyle = '#00f2fe';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, currentSpotY);
      ctx.lineTo(profileWidth, currentSpotY);
      ctx.stroke();

      // Current Spot Price Tag
      ctx.fillStyle = '#00f2fe';
      ctx.beginPath();
      ctx.roundRect(profileWidth - 48, currentSpotY - 7, 44, 14, 3);
      ctx.fill();

      ctx.fillStyle = '#090d16';
      ctx.font = '800 8.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(currentSpot.toFixed(currentSpot >= 1000 ? 1 : 2), profileWidth - 26, currentSpotY);
    }

    // 7. Column Legends Header in Canvas (below HTML tabs)
    ctx.fillStyle = 'rgba(8, 12, 22, 0.98)';
    ctx.fillRect(0, 0, profileWidth, headerHeight);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, headerHeight);
    ctx.lineTo(profileWidth, headerHeight);
    ctx.stroke();

    // Column Legends
    ctx.fillStyle = '#64748b';
    ctx.font = '600 8.5px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText('Strike', 6, headerHeight - 7);
    ctx.textAlign = 'center';
    ctx.fillText('Net GEX', zeroX, headerHeight - 7);
    ctx.textAlign = 'right';
    ctx.fillText('P / C OI', profileWidth - 6, headerHeight - 7);

    ctx.restore();
  }, [chart, series, metrics, settings, width, height, profileWidth, candles]);

  // Request redraw on animation frame
  const requestRedraw = useCallback(() => {
    if (animFrameRef.current) return;
    animFrameRef.current = window.requestAnimationFrame(() => {
      animFrameRef.current = null;
      render();
    });
  }, [render]);

  useEffect(() => {
    isDirtyRef.current = true;
    requestRedraw();
  }, [metrics, settings, width, height, requestRedraw]);

  // Subscribe to chart logical & time range changes (zooming, panning, dragging)
  useEffect(() => {
    if (!chart) return;
    const timeScale = chart.timeScale();
    const handleRangeChange = () => {
      requestRedraw();
    };
    timeScale.subscribeVisibleLogicalRangeChange(handleRangeChange);
    timeScale.subscribeVisibleTimeRangeChange(handleRangeChange);

    return () => {
      timeScale.unsubscribeVisibleLogicalRangeChange(handleRangeChange);
      timeScale.unsubscribeVisibleTimeRangeChange(handleRangeChange);
      if (animFrameRef.current) {
        window.cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [chart, requestRedraw]);

  // Handle Mouse Hover Inspection
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!series || !metrics || !metrics.strikes) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;

    if (y < 70) {
      setHoveredStrike(null);
      setHoverPos(null);
      return;
    }

    const price = series.coordinateToPrice(y);
    if (!price) return;

    // Find closest strike
    let closest: GexStrikeLevel | null = null;
    let minDiff = Infinity;
    for (const lvl of metrics.strikes) {
      const diff = Math.abs(lvl.strike - price);
      if (diff < minDiff) {
        minDiff = diff;
        closest = lvl;
      }
    }

    if (closest && minDiff < (metrics.strikes[1]?.strike - metrics.strikes[0]?.strike || 50) * 0.8) {
      setHoveredStrike(closest);
      setHoverPos({ x: e.clientX, y: e.clientY });
    } else {
      setHoveredStrike(null);
      setHoverPos(null);
    }
  };

  const handleMouseLeave = () => {
    setHoveredStrike(null);
    setHoverPos(null);
  };

  if (!settings.enabled || !metrics || !metrics.strikes || metrics.strikes.length === 0) return null;

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        position: 'absolute',
        top: 0,
        right: `${rightOffset}px`,
        width: `${profileWidth}px`,
        height: `${height}px`,
        zIndex: 11,
        pointerEvents: 'auto',
        userSelect: 'none',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: `${profileWidth}px`,
          height: `${height}px`,
          display: 'block',
        }}
      />

      {/* Floating Hover Tooltip */}
      {hoveredStrike && hoverPos && (
        <div
          style={{
            position: 'fixed',
            left: `${hoverPos.x - 170}px`,
            top: `${hoverPos.y - 45}px`,
            zIndex: 99999,
            background: 'rgba(9, 13, 24, 0.96)',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 10.5,
            fontFamily: '"JetBrains Mono", monospace',
            color: '#f8fafc',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.85)',
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontWeight: 800, color: '#38bdf8', marginBottom: 2 }}>
            Strike: ${hoveredStrike.strike.toLocaleString()}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ color: '#94a3b8' }}>Net GEX:</span>
            <span style={{ fontWeight: 700, color: hoveredStrike.netGex >= 0 ? '#4ade80' : '#fb7185' }}>
              {formatGexValue(hoveredStrike.netGex)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ color: '#94a3b8' }}>Call / Put:</span>
            <span style={{ color: '#cbd5e1' }}>
              +{formatGexValue(hoveredStrike.callGex)} / {formatGexValue(hoveredStrike.putGex)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ color: '#94a3b8' }}>Total OI:</span>
            <span style={{ color: '#facc15' }}>
              {((hoveredStrike.callOpenInterest || 0) + (hoveredStrike.putOpenInterest || 0)).toLocaleString()}
            </span>
          </div>
        </div>
      )}

      {/* MenthorQ-Style Top Header Bar (Title, Regime Badge, Expirations & Controls) */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: 52,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '5px 6px 3px 6px',
          boxSizing: 'border-box',
          background: 'rgba(8, 12, 22, 0.98)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          zIndex: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, color: '#f1f5f9', letterSpacing: '0.02em' }}>Net GEX</span>
            {metrics && (
              <span
                style={{
                  fontSize: 8,
                  fontWeight: 800,
                  padding: '1px 4px',
                  borderRadius: 2,
                  background:
                    metrics.gammaRegime === 'positive_gamma'
                      ? 'rgba(34, 197, 94, 0.2)'
                      : metrics.gammaRegime === 'negative_gamma'
                      ? 'rgba(239, 68, 68, 0.2)'
                      : 'rgba(234, 179, 8, 0.2)',
                  color:
                    metrics.gammaRegime === 'positive_gamma'
                      ? '#4ade80'
                      : metrics.gammaRegime === 'negative_gamma'
                      ? '#fb7185'
                      : '#facc15',
                }}
              >
                {metrics.gammaRegime === 'positive_gamma' ? '+Γ Vol Dampened' : metrics.gammaRegime === 'negative_gamma' ? '-Γ Vol Amplified' : 'FLIP ZONE'}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                title="GEX Analytics & Settings Matrix"
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: 'none',
                  borderRadius: 3,
                  color: '#94a3b8',
                  padding: '2px 4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Sliders size={11} />
              </button>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                title="Hide GEX Profile Ladder"
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: 'none',
                  borderRadius: 3,
                  color: '#94a3b8',
                  padding: '2px 4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={11} />
              </button>
            )}
          </div>
        </div>

        {/* Expirations Bar (MenthorQ Style) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            overflowX: 'auto',
            scrollbarWidth: 'none',
          }}
        >
          <button
            type="button"
            onClick={() => { setSelectedExpTab('ALL'); isDirtyRef.current = true; requestRedraw(); }}
            style={{
              padding: '1px 5px',
              borderRadius: 3,
              border: selectedExpTab === 'ALL' ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
              background: selectedExpTab === 'ALL' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.03)',
              color: selectedExpTab === 'ALL' ? '#38bdf8' : '#94a3b8',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontSize: 8,
              fontWeight: 700,
            }}
          >
            ALL {metrics ? formatGexValue(metrics.totalNetGex) : ''}
          </button>
          {metrics?.expirations?.slice(0, 5).map((exp) => {
            const isSel = selectedExpTab === exp.expiration;
            return (
              <button
                key={exp.expiration}
                type="button"
                onClick={() => { setSelectedExpTab(exp.expiration); isDirtyRef.current = true; requestRedraw(); }}
                style={{
                  padding: '1px 4px',
                  borderRadius: 3,
                  border: isSel ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                  background: isSel ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                  color: isSel ? '#38bdf8' : exp.netGex >= 0 ? '#4ade80' : '#fb7185',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  fontSize: 7.5,
                  fontWeight: 600,
                }}
              >
                {exp.expiration.replace('202', '')} {exp.percentageOfTotal}% {formatGexValue(exp.netGex)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const GexProfileCanvas = React.memo(GexProfileCanvasComponent);
