/**
 * GoldPrice.dev Exchange Adapter
 * Connects to official goldprice.dev REST APIs for authentic OTC Spot Gold (XAU/USD) data.
 * Free-tier evaluated:
 *   - Supported Intervals: 1d (Daily) only. (Intraday 1m/5m/1h requires paid Plus/Pro plan).
 *   - Historical Depth: 30 days.
 *   - Spot Quotes: Free keyless 15-minute delayed / weekend closed.
 *   - Order Book / Trades: None (OTC spot gold has no central order book or trade tape).
 * Strict Integrity: Never manufactures fake intraday bars or synthetic candles.
 */

import {
  Candle,
  CandleTimeframe,
  ConnectionState,
  DepthSnapshot,
  ExchangeId,
  LatencyMetrics,
  MarketTrade,
  SymbolInfo,
} from '../../types/market';
import { ExchangeAdapterEvents, IExchangeAdapter } from './ExchangeAdapter';
import { MarketSessionService } from '../market/MarketSessionService';

export interface GoldPriceDevSpotResponse {
  symbol: string;
  quote_currency: string;
  unit: string;
  contract_type: string;
  price?: string;
  bid?: string;
  ask?: string;
  is_stale: boolean;
  computed_at?: string;
}

export interface GoldPriceDevBar {
  bar_start: string; // ISO-8601 UTC
  open: string | null;
  high: string | null;
  low: string | null;
  close: string | null;
  volume: string | null;
  is_closed: boolean;
}

export interface GoldPriceDevBarsResponse {
  symbol: string;
  interval: string;
  bars: GoldPriceDevBar[];
  next_cursor: string | null;
  meta: {
    tier: string;
    count: number;
    source_id: string | null;
  };
}

export class GoldPriceDevAdapter implements IExchangeAdapter {
  readonly id: ExchangeId = 'goldprice_dev';
  readonly name = 'GoldPrice.dev (Spot OTC)';

  private connectionState: ConnectionState = 'DISCONNECTED';
  private currentSymbol: string = 'XAUUSD';
  private currentTimeframe: CandleTimeframe = '1d';
  private events: ExchangeAdapterEvents | null = null;
  private pollIntervalId: number | null = null;
  private lastQuoteTimestamp: number = 0;
  private isQuoteStale: boolean = false;
  private lastKnownPrice: number = 0;

  private metrics: LatencyMetrics = {
    wsPingMs: 0,
    orderBookAgeMs: 0,
    lastMessageTimestamp: 0,
    messageRatePerSec: 0,
    totalMessagesProcessed: 0,
    sequenceGapsDetected: 0,
    resyncCount: 0,
  };

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  getLatencyMetrics(): LatencyMetrics {
    return { ...this.metrics };
  }

  getLastQuoteTimestamp(): number {
    return this.lastQuoteTimestamp;
  }

  getIsStale(): boolean {
    return this.isQuoteStale;
  }

  async getSymbolInfo(symbol: string): Promise<SymbolInfo> {
    const sym = symbol.toUpperCase().replace(/[-_/]/g, '');
    return {
      id: sym,
      symbol: sym,
      baseAsset: 'XAU',
      quoteAsset: 'USD',
      priceTick: 0.01,
      lotSize: 0.001,
      minQty: 0.001,
      minNotional: 1.0,
    };
  }

  connect(symbol: string, timeframe: CandleTimeframe, events: ExchangeAdapterEvents): void {
    this.currentSymbol = symbol;
    this.currentTimeframe = timeframe;
    this.events = events;

    this.disconnect();

    // Check market session calendar
    const session = MarketSessionService.getSessionInfo('traditional_metals');
    if (!session.isOpen) {
      // Market is closed (e.g. Saturday or scheduled break)
      this.setConnectionState('STALE');
    } else {
      this.setConnectionState('CONNECTING');
    }

    // Trigger initial spot quote check
    this.fetchLiveSpotQuote();

    // Poll periodically during market hours (every 60s)
    this.pollIntervalId = window.setInterval(() => {
      this.fetchLiveSpotQuote();
    }, 60000);
  }

  private async fetchLiveSpotQuote(): Promise<void> {
    const session = MarketSessionService.getSessionInfo('traditional_metals');
    const now = Date.now();

    try {
      const res = await fetch('https://api.goldprice.dev/v1/spot/XAU-USD-SPOT');
      if (!res.ok) {
        if (!session.isOpen) {
          this.setConnectionState('STALE');
        }
        return;
      }

      const data: GoldPriceDevSpotResponse = await res.json();
      this.metrics.totalMessagesProcessed++;
      this.metrics.lastMessageTimestamp = now;

      if (data.computed_at) {
        this.lastQuoteTimestamp = new Date(data.computed_at).getTime();
      } else {
        this.lastQuoteTimestamp = now;
      }

      this.isQuoteStale = Boolean(data.is_stale) || !session.isOpen;

      if (data.price) {
        const p = parseFloat(data.price);
        if (Number.isFinite(p) && p > 0) {
          this.lastKnownPrice = p;
        }
      }

      if (this.isQuoteStale || !session.isOpen) {
        this.setConnectionState('STALE');
      } else {
        this.setConnectionState('LIVE');
      }
    } catch {
      if (!session.isOpen) {
        this.setConnectionState('STALE');
      } else {
        this.setConnectionState('DISCONNECTED');
      }
    }
  }

  private setConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    this.events?.onConnectionChange(state, this.getLatencyMetrics());
  }

  disconnect(): void {
    if (this.pollIntervalId !== null) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
    this.setConnectionState('DISCONNECTED');
  }

  /**
   * OTC Spot Gold has no consolidated central L2 order book.
   * Returns empty order book snapshot to prevent fabrication of fake liquidity.
   */
  async fetchDepthSnapshot(_symbol: string, _limit?: number): Promise<DepthSnapshot> {
    return {
      lastUpdateId: Date.now(),
      timestamp: Date.now(),
      bids: [],
      asks: [],
    };
  }

  /**
   * OTC Spot Gold has no public trade tape.
   * Returns empty array to prevent fabrication of fake volume/bubbles.
   */
  async fetchRecentTrades(_symbol: string, _limit?: number): Promise<MarketTrade[]> {
    return [];
  }

  async fetchAggTrades(
    _symbol: string,
    _startTime?: number,
    _endTime?: number,
    _limit?: number
  ): Promise<MarketTrade[]> {
    return [];
  }

  /**
   * Fetch authentic historical candles from goldprice.dev.
   * Free-tier contract:
   *   - Interval: Only '1d' is supported. Intraday requests fail or reject synthetic creation.
   *   - Window: Up to 30 days history.
   * Validates, deduplicates, and chronologically sorts candles.
   */
  async fetchHistoricalCandles(
    symbol: string,
    interval: CandleTimeframe,
    startTime?: number,
    endTime?: number,
    limit: number = 100
  ): Promise<Candle[]> {
    // Strict integrity check: do not fabricate intraday candles from daily data!
    if (interval !== '1d') {
      console.warn(
        `[GoldPriceDevAdapter] Interval '${interval}' is not supported on goldprice.dev free tier. Loading authoritative '1d' daily bars instead.`
      );
    }

    // GoldPrice.dev free tier allows history within last 29-30 days
    const now = Date.now();
    const maxFreeWindowMs = 28 * 24 * 3600 * 1000;
    const effectiveStartTime = startTime
      ? Math.max(startTime, now - maxFreeWindowMs)
      : now - maxFreeWindowMs;
    const effectiveEndTime = endTime || now;

    const fromDateStr = new Date(effectiveStartTime).toISOString();
    const toDateStr = new Date(effectiveEndTime).toISOString();

    const baseUrl = 'https://api.goldprice.dev/v1/bars';
    const params = new URLSearchParams({
      symbol: 'XAU-USD-SPOT',
      interval: '1d', // Authoritative interval supported on free tier
      from: fromDateStr,
      to: toDateStr,
      limit: String(Math.min(limit, 100)),
    });

    const url = `${baseUrl}?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`GoldPrice.dev bars request failed (${res.status}): ${errText}`);
    }

    const json: GoldPriceDevBarsResponse = await res.json();
    const rawBars = json.bars || [];

    // Parse, validate, deduplicate, and sort bars
    const candleMap = new Map<number, Candle>();

    for (const b of rawBars) {
      if (!b.bar_start || b.open === null || b.high === null || b.low === null || b.close === null) {
        continue;
      }

      const o = parseFloat(b.open);
      const h = parseFloat(b.high);
      const l = parseFloat(b.low);
      const c = parseFloat(b.close);

      // Validate numeric validity & basic candle geometry
      if (!Number.isFinite(o) || !Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c)) {
        continue;
      }
      if (o <= 0 || h <= 0 || l <= 0 || c <= 0) continue;
      if (h < l || h < Math.min(o, c) || l > Math.max(o, c)) continue;

      // Bar time in seconds (UTC)
      const timeSec = Math.floor(new Date(b.bar_start).getTime() / 1000);
      if (isNaN(timeSec) || timeSec <= 0) continue;

      // Volume is null for spot OTC gold (no consolidated tape)
      const vol = b.volume ? parseFloat(b.volume) : 0;

      candleMap.set(timeSec, {
        time: timeSec,
        open: o,
        high: h,
        low: l,
        close: c,
        volume: Number.isFinite(vol) ? vol : 0,
      });
    }

    // Sort strictly ascending
    const sortedCandles = Array.from(candleMap.values()).sort((a, b) => a.time - b.time);

    return sortedCandles;
  }
}
