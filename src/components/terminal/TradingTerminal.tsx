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
import { OrderBookDiagnosticsModal } from '../diagnostics/OrderBookDiagnosticsModal';
import { CacheSettingsModal } from '../settings/CacheSettingsModal';

import { BinanceAdapter } from '../../services/exchange/BinanceAdapter';
import { BybitAdapter } from '../../services/exchange/BybitAdapter';
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
import { mergeAndDeduplicateCandles } from '../../utils/candleUtils';

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
      if (savedSymbol) {
        return { ...DEFAULT_TERMINAL_PREFERENCES, symbol: savedSymbol };
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
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [isCacheModalOpen, setIsCacheModalOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Engine references
  const binanceAdapterRef = useRef<BinanceAdapter>(new BinanceAdapter());
  const bybitAdapterRef = useRef<BybitAdapter>(new BybitAdapter());
  const goldPriceDevAdapterRef = useRef<GoldPriceDevAdapter>(new GoldPriceDevAdapter());

  const getAdapter = useCallback((exchange: ExchangeId): IExchangeAdapter => {
    if (exchange === 'bybit') return bybitAdapterRef.current;
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
        const activeDefaults: TerminalPreferences = {
          ...DEFAULT_TERMINAL_PREFERENCES,
          ...stored,
          showBubbles: bubblesActive,
          showHeatmap: isFpMode ? false : (stored.showHeatmap ?? true),
          showDepthProfile: isFpMode ? false : true,
          showFootprint: isFpMode ? true : (stored.showFootprint ?? false),
          showBestBidAskLines: stored.showBestBidAskLines ?? false,
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

  // 2. Fetch Historical Candles (Instant Cache Render -> Async Fresh Sync -> Progressive Background Pagination)
  const loadCandles = useCallback(async (symbol: string, timeframe: any, exchange: ExchangeId = preferencesRef.current.exchange) => {
    const cacheKey = `${exchange}_${symbol}_${timeframe}`;
    const adapter = getAdapter(exchange);

    // Cancel any background pagination from previous symbol/timeframe
    if (progressiveTimerRef.current !== null) {
      window.clearTimeout(progressiveTimerRef.current);
      progressiveTimerRef.current = null;
    }

    // Step 1 & 2: Read cached candles from IndexedDB and render IMMEDIATELY
    try {
      let cached = await indexedDBCache.loadCandles(symbol, timeframe);
      if (cached && cached.length > 0) {
        // Purge any rogue cross-symbol outliers
        const sample = cached.slice(-30).map((c) => c.close).sort((a, b) => a - b);
        const median = sample[Math.floor(sample.length / 2)];
        if (median > 0) {
          cached = cached.filter((c) => c.close >= median * 0.3 && c.close <= median * 3.0);
        }

        if (symbol === preferencesRef.current.symbol && exchange === preferencesRef.current.exchange) {
          latestCandlesRef.current = cached;
          chartRef.current?.updateCandles(cached);
          bubbleManagerRef.current.setTimeframe(timeframe);
          bubbleManagerRef.current.seedFromCandles(cached);
          footprintEngineRef.current.setTimeframe(timeframe);
          footprintEngineRef.current.clear();
          footprintEngineRef.current.seedFromCandles(cached, orderBookRef.current);
          heatmapEngineRef.current.seedFromCandlesAndOrderBook(cached, orderBookRef.current);
        }
      }
    } catch (e) {
      console.warn('[TradingTerminal] Local cache read error:', e);
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
          // Discard if symbol/exchange changed while request was in-flight
          if (symbol !== preferencesRef.current.symbol || exchange !== preferencesRef.current.exchange) {
            return;
          }

          // Filter out cross-symbol outliers
          const sample = freshCandles.slice(-30).map((c) => c.close).sort((a, b) => a - b);
          const median = sample[Math.floor(sample.length / 2)];
          const validFresh = median > 0
            ? freshCandles.filter((c) => c.close >= median * 0.3 && c.close <= median * 3.0)
            : freshCandles;

          // Step 4: Merge and deduplicate results
          const merged = mergeAndDeduplicateCandles(latestCandlesRef.current, validFresh);
          latestCandlesRef.current = merged;

          // Step 5: Update the chart without resetting its entire time scale
          chartRef.current?.updateCandles(merged);
          indexedDBCache.saveCandles(symbol, timeframe, merged);

          const instrument = InstrumentRegistry.getInstrument(symbol);

          // Seed bubbles, footprint, and heatmap ONLY if supported by instrument
          if (instrument.supportsBubbles) {
            bubbleManagerRef.current.setTimeframe(timeframe);
            bubbleManagerRef.current.seedFromCandles(merged);
          } else {
            bubbleManagerRef.current.clear();
          }

          if (instrument.supportsFootprint) {
            footprintEngineRef.current.setTimeframe(timeframe);
            footprintEngineRef.current.clear();
            footprintEngineRef.current.seedFromCandles(merged, orderBookRef.current);
          } else {
            footprintEngineRef.current.clear();
          }

          if (instrument.supportsHeatmap) {
            heatmapEngineRef.current.seedFromCandlesAndOrderBook(merged, orderBookRef.current);
            heatmapEngineRef.current.seedHistoricalCandlesLiquidity(merged, symbol, exchange);
          } else {
            heatmapEngineRef.current.clear();
          }

          // Ingest recent trades if supported
          if (instrument.supportsTrades) {
            adapter.fetchRecentTrades(symbol, 1000).then((trades) => {
              if (symbol !== preferencesRef.current.symbol) return;
              trades.forEach((t) => {
                bubbleManagerRef.current.addTrade(t);
                footprintEngineRef.current.addTrade(t);
              });
            }).catch(() => {});

            // Fetch historical aggregate trades to populate recent historical footprints
            if (adapter.fetchAggTrades) {
              const oneHourAgo = Date.now() - 3600 * 1000;
              adapter.fetchAggTrades(symbol, oneHourAgo, Date.now(), 1000).then((aggTrades) => {
                if (symbol !== preferencesRef.current.symbol) return;
                footprintEngineRef.current.ingestTrades(aggTrades);
              }).catch(() => {});
            }
          }
        }

        // Step 7: Continue loading older history progressively in background (for intraday high-frequency streams)
        if (adapter.id === 'goldprice_dev') {
          return;
        }

        progressiveTimerRef.current = window.setTimeout(async () => {
          let currentList = latestCandlesRef.current;
          if (currentList.length === 0) return;
          let oldestTime = currentList[0].time * 1000;
          const oneMonthAgoMs = Date.now() - (30 * 24 * 3600 * 1000);
          const maxChunks = 15;

          for (let chunk = 0; chunk < maxChunks; chunk++) {
            if (oldestTime <= oneMonthAgoMs) break;
            if (symbol !== preferencesRef.current.symbol || exchange !== preferencesRef.current.exchange) break;
            try {
              // Yield thread between chunks to keep live stream silky smooth
              await new Promise((r) => setTimeout(r, 150));
              if (symbol !== preferencesRef.current.symbol || exchange !== preferencesRef.current.exchange) break;
              const olderBatch = await adapter.fetchHistoricalCandles(
                symbol,
                timeframe,
                undefined,
                oldestTime - 1000,
                1000
              );
              if (!olderBatch || olderBatch.length === 0) break;

              oldestTime = olderBatch[0].time * 1000;
              const mergedOlder = mergeAndDeduplicateCandles(olderBatch, latestCandlesRef.current);
              if (symbol !== preferencesRef.current.symbol) break;
              latestCandlesRef.current = mergedOlder;
              indexedDBCache.saveCandles(symbol, timeframe, mergedOlder);
              chartRef.current?.updateCandles(mergedOlder);
            } catch (err) {
              console.warn('[TradingTerminal] Progressive historical load finished or paused:', err);
              break;
            }
          }

          if (symbol === preferencesRef.current.symbol && latestCandlesRef.current.length > 0) {
            heatmapEngineRef.current.seedFromCandlesAndOrderBook(latestCandlesRef.current, orderBookRef.current);
            heatmapEngineRef.current.seedHistoricalCandlesLiquidity(latestCandlesRef.current, symbol, exchange);
          }
        }, 500);

      } catch (e) {
        console.warn('[TradingTerminal] Could not fetch remote klines:', e);
      } finally {
        inFlightCandleLoadsRef.current.delete(cacheKey);
      }
    })();

    inFlightCandleLoadsRef.current.set(cacheKey, fetchPromise);
    return fetchPromise;
  }, [getAdapter]);

  // 3. Connect to live market data and coordinate pipelines
  useEffect(() => {
    const exchange = preferences.exchange;
    const symbol = preferences.symbol;
    const adapter = getAdapter(exchange);
    const orderBook = orderBookRef.current;
    const heatmap = heatmapEngineRef.current;
    const bubbles = bubbleManagerRef.current;
    const shiftDetector = shiftDetectorRef.current;

    // Reset previous candle buffer and in-flight loads so different symbols never cross-contaminate!
    latestCandlesRef.current = [];
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

    const instrument = InstrumentRegistry.getInstrument(symbol);

    // Set tick size from instrument definition
    orderBook.setTickSize(instrument.priceTick);

    // Initial klines fetch for selected timeframe
    loadCandles(symbol, preferences.timeframe, exchange);

    // Start Order Book Snapshot and Sequence Synchronization ONLY if supported
    if (instrument.supportsOrderBook) {
      orderBook.synchronize(adapter, symbol).then(async () => {
        // Re-seed heatmap with synchronized order book + latest candles
        if (latestCandlesRef.current.length > 0 && instrument.supportsHeatmap) {
          heatmap.seedFromCandlesAndOrderBook(latestCandlesRef.current, orderBook);
          heatmap.seedHistoricalCandlesLiquidity(latestCandlesRef.current, symbol, exchange);
        }

        // Load genuine historical slices previously recorded for THIS symbol from IndexedDB
        try {
          const cachedSlices = await indexedDBCache.loadSlices(symbol);
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
        if (!instrument.supportsTrades) return;
        if (trade.symbol && trade.symbol.toUpperCase() !== preferencesRef.current.symbol.toUpperCase()) return;
        bubbles.addTrade(trade);
        shiftDetector.recordTrade(trade);
        heatmap.recordTrade(trade);
        footprintEngineRef.current.addTrade(trade);
        chartRef.current?.updateTickPrice(trade.price, trade.timestamp);
      },
      onKline: (candle) => {
        if (symbol.toUpperCase() !== preferencesRef.current.symbol.toUpperCase()) return;
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

    // Start periodic order-book sampling for Heatmap Time Slices (every 1000ms only when heatmap or shifts active)
    samplingTimerRef.current = window.setInterval(() => {
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
    }, 1000);

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
  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

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
        onZoomIn={() => chartRef.current?.zoomIn()}
        onZoomOut={() => chartRef.current?.zoomOut()}
        onResetView={() => chartRef.current?.resetView()}
        onJumpToLatest={() => chartRef.current?.jumpToLatest()}
        onToggleFullscreen={handleToggleFullscreen}
        isFullscreen={isFullscreen}
        onOpenHeatmapSettings={() => setIsHeatmapSettingsOpen(true)}
        onOpenBubbleSettings={() => setIsBubbleSettingsOpen(true)}
        onOpenDepthProfileSettings={() => setIsDepthProfileSettingsOpen(true)}
        onOpenFootprintSettings={() => setIsFootprintSettingsOpen(true)}
        onOpenDiagnostics={() => setIsDiagnosticsOpen(true)}
        onOpenCacheModal={() => setIsCacheModalOpen(true)}
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
