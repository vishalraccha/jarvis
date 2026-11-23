/**
 * JARVIS 2.0 Delta Profile Canvas Component
 * Buy/Sell Delta Distribution by Price Level (Institutional Order Flow)
 * 
 * Accurately reproduces the institutional Delta Profile layout styled like COB Orders:
 * - Substantial, visible price-level rows dynamically aligned with chart coordinates
 * - 1:1 Pixel-perfect horizontal row alignment with COB (Orders/Cumulative) ladder
 * - Discrete price column on the left (matching COB ladder)
 * - Horizontal Delta bars extending rightwards:
 *     - Vibrant Green / Teal for aggressive buying taking ask
 *     - Vibrant Red for aggressive selling taking bid
 * - Order flow delta numbers displayed directly on or beside the bars (+45.2, -18.0, etc.)
 * - Prominent Yellow [POC] marker badge pointing at the Delta POC level
 * - Sleek non-overlapping Trapped Trader badges for Potential Trapped Buyers & Sellers
 * - Seamless 26px header matching COB header height and continuous imbalance meter line
 * - Premium Dark Grey Glass background for optimal number readability
 * - 30 FPS real-time automated updates matching COB with execution hit flashes
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { DeltaProfileEngine } from '../../services/deltaProfile/DeltaProfileEngine';
import {
  DeltaProfileSettings,
  DeltaProfileMetrics,
  DeltaPriceLevel,
} from '../../types/deltaProfile';
import { Candle, ExchangeId } from '../../types/market';
import { InstrumentRegistry } from '../../services/market/InstrumentRegistry';
import { OrderBookManager } from '../../services/orderbook/OrderBookManager';
import { Settings, X } from 'lucide-react';

function formatDeltaQty(delta: number): string {
  if (isNaN(delta)) return '0';
  const sign = delta > 0 ? '+' : delta < 0 ? '-' : '';
  const abs = Math.abs(delta);
  if (abs === 0) return '0';
  if (abs >= 10_000_000) {
    return `${sign}${Math.round(abs / 1_000_000)}M`;
  }
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 100_000) {
    return `${sign}${Math.round(abs / 1000)}K`;
  }
  if (abs >= 1_000) {
    return `${sign}${(abs / 1000).toFixed(1)}K`;
  }
  if (abs >= 100) {
    return `${sign}${Math.round(abs)}`;
  }
  if (abs >= 10) {
    return `${sign}${abs.toFixed(1)}`;
  }
  return `${sign}${abs.toFixed(2)}`;
}

interface DeltaProfileCanvasProps {
  chart: IChartApi | null;
  series: ISeriesApi<'Candlestick'> | null;
  deltaProfileEngine: DeltaProfileEngine;
  orderBook?: OrderBookManager;
  settings: DeltaProfileSettings;
  width: number;
  height: number;
  candles?: Candle[];
  isCobActive?: boolean;
  cobWidth?: number;
  symbol?: string;
  exchange?: string;
  onClose?: () => void;
  onOpenSettings?: () => void;
}

export const DeltaProfileCanvas: React.FC<DeltaProfileCanvasProps> = ({
  chart,
  series,
  deltaProfileEngine,
  orderBook,
  settings,
  width,
  height,
  candles,
  isCobActive = false,
  cobWidth = 210,
  symbol = 'XAUUSD',
  exchange = 'binance',
  onClose,
  onOpenSettings,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isDirtyRef = useRef<boolean>(true);

  const [metrics, setMetrics] = useState<DeltaProfileMetrics | null>(null);
  const [hoveredLevel, setHoveredLevel] = useState<DeltaPriceLevel | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  const isMobile = width < 640;
  const maxAllowedWidth = isMobile ? Math.min(180, Math.floor(width * 0.45)) : 340;
  const minAllowedWidth = isMobile ? 120 : 180;
  const baseWidth = isMobile
    ? Math.min(settings.widthPx || 220, maxAllowedWidth)
    : (settings.widthPx || 220);
  const profileWidth = Math.max(minAllowedWidth, Math.min(maxAllowedWidth, baseWidth));

  // Position flush against the left edge of COB (or right edge of chart)
  const rightOffset = (width < 600 ? 50 : 65) + (isCobActive ? cobWidth : 0);

  // Subscribe to engine metrics updates
  useEffect(() => {
    const unsub = deltaProfileEngine.subscribe((newMetrics) => {
      setMetrics(newMetrics);
      isDirtyRef.current = true;
    });
    setMetrics(deltaProfileEngine.getMetrics());
    return unsub;
  }, [deltaProfileEngine]);

  // Subscribe to live order book ticks (matching COB at solid 30 FPS)
  useEffect(() => {
    if (!orderBook) return;
    let lastBookTick = 0;
    const unsub = orderBook.subscribe(() => {
      const now = performance.now();
      if (now - lastBookTick >= 32) {
        lastBookTick = now;
        isDirtyRef.current = true;
      }
    });
    return unsub;
  }, [orderBook]);

  // Synchronize visible range on chart scroll / zoom
  useEffect(() => {
    if (!chart) return;
    const timeScale = chart.timeScale();

    const handleRangeChange = () => {
      try {
        const vr = timeScale.getVisibleRange();
        if (vr && typeof vr.from === 'number' && typeof vr.to === 'number') {
          deltaProfileEngine.setVisibleTimeRange(vr.from, vr.to);
        }
      } catch {}
      isDirtyRef.current = true;
    };

    timeScale.subscribeVisibleTimeRangeChange(handleRangeChange);
    timeScale.subscribeVisibleLogicalRangeChange(handleRangeChange);
    handleRangeChange();

    return () => {
      try {
        timeScale.unsubscribeVisibleTimeRangeChange(handleRangeChange);
        timeScale.unsubscribeVisibleLogicalRangeChange(handleRangeChange);
      } catch {}
    };
  }, [chart, deltaProfileEngine]);

  // Synchronize candles when provided
  useEffect(() => {
    if (candles && candles.length > 0) {
      deltaProfileEngine.seedFromCandles(candles);
      isDirtyRef.current = true;
    }
  }, [candles, deltaProfileEngine]);

  // Re-render when size, settings, or candles change
  useEffect(() => {
    isDirtyRef.current = true;
  }, [width, height, settings, candles, isCobActive, cobWidth]);

  // Main Render Loop
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

    // 1. Premium Matte Dark Grey Background (optimal contrast for delta numbers and bars)
    const bgGrad = ctx.createLinearGradient(0, 0, profileWidth, 0);
    bgGrad.addColorStop(0, `rgba(20, 20, 24, ${Math.min(0.98, (settings.opacity || 0.92) + 0.06)})`);
    bgGrad.addColorStop(1, `rgba(22, 22, 26, ${Math.min(0.99, (settings.opacity || 0.92) + 0.07)})`);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, profileWidth, height);

    // Left Border separator separating chart from Delta Profile
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, height);
    ctx.stroke();

    // 2. Exact Price-to-Coordinate Mapping (100% Identical to COB DepthProfileCanvas)
    const stats = orderBook ? orderBook.getStats() : null;
    const lastCandle = candles && candles.length > 0 ? candles[candles.length - 1] : null;
    const candlePrice = lastCandle && Number.isFinite(lastCandle.close) && lastCandle.close > 0 ? lastCandle.close : 0;
    const chartCenterPrice = series.coordinateToPrice(height / 2);
    const validCenterPrice = chartCenterPrice !== null && Number.isFinite(chartCenterPrice) && chartCenterPrice > 0 ? chartCenterPrice : 0;

    const lastHit = deltaProfileEngine.getLastTradeHit() || (orderBook ? orderBook.getLastTradeHit() : null);
    const hitPrice = lastHit && Number.isFinite(lastHit.price) && lastHit.price > 0 && Date.now() - lastHit.timestamp < 15000 ? lastHit.price : 0;
    const lastTradedPrice = (orderBook as any)?.getLastTradedPrice ? (orderBook as any).getLastTradedPrice() : 0;
    const livePrice = hitPrice || lastTradedPrice || candlePrice;

    const bestBid = stats?.bestBid || (orderBook ? orderBook.getBestBid() : 0);
    const bestAsk = stats?.bestAsk || (orderBook ? orderBook.getBestAsk() : 0);

    let currentMid = 0;
    if (livePrice > 0) {
      currentMid = livePrice;
    } else if (bestBid > 0 && bestAsk > 0 && bestAsk >= bestBid) {
      currentMid = (bestBid + bestAsk) / 2;
    } else if (validCenterPrice > 0) {
      currentMid = validCenterPrice;
    } else {
      currentMid = Math.max(0.0001, bestBid || bestAsk || 100);
    }

    const pTopSample = series.coordinateToPrice(0);
    const pBottomSample = series.coordinateToPrice(height);

    let priceToY: (p: number) => number;
    let yToPrice: (y: number) => number;

    if (pTopSample !== null && pBottomSample !== null && Math.abs(pBottomSample - pTopSample) > 0.001) {
      const pDiff = pBottomSample - pTopSample;
      priceToY = (p: number) => ((p - pTopSample) / pDiff) * height;
      yToPrice = (y: number) => pTopSample + (y / height) * pDiff;
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
      priceToY = (p: number) => yMid! + (p - currentMid) * pxPerDollar;
      yToPrice = (y: number) => currentMid + (y - yMid!) / pxPerDollar;
    }

    // Header height: Exactly 26px matching COB (Orders/Cumulative) header
    const headerH = 26;
    const pTop = yToPrice(headerH);
    const pBottom = yToPrice(height);
    const rawMin = Math.min(pTop, pBottom);
    const rawMax = Math.max(pTop, pBottom);

    const safeMid = currentMid > 0 ? currentMid : (candlePrice || validCenterPrice || 100);
    const pMin = Number.isFinite(rawMin) && rawMin > 0 ? rawMin : safeMid * 0.98;
    const pMax = Number.isFinite(rawMax) && rawMax > pMin ? rawMax : safeMid * 1.02;
    const visibleSpread = Math.max(0.1, pMax - pMin);
    const pxPerDollar = Math.abs((height - headerH) / visibleSpread);

    // 3. Dynamic Price Step calculation (Strictly identical to COB ladder)
    const availableH = height - headerH;
    const targetRowCount = Math.max(14, Math.min(42, Math.floor(availableH / 19)));
    const targetStep = visibleSpread / targetRowCount;
    const inst = InstrumentRegistry.getInstrument(symbol, exchange as ExchangeId);
    const minTick = inst?.priceTick || (orderBook ? orderBook.getTickSize() : 0.01) || 0.01;

    const STANDARD_STEPS = [
      0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005,
      0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5,
      1.0, 2.0, 2.5, 5.0, 10.0, 20.0, 25.0, 50.0,
      100.0, 200.0, 250.0, 500.0, 1000.0, 2500.0, 5000.0,
    ];

    let rowStep = STANDARD_STEPS.find((s) => s >= targetStep && s >= minTick) || Math.ceil(targetStep);
    if (visibleSpread / rowStep > 45) {
      rowStep = STANDARD_STEPS.find((s) => visibleSpread / s <= 45 && s >= minTick) || rowStep * 2;
    }
    if (settings.ticksPerRow && settings.ticksPerRow > 1) {
      const customMinStep = minTick * settings.ticksPerRow;
      if (customMinStep > rowStep) {
        rowStep = STANDARD_STEPS.find((s) => s >= customMinStep) || customMinStep;
      }
    }
    const decimalPlaces = rowStep < 0.1 ? 2 : rowStep < 1 ? 1 : 0;

    // Retrieve metrics for this optimal row step
    const m = deltaProfileEngine.getMetrics(rowStep);

    if (!m || m.levels.length === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 11px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Accumulating Delta Flow...', profileWidth / 2, height / 2);
      ctx.restore();
      return;
    }

    // 4. Geometry Layout (COB Ladder Columns)
    const colPriceW = isMobile ? 42 : 50;
    const baselineX = colPriceW + 4; // Baseline where delta bars originate
    const maxBarWidth = profileWidth - baselineX - 42; // Margin for numbers and POC badge

    // Vertical baseline line separating Price column from Delta bars
    ctx.strokeStyle = settings.zeroLineColor || 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(baselineX, headerH);
    ctx.lineTo(baselineX, height);
    ctx.stroke();

    const maxAbsDelta = Math.max(0.001, m.maxAbsoluteDelta);
    const scaling = settings.scalingMode || 'normalized';
    const rowH = Math.max(12, Math.min(22, rowStep * pxPerDollar - 1));

    let pocY: number | null = null;

    // 5. Render Profile Rows (Aligned 1:1 with COB rows and Candlesticks)
    for (const level of m.levels) {
      const y = priceToY(level.price);
      if (y < headerH + 6 || y > height - 6) {
        continue;
      }

      const rowTop = y - rowH / 2;
      const absDelta = Math.abs(level.delta);
      const isHovered = hoveredLevel && Math.abs(hoveredLevel.price - level.price) < rowStep * 0.5;

      // Live Execution Hit Pulse Flash (Gold for buyer hit on asks, Cyan for seller hit on bids)
      const isHit = lastHit && (Date.now() - lastHit.timestamp < 650) && Math.abs(level.price - lastHit.price) <= rowStep * 0.55;
      if (isHit) {
        const fade = Math.max(0, 1 - (Date.now() - lastHit.timestamp) / 650);
        ctx.save();
        ctx.fillStyle = lastHit.side === 'buy'
          ? `rgba(255, 235, 59, ${0.40 * fade})`
          : `rgba(0, 229, 255, ${0.40 * fade})`;
        ctx.fillRect(0, rowTop, profileWidth, rowH);
        ctx.restore();
      }

      // Hover row background highlight
      if (isHovered) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fillRect(0, rowTop, profileWidth, rowH);
      }

      // 5.1 Left Column: Discrete Price Text (Integer for ETH/BTC, formatted like COB)
      const priceStr = decimalPlaces === 0 ? Math.round(level.price).toString() : level.price.toFixed(decimalPlaces);
      ctx.fillStyle = level.isPoc
        ? '#facc15'
        : isHovered
        ? '#ffffff'
        : '#94a3b8';
      ctx.font = level.isPoc
        ? 'bold 10px "JetBrains Mono", monospace'
        : '9.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(priceStr, 4, y);

      // Skip bar if below threshold
      if (absDelta < (settings.minDeltaThreshold || 0)) {
        continue;
      }

      // 5.2 Delta Bar Width Calculation
      let barW = 0;
      if (scaling === 'normalized') {
        barW = Math.max(3, (absDelta / maxAbsDelta) * maxBarWidth);
      } else {
        barW = Math.max(3, Math.min(maxBarWidth, (absDelta / (maxAbsDelta * 1.2)) * maxBarWidth));
      }

      const isPositive = level.delta > 0;
      const isZero = level.delta === 0;

      // Color selection matching institutional reference image
      if (isPositive) {
        ctx.fillStyle = settings.posColor || '#00e676'; // Vibrant green/teal
      } else if (isZero) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      } else {
        ctx.fillStyle = settings.negColor || '#ff2d55'; // Vibrant red
      }

      // Draw horizontal bar with crisp borders
      ctx.fillRect(baselineX, rowTop + 1, barW, rowH - 2);

      // POC highlight border
      if (level.isPoc) {
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(baselineX, rowTop + 1, barW, rowH - 2);
      } else {
        ctx.strokeStyle = isPositive ? 'rgba(0, 230, 118, 0.40)' : 'rgba(255, 45, 85, 0.40)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(baselineX, rowTop + 1, barW, rowH - 2);
      }

      // 5.3 Show Order Flow Delta Numbers on Bars (COB Ladder Style)
      if (settings.showNumbersOnBars !== false && absDelta > 0) {
        const deltaStr = formatDeltaQty(level.delta);
        ctx.font = 'bold 9.5px "JetBrains Mono", monospace';
        ctx.textBaseline = 'middle';

        if (barW >= 42) {
          // Inside bar near right end with crisp shadow for contrast against grey background
          ctx.save();
          ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
          ctx.shadowBlur = 2;
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'right';
          ctx.fillText(deltaStr, baselineX + barW - 4, y);
          ctx.restore();
        } else {
          // Immediately to the right of the bar in matched green/red
          ctx.fillStyle = isPositive ? (settings.posColor || '#00e676') : (settings.negColor || '#ff2d55');
          ctx.textAlign = 'left';
          ctx.fillText(deltaStr, baselineX + barW + 4, y);
        }
      }

      // Subtle row bottom divider
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, rowTop + rowH);
      ctx.lineTo(profileWidth, rowTop + rowH);
      ctx.stroke();

      // 5.4 Yellow Delta POC Marker Badge (Reference Image Exact Match)
      if (level.isPoc && settings.showPoc) {
        pocY = y;
        const badgeW = 36;
        const badgeH = 15;
        const badgeX = Math.min(profileWidth - badgeW - 3, baselineX + barW + (barW >= 42 ? 6 : 40));
        const badgeY = y - badgeH / 2;

        // Pointer triangle pointing left at the POC bar
        ctx.fillStyle = settings.pocColor || '#facc15';
        ctx.beginPath();
        ctx.moveTo(badgeX - 4, y);
        ctx.lineTo(badgeX, y - 3);
        ctx.lineTo(badgeX, y + 3);
        ctx.closePath();
        ctx.fill();

        // Rounded badge rectangle
        const r = 2.5;
        ctx.beginPath();
        ctx.moveTo(badgeX + r, badgeY);
        ctx.lineTo(badgeX + badgeW - r, badgeY);
        ctx.quadraticCurveTo(badgeX + badgeW, badgeY, badgeX + badgeW, badgeY + r);
        ctx.lineTo(badgeX + badgeW, badgeY + badgeH - r);
        ctx.quadraticCurveTo(badgeX + badgeW, badgeY + badgeH, badgeX + badgeW - r, badgeY + badgeH);
        ctx.lineTo(badgeX + r, badgeY + badgeH);
        ctx.quadraticCurveTo(badgeX, badgeY + badgeH, badgeX, badgeY + badgeH - r);
        ctx.lineTo(badgeX, badgeY + r);
        ctx.quadraticCurveTo(badgeX, badgeY, badgeX + r, badgeY);
        ctx.closePath();
        ctx.fill();

        // "POC" text inside badge in bold dark charcoal
        ctx.fillStyle = '#111113';
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('POC', badgeX + badgeW / 2, y);
      }

      // 5.5 Sleek Trapped Trader Badges (positioned cleanly beside bars without overlapping numbers)
      if (level.isTrappedBuyer && settings.showTrappedBuyers) {
        const offset = (level.isPoc ? 44 : 0) + (barW >= 42 ? 4 : 40);
        const tagX = Math.min(profileWidth - 68, baselineX + barW + offset + 4);
        const tagY = y - 7;
        ctx.save();
        ctx.fillStyle = 'rgba(0, 230, 118, 0.20)';
        ctx.strokeStyle = settings.posColor || '#00e676';
        ctx.lineWidth = 1;
        ctx.fillRect(tagX, tagY, 64, 14);
        ctx.strokeRect(tagX, tagY, 64, 14);
        ctx.fillStyle = settings.posColor || '#00e676';
        ctx.font = 'bold 8px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('▲ TRAP BUY', tagX + 32, y);
        ctx.restore();
      }

      if (level.isTrappedSeller && settings.showTrappedSellers) {
        const offset = (level.isPoc ? 44 : 0) + (barW >= 42 ? 4 : 40);
        const tagX = Math.min(profileWidth - 68, baselineX + barW + offset + 4);
        const tagY = y - 7;
        ctx.save();
        ctx.fillStyle = 'rgba(255, 45, 85, 0.20)';
        ctx.strokeStyle = settings.negColor || '#ff2d55';
        ctx.lineWidth = 1;
        ctx.fillRect(tagX, tagY, 64, 14);
        ctx.strokeRect(tagX, tagY, 64, 14);
        ctx.fillStyle = settings.negColor || '#ff2d55';
        ctx.font = 'bold 8px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('▼ TRAP SELL', tagX + 32, y);
        ctx.restore();
      }
    }

    // 6. Live Execution Price Tracker Line (Dashed cyan line tracking market price, exactly like COB)
    const directMidY = series.priceToCoordinate(livePrice);
    const midY = directMidY !== null && Number.isFinite(directMidY) ? directMidY : priceToY(livePrice);
    if (midY >= headerH && midY <= height - 4) {
      ctx.save();
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.moveTo(baselineX, midY);
      ctx.lineTo(profileWidth - 2, midY);
      ctx.stroke();
      ctx.restore();
    }

    // 7. Header Bar: Exactly 26px matching COB (Orders/Cumulative) header (Neutral Matte Dark Grey)
    ctx.fillStyle = 'rgba(32, 32, 36, 0.98)';
    ctx.fillRect(0, 0, profileWidth, headerH);

    // Horizontal line below header at y = 26 (seamless with COB header line)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, headerH);
    ctx.lineTo(profileWidth, headerH);
    ctx.stroke();

    // Header Content (vertically centered at y = headerH / 2 - 2)
    const headerMidY = headerH / 2 - 2;

    // Title: DELTA PROFILE
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 9.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('DELTA PROFILE', 6, headerMidY);

    // Mode Pill: VIS
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 8px "JetBrains Mono", monospace';
    const modeTag = settings.rangeMode === 'visible' ? 'VIS' : settings.rangeMode === 'session' ? 'SES' : settings.rangeMode.toUpperCase().slice(0, 3);
    ctx.fillText(modeTag, 84, headerMidY);

    // Net Delta (Single plus sign!)
    const netFormatted = formatDeltaQty(m.netDelta);
    ctx.font = 'bold 9.5px "JetBrains Mono", monospace';
    ctx.fillStyle = m.netDelta >= 0 ? (settings.posColor || '#00e676') : (settings.negColor || '#ff2d55');
    ctx.fillText(`Δ ${netFormatted}`, 108, headerMidY);

    // Delta POC Price in Header (Yellow, before button area)
    if (m.deltaPoc && profileWidth >= 210) {
      const pocStr = decimalPlaces === 0 ? Math.round(m.deltaPoc.price).toString() : m.deltaPoc.price.toFixed(decimalPlaces);
      ctx.fillStyle = settings.pocColor || '#facc15';
      ctx.font = 'bold 8.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`POC ${pocStr}`, 154, headerMidY);
    }

    // Imbalance Meter Bar directly under header (at y = headerH - 3, exactly matching COB!)
    const totalVisVol = (m.totalBuyVolume + m.totalSellVolume) || 1;
    const buyPct = Math.round((m.totalBuyVolume / totalVisVol) * 100);
    const sellPct = 100 - buyPct;
    ctx.fillStyle = settings.posColor || '#00e676';
    ctx.fillRect(0, headerH - 3, profileWidth * (buyPct / 100), 3);
    ctx.fillStyle = settings.negColor || '#ff2d55';
    ctx.fillRect(profileWidth * (buyPct / 100), headerH - 3, profileWidth * (sellPct / 100), 3);

    ctx.restore();
  }, [
    chart,
    series,
    width,
    height,
    settings,
    profileWidth,
    deltaProfileEngine,
    orderBook,
    symbol,
    exchange,
    candles,
    hoveredLevel,
  ]);

  // Request Animation Frame loop (matching COB at solid 30 FPS with active hit pulse decay)
  useEffect(() => {
    let active = true;
    let lastRenderTime = 0;

    const loop = () => {
      if (!active) return;
      const now = performance.now();
      const lastHit = deltaProfileEngine.getLastTradeHit() || (orderBook ? orderBook.getLastTradeHit() : null);
      const hasActiveHit = lastHit && (Date.now() - lastHit.timestamp < 700);

      if (isDirtyRef.current || hasActiveHit) {
        if (now - lastRenderTime >= 32) {
          lastRenderTime = now;
          render();
          isDirtyRef.current = false;
        }
      }
      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      active = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [render, deltaProfileEngine, orderBook]);

  // Mouse Move for Tooltip Inspection
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!series) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const my = e.clientY - rect.top;
    const mx = e.clientX - rect.left;

    const m = deltaProfileEngine.getMetrics();
    if (!m || m.levels.length === 0) return;

    try {
      const priceAtY = series.coordinateToPrice(my);
      if (priceAtY !== null && Number.isFinite(priceAtY)) {
        let closest: DeltaPriceLevel | null = null;
        let minDist = Infinity;
        for (const l of m.levels) {
          const d = Math.abs(l.price - priceAtY);
          if (d < minDist) {
            minDist = d;
            closest = l;
          }
        }
        if (closest && minDist <= (m.stepPrice * 1.5 || 2.0)) {
          setHoveredLevel(closest);
          setHoverPos({ x: mx, y: my });
          isDirtyRef.current = true;
          return;
        }
      }
    } catch {}

    if (hoveredLevel) {
      setHoveredLevel(null);
      setHoverPos(null);
      isDirtyRef.current = true;
    }
  };

  const handleMouseLeave = () => {
    setHoveredLevel(null);
    setHoverPos(null);
    isDirtyRef.current = true;
  };

  if (!settings.enabled) return null;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        position: 'absolute',
        top: 0,
        right: `${rightOffset}px`,
        width: `${profileWidth}px`,
        height: `${height}px`,
        zIndex: 11,
        cursor: 'crosshair',
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

      {/* Top Controls Overlay: Settings & Close (neatly integrated in 26px header) */}
      <div
        style={{
          position: 'absolute',
          top: 3,
          right: 4,
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          zIndex: 12,
        }}
      >
        {onOpenSettings && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenSettings();
            }}
            title="Delta Profile Settings"
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.10)',
              borderRadius: 3,
              color: '#94a3b8',
              padding: '2px 4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#f8fafc')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
          >
            <Settings size={11} />
          </button>
        )}
        {onClose && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            title="Close Delta Profile"
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.10)',
              borderRadius: 3,
              color: '#94a3b8',
              padding: '2px 4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#ff2d55')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
          >
            <X size={11} />
          </button>
        )}
      </div>

      {/* Interactive Floating Hover Tooltip */}
      {hoveredLevel && hoverPos && (
        <div
          style={{
            position: 'absolute',
            left: Math.max(8, hoverPos.x - 210),
            top: Math.max(34, Math.min(height - 180, hoverPos.y - 70)),
            width: 200,
            background: 'rgba(24, 24, 28, 0.98)',
            border: `1px solid ${hoveredLevel.delta >= 0 ? settings.posColor || '#00e676' : settings.negColor || '#ff2d55'}`,
            borderRadius: 6,
            padding: '8px 10px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.85)',
            color: '#f8fafc',
            fontFamily: '"JetBrains Mono", monospace, sans-serif',
            fontSize: 10,
            pointerEvents: 'none',
            zIndex: 20,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, borderBottom: '1px solid rgba(255, 255, 255, 0.10)', paddingBottom: 4 }}>
            <span style={{ fontWeight: 700, fontSize: 11, color: '#f1f5f9' }}>
              ${hoveredLevel.price.toFixed(2)}
            </span>
            {hoveredLevel.isPoc && (
              <span style={{ background: '#facc15', color: '#000', fontSize: 9, fontWeight: 800, padding: '1px 4px', borderRadius: 2 }}>
                DELTA POC
              </span>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ color: '#94a3b8' }}>Net Delta:</span>
            <span style={{ fontWeight: 700, color: hoveredLevel.delta >= 0 ? (settings.posColor || '#00e676') : (settings.negColor || '#ff2d55') }}>
              {formatDeltaQty(hoveredLevel.delta)} ({hoveredLevel.deltaPercent}%)
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={{ color: '#94a3b8' }}>Buy Vol (Ask):</span>
            <span style={{ color: '#00e676' }}>{hoveredLevel.buyVolume.toLocaleString()}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={{ color: '#94a3b8' }}>Sell Vol (Bid):</span>
            <span style={{ color: '#ff2d55' }}>{hoveredLevel.sellVolume.toLocaleString()}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={{ color: '#94a3b8' }}>Total Volume:</span>
            <span style={{ color: '#f8fafc' }}>{hoveredLevel.totalVolume.toLocaleString()}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={{ color: '#94a3b8' }}>Trades:</span>
            <span style={{ color: '#cbd5e1' }}>{hoveredLevel.tradeCount}</span>
          </div>

          {metrics && metrics.maxAbsoluteDelta > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ color: '#94a3b8' }}>Profile Share:</span>
              <span style={{ color: '#38bdf8' }}>
                {Math.round((Math.abs(hoveredLevel.delta) / metrics.maxAbsoluteDelta) * 1000) / 10}%
              </span>
            </div>
          )}

          {hoveredLevel.isTrappedBuyer && (
            <div style={{ marginTop: 4, padding: '2px 4px', background: 'rgba(0, 230, 118, 0.15)', borderRadius: 2, color: '#00e676', fontWeight: 700, fontSize: 9 }}>
              ⚠️ POTENTIAL TRAPPED BUYERS
            </div>
          )}

          {hoveredLevel.isTrappedSeller && (
            <div style={{ marginTop: 4, padding: '2px 4px', background: 'rgba(255, 45, 85, 0.15)', borderRadius: 2, color: '#ff2d55', fontWeight: 700, fontSize: 9 }}>
              ⚠️ POTENTIAL TRAPPED SELLERS
            </div>
          )}
        </div>
      )}
    </div>
  );
};
