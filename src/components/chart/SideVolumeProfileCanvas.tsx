/**
 * JARVIS Left-Side Volume Profile Canvas Overlay
 * Pixel-perfect implementation matching professional order-flow platform (Image 2)
 * Features:
 * - Solid blue horizontal volume-at-price bars on the LEFT of the chart
 * - Value numbers at each price level (e.g. 188, 147, 198, 338, 420...)
 * - VAH boxed highlight badge
 * - Bottom summary pills: Sell Volume (red), Buy Volume (green), Total Volume (cyan)
 * - Event-driven dirty-flagged rendering for ultra-lightweight performance
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { FootprintEngine } from '../../services/footprint/FootprintEngine';
import { FootprintSettings } from '../../types/footprint';

interface SideVolumeProfileCanvasProps {
  chart: IChartApi | null;
  series: ISeriesApi<'Candlestick'> | null;
  footprintEngine: FootprintEngine;
  settings: FootprintSettings;
  width: number;
  height: number;
  side?: 'left' | 'right';
}

function formatVolumeShort(vol: number): string {
  if (vol >= 1000000) return `${(vol / 1000000).toFixed(0)}M`;
  if (vol >= 1000) return `${(vol / 1000).toFixed(0)}K`;
  return Math.round(vol).toString();
}

const SideVolumeProfileCanvasComponent: React.FC<SideVolumeProfileCanvasProps> = ({
  chart,
  series,
  footprintEngine,
  settings,
  width,
  height,
  side = 'left',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDirtyRef = useRef<boolean>(true);
  const animFrameRef = useRef<number | null>(null);
  const lastRenderTimeRef = useRef<number>(0);

  const profileWidth = Math.max(90, Math.min(180, settings.sideProfileWidth || 120));

  // Mark dirty on viewport change
  useEffect(() => {
    isDirtyRef.current = true;
  }, [settings, width, height]);

  // Subscribe to FootprintEngine live updates for event-driven redraws
  useEffect(() => {
    return footprintEngine.subscribe(() => {
      isDirtyRef.current = true;
    });
  }, [footprintEngine]);

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
    if (!canvas || !chart || !series || width <= 0 || height <= 0 || !settings.showSideProfile) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== profileWidth * dpr || canvas.height !== height * dpr) {
      canvas.width = profileWidth * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, profileWidth, height);

    const range = chart.timeScale().getVisibleRange();
    if (!range || (range.to as number) <= (range.from as number)) {
      ctx.restore();
      return;
    }

    const tFromSec = range.from as number;
    const tToSec = range.to as number;

    const vp = footprintEngine.getVolumeProfile(tFromSec, tToSec);
    if (!vp || vp.levels.length === 0 || vp.totalVolume <= 0) {
      ctx.restore();
      return;
    }

    // Semi-transparent dark background for profile area
    ctx.fillStyle = 'rgba(11, 15, 23, 0.75)';
    ctx.fillRect(0, 0, profileWidth, height);

    // Right dividing border (if on left)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(profileWidth, 0);
    ctx.lineTo(profileWidth, height);
    ctx.stroke();

    // Find max level volume for bar scaling
    let maxLvlVol = 0.001;
    for (const lvl of vp.levels) {
      if (lvl.totalVolume > maxLvlVol) maxLvlVol = lvl.totalVolume;
    }

    const bucketSize = footprintEngine.getBucketSize();
    const maxBarWidth = profileWidth - 42;

    // 1. Draw Blue Volume Profile Bars (Matching Image 2)
    for (const lvl of vp.levels) {
      const y = series.priceToCoordinate(lvl.price);
      if (y === null || y < -20 || y > height + 20) continue;

      const yNext = series.priceToCoordinate(lvl.price - bucketSize);
      let rowHeight = yNext !== null ? Math.abs(yNext - y) : 14;
      rowHeight = Math.max(4, Math.min(rowHeight, 32));
      const rowTop = y - rowHeight / 2;

      const barLen = Math.max(3, (lvl.totalVolume / maxLvlVol) * maxBarWidth);

      // Solid blue bar matching Image 2 (#2563eb / #1d4ed8)
      ctx.fillStyle = lvl.isValueArea ? '#2563eb' : '#1d4ed8';
      ctx.fillRect(0, rowTop, barLen, rowHeight - 1);

      // Text label aligned on the left matching Image 2
      const numStr = Math.round(lvl.totalVolume).toString();
      ctx.fillStyle = '#f8fafc';
      ctx.font = `600 9.5px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(numStr, 8, y);
    }

    // Find levels corresponding to VAH, VAL, and POC
    const vahLevel = vp.levels.find((l) => Math.abs(l.price - vp.vah) < bucketSize * 0.6);
    const valLevel = vp.levels.find((l) => Math.abs(l.price - vp.val) < bucketSize * 0.6);
    const vahVol = vahLevel ? Math.round(vahLevel.totalVolume) : Math.round(vp.pocVolume * 0.7);
    const valVol = valLevel ? Math.round(valLevel.totalVolume) : Math.round(vp.pocVolume * 0.7);

    // 2A. VAH Highlight Badge (Matching Image 2: "[ 320 | VAH ]")
    const vahY = series.priceToCoordinate(vp.vah);
    if (vahY !== null && vahY > 15 && vahY < height - 35) {
      const boxW = profileWidth - 10;
      const boxH = 20;

      ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
      ctx.fillRect(4, vahY - boxH / 2, boxW, boxH);
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
      ctx.lineWidth = 1;
      ctx.strokeRect(4, vahY - boxH / 2, boxW, boxH);

      ctx.fillStyle = '#ffffff';
      ctx.font = `700 9.5px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${vahVol}`, 8, vahY);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#ef4444';
      ctx.fillText('VAH', boxW - 2, vahY);
    }

    // 2B. POC Highlight Badge if within bounds
    const pocY = series.priceToCoordinate(vp.pocPrice);
    if (pocY !== null && pocY > 15 && pocY < height - 35 && Math.abs(pocY - (vahY ?? 0)) > 22) {
      const boxW = profileWidth - 10;
      const boxH = 20;

      ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
      ctx.fillRect(4, pocY - boxH / 2, boxW, boxH);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1;
      ctx.strokeRect(4, pocY - boxH / 2, boxW, boxH);

      ctx.fillStyle = '#ffffff';
      ctx.font = `700 9.5px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.round(vp.pocVolume)}`, 8, pocY);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#f59e0b';
      ctx.fillText('POC', boxW - 2, pocY);
    }

    // 2C. VAL Highlight Badge if within bounds
    const valY = series.priceToCoordinate(vp.val);
    if (valY !== null && valY > 15 && valY < height - 35 && Math.abs(valY - (pocY ?? 0)) > 22 && Math.abs(valY - (vahY ?? 0)) > 22) {
      const boxW = profileWidth - 10;
      const boxH = 20;

      ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
      ctx.fillRect(4, valY - boxH / 2, boxW, boxH);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
      ctx.lineWidth = 1;
      ctx.strokeRect(4, valY - boxH / 2, boxW, boxH);

      ctx.fillStyle = '#ffffff';
      ctx.font = `700 9.5px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${valVol}`, 8, valY);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('VAL', boxW - 2, valY);
    }

    // 3. Top & Bottom Red Reference Framing Lines (Matching Image 2)
    if (vp.levels.length > 0) {
      const topPrice = vp.levels[vp.levels.length - 1].price;
      const btmPrice = vp.levels[0].price;
      const topY = series.priceToCoordinate(topPrice);
      const btmY = series.priceToCoordinate(btmPrice);

      if (topY !== null) {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, topY);
        ctx.lineTo(width, topY);
        ctx.stroke();
      }

      if (btmY !== null) {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, btmY);
        ctx.lineTo(profileWidth, btmY);
        ctx.stroke();
      }
    }

    // 4. Bottom Summary Pill Badges (Matching Image 2: [30K red] [31K green] [61K cyan])
    const pillH = 16;
    const pillY = height - 24;
    const pillW = Math.floor((profileWidth - 12) / 3);

    // Pill 1: Total Sell Volume (Pink/Red)
    ctx.fillStyle = '#f6465d';
    ctx.fillRect(3, pillY, pillW, pillH);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 9px 'JetBrains Mono', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${formatVolumeShort(vp.totalSellVolume)}`, 3 + pillW / 2, pillY + pillH / 2);

    // Pill 2: Total Buy Volume (Teal/Green)
    ctx.fillStyle = '#0ecb81';
    ctx.fillRect(3 + pillW + 2, pillY, pillW, pillH);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${formatVolumeShort(vp.totalBuyVolume)}`, 3 + pillW + 2 + pillW / 2, pillY + pillH / 2);

    // Pill 3: Total Volume (Cyan)
    ctx.fillStyle = '#00b4d8';
    ctx.fillRect(3 + (pillW + 2) * 2, pillY, pillW, pillH);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${formatVolumeShort(vp.totalVolume)}`, 3 + (pillW + 2) * 2 + pillW / 2, pillY + pillH / 2);

    ctx.restore();
  }, [chart, series, footprintEngine, settings.showSideProfile, profileWidth, height, width]);

  // Event-driven loop
  useEffect(() => {
    if (!settings.showSideProfile) return;
    let active = true;

    const tick = () => {
      if (!active) return;
      const now = performance.now();
      if (isDirtyRef.current && now - lastRenderTimeRef.current >= 30) {
        lastRenderTimeRef.current = now;
        isDirtyRef.current = false;
        render();
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      active = false;
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [render, settings.showSideProfile]);

  if (!settings.showSideProfile) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: side === 'left' ? 0 : undefined,
        right: side === 'right' ? 0 : undefined,
        width: `${profileWidth}px`,
        height: `${height}px`,
        pointerEvents: 'none',
        zIndex: 8,
      }}
    />
  );
};

export const SideVolumeProfileCanvas = React.memo(SideVolumeProfileCanvasComponent);
