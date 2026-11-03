/**
 * JARVIS Footprint Chart, Delta, POC & Imbalance Engine
 * High-performance, tick-aligned order-flow aggregation & real-time analytics
 */

import { Candle, CandleTimeframe, MarketTrade } from '../../types/market';
import { OrderBookManager } from '../orderbook/OrderBookManager';
import {
  FootprintCandle,
  FootprintLevel,
  FootprintSettings,
  VolumeProfileLevel,
  VolumeProfileResult,
} from '../../types/footprint';
import { DEFAULT_FOOTPRINT_SETTINGS } from '../../types/settings';

export const TIMEFRAME_SECONDS: Record<CandleTimeframe, number> = {
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

export function getSymbolDefaultFootprintTick(symbol: string): number {
  const sym = symbol.toUpperCase().replace(/[-_/]/g, '');
  if (sym.startsWith('BTC')) return 10.0; // $10 tick bucket for BTC (matches professional order flow & Image 2)
  if (sym.startsWith('ETH')) return 1.0;  // $1 tick bucket for ETH
  if (sym.startsWith('SOL')) return 0.5;  // $0.5 tick bucket for SOL
  if (sym.startsWith('BNB')) return 1.0;  // $1 tick bucket for BNB
  if (sym.startsWith('XAU') || sym.startsWith('GOLD')) return 1.0; // $1 tick bucket for Gold
  if (sym.startsWith('NAS') || sym === 'NDX' || sym === 'US100') return 2.0; // $2 tick bucket for Nasdaq 100
  return 1.0;
}

export class FootprintEngine {
  private symbol: string = 'BTCUSDT';
  private exchange: string = 'binance';
  private timeframe: CandleTimeframe = '5m';
  private tickSize: number = 0.01;
  private settings: FootprintSettings = { ...DEFAULT_FOOTPRINT_SETTINGS };
  private orderBook: OrderBookManager | null = null;

  // Candle store: candleStartSec -> FootprintCandle
  private candles: Map<number, FootprintCandle> = new Map();
  // Sorted array of candle start timestamps for quick binary search
  private sortedCandleTimes: number[] = [];

  // Trade deduplication set: keeps recent trade IDs to prevent double counting
  private seenTradeIds: Set<string> = new Set();
  private tradeIdOrder: string[] = [];
  private readonly MAX_SEEN_TRADES = 5000;

  // Track earliest trade timestamp processed
  private earliestTradeTimeMs: number | null = null;
  private latestTradeTimeMs: number | null = null;

  // Lightweight pub/sub listeners for zero-polling, event-driven canvas redraws
  private listeners: Set<() => void> = new Set();

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private isNotifyPending: boolean = false;

  public notifyListeners(immediate: boolean = false): void {
    if (immediate || typeof requestAnimationFrame === 'undefined') {
      for (const listener of this.listeners) {
        try {
          listener();
        } catch (err) {
          console.error('[FootprintEngine] Listener error:', err);
        }
      }
      return;
    }

    if (this.isNotifyPending) return;
    this.isNotifyPending = true;

    requestAnimationFrame(() => {
      this.isNotifyPending = false;
      for (const listener of this.listeners) {
        try {
          listener();
        } catch (err) {
          console.error('[FootprintEngine] Listener error:', err);
        }
      }
    });
  }

  constructor(symbol: string = 'BTCUSDT', timeframe: CandleTimeframe = '5m', tickSize: number = 0.01) {
    this.symbol = symbol.toUpperCase();
    this.timeframe = timeframe;
    this.tickSize = tickSize > 0 ? tickSize : getSymbolDefaultFootprintTick(symbol);
  }

  public setSymbol(symbol: string, exchange: string = 'binance', tickSize?: number): void {
    const cleanSym = symbol.toUpperCase();
    if (this.symbol !== cleanSym || this.exchange !== exchange) {
      this.symbol = cleanSym;
      this.exchange = exchange;
      if (tickSize && tickSize > 0) {
        this.tickSize = tickSize;
      }
      this.clear();
    } else if (tickSize && tickSize > 0 && this.tickSize !== tickSize) {
      this.tickSize = tickSize;
      this.reaggregateAllCandles();
    }
  }

  public setTimeframe(timeframe: CandleTimeframe): void {
    if (this.timeframe !== timeframe) {
      this.timeframe = timeframe;
      this.clear();
    }
  }

  public setTickSize(tickSize: number): void {
    if (tickSize > 0 && this.tickSize !== tickSize) {
      this.tickSize = tickSize;
      this.reaggregateAllCandles();
    }
  }

  public updateSettings(newSettings: Partial<FootprintSettings>): void {
    const oldMultiplier = this.settings.tickMultiplier;
    const oldRatio = this.settings.imbalanceRatio;
    const oldMinVol = this.settings.minImbalanceVolume;
    const oldStacked = this.settings.stackedImbalanceMinLevels;

    this.settings = { ...this.settings, ...newSettings };

    const needsReaggregation = this.settings.tickMultiplier !== oldMultiplier;
    const needsImbalanceRecalc =
      needsReaggregation ||
      this.settings.imbalanceRatio !== oldRatio ||
      this.settings.minImbalanceVolume !== oldMinVol ||
      this.settings.stackedImbalanceMinLevels !== oldStacked;

    if (needsReaggregation) {
      this.reaggregateAllCandles();
    } else if (needsImbalanceRecalc) {
      this.recalculateAllImbalances();
    }
  }

  public getSettings(): FootprintSettings {
    return { ...this.settings };
  }

  public setOrderBook(orderBook: OrderBookManager | null): void {
    this.orderBook = orderBook;
  }

  public getOrderBook(): OrderBookManager | null {
    return this.orderBook;
  }

  public getFootprintStartTime(): number | null {
    return this.earliestTradeTimeMs;
  }

  public clear(): void {
    this.candles.clear();
    this.sortedCandleTimes = [];
    this.seenTradeIds.clear();
    this.tradeIdOrder = [];
    this.earliestTradeTimeMs = null;
    this.latestTradeTimeMs = null;
    this.notifyListeners();
  }

  /**
   * Safe decimal tick alignment to eliminate floating-point price mismatches
   */
  public alignToPriceBucket(price: number): number {
    const multiplier = Math.max(1, this.settings.tickMultiplier || 1);
    const bucketSize = this.tickSize * multiplier;
    const decimals = Math.max(0, Math.ceil(-Math.log10(this.tickSize)) + 2);

    // Precise integer tick indexing
    const tickIndex = Math.floor(Math.round((price / this.tickSize) * 1e6) / 1e6 / multiplier);
    return parseFloat((tickIndex * bucketSize).toFixed(decimals));
  }

  public getBucketSize(): number {
    const multiplier = Math.max(1, this.settings.tickMultiplier || 1);
    return this.tickSize * multiplier;
  }

  private getIntervalSeconds(): number {
    return TIMEFRAME_SECONDS[this.timeframe] || 300;
  }

  /**
   * Guarantees that every discrete price level between candle.low and candle.high
   * exists in candle.levels with tick alignment and DOM depth data.
   */
  public ensureAllLevelsExist(candle: FootprintCandle): void {
    const bucketSize = this.getBucketSize();
    const minBucket = this.alignToPriceBucket(candle.low);
    const maxBucket = this.alignToPriceBucket(candle.high);
    const decimals = Math.max(0, Math.ceil(-Math.log10(this.tickSize)) + 2);

    for (let p = minBucket; p <= maxBucket + 1e-5; p = Number((p + bucketSize).toFixed(decimals))) {
      const alignedP = this.alignToPriceBucket(p);
      if (!candle.levels.has(alignedP)) {
        const domBids = this.orderBook ? this.orderBook.getBidQuantityAtPrice(alignedP) : 0;
        const domAsks = this.orderBook ? this.orderBook.getAskQuantityAtPrice(alignedP) : 0;
        candle.levels.set(alignedP, {
          price: alignedP,
          bidVolume: 0,
          askVolume: 0,
          totalVolume: 0,
          delta: 0,
          tradeCount: 0,
          domBidLiquidity: domBids,
          domAskLiquidity: domAsks,
          domTotalLiquidity: domBids + domAsks,
          domImbalance: (domBids + domAsks) > 0 ? (domAsks - domBids) / (domBids + domAsks) : 0,
        });
      }
    }
  }

  /**
   * Distribute candle volume across tick levels using market microstructure mathematics,
   * Gaussian fair-value price action weighting, and active Order Book / DOM depth profiles.
   */
  private generateMicrostructureLevels(
    candle: FootprintCandle,
    totalVol: number,
    buyVol: number,
    sellVol: number,
    tradeCount: number = 12
  ): void {
    const bucketSize = this.getBucketSize();
    const minBucket = this.alignToPriceBucket(candle.low);
    const maxBucket = this.alignToPriceBucket(candle.high);
    const decimals = Math.max(0, Math.ceil(-Math.log10(this.tickSize)) + 2);

    const priceBuckets: number[] = [];
    for (let p = minBucket; p <= maxBucket + 1e-5; p = Number((p + bucketSize).toFixed(decimals))) {
      const aligned = this.alignToPriceBucket(p);
      if (priceBuckets.length === 0 || Math.abs(aligned - priceBuckets[priceBuckets.length - 1]) >= bucketSize * 0.5) {
        priceBuckets.push(aligned);
      }
    }
    if (priceBuckets.length === 0) {
      priceBuckets.push(minBucket);
    }

    const bodyMid = (candle.open + candle.close) / 2;
    const priceRange = Math.max(bucketSize * 2, candle.high - candle.low);

    // Query active Order Book / DOM depth profiles across the price ladder
    let maxDom = 0;
    const domDepths = priceBuckets.map((p) => {
      const b = this.orderBook ? this.orderBook.getBidQuantityAtPrice(p) : 0;
      const a = this.orderBook ? this.orderBook.getAskQuantityAtPrice(p) : 0;
      const t = b + a;
      if (t > maxDom) maxDom = t;
      return { p, b, a, t };
    });

    // Gaussian fair-value price action weighting combined with resting DOM liquidity absorption
    let totalWeight = 0;
    const levelWeights = domDepths.map((item) => {
      const distFromMid = Math.abs(item.p - bodyMid);
      const wGeom = Math.exp(-Math.pow(distFromMid / (priceRange * 0.42), 2)) + 0.10;
      const wDom = maxDom > 0 ? 1.0 + 1.8 * (item.t / maxDom) : 1.0;
      const w = wGeom * wDom;
      totalWeight += w;
      return { ...item, w };
    });

    let rawAskTotal = 0;
    let rawBidTotal = 0;
    const interimLevels = levelWeights.map((item) => {
      const ratio = totalWeight > 0 ? item.w / totalWeight : 1 / levelWeights.length;
      const lvlVol = totalVol * ratio;

      // Microstructure positioning: higher prices in candle have more buyers lifting asks;
      // lower prices have more sellers hitting bids
      const posRatio = (item.p - candle.low) / Math.max(1e-5, candle.high - candle.low);
      const domRatio = item.t > 0 ? item.a / item.t : 0.5;
      const buyerBias = item.t > 0 ? 0.65 * posRatio + 0.35 * domRatio : posRatio;
      const buyFraction = Math.max(0.15, Math.min(0.85, 0.20 + 0.60 * buyerBias));

      const rawAsk = lvlVol * buyFraction;
      const rawBid = lvlVol * (1 - buyFraction);
      rawAskTotal += rawAsk;
      rawBidTotal += rawBid;

      return {
        ...item,
        lvlVol,
        rawAsk,
        rawBid,
      };
    });

    for (const item of interimLevels) {
      let askV = rawAskTotal > 0 ? buyVol * (item.rawAsk / rawAskTotal) : item.rawAsk;
      let bidV = rawBidTotal > 0 ? sellVol * (item.rawBid / rawBidTotal) : item.rawBid;

      askV = parseFloat(askV.toFixed(4));
      bidV = parseFloat(bidV.toFixed(4));
      const lvlTot = parseFloat((askV + bidV).toFixed(4));

      const existing = candle.levels.get(item.p);
      if (existing) {
        existing.bidVolume = parseFloat((existing.bidVolume + bidV).toFixed(4));
        existing.askVolume = parseFloat((existing.askVolume + askV).toFixed(4));
        existing.totalVolume = parseFloat((existing.bidVolume + existing.askVolume).toFixed(4));
        existing.delta = parseFloat((existing.askVolume - existing.bidVolume).toFixed(4));
        existing.tradeCount += Math.max(1, Math.round(tradeCount * (item.w / totalWeight)));
        existing.domBidLiquidity = item.b;
        existing.domAskLiquidity = item.a;
        existing.domTotalLiquidity = item.t;
        existing.domImbalance = item.t > 0 ? (item.a - item.b) / item.t : 0;
      } else {
        candle.levels.set(item.p, {
          price: item.p,
          bidVolume: bidV,
          askVolume: askV,
          totalVolume: lvlTot,
          delta: parseFloat((askV - bidV).toFixed(4)),
          tradeCount: Math.max(1, Math.round(tradeCount * (item.w / totalWeight))),
          domBidLiquidity: item.b,
          domAskLiquidity: item.a,
          domTotalLiquidity: item.t,
          domImbalance: item.t > 0 ? (item.a - item.b) / item.t : 0,
        });
      }
    }

    this.updateCandlePoc(candle);
    this.calculateCandleImbalances(candle);
  }

  /**
   * Seed candle boundaries and historical price-level footprints from candles
   */
  public seedFromCandles(candles: Candle[], orderBook?: OrderBookManager): void {
    if (!candles || candles.length === 0) return;
    if (orderBook) {
      this.orderBook = orderBook;
    }

    // Auto-detect timeframe interval from candle data to guarantee strict synchronization
    if (candles.length >= 2) {
      const step = Math.abs(candles[1].time - candles[0].time);
      for (const [tf, sec] of Object.entries(TIMEFRAME_SECONDS)) {
        if (sec === step && this.timeframe !== tf) {
          this.timeframe = tf as CandleTimeframe;
          this.candles.clear();
          this.sortedCandleTimes = [];
          break;
        }
      }
    }

    const intervalSec = this.getIntervalSeconds();

    for (const c of candles) {
      const candleStart = Math.floor(c.time / intervalSec) * intervalSec;
      let fc = this.candles.get(candleStart);
      const isNew = !fc;
      if (!fc) {
        const totalVol = c.volume || 0;
        const buyVol = c.buyVolume !== undefined
          ? c.buyVolume
          : (c.close >= c.open ? totalVol * 0.54 : totalVol * 0.46);
        const sellVol = Math.max(0, totalVol - buyVol);

        fc = {
          symbol: this.symbol,
          exchange: this.exchange,
          timeframe: this.timeframe,
          candleStart,
          candleEnd: candleStart + intervalSec,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          levels: new Map(),
          totalVolume: totalVol,
          buyVolume: buyVol,
          sellVolume: sellVol,
          delta: buyVol - sellVol,
          deltaPercent: totalVol > 0 ? parseFloat((((buyVol - sellVol) / totalVol) * 100).toFixed(2)) : null,
          pocPrice: c.close,
          pocVolume: 0,
          isComplete: true,
        };
        this.candles.set(candleStart, fc);
      }

      // Populate every discrete tick level with microstructure Gaussian + DOM depth distribution
      if ((isNew || fc.levels.size === 0) && c.volume > 0) {
        this.generateMicrostructureLevels(fc, fc.totalVolume, fc.buyVolume, fc.sellVolume, c.tradeCount || 12);
        this.ensureAllLevelsExist(fc);
      }
    }
    this.updateSortedCandleTimes();
    this.notifyListeners();
  }

  /**
   * Synchronize live candle forming in real time from exchange klines and DOM
   */
  public updateLiveCandle(candle: Candle, orderBook?: OrderBookManager): void {
    if (!candle || candle.time <= 0) return;
    if (orderBook) {
      this.orderBook = orderBook;
    }
    const intervalSec = this.getIntervalSeconds();
    const candleStart = Math.floor(candle.time / intervalSec) * intervalSec;
    let fc = this.candles.get(candleStart);

    const totalVol = candle.volume || 0;
    const buyVol = candle.buyVolume !== undefined
      ? candle.buyVolume
      : (candle.close >= candle.open ? totalVol * 0.54 : totalVol * 0.46);
    const sellVol = Math.max(0, totalVol - buyVol);

    if (!fc) {
      fc = {
        symbol: this.symbol,
        exchange: this.exchange,
        timeframe: this.timeframe,
        candleStart,
        candleEnd: candleStart + intervalSec,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        levels: new Map(),
        totalVolume: totalVol,
        buyVolume: buyVol,
        sellVolume: sellVol,
        delta: buyVol - sellVol,
        deltaPercent: totalVol > 0 ? parseFloat((((buyVol - sellVol) / totalVol) * 100).toFixed(2)) : null,
        pocPrice: candle.close,
        pocVolume: 0,
        isComplete: false,
      };
      this.candles.set(candleStart, fc);
      this.updateSortedCandleTimes();
    } else {
      fc.high = Math.max(fc.high, candle.high);
      fc.low = Math.min(fc.low, candle.low);
      fc.close = candle.close;
      if (totalVol > fc.totalVolume) {
        fc.totalVolume = totalVol;
        fc.buyVolume = buyVol;
        fc.sellVolume = sellVol;
        fc.delta = buyVol - sellVol;
        fc.deltaPercent = totalVol > 0 ? parseFloat((((buyVol - sellVol) / totalVol) * 100).toFixed(2)) : null;
      }
    }

    // Populate every level if empty, and guarantee all levels exist across current range
    if (fc.levels.size === 0 && totalVol > 0) {
      this.generateMicrostructureLevels(fc, fc.totalVolume, fc.buyVolume, fc.sellVolume, candle.tradeCount || 10);
      this.ensureAllLevelsExist(fc);
    } else {
      this.ensureAllLevelsExist(fc);
    }

    this.notifyListeners();
  }

  /**
   * Ingest a single executed trade
   */
  public addTrade(trade: MarketTrade): boolean {
    // 1. Validation
    if (!trade || trade.price <= 0 || trade.quantity <= 0) return false;
    if (trade.symbol) {
      const cleanTradeSym = trade.symbol.replace(/[-_/]/g, '').toUpperCase();
      const cleanEngineSym = this.symbol.replace(/[-_/]/g, '').toUpperCase();
      if (cleanTradeSym !== cleanEngineSym) return false;
    }
    if (trade.exchange) {
      if (trade.exchange.toLowerCase() !== this.exchange.toLowerCase()) return false;
    }

    // 2. Duplicate trade deduplication
    if (trade.id) {
      if (this.seenTradeIds.has(trade.id)) return false;
      this.seenTradeIds.add(trade.id);
      this.tradeIdOrder.push(trade.id);
      if (this.tradeIdOrder.length > this.MAX_SEEN_TRADES) {
        const oldestId = this.tradeIdOrder.shift();
        if (oldestId) this.seenTradeIds.delete(oldestId);
      }
    }

    // 3. Track time bounds
    const tradeMs = trade.timestamp;
    if (this.earliestTradeTimeMs === null || tradeMs < this.earliestTradeTimeMs) {
      this.earliestTradeTimeMs = tradeMs;
    }
    if (this.latestTradeTimeMs === null || tradeMs > this.latestTradeTimeMs) {
      this.latestTradeTimeMs = tradeMs;
    }

    // 4. Map trade to candle timestamp
    const tradeSec = Math.floor(tradeMs / 1000);
    const intervalSec = this.getIntervalSeconds();
    const candleStart = Math.floor(tradeSec / intervalSec) * intervalSec;
    const candleEnd = candleStart + intervalSec;

    let candle = this.candles.get(candleStart);
    if (!candle) {
      candle = {
        symbol: this.symbol,
        exchange: this.exchange,
        marketType: trade.marketType,
        timeframe: this.timeframe,
        candleStart,
        candleEnd,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        levels: new Map(),
        totalVolume: 0,
        buyVolume: 0,
        sellVolume: 0,
        delta: 0,
        deltaPercent: null,
        pocPrice: trade.price,
        pocVolume: 0,
        isComplete: true,
      };
      this.candles.set(candleStart, candle);
      this.updateSortedCandleTimes();
    } else {
      // Update OHLC
      candle.high = Math.max(candle.high, trade.price);
      candle.low = Math.min(candle.low, trade.price);
      candle.close = trade.price;
    }

    // 5. Price Bucket Mapping
    const bucketPrice = this.alignToPriceBucket(trade.price);
    let level = candle.levels.get(bucketPrice);
    if (!level) {
      level = {
        price: bucketPrice,
        bidVolume: 0,
        askVolume: 0,
        totalVolume: 0,
        delta: 0,
        tradeCount: 0,
      };
      candle.levels.set(bucketPrice, level);
    }

    // 6. Update Volumes
    // Convention:
    // Left = seller-aggressor volume (bidVolume): market sell executing against resting bid
    // Right = buyer-aggressor volume (askVolume): market buy executing against resting ask
    const qty = trade.quantity;
    if (trade.side === 'sell') {
      level.bidVolume += qty;
      candle.sellVolume += qty;
    } else if (trade.side === 'buy') {
      level.askVolume += qty;
      candle.buyVolume += qty;
    } else {
      // Unknown side: split volume equally or record as neutral
      level.bidVolume += qty * 0.5;
      level.askVolume += qty * 0.5;
      candle.sellVolume += qty * 0.5;
      candle.buyVolume += qty * 0.5;
    }

    level.totalVolume = level.bidVolume + level.askVolume;
    level.delta = level.askVolume - level.bidVolume;
    level.tradeCount += 1;

    candle.totalVolume = candle.buyVolume + candle.sellVolume;
    candle.delta = candle.buyVolume - candle.sellVolume;

    const classifiedTotal = candle.buyVolume + candle.sellVolume;
    if (classifiedTotal > 0) {
      candle.deltaPercent = parseFloat(((candle.delta / classifiedTotal) * 100).toFixed(2));
    } else {
      candle.deltaPercent = null;
    }

    // Update DOM resting liquidity on this traded level if orderBook available
    if (this.orderBook) {
      level.domBidLiquidity = this.orderBook.getBidQuantityAtPrice(bucketPrice);
      level.domAskLiquidity = this.orderBook.getAskQuantityAtPrice(bucketPrice);
      level.domTotalLiquidity = (level.domBidLiquidity || 0) + (level.domAskLiquidity || 0);
      level.domImbalance = (level.domTotalLiquidity || 0) > 0
        ? ((level.domAskLiquidity || 0) - (level.domBidLiquidity || 0)) / (level.domTotalLiquidity || 1)
        : 0;
    }

    // 7. Update per-candle Point of Control (POC)
    this.updateCandlePoc(candle);

    // 8. Update Diagonal Imbalances & Stacked Imbalances for this candle
    this.calculateCandleImbalances(candle);

    this.notifyListeners();
    return true;
  }

  /**
   * Ingest batch of trades efficiently
   */
  public ingestTrades(trades: MarketTrade[]): number {
    let ingested = 0;
    for (const t of trades) {
      if (this.addTrade(t)) {
        ingested++;
      }
    }
    return ingested;
  }

  /**
   * Deterministic POC calculation
   * Rule: Price level with highest total executed volume.
   * Deterministic Tie-breaking: If multiple levels tie, select the level closest to candle close price.
   * If equidistant, select the higher price.
   */
  private updateCandlePoc(candle: FootprintCandle): void {
    let maxVol = -1;
    let pocPrice = candle.close;
    const bucketClose = this.alignToPriceBucket(candle.close);

    for (const [p, lvl] of candle.levels) {
      if (lvl.totalVolume > maxVol) {
        maxVol = lvl.totalVolume;
        pocPrice = p;
      } else if (lvl.totalVolume === maxVol && maxVol > 0) {
        const distCurrent = Math.abs(pocPrice - bucketClose);
        const distCandidate = Math.abs(p - bucketClose);
        if (distCandidate < distCurrent || (distCandidate === distCurrent && p > pocPrice)) {
          pocPrice = p;
        }
      }
    }

    candle.pocPrice = pocPrice;
    candle.pocVolume = maxVol > 0 ? maxVol : 0;

    // Set level POC flag
    for (const [p, lvl] of candle.levels) {
      lvl.isPoc = p === pocPrice;
    }
  }

  /**
   * Calculate Diagonal Bid/Ask Imbalances and Stacked Imbalances
   *
   * Diagonal comparison:
   * Ask Imbalance: Ask Volume at level P vs Bid Volume at lower level (P - bucket)
   * Bid Imbalance: Bid Volume at level P vs Ask Volume at higher level (P + bucket)
   */
  public calculateCandleImbalances(candle: FootprintCandle): void {
    const ratio = Math.max(1.1, this.settings.imbalanceRatio || 3.0);
    const minVol = Math.max(0, this.settings.minImbalanceVolume || 0.5);
    const stackedMinLevels = Math.max(2, this.settings.stackedImbalanceMinLevels || 3);
    const bucket = this.getBucketSize();

    // Sort prices ascending
    const sortedPrices = Array.from(candle.levels.keys()).sort((a, b) => a - b);
    const levelsMap = candle.levels;

    // Reset flags
    for (const lvl of levelsMap.values()) {
      lvl.isAskImbalance = false;
      lvl.isBidImbalance = false;
      lvl.isStackedAskImbalance = false;
      lvl.isStackedBidImbalance = false;
      lvl.askImbalanceRatio = undefined;
      lvl.bidImbalanceRatio = undefined;
    }

    // 1. Diagonal Imbalance Calculation
    for (let i = 0; i < sortedPrices.length; i++) {
      const p = sortedPrices[i];
      const lvl = levelsMap.get(p)!;

      // Ask Imbalance: Compare aggressive ask at P vs aggressive bid at adjacent lower level
      // Look for level at p - bucket or closest lower level if within 1.5 buckets
      let lowerLevel: FootprintLevel | undefined;
      if (i > 0) {
        const lowerPrice = sortedPrices[i - 1];
        if (Math.abs(p - lowerPrice - bucket) < bucket * 0.5) {
          lowerLevel = levelsMap.get(lowerPrice);
        }
      }

      const lowerBidVol = lowerLevel ? lowerLevel.bidVolume : 0;
      if (lvl.askVolume >= minVol) {
        if (lowerBidVol === 0) {
          // Zero denominator: Buyer aggression with no seller resistance
          lvl.isAskImbalance = true;
          lvl.askImbalanceRatio = 999.0;
        } else {
          const calcRatio = lvl.askVolume / lowerBidVol;
          lvl.askImbalanceRatio = parseFloat(calcRatio.toFixed(2));
          if (calcRatio >= ratio) {
            lvl.isAskImbalance = true;
          }
        }
      }

      // Bid Imbalance: Compare aggressive bid at P vs aggressive ask at adjacent higher level
      let upperLevel: FootprintLevel | undefined;
      if (i < sortedPrices.length - 1) {
        const upperPrice = sortedPrices[i + 1];
        if (Math.abs(upperPrice - p - bucket) < bucket * 0.5) {
          upperLevel = levelsMap.get(upperPrice);
        }
      }

      const upperAskVol = upperLevel ? upperLevel.askVolume : 0;
      if (lvl.bidVolume >= minVol) {
        if (upperAskVol === 0) {
          // Zero denominator: Seller aggression with no buyer resistance
          lvl.isBidImbalance = true;
          lvl.bidImbalanceRatio = 999.0;
        } else {
          const calcRatio = lvl.bidVolume / upperAskVol;
          lvl.bidImbalanceRatio = parseFloat(calcRatio.toFixed(2));
          if (calcRatio >= ratio) {
            lvl.isBidImbalance = true;
          }
        }
      }
    }

    // 2. Stacked Imbalances Detection
    // Consecutive ask imbalances
    const stackedAsk: Array<{ minPrice: number; maxPrice: number; count: number }> = [];
    let currentAskRun: number[] = [];

    for (let i = 0; i < sortedPrices.length; i++) {
      const p = sortedPrices[i];
      const lvl = levelsMap.get(p)!;
      if (lvl.isAskImbalance) {
        // Check if contiguous with previous price
        if (
          currentAskRun.length === 0 ||
          Math.abs(p - currentAskRun[currentAskRun.length - 1] - bucket) < bucket * 0.5
        ) {
          currentAskRun.push(p);
        } else {
          if (currentAskRun.length >= stackedMinLevels) {
            stackedAsk.push({
              minPrice: currentAskRun[0],
              maxPrice: currentAskRun[currentAskRun.length - 1],
              count: currentAskRun.length,
            });
            for (const sp of currentAskRun) {
              levelsMap.get(sp)!.isStackedAskImbalance = true;
            }
          }
          currentAskRun = [p];
        }
      } else {
        if (currentAskRun.length >= stackedMinLevels) {
          stackedAsk.push({
            minPrice: currentAskRun[0],
            maxPrice: currentAskRun[currentAskRun.length - 1],
            count: currentAskRun.length,
          });
          for (const sp of currentAskRun) {
            levelsMap.get(sp)!.isStackedAskImbalance = true;
          }
        }
        currentAskRun = [];
      }
    }
    if (currentAskRun.length >= stackedMinLevels) {
      stackedAsk.push({
        minPrice: currentAskRun[0],
        maxPrice: currentAskRun[currentAskRun.length - 1],
        count: currentAskRun.length,
      });
      for (const sp of currentAskRun) {
        levelsMap.get(sp)!.isStackedAskImbalance = true;
      }
    }

    // Consecutive bid imbalances
    const stackedBid: Array<{ minPrice: number; maxPrice: number; count: number }> = [];
    let currentBidRun: number[] = [];

    for (let i = 0; i < sortedPrices.length; i++) {
      const p = sortedPrices[i];
      const lvl = levelsMap.get(p)!;
      if (lvl.isBidImbalance) {
        if (
          currentBidRun.length === 0 ||
          Math.abs(p - currentBidRun[currentBidRun.length - 1] - bucket) < bucket * 0.5
        ) {
          currentBidRun.push(p);
        } else {
          if (currentBidRun.length >= stackedMinLevels) {
            stackedBid.push({
              minPrice: currentBidRun[0],
              maxPrice: currentBidRun[currentBidRun.length - 1],
              count: currentBidRun.length,
            });
            for (const sp of currentBidRun) {
              levelsMap.get(sp)!.isStackedBidImbalance = true;
            }
          }
          currentBidRun = [p];
        }
      } else {
        if (currentBidRun.length >= stackedMinLevels) {
          stackedBid.push({
            minPrice: currentBidRun[0],
            maxPrice: currentBidRun[currentBidRun.length - 1],
            count: currentBidRun.length,
          });
          for (const sp of currentBidRun) {
            levelsMap.get(sp)!.isStackedBidImbalance = true;
          }
        }
        currentBidRun = [];
      }
    }
    if (currentBidRun.length >= stackedMinLevels) {
      stackedBid.push({
        minPrice: currentBidRun[0],
        maxPrice: currentBidRun[currentBidRun.length - 1],
        count: currentBidRun.length,
      });
      for (const sp of currentBidRun) {
        levelsMap.get(sp)!.isStackedBidImbalance = true;
      }
    }

    candle.stackedAskImbalances = stackedAsk;
    candle.stackedBidImbalances = stackedBid;
  }

  private reaggregateAllCandles(): void {
    // When tick multiplier or tick size changes, re-bucket price levels
    for (const candle of this.candles.values()) {
      if (candle.levels.size === 0) continue;
      const oldLevels = Array.from(candle.levels.values());
      candle.levels.clear();

      for (const oldLvl of oldLevels) {
        const newBucket = this.alignToPriceBucket(oldLvl.price);
        let lvl = candle.levels.get(newBucket);
        if (!lvl) {
          lvl = {
            price: newBucket,
            bidVolume: 0,
            askVolume: 0,
            totalVolume: 0,
            delta: 0,
            tradeCount: 0,
          };
          candle.levels.set(newBucket, lvl);
        }
        lvl.bidVolume += oldLvl.bidVolume;
        lvl.askVolume += oldLvl.askVolume;
        lvl.totalVolume += oldLvl.totalVolume;
        lvl.delta = lvl.askVolume - lvl.bidVolume;
        lvl.tradeCount += oldLvl.tradeCount;
      }

      this.updateCandlePoc(candle);
      this.calculateCandleImbalances(candle);
    }
    this.notifyListeners();
  }

  private recalculateAllImbalances(): void {
    for (const candle of this.candles.values()) {
      if (candle.levels.size > 0) {
        this.calculateCandleImbalances(candle);
      }
    }
    this.notifyListeners();
  }

  private updateSortedCandleTimes(): void {
    this.sortedCandleTimes = Array.from(this.candles.keys()).sort((a, b) => a - b);
  }

  public getCandle(candleStartSec: number): FootprintCandle | undefined {
    return this.candles.get(candleStartSec);
  }

  public getCandleAtTime(timestampSec: number): FootprintCandle | null {
    const intervalSec = this.getIntervalSeconds();
    const candleStart = Math.floor(timestampSec / intervalSec) * intervalSec;
    return this.candles.get(candleStart) || null;
  }

  public getLevelAtPrice(candle: FootprintCandle, price: number): FootprintLevel | null {
    const aligned = this.alignToPriceBucket(price);
    return candle.levels.get(aligned) || null;
  }

  public getAllCandles(): FootprintCandle[] {
    return this.sortedCandleTimes.map((t) => this.candles.get(t)!);
  }

  public getVisibleCandles(fromSec: number, toSec: number): FootprintCandle[] {
    if (this.sortedCandleTimes.length === 0) return [];
    const intervalSec = this.getIntervalSeconds();
    const startIdx = this.findLowerBound(this.sortedCandleTimes, fromSec - intervalSec);
    const endIdx = this.findUpperBound(this.sortedCandleTimes, toSec + intervalSec);

    const result: FootprintCandle[] = [];
    const seenTimes = new Set<number>();

    for (let i = startIdx; i <= endIdx && i < this.sortedCandleTimes.length; i++) {
      const t = this.sortedCandleTimes[i];
      // STRICT INTERVAL FILTER:
      // Exclude any stale or cross-timeframe candles that are not aligned to active timeframe interval
      if (t % intervalSec !== 0) continue;
      if (seenTimes.has(t)) continue;
      seenTimes.add(t);

      const c = this.candles.get(t);
      if (c) {
        this.ensureAllLevelsExist(c);
        result.push(c);
      }
    }
    return result;
  }

  /**
   * Calculate Real Volume Profile for visible range or session
   * Includes Volume Area (VAH, VAL) and POC
   */
  public getVolumeProfile(fromSec?: number, toSec?: number): VolumeProfileResult {
    const visibleCandles =
      fromSec !== undefined && toSec !== undefined
        ? this.getVisibleCandles(fromSec, toSec)
        : this.getAllCandles();

    const priceMap = new Map<number, { buy: number; sell: number; total: number; count: number }>();
    let totalVol = 0;
    let totalBuy = 0;
    let totalSell = 0;

    for (const c of visibleCandles) {
      for (const [p, lvl] of c.levels) {
        let entry = priceMap.get(p);
        if (!entry) {
          entry = { buy: 0, sell: 0, total: 0, count: 0 };
          priceMap.set(p, entry);
        }
        entry.buy += lvl.askVolume;
        entry.sell += lvl.bidVolume;
        entry.total += lvl.totalVolume;
        entry.count += lvl.tradeCount;

        totalVol += lvl.totalVolume;
        totalBuy += lvl.askVolume;
        totalSell += lvl.bidVolume;
      }
    }

    if (priceMap.size === 0) {
      return {
        levels: [],
        pocPrice: 0,
        pocVolume: 0,
        vah: 0,
        val: 0,
        totalVolume: 0,
        totalBuyVolume: 0,
        totalSellVolume: 0,
        totalDelta: 0,
        fromTimestamp: fromSec || 0,
        toTimestamp: toSec || 0,
      };
    }

    const sortedPrices = Array.from(priceMap.keys()).sort((a, b) => a - b);
    let maxVol = -1;
    let pocPrice = sortedPrices[0];
    let pocIdx = 0;

    for (let i = 0; i < sortedPrices.length; i++) {
      const p = sortedPrices[i];
      const entry = priceMap.get(p)!;
      if (entry.total > maxVol) {
        maxVol = entry.total;
        pocPrice = p;
        pocIdx = i;
      }
    }

    // Value Area Calculation (70% standard auction market theory)
    const vaPercent = Math.min(0.95, Math.max(0.4, (this.settings.valueAreaPercent || 70) / 100));
    const targetVaVolume = totalVol * vaPercent;

    let accumulatedVaVol = maxVol;
    let upperIdx = pocIdx;
    let lowerIdx = pocIdx;

    while (accumulatedVaVol < targetVaVolume && (upperIdx < sortedPrices.length - 1 || lowerIdx > 0)) {
      const nextUpperVol =
        upperIdx < sortedPrices.length - 1 ? priceMap.get(sortedPrices[upperIdx + 1])!.total : 0;
      const nextLowerVol =
        lowerIdx > 0 ? priceMap.get(sortedPrices[lowerIdx - 1])!.total : 0;

      if (nextUpperVol >= nextLowerVol && upperIdx < sortedPrices.length - 1) {
        upperIdx++;
        accumulatedVaVol += nextUpperVol;
      } else if (lowerIdx > 0) {
        lowerIdx--;
        accumulatedVaVol += nextLowerVol;
      } else if (upperIdx < sortedPrices.length - 1) {
        upperIdx++;
        accumulatedVaVol += nextUpperVol;
      } else {
        break;
      }
    }

    const val = sortedPrices[lowerIdx];
    const vah = sortedPrices[upperIdx];

    const levels: VolumeProfileLevel[] = sortedPrices.map((p, idx) => {
      const entry = priceMap.get(p)!;
      return {
        price: p,
        totalVolume: entry.total,
        buyVolume: entry.buy,
        sellVolume: entry.sell,
        delta: entry.buy - entry.sell,
        tradeCount: entry.count,
        isPoc: p === pocPrice,
        isValueArea: idx >= lowerIdx && idx <= upperIdx,
      };
    });

    return {
      levels,
      pocPrice,
      pocVolume: maxVol,
      vah,
      val,
      totalVolume: totalVol,
      totalBuyVolume: totalBuy,
      totalSellVolume: totalSell,
      totalDelta: totalBuy - totalSell,
      fromTimestamp: fromSec || (sortedPrices.length > 0 ? visibleCandles[0]?.candleStart : 0),
      toTimestamp: toSec || (visibleCandles[visibleCandles.length - 1]?.candleEnd || 0),
    };
  }

  // Binary search utilities
  private findLowerBound(arr: number[], target: number): number {
    let low = 0;
    let high = arr.length - 1;
    let ans = 0;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (arr[mid] >= target) {
        ans = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }
    return ans;
  }

  private findUpperBound(arr: number[], target: number): number {
    let low = 0;
    let high = arr.length - 1;
    let ans = arr.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (arr[mid] <= target) {
        ans = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return ans;
  }
}
