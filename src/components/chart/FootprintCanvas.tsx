/**
 * JARVIS Footprint Chart Overlay Canvas
 * Pixel-perfect implementation matching professional order flow footprint terminal (Image 2)
 * Features:
 * - Vertical candle body (green/red) and wick on the left
 * - Compact, crisp "Bid x Ask" numbers stack
 * - Red seller dominant / imbalance emphasis, Cyan/Green buyer dominant emphasis
 * - Rectangular POC outline box with extended horizontal POC line & price tag
 * - Ultra-lightweight event-driven rendering (dirty-flagged, near-zero idle CPU load)
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { FootprintEngine } from '../../services/footprint/FootprintEngine';
import { OrderBookManager } from '../../services/orderbook/OrderBookManager';
import { FootprintCandle, FootprintLevel, FootprintSettings } from '../../types/footprint';

interface FootprintCanvasProps {
  chart: IChartApi | null;
  series: ISeriesApi<'Candlestick'> | null;
  footprintEngine: FootprintEngine;
  orderBook?: OrderBookManager;
  settings: FootprintSettings;
  width: number;
  height: number;
  onHoverLevel?: (candle: FootprintCandle | null, level: FootprintLevel | null, screenX: number, screenY: number) => void;
}

function formatVolumeNumber(vol: number): string {
  if (vol <= 0) return '0';
  if (vol >= 1000000) return `${(vol / 1000000).toFixed(1)}M`;
  if (vol >= 10000) return `${Math.round(vol / 1000)}K`;
  if (vol >= 1000) return `${(vol / 1000).toFixed(1)}K`;
  if (vol >= 10) return Math.round(vol).toString();
  if (vol >= 1) return vol % 1 === 0 ? vol.toFixed(0) : vol.toFixed(1);
  return vol.toFixed(2);
}

function formatDeltaNumber(delta: number): string {
  const sign = delta > 0 ? '+' : delta < 0 ? '-' : '';
  const abs = Math.abs(delta);
  if (abs === 0) return '0';
  if (abs >= 1000000) return `${sign}${(abs / 1000000).toFixed(1)}M`;
  if (abs >= 10000) return `${sign}${Math.round(abs / 1000)}K`;
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)}K`;
  if (abs >= 10) return `${sign}${Math.round(abs)}`;
  if (abs >= 1) return `${sign}${abs % 1 === 0 ? abs.toFixed(0) : abs.toFixed(1)}`;
  return `${sign}${abs.toFixed(2)}`;
}

const FootprintCanvasComponent: React.FC<FootprintCanvasProps> = ({
  chart,
  series,
  footprintEngine,
  orderBook,
  settings,
  width,
  height,
  onHoverLevel: _onHoverLevel,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDirtyRef = useRef<boolean>(true);
  const animFrameRef = useRef<number | null>(null);
  const lastRenderTimeRef = useRef<number>(0);

  // Mark dirty whenever props or settings change
  useEffect(() => {
    isDirtyRef.current = true;
  }, [settings, width, height]);

  // Subscribe to FootprintEngine trade updates for zero-lag, event-driven redraws
  useEffect(() => {
    return footprintEngine.subscribe(() => {
      isDirtyRef.current = true;
    });
  }, [footprintEngine]);

  // Subscribe to OrderBook updates if provided
  useEffect(() => {
    if (!orderBook) return;
    return orderBook.subscribe(() => {
      isDirtyRef.current = true;
    });
  }, [orderBook]);

  // Subscribe to chart viewport range changes (pan / zoom)
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
    if (!canvas || !chart || !series || width <= 0 || height <= 0 || !settings.enabled) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
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

    const visibleCandles = footprintEngine.getVisibleCandles(tFromSec, tToSec);
    if (visibleCandles.length === 0) {
      ctx.restore();
      return;
    }

    const timeScale = chart.timeScale();
    const bucketSize = footprintEngine.getBucketSize();

    // Determine bar spacing with precision from visible candles
    let defaultSpacing = 72;
    if (visibleCandles.length >= 2) {
      const diffs: number[] = [];
      for (let i = 0; i < visibleCandles.length - 1; i++) {
        const xA = timeScale.timeToCoordinate(visibleCandles[i].candleStart as any);
        const xB = timeScale.timeToCoordinate(visibleCandles[i + 1].candleStart as any);
        if (xA !== null && xB !== null) {
          const d = Math.abs(xB - xA);
          if (d > 4 && Number.isFinite(d)) {
            diffs.push(d);
          }
        }
      }
      if (diffs.length > 0) {
        diffs.sort((a, b) => a - b);
        defaultSpacing = diffs[Math.floor(diffs.length / 2)];
      }
    } else if (visibleCandles.length === 1) {
      const x0 = timeScale.timeToCoordinate(visibleCandles[0].candleStart as any);
      const xEnd = timeScale.timeToCoordinate(visibleCandles[0].candleEnd as any);
      if (x0 !== null && xEnd !== null && Math.abs(xEnd - x0) > 4) {
        defaultSpacing = Math.abs(xEnd - x0);
      }
    }

    const fontSize = Math.max(9, Math.min(13, settings.fontSize || 10));
    ctx.font = `600 ${fontSize}px 'JetBrains Mono', 'Roboto Mono', 'SF Pro Text', monospace`;

    // Colors matching Image 2
    const greenBodyColor = '#0ecb81'; // Bright teal-green for bullish candle
    const redBodyColor = '#f6465d';   // Bright red for bearish candle
    const dojiBodyColor = '#848e9c';  // Neutral gray
    const neutralTextColor = '#d1d4dc';
    const xSeparatorColor = 'rgba(255, 255, 255, 0.38)';
    const imbAskColor = '#38bdf8';    // Bright cyan-blue for buyer aggressive imbalance
    const imbBidColor = '#f6465d';    // Bright red for seller aggressive imbalance
    const pocBoxColor = '#f6465d';    // Red POC box outline matching Image 2

    // Track active/latest POC for horizontal projection line
    let latestPocPrice: number | null = null;
    let latestPocY: number | null = null;
    let latestCandleX: number | null = null;

    // Render each visible candle with continuous, professional column width (tight 3-6px separation gap)
    for (let cIdx = 0; cIdx < visibleCandles.length; cIdx++) {
      const candle = visibleCandles[cIdx];
      const cx = timeScale.timeToCoordinate(candle.candleStart as any);
      if (cx === null || cx < -defaultSpacing || cx > width + defaultSpacing) continue;

      const yHigh = series.priceToCoordinate(candle.high);
      const yLow = series.priceToCoordinate(candle.low);
      const yOpen = series.priceToCoordinate(candle.open);
      const yClose = series.priceToCoordinate(candle.close);

      if (yHigh === null || yLow === null || yOpen === null || yClose === null) continue;

      const isGreen = candle.close > candle.open;
      const isRed = candle.close < candle.open;
      const bodyColor = isGreen ? greenBodyColor : isRed ? redBodyColor : dojiBodyColor;

      const bodyTop = Math.min(yOpen, yClose);
      const bodyHeight = Math.max(2, Math.abs(yClose - yOpen));

      // Track latest candle POC for horizontal ray line
      // Track latest candle POC for horizontal ray line
      if (cIdx === visibleCandles.length - 1 && candle.pocPrice > 0) {
        latestPocPrice = candle.pocPrice;
        const yPocBottom = series.priceToCoordinate(candle.pocPrice);
        const yPocTop = series.priceToCoordinate(candle.pocPrice + bucketSize);
        latestPocY = yPocBottom !== null && yPocTop !== null
          ? (yPocBottom + yPocTop) / 2
          : yPocBottom;
        latestCandleX = cx;
      }

      // Calculate TRUE lowest candle extent across all wicks and footprint levels
      const sortedLevels = Array.from(candle.levels.values()).sort((a, b) => b.price - a.price);

      let lowestCandleExtentY: number = yLow as number;
      if (sortedLevels.length > 0) {
        const lowestLvl = sortedLevels[sortedLevels.length - 1];
        const yLowestBottom = series.priceToCoordinate(lowestLvl.price);
        if (yLowestBottom !== null && yLowestBottom > lowestCandleExtentY) {
          lowestCandleExtentY = yLowestBottom;
        }
      }

      const pillH = 15;
      const deltaY = Math.min(height - pillH - 4, lowestCandleExtentY + 6);

      // Determine local candle spacing to immediate neighbors for pixel-perfect column sizing
      let leftDist = defaultSpacing;
      let rightDist = defaultSpacing;

      if (cIdx > 0) {
        const prevX = timeScale.timeToCoordinate(visibleCandles[cIdx - 1].candleStart as any);
        if (prevX !== null && cx > prevX) {
          leftDist = cx - prevX;
        }
      }
      if (cIdx < visibleCandles.length - 1) {
        const nextX = timeScale.timeToCoordinate(visibleCandles[cIdx + 1].candleStart as any);
        if (nextX !== null && nextX > cx) {
          rightDist = nextX - cx;
        }
      }

      // Continuous professional column sizing: fills 92-95% of candle slot with 3-6px clean gap
      const candleSpacing = Math.min(leftDist, rightDist);
      const gap = Math.max(3, Math.min(6, Math.round(candleSpacing * 0.05)));
      const columnWidth = Math.max(16, candleSpacing - gap);

      const slotLeft = cx - columnWidth / 2;
      const slotRight = cx + columnWidth / 2;

      // Professional detail threshold: render footprint ladder whenever column is >= 24px
      const isFullDetail = columnWidth >= 24 && settings.showBidAskText !== false;

      // ============================================================
      // STRICT CANVAS CLIPPING:
      // Guarantees zero data spill or overlap into neighboring candles
      // ============================================================
      ctx.save();
      ctx.beginPath();
      ctx.rect(slotLeft - 0.5, 0, columnWidth + 1, height);
      ctx.clip();

      // ============================================================
      // CASE A: ZOOMED IN (isFullDetail) -> FULL FOOTPRINT LADDER WITH CENTER CANDLE
      // ============================================================
      if (isFullDetail) {
        const ladderLeft = slotLeft;
        const ladderRight = slotRight;
        const ladderWidth = columnWidth;

        // Center Candlestick dimensions (Exact like TradingView)
        const candleBodyW = Math.max(5, Math.min(10, Math.round(columnWidth * 0.12)));
        const candleX0 = cx - candleBodyW / 2;
        const candleX1 = cx + candleBodyW / 2;

        // Left Bid column and Right Ask column bounds
        const bidW = Math.max(8, candleX0 - 1 - ladderLeft);
        const askW = Math.max(8, ladderRight - (candleX1 + 1));
        const leftCellMidX = ladderLeft + bidW / 2;
        const rightCellMidX = (candleX1 + 1) + askW / 2;

        // Calculate actual vertical bucket pixel height
        let bucketPixelHeight = 16;
        if (sortedLevels.length >= 2) {
          const y0 = series.priceToCoordinate(sortedLevels[0].price);
          const y1 = series.priceToCoordinate(sortedLevels[1].price);
          if (y0 !== null && y1 !== null && Math.abs(y1 - y0) > 0) {
            bucketPixelHeight = Math.abs(y1 - y0);
          }
        } else if (sortedLevels.length === 1) {
          const y0 = series.priceToCoordinate(sortedLevels[0].price);
          const yNext = series.priceToCoordinate(sortedLevels[0].price - bucketSize);
          if (y0 !== null && yNext !== null) {
            bucketPixelHeight = Math.abs(yNext - y0);
          }
        }

        // Calculate peak volumes for heat intensity
        let maxBidVol = 0;
        let maxAskVol = 0;
        for (const lvl of sortedLevels) {
          if (lvl.bidVolume > maxBidVol) maxBidVol = lvl.bidVolume;
          if (lvl.askVolume > maxAskVol) maxAskVol = lvl.askVolume;
        }

        const adaptiveFontSize = Math.max(6.5, Math.min(11, Math.min(bucketPixelHeight - 2, bidW / 3.2)));

        // 1. RENDER FOOTPRINT LEVEL CELLS (Bid on left, Ask on right)
        for (const lvl of sortedLevels) {
          const yBottom = series.priceToCoordinate(lvl.price);
          const yTop = series.priceToCoordinate(lvl.price + bucketSize);
          if (yBottom === null && yTop === null) continue;

          const rowTop = yTop !== null && yBottom !== null ? Math.min(yTop, yBottom) : (yTop !== null ? yTop : yBottom! - bucketPixelHeight);
          const rowBottom = yTop !== null && yBottom !== null ? Math.max(yTop, yBottom) : (yBottom !== null ? yBottom : yTop! + bucketPixelHeight);
          const rowHeight = Math.max(2, rowBottom - rowTop);
          const yCenter = (rowTop + rowBottom) / 2;

          if (rowBottom < -20 || rowTop > height + 20) continue;

          const isPoc = lvl.isPoc && settings.showPocHighlight;
          const isAskImb = lvl.isAskImbalance && settings.showImbalances;
          const isBidImb = lvl.isBidImbalance && settings.showImbalances;

          // 1A. LEFT CELL: SELL AGGRESSOR (BID VOLUME)
          ctx.fillStyle = 'rgba(13, 17, 28, 0.94)';
          ctx.fillRect(ladderLeft, rowTop + 0.5, bidW, rowHeight - 1);

          if (lvl.bidVolume > 0) {
            const bidRatio = maxBidVol > 0 ? lvl.bidVolume / maxBidVol : 0;
            const bidAlpha = 0.14 + 0.62 * bidRatio;
            ctx.fillStyle = `rgba(220, 38, 38, ${bidAlpha.toFixed(3)})`;
            ctx.fillRect(ladderLeft, rowTop + 0.5, bidW, rowHeight - 1);
          }

          // 1B. RIGHT CELL: BUY AGGRESSOR (ASK VOLUME)
          ctx.fillStyle = 'rgba(13, 17, 28, 0.94)';
          ctx.fillRect(candleX1 + 1, rowTop + 0.5, askW, rowHeight - 1);

          if (lvl.askVolume > 0) {
            const askRatio = maxAskVol > 0 ? lvl.askVolume / maxAskVol : 0;
            const askAlpha = 0.14 + 0.62 * askRatio;
            ctx.fillStyle = `rgba(16, 185, 129, ${askAlpha.toFixed(3)})`;
            ctx.fillRect(candleX1 + 1, rowTop + 0.5, askW, rowHeight - 1);
          }

          // 1C. CELL GRID LINES (Subtle 1px dividers)
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(ladderLeft, rowBottom - 0.5);
          ctx.lineTo(candleX0 - 1, rowBottom - 0.5);
          ctx.moveTo(candleX1 + 1, rowBottom - 0.5);
          ctx.lineTo(ladderRight, rowBottom - 0.5);
          ctx.stroke();

          // 1D. POC OUTLINE FRAME (Prominent golden yellow box framing entire price row)
          if (isPoc) {
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = 1.8;
            ctx.strokeRect(ladderLeft + 0.5, rowTop + 0.5, ladderWidth - 1, rowHeight - 1);
          }

          // 1E. NUMERIC TEXT LABELS INSIDE CELLS
          if (rowHeight >= 8 && bidW >= 10) {
            const bidText = formatVolumeNumber(lvl.bidVolume);
            const askText = formatVolumeNumber(lvl.askVolume);

            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';

            // Left Bid Text (Seller aggressor)
            if (isBidImb || lvl.isStackedBidImbalance) {
              ctx.fillStyle = '#fca5a5';
              ctx.font = `700 ${adaptiveFontSize}px 'JetBrains Mono', monospace`;
            } else if (lvl.bidVolume === 0) {
              ctx.fillStyle = '#475569';
              ctx.font = `500 ${adaptiveFontSize}px 'JetBrains Mono', monospace`;
            } else {
              ctx.fillStyle = '#f8fafc';
              ctx.font = `600 ${adaptiveFontSize}px 'JetBrains Mono', monospace`;
            }
            ctx.fillText(bidText, leftCellMidX, yCenter);

            // Right Ask Text (Buyer aggressor)
            if (isAskImb || lvl.isStackedAskImbalance) {
              ctx.fillStyle = '#86efac';
              ctx.font = `700 ${adaptiveFontSize}px 'JetBrains Mono', monospace`;
            } else if (lvl.askVolume === 0) {
              ctx.fillStyle = '#475569';
              ctx.font = `500 ${adaptiveFontSize}px 'JetBrains Mono', monospace`;
            } else {
              ctx.fillStyle = '#f8fafc';
              ctx.font = `600 ${adaptiveFontSize}px 'JetBrains Mono', monospace`;
            }
            ctx.fillText(askText, rightCellMidX, yCenter);
          }
        }

        // 2. RENDER THE CANDLESTICK EXACTLY AT THE CENTER (Exact like TradingView)
        // 2A. Full TradingView Central Wicks (from yHigh to bodyTop, and bodyTop+bodyHeight to yLow)
        ctx.strokeStyle = bodyColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, yHigh);
        ctx.lineTo(cx, bodyTop);
        ctx.moveTo(cx, bodyTop + bodyHeight);
        ctx.lineTo(cx, yLow);
        ctx.stroke();

        // 2B. Central Candle Body (Open-to-Close)
        ctx.fillStyle = bodyColor;
        ctx.fillRect(candleX0, bodyTop, candleBodyW, bodyHeight);
        ctx.strokeStyle = isGreen ? '#00c853' : isRed ? '#d50000' : '#848e9c';
        ctx.lineWidth = 1;
        ctx.strokeRect(candleX0, bodyTop, candleBodyW, bodyHeight);
      }
      // ============================================================
      // CASE B: ZOOMED OUT (!isFullDetail) -> COLLAPSE INTO CANDLES WITH DELTA
      // ============================================================
      else {
        // Render centered, solid standard Candlestick with width proportional to spacing
        const bodyWidth = Math.max(3, Math.min(18, columnWidth * 0.72));
        const bodyX = cx - bodyWidth / 2;

        ctx.fillStyle = bodyColor;
        ctx.fillRect(bodyX, bodyTop, bodyWidth, bodyHeight);

        // Candle border for crisp definition
        ctx.strokeStyle = isGreen ? '#00c853' : isRed ? '#d50000' : '#848e9c';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(bodyX, bodyTop, bodyWidth, bodyHeight);

        // Upper and lower wicks centered at cx
        ctx.strokeStyle = bodyColor;
        ctx.lineWidth = candleSpacing >= 12 ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(cx, yHigh);
        ctx.lineTo(cx, bodyTop);
        ctx.moveTo(cx, bodyTop + bodyHeight);
        ctx.lineTo(cx, yLow);
        ctx.stroke();

        // Subtle POC line marker inside candle body
        if (settings.showPocHighlight && candle.pocPrice > 0) {
          const yPocBottom = series.priceToCoordinate(candle.pocPrice);
          const yPocTop = series.priceToCoordinate(candle.pocPrice + bucketSize);
          const pocY = yPocBottom !== null && yPocTop !== null
            ? (yPocBottom + yPocTop) / 2
            : yPocBottom;
          if (pocY !== null && pocY >= yHigh && pocY <= yLow) {
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(bodyX, pocY);
            ctx.lineTo(bodyX + bodyWidth, pocY);
            ctx.stroke();
          }
        }
      }

      // ============================================================
      // SHOW DELTA & TOTAL VOLUME ALL THE TIME (Both Zoomed-in and Zoomed-out)
      // ============================================================
      if (settings.showCandleDelta !== false) {
        const densityStep = candleSpacing >= 16 ? 1 : candleSpacing >= 10 ? 2 : 4;
        const shouldShowDelta = cIdx % densityStep === 0 || cIdx === visibleCandles.length - 1;

        if (shouldShowDelta) {
          const deltaStr = formatDeltaNumber(candle.delta);
          const volStr = formatVolumeNumber(candle.totalVolume);
          const deltaColor = candle.delta > 0 ? '#0ecb81' : candle.delta < 0 ? '#f6465d' : '#94a3b8';
          const deltaBorder = candle.delta > 0 ? 'rgba(14, 203, 129, 0.45)' : candle.delta < 0 ? 'rgba(246, 70, 93, 0.45)' : 'rgba(148, 163, 184, 0.3)';

          const hasRoomForTwoLines = height - lowestCandleExtentY >= 34;
          const cardH = hasRoomForTwoLines ? 24 : 14;
          const cardY = Math.min(height - cardH - 2, lowestCandleExtentY + 5);

          ctx.font = `700 9px 'JetBrains Mono', monospace`;
          const deltaTextW = ctx.measureText(deltaStr).width;
          ctx.font = `500 8px 'JetBrains Mono', monospace`;
          const volTextW = ctx.measureText(`Vol ${volStr}`).width;
          const maxContentW = Math.max(deltaTextW, volTextW);

          const maxPillW = Math.max(22, Math.min(64, columnWidth - 2));
          const pillW = Math.min(maxPillW, Math.max(22, maxContentW + 8));
          const pillX = cx - pillW / 2;

          ctx.fillStyle = 'rgba(11, 15, 23, 0.95)';
          ctx.fillRect(pillX, cardY, pillW, cardH);
          ctx.strokeStyle = deltaBorder;
          ctx.lineWidth = 1;
          ctx.strokeRect(pillX, cardY, pillW, cardH);

          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          if (hasRoomForTwoLines) {
            ctx.font = `700 9px 'JetBrains Mono', monospace`;
            ctx.fillStyle = deltaColor;
            ctx.fillText(deltaStr, cx, cardY + 7);

            ctx.font = `500 8px 'JetBrains Mono', monospace`;
            ctx.fillStyle = '#94a3b8';
            ctx.fillText(volStr, cx, cardY + 17);
          } else {
            ctx.font = `700 9px 'JetBrains Mono', monospace`;
            ctx.fillStyle = deltaColor;
            ctx.fillText(deltaStr, cx, cardY + cardH / 2);
          }
        }
      }

      ctx.restore(); // Restore per-candle clipping
    }

    // 4. Draw Horizontal Extended POC Reference Line & Price Tag Badge (as seen at 81580.0 in Image 2)
    if (latestPocPrice !== null && latestPocY !== null && latestCandleX !== null) {
      ctx.save();
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(latestCandleX, latestPocY);
      ctx.lineTo(width, latestPocY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Red price tag badge on right edge matching Image 2
      const pocText = latestPocPrice >= 100 ? latestPocPrice.toFixed(1) : latestPocPrice.toFixed(2);
      ctx.font = `700 10px 'JetBrains Mono', monospace`;
      const textW = ctx.measureText(pocText).width;
      const tagW = textW + 12;
      const tagH = 18;
      const tagX = width - tagW - 4;
      const tagY = latestPocY - tagH / 2;

      ctx.fillStyle = '#ef4444';
      ctx.fillRect(tagX, tagY, tagW, tagH);
      ctx.strokeStyle = '#fca5a5';
      ctx.lineWidth = 1;
      ctx.strokeRect(tagX, tagY, tagW, tagH);

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pocText, tagX + tagW / 2, latestPocY);
      ctx.restore();
    }

    // 5. Draw Horizontal Current Live Price Marker Line & Badge (as seen at 89774.1 in Image 2)
    const latestCandle = visibleCandles[visibleCandles.length - 1];
    if (latestCandle && latestCandle.close > 0) {
      const curY = series.priceToCoordinate(latestCandle.close);
      if (curY !== null && curY >= 0 && curY <= height) {
        ctx.save();
        const isUp = latestCandle.close >= (latestCandle.open ?? latestCandle.close);
        const mainColor = isUp ? '#00e676' : '#ff2d55';
        const borderColor = isUp ? '#69f0ae' : '#ff5252';

        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, curY);
        ctx.lineTo(width, curY);
        ctx.stroke();
        ctx.setLineDash([]);

        const curPriceText = latestCandle.close >= 100 ? latestCandle.close.toFixed(1) : latestCandle.close.toFixed(2);
        ctx.font = `700 10px 'JetBrains Mono', monospace`;
        const curTextW = ctx.measureText(curPriceText).width;
        const curTagW = curTextW + 12;
        const curTagH = 18;
        const curTagX = width - curTagW - 4;
        const curTagY = curY - curTagH / 2;

        ctx.fillStyle = mainColor;
        ctx.fillRect(curTagX, curTagY, curTagW, curTagH);
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(curTagX, curTagY, curTagW, curTagH);

        ctx.fillStyle = isUp ? '#0b0f17' : '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(curPriceText, curTagX + curTagW / 2, curY);
        ctx.restore();
      }
    }

    ctx.restore();
  }, [chart, series, footprintEngine, settings, width, height]);

  // Event-driven lightweight animation frame loop
  useEffect(() => {
    if (!settings.enabled) return;
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
  }, [render, settings.enabled]);

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
        zIndex: 5,
      }}
    />
  );
};

export const FootprintCanvas = React.memo(FootprintCanvasComponent);
