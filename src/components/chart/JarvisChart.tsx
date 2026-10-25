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
  LineSeries,
  LineStyle,
} from 'lightweight-charts';
import { VwapEngine } from '../../services/indicators/VwapEngine';
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
  prependOlderCandles: (candles: Candle[]) => void;
  incrementalUpdateCandles: (candles: Candle[]) => void;
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
  candles?: Candle[];
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
  onLoadMoreHistory?: () => void;
}

const JarvisChartComponent = forwardRef<JarvisChartHandles, JarvisChartProps>(
  (
    {
      candles,
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
      onLoadMoreHistory,
    },
    ref
  ) => {
    const onLoadMoreHistoryRef = useRef(onLoadMoreHistory);
    onLoadMoreHistoryRef.current = onLoadMoreHistory;

    const containerRef = useRef<HTMLDivElement | null>(null);
    const chartHostRef = useRef<HTMLDivElement | null>(null);
    const [chart, setChart] = useState<IChartApi | null>(null);
    const [series, setSeries] = useState<ISeriesApi<'Candlestick'> | null>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
    const pendingCandlesRef = useRef<Candle[] | null>(null);

    const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
    const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);
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
    const prevSymbolRef = useRef<string>(preferences.symbol);
    const prevTimeframeRef = useRef<string>(preferences.timeframe);

    if (
      prevSymbolRef.current !== preferences.symbol ||
      prevTimeframeRef.current !== preferences.timeframe
    ) {
      prevSymbolRef.current = preferences.symbol;
      prevTimeframeRef.current = preferences.timeframe;
      currentCandleRef.current = null;
    }

    const allCandlesRef = useRef<Candle[]>([]);
    const lastAppliedCandlesKeyRef = useRef<string>('');
    const visibleBubblesCoordsRef = useRef<
      Array<{ bubble: TradeBubble; cx: number; cy: number; radius: number }>
    >([]);

    const vwapSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const upper1SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const lower1SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const upper2SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const lower2SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const hoveredCandleTimeRef = useRef<number | null>(null);
    const crosshairMarkerElRef = useRef<HTMLDivElement | null>(null);

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
                weekday: 'short',
                day: '2-digit',
                month: 'short',
                year: 'numeric',
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
            color: 'rgba(203, 213, 225, 0.45)',
            width: 1,
            style: 2, // dashed
            visible: true,
            labelVisible: true,
            labelBackgroundColor: '#1e222d',
          },
          horzLine: {
            color: 'rgba(203, 213, 225, 0.45)',
            width: 1,
            style: 2, // dashed
            visible: true,
            labelVisible: true,
            labelBackgroundColor: '#1e222d',
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
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: true,
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

      // VWAP Center Line and Standard Deviation Bands (SD 1 and SD 2)
      const vwapCfg = preferences.vwap;
      const isVwapActive = preferences.showVwap && vwapCfg?.enabled !== false;
      const bandStyle = VwapEngine.getLineStyle(vwapCfg?.bandsStyle);

      const vwapSeries = tvChart.addSeries(LineSeries, {
        color: vwapCfg?.vwapColor || '#ff9f1c',
        lineWidth: (vwapCfg?.lineWidth || 2) as any,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
        title: 'VWAP',
        visible: isVwapActive,
      });

      const upper1Series = tvChart.addSeries(LineSeries, {
        color: vwapCfg?.band1Color || '#38bdf8',
        lineWidth: 1,
        lineStyle: bandStyle,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        title: 'VWAP +1σ',
        visible: isVwapActive && vwapCfg?.showBands1 !== false,
      });

      const lower1Series = tvChart.addSeries(LineSeries, {
        color: vwapCfg?.band1Color || '#38bdf8',
        lineWidth: 1,
        lineStyle: bandStyle,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        title: 'VWAP -1σ',
        visible: isVwapActive && vwapCfg?.showBands1 !== false,
      });

      const upper2Series = tvChart.addSeries(LineSeries, {
        color: vwapCfg?.band2Color || '#a855f7',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        title: 'VWAP +2σ',
        visible: isVwapActive && vwapCfg?.showBands2 !== false,
      });

      const lower2Series = tvChart.addSeries(LineSeries, {
        color: vwapCfg?.band2Color || '#a855f7',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        title: 'VWAP -2σ',
        visible: isVwapActive && vwapCfg?.showBands2 !== false,
      });

      vwapSeriesRef.current = vwapSeries;
      upper1SeriesRef.current = upper1Series;
      lower1SeriesRef.current = lower1Series;
      upper2SeriesRef.current = upper2Series;
      lower2SeriesRef.current = lower2Series;

      chartRef.current = tvChart;
      seriesRef.current = candleSeries;
      setChart(tvChart);
      setSeries(candleSeries);

      // Immediately render any pending candles that arrived before the chart was mounted
      if (pendingCandlesRef.current && pendingCandlesRef.current.length > 0) {
        applyCandles(pendingCandlesRef.current, candleSeries, tvChart);
      }

      // Resize Observer
      const resizeObserver = new ResizeObserver((entries) => {
        if (!entries || entries.length === 0) return;
        const { width, height } = entries[0].contentRect;
        if (width > 0 && height > 0) {
          tvChart.applyOptions({ width, height });
          setDimensions({ width, height });
        }
      });

      // Infinite reverse scroll listener: when user scrolls near the earliest bar
      let lastRequestedTime = 0;
      const handleLogicalRangeChange = (range: { from: number; to: number } | null) => {
        if (!range || !onLoadMoreHistoryRef.current) return;
        if (range.from < 15 && Date.now() - lastRequestedTime > 1200) {
          lastRequestedTime = Date.now();
          onLoadMoreHistoryRef.current();
        }
      };
      // Crosshair move listener to inspect candle day, time, and OHLC with silky smooth 120 FPS performance
      const handleCrosshairMove = (param: any) => {
        // 1. Move TradingView-style (+) plus marker button smoothly along right price scale edge
        if (crosshairMarkerElRef.current) {
          if (param && param.point && typeof param.point.y === 'number' && param.point.y >= 0) {
            const chartW = chartHostRef.current?.clientWidth || dimensions.width;
            const xPos = Math.max(0, chartW - 65);
            crosshairMarkerElRef.current.style.opacity = '1';
            crosshairMarkerElRef.current.style.transform = `translate3d(${xPos}px, ${Math.round(param.point.y) - 10}px, 0)`;
          } else {
            crosshairMarkerElRef.current.style.opacity = '0';
          }
        }

        if (!param || !param.time) {
          if (hoveredCandleTimeRef.current !== null) {
            hoveredCandleTimeRef.current = null;
            setHoveredCandle(null);
          }
          return;
        }

        const t = typeof param.time === 'number' ? param.time : (param.time.timestamp || param.time);
        if (hoveredCandleTimeRef.current === t) {
          // Same candle: bypass React component re-rendering to keep crosshair moving at 120 FPS
          return;
        }
        hoveredCandleTimeRef.current = t;

        const data = param.seriesData?.get(candleSeries);
        if (data && typeof data.close === 'number') {
          setHoveredCandle({
            time: t,
            open: data.open,
            high: data.high,
            low: data.low,
            close: data.close,
            volume: data.volume || 0,
          });
        } else {
          const found = allCandlesRef.current.find((c) => c.time === t);
          if (found) {
            setHoveredCandle(found);
          } else {
            setHoveredCandle(null);
          }
        }
      };
      tvChart.subscribeCrosshairMove(handleCrosshairMove);

      return () => {
        tvChart.unsubscribeCrosshairMove(handleCrosshairMove);
        tvChart.timeScale().unsubscribeVisibleLogicalRangeChange(handleLogicalRangeChange);
        resizeObserver.disconnect();
        vwapSeriesRef.current = null;
        upper1SeriesRef.current = null;
        lower1SeriesRef.current = null;
        upper2SeriesRef.current = null;
        lower2SeriesRef.current = null;
        chartRef.current = null;
        seriesRef.current = null;
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
        allCandlesRef.current = [];
        currentCandleRef.current = null;
        if (series) {
          try {
            series.setData([]);
          } catch {}
        }
        vwapSeriesRef.current?.setData([]);
        upper1SeriesRef.current?.setData([]);
        lower1SeriesRef.current?.setData([]);
        upper2SeriesRef.current?.setData([]);
        lower2SeriesRef.current?.setData([]);
      }
    }, [preferences.symbol, preferences.timeframe, series]);

    // Dynamic bar spacing & right margin: 72px for Footprint bid x ask stack, 12px for standard candlesticks
    const prevFootprintActiveRef = useRef<boolean>(isFootprintActive);
    useEffect(() => {
      if (!chart) return;
      const targetSpacing = isFootprintActive ? 72 : 12;
      const isCob = preferences.showDepthProfile && preferences.depthProfile?.enabled !== false;
      const baseCobW = preferences.depthProfile?.widthPx || 220;
      const cobW = isCob ? (dimensions.width > 0 && dimensions.width < 600 ? Math.min(baseCobW, 140) : baseCobW) : 0;
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
      const activeSeries = seriesRef.current || series;
      if (!activeSeries || lastPriceLineColorRef.current === color) return;
      lastPriceLineColorRef.current = color;
      activeSeries.applyOptions({ priceLineColor: color });
    }, [series]);

    // 2. Sync visibility options with preferences (keep series active so price scale & coordinate conversions never break)
    useEffect(() => {
      const activeSeries = seriesRef.current || series;
      if (activeSeries) {
        const curColor = lastPriceLineColorRef.current || '#00e676';
        const isDedicatedFootprint = preferences.chartMode === 'footprint' || isFootprintActive;
        if (isDedicatedFootprint) {
          // When Footprint is active, FootprintCanvas renders custom crisp wicks & outlines with internal bid x ask ladder
          activeSeries.applyOptions({
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
          // Standard candlestick mode (Works universally for Candles, Heatmap, Bubbles, and DOM)
          const candlesVisible = preferences.showCandles !== false;
          activeSeries.applyOptions({
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
    }, [series, preferences.showCandles, preferences.showCurrentPriceLine, preferences.chartMode, isFootprintActive]);

    // Reset current candle on timeframe or symbol change
    useEffect(() => {
      currentCandleRef.current = null;
    }, [preferences.timeframe, preferences.symbol]);

    // 2.5. Synchronize Volume-Weighted Average Price (VWAP) and SD 1 & SD 2 Bands
    const refreshVwap = useCallback((candles: Candle[]) => {
      const vSeries = vwapSeriesRef.current;
      const u1Series = upper1SeriesRef.current;
      const l1Series = lower1SeriesRef.current;
      const u2Series = upper2SeriesRef.current;
      const l2Series = lower2SeriesRef.current;
      if (!vSeries || !u1Series || !l1Series || !u2Series || !l2Series) return;

      const isVwapActive = preferences.showVwap && preferences.vwap?.enabled !== false;
      if (!isVwapActive || !candles || candles.length === 0) {
        vSeries.applyOptions({ visible: false });
        u1Series.applyOptions({ visible: false });
        l1Series.applyOptions({ visible: false });
        u2Series.applyOptions({ visible: false });
        l2Series.applyOptions({ visible: false });
        return;
      }

      const vwapCfg = preferences.vwap;
      const bandStyle = VwapEngine.getLineStyle(vwapCfg.bandsStyle);

      vSeries.applyOptions({
        visible: true,
        color: vwapCfg.vwapColor || '#ff9f1c',
        lineWidth: (vwapCfg.lineWidth || 2) as any,
      });

      const showBands1 = vwapCfg.showBands1 !== false;
      u1Series.applyOptions({
        visible: showBands1,
        color: vwapCfg.band1Color || '#38bdf8',
        lineStyle: bandStyle,
      });
      l1Series.applyOptions({
        visible: showBands1,
        color: vwapCfg.band1Color || '#38bdf8',
        lineStyle: bandStyle,
      });

      const showBands2 = vwapCfg.showBands2 !== false;
      u2Series.applyOptions({
        visible: showBands2,
        color: vwapCfg.band2Color || '#a855f7',
        lineStyle: LineStyle.Dotted,
      });
      l2Series.applyOptions({
        visible: showBands2,
        color: vwapCfg.band2Color || '#a855f7',
        lineStyle: LineStyle.Dotted,
      });

      const vwapResult = VwapEngine.calculate(candles, vwapCfg);
      vSeries.setData(vwapResult.vwap);
      if (showBands1) {
        u1Series.setData(vwapResult.upper1);
        l1Series.setData(vwapResult.lower1);
      } else {
        u1Series.setData([]);
        l1Series.setData([]);
      }
      if (showBands2) {
        u2Series.setData(vwapResult.upper2);
        l2Series.setData(vwapResult.lower2);
      } else {
        u2Series.setData([]);
        l2Series.setData([]);
      }
    }, [preferences.showVwap, preferences.vwap]);

    useEffect(() => {
      refreshVwap(allCandlesRef.current);
    }, [refreshVwap]);

    // Core robust candle application logic
    const applyCandles = useCallback(
      (candlesToApply: Candle[], targetSeries?: ISeriesApi<'Candlestick'> | null, targetChart?: IChartApi | null) => {
        const activeSeries = targetSeries || seriesRef.current || series;
        const activeChart = targetChart || chartRef.current || chart;

        if (!candlesToApply || candlesToApply.length === 0) {
          allCandlesRef.current = [];
          pendingCandlesRef.current = null;
          currentCandleRef.current = null;
          if (activeSeries) {
            try {
              activeSeries.setData([]);
            } catch {}
          }
          refreshVwap([]);
          return;
        }

        allCandlesRef.current = candlesToApply;
        pendingCandlesRef.current = candlesToApply;

        if (!activeSeries) {
          // Series not mounted yet: will be rendered as soon as useEffect finishes
          return;
        }

        const tfSec = TIMEFRAME_SECONDS[preferences.timeframe] || 60;

        // Clean out any contaminated, zero, negative, or outlier candles, aligning to timeframe grid
        let cleanCandles: Candle[] = [];
        if (candlesToApply && candlesToApply.length > 0) {
          const valid = candlesToApply
            .filter((c) =>
              Number.isFinite(c.time) && c.time > 0 &&
              Number.isFinite(c.open) && c.open > 10 &&
              Number.isFinite(c.high) && c.high > 10 &&
              Number.isFinite(c.low) && c.low > 10 &&
              Number.isFinite(c.close) && c.close > 10 &&
              c.low <= c.high
            )
            .map((c) => ({
              ...c,
              time: (Math.floor(c.time / tfSec) * tfSec) as any,
            }));
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

        try {
          activeSeries.setData(tvData);
          activeSeries.priceScale().applyOptions({ autoScale: true });
        } catch (err) {
          console.warn('[JarvisChart] setData error, recovering:', err);
        }

        if (tvData.length > 0) {
          const latest = tvData[tvData.length - 1];
          // Preserve live tick price expansion if active bar is currently ticking
          if (currentCandleRef.current && currentCandleRef.current.time === latest.time) {
            latest.high = Math.max(latest.high, currentCandleRef.current.high);
            latest.low = Math.min(latest.low, currentCandleRef.current.low);
            latest.close = currentCandleRef.current.close;
          }
          currentCandleRef.current = latest;
          const isUp = latest.close >= (latest.open ?? latest.close);
          syncPriceLineColor(isUp ? '#00e676' : '#ff2d55');

          if (activeChart) {
            const isCob = preferences.showDepthProfile && preferences.depthProfile?.enabled !== false;
            const baseCobW = preferences.depthProfile?.widthPx || 220;
            const cobW = isCob ? (dimensions.width > 0 && dimensions.width < 600 ? Math.min(baseCobW, 140) : baseCobW) : 0;
            const isFp = isFootprintActive;
            const targetSpacing = isFp ? 72 : 14;
            const rightOffset = isCob ? Math.ceil(cobW / targetSpacing) + 2 : (isFp ? 3 : 6);

            activeChart.timeScale().applyOptions({
              rightOffset,
              barSpacing: targetSpacing,
              minBarSpacing: 0.5,
            });

            if (!hasInitializedViewRef.current) {
              const visibleCount = isFp ? 16 : 75;
              activeChart.timeScale().setVisibleLogicalRange({
                from: Math.max(0, tvData.length - visibleCount),
                to: tvData.length + rightOffset,
              });
              hasInitializedViewRef.current = true;
              if (preferences.autoScrollToLatest) {
                activeChart.timeScale().scrollToRealTime();
              }
            }
          }
        }

        refreshVwap(cleanCandles);
      },
      [
        chart,
        series,
        preferences.timeframe,
        preferences.showDepthProfile,
        preferences.depthProfile?.widthPx,
        preferences.depthProfile?.enabled,
        preferences.autoScrollToLatest,
        isFootprintActive,
        syncPriceLineColor,
        refreshVwap,
      ]
    );

    // Synchronize candles when passed directly via prop (ONLY if the dataset has actually changed)
    useEffect(() => {
      if (!candles || candles.length === 0) return;
      const firstT = candles[0]?.time ?? 0;
      const lastT = candles[candles.length - 1]?.time ?? 0;
      const key = `${preferences.exchange}_${preferences.symbol}_${preferences.timeframe}_${candles.length}_${firstT}_${lastT}`;
      if (lastAppliedCandlesKeyRef.current === key) {
        return;
      }
      lastAppliedCandlesKeyRef.current = key;
      applyCandles(candles);
    }, [candles, preferences.exchange, preferences.symbol, preferences.timeframe, applyCandles]);

    // 3. Expose chart manipulation methods to parent
    useImperativeHandle(ref, () => ({
      zoomIn: () => {
        const activeChart = chartRef.current || chart;
        if (!activeChart) return;
        const logicalRange = activeChart.timeScale().getVisibleLogicalRange();
        if (logicalRange) {
          const delta = (logicalRange.to - logicalRange.from) * 0.2;
          activeChart.timeScale().setVisibleLogicalRange({
            from: logicalRange.from + delta,
            to: logicalRange.to - delta,
          });
        }
      },
      zoomOut: () => {
        const activeChart = chartRef.current || chart;
        if (!activeChart) return;
        const logicalRange = activeChart.timeScale().getVisibleLogicalRange();
        if (logicalRange) {
          const delta = (logicalRange.to - logicalRange.from) * 0.25;
          activeChart.timeScale().setVisibleLogicalRange({
            from: logicalRange.from - delta,
            to: logicalRange.to + delta,
          });
        }
      },
      resetView: () => {
        const activeChart = chartRef.current || chart;
        const activeSeries = seriesRef.current || series;
        if (!activeChart) return;
        if (activeSeries) {
          activeSeries.priceScale().applyOptions({ autoScale: true });
        }
        activeChart.timeScale().fitContent();
      },
      jumpToLatest: () => {
        const activeChart = chartRef.current || chart;
        if (!activeChart) return;
        const isCob = preferences.showDepthProfile && preferences.depthProfile?.enabled !== false;
        const baseCobW = preferences.depthProfile?.widthPx || 220;
        const cobW = isCob ? (dimensions.width > 0 && dimensions.width < 600 ? Math.min(baseCobW, 140) : baseCobW) : 0;
        const isFp = isFootprintActive;
        const targetSpacing = isFp ? 72 : 14;
        const rightOffset = isCob ? Math.ceil(cobW / targetSpacing) + 2 : (isFp ? 3 : 6);
        activeChart.timeScale().applyOptions({ rightOffset, minBarSpacing: 0.5 });
        activeChart.timeScale().scrollToRealTime();
      },
      clearChart: () => {
        allCandlesRef.current = [];
        pendingCandlesRef.current = null;
        currentCandleRef.current = null;
        lastAppliedCandlesKeyRef.current = '';
        hasInitializedViewRef.current = false;
        const activeSeries = seriesRef.current || series;
        if (activeSeries) {
          try {
            activeSeries.setData([]);
          } catch {}
        }
        vwapSeriesRef.current?.setData([]);
        upper1SeriesRef.current?.setData([]);
        lower1SeriesRef.current?.setData([]);
        upper2SeriesRef.current?.setData([]);
        lower2SeriesRef.current?.setData([]);
      },
      updateCandles: (candlesToUpdate: Candle[]) => {
        if (candlesToUpdate && candlesToUpdate.length > 0) {
          const firstT = candlesToUpdate[0]?.time ?? 0;
          const lastT = candlesToUpdate[candlesToUpdate.length - 1]?.time ?? 0;
          lastAppliedCandlesKeyRef.current = `${preferences.exchange}_${preferences.symbol}_${preferences.timeframe}_${candlesToUpdate.length}_${firstT}_${lastT}`;
        }
        applyCandles(candlesToUpdate);
      },
      prependOlderCandles: (olderCandles: Candle[]) => {
        const activeSeries = seriesRef.current || series;
        const activeChart = chartRef.current || chart;
        if (!activeSeries || !activeChart || !olderCandles || olderCandles.length === 0) return;

        const currentBars = allCandlesRef.current;
        const oldestExistingTime = currentBars.length > 0 ? currentBars[0].time : Infinity;

        // Filter out any candles that overlap with existing data or are invalid
        const strictlyOlder = olderCandles.filter(
          (c) => Number.isFinite(c.time) && c.time < oldestExistingTime && Number.isFinite(c.close) && c.close > 0
        );

        if (strictlyOlder.length === 0) return;

        // Capture visible logical range before updating data
        const visibleRange = activeChart.timeScale().getVisibleLogicalRange();

        // Merge: older first, then current with strict ascending sort & deduplication
        const tfSec = TIMEFRAME_SECONDS[preferences.timeframe] || 60;
        const allBars = [...strictlyOlder, ...currentBars]
          .filter((c) => Number.isFinite(c.time) && c.time > 0 && Number.isFinite(c.close) && c.close > 0)
          .map((c) => ({
            ...c,
            time: (Math.floor(c.time / tfSec) * tfSec) as any,
          }))
          .sort((a, b) => a.time - b.time);

        const tvData: CandlestickData[] = [];
        const mergedCandles: Candle[] = [];

        for (const c of allBars) {
          const t = c.time as UTCTimestamp;
          if (tvData.length === 0 || (t as number) > (tvData[tvData.length - 1].time as number)) {
            tvData.push({
              time: t,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
            });
            mergedCandles.push(c);
          } else {
            const lastTv = tvData[tvData.length - 1];
            const lastMerged = mergedCandles[mergedCandles.length - 1];
            lastTv.high = Math.max(lastTv.high, c.high);
            lastTv.low = Math.min(lastTv.low, c.low);
            lastTv.close = c.close;
            lastMerged.high = lastTv.high;
            lastMerged.low = lastTv.low;
            lastMerged.close = c.close;
          }
        }

        allCandlesRef.current = mergedCandles;

        try {
          activeSeries.setData(tvData);
        } catch (e) {
          console.warn('[JarvisChart] prepend setData error:', e);
        }

        // Restore view offset so user feels zero jump
        if (visibleRange) {
          const shift = strictlyOlder.length;
          activeChart.timeScale().setVisibleLogicalRange({
            from: visibleRange.from + shift,
            to: visibleRange.to + shift,
          });
        }

        refreshVwap(mergedCandles);
      },
      incrementalUpdateCandles: (candlesToUpdate: Candle[]) => {
        const activeSeries = seriesRef.current || series;
        if (!activeSeries || !candlesToUpdate || candlesToUpdate.length === 0) return;
        const tfSec = TIMEFRAME_SECONDS[preferences.timeframe] || 60;

        for (const c of candlesToUpdate) {
          if (!Number.isFinite(c.close) || c.close <= 10) continue;
          const barTime = (Math.floor(c.time / tfSec) * tfSec) as UTCTimestamp;
          let cur = currentCandleRef.current;
          if (cur && barTime < (cur.time as number)) continue;

          const close = c.close;
          const open = Number.isFinite(c.open) && c.open > 10 ? c.open : close;
          const high = Number.isFinite(c.high) && c.high > 10 ? Math.max(c.high, open, close) : Math.max(open, close);
          const low = Number.isFinite(c.low) && c.low > 10 ? Math.min(c.low, open, close) : Math.min(open, close);

          if (!cur || barTime > (cur.time as number)) {
            const newBar: CandlestickData = { time: barTime, open, high, low, close };
            currentCandleRef.current = newBar;
            if (allCandlesRef.current.length > 0) {
              const lastCandle = allCandlesRef.current[allCandlesRef.current.length - 1];
              if (lastCandle.time === barTime) {
                lastCandle.high = Math.max(lastCandle.high, high);
                lastCandle.low = Math.min(lastCandle.low, low);
                lastCandle.close = close;
              } else if (lastCandle.time < barTime) {
                allCandlesRef.current.push({ time: barTime, open, high, low, close, volume: c.volume || 0 });
              }
            }
            const isUp = close >= open;
            syncPriceLineColor(isUp ? '#00e676' : '#ff2d55');
            try {
              activeSeries.update(newBar);
            } catch (e) {
              console.warn('[JarvisChart] incrementalUpdateCandles newBar error:', e);
            }
          } else {
            const barOpen = cur.open ?? open;
            const kHigh = Math.max(cur.high, high, barOpen, close);
            const kLow = Math.min(cur.low, low, barOpen, close);
            const bar: CandlestickData = { time: cur.time, open: barOpen, high: kHigh, low: kLow, close };
            currentCandleRef.current = bar;
            if (allCandlesRef.current.length > 0) {
              const lastCandle = allCandlesRef.current[allCandlesRef.current.length - 1];
              if (lastCandle.time === cur.time) {
                lastCandle.high = kHigh;
                lastCandle.low = kLow;
                lastCandle.close = close;
              }
            }
            const isUp = close >= barOpen;
            syncPriceLineColor(isUp ? '#00e676' : '#ff2d55');
            try {
              activeSeries.update(bar);
            } catch (e) {
              console.warn('[JarvisChart] incrementalUpdateCandles update error:', e);
            }
          }
        }
      },
      updateLiveCandle: (candle: Candle) => {
        const activeSeries = seriesRef.current || series;
        if (!activeSeries || !candle) return;
        if (!Number.isFinite(candle.close) || candle.close <= 10) return;

        const tfSec = TIMEFRAME_SECONDS[preferences.timeframe] || 60;
        const barTime = (Math.floor(candle.time / tfSec) * tfSec) as UTCTimestamp;
        let cur = currentCandleRef.current;

        if (!cur && allCandlesRef.current.length > 0) {
          const lastC = allCandlesRef.current[allCandlesRef.current.length - 1];
          cur = {
            time: lastC.time as UTCTimestamp,
            open: lastC.open,
            high: lastC.high,
            low: lastC.low,
            close: lastC.close,
          };
          currentCandleRef.current = cur;
        }

        const close = candle.close;
        const open = Number.isFinite(candle.open) && candle.open > 10 ? candle.open : close;
        let high = Number.isFinite(candle.high) && candle.high > 10 ? Math.max(candle.high, open, close) : Math.max(open, close);
        let low = Number.isFinite(candle.low) && candle.low > 10 ? Math.min(candle.low, open, close) : Math.min(open, close);

        // Stale timestamp guard: only ignore past klines that are genuinely older than 2 full bars
        if (cur && barTime < (cur.time as number) - 2 * tfSec) {
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
          if (allCandlesRef.current.length > 0) {
            const lastCandle = allCandlesRef.current[allCandlesRef.current.length - 1];
            if (lastCandle.time === barTime) {
              lastCandle.high = Math.max(lastCandle.high, high);
              lastCandle.low = Math.min(lastCandle.low, low);
              lastCandle.close = close;
            } else if (lastCandle.time < barTime) {
              allCandlesRef.current.push({
                time: barTime,
                open,
                high,
                low,
                close,
                volume: candle.volume || 0,
              });
            }
          }
          const isUp = close >= open;
          syncPriceLineColor(isUp ? '#00e676' : '#ff2d55');
          try {
            activeSeries.update(newBar);
          } catch (e) {
            console.warn('[JarvisChart] updateLiveCandle newBar error:', e);
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
          if (allCandlesRef.current.length > 0) {
            const lastCandle = allCandlesRef.current[allCandlesRef.current.length - 1];
            if (lastCandle.time === cur.time) {
              lastCandle.high = kHigh;
              lastCandle.low = kLow;
              lastCandle.close = close;
            }
          }
          const isUp = close >= barOpen;
          syncPriceLineColor(isUp ? '#00e676' : '#ff2d55');
          try {
            activeSeries.update(bar);
          } catch (e) {
            console.warn('[JarvisChart] updateLiveCandle update error:', e);
          }
        }
      },
      updateTickPrice: (price: number, timestamp?: number) => {
        const activeSeries = seriesRef.current || series;
        const activeChart = chartRef.current || chart;
        if (!activeSeries || !Number.isFinite(price) || price <= 10) return;
        const tfSec = TIMEFRAME_SECONDS[preferences.timeframe] || 60;
        let cur = currentCandleRef.current;

        // Discard previous candle if it belonged to a different timeframe
        if (cur && (cur.time as number) % tfSec !== 0) {
          cur = null;
          currentCandleRef.current = null;
        }

        if (!cur && allCandlesRef.current.length > 0) {
          const lastC = allCandlesRef.current[allCandlesRef.current.length - 1];
          cur = {
            time: lastC.time as UTCTimestamp,
            open: lastC.open,
            high: lastC.high,
            low: lastC.low,
            close: lastC.close,
          };
          currentCandleRef.current = cur;
        }

        // Discard extreme cross-symbol outlier ticks
        if (cur && cur.close > 10) {
          const ratio = price / cur.close;
          if (ratio > 1.35 || ratio < 0.65) {
            return;
          }
        }

        const effectiveTimestamp = timestamp && timestamp > 1e11 ? timestamp : (timestamp && timestamp > 1e8 ? timestamp * 1000 : Date.now());
        const tradeSec = Math.floor(effectiveTimestamp / 1000);
        const barTime = (Math.floor(tradeSec / tfSec) * tfSec) as UTCTimestamp;

        // Stale timestamp guard: only ignore ticks that are genuinely older than 2 full bars
        if (cur && barTime < (cur.time as number) - 2 * tfSec) {
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
          const isUp = cur ? price >= cur.close : true;
          currentCandleRef.current = newBar;
          if (allCandlesRef.current.length > 0) {
            const lastCandle = allCandlesRef.current[allCandlesRef.current.length - 1];
            if (lastCandle.time === barTime) {
              lastCandle.high = Math.max(lastCandle.high, price);
              lastCandle.low = Math.min(lastCandle.low, price);
              lastCandle.close = price;
            } else if (lastCandle.time < barTime) {
              allCandlesRef.current.push({
                time: barTime,
                open: price,
                high: price,
                low: price,
                close: price,
                volume: 0,
              });
            }
          }
          syncPriceLineColor(isUp ? '#00e676' : '#ff2d55');
          try {
            activeSeries.update(newBar);
          } catch (e) {
            console.warn('[JarvisChart] updateTickPrice newBar error:', e);
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
          if (allCandlesRef.current.length > 0) {
            const lastCandle = allCandlesRef.current[allCandlesRef.current.length - 1];
            if (lastCandle.time === cur.time) {
              lastCandle.high = high;
              lastCandle.low = low;
              lastCandle.close = close;
            }
          }
          const isUp = close >= barOpen;
          syncPriceLineColor(isUp ? '#00e676' : '#ff2d55');
          try {
            activeSeries.update(updatedBar);
          } catch (e) {
            console.warn('[JarvisChart] updateTickPrice activeBar error:', e);
          }
        }
      },
    }));

    const mouseRafRef = useRef<number | null>(null);
    const lastMousePosRef = useRef<{ clientX: number; clientY: number } | null>(null);

    const handleHoverBubble = useCallback((bubble: TradeBubble | null, x: number, y: number) => {
      setHoveredBubble((prev) => {
        if (prev.bubble === bubble && Math.abs(prev.x - x) < 8 && Math.abs(prev.y - y) < 8) return prev;
        return { bubble, x, y };
      });
    }, []);

    const handleHoverZone = useCallback((zone: LiquidityZone | null, x: number, y: number) => {
      setHoveredZone((prev) => {
        if (prev.zone === zone && Math.abs(prev.x - x) < 8 && Math.abs(prev.y - y) < 8) return prev;
        return { zone, x, y };
      });
    }, []);

    const handleHoverFootprintDebug = useCallback((debug: FootprintDebugInfo | null, x: number, y: number) => {
      setHoveredFootprintDebug((prev) => {
        if (prev.debug === debug && Math.abs(prev.x - x) < 8 && Math.abs(prev.y - y) < 8) return prev;
        return { debug, x, y };
      });
    }, []);

    const handleUpdateBubbleCoords = useCallback((coords: Array<{ bubble: TradeBubble; cx: number; cy: number; radius: number }>) => {
      visibleBubblesCoordsRef.current = coords;
    }, []);

    const handleUpdateFootprintSettings = useCallback((updated: Partial<import('../../types/footprint').FootprintSettings>) => {
      if (onUpdatePreferences) {
        onUpdatePreferences({
          footprint: { ...preferences.footprint, ...updated },
        });
      }
    }, [onUpdatePreferences, preferences.footprint]);

    const processMouseMove = useCallback(() => {
      mouseRafRef.current = null;
      const coords = lastMousePosRef.current;
      if (!coords || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = coords.clientX - rect.left;
      const mouseY = coords.clientY - rect.top;

      const hit = bubbleManager.hitTest(mouseX, mouseY, visibleBubblesCoordsRef.current);
      if (hit) {
        handleHoverBubble(hit, coords.clientX, coords.clientY);
        handleHoverZone(null, 0, 0);
        handleHoverFootprintDebug(null, 0, 0);
        return;
      }

      handleHoverBubble(null, 0, 0);

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
            handleHoverZone(hitZone, coords.clientX, coords.clientY);
            handleHoverFootprintDebug(null, 0, 0);
          } else {
            handleHoverZone(null, 0, 0);
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
                  handleHoverFootprintDebug(debugInfo, coords.clientX, coords.clientY);
                } else {
                  handleHoverFootprintDebug(null, 0, 0);
                }
              } else {
                handleHoverFootprintDebug(null, 0, 0);
              }
            } else {
              handleHoverFootprintDebug(null, 0, 0);
            }
          } else if (!zoneHit) {
            handleHoverFootprintDebug(null, 0, 0);
          }
        } else {
          handleHoverZone(null, 0, 0);
          handleHoverFootprintDebug(null, 0, 0);
        }
      }
    }, [bubbleManager, series, chart, heatmapEngine, isFootprintActive, preferences.footprint.showDebugInspection, footprintEngine, handleHoverBubble, handleHoverZone, handleHoverFootprintDebug]);

    const handleContainerMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
      // If mouse button is pressed (dragging/panning the chart), bypass hover hit-testing completely
      // to keep drag interactions buttery smooth at 120 FPS without React re-render lag
      if (e.buttons !== 0) {
        if (mouseRafRef.current !== null) {
          cancelAnimationFrame(mouseRafRef.current);
          mouseRafRef.current = null;
        }
        handleHoverZone(null, 0, 0);
        handleHoverBubble(null, 0, 0);
        handleHoverFootprintDebug(null, 0, 0);
        return;
      }

      lastMousePosRef.current = { clientX: e.clientX, clientY: e.clientY };
      if (mouseRafRef.current === null) {
        mouseRafRef.current = requestAnimationFrame(processMouseMove);
      }
    };

    useEffect(() => {
      return () => {
        if (mouseRafRef.current !== null) {
          cancelAnimationFrame(mouseRafRef.current);
          mouseRafRef.current = null;
        }
      };
    }, []);

    return (
      <div
        ref={containerRef}
        className="jarvis-chart-container"
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          background: '#080b11',
          cursor: 'crosshair',
          touchAction: 'none',
        }}
        onMouseMove={handleContainerMouseMove}
        onMouseLeave={() => {
          if (crosshairMarkerElRef.current) crosshairMarkerElRef.current.style.opacity = '0';
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
            depthProfileWidth={dimensions.width > 0 && dimensions.width < 600 ? Math.min(preferences.depthProfile?.widthPx || 220, 140) : (preferences.depthProfile?.widthPx || 220)}
            showCandles={preferences.showCandles}
            isFootprintActive={isFootprintActive}
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
            touchAction: 'none',
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
            onUpdateBubbleCoords={handleUpdateBubbleCoords}
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
            onUpdateSettings={handleUpdateFootprintSettings}
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
          hoveredCandle={hoveredCandle}
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

        {/* TradingView-style smooth (+) marker on crosshair price line */}
        <div
          ref={crosshairMarkerElRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: '#1e222d',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.6)',
            color: '#f8fafc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            fontWeight: 800,
            lineHeight: 1,
            zIndex: 35,
            opacity: 0,
            pointerEvents: 'auto',
            cursor: 'pointer',
            transition: 'opacity 0.15s ease, background 0.15s ease, border-color 0.15s ease',
            userSelect: 'none',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#38bdf8';
            e.currentTarget.style.color = '#080b11';
            e.currentTarget.style.borderColor = '#38bdf8';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#1e222d';
            e.currentTarget.style.color = '#f8fafc';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
          }}
          title="TradingView Quick Order / Alert Marker (+)"
        >
          +
        </div>
      </div>
    );
  }
);

export const JarvisChart = React.memo(JarvisChartComponent);
