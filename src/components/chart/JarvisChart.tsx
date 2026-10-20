/**
 * Core Jarvis Terminal Chart Component
 * Pairs Lightweight Charts (for candlesticks & scales) with high-speed Canvas overlays
 * JARVIS HEATMAP TERMINAL
 */

import React, { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  ColorType,
  CrosshairMode,
  CandlestickData,
  UTCTimestamp,
  CandlestickSeries,
} from 'lightweight-charts';
import { HeatmapCanvas } from './HeatmapCanvas';
import { TradeBubblesCanvas } from './TradeBubblesCanvas';
import { DepthProfileCanvas } from './DepthProfileCanvas';
import { FootprintCanvas } from './FootprintCanvas';
import { BottomVolumeDeltaPanel } from './BottomVolumeDeltaPanel';
import { SideVolumeProfileCanvas } from './SideVolumeProfileCanvas';
import { CrosshairOverlay } from './CrosshairOverlay';
import { ChartHeaderOverlay } from './ChartHeaderOverlay';
import { CandleCountdownMarker } from './CandleCountdownMarker';
import { HeatmapEngine } from '../../services/heatmap/HeatmapEngine';
import { OrderBookManager } from '../../services/orderbook/OrderBookManager';
import { TradeBubbleManager } from '../../services/bubbles/TradeBubbleManager';
import { LiquidityShiftDetector } from '../../services/heatmap/LiquidityShiftDetector';
import { ColorMapEngine } from '../../services/heatmap/ColorMap';
import { FootprintEngine } from '../../services/footprint/FootprintEngine';
import { Candle } from '../../types/market';
import { TerminalPreferences } from '../../types/settings';
import { LiquidityZone, TradeBubble } from '../../types/heatmap';
import { FootprintDebugInfo } from '../../types/footprint';

export interface JarvisChartHandles {
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  jumpToLatest: () => void;
  clearChart: () => void;
  updateCandles: (candles: Candle[]) => void;
  updateLiveCandle: (candle: Candle) => void;
  updateTickPrice: (price: number, timestamp?: number) => void;
}

const TIMEFRAME_SECONDS: Record<string, number> = {
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

interface JarvisChartProps {
  preferences: TerminalPreferences;
  orderBook: OrderBookManager;
  heatmapEngine: HeatmapEngine;
  bubbleManager: TradeBubbleManager;
  shiftDetector: LiquidityShiftDetector;
  colorMapEngine: ColorMapEngine;
  footprintEngine: FootprintEngine;
  onUpdatePreferences?: (patch: Partial<TerminalPreferences>) => void;
  connectionState?: string;
  lastQuoteTime?: number;
}

export const JarvisChart = forwardRef<JarvisChartHandles, JarvisChartProps>(
  (
    {
      preferences,
      orderBook,
      heatmapEngine,
      bubbleManager,
      shiftDetector,
      colorMapEngine,
      footprintEngine,
      onUpdatePreferences,
      connectionState,
      lastQuoteTime,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const chartHostRef = useRef<HTMLDivElement | null>(null);
    const [chart, setChart] = useState<IChartApi | null>(null);
    const [series, setSeries] = useState<ISeriesApi<'Candlestick'> | null>(null);

    const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
    const [hoveredBubble, setHoveredBubble] = useState<{ bubble: TradeBubble | null; x: number; y: number }>({
      bubble: null,
      x: 0,
      y: 0,
    });
    const [hoveredZone, setHoveredZone] = useState<{ zone: LiquidityZone | null; x: number; y: number }>({
      zone: null,
      x: 0,
      y: 0,
    });
    const [hoveredFootprintDebug, setHoveredFootprintDebug] = useState<{
      debug: FootprintDebugInfo | null;
      x: number;
      y: number;
    }>({
      debug: null,
      x: 0,
      y: 0,
    });

    const currentCandleRef = useRef<CandlestickData | null>(null);
    const allCandlesRef = useRef<Candle[]>([]);
    const visibleBubblesCoordsRef = useRef<
      Array<{ bubble: TradeBubble; cx: number; cy: number; radius: number }>
    >([]);

    // 1. Initialize Lightweight Chart
    useEffect(() => {
      if (!chartHostRef.current || !containerRef.current) return;

      const clientWidth = chartHostRef.current.clientWidth || containerRef.current?.clientWidth || 0;
      const clientHeight = chartHostRef.current.clientHeight || containerRef.current?.clientHeight || 0;
      setDimensions({ width: clientWidth, height: clientHeight });

      const tvChart = createChart(chartHostRef.current, {
        width: clientWidth,
        height: clientHeight,
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#787b86',
          fontSize: 11,
          fontFamily: "'JetBrains Mono', 'Inter', -apple-system, sans-serif",
        },
        localization: {
          priceFormatter: (price: number) => price.toFixed(2),
          dateFormat: 'dd/MM/yyyy',
          timeFormatter: (timestamp: number) => {
            const date = new Date(timestamp * 1000);
            return (
              new Intl.DateTimeFormat('en-IN', {
                timeZone: 'Asia/Kolkata',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
              }).format(date) + ' IST'
            );
          },
        },
        grid: {
          vertLines: { color: 'rgba(255, 255, 255, 0.025)' },
          horzLines: { color: 'rgba(255, 255, 255, 0.025)' },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: {
            color: 'rgba(0, 180, 216, 0.35)',
            width: 1,
            style: 2, // dashed
          },
          horzLine: {
            color: 'rgba(0, 180, 216, 0.35)',
            width: 1,
            style: 2,
          },
        },
        rightPriceScale: {
          borderColor: 'rgba(255, 255, 255, 0.07)',
          scaleMargins: {
            top: 0.12,
            bottom: 0.12,
          },
          autoScale: true,
          minimumWidth: 65,
        },
        timeScale: {
          borderColor: 'rgba(255, 255, 255, 0.07)',
          timeVisible: true,
          secondsVisible: false,
          shiftVisibleRangeOnNewBar: true,
          minBarSpacing: 0.5,
          tickMarkFormatter: (time: any) => {
            const sec = typeof time === 'number' ? time : (time.timestamp || time);
            const date = new Date(sec * 1000);
            return new Intl.DateTimeFormat('en-IN', {
              timeZone: 'Asia/Kolkata',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            }).format(date);
          },
        },
        handleScroll: {
          mouseWheel: false,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: false,
        },
        handleScale: {
          axisPressedMouseMove: {
            time: true,
            price: true,
          },
          axisDoubleClickReset: {
            time: true,
            price: true,
          },
          mouseWheel: true,
          pinch: true,
        },
      });

      const candleSeries = tvChart.addSeries(CandlestickSeries, {
        upColor: '#00e676',
        downColor: '#ff2d55',
        borderVisible: true,
        borderUpColor: '#00c853',
        borderDownColor: '#d50000',
        wickUpColor: '#00e676',
        wickDownColor: '#ff2d55',
        visible: preferences.showCandles,
        priceLineVisible: preferences.showCurrentPriceLine,
        lastValueVisible: true,
      });

      setChart(tvChart);
      setSeries(candleSeries);

      // Resize Observer
      const resizeObserver = new ResizeObserver((entries) => {
        if (!entries || entries.length === 0) return;
        const { width, height } = entries[0].contentRect;
        if (width > 0 && height > 0) {
          tvChart.applyOptions({ width, height });
          setDimensions({ width, height });
        }
      });

      resizeObserver.observe(containerRef.current);

      return () => {
        resizeObserver.disconnect();
        tvChart.remove();
      };
    }, []);

    const isFootprintActive = preferences.showFootprint && preferences.footprint?.enabled !== false;

    const hasInitializedViewRef = useRef<boolean>(false);
    const lastSymbolTimeframeRef = useRef<string>(`${preferences.symbol}_${preferences.timeframe}`);

    useEffect(() => {
      const key = `${preferences.symbol}_${preferences.timeframe}`;
      if (lastSymbolTimeframeRef.current !== key) {
        lastSymbolTimeframeRef.current = key;
        hasInitializedViewRef.current = false;
      }
    }, [preferences.symbol, preferences.timeframe]);

    // Dynamic bar spacing & right margin: 72px for Footprint bid x ask stack, 12px for standard candlesticks
    const prevFootprintActiveRef = useRef<boolean>(isFootprintActive);
    useEffect(() => {
      if (!chart) return;
      const targetSpacing = isFootprintActive ? 72 : 12;
      const isCob = preferences.showDepthProfile && preferences.depthProfile?.enabled !== false;
      const cobW = isCob ? (preferences.depthProfile?.widthPx || 220) : 0;
      const rightOffset = isCob ? Math.ceil(cobW / targetSpacing) + 2 : (isFootprintActive ? 3 : 6);
      chart.timeScale().applyOptions({
        barSpacing: targetSpacing,
        minBarSpacing: 0.5,
        rightOffset,
      });

      // When switching between Footprint and standard candles, adjust visible logical range
      // so standard candles are framed comfortably (~75 bars) and never look distant or stretched
      if (prevFootprintActiveRef.current !== isFootprintActive) {
        prevFootprintActiveRef.current = isFootprintActive;
        const totalBars = allCandlesRef.current.length;
        if (totalBars > 0) {
          if (isFootprintActive) {
            chart.timeScale().setVisibleLogicalRange({
              from: Math.max(0, totalBars - 16),
              to: totalBars + 2,
            });
          } else {
            chart.timeScale().setVisibleLogicalRange({
              from: Math.max(0, totalBars - 75),
              to: totalBars + rightOffset,
            });
          }
        }
      } else if (preferences.autoScrollToLatest) {
        chart.timeScale().scrollToRealTime();
      }
    }, [chart, isFootprintActive, preferences.showDepthProfile, preferences.depthProfile?.widthPx, preferences.depthProfile?.enabled, preferences.autoScrollToLatest]);

    const lastPriceLineColorRef = useRef<string>('#00e676');

    const syncPriceLineColor = useCallback((color: string) => {
      if (!series || lastPriceLineColorRef.current === color) return;
      lastPriceLineColorRef.current = color;
      series.applyOptions({ priceLineColor: color });
    }, [series]);

    // 2. Sync visibility options with preferences (keep series active so price scale & coordinate conversions never break)
    useEffect(() => {
      if (series) {
        const curColor = lastPriceLineColorRef.current || '#00e676';
        if (isFootprintActive) {
          // In Footprint mode, FootprintCanvas renders custom crisp wicks & outlines with internal bid x ask ladder
          series.applyOptions({
            visible: true,
            upColor: 'transparent',
            downColor: 'transparent',
            borderVisible: false,
            borderUpColor: 'transparent',
            borderDownColor: 'transparent',
            wickUpColor: 'transparent',
            wickDownColor: 'transparent',
            priceLineVisible: preferences.showCurrentPriceLine !== false,
            priceLineColor: curColor,
            priceLineWidth: 1,
            priceLineStyle: 2,
            lastValueVisible: true,
          });
        } else {
          // Standard candlestick mode (Works universally for Candles, Heatmap, Bubbles, DOM)
          const candlesVisible = preferences.showCandles !== false;
          series.applyOptions({
            visible: candlesVisible,
            upColor: '#00e676',
            downColor: '#ff2d55',
            borderVisible: true,
            borderUpColor: '#00c853',
            borderDownColor: '#d50000',
            wickUpColor: '#00e676',
            wickDownColor: '#ff2d55',
            priceLineVisible: preferences.showCurrentPriceLine !== false,
            priceLineColor: curColor,
            priceLineWidth: 1,
            priceLineStyle: 2,
            lastValueVisible: true,
          });
        }
      }
    }, [series, preferences.showCandles, preferences.showCurrentPriceLine, isFootprintActive]);

    // Reset current candle on timeframe or symbol change
    useEffect(() => {
      currentCandleRef.current = null;
    }, [preferences.timeframe, preferences.symbol]);

    // 3. Expose chart manipulation methods to parent
    useImperativeHandle(ref, () => ({
      zoomIn: () => {
        if (!chart) return;
        const logicalRange = chart.timeScale().getVisibleLogicalRange();
        if (logicalRange) {
          const delta = (logicalRange.to - logicalRange.from) * 0.2;
          chart.timeScale().setVisibleLogicalRange({
            from: logicalRange.from + delta,
            to: logicalRange.to - delta,
          });
        }
      },
      zoomOut: () => {
        if (!chart) return;
        const logicalRange = chart.timeScale().getVisibleLogicalRange();
        if (logicalRange) {
          const delta = (logicalRange.to - logicalRange.from) * 0.25;
          chart.timeScale().setVisibleLogicalRange({
            from: logicalRange.from - delta,
            to: logicalRange.to + delta,
          });
        }
      },
      resetView: () => {
        if (!chart) return;
        if (series) {
          series.priceScale().applyOptions({ autoScale: true });
        }
        chart.timeScale().fitContent();
      },
      jumpToLatest: () => {
        if (!chart) return;
        const isCob = preferences.showDepthProfile && preferences.depthProfile?.enabled !== false;
        const cobW = isCob ? (preferences.depthProfile?.widthPx || 220) : 0;
        const isFp = isFootprintActive;
        const targetSpacing = isFp ? 72 : 14;
        const rightOffset = isCob ? Math.ceil(cobW / targetSpacing) + 2 : (isFp ? 3 : 6);
        chart.timeScale().applyOptions({ rightOffset, minBarSpacing: 0.5 });
        chart.timeScale().scrollToRealTime();
      },
      clearChart: () => {
        allCandlesRef.current = [];
        currentCandleRef.current = null;
        hasInitializedViewRef.current = false;
        if (series) {
          try {
            series.setData([]);
          } catch {}
        }
      },
      updateCandles: (candles: Candle[]) => {
        if (!series) return;
        if (!candles || candles.length === 0) {
          allCandlesRef.current = [];
          currentCandleRef.current = null;
          series.setData([]);
          return;
        }
        allCandlesRef.current = candles;

        // Clean out any contaminated, zero, negative, or outlier candles
        let cleanCandles: Candle[] = [];
        if (candles && candles.length > 0) {
          const valid = candles.filter((c) =>
            Number.isFinite(c.time) && c.time > 0 &&
            Number.isFinite(c.open) && c.open > 10 &&
            Number.isFinite(c.high) && c.high > 10 &&
            Number.isFinite(c.low) && c.low > 10 &&
            Number.isFinite(c.close) && c.close > 10 &&
            c.low <= c.high
          );
          if (valid.length > 0) {
            const sample = valid.slice(-50).map((c) => c.close).sort((a, b) => a - b);
            const medianPrice = sample[Math.floor(sample.length / 2)];
            if (medianPrice > 0) {
              cleanCandles = valid.filter((c) =>
                c.close >= medianPrice * 0.5 && c.close <= medianPrice * 2.0 &&
                c.low >= medianPrice * 0.5 && c.high <= medianPrice * 2.0 &&
                c.open >= medianPrice * 0.5 && c.open <= medianPrice * 2.0
              );
            }
          }
        }

        // Deduplicate and ensure strict ascending order by timestamp
        const sorted = [...cleanCandles].sort((a, b) => a.time - b.time);
        const tvData: CandlestickData[] = [];
        for (const c of sorted) {
          const t = c.time as UTCTimestamp;
          if (tvData.length === 0 || t > (tvData[tvData.length - 1].time as number)) {
            tvData.push({
              time: t,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
            });
          } else {
            const last = tvData[tvData.length - 1];
            last.high = Math.max(last.high, c.high);
            last.low = Math.min(last.low, c.low);
            last.close = c.close;
          }
        }

        series.setData(tvData);
        series.priceScale().applyOptions({ autoScale: true });

        if (tvData.length > 0) {
          const latest = tvData[tvData.length - 1];
          currentCandleRef.current = latest;
          const isUp = latest.close >= (latest.open ?? latest.close);
          syncPriceLineColor(isUp ? '#00e676' : '#ff2d55');

          // Set focused view range with breathing room on right for live order book
          if (chart) {
            const isCob = preferences.showDepthProfile && preferences.depthProfile?.enabled !== false;
            const cobW = isCob ? (preferences.depthProfile?.widthPx || 220) : 0;
            const isFp = isFootprintActive;
            const targetSpacing = isFp ? 72 : 14;
            const rightOffset = isCob ? Math.ceil(cobW / targetSpacing) + 2 : (isFp ? 3 : 6);

            // On initial view for symbol/timeframe, establish default baseline spacing.
            // On subsequent candle merges, preserve user's custom zoom level and do not limit zoom out!
            if (!hasInitializedViewRef.current) {
              chart.timeScale().applyOptions({
                rightOffset,
                barSpacing: targetSpacing,
                minBarSpacing: 0.5,
              });
              chart.timeScale().scrollToRealTime();
              hasInitializedViewRef.current = true;
            } else {
              chart.timeScale().applyOptions({
                rightOffset,
                minBarSpacing: 0.5,
              });
              if (preferences.autoScrollToLatest) {
                chart.timeScale().scrollToRealTime();
              }
            }
          }
        }
      },
      updateLiveCandle: (candle: Candle) => {
        if (!series || !candle) return;
        if (!Number.isFinite(candle.close) || candle.close <= 10) return;

        const barTime = candle.time as UTCTimestamp;
        const cur = currentCandleRef.current;
        const close = candle.close;
        const open = Number.isFinite(candle.open) && candle.open > 10 ? candle.open : close;
        let high = Number.isFinite(candle.high) && candle.high > 10 ? Math.max(candle.high, open, close) : Math.max(open, close);
        let low = Number.isFinite(candle.low) && candle.low > 10 ? Math.min(candle.low, open, close) : Math.min(open, close);

        // Stale timestamp guard: ignore past klines that arrive out of order
        if (cur && barTime < (cur.time as number)) {
          return;
        }

        // Discard rogue outlier ticks from wrong stream or cross-symbol contamination
        if (cur && cur.close > 10) {
          const ratio = close / cur.close;
          if (ratio > 1.35 || ratio < 0.65) {
            return;
          }
          const minAllowed = cur.close * 0.75;
          const maxAllowed = cur.close * 1.35;
          if (low < minAllowed) low = Math.min(open, close);
          if (high > maxAllowed) high = Math.max(open, close);
        }

        if (!cur || barTime > (cur.time as number)) {
          const newBar: CandlestickData = {
            time: barTime,
            open,
            high,
            low,
            close,
          };
          currentCandleRef.current = newBar;
          syncPriceLineColor(close >= open ? '#00e676' : '#ff2d55');
          try {
            series.update(newBar);
          } catch (e) {
            console.warn('[JarvisChart] updateLiveCandle newBar error:', e);
          }
          if (preferences.autoScrollToLatest && chart) {
            chart.timeScale().scrollToRealTime();
          }
        } else {
          // Kline update within active candle: High only expands up, Low only expands down
          const barOpen = cur.open ?? open;
          const kHigh = Math.max(cur.high, high, barOpen, close);
          const kLow = Math.min(cur.low, low, barOpen, close);
          const bar: CandlestickData = {
            time: cur.time,
            open: barOpen,
            high: kHigh,
            low: kLow,
            close,
          };
          currentCandleRef.current = bar;
          syncPriceLineColor(close >= barOpen ? '#00e676' : '#ff2d55');
          try {
            series.update(bar);
          } catch (e) {
            console.warn('[JarvisChart] updateLiveCandle activeBar error:', e);
          }
        }
      },
      updateTickPrice: (price: number, timestamp?: number) => {
        if (!series || !Number.isFinite(price) || price <= 10) return;
        const cur = currentCandleRef.current;

        // Discard cross-symbol outlier ticks
        if (cur && cur.close > 10) {
          const ratio = price / cur.close;
          if (ratio > 1.25 || ratio < 0.75) {
            return;
          }
        }

        const effectiveTimestamp = timestamp || Date.now();
        const tradeSec = Math.floor(effectiveTimestamp / 1000);
        const tfSec = TIMEFRAME_SECONDS[preferences.timeframe] || 60;
        const barTime = (Math.floor(tradeSec / tfSec) * tfSec) as UTCTimestamp;

        // Stale timestamp guard: ignore past ticks that arrive out of order
        if (cur && barTime < (cur.time as number)) {
          return;
        }

        if (!cur || barTime > (cur.time as number)) {
          // A new candle boundary has elapsed! Immediately open the new bar
          const newBar: CandlestickData = {
            time: barTime,
            open: price,
            high: price,
            low: price,
            close: price,
          };
          currentCandleRef.current = newBar;
          syncPriceLineColor('#00e676');
          try {
            series.update(newBar);
          } catch (e) {
            console.warn('[JarvisChart] updateTickPrice newBar error:', e);
          }
          if (preferences.autoScrollToLatest && chart) {
            chart.timeScale().scrollToRealTime();
          }
        } else {
          // Tick within active candle: High can only expand, Low can only decrease
          const barOpen = cur.open ?? price;
          const high = Math.max(cur.high, price, barOpen);
          const low = Math.min(cur.low, price, barOpen);
          const close = price;

          const updatedBar: CandlestickData = {
            time: cur.time,
            open: barOpen,
            high,
            low,
            close,
          };
          currentCandleRef.current = updatedBar;
          syncPriceLineColor(close >= barOpen ? '#00e676' : '#ff2d55');
          try {
            series.update(updatedBar);
          } catch (e) {
            console.warn('[JarvisChart] updateTickPrice activeBar error:', e);
          }
        }
      },
    }));

    const handleHoverBubble = useCallback((bubble: TradeBubble | null, x: number, y: number) => {
      setHoveredBubble({ bubble, x, y });
    }, []);

    const handleContainerMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
      // If mouse button is pressed (dragging/panning the chart), bypass hover hit-testing completely
      // to keep drag interactions buttery smooth at 120 FPS without React re-render lag
      if (e.buttons !== 0) {
        if (hoveredZone.zone !== null) setHoveredZone({ zone: null, x: 0, y: 0 });
        if (hoveredBubble.bubble !== null) setHoveredBubble({ bubble: null, x: 0, y: 0 });
        return;
      }

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const hit = bubbleManager.hitTest(mouseX, mouseY, visibleBubblesCoordsRef.current);
      if (hit) {
        handleHoverBubble(hit, e.clientX, e.clientY);
        setHoveredZone({ zone: null, x: 0, y: 0 });
        if (hoveredFootprintDebug.debug !== null) {
          setHoveredFootprintDebug({ debug: null, x: 0, y: 0 });
        }
      } else {
        if (hoveredBubble.bubble !== null) {
          handleHoverBubble(null, 0, 0);
        }

        // Section 13: Hover Hit-Test for Liquidity Zones
        let zoneHit = false;
        if (series && chart) {
          const mousePrice = series.coordinateToPrice(mouseY);
          const mouseTime = chart.timeScale().coordinateToTime(mouseX);
          const mouseTimeSec = typeof mouseTime === 'number' ? mouseTime : (mouseTime as any)?.timestamp;

          if (mousePrice !== null && mouseTimeSec !== undefined) {
            const hitZone = heatmapEngine.getZoneEngine().hitTest(mousePrice, mouseTimeSec * 1000);
            if (hitZone) {
              zoneHit = true;
              setHoveredZone({ zone: hitZone, x: e.clientX, y: e.clientY });
              if (hoveredFootprintDebug.debug !== null) {
                setHoveredFootprintDebug({ debug: null, x: 0, y: 0 });
              }
            } else if (hoveredZone.zone !== null) {
              setHoveredZone({ zone: null, x: 0, y: 0 });
            }

            // Section 14: Footprint Debug Inspection Tooltip
            if (!zoneHit && isFootprintActive && preferences.footprint.showDebugInspection) {
              const candle = footprintEngine.getCandleAtTime(mouseTimeSec);
              const bucketSize = footprintEngine.getBucketSize();
              if (candle && mousePrice >= (candle.low - bucketSize) && mousePrice <= (candle.high + bucketSize * 2)) {
                const level = footprintEngine.getLevelAtPrice(candle, mousePrice);
                if (level) {
                  const yTop = series.priceToCoordinate(level.price + bucketSize);
                  const yBottom = series.priceToCoordinate(level.price);
                  if (yTop !== null && yBottom !== null) {
                    const yCenter = (yTop + yBottom) / 2;
                    const debugInfo: FootprintDebugInfo = {
                      candleStart: candle.candleStart,
                      candleEnd: candle.candleEnd,
                      timeframe: candle.timeframe,
                      bucketPrice: level.price,
                      bucketSize,
                      bucketMin: level.price,
                      bucketMax: level.price + bucketSize,
                      mouseScreenY: mouseY,
                      calcScreenYTop: yTop,
                      calcScreenYBottom: yBottom,
                      calcScreenYCenter: yCenter,
                      yDisplacementDelta: mouseY - yCenter,
                      bidVolume: level.bidVolume,
                      askVolume: level.askVolume,
                      totalVolume: level.totalVolume,
                      delta: level.delta,
                      isPoc: !!level.isPoc,
                      pocPrice: candle.pocPrice,
                      isAskImbalance: !!level.isAskImbalance,
                      isBidImbalance: !!level.isBidImbalance,
                      sourceDataValidity: candle.isComplete ? 'Historical / Complete' : 'Live / Forming',
                    };
                    setHoveredFootprintDebug({ debug: debugInfo, x: e.clientX, y: e.clientY });
                  }
                } else if (hoveredFootprintDebug.debug !== null) {
                  setHoveredFootprintDebug({ debug: null, x: 0, y: 0 });
                }
              } else if (hoveredFootprintDebug.debug !== null) {
                setHoveredFootprintDebug({ debug: null, x: 0, y: 0 });
              }
            } else if (!zoneHit && hoveredFootprintDebug.debug !== null) {
              setHoveredFootprintDebug({ debug: null, x: 0, y: 0 });
            }
          } else {
            if (hoveredZone.zone !== null) {
              setHoveredZone({ zone: null, x: 0, y: 0 });
            }
            if (hoveredFootprintDebug.debug !== null) {
              setHoveredFootprintDebug({ debug: null, x: 0, y: 0 });
            }
          }
        }
      }
    };

    return (
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          background: '#080b11',
        }}
        onMouseMove={handleContainerMouseMove}
        onMouseLeave={() => {
          handleHoverBubble(null, 0, 0);
          setHoveredZone({ zone: null, x: 0, y: 0 });
          setHoveredFootprintDebug({ debug: null, x: 0, y: 0 });
        }}
        onDoubleClick={() => {
          if (series) {
            series.priceScale().applyOptions({ autoScale: true });
          }
          if (chart) {
            chart.timeScale().scrollToRealTime();
          }
        }}
      >
        {/* Layer 1: Heatmap Canvas in the background (zIndex: 1) */}
        {chart && series && dimensions.width > 0 && (preferences.showHeatmap || preferences.showBestBidAskLines) && (
          <HeatmapCanvas
            chart={chart}
            series={series}
            orderBook={orderBook}
            heatmapEngine={heatmapEngine}
            shiftDetector={shiftDetector}
            colorMapEngine={colorMapEngine}
            heatmapSettings={preferences.heatmap}
            showHeatmap={preferences.showHeatmap}
            showBestBidAsk={preferences.showBestBidAskLines}
            showDepthProfile={preferences.showDepthProfile && preferences.depthProfile?.enabled !== false}
            depthProfileWidth={preferences.depthProfile?.widthPx || 220}
            showCandles={preferences.showCandles}
            width={dimensions.width}
            height={dimensions.height}
          />
        )}

        {/* Layer 2: Candlestick Chart (Lightweight Charts) with transparent background (zIndex: 2) */}
        <div
          ref={chartHostRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: 2,
            pointerEvents: 'auto',
          }}
        />

        {/* Layer 2.5: Professional Order-Flow Footprint Ladder Canvas (zIndex: 5) */}
        {chart && series && dimensions.width > 0 && isFootprintActive && (
          <FootprintCanvas
            chart={chart}
            series={series}
            footprintEngine={footprintEngine}
            orderBook={orderBook}
            settings={preferences.footprint}
            width={dimensions.width}
            height={dimensions.height}
          />
        )}

        {/* Layer 3: Bookmap 3D Trade Bubbles (zIndex: 6 - Always on top of candlesticks & footprint) */}
        {chart && series && dimensions.width > 0 && preferences.showBubbles && (
          <TradeBubblesCanvas
            chart={chart}
            series={series}
            bubbleManager={bubbleManager}
            bubbleSettings={preferences.bubbles}
            showCandles={preferences.showCandles}
            width={dimensions.width}
            height={dimensions.height}
            onUpdateBubbleCoords={(coords) => {
              visibleBubblesCoordsRef.current = coords;
            }}
          />
        )}

        {/* Layer 3: Solid Blue Side Volume Profile at Price on LEFT (zIndex: 8, Image 2) */}
        {chart && series && dimensions.width > 0 && isFootprintActive && preferences.footprint.showSideProfile && (
          <SideVolumeProfileCanvas
            chart={chart}
            series={series}
            footprintEngine={footprintEngine}
            settings={preferences.footprint}
            width={dimensions.width}
            height={dimensions.height}
            side="left"
          />
        )}

        {/* Layer 4: Current Order Book (COB) + Volume Profile & Delta Profile on Right (zIndex: 10) */}
        {chart && series && dimensions.width > 0 && preferences.showDepthProfile && preferences.depthProfile?.enabled !== false && (
          <DepthProfileCanvas
            chart={chart}
            series={series}
            orderBook={orderBook}
            heatmapEngine={heatmapEngine}
            bubbleManager={bubbleManager}
            settings={preferences.depthProfile}
            width={dimensions.width}
            height={dimensions.height}
            candles={allCandlesRef.current}
          />
        )}

        {/* Layer 5: Bottom Volume & Candle Delta Histogram Panel (zIndex: 15) */}
        {chart && dimensions.width > 0 && isFootprintActive && preferences.footprint.showBottomPanel && (
          <BottomVolumeDeltaPanel
            chart={chart}
            footprintEngine={footprintEngine}
            settings={preferences.footprint}
            onUpdateSettings={(updated) => {
              if (onUpdatePreferences) {
                onUpdatePreferences({
                  footprint: { ...preferences.footprint, ...updated },
                });
              }
            }}
            width={dimensions.width}
          />
        )}

        {/* Layer 6: Authoritative Instrument Header & Market Session Overlay */}
        <ChartHeaderOverlay
          symbol={preferences.symbol}
          timeframe={preferences.timeframe}
          connectionState={connectionState || 'LIVE'}
          lastQuoteTime={lastQuoteTime || (allCandlesRef.current.length > 0 ? allCandlesRef.current[allCandlesRef.current.length - 1].time * 1000 : undefined)}
          showHeatmap={preferences.showHeatmap}
          showFootprint={preferences.showFootprint}
        />

        {/* Trade Bubble, Liquidity Zone & Footprint Debug Precision Tooltip */}
        <CrosshairOverlay
          hoveredBubble={hoveredBubble.bubble}
          hoveredZone={hoveredZone.zone}
          hoveredFootprintDebug={hoveredFootprintDebug.debug}
          cursorX={
            hoveredBubble.bubble
              ? hoveredBubble.x
              : hoveredZone.zone
              ? hoveredZone.x
              : hoveredFootprintDebug.x
          }
          cursorY={
            hoveredBubble.bubble
              ? hoveredBubble.y
              : hoveredZone.zone
              ? hoveredZone.y
              : hoveredFootprintDebug.y
          }
          symbol={preferences.symbol}
        />

        {/* Real-time Countdown Timer on the Price Marker for Active Candle Finish */}
        {chart && series && dimensions.width > 0 && (
          <CandleCountdownMarker
            chart={chart}
            series={series}
            timeframe={preferences.timeframe}
            currentCandleRef={currentCandleRef}
            width={dimensions.width}
            height={dimensions.height}
          />
        )}
      </div>
    );
  }
);
