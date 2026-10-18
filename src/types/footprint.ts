/**
 * Footprint Chart, Delta, POC & Imbalance Engine Types
 * JARVIS ORDER FLOW TERMINAL
 */

import { CandleTimeframe, ExchangeId, MarketType } from './market';

export type ChartMode = 'candles' | 'heatmap' | 'footprint' | 'heatmap_footprint';

export interface FootprintLevel {
  price: number;
  bidVolume: number;         // Seller-aggressor volume (market sell hitting resting bid)
  askVolume: number;         // Buyer-aggressor volume (market buy lifting resting ask)
  totalVolume: number;       // bidVolume + askVolume
  delta: number;             // askVolume - bidVolume
  tradeCount: number;
  isAskImbalance?: boolean;  // Buyer aggressor imbalance vs lower bid level
  isBidImbalance?: boolean;  // Seller aggressor imbalance vs higher ask level
  askImbalanceRatio?: number;
  bidImbalanceRatio?: number;
  isStackedAskImbalance?: boolean;
  isStackedBidImbalance?: boolean;
  isPoc?: boolean;
  domBidLiquidity?: number;  // Resting order book / DOM bid depth at this price
  domAskLiquidity?: number;  // Resting order book / DOM ask depth at this price
  domTotalLiquidity?: number;// Total DOM depth at this price
  domImbalance?: number;     // Order book resting bid/ask imbalance ratio or delta
}

export interface FootprintCandle {
  symbol: string;
  exchange: ExchangeId | string;
  marketType?: MarketType;
  timeframe: CandleTimeframe;
  candleStart: number;       // Unix timestamp in seconds (aligned with Lightweight Charts candle time)
  candleEnd: number;         // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  levels: Map<number, FootprintLevel>; // Price -> FootprintLevel
  totalVolume: number;
  buyVolume: number;         // Total aggressive buyer volume
  sellVolume: number;        // Total aggressive seller volume
  delta: number;             // buyVolume - sellVolume
  deltaPercent: number | null;// (delta / totalClassifiedVolume) * 100, null if 0
  pocPrice: number;
  pocVolume: number;
  isComplete: boolean;       // False if historical trade gaps exist or trade stream disconnected
  stackedAskImbalances?: Array<{ minPrice: number; maxPrice: number; count: number }>;
  stackedBidImbalances?: Array<{ minPrice: number; maxPrice: number; count: number }>;
}

export interface FootprintSettings {
  enabled: boolean;
  chartMode: ChartMode;

  // Visual toggles
  showBidAskText: boolean;
  showVolumeColors: boolean;
  showDeltaColors: boolean;
  showImbalances: boolean;
  showStackedImbalances: boolean;
  showPocHighlight: boolean;
  showCandleDelta: boolean;
  showBottomPanel: boolean;
  showSideProfile: boolean;
  showWickAndBody: boolean;
  showDebugInspection?: boolean;

  // Order flow calculation parameters
  imbalanceRatio: number;          // Default 3.0 (3:1)
  minImbalanceVolume: number;      // Minimum volume to qualify for imbalance (e.g. 1.0 BTC)
  stackedImbalanceMinLevels: number;// Consecutive levels required (default: 3)
  tickMultiplier: number;          // 1, 2, 4, 8, etc.

  // Visual styling
  fontSize: number;                // 8 to 14 px
  volumeIntensity: number;         // 0.2 to 2.0
  bidColor: string;                // Seller-aggressor emphasis (default: #ef4444)
  askColor: string;                // Buyer-aggressor emphasis (default: #10b981)
  imbalanceAskColor: string;       // Bold highlight for ask imbalance (default: #22c55e)
  imbalanceBidColor: string;       // Bold highlight for bid imbalance (default: #f43f5e)
  pocColor: string;                // POC outline / accent (default: #f59e0b)
  deltaPositiveColor: string;      // Positive delta label color (default: #10b981)
  deltaNegativeColor: string;      // Negative delta label color (default: #ef4444)

  // Side Profile & Bottom Panel
  sideProfileWidth: number;        // 120 - 300 px
  valueAreaPercent: number;        // 68 - 70%
  bottomPanelHeight: number;       // 80 - 240 px
  bottomPanelMinimized: boolean;
}

export interface VolumeProfileLevel {
  price: number;
  totalVolume: number;
  buyVolume: number;
  sellVolume: number;
  delta: number;
  tradeCount: number;
  isPoc: boolean;
  isValueArea: boolean;
}

export interface VolumeProfileResult {
  levels: VolumeProfileLevel[];
  pocPrice: number;
  pocVolume: number;
  vah: number;                     // Value Area High
  val: number;                     // Value Area Low
  totalVolume: number;
  totalBuyVolume: number;
  totalSellVolume: number;
  totalDelta: number;
  fromTimestamp: number;
  toTimestamp: number;
}

export interface FootprintDebugInfo {
  candleStart: number;
  candleEnd: number;
  timeframe: string;
  bucketPrice: number;
  bucketSize: number;
  bucketMin: number;
  bucketMax: number;
  mouseScreenY: number;
  calcScreenYTop: number;
  calcScreenYBottom: number;
  calcScreenYCenter: number;
  yDisplacementDelta: number;
  bidVolume: number;
  askVolume: number;
  totalVolume: number;
  delta: number;
  isPoc: boolean;
  pocPrice: number;
  isAskImbalance: boolean;
  isBidImbalance: boolean;
  sourceDataValidity: string;
}
