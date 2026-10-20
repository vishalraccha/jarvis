/**
 * Bookmap-Style Dual-Column Current Order Book (COB) Canvas
 * Exactly matches Bookmap's signature right-side ladder:
 * - Column 1: ORDERS (Price + Resting Limit Order Qty + Horizontal Bid/Ask Bar)
 * - Column 2: CUMULATIVE (Cumulative Order Book Depth Qty + Horizontal Fill Bar)
 * Aligned 1:1 with the chart price axis and heatmap.
 * JARVIS HEATMAP TERMINAL - BOOKMAP COB ENGINE
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { OrderBookManager } from '../../services/orderbook/OrderBookManager';
import { HeatmapEngine } from '../../services/heatmap/HeatmapEngine';
import { TradeBubbleManager } from '../../services/bubbles/TradeBubbleManager';
import { DepthProfileSettings } from '../../types/heatmap';
import { Candle } from '../../types/market';

function formatOrderQty(qty: number): string {
  if (isNaN(qty) || qty <= 0) return '0';
  if (qty >= 1_000_000) {
    return (qty / 1_000_000).toFixed(1) + 'M';
  }
  if (qty >= 1000) {
    return (qty / 1000).toFixed(1) + 'K';
  }
  if (qty >= 1) {
    return `${Math.round(qty)}`;
  }
  return qty.toFixed(2);
}

interface DepthProfileCanvasProps {
  chart: IChartApi | null;
  series: ISeriesApi<'Candlestick'> | null;
  orderBook: OrderBookManager;
  heatmapEngine?: HeatmapEngine;
  bubbleManager?: TradeBubbleManager;
  settings: DepthProfileSettings;
  width: number;
  height: number;
  candles?: Candle[];
}

export const DepthProfileCanvas: React.FC<DepthProfileCanvasProps> = ({
  chart,
  series,
  orderBook,
  heatmapEngine,
  settings,
  width,
  height,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isDirtyRef = useRef<boolean>(true);

  const profileWidth = Math.max(160, Math.min(320, settings.widthPx || 210));

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !chart || !series || width <= 0 || height <= 0 || !settings.enabled) return;

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

    // 1. Panel Background (Bookmap Dark Obsidian glass)
    ctx.fillStyle = `rgba(12, 18, 28, ${Math.min(0.96, (settings.opacity || 0.90) + 0.05)})`;
    ctx.fillRect(0, 0, profileWidth, height);

    // Left dividing border separating chart and COB
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, height);
    ctx.stroke();

    // 2. Price-to-Coordinate Mapping (Aligned 1:1 with Candlesticks)
    const stats = orderBook.getStats();
    const bestBid = stats.bestBid || orderBook.getBestBid();
    const bestAsk = stats.bestAsk || orderBook.getBestAsk();
    const currentMid = bestBid > 0 && bestAsk > 0
      ? (bestBid + bestAsk) / 2
      : stats.midPrice || 2400;

    const pTopSample = series.coordinateToPrice(0);
    const pBottomSample = series.coordinateToPrice(height);

    let priceToY: (p: number) => number;
    let yToPrice: (y: number) => number;

    if (pTopSample !== null && pBottomSample !== null && Math.abs(pBottomSample - pTopSample) > 0.001) {
      const pDiff = pBottomSample - pTopSample;
      priceToY = (p: number) => {
        const coord = series.priceToCoordinate(p);
        if (coord !== null) return coord;
        return ((p - pTopSample) / pDiff) * height;
      };
      yToPrice = (y: number) => {
        const price = series.coordinateToPrice(y);
        if (price !== null) return price;
        return pTopSample + (y / height) * pDiff;
      };
    } else {
      let yMid = series.priceToCoordinate(currentMid);
      let yOffset = series.priceToCoordinate(currentMid + 100);
      let pxPerDollar = -0.5;
      if (yMid !== null && yOffset !== null && Math.abs(yOffset - yMid) > 0.001) {
        pxPerDollar = (yOffset - yMid) / 100;
      } else {
        yMid = (height / 2) as any;
        pxPerDollar = -(height * 0.4) / Math.max(1, currentMid * 0.05);
      }
      priceToY = (p: number) => {
        const coord = series.priceToCoordinate(p);
        if (coord !== null) return coord;
        return yMid! + (p - currentMid) * pxPerDollar;
      };
      yToPrice = (y: number) => {
        const price = series.coordinateToPrice(y);
        if (price !== null) return price;
        return currentMid + (y - yMid!) / pxPerDollar;
      };
    }

    const headerH = 26;
    const pTop = yToPrice(headerH);
    const pBottom = yToPrice(height);
    const rawMin = Math.min(pTop, pBottom);
    const rawMax = Math.max(pTop, pBottom);
    // Clamp to realistic range around currentMid (+/- 30%) to prevent negative numbers or massive row explosions
    const safeMid = currentMid > 0 ? currentMid : 4150.0;
    const pMin = Math.max(safeMid * 0.7, Math.max(1, rawMin));
    const pMax = Math.min(safeMid * 1.3, rawMax);
    const pDiff = Math.max(0.001, pMax - pMin);
    const pxPerDollar = Math.abs(height / pDiff);

    // 3. Dual Column Layout: ORDERS (resting limit depth) | CUMULATIVE (cumulative book depth)
    const col1W = Math.round(profileWidth * 0.53);
    const col2W = profileWidth - col1W;

    // Header Bar
    ctx.fillStyle = 'rgba(28, 36, 50, 0.96)';
    ctx.fillRect(0, 0, profileWidth, headerH);

    // Header Left: ORDERS (Resting Limit Orders at price)
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 10px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ORDERS', col1W / 2, headerH / 2);

    // Header Right: CUMULATIVE (Cumulative Order Book depth)
    ctx.fillText('CUMULATIVE', col1W + col2W / 2, headerH / 2);

    // Vertical dividing line between Column 1 and Column 2
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(col1W, 0);
    ctx.lineTo(col1W, height);
    ctx.stroke();

    // Horizontal line below header
    ctx.beginPath();
    ctx.moveTo(0, headerH);
    ctx.lineTo(profileWidth, headerH);
    ctx.stroke();

    const bookStats = orderBook.getStats();
    if (bookStats.bidLevelsCount === 0 && bookStats.askLevelsCount === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Order Book Unavailable', profileWidth / 2, height / 2 - 10);
      ctx.fillStyle = '#475569';
      ctx.font = '10px Inter, sans-serif';
      ctx.fillText('OTC Spot quote feed only', profileWidth / 2, height / 2 + 8);
      ctx.restore();
      return;
    }

    // 4. Calculate Optimal Discretization Step for Smooth Row Height (~16px)
    const idealStep = 16 / pxPerDollar;
    let rowStep = 0.5;
    let decimalPlaces = 1;

    if (currentMid >= 20000) {
      const btcSteps = [5, 10, 25, 50, 100, 250, 500, 1000];
      rowStep = btcSteps.find((s) => s >= idealStep) || 250;
      decimalPlaces = 0;
    } else if (currentMid >= 1000) {
      const ethSteps = [0.25, 0.5, 1.0, 2.0, 2.5, 5.0, 10.0, 25.0];
      rowStep = ethSteps.find((s) => s >= idealStep) || 2.0;
      decimalPlaces = rowStep < 1 ? 2 : rowStep < 5 ? 1 : 0;
    } else if (currentMid >= 50) {
      const solSteps = [0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0];
      rowStep = solSteps.find((s) => s >= idealStep) || 0.5;
      decimalPlaces = rowStep < 0.1 ? 2 : 1;
    } else {
      const pennySteps = [0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.25, 0.5];
      rowStep = pennySteps.find((s) => s >= idealStep) || 0.01;
      decimalPlaces = rowStep < 0.01 ? 4 : 2;
    }

    interface CobRow {
      price: number;
      y: number;
      isAsk: boolean;
      levelQty: number;
      cumQty: number;
    }

    const rowMap = new Map<number, CobRow>();
    const startPrice = Math.floor(pMin / rowStep) * rowStep;
    const endPrice = Math.ceil(pMax / rowStep) * rowStep;

    for (let p = startPrice; p <= endPrice; p += rowStep) {
      if (p <= 10) continue;
      const price = Number(p.toFixed(4));
      const y = priceToY(price);
      if (y >= headerH - 8 && y <= height + 8) {
        rowMap.set(price, {
          price,
          y,
          isAsk: price >= currentMid,
          levelQty: 0,
          cumQty: 0,
        });
      }
    }

    // 5. Query Order Book Level Quantities
    if (pMin > 0 && pMax > pMin) {
      const bookRange = orderBook.getLevelsInRange(pMin - rowStep, pMax + rowStep);

      for (const a of bookRange.asks) {
        if (a.quantity <= 0) continue;
        const bucketPrice = Number((Math.round(a.price / rowStep) * rowStep).toFixed(4));
        const row = rowMap.get(bucketPrice);
        if (row) {
          row.levelQty += a.quantity;
        }
      }

      for (const b of bookRange.bids) {
        if (b.quantity <= 0) continue;
        const bucketPrice = Number((Math.round(b.price / rowStep) * rowStep).toFixed(4));
        const row = rowMap.get(bucketPrice);
        if (row) {
          row.levelQty += b.quantity;
        }
      }
    }

    // Augment with Heatmap Engine resting levels (BSL, SSL, Round Numbers) if available
    if (heatmapEngine) {
      const resting = heatmapEngine.getActiveRestingLevels();
      for (const lvl of resting) {
        if (lvl.price >= pMin && lvl.price <= pMax && lvl.qty > 0) {
          const bucketPrice = Number((Math.round(lvl.price / rowStep) * rowStep).toFixed(4));
          const row = rowMap.get(bucketPrice);
          if (row) {
            row.levelQty = Math.max(row.levelQty, lvl.qty);
          }
        }
      }
    }

    const allRows = Array.from(rowMap.values());
    const askRows = allRows.filter((r) => r.isAsk).sort((a, b) => a.price - b.price); // ascending from mid
    const bidRows = allRows.filter((r) => !r.isAsk).sort((a, b) => b.price - a.price); // descending from mid

    // 6. Calculate Cumulative Order Book (Summing outward from Mid Price)
    let runningAskCum = 0;
    for (const r of askRows) {
      runningAskCum += r.levelQty;
      r.cumQty = runningAskCum;
    }

    let runningBidCum = 0;
    for (const r of bidRows) {
      runningBidCum += r.levelQty;
      r.cumQty = runningBidCum;
    }

    let maxLevelQty = 0.001;
    let maxCumQty = 0.001;
    for (const r of allRows) {
      if (r.levelQty > maxLevelQty) maxLevelQty = r.levelQty;
      if (r.cumQty > maxCumQty) maxCumQty = r.cumQty;
    }

    // 6.5 Render Dual Column Header & Live Imbalance Meter
    const totalBidVis = runningBidCum || 1;
    const totalAskVis = runningAskCum || 1;
    const bidPct = Math.round((totalBidVis / (totalBidVis + totalAskVis)) * 100);
    const askPct = 100 - bidPct;

    // Header Background
    ctx.fillStyle = 'rgba(22, 30, 44, 0.98)';
    ctx.fillRect(0, 0, profileWidth, headerH);

    // Header Left: ORDERS + % Bids
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 9px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`ORDERS (${bidPct}%B)`, col1W / 2, headerH / 2 - 2);

    // Header Right: CUMULATIVE + % Asks
    ctx.fillText(`CUMULATIVE (${askPct}%A)`, col1W + col2W / 2, headerH / 2 - 2);

    // Live Imbalance Meter Bar directly under header
    ctx.fillStyle = '#00e676';
    ctx.fillRect(0, headerH - 3, profileWidth * (bidPct / 100), 3);
    ctx.fillStyle = '#ff2d55';
    ctx.fillRect(profileWidth * (bidPct / 100), headerH - 3, profileWidth * (askPct / 100), 3);

    // 7. Render Rows with Live Hit Flashes and Institutional Wall Highlighting
    const rowH = Math.max(12, Math.min(22, rowStep * pxPerDollar - 1));
    const lastHit = orderBook.getLastTradeHit();
    const now = Date.now();

    for (const row of allRows) {
      const yCenter = row.y;
      if (yCenter < headerH + 6 || yCenter > height - 6) continue;
      const rowTop = yCenter - rowH / 2;

      // Detect recent market order hit at this price level
      const isHit = lastHit && (now - lastHit.timestamp < 650) && Math.abs(row.price - lastHit.price) <= rowStep * 0.55;
      if (isHit) {
        const fade = Math.max(0, 1 - (now - lastHit.timestamp) / 650);
        ctx.save();
        ctx.fillStyle = lastHit.side === 'buy'
          ? `rgba(255, 235, 59, ${0.45 * fade})`  // Neon Gold/Yellow flash for buyer hit on asks
          : `rgba(0, 229, 255, ${0.45 * fade})`; // Neon Cyan flash for seller hit on bids
        ctx.fillRect(0, rowTop, profileWidth, rowH);
        ctx.restore();
      }

      // Subtle row border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.beginPath();
      ctx.moveTo(0, rowTop + rowH);
      ctx.lineTo(profileWidth, rowTop + rowH);
      ctx.stroke();

      // Detect Institutional Liquidity Walls (Major Order Walls where traders take trades)
      const isInstitutionalWall = row.levelQty >= maxLevelQty * 0.40 && row.levelQty >= 5;

      // ==========================================
      // COLUMN 1: DIRECT ORDER BOOK (Price + Level Qty + Bar)
      // ==========================================
      // Price text (Left aligned)
      ctx.fillStyle = isHit ? '#ffff00' : isInstitutionalWall ? '#ffd700' : '#94a3b8';
      ctx.font = isInstitutionalWall ? 'bold 10px JetBrains Mono, monospace' : '10px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(row.price.toFixed(decimalPlaces), 4, yCenter);

      if (row.levelQty > 0) {
        // Horizontal Level Bar (Filled from right of Column 1 towards center)
        const maxLevelBarW = col1W - 56;
        const levelBarW = Math.max(2, Math.min(maxLevelBarW, (row.levelQty / maxLevelQty) * maxLevelBarW));
        const barX = col1W - levelBarW - 2;

        ctx.save();
        ctx.fillStyle = row.isAsk
          ? (isInstitutionalWall ? 'rgba(255, 45, 85, 0.95)' : 'rgba(235, 45, 75, 0.85)')   // Crimson Red for Asks
          : (isInstitutionalWall ? 'rgba(0, 230, 118, 0.95)' : 'rgba(0, 210, 106, 0.85)'); // Vibrant Emerald Green for Bids
        ctx.fillRect(barX, rowTop + 1, levelBarW, rowH - 2);

        // Level Bar Outline & Institutional Wall Marker
        if (isInstitutionalWall) {
          ctx.strokeStyle = '#ffd700'; // Golden Wall Border for Major Institutional Orders
          ctx.lineWidth = 1.2;
          ctx.strokeRect(barX, rowTop + 1, levelBarW, rowH - 2);
          // Gold bullet badge at price to indicate key trade zone
          ctx.fillStyle = '#ffd700';
          ctx.fillRect(1, rowTop + 2, 2, rowH - 4);
        } else {
          ctx.strokeStyle = row.isAsk ? 'rgba(255, 90, 115, 0.5)' : 'rgba(105, 240, 174, 0.5)';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(barX, rowTop + 1, levelBarW, rowH - 2);
        }

        // Level Quantity Text (Bold white, right-aligned in Column 1 - integer numbers)
        ctx.fillStyle = isHit ? '#ffff00' : isInstitutionalWall ? '#ffffff' : '#f1f5f9';
        ctx.font = isInstitutionalWall ? 'bold 10px JetBrains Mono, monospace' : 'bold 9.5px JetBrains Mono, monospace';
        ctx.textAlign = 'right';
        const levelQtyStr = formatOrderQty(row.levelQty);
        ctx.fillText(levelQtyStr, col1W - 4, yCenter);
        ctx.restore();
      }

      // ==========================================
      // COLUMN 2: CUMULATIVE ORDER BOOK (Cumulative Depth + Bar)
      // ==========================================
      if (row.cumQty > 0) {
        // Cumulative Depth Fill Bar (Solid fill starting at col1W extending right)
        const maxCumBarW = col2W - 8;
        const cumBarW = Math.max(3, Math.min(maxCumBarW, (row.cumQty / maxCumQty) * maxCumBarW));
        const cumBarX = col1W + 1;

        ctx.save();
        ctx.fillStyle = row.isAsk
          ? 'rgba(235, 45, 75, 0.85)'   // Solid Red Fill for Cumulative Asks
          : 'rgba(0, 210, 106, 0.85)'; // Solid Green Fill for Cumulative Bids
        ctx.fillRect(cumBarX, rowTop + 1, cumBarW, rowH - 2);

        // Cumulative Quantity Text (Right aligned in Column 2 - integer numbers / clean K/M)
        ctx.fillStyle = '#f8fafc';
        ctx.font = '9px JetBrains Mono, monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        const cumQtyStr = formatOrderQty(row.cumQty);
        ctx.fillText(cumQtyStr, profileWidth - 4, yCenter);
        ctx.restore();
      }
    }

    // 8. Inside Spread / Current Mid Price Indicator
    const midY = priceToY(currentMid);
    if (midY >= headerH && midY <= height - 5) {
      ctx.save();
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.moveTo(2, midY);
      ctx.lineTo(profileWidth - 2, midY);
      ctx.stroke();

      // Spread badge
      if (stats.spread > 0) {
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(col1W - 32, midY - 7, 64, 14);
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.5)';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(col1W - 32, midY - 7, 64, 14);

        ctx.fillStyle = '#00f0ff';
        ctx.font = 'bold 8.5px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`SPR $${stats.spread.toFixed(2)}`, col1W, midY);
      }
      ctx.restore();
    }

    ctx.restore();
  }, [chart, series, orderBook, heatmapEngine, settings, profileWidth, height, width]);

  // Animation frame loop
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

  // High-frequency 60ms ticker ensures hit flashes fade smoothly and real-time DOM updates automatically
  useEffect(() => {
    const timer = setInterval(() => {
      isDirtyRef.current = true;
    }, 60);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsub = orderBook.subscribe(() => {
      isDirtyRef.current = true;
    });
    return unsub;
  }, [orderBook]);

  useEffect(() => {
    if (!heatmapEngine) return;
    const unsub = heatmapEngine.subscribe(() => {
      isDirtyRef.current = true;
    });
    return unsub;
  }, [heatmapEngine]);

  useEffect(() => {
    if (!chart) return;
    const handleRange = () => {
      isDirtyRef.current = true;
    };
    chart.timeScale().subscribeVisibleTimeRangeChange(handleRange);
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleRange);
    return () => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(handleRange);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleRange);
    };
  }, [chart]);

  useEffect(() => {
    isDirtyRef.current = true;
  }, [settings, width, height]);

  if (!settings.enabled) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 65, // Immediately adjacent to TradingView price axis (65px fixed)
        width: `${profileWidth}px`,
        height: `${height}px`,
        zIndex: 10,
        cursor: 'default',
        pointerEvents: 'none',
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
    </div>
  );
};
