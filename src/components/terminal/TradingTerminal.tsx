/**
 * JARVIS HEATMAP TERMINAL - Core Trading Interface
 * High-performance, free-first, Bookmap-inspired liquidity terminal
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { TopToolbar } from '../toolbar/TopToolbar';
import { JarvisChart, JarvisChartHandles } from '../chart/JarvisChart';
import { HeatmapSettingsModal } from '../settings/HeatmapSettingsModal';
import { BubbleSettingsModal } from '../settings/BubbleSettingsModal';
import { DepthProfileSettingsModal } from '../settings/DepthProfileSettingsModal';
import { FootprintSettingsModal } from '../settings/FootprintSettingsModal';
import { VwapSettingsModal } from '../settings/VwapSettingsModal';
import { AbsorptionSettingsModal } from '../settings/AbsorptionSettingsModal';
import { OrderBookDiagnosticsModal } from '../diagnostics/OrderBookDiagnosticsModal';
import { CacheSettingsModal } from '../settings/CacheSettingsModal';
import { AbsorptionEngine } from '../../services/absorption/AbsorptionEngine';
import { DEFAULT_ABSORPTION_SETTINGS } from '../../types/absorption';
import { AIProvider } from '../../types/ai';
import { JarvisAITerminal } from '../ai/JarvisAITerminal';
import { AIConfigModal } from '../ai/AIConfigModal';
import { aiToolRegistry } from '../../services/ai/AIToolRegistry';
import { GexTerminalModal } from '../gex/GexTerminalModal';
import { OptionsDataProvider } from '../../services/gex/OptionsDataProvider';
import { GexEngine } from '../../services/gex/GexEngine';
import { GexMetrics, OptionChainSnapshot } from '../../types/gex';

import { BinanceAdapter } from '../../services/exchange/BinanceAdapter';
import { ComexAdapter } from '../../services/exchange/ComexAdapter';
import { GoldPriceDevAdapter } from '../../services/exchange/GoldPriceDevAdapter';
import { MT5Adapter } from '../../services/exchange/MT5Adapter';
import { IExchangeAdapter } from '../../services/exchange/ExchangeAdapter';
import { ExchangeId, Candle } from '../../types/market';
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
import { FEATURES, shouldUseBackendStorage } from '../../config/features';

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
import { PositionType } from '../../types/position';

export interface TradingTerminalProps {
  onLockTerminal?: () => void;
}

export const TradingTerminal: React.FC<TradingTerminalProps> = ({ onLockTerminal }) => {
  const [preferences, setPreferences] = useState<TerminalPreferences>(DEFAULT_TERMINAL_PREFERENCES);
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
  const [isAbsorptionSettingsOpen, setIsAbsorptionSettingsOpen] = useState(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [isCacheModalOpen, setIsCacheModalOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isAIConfigOpen, setIsAIConfigOpen] = useState(false);
  const [selectedAIConfigProvider, setSelectedAIConfigProvider] = useState<AIProvider | undefined>(undefined);
  const [isAITerminalExpanded, setIsAITerminalExpanded] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1024;
    }
    return true;
  });
  const [activeDrawingTool, setActiveDrawingTool] = useState<PositionType | null>(null);

  // GEX States
  const [isGexTerminalOpen, setIsGexTerminalOpen] = useState(false);
  const [optionChain, setOptionChain] = useState<OptionChainSnapshot | null>(null);
  const [gexMetrics, setGexMetrics] = useState<GexMetrics | null>(null);
  const [isGexLoading, setIsGexLoading] = useState(false);

  // Engine instances (memoized once on mount to prevent multi-engine churn on re-renders)
  const binanceAdapter = useMemo(() => new BinanceAdapter(), []);
  const comexAdapter = useMemo(() => new ComexAdapter(), []);
  const goldPriceDevAdapter = useMemo(() => new GoldPriceDevAdapter(), []);
  const mt5Adapter = useMemo(() => new MT5Adapter(), []);

  const binanceAdapterRef = useRef(binanceAdapter);
  const comexAdapterRef = useRef(comexAdapter);
  const goldPriceDevAdapterRef = useRef(goldPriceDevAdapter);
  const mt5AdapterRef = useRef(mt5Adapter);

  const getAdapter = useCallback((exchange: ExchangeId): IExchangeAdapter => {
    if (exchange === 'comex') return comexAdapterRef.current;
    if (exchange === 'goldprice_dev') return goldPriceDevAdapterRef.current;
    if (exchange === 'mt5') return mt5AdapterRef.current;
    return binanceAdapterRef.current;
  }, []);

  const orderBook = useMemo(() => new OrderBookManager(0.01), []);
  const orderBookRef = useRef(orderBook);

  const heatmapEngine = useMemo(() => new HeatmapEngine(250), []);
  const heatmapEngineRef = useRef(heatmapEngine);

  const bubbleManager = useMemo(
    () => new TradeBubbleManager(DEFAULT_TERMINAL_PREFERENCES.bubbles),
    []
  );
  const bubbleManagerRef = useRef(bubbleManager);

  const shiftDetector = useMemo(() => new LiquidityShiftDetector(), []);
  const shiftDetectorRef = useRef(shiftDetector);

  const footprintEngine = useMemo(
    () =>
      new FootprintEngine(
        DEFAULT_TERMINAL_PREFERENCES.symbol,
        DEFAULT_TERMINAL_PREFERENCES.timeframe,
        getSymbolDefaultFootprintTick(DEFAULT_TERMINAL_PREFERENCES.symbol)
      ),
    []
  );
  const footprintEngineRef = useRef(footprintEngine);

  const absorptionEngine = useMemo(
    () => new AbsorptionEngine(DEFAULT_ABSORPTION_SETTINGS),
    []
  );
  const absorptionEngineRef = useRef(absorptionEngine);

  const chartRef = useRef<JarvisChartHandles | null>(null);

  const prevSliceRef = useRef<HeatmapTimeSlice | null>(null);
  const samplingTimerRef = useRef<number | null>(null);
  const progressiveTimerRef = useRef<number | null>(null);
  const candleSyncTimerRef = useRef<number | null>(null);
  const inFlightCandleLoads = useMemo(() => new Map<string, Promise<void>>(), []);
  const inFlightCandleLoadsRef = useRef(inFlightCandleLoads);
  const isLoadingMoreHistoryRef = useRef<boolean>(false);
  const hasReachedEarliestHistoryRef = useRef<boolean>(false);
  const preferencesRef = useRef(preferences);
  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);

  // 1. Load preferences from IndexedDB on startup
  useEffect(() => {
    footprintEngineRef.current.setOrderBook(orderBookRef.current);
    absorptionEngineRef.current.setOrderBook(orderBookRef.current);
    absorptionEngineRef.current.setHeatmapEngine(heatmapEngineRef.current);
    aiToolRegistry.setContext({
      orderBook: orderBookRef.current,
      footprintEngine: footprintEngineRef.current,
      absorptionEngine: absorptionEngineRef.current,
      heatmapEngine: heatmapEngineRef.current,
      bubbleManager: bubbleManagerRef.current,
    });

    indexedDBCache.loadPreferences().then((stored) => {
      if (stored) {
        const isFpMode = stored.chartMode === 'footprint' || (stored.showFootprint && !stored.showHeatmap);
        const bubblesActive = stored.showBubbles !== undefined
          ? stored.showBubbles
          : (stored.bubbles?.enabled ?? true);
        const absorptionActive = stored.showAbsorption !== undefined
          ? stored.showAbsorption
          : (stored.absorption?.enabled ?? true);
        const inst = stored.symbol ? InstrumentRegistry.getInstrument(stored.symbol, stored.exchange) : null;
        const safeSymbol = inst ? inst.symbol : DEFAULT_TERMINAL_PREFERENCES.symbol;
        const safeExchange = inst ? inst.providerId : DEFAULT_TERMINAL_PREFERENCES.exchange;

        const activeDefaults: TerminalPreferences = {
          ...DEFAULT_TERMINAL_PREFERENCES,
          ...stored,
          symbol: safeSymbol,
          exchange: safeExchange,
          showBubbles: bubblesActive,
          showAbsorption: absorptionActive,
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
          absorption: {
            ...DEFAULT_ABSORPTION_SETTINGS,
            ...stored.absorption,
            enabled: absorptionActive,
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
        absorptionEngineRef.current.updateSettings(activeDefaults.absorption);
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

      // Keep showAbsorption and absorption.enabled in sync
      if (patch.showAbsorption !== undefined) {
        next.absorption = { ...next.absorption, enabled: patch.showAbsorption };
      }
      if (patch.absorption?.enabled !== undefined) {
        next.showAbsorption = patch.absorption.enabled;
      }

      indexedDBCache.savePreferences(next);
      if (patch.bubbles || patch.showBubbles !== undefined) {
        bubbleManagerRef.current.updateSettings(next.bubbles);
      }
      if (patch.heatmap || patch.showHeatmap !== undefined) {
        heatmapEngineRef.current.updateSettings(next.heatmap);
      }
      if (patch.footprint || patch.showFootprint !== undefined) {
        footprintEngineRef.current.updateSettings(next.footprint);
      }
      if (patch.absorption || patch.showAbsorption !== undefined) {
        absorptionEngineRef.current.updateSettings(next.absorption);
      }
      return next;
    });
  }, []);

  const latestCandlesRef = useRef<any[]>([]);
  const [renderedCandles, setRenderedCandles] = useState<Candle[]>([]);
  const currentInstrumentKeyRef = useRef<string>('');
  const currentSymbolKeyRef = useRef<string>('');

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

    absorptionEngineRef.current.setContext(symbol, instrument.priceTick);
    if (typeof absorptionEngineRef.current.setTimeframe === 'function') {
      absorptionEngineRef.current.setTimeframe(timeframe);
    }
    if (typeof absorptionEngineRef.current.seedFromCandles === 'function') {
      absorptionEngineRef.current.seedFromCandles(candles);
    }
  }, []);

  // 2. Fetch Historical Candles (Instant RAM <1ms -> Instant DB <3ms -> Async Fresh Sync -> Progressive Background Pagination)
  const loadCandles = useCallback(async (symbol: string, timeframe: any, exchange: ExchangeId = preferencesRef.current.exchange) => {
    const cacheKey = `${exchange}_${symbol}_${timeframe}`;
    const adapter = getAdapter(exchange);
    const targetInst = InstrumentRegistry.getInstrument(symbol, exchange);

    // Cancel any background pagination from previous symbol/timeframe
    if (progressiveTimerRef.current !== null) {
      window.clearTimeout(progressiveTimerRef.current);
      progressiveTimerRef.current = null;
    }

    // Check Tier 1 synchronous cache before clearing to avoid unnecessary blank flicker
    const ramCandles = indexedDBCache.getCachedCandlesSync(symbol, timeframe, exchange);

    // Switch instrument key
    if (currentInstrumentKeyRef.current !== cacheKey) {
      currentInstrumentKeyRef.current = cacheKey;
      hasReachedEarliestHistoryRef.current = false;
      isLoadingMoreHistoryRef.current = false;
      latestCandlesRef.current = [];
      setRenderedCandles([]);
      if (!ramCandles || ramCandles.length === 0) {
        chartRef.current?.clearChart();
      }
    }

    let hasRendered = false;

    // TIER 0: Cloud Backend Fast Path (SQLite + Redis Hot Cache)
    const useBackend = await shouldUseBackendStorage();
    if (useBackend) {
      try {
        const limit = FEATURES.activeWorkingSetSize;
        const res = await fetch(
          `/api/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&limit=${limit}`,
          { signal: AbortSignal.timeout(3000) }
        );
        if (res.ok) {
          const backendCandles: Candle[] = await res.json();
          if (
            Array.isArray(backendCandles) &&
            backendCandles.length > 0 &&
            symbol === preferencesRef.current.symbol &&
            exchange === preferencesRef.current.exchange &&
            timeframe === preferencesRef.current.timeframe
          ) {
            const filteredBackend = backendCandles.filter(
              (c) => !MarketSessionService.isCandleInClosedSession(targetInst.marketSchedule, c.time)
            );
            if (filteredBackend.length > 0) {
              latestCandlesRef.current = filteredBackend;
              setRenderedCandles(filteredBackend);
              chartRef.current?.updateCandles(filteredBackend);
              seedEngines(filteredBackend, symbol, timeframe, exchange);
              indexedDBCache.saveCandles(symbol, timeframe, filteredBackend, exchange);
              return;
            }
          }
        }
      } catch (err) {
        console.warn('[TradingTerminal] Cloud backend query failed, falling back to client cache:', err);
      }
    }

    // TIER 1: In-Memory RAM Cache or Local Snapshot (Instant 0ms MT5-speed)
    if (
      ramCandles &&
      ramCandles.length > 0 &&
      symbol === preferencesRef.current.symbol &&
      exchange === preferencesRef.current.exchange &&
      timeframe === preferencesRef.current.timeframe
    ) {
      const filteredRam = ramCandles.filter(
        (c) => !MarketSessionService.isCandleInClosedSession(targetInst.marketSchedule, c.time)
      );
      if (filteredRam.length > 0) {
        latestCandlesRef.current = filteredRam;
        setRenderedCandles(filteredRam);
        chartRef.current?.updateCandles(filteredRam);
        seedEngines(filteredRam, symbol, timeframe, exchange);
        hasRendered = true;
      }
    }

    // Deduplicate in-flight requests for same symbol/timeframe
    if (inFlightCandleLoadsRef.current.has(cacheKey)) {
      return inFlightCandleLoadsRef.current.get(cacheKey);
    }

    const fetchPromise = (async () => {
      // 1. Kick off authoritative network fetch immediately in parallel (300 candles for instant < 20ms rendering)
      const networkFetch = adapter.fetchHistoricalCandles(symbol, timeframe, undefined, undefined, 300);

      // 2. Concurrently check IndexedDB local cache if not already rendered from RAM
      if (!hasRendered) {
        try {
          const dbCached = await indexedDBCache.loadCandles(symbol, timeframe, exchange);
          const tfSec = TIMEFRAME_SECONDS[timeframe] || 60;
          const isGold = symbol.toUpperCase().includes('XAU') || symbol.toUpperCase() === 'GC';
          if (
            dbCached &&
            dbCached.length > 0 &&
            !hasRendered &&
            symbol === preferencesRef.current.symbol &&
            exchange === preferencesRef.current.exchange &&
            timeframe === preferencesRef.current.timeframe
          ) {
            const validDb = dbCached.filter((c) =>
              Number.isFinite(c.time) && c.time > 0 &&
              Number.isFinite(c.open) && c.open > 0 &&
              Number.isFinite(c.high) && c.high > 0 &&
              Number.isFinite(c.low) && c.low > 0 &&
              Number.isFinite(c.close) && c.close > 0 &&
              c.low <= c.high &&
              !MarketSessionService.isCandleInClosedSession(targetInst.marketSchedule, c.time)
            ).map((c) => ({
              ...c,
              time: (Math.floor(c.time / tfSec) * tfSec) as any,
              high: Math.max(c.high, c.open, c.close),
              low: Math.min(c.low, c.open, c.close),
            }));
            const sample = validDb.slice(-30).map((c) => c.close).sort((a, b) => a - b);
            const median = sample[Math.floor(sample.length / 2)];
            if (median > 0 && !(isGold && (median > 15000 || median < 500))) {
              latestCandlesRef.current = validDb;
              setRenderedCandles(validDb);
              chartRef.current?.updateCandles(validDb);
              seedEngines(validDb, symbol, timeframe, exchange);
              hasRendered = true;
            }
          }
        } catch (e) {
          console.warn('[TradingTerminal] Local cache read error:', e);
        }
      }

      try {
        // Step 3: Await latest authoritative candles from network
        const freshCandles = await networkFetch;
        if (freshCandles && freshCandles.length > 0) {
          // Discard if symbol/exchange/timeframe changed while request was in-flight
          if (
            symbol !== preferencesRef.current.symbol ||
            exchange !== preferencesRef.current.exchange ||
            timeframe !== preferencesRef.current.timeframe
          ) {
            return;
          }

          // Filter: valid OHLC, correct relationship, skip closed-session bars, align to timeframe grid
          // NEVER sanitize wicks — the exchange data is the truth
          const isGold = symbol.toUpperCase().includes('XAU') || symbol.toUpperCase() === 'GC';
          const tfSec = TIMEFRAME_SECONDS[timeframe] || 60;
          const validBars = freshCandles.filter((c) =>
            Number.isFinite(c.time) && c.time > 0 &&
            Number.isFinite(c.open) && c.open > 0 &&
            Number.isFinite(c.high) && c.high > 0 &&
            Number.isFinite(c.low) && c.low > 0 &&
            Number.isFinite(c.close) && c.close > 0 &&
            c.low <= c.high &&
            !MarketSessionService.isCandleInClosedSession(targetInst.marketSchedule, c.time)
          ).map((c) => ({
            ...c,
            time: (Math.floor(c.time / tfSec) * tfSec) as any,
            high: Math.max(c.high, c.open, c.close),
            low: Math.min(c.low, c.open, c.close),
          }));
          const sample = validBars.slice(-30).map((c) => c.close).sort((a, b) => a - b);
          const median = sample[Math.floor(sample.length / 2)];

          if (isGold && (median > 15000 || median < 500)) {
            console.warn('[TradingTerminal] Rejecting invalid candles for Gold:', symbol, median);
            return;
          }

          const validFresh = median > 0
            ? validBars.filter((c) =>
                c.close >= median * 0.5 && c.close <= median * 2.0
              )
            : validBars;

          // Step 4: Seamlessly merge fresh candles with existing buffer
          const existingFiltered = latestCandlesRef.current;
          const merged = existingFiltered.length > 0
            ? mergeAndDeduplicateCandles(existingFiltered, validFresh, timeframe)
            : validFresh;

          latestCandlesRef.current = merged;
          setRenderedCandles(merged);

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

  // Reverse scroll historical pagination: fetches older candles from backend
  const handleLoadMoreHistory = useCallback(async () => {
    if (isLoadingMoreHistoryRef.current || hasReachedEarliestHistoryRef.current) return;
    const currentBars = latestCandlesRef.current;
    if (!currentBars || currentBars.length === 0) return;

    const oldest = currentBars[0];
    if (!oldest || !oldest.time) return;

    const symbol = preferencesRef.current.symbol;
    const timeframe = preferencesRef.current.timeframe;
    const endTime = Math.floor(oldest.time) - 1;

    isLoadingMoreHistoryRef.current = true;
    try {
      const res = await fetch(
        `/api/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&endTime=${endTime}&limit=200`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (res.ok) {
        const olderCandles: Candle[] = await res.json();
        if (Array.isArray(olderCandles) && olderCandles.length > 0) {
          const merged = mergeAndDeduplicateCandles(olderCandles, latestCandlesRef.current, timeframe);
          latestCandlesRef.current = merged;
          setRenderedCandles(merged);
          chartRef.current?.prependOlderCandles(olderCandles);
        } else {
          hasReachedEarliestHistoryRef.current = true;
        }
      }
    } catch (err) {
      console.warn('[TradingTerminal] Failed to fetch older candles:', err);
    } finally {
      isLoadingMoreHistoryRef.current = false;
    }
  }, []);

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
      hasReachedEarliestHistoryRef.current = false;
      isLoadingMoreHistoryRef.current = false;
      latestCandlesRef.current = [];
      setRenderedCandles([]);
      chartRef.current?.clearChart();
    }

    // Reset in-flight requests (do NOT clear chart to pitch black; loadCandles paints cached bars in 0ms)
    inFlightCandleLoadsRef.current.clear();

    // Only reset the live order book when changing the symbol or exchange!
    // Changing timeframe (e.g. 1m to 15m) keeps the continuous live order book and heatmap active!
    const symbolKey = `${exchange}_${symbol}`;
    const isNewSymbol = currentSymbolKeyRef.current !== symbolKey;
    if (isNewSymbol) {
      currentSymbolKeyRef.current = symbolKey;
      orderBook.reset();
      heatmap.clear();
      bubbles.clear();
      shiftDetector.clear();
      const defaultTick = getSymbolDefaultFootprintTick(symbol);
      footprintEngineRef.current.clear();
      footprintEngineRef.current.setSymbol(symbol, exchange, defaultTick);
      footprintEngineRef.current.setOrderBook(orderBookRef.current);
      absorptionEngineRef.current.clear();
      absorptionEngineRef.current.setContext(symbol);
      prevSliceRef.current = null;
    }

    bubbles.setTimeframe(preferences.timeframe);
    footprintEngineRef.current.setTimeframe(preferences.timeframe);
    if (typeof absorptionEngineRef.current.setTimeframe === 'function') {
      absorptionEngineRef.current.setTimeframe(preferences.timeframe);
    }

    const instrument = InstrumentRegistry.getInstrument(symbol, exchange);

    // Set tick size from instrument definition
    orderBook.setTickSize(instrument.priceTick);

    // Initial klines fetch for selected timeframe (renders in 0-3ms from RAM/IDB cache)
    loadCandles(symbol, preferences.timeframe, exchange);

    // Start Order Book Snapshot and Sequence Synchronization on symbol change or initial connect
    if (instrument.supportsOrderBook && (isNewSymbol || orderBook.getStats().bidLevelsCount === 0)) {
      orderBook.synchronize(adapter, symbol).then(async () => {
        // Re-seed heatmap with synchronized order book + latest candles
        if (latestCandlesRef.current.length > 0 && instrument.supportsHeatmap) {
          heatmap.seedFromCandlesAndOrderBook(latestCandlesRef.current, orderBook);
          heatmap.seedHistoricalCandlesLiquidity(latestCandlesRef.current, symbol, exchange);
        }

        // Load genuine historical slices previously recorded for THIS symbol from IndexedDB (up to 24h back)
        try {
          const queryStartMs = Date.now() - 24 * 3600000;
          const cachedSlices = await indexedDBCache.loadSlices(symbol, queryStartMs, Date.now());
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
        if (!instrument.supportsTrades || !trade || !Number.isFinite(trade.price) || trade.price <= 0) return;
        const targetSym = preferencesRef.current.symbol.toUpperCase().replace(/[-_/]/g, '');
        const isGoldTarget = targetSym.includes('XAU') || targetSym === 'GC' || targetSym === 'GOLD';
        const trSym = (trade.symbol || symbol).toUpperCase().replace(/[-_/]/g, '');
        const isGoldTrade = trSym.includes('XAU') || trSym === 'GC' || trSym === 'GOLD';

        if (isGoldTarget) {
          if (!isGoldTrade) return;
        } else if (trSym !== targetSym) {
          return;
        }

        // =========================================================================
        // INSTITUTIONAL TICK SANITIZATION & RESTING ORDER OUTLIER GUARD
        // Prevent spurious ticks, resting limit liquidity or flash wicks from corrupting
        // the order book, trade engines, or candle OHLC wicks!
        // =========================================================================
        const curBestBid = orderBook.getBestBid();
        const curBestAsk = orderBook.getBestAsk();
        const lastBar = latestCandlesRef.current.length > 0 ? latestCandlesRef.current[latestCandlesRef.current.length - 1] : null;
        const refPrice = lastBar && lastBar.close > 0
          ? lastBar.close
          : (curBestBid > 0 && curBestAsk > 0 ? (curBestBid + curBestAsk) / 2 : trade.price);

        // 1. OrderBook Inside Spread Guard:
        // A genuine market execution strictly occurs at or near the best bid/ask.
        // If order book has active spread and the trade deviates > 0.4% from inside market,
        // it is an out-of-market resting limit order / aberrant packet and must be ignored.
        if (curBestBid > 0 && curBestAsk > 0 && curBestAsk >= curBestBid) {
          if (trade.price < curBestBid * 0.996 || trade.price > curBestAsk * 1.004) {
            return;
          }
        }

        // 2. Candle Wick Outlier Protection:
        // A single trade tick within a forming 1m candle cannot deviate > 0.8% from reference close
        // unless corroborated by the OrderBook inside spread.
        if (refPrice > 0) {
          const tickDev = Math.abs(trade.price - refPrice) / refPrice;
          if (tickDev > 0.008) {
            const confirmedByBook = curBestBid > 0 && curBestAsk > 0 &&
              trade.price >= curBestBid * 0.998 && trade.price <= curBestAsk * 1.002;
            if (!confirmedByBook) {
              return;
            }
          }
        }

        const prefs = preferencesRef.current;
        // Consume resting limit liquidity at the traded price so COB and prices move dynamically!
        orderBook.consumeLiquidity(trade.price, trade.quantity, trade.side);
        if (prefs.showBubbles) bubbles.addTrade(trade);
        if (prefs.showLiquidityShifts) shiftDetector.recordTrade(trade);
        if (prefs.showHeatmap) heatmap.recordTrade(trade);
        if (prefs.showFootprint || prefs.chartMode === 'footprint') {
          footprintEngineRef.current.addTrade(trade);
        }
        if (prefs.showAbsorption) {
          absorptionEngineRef.current.recordTrade(trade);
        }

        // Keep latestCandlesRef synchronized on every tick
        const inst = InstrumentRegistry.getInstrument(trade.symbol || preferencesRef.current.symbol, preferencesRef.current.exchange);
        const session = MarketSessionService.getSessionInfo(inst.marketSchedule);
        if (!session.isOpen) {
          // Market closed - update price label only, do NOT form or advance candles
          chartRef.current?.updateTickPrice(trade.price, trade.timestamp);
          return;
        }

        const tfSec = TIMEFRAME_SECONDS[preferencesRef.current.timeframe] || 60;
        const tradeSec = Math.floor((trade.timestamp || Date.now()) / 1000);
        const barTime = Math.floor(tradeSec / tfSec) * tfSec;
        if (MarketSessionService.isCandleInClosedSession(inst.marketSchedule, barTime)) {
          chartRef.current?.updateTickPrice(trade.price, trade.timestamp);
          return;
        }

        if (latestCandlesRef.current.length > 0) {
          const last = latestCandlesRef.current[latestCandlesRef.current.length - 1];
          if (last.time === barTime) {
            // Outlier tick protection: do not let aberrant trades (> 0.8% deviation) corrupt candle wick
            if (last.close > 0) {
              const ratio = trade.price / last.close;
              if (ratio > 1.008 || ratio < 0.992) {
                return;
              }
            }
            last.high = Math.max(last.high, trade.price);
            last.low = Math.min(last.low, trade.price);
            last.close = trade.price;
          } else if (last.time < barTime) {
            if (last.close > 0) {
              const ratio = trade.price / last.close;
              if (ratio > 1.008 || ratio < 0.992) {
                return;
              }
            }
            const openPrice = last.close > 0 ? last.close : trade.price;
            latestCandlesRef.current.push({
              time: barTime,
              open: openPrice,
              high: Math.max(openPrice, trade.price),
              low: Math.min(openPrice, trade.price),
              close: trade.price,
              volume: trade.quantity || 0,
            });
          }
        }

        chartRef.current?.updateTickPrice(trade.price, trade.timestamp);
      },
      onKline: (candle) => {
        if (!candle || !Number.isFinite(candle.close) || candle.close <= 0) return;
        const targetSym = preferencesRef.current.symbol.toUpperCase().replace(/[-_/]/g, '');
        const isGoldTarget = targetSym.includes('XAU') || targetSym === 'GC' || targetSym === 'GOLD';
        const sSym = symbol.toUpperCase().replace(/[-_/]/g, '');
        const isGoldKline = sSym.includes('XAU') || sSym === 'GC' || sSym === 'GOLD';

        if (isGoldTarget) {
          if (!isGoldKline) return;
        } else if (sSym !== targetSym) {
          return;
        }

        // Verify candle matches current timeframe interval and align
        const tfSec = TIMEFRAME_SECONDS[preferencesRef.current.timeframe] || 60;
        const alignedCandle = { ...candle, time: Math.floor(candle.time / tfSec) * tfSec };

        const inst = InstrumentRegistry.getInstrument(preferencesRef.current.symbol, preferencesRef.current.exchange);
        const session = MarketSessionService.getSessionInfo(inst.marketSchedule);
        if (!session.isOpen || MarketSessionService.isCandleInClosedSession(inst.marketSchedule, alignedCandle.time)) {
          return;
        }

        if (latestCandlesRef.current.length > 0) {
          const last = latestCandlesRef.current[latestCandlesRef.current.length - 1];
          if (last.time === alignedCandle.time) {
            // Keep established open of this bar so there is never an artificial gap,
            // unless the established open is an aberrant outlier that deviates abnormally (> 0.1%) from exchange open.
            const openPrice = (last.open > 0 && alignedCandle.open > 0 && Math.abs(last.open - alignedCandle.open) / alignedCandle.open <= 0.001)
              ? last.open
              : (alignedCandle.open > 0 ? alignedCandle.open : alignedCandle.close);
            last.open = openPrice;
            last.close = alignedCandle.close;
            // Heal any corrupted wick that was spiked by bad ticks
            last.high = (last.high > 0 && alignedCandle.high > 0 && last.high > alignedCandle.high * 1.001)
              ? alignedCandle.high
              : Math.max(alignedCandle.high, openPrice, alignedCandle.close);
            last.low = (last.low > 0 && alignedCandle.low > 0 && last.low < alignedCandle.low * 0.999)
              ? alignedCandle.low
              : Math.min(alignedCandle.low, openPrice, alignedCandle.close);
            if (alignedCandle.volume) last.volume = Math.max(last.volume || 0, alignedCandle.volume);
          } else if (last.time < alignedCandle.time) {
            // Advance to new bar: open must strictly equal previous bar's close for seamless continuity,
            // unless previous close was an aberrant outlier that deviates abnormally from new bar open.
            const prevClose = (last.close > 0 && alignedCandle.open > 0 && Math.abs(last.close - alignedCandle.open) / alignedCandle.open <= 0.001)
              ? last.close
              : (alignedCandle.open > 0 ? alignedCandle.open : alignedCandle.close);
            latestCandlesRef.current.push({
              time: alignedCandle.time,
              open: prevClose,
              high: Math.max(alignedCandle.high, prevClose, alignedCandle.close),
              low: Math.min(alignedCandle.low, prevClose, alignedCandle.close),
              close: alignedCandle.close,
              volume: alignedCandle.volume || 0,
            });
          }
          const active = latestCandlesRef.current[latestCandlesRef.current.length - 1];
          chartRef.current?.updateLiveCandle(active);
          if (instrument.supportsFootprint) {
            footprintEngineRef.current.updateLiveCandle(active, orderBookRef.current);
          }
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

    // Background Candle Watchdog (guarantees new candles form and advance every 2.5s)
    let syncTickCount = 0;
    candleSyncTimerRef.current = (setInterval as any)(async () => {
      if (document.visibilityState === 'hidden') return; // Eliminate background CPU & network lag while user is away

      const curExchange = preferencesRef.current.exchange;
      const curSymbol = preferencesRef.current.symbol;
      const curTf = preferencesRef.current.timeframe;
      if (curExchange !== exchange || curSymbol !== symbol) return;

      const inst = InstrumentRegistry.getInstrument(curSymbol, curExchange);
      const session = MarketSessionService.getSessionInfo(inst.marketSchedule);
      if (!session.isOpen) return; // Never advance or sync candles when market is closed

      syncTickCount++;
      const nowSec = Math.floor(Date.now() / 1000);
      const tfSec = TIMEFRAME_SECONDS[curTf] || 60;
      const currentBarStart = Math.floor(nowSec / tfSec) * tfSec;
      const lastBar = latestCandlesRef.current[latestCandlesRef.current.length - 1];

      // Re-sync when new candle interval has elapsed or periodically every 15s
      const isNewBarDue = !lastBar || lastBar.time < currentBarStart;
      const isPeriodicSync = syncTickCount % 6 === 0;

      if (isNewBarDue || isPeriodicSync) {
        try {
          const freshBars = await adapter.fetchHistoricalCandles(curSymbol, curTf, undefined, undefined, 5);
          if (
            curSymbol !== preferencesRef.current.symbol ||
            curExchange !== preferencesRef.current.exchange ||
            curTf !== preferencesRef.current.timeframe
          ) {
            return;
          }
          if (freshBars && freshBars.length > 0) {
            const valid = freshBars.filter((c) =>
              Number.isFinite(c.time) && c.time > 0 &&
              Number.isFinite(c.open) && c.open > 0 &&
              Number.isFinite(c.high) && c.high > 0 &&
              Number.isFinite(c.low) && c.low > 0 &&
              Number.isFinite(c.close) && c.close > 0 &&
              c.low <= c.high &&
              !MarketSessionService.isCandleInClosedSession(inst.marketSchedule, c.time)
            ).map((c) => ({
              ...c,
              time: (Math.floor(c.time / tfSec) * tfSec) as any,
            }));

            if (valid.length > 0) {
              const merged = mergeAndDeduplicateCandles(latestCandlesRef.current, valid, curTf);
              if (merged.length > 0) {
                latestCandlesRef.current = merged;
                // Only pass confirmed closed bars to chart so delayed REST polling never overwrites the live forming bar!
                const closedBars = valid.filter((c) => c.time < currentBarStart);
                if (closedBars.length > 0) {
                  chartRef.current?.incrementalUpdateCandles(closedBars);
                }
                if (syncTickCount % 12 === 0) {
                  indexedDBCache.saveCandles(curSymbol, curTf, merged, curExchange);
                }
              }
            }
          }
        } catch {}
      }
    }, 2500);

    // Re-sync candles seamlessly when tab returns to foreground without reloading or resetting viewport
    let lastHiddenTimestamp = 0;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        lastHiddenTimestamp = Date.now();
      } else if (document.visibilityState === 'visible') {
        const elapsedSinceHidden = lastHiddenTimestamp > 0 ? Date.now() - lastHiddenTimestamp : 0;
        lastHiddenTimestamp = 0;
        if (elapsedSinceHidden > 10000) {
          const curSymbol = preferencesRef.current.symbol;
          const curTf = preferencesRef.current.timeframe;
          const curExchange = preferencesRef.current.exchange;
          const targetAdapter = getAdapter(curExchange);
          const targetInst = InstrumentRegistry.getInstrument(curSymbol, curExchange);
          const tfSec = TIMEFRAME_SECONDS[curTf] || 60;
          const nowSec = Math.floor(Date.now() / 1000);
          const currentBarStart = Math.floor(nowSec / tfSec) * tfSec;

          targetAdapter.fetchHistoricalCandles(curSymbol, curTf, undefined, undefined, 15).then((recentBars) => {
            if (
              recentBars &&
              recentBars.length > 0 &&
              curSymbol === preferencesRef.current.symbol &&
              curTf === preferencesRef.current.timeframe &&
              curExchange === preferencesRef.current.exchange
            ) {
              const valid = recentBars.filter((c) =>
                Number.isFinite(c.time) && c.time > 0 &&
                Number.isFinite(c.close) && c.close > 0 &&
                !MarketSessionService.isCandleInClosedSession(targetInst.marketSchedule, c.time)
              ).map((c) => ({
                ...c,
                time: (Math.floor(c.time / tfSec) * tfSec) as any,
              }));

              if (valid.length > 0) {
                const merged = mergeAndDeduplicateCandles(latestCandlesRef.current, valid, curTf);
                latestCandlesRef.current = merged;
                const closedBars = valid.filter((c) => c.time < currentBarStart);
                if (closedBars.length > 0) {
                  chartRef.current?.incrementalUpdateCandles(closedBars);
                }
              }
            }
          }).catch(() => {});
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Start periodic order-book sampling for Heatmap Time Slices (every 250ms for buttery-smooth live edge)
    samplingTimerRef.current = (setInterval as any)(() => {
      if (document.visibilityState === 'hidden') return; // Guard against unnecessary background CPU/memory load while tab is hidden
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
        // Stream to Online Redis Hot Cache (zero client browser storage)
        indexedDBCache.queueSlice(symbol, slice);

        // Detect liquidity shifts
        if (prefs.showLiquidityShifts && prevSliceRef.current) {
          shiftDetector.detectShifts(prevSliceRef.current, slice);
        }
        prevSliceRef.current = slice;
      }
    }, 600);

    return () => {
      if (candleSyncTimerRef.current) {
        clearInterval(candleSyncTimerRef.current);
        candleSyncTimerRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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
  const handleOpenAbsorptionSettings = useCallback(() => setIsAbsorptionSettingsOpen(true), []);
  const handleOpenDiagnostics = useCallback(() => setIsDiagnosticsOpen(true), []);
  const handleOpenCacheModal = useCallback(() => setIsCacheModalOpen(true), []);
  const handleOpenGexTerminal = useCallback(() => setIsGexTerminalOpen(true), []);
  const handleToggleAITerminal = useCallback(() => setIsAITerminalExpanded((prev) => !prev), []);
  const handleOpenAIConfig = useCallback((initialProvider?: AIProvider) => {
    setSelectedAIConfigProvider(initialProvider);
    setIsAIConfigOpen(true);
  }, []);
  const handleSelectDrawingTool = useCallback((tool: PositionType | null) => {
    setActiveDrawingTool((prev) => (prev === tool ? null : tool));
  }, []);
  const handleClearDrawingTool = useCallback(() => {
    setActiveDrawingTool(null);
  }, []);

  // GEX Options Chain & Order Book Calculation Engine
  const fetchOptionsData = useCallback(async (symbol: string) => {
    setIsGexLoading(true);
    try {
      const ob = orderBookRef.current;
      const ex = preferencesRef.current.exchange;
      const lastBar = latestCandlesRef.current[latestCandlesRef.current.length - 1];
      const spot = ob.getLastTradedPrice() || ob.getStats().midPrice || ob.getBestBid() || (lastBar?.close || 0);

      const metrics = GexEngine.computeGexFromOrderBook(
        ob,
        symbol,
        spot,
        preferences.gex,
        ex,
        latestCandlesRef.current
      );
      setGexMetrics(metrics);

      const chain = OptionsDataProvider.createOptionChainFromOrderBook(
        ob,
        symbol,
        spot,
        ex,
        latestCandlesRef.current
      );
      setOptionChain(chain);
    } catch (err) {
      console.error('[TradingTerminal] Failed to calculate GEX metrics:', err);
      setOptionChain(null);
      setGexMetrics(null);
    } finally {
      setIsGexLoading(false);
    }
  }, [preferences.gex]);

  // Load option chain on symbol or exchange switch
  useEffect(() => {
    fetchOptionsData(preferences.symbol);
  }, [preferences.symbol, preferences.exchange, fetchOptionsData]);

  // Real-Time GEX recalculation as Order Book depth updates
  useEffect(() => {
    let lastCalcTime = 0;
    const unsub = orderBook.subscribe(() => {
      if (document.visibilityState === 'hidden') return;

      const now = Date.now();
      const prefs = preferencesRef.current;
      const isGexActive = prefs.showGex || prefs.showGexProfile || isGexTerminalOpen;
      const minInterval = isGexActive ? 400 : 2500;

      // Adaptive throttle: 400ms when GEX is actively inspected/visualized, 2500ms when idle
      if (now - lastCalcTime < minInterval) return;
      lastCalcTime = now;

      const sym = prefs.symbol;
      const ex = prefs.exchange;
      const gexSettings = prefs.gex;
      const lastBar = latestCandlesRef.current[latestCandlesRef.current.length - 1];
      const spot = orderBook.getLastTradedPrice() || orderBook.getStats().midPrice || orderBook.getBestBid() || (lastBar?.close || 0);

      const metrics = GexEngine.computeGexFromOrderBook(
        orderBook,
        sym,
        spot,
        gexSettings,
        ex,
        latestCandlesRef.current
      );
      setGexMetrics(metrics);

      const chain = OptionsDataProvider.createOptionChainFromOrderBook(
        orderBook,
        sym,
        spot,
        ex,
        latestCandlesRef.current
      );
      setOptionChain(chain);
    });
    return unsub;
  }, [orderBook, isGexTerminalOpen]);

  return (
    <div
      className="jarvis-trading-terminal"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100dvh',
        position: 'fixed',
        inset: 0,
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
        onOpenAbsorptionSettings={handleOpenAbsorptionSettings}
        onOpenDiagnostics={handleOpenDiagnostics}
        onOpenCacheModal={handleOpenCacheModal}
        onOpenGexTerminal={handleOpenGexTerminal}
        gexMetrics={gexMetrics}
        onLockTerminal={onLockTerminal}
        onOpenAIConfig={handleOpenAIConfig}
        onToggleAITerminal={handleToggleAITerminal}
        isAITerminalOpen={isAITerminalExpanded}
        activeDrawingTool={activeDrawingTool}
        onSelectDrawingTool={handleSelectDrawingTool}
      />

      {/* Main Terminal Viewport: Left AI Panel + Right Chart Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'row', position: 'relative', overflow: 'hidden' }}>
        <JarvisAITerminal
          symbol={preferences.symbol}
          timeframe={preferences.timeframe}
          candles={latestCandlesRef.current.length > 0 ? latestCandlesRef.current : renderedCandles}
          isExpanded={isAITerminalExpanded}
          onToggleExpand={handleToggleAITerminal}
          onOpenConfig={handleOpenAIConfig}
        />

        <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <JarvisChart
            ref={chartRef}
            candles={renderedCandles}
            preferences={preferences}
            orderBook={orderBook}
            heatmapEngine={heatmapEngine}
            bubbleManager={bubbleManager}
            shiftDetector={shiftDetector}
            colorMapEngine={colorMapEngine}
            footprintEngine={footprintEngine}
            absorptionEngine={absorptionEngine}
            onUpdatePreferences={handleUpdatePreferences}
            connectionState={connectionState}
            onLoadMoreHistory={handleLoadMoreHistory}
            activeDrawingTool={activeDrawingTool}
            onClearDrawingTool={handleClearDrawingTool}
            gexMetrics={gexMetrics}
            onOpenGexSettings={handleOpenGexTerminal}
          />
        </main>
      </div>

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

      <AbsorptionSettingsModal
        isOpen={isAbsorptionSettingsOpen}
        onClose={() => setIsAbsorptionSettingsOpen(false)}
        settings={preferences.absorption}
        onChange={(updated) => handleUpdatePreferences({ absorption: updated })}
        onReset={() => handleUpdatePreferences({ absorption: DEFAULT_ABSORPTION_SETTINGS })}
        absorptionEngine={absorptionEngine}
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
        orderBook={orderBook}
        metrics={latencyMetrics}
        onTriggerResync={() => {
          orderBook.reset();
          orderBook.synchronize(getAdapter(preferences.exchange), preferences.symbol);
        }}
      />

      <CacheSettingsModal
        isOpen={isCacheModalOpen}
        onClose={() => setIsCacheModalOpen(false)}
        onReloadHistory={() => loadCandles(preferences.symbol, preferences.timeframe)}
      />

      {/* JARVIS Multi-AI Engine Configuration Modal (Phase 1) */}
      <AIConfigModal
        isOpen={isAIConfigOpen}
        initialProvider={selectedAIConfigProvider}
        onClose={() => {
          setIsAIConfigOpen(false);
          setSelectedAIConfigProvider(undefined);
        }}
      />

      {/* GEX — Gamma Exposure Analytics & Scenario Terminal */}
      <GexTerminalModal
        isOpen={isGexTerminalOpen}
        onClose={() => setIsGexTerminalOpen(false)}
        symbol={preferences.symbol}
        currentSpotPrice={orderBook.getLastTradedPrice() || orderBook.getStats().midPrice || (latestCandlesRef.current[latestCandlesRef.current.length - 1]?.close || 0)}
        metrics={gexMetrics}
        settings={preferences.gex}
        onUpdateSettings={(patch) =>
          handleUpdatePreferences({ gex: { ...preferences.gex, ...patch } })
        }
        onRefresh={() => fetchOptionsData(preferences.symbol)}
        isLoading={isGexLoading}
        orderBook={orderBook}
        exchange={preferences.exchange}
      />
    </div>
  );
};
