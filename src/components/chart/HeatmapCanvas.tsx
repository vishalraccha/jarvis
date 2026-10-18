/**
 * High-Performance Bookmap-Style Heatmap Canvas Layer
 * Rendered at zIndex: 1 in the background.
 * Implements genuine dynamic order book depth raster across time,
 * discrete resting limit orders at the live edge, and step bid/ask lines.
 * JARVIS HEATMAP TERMINAL - BOOKMAP DEPTH ENGINE
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { HeatmapEngine } from '../../services/heatmap/HeatmapEngine';
import { OrderBookManager } from '../../services/orderbook/OrderBookManager';
import { TradeBubbleManager } from '../../services/bubbles/TradeBubbleManager';
import { LiquidityShiftDetector } from '../../services/heatmap/LiquidityShiftDetector';
import { ColorMapEngine } from '../../services/heatmap/ColorMap';
import { BubbleSettings, HeatmapSettings, LiquidityZone, TradeBubble } from '../../types/heatmap';

interface HeatmapCanvasProps {
  chart: IChartApi | null;
  series: ISeriesApi<'Candlestick'> | null;
  orderBook: OrderBookManager;
  heatmapEngine: HeatmapEngine;
  bubbleManager?: TradeBubbleManager;
  shiftDetector?: LiquidityShiftDetector;
  colorMapEngine: ColorMapEngine;
  heatmapSettings: HeatmapSettings;
  bubbleSettings?: BubbleSettings;
  showHeatmap: boolean;
  showBubbles?: boolean;
  showBestBidAsk: boolean;
  showShifts?: boolean;
  showDepthProfile?: boolean;
  depthProfileWidth?: number;
  showCandles?: boolean;
  onHoverBubble?: (bubble: TradeBubble | null, screenX: number, screenY: number) => void;
  onHoverZone?: (zone: LiquidityZone | null, screenX: number, screenY: number) => void;
  onUpdateBubbleCoords?: (coords: Array<{ bubble: TradeBubble; cx: number; cy: number; radius: number }>) => void;
  width: number;
  height: number;
}

export const HeatmapCanvas: React.FC<HeatmapCanvasProps> = ({
  chart,
  series,
  orderBook,
  heatmapEngine,
  colorMapEngine,
  heatmapSettings,
  showHeatmap,
  showBestBidAsk,
  showDepthProfile,
  depthProfileWidth,
  showCandles = true,
  width,
  height,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isDirtyRef = useRef<boolean>(true);

  /**
   * Main High Performance Render Loop
   */
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !chart || !series || width <= 0 || height <= 0) return;
    if (!showHeatmap && !showBestBidAsk) {
      const ctx = canvas.getContext('2d', { alpha: true });
      if (ctx) ctx.clearRect(0, 0, width, height);
      return;
    }

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    // High-DPI support
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const range = chart.timeScale().getVisibleRange();
    if (!range || (range.to as number) <= (range.from as number)) {
      ctx.restore();
      return;
    }

    const tFromSec = range.from as number;
    const tToSec = range.to as number;
    const xFrom = chart.timeScale().timeToCoordinate(range.from as any) ?? 0;
    const xTo = chart.timeScale().timeToCoordinate(range.to as any) ?? width;
    const timeSpan = tToSec - tFromSec;

    const timeToX = (tSec: number) => {
      const secInt = Math.floor(tSec);
      const coord = chart.timeScale().timeToCoordinate(secInt as any);
      if (coord !== null) return coord;
      if (timeSpan > 0 && xTo > xFrom) {
        return xFrom + ((tSec - tFromSec) / timeSpan) * (xTo - xFrom);
      }
      return 0;
    };

    // Dynamic price scale mapping aligned 1:1 with lightweight-charts
    const stats = orderBook.getStats();
    const bestBid = stats.bestBid || orderBook.getBestBid();
    const bestAsk = stats.bestAsk || orderBook.getBestAsk();
    const currentMid = bestBid > 0 && bestAsk > 0
      ? (bestBid + bestAsk) / 2
      : stats.midPrice || 82000;

    const pTopSample = series.coordinateToPrice(0);
    const pBottomSample = series.coordinateToPrice(height);

    let priceToY: (p: number) => number;
    let yToPrice: (y: number) => number;
    let pxPerDollarAbs = 0.5;

    if (pTopSample !== null && pBottomSample !== null && Math.abs(pBottomSample - pTopSample) > 0.001) {
      const pDiff = pBottomSample - pTopSample;
      pxPerDollarAbs = Math.abs(height / pDiff);
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
      pxPerDollarAbs = Math.abs(pxPerDollar);
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

    const pTop = yToPrice(0);
    const pBottom = yToPrice(height);
    const pMin = Math.min(pTop, pBottom);
    const pMax = Math.max(pTop, pBottom);

    // Reserved right margin for COB DOM profile and TradingView price scale
    const cobWidth = showDepthProfile ? Math.max(120, Math.min(320, depthProfileWidth || 210)) : 0;
    const rightReservedPx = 60 + cobWidth;
    const rightBoundaryPx = Math.max(10, width - rightReservedPx);

    // Dynamic price aggregation so cells fit cleanly as rich, solid liquidity bands
    const aggTicks = Math.max(1, heatmapSettings.priceAggregationTicks || 5);
    const tickStep = 0.01 * aggTicks;
    let binDollar = tickStep;
    while (binDollar * pxPerDollarAbs < 3.0 && binDollar < 50) {
      binDollar += tickStep;
    }
    const targetThicknessPx =
      heatmapSettings.zoneThickness === 'fine' ? 3.0 : heatmapSettings.zoneThickness === 'medium' ? 5.0 : 8.0;
    const binHeightPx = Math.max(targetThicknessPx, binDollar * pxPerDollarAbs);

    // 1. RENDER CONTINUOUS BOOKMAP HEATMAP
    if (showHeatmap) {
      let slices = heatmapEngine.getVisibleSlices(
        (tFromSec - 180) * 1000,
        (tToSec + 180) * 1000
      );
      if (slices.length === 0) {
        slices = heatmapEngine.getAllSlices();
      }

      const { minQty, maxQty } = heatmapEngine.getDynamicRange(heatmapSettings, slices);
      const filterThreshold = heatmapEngine.getFilterThreshold(heatmapSettings, slices);

      ctx.save();
      ctx.globalAlpha = Math.min(0.95, heatmapSettings.opacity);

      // 1A. Authentic Bookmap ocean-blue background depth field
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, '#031c38');
      bgGrad.addColorStop(0.25, '#002855');
      bgGrad.addColorStop(0.50, '#001e3d');
      bgGrad.addColorStop(0.75, '#002855');
      bgGrad.addColorStop(1, '#031c38');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, rightBoundaryPx, height);

      // 1B. Liquidity Slices (Depth of Market Surface)
      if (slices.length > 0) {
        const maxDrawSlices = 200;
        const stride = slices.length > maxDrawSlices ? Math.ceil(slices.length / maxDrawSlices) : 1;

        for (let i = 0; i < slices.length; i += stride) {
          const slice = slices[i];
          const nextSlice = slices[i + stride] || (i + 1 < slices.length ? slices[i + 1] : undefined);

          let sliceXStart = timeToX(slice.timestamp / 1000);
          if (i === 0) {
            sliceXStart = Math.min(0, sliceXStart);
          } else {
            sliceXStart = Math.max(0, sliceXStart);
          }
          let sliceXEnd: number;

          if (nextSlice) {
            const naturalEnd = timeToX(nextSlice.timestamp / 1000);
            sliceXEnd = Math.min(rightBoundaryPx, naturalEnd);
          } else {
            // Latest slice extends cleanly all the way to rightBoundaryPx
            sliceXEnd = rightBoundaryPx;
          }

          if (sliceXEnd < 0 || sliceXStart >= rightBoundaryPx || sliceXEnd <= sliceXStart) continue;
          const cellWidth = Math.max(1.2, sliceXEnd - sliceXStart + 0.6);

          // Aggregate slice recorded levels into binDollar buckets
          const binned = new Map<number, number>();

          if (slice.levels.size > 0) {
            for (const [price, qty] of slice.levels) {
              if (price < pMin - binDollar || price > pMax + binDollar) continue;
              if (filterThreshold > 0 && qty < filterThreshold) continue;
              if (heatmapSettings.minLiquidityQty > 0.005 && qty < heatmapSettings.minLiquidityQty) continue;

              if (heatmapSettings.removeTradedLiquidity) {
                if (slice.bestBid > 0 && slice.bestAsk > 0 && price >= slice.bestBid && price <= slice.bestAsk) {
                  continue;
                }
              }

              const bPrice = Math.floor(price / binDollar) * binDollar;
              const existing = binned.get(bPrice) || 0;
              if (qty > existing) {
                binned.set(bPrice, qty);
              }
            }
          }

          // PASS 1: Base depth field (seamless ocean blue Bookmap background covering 100% of price space)
          for (const [binPrice, qty] of binned) {
            const color = colorMapEngine.getColor(qty, minQty, maxQty, heatmapSettings, filterThreshold);
            if (color.a <= 0 || color.hex === 'transparent') continue;

            const y1 = priceToY(binPrice);
            const y2 = priceToY(binPrice + binDollar);
            const cellTop = Math.min(y1, y2);
            const cellBottom = Math.max(y1, y2);
            const cellHeight = Math.max(1.0, cellBottom - cellTop + 0.8);

            ctx.fillStyle = color.hex;
            ctx.fillRect(sliceXStart, cellTop, cellWidth, cellHeight);
          }

          // PASS 2: Glowing thermal bands for major liquidity (Hot Red, Radiant Orange, Golden Yellow)
          // Generates Bookmap's signature thick, luminous heat bands (14px - 26px) seen in reference image
          for (const [binPrice, qty] of binned) {
            const vRoot = Math.sqrt(Math.max(0, qty));
            const minRoot = Math.sqrt(Math.max(0, minQty));
            const maxRoot = Math.sqrt(Math.max(minQty + 0.001, maxQty));
            const norm = Math.max(0, Math.min(1, (vRoot - minRoot) / Math.max(0.0001, maxRoot - minRoot)));
            if (norm < 0.65) continue; // Major liquidity threshold (Session High BSL, Session Low SSL, Major Rounds)

            const color = colorMapEngine.getColor(qty, minQty, maxQty, heatmapSettings, filterThreshold);
            if (color.a <= 0 || color.hex === 'transparent') continue;

            const yCenter = priceToY(binPrice + binDollar / 2);
            const bandHeight = Math.max(12.0, Math.min(24.0, 10.0 + norm * 14.0));
            const bandTop = yCenter - bandHeight / 2;

            const grad = ctx.createLinearGradient(0, bandTop, 0, bandTop + bandHeight);
            grad.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, 0.0)`);
            grad.addColorStop(0.20, `rgba(255, 200, 0, 0.65)`); // Golden yellow glow shoulder
            grad.addColorStop(0.50, color.hex);                 // Hot Red / Fiery Orange core
            grad.addColorStop(0.80, `rgba(255, 200, 0, 0.65)`); // Golden yellow glow shoulder
            grad.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, 0.0)`);

            ctx.fillStyle = grad;
            ctx.fillRect(sliceXStart, bandTop, cellWidth, bandHeight);

            // Radiant filament core for peak walls (norm >= 0.85)
            if (norm >= 0.85) {
              ctx.fillStyle = 'rgba(255, 250, 220, 0.85)';
              ctx.fillRect(sliceXStart, yCenter - 1.5, cellWidth, 3.0);
            }
          }
        }
      }

      ctx.restore();
    }

    // 2. RENDER STEPPING BEST BID AND BEST ASK RIBBON (WHEN CANDLES ARE NOT SHOWN)
    if (showBestBidAsk && !showCandles) {
      const slices = heatmapEngine.getVisibleSlices(
        (tFromSec - 300) * 1000,
        (tToSec + 100) * 1000
      );
      if (slices.length > 1) {
        // Best Ask line (Red stepping line)
        ctx.beginPath();
        ctx.strokeStyle = '#ff2d55';
        ctx.lineWidth = 1.3;
        let prevAskX: number | null = null;
        let prevAskY: number | null = null;
        let prevAskT: number | null = null;

        for (const s of slices) {
          if (s.bestAsk > 0 && s.bestBid > 0 && s.bestAsk > s.bestBid) {
            const x = timeToX(s.timestamp / 1000);
            const y = priceToY(s.bestAsk);
            if (prevAskX === null || prevAskY === null || (prevAskT !== null && s.timestamp - prevAskT > 5000)) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, prevAskY);
              ctx.lineTo(x, y);
            }
            prevAskX = x;
            prevAskY = y;
            prevAskT = s.timestamp;
          }
        }
        ctx.stroke();

        // Best Bid line (Green stepping line)
        ctx.beginPath();
        ctx.strokeStyle = '#00e676';
        ctx.lineWidth = 1.3;
        let prevBidX: number | null = null;
        let prevBidY: number | null = null;
        let prevBidT: number | null = null;

        for (const s of slices) {
          if (s.bestBid > 0 && s.bestAsk > 0 && s.bestAsk > s.bestBid) {
            const x = timeToX(s.timestamp / 1000);
            const y = priceToY(s.bestBid);
            if (prevBidX === null || prevBidY === null || (prevBidT !== null && s.timestamp - prevBidT > 5000)) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, prevBidY);
              ctx.lineTo(x, y);
            }
            prevBidX = x;
            prevBidY = y;
            prevBidT = s.timestamp;
          }
        }
        ctx.stroke();
      }
    }

    ctx.restore();
  }, [
    chart,
    series,
    orderBook,
    width,
    height,
    showHeatmap,
    showBestBidAsk,
    showCandles,
    showDepthProfile,
    depthProfileWidth,
    heatmapEngine,
    colorMapEngine,
    heatmapSettings,
  ]);

  // Request animation frame loop
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
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [render]);

  // Trigger render on chart pan/zoom and engine updates
  useEffect(() => {
    if (!chart) return;

    const handleRangeChange = () => {
      isDirtyRef.current = true;
    };

    chart.timeScale().subscribeVisibleTimeRangeChange(handleRangeChange);
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleRangeChange);

    const unsubHeatmap = heatmapEngine.subscribe(() => {
      isDirtyRef.current = true;
    });

    const unsubOrderBook = orderBook.subscribe(() => {
      isDirtyRef.current = true;
    });

    const timerId = window.setInterval(() => {
      if (showHeatmap || showBestBidAsk) {
        isDirtyRef.current = true;
      }
    }, 500);

    return () => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(handleRangeChange);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleRangeChange);
      unsubHeatmap();
      unsubOrderBook();
      clearInterval(timerId);
    };
  }, [chart, heatmapEngine, orderBook, showHeatmap, showBestBidAsk]);

  useEffect(() => {
    isDirtyRef.current = true;
  }, [width, height, heatmapSettings, showHeatmap, showBestBidAsk, showCandles, showDepthProfile, depthProfileWidth]);

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
        zIndex: 1,
      }}
    />
  );
};
