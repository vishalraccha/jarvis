/**
 * JARVIS HEATMAP TERMINAL - Core Trading Interface
 * High-performance, free-first, Bookmap-inspired liquidity terminal
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { TopToolbar } from '../toolbar/TopToolbar';
import { JarvisChart, JarvisChartHandles } from '../chart/JarvisChart';
import { HeatmapSettingsModal } from '../settings/HeatmapSettingsModal';
import { BubbleSettingsModal } from '../settings/BubbleSettingsModal';
import { DepthProfileSettingsModal } from '../settings/DepthProfileSettingsModal';
import { FootprintSettingsModal } from '../settings/FootprintSettingsModal';
import { VwapSettingsModal } from '../settings/VwapSettingsModal';
import { OrderBookDiagnosticsModal } from '../diagnostics/OrderBookDiagnosticsModal';
import { CacheSettingsModal } from '../settings/CacheSettingsModal';

import { BinanceAdapter } from '../../services/exchange/BinanceAdapter';
import { ComexAdapter } from '../../services/exchange/ComexAdapter';
import { GoldPriceDevAdapter } from '../../services/exchange/GoldPriceDevAdapter';
import { IExchangeAdapter } from '../../services/exchange/ExchangeAdapter';
import { ExchangeId } from '../../types/market';
import { InstrumentRegistry } from '../../services/market/InstrumentRegistry';
import { MarketSessionService } from '../../services/market/MarketSessionService';
import { OrderBookManager } from '../../services/orderbook/OrderBookManager';
import { HeatmapEngine } from '../../services/heatmap/HeatmapEngine';
import { TradeBubbleManager } from '../../services/bubbles/TradeBubbleManager';
import { LiquidityShiftDetector } from '../../services/heatmap/LiquidityShiftDetector';
import { FootprintEngine, getSymbolDefaultFootprintTick } from '../../services/footprint/FootprintEngine';
import { colorMapEngine } from '../../services/heatmap/ColorMap';
import { indexedDBCache } from '../../services/storage/IndexedDBCache';
import { mergeAndDeduplicateCandles, TIMEFRAME_SECONDS } from '../../utils/candleUtils';

import {
  DEFAULT_TERMINAL_PREFERENCES,
  DEFAULT_HEATMAP_SETTINGS,
  DEFAULT_BUBBLE_SETTINGS,
  DEFAULT_DEPTH_PROFILE_SETTINGS,
  DEFAULT_FOOTPRINT_SETTINGS,
  TerminalPreferences,
} from '../../types/settings';
import { ConnectionState, LatencyMetrics } from '../../types/market';
import { HeatmapTimeSlice } from '../../types/heatmap';

export interface TradingTerminalProps {
  onLockTerminal?: () => void;
}

export const TradingTerminal: React.FC<TradingTerminalProps> = ({ onLockTerminal }) => {
  const [preferences, setPreferences] = useState<TerminalPreferences>(() => {
    try {
      const savedSymbol = localStorage.getItem('jarvis_last_symbol');
      if (savedSymbol && (savedSymbol === 'GC' || savedSymbol.startsWith('XAU'))) {
        const inst = InstrumentRegistry.getInstrument(savedSymbol);
        return { ...DEFAULT_TERMINAL_PREFERENCES, symbol: savedSymbol, exchange: inst.providerId };
      }
    } catch {}
    return DEFAULT_TERMINAL_PREFERENCES;
  });
  const [connectionState, setConnectionState] = useState<ConnectionState>('DISCONNECTED');
  const [latencyMetrics, setLatencyMetrics] = useState<LatencyMetrics>({
    wsPingMs: 0,
    orderBookAgeMs: 0,
    lastMessageTimestamp: 0,
    messageRatePerSec: 0,
    totalMessagesProcessed: 0,
    sequenceGapsDetected: 0,
    resyncCount: 0,
  });

  // Modal states
  const [isHeatmapSettingsOpen, setIsHeatmapSettingsOpen] = useState(false);
  const [isBubbleSettingsOpen, setIsBubbleSettingsOpen] = useState(false);
  const [isDepthProfileSettingsOpen, setIsDepthProfileSettingsOpen] = useState(false);
  const [isFootprintSettingsOpen, setIsFootprintSettingsOpen] = useState(false);
  const [isVwapSettingsOpen, setIsVwapSettingsOpen] = useState(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [isCacheModalOpen, setIsCacheModalOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Engine references
  const binanceAdapterRef = useRef<BinanceAdapter>(new BinanceAdapter());
  const comexAdapterRef = useRef<ComexAdapter>(new ComexAdapter());
  const goldPriceDevAdapterRef = useRef<GoldPriceDevAdapter>(new GoldPriceDevAdapter());

  const getAdapter = useCallback((exchange: ExchangeId): IExchangeAdapter => {
    if (exchange === 'comex') return comexAdapterRef.current;
    if (exchange === 'goldprice_dev') return goldPriceDevAdapterRef.current;
    return binanceAdapterRef.current;
  }, []);

  const orderBookRef = useRef<OrderBookManager>(new OrderBookManager(0.01));
  const heatmapEngineRef = useRef<HeatmapEngine>(new HeatmapEngine(250));
  const bubbleManagerRef = useRef<TradeBubbleManager>(
    new TradeBubbleManager(DEFAULT_TERMINAL_PREFERENCES.bubbles)
  );
  const shiftDetectorRef = useRef<LiquidityShiftDetector>(new LiquidityShiftDetector());
  const footprintEngineRef = useRef<FootprintEngine>(
    new FootprintEngine(
      DEFAULT_TERMINAL_PREFERENCES.symbol,
      DEFAULT_TERMINAL_PREFERENCES.timeframe,
      getSymbolDefaultFootprintTick(DEFAULT_TERMINAL_PREFERENCES.symbol)
    )
  );
  const chartRef = useRef<JarvisChartHandles | null>(null);

  const prevSliceRef = useRef<HeatmapTimeSlice | null>(null);
  const samplingTimerRef = useRef<number | null>(null);
  const progressiveTimerRef = useRef<number | null>(null);
  const inFlightCandleLoadsRef = useRef<Map<string, Promise<void>>>(new Map());
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;

  // 1. Load preferences from IndexedDB on startup
  useEffect(() => {
    footprintEngineRef.current.setOrderBook(orderBookRef.current);
    indexedDBCache.loadPreferences().then((stored) => {
      if (stored) {
        const isFpMode = stored.chartMode === 'footprint' || (stored.showFootprint && !stored.showHeatmap);
        const bubblesActive = stored.showBubbles !== undefined
          ? stored.showBubbles
          : (stored.bubbles?.enabled ?? true);
        const symbolIsGold = stored.symbol === 'GC' || (stored.symbol && stored.symbol.startsWith('XAU'));
        const safeSymbol = symbolIsGold ? stored.symbol : 'GC';
        const safeExchange = symbolIsGold && stored.exchange ? stored.exchange : 'comex';

        const activeDefaults: TerminalPreferences = {
          ...DEFAULT_TERMINAL_PREFERENCES,
          ...stored,
          symbol: safeSymbol,
          exchange: safeExchange,
          showBubbles: bubblesActive,
          showHeatmap: isFpMode ? false : (stored.showHeatmap ?? true),
          showDepthProfile: isFpMode ? false : (stored.showDepthProfile ?? true),
          showFootprint: isFpMode ? true : (stored.showFootprint ?? false),
          showBestBidAskLines: stored.showBestBidAskLines ?? false,
          showLiquidityShifts: stored.showLiquidityShifts ?? false,
          showVwap: stored.showVwap ?? true,
          showCandles: stored.showCandles ?? true,
          heatmap: {
            ...DEFAULT_HEATMAP_SETTINGS,
            ...stored.heatmap,
            colorScale: 'bookmap',
            removeTradedLiquidity: false,
            minLiquidityQty: 0,
            lowerCutoffPercentile: 0,
          },
          depthProfile: {
            ...DEFAULT_DEPTH_PROFILE_SETTINGS,
            ...stored.depthProfile,
            enabled: isFpMode ? false : true,
            widthPx: 210,
          },
          bubbles: {
            ...DEFAULT_BUBBLE_SETTINGS,
            ...stored.bubbles,
            enabled: bubblesActive,
          },
          footprint: {
            ...DEFAULT_FOOTPRINT_SETTINGS,
            ...stored.footprint,
            enabled: isFpMode ? true : (stored.footprint?.enabled ?? true),
            showSideProfile: stored.footprint?.showSideProfile ?? true,
          },
        };
        setPreferences(activeDefaults);
        bubbleManagerRef.current.updateSettings(activeDefaults.bubbles);
        footprintEngineRef.current.updateSettings(activeDefaults.footprint);
        colorMapEngine.rebuildLut(
          activeDefaults.heatmap.colorScale,
          activeDefaults.heatmap.colorSaturation ?? 1.0,
          activeDefaults.heatmap.brightness,
          activeDefaults.heatmap.opacity
        );
      }
    });
  }, []);

  const handleUpdatePreferences = useCallback((patch: Partial<TerminalPreferences>) => {
    setPreferences((prev) => {
      const next = { ...prev, ...patch };

      // Keep showBubbles and bubbles.enabled in sync
      if (patch.showBubbles !== undefined) {
        next.bubbles = { ...next.bubbles, enabled: patch.showBubbles };
      }
      if (patch.bubbles?.enabled !== undefined) {
        next.showBubbles = patch.bubbles.enabled;
      }

      // Keep showFootprint and footprint.enabled in sync
      if (patch.showFootprint !== undefined) {
        next.footprint = { ...next.footprint, enabled: patch.showFootprint };
      }
      if (patch.footprint?.enabled !== undefined) {
        next.showFootprint = patch.footprint.enabled;
      }

      // Keep showDepthProfile and depthProfile.enabled in sync
      if (patch.showDepthProfile !== undefined) {
        next.depthProfile = { ...next.depthProfile, enabled: patch.showDepthProfile };
      }
      if (patch.depthProfile?.enabled !== undefined) {
        next.showDepthProfile = patch.depthProfile.enabled;
      }

      // Keep showVwap and vwap.enabled in sync
      if (patch.showVwap !== undefined) {
        next.vwap = { ...next.vwap, enabled: patch.showVwap };
      }
      if (patch.vwap?.enabled !== undefined) {
        next.showVwap = patch.vwap.enabled;
      }

      indexedDBCache.savePreferences(next);
      if (patch.symbol) {
        try {
          localStorage.setItem('jarvis_last_symbol', patch.symbol);
        } catch {}
      }
      if (patch.bubbles || patch.showBubbles !== undefined) {
        bubbleManagerRef.current.updateSettings(next.bubbles);
      }
      if (patch.heatmap || patch.showHeatmap !== undefined) {
        heatmapEngineRef.current.updateSettings(next.heatmap);
      }
      if (patch.footprint || patch.showFootprint !== undefined) {
        footprintEngineRef.current.updateSettings(next.footprint);
      }
      return next;
    });
  }, []);

  const latestCandlesRef = useRef<any[]>([]);
  const currentInstrumentKeyRef = useRef<string>('');

  const seedEngines = useCallback((candles: any[], symbol: string, timeframe: any, exchange: ExchangeId) => {
    const instrument = InstrumentRegistry.getInstrument(symbol, exchange);

    if (instrument.supportsBubbles) {
      bubbleManagerRef.current.setTimeframe(timeframe);
      bubbleManagerRef.current.seedFromCandles(candles);
    } else {
      bubbleManagerRef.current.clear();
    }

    if (instrument.supportsFootprint) {
      footprintEngineRef.current.setTimeframe(timeframe);
      footprintEngineRef.current.clear();
      footprintEngineRef.current.seedFromCandles(candles, orderBookRef.current);
    } else {
      footprintEngineRef.current.clear();
    }

    if (instrument.supportsHeatmap) {
      heatmapEngineRef.current.seedFromCandlesAndOrderBook(candles, orderBookRef.current);
      heatmapEngineRef.current.seedHistoricalCandlesLiquidity(candles, symbol, exchange);
    } else {
      heatmapEngineRef.current.clear();
    }
  }, []);

  // 2. Fetch Historical Candles (Instant RAM <1ms -> Instant DB <3ms -> Async Fresh Sync -> Progressive Background Pagination)
  const loadCandles = useCallback(async (symbol: string, timeframe: any, exchange: ExchangeId = preferencesRef.current.exchange) => {
    const cacheKey = `${exchange}_${symbol}_${timeframe}`;
    const adapter = getAdapter(exchange);

    // Cancel any background pagination from previous symbol/timeframe
    if (progressiveTimerRef.current !== null) {
      window.clearTimeout(progressiveTimerRef.current);
      progressiveTimerRef.current = null;
    }

    // Always clear previous candles when key changes so different timeframes are NEVER mixed!
    if (currentInstrumentKeyRef.current !== cacheKey) {
      currentInstrumentKeyRef.current = cacheKey;
      latestCandlesRef.current = [];
      chartRef.current?.clearChart();
    }

    let hasRendered = false;

    // TIER 1: In-Memory RAM Cache (Instant 0ms MT5-speed)
    const ramCandles = indexedDBCache.getCachedCandlesSync(symbol, timeframe, exchange);
    if (
      ramCandles &&
      ramCandles.length > 0 &&
      symbol === preferencesRef.current.symbol &&
      exchange === preferencesRef.current.exchange &&
      timeframe === preferencesRef.current.timeframe
    ) {
      latestCandlesRef.current = ramCandles;
      chartRef.current?.updateCandles(ramCandles);
      seedEngines(ramCandles, symbol, timeframe, exchange);
      hasRendered = true;
    }

    // TIER 2: IndexedDB Local Cache (< 3ms) if not already rendered from RAM
    if (!hasRendered) {
      try {
        let dbCached = await indexedDBCache.loadCandles(symbol, timeframe, exchange);
        const tfSec = TIMEFRAME_SECONDS[timeframe] || 60;
        const isGold = symbol.toUpperCase().includes('XAU') || symbol.toUpperCase() === 'GC';
        if (
          dbCached &&
          dbCached.length > 0 &&
          symbol === preferencesRef.current.symbol &&
          exchange === preferencesRef.current.exchange &&
          timeframe === preferencesRef.current.timeframe
        ) {
          // Purge any rogue cross-symbol outliers or unaligned timeframe bars
          dbCached = dbCached.filter((c) =>
            Number.isFinite(c.time) && c.time > 0 &&
            c.time % tfSec === 0 &&
            Number.isFinite(c.open) && c.open > 10 &&
            Number.isFinite(c.high) && c.high > 10 &&
            Number.isFinite(c.low) && c.low > 10 &&
            Number.isFinite(c.close) && c.close > 10 &&
            c.low <= c.high
          );
          const sample = dbCached.slice(-30).map((c) => c.close).sort((a, b) => a - b);
          const median = sample[Math.floor(sample.length / 2)];
          if (median > 0) {
            // Discard only true cross-symbol contamination (e.g. BTC prices in gold)
            const isContaminated = isGold && (median > 15000 || median < 500);
            if (!isContaminated) {
              dbCached = dbCached.filter((c) =>
                c.close >= median * 0.5 && c.close <= median * 2.0 &&
                c.low >= median * 0.5 && c.high <= median * 2.0
              );
            } else {
              dbCached = [];
            }
          }

          if (
            dbCached.length > 0 &&
            symbol === preferencesRef.current.symbol &&
            exchange === preferencesRef.current.exchange &&
            timeframe === preferencesRef.current.timeframe
          ) {
            latestCandlesRef.current = dbCached;
            chartRef.current?.updateCandles(dbCached);
            seedEngines(dbCached, symbol, timeframe, exchange);
            hasRendered = true;
          }
        }
      } catch (e) {
        console.warn('[TradingTerminal] Local cache read error:', e);
      }
    }

    // Deduplicate in-flight requests for same symbol/timeframe
    if (inFlightCandleLoadsRef.current.has(cacheKey)) {
      return inFlightCandleLoadsRef.current.get(cacheKey);
    }

    const fetchPromise = (async () => {
      try {
        // Step 3: Fetch latest 1000 candles asynchronously
        const freshCandles = await adapter.fetchHistoricalCandles(symbol, timeframe, undefined, undefined, 1000);
        if (freshCandles && freshCandles.length > 0) {
          // Discard if symbol/exchange/timeframe changed while request was in-flight
          if (
            symbol !== preferencesRef.current.symbol ||
            exchange !== preferencesRef.current.exchange ||
            timeframe !== preferencesRef.current.timeframe
          ) {
            return;
          }

          // Filter out cross-symbol outliers, unaligned timestamps, and zero/negative prices
          const isGold = symbol.toUpperCase().includes('XAU') || symbol.toUpperCase() === 'GC';
          const tfSec = TIMEFRAME_SECONDS[timeframe] || 60;
          const validBars = freshCandles.filter((c) =>
            Number.isFinite(c.time) && c.time > 0 &&
            c.time % tfSec === 0 &&
            Number.isFinite(c.open) && c.open > 10 &&
            Number.isFinite(c.high) && c.high > 10 &&
            Number.isFinite(c.low) && c.low > 10 &&
            Number.isFinite(c.close) && c.close > 10 &&
            c.low <= c.high
          );
          const sample = validBars.slice(-30).map((c) => c.close).sort((a, b) => a - b);
          const median = sample[Math.floor(sample.length / 2)];

          if (isGold && (median > 15000 || median < 500)) {
            console.warn('[TradingTerminal] Rejecting invalid candles for Gold:', symbol, median);
            return;
          }

          const validFresh = median > 0
            ? validBars.filter((c) =>
                c.close >= median * 0.5 && c.close <= median * 2.0 &&
                c.low >= median * 0.5 && c.high <= median * 2.0
              )
            : validBars;

          // Step 4: Seamlessly merge fresh candles with existing buffer (strictly aligned to timeframe)
          const merged = mergeAndDeduplicateCandles(latestCandlesRef.current, validFresh, timeframe);
          latestCandlesRef.current = merged;

          // Step 5: Update the chart immediately with smooth auto-scaling
          chartRef.current?.updateCandles(merged);
          indexedDBCache.saveCandles(symbol, timeframe, merged, exchange);
          seedEngines(merged, symbol, timeframe, exchange);

          // Ingest recent trades if supported
          const instrument = InstrumentRegistry.getInstrument(symbol, exchange);
          if (instrument.supportsTrades) {
            adapter.fetchRecentTrades(symbol, 500).then((trades) => {
              if (symbol !== preferencesRef.current.symbol) return;
              trades.forEach((t) => {
                bubbleManagerRef.current.addTrade(t);
                footprintEngineRef.current.addTrade(t);
              });
            }).catch(() => {});
          }
        }

      } catch (e) {
        console.warn('[TradingTerminal] Could not fetch remote klines:', e);
      } finally {
        inFlightCandleLoadsRef.current.delete(cacheKey);
      }
    })();

    inFlightCandleLoadsRef.current.set(cacheKey, fetchPromise);
    return fetchPromise;
  }, [getAdapter, seedEngines]);

  // 3. Connect to live market data and coordinate pipelines
  useEffect(() => {
    const exchange = preferences.exchange;
    const symbol = preferences.symbol;
    const adapter = getAdapter(exchange);
    const orderBook = orderBookRef.current;
    const heatmap = heatmapEngineRef.current;
    const bubbles = bubbleManagerRef.current;
    const shiftDetector = shiftDetectorRef.current;

    // Reset latestCandlesRef when switching symbol, exchange, or timeframe!
    const currentKey = `${exchange}_${symbol}_${preferences.timeframe}`;
    if (currentInstrumentKeyRef.current !== currentKey) {
      currentInstrumentKeyRef.current = currentKey;
      latestCandlesRef.current = [];
      chartRef.current?.clearChart();
    }

    // Reset in-flight requests (do NOT clear chart to pitch black; loadCandles paints cached bars in 0ms)
    inFlightCandleLoadsRef.current.clear();

    // Reset book and engines on symbol/exchange/timeframe change
    orderBook.reset();
    heatmap.clear();
    bubbles.clear();
    bubbles.setTimeframe(preferences.timeframe);
    shiftDetector.clear();
    const defaultTick = getSymbolDefaultFootprintTick(symbol);
    footprintEngineRef.current.clear();
    footprintEngineRef.current.setSymbol(symbol, exchange, defaultTick);
    footprintEngineRef.current.setOrderBook(orderBookRef.current);
    footprintEngineRef.current.setTimeframe(preferences.timeframe);
    footprintEngineRef.current.updateSettings(preferences.footprint);
    prevSliceRef.current = null;

    const instrument = InstrumentRegistry.getInstrument(symbol, exchange);

    // Set tick size from instrument definition
    orderBook.setTickSize(instrument.priceTick);

    // Initial klines fetch for selected timeframe (renders in 0-3ms from RAM/IDB cache)
    loadCandles(symbol, preferences.timeframe, exchange);

    // Start Order Book Snapshot and Sequence Synchronization ONLY if supported
    if (instrument.supportsOrderBook) {
      orderBook.synchronize(adapter, symbol).then(async () => {
        // Re-seed heatmap with synchronized order book + latest candles
        if (latestCandlesRef.current.length > 0 && instrument.supportsHeatmap) {
          heatmap.seedFromCandlesAndOrderBook(latestCandlesRef.current, orderBook);
          heatmap.seedHistoricalCandlesLiquidity(latestCandlesRef.current, symbol, exchange);
        }

        // Load genuine historical slices previously recorded for THIS symbol from IndexedDB (strictly within active window)
        try {
          const oldestCandleMs = latestCandlesRef.current.length > 0
            ? latestCandlesRef.current[0].time * 1000
            : Date.now() - 3600000;
          const cachedSlices = await indexedDBCache.loadSlices(symbol, oldestCandleMs, Date.now());
          if (cachedSlices.length > 0) {
            heatmap.loadHistoricalSlices(cachedSlices);
          }
        } catch (err) {
          console.warn('[TradingTerminal] Could not load cached slices:', err);
        }

        // Sample initial authoritative live slice
        const isFutures = instrument.instrumentType === 'linear_perpetual' || instrument.instrumentType === 'commodity_futures';
        const marketType = isFutures ? 'linear_perpetual' : 'spot';
        heatmap.sampleOrderBook(orderBook, symbol, exchange, marketType, 100);
      });
    }

    // Connect adapter stream
    adapter.connect(symbol, preferences.timeframe, {
      onDepthUpdate: (update) => {
        if (!instrument.supportsOrderBook) return;
        orderBook.handleDepthUpdate(update, adapter, symbol);
      },
      onTrade: (trade) => {
        if (!instrument.supportsTrades || !trade || !Number.isFinite(trade.price) || trade.price <= 10) return;
        const curSym = preferencesRef.current.symbol.toUpperCase().replace(/[-_/]/g, '');
        const trSym = (trade.symbol || symbol).toUpperCase().replace(/[-_/]/g, '');
        if (trSym !== curSym) return;

        // Consume resting limit liquidity at the traded price so COB and prices move dynamically!
        orderBook.consumeLiquidity(trade.price, trade.quantity, trade.side);
        bubbles.addTrade(trade);
        shiftDetector.recordTrade(trade);
        heatmap.recordTrade(trade);
        footprintEngineRef.current.addTrade(trade);
        chartRef.current?.updateTickPrice(trade.price, trade.timestamp);
      },
      onKline: (candle) => {
        if (!candle || !Number.isFinite(candle.close) || candle.close <= 10) return;
        const curSym = preferencesRef.current.symbol.toUpperCase().replace(/[-_/]/g, '');
        const sSym = symbol.toUpperCase().replace(/[-_/]/g, '');
        if (sSym !== curSym) return;

        // Verify candle matches current timeframe interval
        const tfSec = TIMEFRAME_SECONDS[preferencesRef.current.timeframe] || 60;
        if (candle.time % tfSec !== 0) return;

        chartRef.current?.updateLiveCandle(candle);
        if (instrument.supportsFootprint) {
          footprintEngineRef.current.updateLiveCandle(candle, orderBookRef.current);
        }
      },
      onConnectionChange: (state, metrics) => {
        const session = MarketSessionService.getSessionInfo(instrument.marketSchedule);
        if (!session.isOpen && state === 'LIVE') {
          setConnectionState('STALE');
        } else {
          setConnectionState(state);
        }
        setLatencyMetrics(metrics);
      },
      onError: (err) => {
        console.warn('[TradingTerminal] Adapter error:', err);
      },
    });

    // Start periodic order-book sampling for Heatmap Time Slices (every 250ms for buttery-smooth live edge)
    samplingTimerRef.current = (setInterval as any)(() => {
      const prefs = preferencesRef.current;
      if (!prefs.showHeatmap && !prefs.showLiquidityShifts) {
        return; // Guard against unnecessary background CPU/memory load when heatmap is off
      }
      if (!instrument.supportsHeatmap) {
        return; // Guard against fabricating fake heatmap slices for instruments without L2 book
      }

      const isFutures = instrument.instrumentType === 'linear_perpetual' || instrument.instrumentType === 'commodity_futures';
      const marketType = isFutures ? 'linear_perpetual' : 'spot';
      const slice = heatmap.sampleOrderBook(orderBook, symbol, exchange, marketType, 100);
      if (slice) {
        // Asynchronously queue to IndexedDB cache
        indexedDBCache.queueSlice(symbol, slice);

        // Detect liquidity shifts
        if (prefs.showLiquidityShifts && prevSliceRef.current) {
          shiftDetector.detectShifts(prevSliceRef.current, slice);
        }
        prevSliceRef.current = slice;
      }
    }, 250);

    return () => {
      if (samplingTimerRef.current) {
        clearInterval(samplingTimerRef.current);
        samplingTimerRef.current = null;
      }
      if (progressiveTimerRef.current) {
        window.clearTimeout(progressiveTimerRef.current);
        progressiveTimerRef.current = null;
      }
      adapter.disconnect();
    };
  }, [preferences.exchange, preferences.symbol, preferences.timeframe, loadCandles, getAdapter]);

  // Fullscreen toggle
  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  const handleZoomIn = useCallback(() => chartRef.current?.zoomIn(), []);
  const handleZoomOut = useCallback(() => chartRef.current?.zoomOut(), []);
  const handleResetView = useCallback(() => chartRef.current?.resetView(), []);
  const handleJumpToLatest = useCallback(() => chartRef.current?.jumpToLatest(), []);
  const handleOpenHeatmapSettings = useCallback(() => setIsHeatmapSettingsOpen(true), []);
  const handleOpenBubbleSettings = useCallback(() => setIsBubbleSettingsOpen(true), []);
  const handleOpenVwapSettings = useCallback(() => setIsVwapSettingsOpen(true), []);
  const handleOpenDepthProfileSettings = useCallback(() => setIsDepthProfileSettingsOpen(true), []);
  const handleOpenFootprintSettings = useCallback(() => setIsFootprintSettingsOpen(true), []);
  const handleOpenDiagnostics = useCallback(() => setIsDiagnosticsOpen(true), []);
  const handleOpenCacheModal = useCallback(() => setIsCacheModalOpen(true), []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: '#090d16',
      }}
    >
      {/* Top Professional Toolbar */}
      <TopToolbar
        preferences={preferences}
        onUpdatePreferences={handleUpdatePreferences}
        connectionState={connectionState}
        latencyMetrics={latencyMetrics}
        colorMapEngine={colorMapEngine}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetView={handleResetView}
        onJumpToLatest={handleJumpToLatest}
        onToggleFullscreen={handleToggleFullscreen}
        isFullscreen={isFullscreen}
        onOpenHeatmapSettings={handleOpenHeatmapSettings}
        onOpenBubbleSettings={handleOpenBubbleSettings}
        onOpenVwapSettings={handleOpenVwapSettings}
        onOpenDepthProfileSettings={handleOpenDepthProfileSettings}
        onOpenFootprintSettings={handleOpenFootprintSettings}
        onOpenDiagnostics={handleOpenDiagnostics}
        onOpenCacheModal={handleOpenCacheModal}
        onLockTerminal={onLockTerminal}
      />

      {/* Main Terminal Chart Body */}
      <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <JarvisChart
          ref={chartRef}
          preferences={preferences}
          orderBook={orderBookRef.current}
          heatmapEngine={heatmapEngineRef.current}
          bubbleManager={bubbleManagerRef.current}
          shiftDetector={shiftDetectorRef.current}
          colorMapEngine={colorMapEngine}
          footprintEngine={footprintEngineRef.current}
          onUpdatePreferences={handleUpdatePreferences}
          connectionState={connectionState}
        />
      </main>

      {/* Modals */}
      <HeatmapSettingsModal
        isOpen={isHeatmapSettingsOpen}
        onClose={() => setIsHeatmapSettingsOpen(false)}
        settings={preferences.heatmap}
        onChange={(updated) => handleUpdatePreferences({ heatmap: updated })}
        colorMapEngine={colorMapEngine}
      />

      <BubbleSettingsModal
        isOpen={isBubbleSettingsOpen}
        onClose={() => setIsBubbleSettingsOpen(false)}
        settings={preferences.bubbles}
        onChange={(updated) => handleUpdatePreferences({ bubbles: updated })}
      />

      <VwapSettingsModal
        isOpen={isVwapSettingsOpen}
        onClose={() => setIsVwapSettingsOpen(false)}
        settings={preferences.vwap}
        onChange={(updated) => handleUpdatePreferences({ vwap: updated })}
        onReset={() => handleUpdatePreferences({ vwap: DEFAULT_TERMINAL_PREFERENCES.vwap })}
      />

      <DepthProfileSettingsModal
        isOpen={isDepthProfileSettingsOpen}
        onClose={() => setIsDepthProfileSettingsOpen(false)}
        settings={preferences.depthProfile}
        onChange={(updated) => handleUpdatePreferences({ depthProfile: updated })}
        onReset={() => handleUpdatePreferences({ depthProfile: DEFAULT_TERMINAL_PREFERENCES.depthProfile })}
      />

      <FootprintSettingsModal
        isOpen={isFootprintSettingsOpen}
        onClose={() => setIsFootprintSettingsOpen(false)}
        settings={preferences.footprint}
        onChange={(updated) => handleUpdatePreferences({ footprint: updated })}
        onReset={() => handleUpdatePreferences({ footprint: DEFAULT_TERMINAL_PREFERENCES.footprint })}
      />

      <OrderBookDiagnosticsModal
        isOpen={isDiagnosticsOpen}
        onClose={() => setIsDiagnosticsOpen(false)}
        orderBook={orderBookRef.current}
        metrics={latencyMetrics}
        onTriggerResync={() => {
          orderBookRef.current.reset();
          orderBookRef.current.synchronize(getAdapter(preferences.exchange), preferences.symbol);
        }}
      />

      <CacheSettingsModal
        isOpen={isCacheModalOpen}
        onClose={() => setIsCacheModalOpen(false)}
        onReloadHistory={() => loadCandles(preferences.symbol, preferences.timeframe)}
      />
    </div>
  );
};
