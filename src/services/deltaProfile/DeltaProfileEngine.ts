/**
 * JARVIS 2.0 Delta Profile Engine
 * Institutional Order Flow: Buy/Sell Delta Distribution by Price Level
 * 
 * Computes:
 * - Aggressive Buy Volume (taking Ask) vs Aggressive Sell Volume (taking Bid)
 * - Net Delta & Delta Percentage per price bucket respecting instrument tick size
 * - Delta POC (Price Level with Greatest Absolute Net Delta)
 * - Potential Trapped Buyers & Trapped Sellers detection
 * - Delta Divergence against price
 * - True verified trade order flow with graceful disclosure of estimated proxies
 */

import { MarketTrade, CandleTimeframe, ExchangeId, Candle } from '../../types/market';
import { FootprintCandle } from '../../types/footprint';
import {
  DeltaProfileSettings,
  DEFAULT_DELTA_PROFILE_SETTINGS,
  DeltaProfileMetrics,
  DeltaPriceLevel,
  TrappedZone,
  DeltaDivergence,
  AIDeltaProfileAnalytics,
} from '../../types/deltaProfile';
import { InstrumentRegistry } from '../market/InstrumentRegistry';
import { MarketSessionService } from '../market/MarketSessionService';
import { isPricePlausibleForSymbol } from '../../utils/priceSanity';

export class DeltaProfileEngine {
  private symbol: string = 'XAUUSD';
  private exchange: ExchangeId = 'binance';
  private timeframe: CandleTimeframe = '1m';
  private settings: DeltaProfileSettings = { ...DEFAULT_DELTA_PROFILE_SETTINGS };

  // Ring buffer for executed trades
  private trades: MarketTrade[] = [];
  private readonly MAX_TRADES = 50_000;
  private seenTradeIds: Set<string> = new Set();
  private tradeIdOrder: string[] = [];

  // Footprint candles for deep historical delta aggregation
  private footprintCandles: FootprintCandle[] = [];

  // Historical candlestick cache across visible range
  private candles: Candle[] = [];

  // Recent trade hit execution for live visual pulse and real-time response
  private lastTradeHit: { price: number; quantity: number; side: 'buy' | 'sell'; timestamp: number } | null = null;

  // Synchronized visible chart range in seconds
  private visibleRange: { from: number; to: number } | null = null;

  // Cached computation
  private cachedMetrics: DeltaProfileMetrics | null = null;
  private cachedStep: number = 0;
  private isDirty: boolean = true;
  private listeners: Set<(metrics: DeltaProfileMetrics) => void> = new Set();

  constructor(symbol: string = 'XAUUSD', exchange: ExchangeId = 'binance', timeframe: CandleTimeframe = '1m') {
    this.symbol = symbol;
    this.exchange = exchange;
    this.timeframe = timeframe;
  }

  public setInstrument(symbol: string, exchange: ExchangeId, timeframe: CandleTimeframe) {
    const symChanged = this.symbol !== symbol || this.exchange !== exchange;
    this.symbol = symbol;
    this.exchange = exchange;
    this.timeframe = timeframe;

    if (symChanged) {
      this.clear();
    }
    this.isDirty = true;
    this.notify();
  }

  public getSymbol(): string {
    return this.symbol;
  }

  public updateSettings(patch: Partial<DeltaProfileSettings>) {
    this.settings = { ...this.settings, ...patch };
    this.isDirty = true;
    this.notify();
  }

  public getSettings(): DeltaProfileSettings {
    return { ...this.settings };
  }

  public setVisibleTimeRange(from: number, to: number) {
    if (this.visibleRange && this.visibleRange.from === from && this.visibleRange.to === to) {
      return;
    }
    this.visibleRange = { from, to };
    if (this.settings.rangeMode === 'visible') {
      this.isDirty = true;
      this.notify();
    }
  }

  /**
   * Ingest a single executed trade from live stream
   */
  public addTrade(trade: MarketTrade): boolean {
    if (!trade || trade.price <= 0 || trade.quantity <= 0) return false;

    // Check symbol match
    if (trade.symbol) {
      const cleanTrade = trade.symbol.replace(/[-_/]/g, '').toUpperCase();
      const cleanEngine = this.symbol.replace(/[-_/]/g, '').toUpperCase();
      if (cleanTrade !== cleanEngine) return false;
    }

    // Deduplicate
    if (trade.id) {
      if (this.seenTradeIds.has(trade.id)) return false;
      this.seenTradeIds.add(trade.id);
      this.tradeIdOrder.push(trade.id);
      if (this.tradeIdOrder.length > this.MAX_TRADES) {
        const oldest = this.tradeIdOrder.shift();
        if (oldest) this.seenTradeIds.delete(oldest);
      }
    }

    this.trades.push(trade);
    if (this.trades.length > this.MAX_TRADES) {
      this.trades.shift();
    }

    this.lastTradeHit = {
      price: trade.price,
      quantity: trade.quantity,
      side: trade.side === 'sell' ? 'sell' : 'buy',
      timestamp: trade.timestamp || Date.now(),
    };

    this.isDirty = true;
    this.notify();
    return true;
  }

  public getLastTradeHit(): { price: number; quantity: number; side: 'buy' | 'sell'; timestamp: number } | null {
    return this.lastTradeHit;
  }

  /**
   * Batch ingest trades
   */
  public ingestTrades(trades: MarketTrade[]): number {
    let count = 0;
    for (const t of trades) {
      if (this.addTrade(t)) count++;
    }
    return count;
  }

  /**
   * Ingest or synchronize footprint candles for historical profiles
   */
  public syncFromFootprint(candles: Map<number, FootprintCandle> | FootprintCandle[]) {
    const list = Array.isArray(candles) ? candles : Array.from(candles.values());
    this.footprintCandles = [...list].sort((a, b) => a.candleStart - b.candleStart);
    this.isDirty = true;
    this.notify();
  }

  /**
   * Seed historical candlestick data across visible chart
   */
  public seedFromCandles(candles: Candle[]) {
    if (!candles || candles.length === 0) return;
    this.candles = [...candles];
    this.isDirty = true;
    this.notify();
  }

  /**
   * Synchronize active forming candle in real time
   */
  public updateLiveCandle(candle: Candle): void {
    if (!candle || candle.time <= 0) return;
    if (this.candles.length === 0) {
      this.candles.push({ ...candle });
    } else {
      const last = this.candles[this.candles.length - 1];
      if (last.time === candle.time) {
        last.high = Math.max(last.high, candle.high);
        last.low = Math.min(last.low, candle.low);
        last.close = candle.close;
        if (candle.volume) last.volume = candle.volume;
      } else if (last.time < candle.time) {
        this.candles.push({ ...candle });
        if (this.candles.length > 500) this.candles.shift();
      }
    }
    this.isDirty = true;
    this.notify();
  }

  public subscribe(listener: (metrics: DeltaProfileMetrics) => void): () => void {
    this.listeners.add(listener);
    if (this.cachedMetrics) {
      try { listener(this.cachedMetrics); } catch {}
    }
    return () => this.listeners.delete(listener);
  }

  private notifyTimer: any = null;
  public notify() {
    if (this.listeners.size === 0) return;
    if (this.notifyTimer !== null) return;
    const scheduleFn = typeof window !== 'undefined' && window.setTimeout ? window.setTimeout : setTimeout;
    this.notifyTimer = scheduleFn(() => {
      this.notifyTimer = null;
      const metrics = this.getMetrics();
      for (const l of this.listeners) {
        try { l(metrics); } catch {}
      }
    }, 32);
  }

  /**
   * Computes the tick size for the active instrument
   */
  public getPriceStep(): number {
    const inst = InstrumentRegistry.getInstrument(this.symbol, this.exchange);
    const baseTick = inst?.priceTick && inst.priceTick > 0 ? inst.priceTick : 0.1;
    const multiplier = Math.max(1, Math.round(this.settings.ticksPerRow || 1));
    return baseTick * multiplier;
  }

  /**
   * Align price to exact discrete tick row bucket
   */
  public alignPrice(price: number, step: number): number {
    if (step <= 0) return price;
    const count = Math.round(price / step);
    const aligned = count * step;
    const stepDecimals = Math.max(0, (step.toString().split('.')[1] || '').length);
    return parseFloat(aligned.toFixed(Math.min(8, stepDecimals + 1)));
  }

  /**
   * Resolve active time range based on rangeMode
   */
  public getTimeRangeBounds(): { startTime: number; endTime: number } {
    const now = Date.now();
    const nowSec = Math.floor(now / 1000);

    switch (this.settings.rangeMode) {
      case 'visible': {
        if (this.visibleRange && this.visibleRange.from > 0 && this.visibleRange.to > 0) {
          return {
            startTime: this.visibleRange.from * 1000,
            endTime: Math.max(now, this.visibleRange.to * 1000),
          };
        }
        // Fallback: last 2 hours
        return { startTime: now - 2 * 3600 * 1000, endTime: now };
      }

      case 'session': {
        const d = new Date(now);
        const utcHour = d.getUTCHours() + d.getUTCMinutes() / 60;
        let sessionStartHour = 0; // Default Asian 00:00 UTC
        if (utcHour >= 13.5 && utcHour < 21) {
          // New York Session
          sessionStartHour = 13.5;
        } else if (utcHour >= 7 && utcHour < 15.5) {
          // London Session
          sessionStartHour = 7;
        } else {
          // Asian / Overnight Session
          sessionStartHour = 0;
        }
        const sessionStartDate = new Date(now);
        sessionStartDate.setUTCHours(Math.floor(sessionStartHour), Math.floor((sessionStartHour % 1) * 60), 0, 0);
        return { startTime: sessionStartDate.getTime(), endTime: now };
      }

      case 'prev_session': {
        const d = new Date(now);
        const utcHour = d.getUTCHours() + d.getUTCMinutes() / 60;
        let prevStartHour = 0;
        let prevEndHour = 8;
        if (utcHour >= 13.5 && utcHour < 21) {
          // Prior was London (07:00 to 13:30)
          prevStartHour = 7;
          prevEndHour = 13.5;
        } else if (utcHour >= 7 && utcHour < 15.5) {
          // Prior was Asian (00:00 to 07:00)
          prevStartHour = 0;
          prevEndHour = 7;
        } else {
          // Prior was NY (13:30 to 21:00 yesterday)
          const yesterday = new Date(now - 86400000);
          const start = new Date(yesterday);
          start.setUTCHours(13, 30, 0, 0);
          const end = new Date(yesterday);
          end.setUTCHours(21, 0, 0, 0);
          return { startTime: start.getTime(), endTime: end.getTime() };
        }
        const start = new Date(now);
        start.setUTCHours(Math.floor(prevStartHour), Math.floor((prevStartHour % 1) * 60), 0, 0);
        const end = new Date(now);
        end.setUTCHours(Math.floor(prevEndHour), Math.floor((prevEndHour % 1) * 60), 0, 0);
        return { startTime: start.getTime(), endTime: end.getTime() };
      }

      case 'daily': {
        // Today 00:00 UTC
        const d = new Date(now);
        d.setUTCHours(0, 0, 0, 0);
        return { startTime: d.getTime(), endTime: now };
      }

      case 'weekly': {
        // Monday 00:00 UTC
        const d = new Date(now);
        const day = d.getUTCDay();
        const diff = (day === 0 ? 6 : day - 1); // Days since Monday
        d.setUTCDate(d.getUTCDate() - diff);
        d.setUTCHours(0, 0, 0, 0);
        return { startTime: d.getTime(), endTime: now };
      }

      case 'custom': {
        const start = this.settings.customStartTime || (now - 4 * 3600 * 1000);
        const end = this.settings.customEndTime || now;
        return { startTime: start, endTime: end };
      }

      case 'lookback':
      default: {
        const bars = Math.max(10, this.settings.lookbackBars || 100);
        // Estimate lookback in minutes based on timeframe
        const tfMinutes = this.timeframe === '1d' ? 1440 : this.timeframe === '1h' ? 60 : this.timeframe === '15m' ? 15 : this.timeframe === '5m' ? 5 : 1;
        const ms = bars * tfMinutes * 60 * 1000;
        return { startTime: now - ms, endTime: now };
      }
    }
  }

  /**
   * Main calculation: Aggregates delta by price bucket across the selected range
   */
  public getMetrics(customStep?: number): DeltaProfileMetrics {
    const step = customStep && customStep > 0 ? customStep : this.getPriceStep();

    if (!this.isDirty && this.cachedMetrics && this.cachedStep === step) {
      return this.cachedMetrics;
    }

    this.cachedStep = step;
    const { startTime, endTime } = this.getTimeRangeBounds();
    const inst = InstrumentRegistry.getInstrument(this.symbol, this.exchange);
    const isEstimated = !inst?.supportsTrades;

    const levelMap = new Map<number, { buyVolume: number; sellVolume: number; tradeCount: number }>();
    let rawTradesFound = 0;
    let minTradeTime = Infinity;
    let maxTradeTime = -Infinity;

    // 1. Process genuine executed trades within the time range
    const startSec = Math.floor(startTime / 1000);
    const endSec = Math.floor(endTime / 1000);

    for (const t of this.trades) {
      const tMs = t.timestamp;
      if (tMs >= startTime && tMs <= endTime) {
        rawTradesFound++;
        if (tMs < minTradeTime) minTradeTime = tMs;
        if (tMs > maxTradeTime) maxTradeTime = tMs;

        const p = this.alignPrice(t.price, step);
        let row = levelMap.get(p);
        if (!row) {
          row = { buyVolume: 0, sellVolume: 0, tradeCount: 0 };
          levelMap.set(p, row);
        }

        const qty = t.quantity || 0;
        // Aggressor classification:
        // side === 'buy' OR isBuyerMaker === false => Buyer took liquidity at ask
        // side === 'sell' OR isBuyerMaker === true => Seller took liquidity at bid
        if (t.side === 'buy' || t.isBuyerMaker === false) {
          row.buyVolume += qty;
        } else if (t.side === 'sell' || t.isBuyerMaker === true) {
          row.sellVolume += qty;
        } else {
          // Neutral / unclassified: equal split
          row.buyVolume += qty * 0.5;
          row.sellVolume += qty * 0.5;
        }
        row.tradeCount += 1;
      }
    }

    // 2. Blend with footprint candles:
    // Footprint candles carry genuine microstructure askVolume/bidVolume for each level
    let footprintUsed = false;
    const minTradeSec = minTradeTime !== Infinity ? Math.floor(minTradeTime / 1000) : Infinity;

    if (this.footprintCandles.length > 0) {
      for (const fc of this.footprintCandles) {
        if (fc.candleStart >= startSec && fc.candleStart <= endSec) {
          // Include footprint candle if it ended before our trades started, or if we have no raw trades at all
          if (fc.candleEnd <= minTradeSec || rawTradesFound === 0) {
            footprintUsed = true;
            for (const [lvlPrice, lvl] of fc.levels.entries()) {
              const p = this.alignPrice(lvlPrice, step);
              let row = levelMap.get(p);
              if (!row) {
                row = { buyVolume: 0, sellVolume: 0, tradeCount: 0 };
                levelMap.set(p, row);
              }
              // Ask volume = aggressive buyers taking ask
              // Bid volume = aggressive sellers taking bid
              row.buyVolume += lvl.askVolume || 0;
              row.sellVolume += lvl.bidVolume || 0;
              row.tradeCount += lvl.tradeCount || 1;
            }
          }
        }
      }
    }

    // 3. Supplement with historical candles across visible range when needed
    let candlesUsed = false;
    if (this.candles.length > 0) {
      for (const c of this.candles) {
        const cTimeSec = typeof c.time === 'number' ? c.time : Math.floor(new Date(c.time).getTime() / 1000);
        if (cTimeSec >= startSec && cTimeSec <= endSec) {
          const hasFootprint = this.footprintCandles.some(fc => fc.candleStart === cTimeSec);
          if (!hasFootprint && (cTimeSec < minTradeSec || rawTradesFound === 0)) {
            candlesUsed = true;
            const lowP = this.alignPrice(c.low, step);
            const highP = this.alignPrice(c.high, step);
            const numRungs = Math.max(1, Math.round((highP - lowP) / step) + 1);
            const volPerRung = (c.volume || 1) / numRungs;
            const isGreen = c.close >= c.open;
            const buyRatio = c.buyVolume !== undefined && c.volume > 0
              ? c.buyVolume / c.volume
              : (isGreen ? 0.54 : 0.46);
            const sellRatio = 1 - buyRatio;

            for (let p = lowP; p <= highP + step * 0.0001; p += step) {
              const alignedP = this.alignPrice(p, step);
              let row = levelMap.get(alignedP);
              if (!row) {
                row = { buyVolume: 0, sellVolume: 0, tradeCount: 0 };
                levelMap.set(alignedP, row);
              }
              row.buyVolume += volPerRung * buyRatio;
              row.sellVolume += volPerRung * sellRatio;
              row.tradeCount += Math.max(1, Math.round((c.tradeCount || 5) / numRungs));
            }
          }
        }
      }
    }

    // 3. Assemble and calculate discrete levels
    const levels: DeltaPriceLevel[] = [];
    let totalBuy = 0;
    let totalSell = 0;
    let minPrice = Infinity;
    let maxPrice = -Infinity;

    let maxAbsDelta = 0;
    let deltaPocLevel: DeltaPriceLevel | null = null;
    let maxVolume = 0;
    let volumePocLevel: DeltaPriceLevel | null = null;
    let maxPosDelta = 0;
    let maxPosPrice = 0;
    let maxNegDelta = 0;
    let maxNegPrice = 0;

    const sortedPrices = Array.from(levelMap.keys()).sort((a, b) => a - b);

    for (const price of sortedPrices) {
      const data = levelMap.get(price)!;
      const buyVol = Math.round(data.buyVolume * 1000) / 1000;
      const sellVol = Math.round(data.sellVolume * 1000) / 1000;
      const totalVol = Math.round((buyVol + sellVol) * 1000) / 1000;
      const delta = Math.round((buyVol - sellVol) * 1000) / 1000;
      const deltaPct = totalVol > 0 ? Math.round(((buyVol - sellVol) / totalVol) * 1000) / 10 : 0;

      totalBuy += buyVol;
      totalSell += sellVol;
      minPrice = Math.min(minPrice, price);
      maxPrice = Math.max(maxPrice, price);

      const level: DeltaPriceLevel = {
        price,
        buyVolume: buyVol,
        sellVolume: sellVol,
        totalVolume: totalVol,
        delta,
        deltaPercent: deltaPct,
        tradeCount: data.tradeCount,
      };

      // Delta POC (Price Level with Greatest Absolute Net Delta)
      const absDelta = Math.abs(delta);
      if (absDelta > maxAbsDelta) {
        maxAbsDelta = absDelta;
        deltaPocLevel = level;
      }

      // Volume POC (Peak Total Volume)
      if (totalVol > maxVolume) {
        maxVolume = totalVol;
        volumePocLevel = level;
      }

      // Extremes
      if (delta > maxPosDelta) {
        maxPosDelta = delta;
        maxPosPrice = price;
      }
      if (delta < maxNegDelta) {
        maxNegDelta = delta;
        maxNegPrice = price;
      }

      levels.push(level);
    }

    if (deltaPocLevel) {
      deltaPocLevel.isPoc = true;
    }

    if (minPrice === Infinity) minPrice = 0;
    if (maxPrice === -Infinity) maxPrice = 0;

    const netDelta = Math.round((totalBuy - totalSell) * 1000) / 1000;
    const totalVolume = Math.round((totalBuy + totalSell) * 1000) / 1000;

    // 4. Detect Trapped Buyers and Trapped Sellers
    const trappedBuyers: TrappedZone[] = [];
    const trappedSellers: TrappedZone[] = [];

    if (levels.length >= 4 && maxAbsDelta > 0) {
      const priceSpan = maxPrice - minPrice;
      const highZoneThreshold = maxPrice - priceSpan * 0.30; // Upper 30%
      const lowZoneThreshold = minPrice + priceSpan * 0.30;  // Lower 30%
      const avgLevelDelta = levels.reduce((sum, l) => sum + Math.abs(l.delta), 0) / levels.length;
      const deltaSignificance = Math.max(avgLevelDelta * 1.35, maxAbsDelta * 0.25);

      // Trapped Buyers:
      // Strong positive aggressive delta in upper zone (buyers taking ask aggressively at resistance)
      // but price was rejected downwards
      for (const l of levels) {
        if (l.price >= highZoneThreshold && l.delta > deltaSignificance && l.deltaPercent >= 20) {
          l.isTrappedBuyer = true;
          trappedBuyers.push({
            price: l.price,
            delta: l.delta,
            deltaPercent: l.deltaPercent,
            volume: l.totalVolume,
            type: 'buyer',
            label: 'POTENTIAL TRAPPED BUYERS',
            rejectionPrice: maxPrice,
          });
        }
      }

      // Trapped Sellers:
      // Strong negative aggressive delta in lower zone (sellers taking bid aggressively at support)
      // but price was absorbed and held / bounced upwards
      for (const l of levels) {
        if (l.price <= lowZoneThreshold && l.delta < -deltaSignificance && l.deltaPercent <= -20) {
          l.isTrappedSeller = true;
          trappedSellers.push({
            price: l.price,
            delta: l.delta,
            deltaPercent: l.deltaPercent,
            volume: l.totalVolume,
            type: 'seller',
            label: 'POTENTIAL TRAPPED SELLERS',
            rejectionPrice: minPrice,
          });
        }
      }
    }

    // 5. Delta Divergence Detection
    let divergence: DeltaDivergence | null = null;
    if (levels.length >= 6) {
      // Compare lower half net delta vs upper half net delta
      const mid = (minPrice + maxPrice) / 2;
      let upperDelta = 0;
      let lowerDelta = 0;
      for (const l of levels) {
        if (l.price >= mid) upperDelta += l.delta;
        else lowerDelta += l.delta;
      }

      // If price pushed to range highs but upper delta is negative or sharply weaker
      if (upperDelta < 0 && netDelta > 0) {
        divergence = {
          type: 'bearish',
          label: 'BEARISH DELTA DIVERGENCE (Highs Absorption)',
          description: 'Price is testing upper range levels but aggressive buy delta failed to sustain; sellers absorbing.',
          priceDelta: Math.round((maxPrice - mid) * 100) / 100,
          flowDelta: Math.round(upperDelta * 100) / 100,
        };
      } else if (lowerDelta > 0 && netDelta < 0) {
        divergence = {
          type: 'bullish',
          label: 'BULLISH DELTA DIVERGENCE (Lows Absorption)',
          description: 'Price pushed to lower range levels but aggressive selling dried up; buyer absorption holding.',
          priceDelta: Math.round((mid - minPrice) * 100) / 100,
          flowDelta: Math.round(lowerDelta * 100) / 100,
        };
      }
    }

    const dataSource = (rawTradesFound > 0 && !footprintUsed && !candlesUsed)
      ? 'authoritative_trades'
      : (rawTradesFound > 0 || footprintUsed ? 'footprint_clusters' : 'estimated');

    const metrics: DeltaProfileMetrics = {
      levels,
      minPrice,
      maxPrice,
      stepPrice: step,
      totalBuyVolume: Math.round(totalBuy * 100) / 100,
      totalSellVolume: Math.round(totalSell * 100) / 100,
      netDelta,
      totalVolume,
      deltaPoc: deltaPocLevel,
      volumePoc: volumePocLevel,
      maxPositiveDelta: Math.round(maxPosDelta * 100) / 100,
      maxPositiveDeltaPrice: maxPosPrice,
      maxNegativeDelta: Math.round(maxNegDelta * 100) / 100,
      maxNegativeDeltaPrice: maxNegPrice,
      maxAbsoluteDelta: Math.round(maxAbsDelta * 100) / 100,
      trappedBuyers,
      trappedSellers,
      divergence,
      dataSource,
      isEstimated: isEstimated || dataSource === 'estimated',
      startTimestamp: startTime,
      endTimestamp: endTime,
      symbol: this.symbol,
      exchange: this.exchange,
    };

    this.cachedMetrics = metrics;
    this.isDirty = false;
    return metrics;
  }

  /**
   * Generates formatted order-flow summary for JARVIS AI context
   */
  public getAIAnalytics(): AIDeltaProfileAnalytics {
    const m = this.getMetrics();

    // Verify delta POC price belongs to current instrument
    const hasPlausiblePoc = m.deltaPoc && isPricePlausibleForSymbol(this.symbol, m.deltaPoc.price);
    const validDeltaPoc = hasPlausiblePoc ? m.deltaPoc : null;
    const validVolumePoc = m.volumePoc && isPricePlausibleForSymbol(this.symbol, m.volumePoc.price) ? m.volumePoc.price : 0;

    const validBuyers = m.trappedBuyers.filter((b) => isPricePlausibleForSymbol(this.symbol, b.price));
    const validSellers = m.trappedSellers.filter((s) => isPricePlausibleForSymbol(this.symbol, s.price));

    const buyersZone = validBuyers.length > 0
      ? `${validBuyers.length} levels (Peak $${validBuyers[0].price}, +${validBuyers[0].delta} delta)`
      : null;
    const sellersZone = validSellers.length > 0
      ? `${validSellers.length} levels (Peak $${validSellers[0].price}, ${validSellers[0].delta} delta)`
      : null;

    const summary = m.levels.length === 0 || !hasPlausiblePoc
      ? 'Delta Profile active but awaiting trade flow accumulation.'
      : `Net Delta: ${m.netDelta > 0 ? '+' : ''}${m.netDelta} (${m.totalVolume > 0 ? Math.round((m.netDelta / m.totalVolume) * 100) : 0}%). Delta POC at $${validDeltaPoc?.price || 'N/A'} (Delta: ${validDeltaPoc?.delta || 0}). ` +
        (buyersZone ? `Potential Trapped Buyers observed around ${buyersZone}. ` : '') +
        (sellersZone ? `Potential Trapped Sellers observed around ${sellersZone}. ` : '') +
        (m.divergence ? `Alert: ${m.divergence.label}. ` : '') +
        `Data: ${m.dataSource} (${m.isEstimated ? 'Estimated Proxy' : 'Exchange Verified'}).`;

    return {
      netDelta: m.netDelta,
      totalVolume: m.totalVolume,
      deltaPocPrice: validDeltaPoc?.price || 0,
      deltaPocDelta: validDeltaPoc?.delta || 0,
      deltaPocDeltaPercent: validDeltaPoc?.deltaPercent || 0,
      volumePocPrice: validVolumePoc,
      maxPositiveDeltaPrice: m.maxPositiveDeltaPrice && isPricePlausibleForSymbol(this.symbol, m.maxPositiveDeltaPrice) ? m.maxPositiveDeltaPrice : 0,
      maxNegativeDeltaPrice: m.maxNegativeDeltaPrice && isPricePlausibleForSymbol(this.symbol, m.maxNegativeDeltaPrice) ? m.maxNegativeDeltaPrice : 0,
      trappedBuyersZone: buyersZone,
      trappedSellersZone: sellersZone,
      divergence: m.divergence ? m.divergence.label : null,
      dataSource: m.dataSource,
      isEstimated: m.isEstimated,
      summary,
    };
  }

  public clear() {
    this.trades = [];
    this.seenTradeIds.clear();
    this.tradeIdOrder = [];
    this.footprintCandles = [];
    this.candles = [];
    this.cachedMetrics = null;
    this.cachedStep = 0;
    this.isDirty = true;
    this.notify();
  }
}
