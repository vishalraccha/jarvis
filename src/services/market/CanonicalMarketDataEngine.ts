/**
 * JARVIS 2.0 Canonical Market Data Engine
 * 
 * Strict authoritative market data pipeline for each instrument and market.
 * Enforces:
 * 1. Zero price fabrication, zero synthetic basis offsets, zero arbitrary wick alteration.
 * 2. Proper OHLC candle construction and strict mathematical invariants.
 * 3. Controlled historical-to-live reconciliation with event buffering.
 * 4. Transparent data quality telemetry (latency, freshness, reconnection tracking).
 */

import { Candle, CandleTimeframe, ConnectionState, ExchangeId, LatencyMetrics, MarketTrade } from '../../types/market';
import { TIMEFRAME_SECONDS } from '../../utils/candleUtils';

export type MarketType = 'spot' | 'linear_perpetual' | 'commodity_futures' | 'index_cfd' | 'spot_forex';
export type CandleConstructionMethod = 'traded_ticks' | 'bid_ask_midpoint';

export interface CanonicalInstrumentSpecs {
  symbol: string;
  providerSymbol: string;
  exchangeId: ExchangeId;
  providerName: string;
  marketType: MarketType;
  quoteCurrency: string;
  priceTick: number;
  lotSize: number;
  candleConstruction: CandleConstructionMethod;
  tradingviewSymbol?: string;
  mt5Symbol?: string;
}

export interface PipelineDataQuality {
  source: string;
  sourceSymbol: string;
  lastUpdateTimestamp: number;
  receiveTimestamp: number;
  feedLatencyMs: number;
  dataAgeMs: number;
  connectionState: ConnectionState;
  reconnectCount: number;
  validationStatus: 'VALID' | 'WARNING' | 'CORRUPTED';
  syncStatus: 'INITIALIZING' | 'RECONCILING' | 'SYNCHRONIZED' | 'STALE';
  orderBookFreshnessMs: number;
  isStale: boolean;
  staleReason?: string;
  validationMessage?: string;
}

export interface CanonicalMarketPipeline {
  specs: CanonicalInstrumentSpecs;
  timeframe: CandleTimeframe;
  currentBid: number;
  currentAsk: number;
  lastTradedPrice: number;
  lastTickTimestamp: number;
  serverReceiveTimestamp: number;
  historicalCandles: Candle[];
  activeCandle: Candle | null;
  dataQuality: PipelineDataQuality;
}

export type PipelineEventListener = (pipeline: CanonicalMarketPipeline) => void;

export class CanonicalMarketDataEngine {
  private pipelines: Map<string, CanonicalMarketPipeline> = new Map();
  private pendingTickBuffers: Map<string, MarketTrade[]> = new Map();
  private listeners: Set<PipelineEventListener> = new Set();
  private maxStoredCandles = 500;

  public subscribe(listener: PipelineEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(pipeline: CanonicalMarketPipeline): void {
    for (const l of this.listeners) {
      try {
        l(pipeline);
      } catch (err) {
        console.error('[CanonicalMarketDataEngine] Listener error:', err);
      }
    }
  }

  private getPipelineKey(symbol: string, timeframe: CandleTimeframe): string {
    return `${symbol.toUpperCase().replace(/[-_/]/g, '')}_${timeframe}`;
  }

  /**
   * Register or acquire a canonical market data pipeline for an instrument & timeframe
   */
  public getOrCreatePipeline(
    specs: CanonicalInstrumentSpecs,
    timeframe: CandleTimeframe
  ): CanonicalMarketPipeline {
    const key = this.getPipelineKey(specs.symbol, timeframe);
    let pipeline = this.pipelines.get(key);

    if (!pipeline) {
      pipeline = {
        specs,
        timeframe,
        currentBid: 0,
        currentAsk: 0,
        lastTradedPrice: 0,
        lastTickTimestamp: 0,
        serverReceiveTimestamp: 0,
        historicalCandles: [],
        activeCandle: null,
        dataQuality: {
          source: specs.providerName,
          sourceSymbol: specs.providerSymbol,
          lastUpdateTimestamp: 0,
          receiveTimestamp: 0,
          feedLatencyMs: 0,
          dataAgeMs: 0,
          connectionState: 'CONNECTING',
          reconnectCount: 0,
          validationStatus: 'VALID',
          syncStatus: 'INITIALIZING',
          orderBookFreshnessMs: 0,
          isStale: false,
        },
      };
      this.pipelines.set(key, pipeline);
      this.pendingTickBuffers.set(key, []);
    }

    return pipeline;
  }

  public getPipeline(symbol: string, timeframe: CandleTimeframe): CanonicalMarketPipeline | undefined {
    return this.pipelines.get(this.getPipelineKey(symbol, timeframe));
  }

  /**
   * Strictly validate OHLC candle invariants:
   * - High >= max(Open, Close, Low)
   * - Low <= min(Open, Close, High)
   * - Open, High, Low, Close are finite positive numbers
   * - Time is aligned to interval boundary
   */
  public validateCandle(c: Candle, timeframe?: CandleTimeframe): { valid: boolean; reason?: string } {
    if (!c || !Number.isFinite(c.time) || c.time <= 0) {
      return { valid: false, reason: 'Invalid or non-positive timestamp' };
    }
    if (
      !Number.isFinite(c.open) || c.open <= 0 ||
      !Number.isFinite(c.high) || c.high <= 0 ||
      !Number.isFinite(c.low) || c.low <= 0 ||
      !Number.isFinite(c.close) || c.close <= 0
    ) {
      return { valid: false, reason: 'Non-finite or non-positive OHLC values' };
    }
    if (c.high < c.low) {
      return { valid: false, reason: `High (${c.high}) is less than Low (${c.low})` };
    }
    if (c.high < c.open || c.high < c.close) {
      return { valid: false, reason: `High (${c.high}) is less than Open (${c.open}) or Close (${c.close})` };
    }
    if (c.low > c.open || c.low > c.close) {
      return { valid: false, reason: `Low (${c.low}) is greater than Open (${c.open}) or Close (${c.close})` };
    }
    if (c.volume !== undefined && (!Number.isFinite(c.volume) || c.volume < 0)) {
      return { valid: false, reason: `Invalid volume (${c.volume})` };
    }

    if (timeframe) {
      const tfSec = TIMEFRAME_SECONDS[timeframe] || 60;
      const expectedAlignment = Math.floor(c.time / tfSec) * tfSec;
      if (Math.abs(c.time - expectedAlignment) > 1) {
        return { valid: false, reason: `Timestamp ${c.time} not aligned to ${timeframe} boundary (${expectedAlignment})` };
      }
    }

    return { valid: true };
  }

  /**
   * Step 1: Ingest Authoritative Historical Candles from Provider.
   * Validates each bar, enforces chronological ordering, filters duplicates,
   * and drains any buffered live ticks into the forming bar.
   */
  public ingestHistoricalCandles(
    symbol: string,
    timeframe: CandleTimeframe,
    rawCandles: Candle[]
  ): CanonicalMarketPipeline {
    const key = this.getPipelineKey(symbol, timeframe);
    let pipeline = this.pipelines.get(key);
    if (!pipeline) {
      throw new Error(`Pipeline not initialized for ${symbol} ${timeframe}`);
    }

    const tfSec = TIMEFRAME_SECONDS[timeframe] || 60;
    const validBars: Candle[] = [];

    for (const raw of rawCandles) {
      const alignedTime = Math.floor(raw.time / tfSec) * tfSec;
      const bar: Candle = {
        time: alignedTime,
        open: raw.open,
        high: raw.high,
        low: raw.low,
        close: raw.close,
        volume: raw.volume || 0,
      };

      const check = this.validateCandle(bar, timeframe);
      if (check.valid) {
        validBars.push(bar);
      } else {
        console.warn(`[CanonicalMarketDataEngine] Discarded invalid candle for ${symbol}:`, check.reason, raw);
      }
    }

    // Sort chronologically and deduplicate by time (latest entry at same time wins)
    const map = new Map<number, Candle>();
    for (const b of validBars) {
      map.set(b.time, b);
    }
    const sorted = Array.from(map.values()).sort((a, b) => a.time - b.time);

    if (sorted.length === 0) {
      pipeline.dataQuality.validationStatus = 'WARNING';
      pipeline.dataQuality.validationMessage = 'No valid historical candles retrieved from provider.';
      this.notify(pipeline);
      return pipeline;
    }

    // Bound historical memory to maxStoredCandles
    const bounded = sorted.slice(-this.maxStoredCandles);
    const lastBar = bounded[bounded.length - 1];
    const nowSec = Math.floor(Date.now() / 1000);
    const currentBarStart = Math.floor(nowSec / tfSec) * tfSec;

    // Distinguish closed historical bars from currently forming bar
    if (lastBar.time === currentBarStart) {
      pipeline.historicalCandles = bounded.slice(0, -1);
      pipeline.activeCandle = { ...lastBar };
    } else {
      pipeline.historicalCandles = bounded;
      // Initialize fresh active candle using latest close if currently in new interval
      if (nowSec >= lastBar.time + tfSec) {
        pipeline.activeCandle = {
          time: currentBarStart,
          open: lastBar.close,
          high: lastBar.close,
          low: lastBar.close,
          close: lastBar.close,
          volume: 0,
        };
      } else {
        pipeline.activeCandle = null;
      }
    }

    // Step 2: Reconcile buffered live ticks that arrived while historical fetch was in-flight
    const buffer = this.pendingTickBuffers.get(key) || [];
    if (buffer.length > 0) {
      const lastHistTime = pipeline.historicalCandles.length > 0
        ? pipeline.historicalCandles[pipeline.historicalCandles.length - 1].time
        : 0;

      for (const trade of buffer) {
        const tradeSec = Math.floor((trade.timestamp || Date.now()) / 1000);
        // Only apply ticks that are newer than finalized historical bars
        if (tradeSec >= lastHistTime) {
          this.processTradeTick(pipeline, trade);
        }
      }
      this.pendingTickBuffers.set(key, []);
    }

    pipeline.dataQuality.syncStatus = 'SYNCHRONIZED';
    pipeline.dataQuality.validationStatus = 'VALID';
    pipeline.dataQuality.validationMessage = undefined;
    pipeline.dataQuality.receiveTimestamp = Date.now();

    this.notify(pipeline);
    return pipeline;
  }

  /**
   * Process a live trade tick into the canonical pipeline.
   * Guarantees:
   * 1. No artificial wick clipping: High and Low expand authentically.
   * 2. High and Low NEVER shrink on ticks.
   * 3. Volume is strictly accumulated.
   * 4. Open is the first valid price in the interval.
   */
  public ingestTrade(symbol: string, timeframe: CandleTimeframe, trade: MarketTrade): void {
    const key = this.getPipelineKey(symbol, timeframe);
    const pipeline = this.pipelines.get(key);

    if (!pipeline) return;

    if (!trade || !Number.isFinite(trade.price) || trade.price <= 0) {
      return;
    }

    // If still initializing historical data, buffer trade to prevent race condition
    if (pipeline.dataQuality.syncStatus === 'INITIALIZING') {
      const buf = this.pendingTickBuffers.get(key) || [];
      buf.push(trade);
      if (buf.length > 500) buf.shift(); // Bound memory
      this.pendingTickBuffers.set(key, buf);
      return;
    }

    this.processTradeTick(pipeline, trade);
  }

  private processTradeTick(pipeline: CanonicalMarketPipeline, trade: MarketTrade): void {
    const now = Date.now();
    const tradeSec = Math.floor((trade.timestamp || now) / 1000);
    const tfSec = TIMEFRAME_SECONDS[pipeline.timeframe] || 60;
    const barTime = Math.floor(tradeSec / tfSec) * tfSec;

    pipeline.lastTradedPrice = trade.price;
    pipeline.lastTickTimestamp = trade.timestamp || now;
    pipeline.serverReceiveTimestamp = now;

    // Update Telemetry
    pipeline.dataQuality.lastUpdateTimestamp = trade.timestamp || now;
    pipeline.dataQuality.receiveTimestamp = now;
    pipeline.dataQuality.feedLatencyMs = Math.max(0, now - (trade.timestamp || now));
    pipeline.dataQuality.dataAgeMs = Math.max(0, now - (trade.timestamp || now));
    pipeline.dataQuality.isStale = false;

    // Candle Construction
    if (!pipeline.activeCandle) {
      pipeline.activeCandle = {
        time: barTime,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        volume: trade.quantity || 0,
      };
    } else if (pipeline.activeCandle.time === barTime) {
      // Continuing same interval: expand high/low, update close, accumulate volume
      // High and Low NEVER disappear or shrink
      pipeline.activeCandle.high = Math.max(pipeline.activeCandle.high, trade.price);
      pipeline.activeCandle.low = Math.min(pipeline.activeCandle.low, trade.price);
      pipeline.activeCandle.close = trade.price;
      pipeline.activeCandle.volume = (pipeline.activeCandle.volume || 0) + (trade.quantity || 0);
    } else if (pipeline.activeCandle.time < barTime) {
      // Bar completed: finalize previous bar into historicalCandles and open new bar
      const finalized = { ...pipeline.activeCandle };
      const validation = this.validateCandle(finalized, pipeline.timeframe);
      if (validation.valid) {
        pipeline.historicalCandles.push(finalized);
        if (pipeline.historicalCandles.length > this.maxStoredCandles) {
          pipeline.historicalCandles.shift();
        }
      }

      // Open new bar: open is this first trade's authentic executed price (NOT artificial prevClose)
      pipeline.activeCandle = {
        time: barTime,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        volume: trade.quantity || 0,
      };
    }

    this.notify(pipeline);
  }

  /**
   * Ingest Authoritative Kline from Exchange WebSocket
   * Used to reconcile live forming candle with provider calculations.
   */
  public ingestKlineUpdate(symbol: string, timeframe: CandleTimeframe, kline: Candle): void {
    const key = this.getPipelineKey(symbol, timeframe);
    const pipeline = this.pipelines.get(key);
    if (!pipeline) return;

    const validation = this.validateCandle(kline);
    if (!validation.valid) {
      console.warn(`[CanonicalMarketDataEngine] Rejected invalid kline for ${symbol}:`, validation.reason);
      return;
    }

    const tfSec = TIMEFRAME_SECONDS[pipeline.timeframe] || 60;
    const alignedTime = Math.floor(kline.time / tfSec) * tfSec;

    if (!pipeline.activeCandle || pipeline.activeCandle.time < alignedTime) {
      if (pipeline.activeCandle) {
        pipeline.historicalCandles.push({ ...pipeline.activeCandle });
        if (pipeline.historicalCandles.length > this.maxStoredCandles) {
          pipeline.historicalCandles.shift();
        }
      }
      pipeline.activeCandle = {
        time: alignedTime,
        open: kline.open,
        high: kline.high,
        low: kline.low,
        close: kline.close,
        volume: kline.volume || 0,
      };
    } else if (pipeline.activeCandle.time === alignedTime) {
      // Reconcile: Preserve the higher high and lower low between local tape and provider
      pipeline.activeCandle.open = pipeline.activeCandle.open > 0 ? pipeline.activeCandle.open : kline.open;
      pipeline.activeCandle.high = Math.max(pipeline.activeCandle.high, kline.high);
      pipeline.activeCandle.low = Math.min(pipeline.activeCandle.low, kline.low);
      pipeline.activeCandle.close = kline.close;
      pipeline.activeCandle.volume = Math.max(pipeline.activeCandle.volume || 0, kline.volume || 0);
    }

    pipeline.lastTradedPrice = kline.close;
    pipeline.dataQuality.lastUpdateTimestamp = Date.now();
    pipeline.dataQuality.dataAgeMs = 0;
    pipeline.dataQuality.isStale = false;

    this.notify(pipeline);
  }

  /**
   * Ingest Best Bid / Best Ask
   */
  public ingestQuote(symbol: string, timeframe: CandleTimeframe, bid: number, ask: number): void {
    const key = this.getPipelineKey(symbol, timeframe);
    const pipeline = this.pipelines.get(key);
    if (!pipeline) return;

    if (Number.isFinite(bid) && bid > 0) pipeline.currentBid = bid;
    if (Number.isFinite(ask) && ask > 0) pipeline.currentAsk = ask;
    pipeline.dataQuality.orderBookFreshnessMs = Date.now() - pipeline.dataQuality.lastUpdateTimestamp;

    // For bid/ask midpoint feeds where trade ticks do not exist:
    if (pipeline.specs.candleConstruction === 'bid_ask_midpoint' && bid > 0 && ask > 0) {
      const mid = Math.round(((bid + ask) / 2) * 100000) / 100000;
      this.ingestTrade(symbol, timeframe, {
        id: String(Date.now()),
        timestamp: Date.now(),
        price: mid,
        quantity: 1,
        notional: mid,
        side: 'buy',
        isBuyerMaker: false,
        exchange: pipeline.specs.exchangeId,
        symbol: pipeline.specs.symbol,
        marketType: pipeline.specs.marketType,
      });
    }
  }

  /**
   * Update Connection and Latency Metrics
   */
  public updateConnectionState(
    symbol: string,
    timeframe: CandleTimeframe,
    state: ConnectionState,
    metrics?: LatencyMetrics
  ): void {
    const key = this.getPipelineKey(symbol, timeframe);
    const pipeline = this.pipelines.get(key);
    if (!pipeline) return;

    pipeline.dataQuality.connectionState = state;
    if (metrics) {
      pipeline.dataQuality.feedLatencyMs = metrics.wsPingMs;
      pipeline.dataQuality.reconnectCount = metrics.resyncCount;
    }
    if (state === 'CONNECTING') {
      pipeline.dataQuality.reconnectCount++;
    }
    this.notify(pipeline);
  }

  /**
   * Health & Staleness Check (invoked periodically by watchdog)
   */
  public evaluateFreshness(symbol: string, timeframe: CandleTimeframe, maxAllowedAgeMs: number = 10000): void {
    const key = this.getPipelineKey(symbol, timeframe);
    const pipeline = this.pipelines.get(key);
    if (!pipeline) return;

    const now = Date.now();
    const age = now - pipeline.dataQuality.lastUpdateTimestamp;
    pipeline.dataQuality.dataAgeMs = age;

    if (pipeline.dataQuality.lastUpdateTimestamp > 0 && age > maxAllowedAgeMs) {
      pipeline.dataQuality.isStale = true;
      pipeline.dataQuality.staleReason = `Feed latency exceeded ${Math.round(age / 1000)}s without live ticks.`;
    } else {
      pipeline.dataQuality.isStale = false;
      pipeline.dataQuality.staleReason = undefined;
    }

    this.notify(pipeline);
  }
}

export const canonicalMarketDataEngine = new CanonicalMarketDataEngine();
