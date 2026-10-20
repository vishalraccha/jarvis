/**
 * Correct Local Order Book Manager
 * Implements strict Binance depth snapshot & delta sequence synchronization
 * JARVIS HEATMAP TERMINAL
 */

import { DepthDeltaUpdate, DepthSnapshot, OrderBookLevel } from '../../types/market';
import { IExchangeAdapter } from '../exchange/ExchangeAdapter';

export type BookSyncStatus = 'INITIALIZING' | 'BUFFERING' | 'SYNCHRONIZED' | 'DESYNCHRONIZED' | 'RESYNCING';

export interface OrderBookStats {
  syncStatus: BookSyncStatus;
  lastUpdateId: number;
  bestBid: number;
  bestAsk: number;
  spread: number;
  midPrice: number;
  bidLevelsCount: number;
  askLevelsCount: number;
  totalBidLiquidity: number;
  totalAskLiquidity: number;
  sequenceGapsDetected: number;
  resyncCount: number;
  lastEventTimestamp: number;
}

export type OrderBookChangeCallback = (stats: OrderBookStats) => void;

export class OrderBookManager {
  private tickSize: number = 0.01;
  private precisionMultiplier: number = 100; // 1 / tickSize

  // Order Book storage using integer ticks: tickIndex -> quantity
  // tickIndex = Math.round(price * precisionMultiplier)
  private bids = new Map<number, number>();
  private asks = new Map<number, number>();

  private syncStatus: BookSyncStatus = 'INITIALIZING';
  private bufferedUpdates: DepthDeltaUpdate[] = [];
  private lastValidUpdateId: number = 0;
  private lastEventTimestamp: number = 0;

  // Stats
  private sequenceGapsDetected: number = 0;
  private resyncCount: number = 0;

  // Cache sorted levels for fast querying
  private cachedBestBid: number = 0;
  private cachedBestAsk: number = 0;

  private isResyncing: boolean = false;
  private lastResyncAttemptTime: number = 0;
  private listeners: Set<OrderBookChangeCallback> = new Set();

  constructor(tickSize: number = 0.01) {
    this.setTickSize(tickSize);
  }

  setTickSize(tickSize: number): void {
    this.tickSize = tickSize > 0 ? tickSize : 0.01;
    this.precisionMultiplier = Math.round(1 / this.tickSize);
  }

  subscribe(callback: OrderBookChangeCallback): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners(): void {
    const stats = this.getStats();
    for (const listener of this.listeners) {
      listener(stats);
    }
  }

  getSyncStatus(): BookSyncStatus {
    return this.syncStatus;
  }

  getBestBid(): number {
    return this.cachedBestBid;
  }

  getBestAsk(): number {
    return this.cachedBestAsk;
  }

  getPrecisionMultiplier(): number {
    return this.precisionMultiplier;
  }

  getTickSize(): number {
    return this.tickSize;
  }

  /**
   * Reset the book completely (e.g. on symbol change or unrecoverable error)
   */
  reset(): void {
    this.bids.clear();
    this.asks.clear();
    this.bufferedUpdates = [];
    this.lastValidUpdateId = 0;
    this.cachedBestBid = 0;
    this.cachedBestAsk = 0;
    this.syncStatus = 'INITIALIZING';
    this.isResyncing = false;
    this.notifyListeners();
  }

  /**
   * Start synchronization workflow with given exchange adapter and symbol
   */
  async synchronize(adapter: IExchangeAdapter, symbol: string): Promise<void> {
    if (this.isResyncing) return;
    const now = Date.now();
    if (now - this.lastResyncAttemptTime < 4000) {
      return; // Cooldown active to protect against request storms
    }
    this.lastResyncAttemptTime = now;
    this.isResyncing = true;
    this.syncStatus = this.lastValidUpdateId > 0 ? 'RESYNCING' : 'BUFFERING';
    this.notifyListeners();

    try {
      // 1. Fetch snapshot from exchange (1000 levels is the exchange-standard for deep depth)
      const snapshot: DepthSnapshot = await adapter.fetchDepthSnapshot(symbol, 1000);

      // 2. Clear previous book state
      this.bids.clear();
      this.asks.clear();

      // 3. Populate snapshot bids & asks
      for (const [p, q] of snapshot.bids) {
        if (p > 10 && q > 0) {
          const tick = Math.round(p * this.precisionMultiplier);
          this.bids.set(tick, q);
        }
      }
      for (const [p, q] of snapshot.asks) {
        if (p > 10 && q > 0) {
          const tick = Math.round(p * this.precisionMultiplier);
          this.asks.set(tick, q);
        }
      }

      this.lastValidUpdateId = snapshot.lastUpdateId;
      this.lastEventTimestamp = snapshot.timestamp;

      // 4. Align with buffered updates
      // Drop any event where u <= lastUpdateId
      const validBuffered = this.bufferedUpdates.filter((u) => u.finalUpdateId > snapshot.lastUpdateId);

      if (validBuffered.length > 0) {
        // The first processed update must have U <= lastUpdateId + 1 AND u >= lastUpdateId + 1
        const first = validBuffered[0];
        if (first.firstUpdateId > snapshot.lastUpdateId + 1) {
          // Gap between snapshot and first buffered update! Must resync with graceful backoff!
          console.warn(
            `[OrderBookManager] Gap detected at snapshot alignment: first.U=${first.firstUpdateId} > snap=${snapshot.lastUpdateId} + 1`
          );
          this.sequenceGapsDetected++;
          this.resyncCount++;
          this.syncStatus = 'DESYNCHRONIZED';
          this.isResyncing = false;
          // Resync again after backoff to let buffer settle
          setTimeout(() => this.synchronize(adapter, symbol), 3000);
          return;
        }

        // Apply buffered updates in sequence
        for (const update of validBuffered) {
          this.applyUpdateDirect(update);
        }
      }

      this.bufferedUpdates = [];
      this.syncStatus = 'SYNCHRONIZED';
      this.isResyncing = false;
      this.updateBestBidAsk();
      this.notifyListeners();
    } catch (err) {
      console.error('[OrderBookManager] Snapshot sync error:', err);
      this.syncStatus = 'DESYNCHRONIZED';
      this.isResyncing = false;
      this.notifyListeners();
      setTimeout(() => this.synchronize(adapter, symbol), 4000);
    }
  }

  private lastTradeHit: { price: number; quantity: number; side: 'buy' | 'sell'; timestamp: number } | null = null;

  getLastTradeHit(): { price: number; quantity: number; side: 'buy' | 'sell'; timestamp: number } | null {
    return this.lastTradeHit;
  }

  /**
   * Handle incoming WebSocket depth delta update continuously without freezing
   */
  handleDepthUpdate(update: DepthDeltaUpdate, adapter?: IExchangeAdapter, symbol?: string): void {
    this.lastEventTimestamp = update.eventTime;

    if (this.syncStatus === 'INITIALIZING' || this.syncStatus === 'BUFFERING' || this.syncStatus === 'RESYNCING') {
      this.bufferedUpdates.push(update);
      if (this.bufferedUpdates.length > 500) {
        this.bufferedUpdates.shift();
      }
      // Apply directly to book so COB never displays a frozen or empty ladder
      this.applyUpdateDirect(update);
      this.updateBestBidAsk();
      this.notifyListeners();
      return;
    }

    // Drop duplicate older updates
    if (update.finalUpdateId <= this.lastValidUpdateId) {
      return;
    }

    // Check sequence continuity
    if (this.lastValidUpdateId > 0 && update.firstUpdateId > this.lastValidUpdateId + 1) {
      this.sequenceGapsDetected++;
      this.syncStatus = 'DESYNCHRONIZED';
      // Reconcile snapshot in background if adapter provided
      if (adapter && symbol && !this.isResyncing) {
        const now = Date.now();
        if (now - this.lastResyncAttemptTime > 5000) {
          this.lastResyncAttemptTime = now;
          adapter.fetchDepthSnapshot(symbol, 1000).then((snapshot) => {
            for (const [p, q] of snapshot.bids) {
              if (p > 10) {
                const tick = Math.round(p * this.precisionMultiplier);
                if (q > 0) this.bids.set(tick, q);
                else this.bids.delete(tick);
              }
            }
            for (const [p, q] of snapshot.asks) {
              if (p > 10) {
                const tick = Math.round(p * this.precisionMultiplier);
                if (q > 0) this.asks.set(tick, q);
                else this.asks.delete(tick);
              }
            }
            this.lastValidUpdateId = Math.max(this.lastValidUpdateId, snapshot.lastUpdateId);
            this.syncStatus = 'SYNCHRONIZED';
            this.updateBestBidAsk();
            this.notifyListeners();
          }).catch(() => {});
        }
      }
    } else {
      this.syncStatus = 'SYNCHRONIZED';
    }

    // Apply live delta to resting book
    this.applyUpdateDirect(update);
    this.updateBestBidAsk();
    this.notifyListeners();
  }

  /**
   * Consume resting limit liquidity when an aggressive market order executes.
   * Market Buy consumes resting Asks; Market Sell consumes resting Bids.
   * This drives the live COB ladder and causes the price to move dynamically!
   */
  consumeLiquidity(price: number, quantity: number, side: 'buy' | 'sell' | 'unknown'): void {
    if (price <= 10 || quantity <= 0) return;
    const tick = Math.round(price * this.precisionMultiplier);
    const resolvedSide: 'buy' | 'sell' = side === 'unknown' 
      ? (price >= (this.cachedBestAsk || price) ? 'buy' : 'sell') 
      : side;
    this.lastTradeHit = { price, quantity, side: resolvedSide, timestamp: Date.now() };

    if (resolvedSide === 'buy') {
      // Market buy hits resting limit asks
      const cur = this.asks.get(tick);
      if (cur !== undefined) {
        const remaining = Math.max(0, cur - quantity);
        if (remaining <= 0.001) {
          this.asks.delete(tick);
        } else {
          this.asks.set(tick, remaining);
        }
      }
    } else {
      // Market sell hits resting limit bids
      const cur = this.bids.get(tick);
      if (cur !== undefined) {
        const remaining = Math.max(0, cur - quantity);
        if (remaining <= 0.001) {
          this.bids.delete(tick);
        } else {
          this.bids.set(tick, remaining);
        }
      }
    }

    this.updateBestBidAsk();
    this.notifyListeners();
  }

  private applyUpdateDirect(update: DepthDeltaUpdate): void {
    this.lastValidUpdateId = update.finalUpdateId;

    // Apply bids
    for (const [p, q] of update.bids) {
      if (p <= 10) continue;
      const tick = Math.round(p * this.precisionMultiplier);
      if (q === 0) {
        this.bids.delete(tick);
      } else {
        this.bids.set(tick, q);
      }
    }

    // Apply asks
    for (const [p, q] of update.asks) {
      if (p <= 10) continue;
      const tick = Math.round(p * this.precisionMultiplier);
      if (q === 0) {
        this.asks.delete(tick);
      } else {
        this.asks.set(tick, q);
      }
    }
  }

  getBidQuantityAtPrice(price: number): number {
    const tick = Math.round(price * this.precisionMultiplier);
    return this.bids.get(tick) || 0;
  }

  getAskQuantityAtPrice(price: number): number {
    const tick = Math.round(price * this.precisionMultiplier);
    return this.asks.get(tick) || 0;
  }

  applyIncrementalUpdate(update: {
    firstUpdateId: number;
    lastUpdateId: number;
    timestamp: number;
    bids: [number, number][];
    asks: [number, number][];
  }): void {
    this.handleDepthUpdate({
      eventTime: update.timestamp,
      firstUpdateId: update.firstUpdateId,
      finalUpdateId: update.lastUpdateId,
      bids: update.bids,
      asks: update.asks,
    });
  }

  private updateBestBidAsk(): void {
    let maxBidTick = 0;
    for (const tick of this.bids.keys()) {
      if (tick > maxBidTick) {
        maxBidTick = tick;
      }
    }

    let minAskTick = Number.MAX_SAFE_INTEGER;
    for (const tick of this.asks.keys()) {
      if (tick < minAskTick) {
        minAskTick = tick;
      }
    }

    this.cachedBestBid = maxBidTick > 0 ? maxBidTick / this.precisionMultiplier : 0;
    this.cachedBestAsk = minAskTick < Number.MAX_SAFE_INTEGER ? minAskTick / this.precisionMultiplier : 0;
  }

  /**
   * Retrieve current depth profile sorted: asks (ascending price) and bids (descending price)
   */
  getDepthProfile(limit: number = 200): { bids: OrderBookLevel[]; asks: OrderBookLevel[] } {
    const sortedBidTicks = Array.from(this.bids.keys()).sort((a, b) => b - a);
    const sortedAskTicks = Array.from(this.asks.keys()).sort((a, b) => a - b);

    const bids: OrderBookLevel[] = [];
    const countBids = Math.min(limit, sortedBidTicks.length);
    for (let i = 0; i < countBids; i++) {
      const tick = sortedBidTicks[i];
      bids.push({
        price: tick / this.precisionMultiplier,
        quantity: this.bids.get(tick) || 0,
      });
    }

    const asks: OrderBookLevel[] = [];
    const countAsks = Math.min(limit, sortedAskTicks.length);
    for (let i = 0; i < countAsks; i++) {
      const tick = sortedAskTicks[i];
      asks.push({
        price: tick / this.precisionMultiplier,
        quantity: this.asks.get(tick) || 0,
      });
    }

    return { bids, asks };
  }

  /**
   * Get all active price levels within a price range [pMin, pMax] sorted
   */
  getLevelsInRange(
    pMin: number,
    pMax: number
  ): { bids: OrderBookLevel[]; asks: OrderBookLevel[]; maxQty: number; totalBidQty: number; totalAskQty: number } {
    const minTick = Math.floor(Math.min(pMin, pMax) * this.precisionMultiplier);
    const maxTick = Math.ceil(Math.max(pMin, pMax) * this.precisionMultiplier);

    const bids: OrderBookLevel[] = [];
    let totalBidQty = 0;
    let maxQty = 0;

    for (const [tick, qty] of this.bids) {
      if (tick >= minTick && tick <= maxTick && qty > 0) {
        const price = tick / this.precisionMultiplier;
        bids.push({ price, quantity: qty });
        totalBidQty += qty;
        if (qty > maxQty) maxQty = qty;
      }
    }
    bids.sort((a, b) => b.price - a.price);

    const asks: OrderBookLevel[] = [];
    let totalAskQty = 0;

    for (const [tick, qty] of this.asks) {
      if (tick >= minTick && tick <= maxTick && qty > 0) {
        const price = tick / this.precisionMultiplier;
        asks.push({ price, quantity: qty });
        totalAskQty += qty;
        if (qty > maxQty) maxQty = qty;
      }
    }
    asks.sort((a, b) => a.price - b.price);

    return { bids, asks, maxQty, totalBidQty, totalAskQty };
  }

  /**
   * Get all active price levels in integer tick representation for heatmap sampling
   */
  getLevelsSnapshot(): {
    lastUpdateId: number;
    timestamp: number;
    bestBid: number;
    bestAsk: number;
    bids: Map<number, number>;
    asks: Map<number, number>;
  } {
    // Clone maps for snapshot isolation
    return {
      lastUpdateId: this.lastValidUpdateId,
      timestamp: this.lastEventTimestamp || Date.now(),
      bestBid: this.cachedBestBid,
      bestAsk: this.cachedBestAsk,
      bids: new Map(this.bids),
      asks: new Map(this.asks),
    };
  }

  getStats(): OrderBookStats {
    let totalBidLiquidity = 0;
    for (const q of this.bids.values()) totalBidLiquidity += q;

    let totalAskLiquidity = 0;
    for (const q of this.asks.values()) totalAskLiquidity += q;

    const midPrice =
      this.cachedBestBid > 0 && this.cachedBestAsk > 0
        ? (this.cachedBestBid + this.cachedBestAsk) / 2
        : this.cachedBestBid || this.cachedBestAsk;

    const spread =
      this.cachedBestBid > 0 && this.cachedBestAsk > 0
        ? Math.max(0, this.cachedBestAsk - this.cachedBestBid)
        : 0;

    return {
      syncStatus: this.syncStatus,
      lastUpdateId: this.lastValidUpdateId,
      bestBid: this.cachedBestBid,
      bestAsk: this.cachedBestAsk,
      spread,
      midPrice,
      bidLevelsCount: this.bids.size,
      askLevelsCount: this.asks.size,
      totalBidLiquidity,
      totalAskLiquidity,
      sequenceGapsDetected: this.sequenceGapsDetected,
      resyncCount: this.resyncCount,
      lastEventTimestamp: this.lastEventTimestamp,
    };
  }
}
