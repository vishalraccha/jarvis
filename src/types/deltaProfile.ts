/**
 * JARVIS 2.0 Delta Profile Types
 * Buy/Sell Delta Distribution by Price & Order-Flow Analytics
 */

export type DeltaProfileRangeMode =
  | 'visible'       // Visible Chart Range (synchronized with chart view)
  | 'session'       // Current Trading Session (Asia, London, NY)
  | 'prev_session'  // Previous Trading Session
  | 'daily'         // Daily (UTC Day)
  | 'weekly'        // Weekly
  | 'custom'        // Custom User-Defined Time Range
  | 'lookback';     // Rolling Lookback (e.g. last 100 bars)

export type DeltaProfileScalingMode = 'normalized' | 'absolute';

export interface DeltaProfileSettings {
  enabled: boolean;
  rangeMode: DeltaProfileRangeMode;
  lookbackBars: number;
  customStartTime?: number;
  customEndTime?: number;
  ticksPerRow: number;
  widthPx: number;
  posColor: string;
  negColor: string;
  zeroLineColor: string;
  showPoc: boolean;
  pocColor: string;
  showTrappedBuyers: boolean;
  showTrappedSellers: boolean;
  showDivergence: boolean;
  scalingMode: DeltaProfileScalingMode;
  showNumbersOnBars?: boolean; // Show order-flow delta numbers directly on profile bars
  minDeltaThreshold: number;
  opacity: number;
  placement: 'right' | 'left';
}

export const DEFAULT_DELTA_PROFILE_SETTINGS: DeltaProfileSettings = {
  enabled: false,
  rangeMode: 'visible',
  lookbackBars: 100,
  ticksPerRow: 1,
  widthPx: 220,
  posColor: '#00e676', // Bright vibrant teal/green for positive delta
  negColor: '#ff2d55', // Vibrant red for negative delta
  zeroLineColor: 'rgba(255, 255, 255, 0.25)',
  showPoc: true,
  pocColor: '#facc15', // Vibrant yellow POC marker
  showTrappedBuyers: true,
  showTrappedSellers: true,
  showDivergence: true,
  scalingMode: 'normalized',
  showNumbersOnBars: true,
  minDeltaThreshold: 0,
  opacity: 0.88,
  placement: 'right',
};

export interface DeltaPriceLevel {
  price: number;
  buyVolume: number;
  sellVolume: number;
  delta: number;           // buyVolume - sellVolume
  totalVolume: number;     // buyVolume + sellVolume
  deltaPercent: number;    // (buyVolume - sellVolume) / (buyVolume + sellVolume) * 100
  tradeCount: number;
  isPoc?: boolean;
  isTrappedBuyer?: boolean;
  isTrappedSeller?: boolean;
}

export interface TrappedZone {
  price: number;
  delta: number;
  deltaPercent: number;
  volume: number;
  type: 'buyer' | 'seller';
  label: string; // e.g. "POTENTIAL TRAPPED BUYERS" or "POTENTIAL TRAPPED SELLERS"
  rejectionPrice?: number;
}

export interface DeltaDivergence {
  type: 'bullish' | 'bearish';
  label: string;
  description: string;
  priceDelta: number;
  flowDelta: number;
}

export interface DeltaProfileMetrics {
  levels: DeltaPriceLevel[];
  minPrice: number;
  maxPrice: number;
  stepPrice: number;
  totalBuyVolume: number;
  totalSellVolume: number;
  netDelta: number;
  totalVolume: number;
  deltaPoc: DeltaPriceLevel | null;      // Peak absolute net delta level
  volumePoc: DeltaPriceLevel | null;     // Peak total volume level (for distinct comparison)
  maxPositiveDelta: number;
  maxPositiveDeltaPrice: number;
  maxNegativeDelta: number;
  maxNegativeDeltaPrice: number;
  maxAbsoluteDelta: number;
  trappedBuyers: TrappedZone[];
  trappedSellers: TrappedZone[];
  divergence: DeltaDivergence | null;
  dataSource: 'authoritative_trades' | 'footprint_clusters' | 'estimated';
  isEstimated: boolean;
  startTimestamp: number;
  endTimestamp: number;
  symbol: string;
  exchange: string;
}

export interface AIDeltaProfileAnalytics {
  netDelta: number;
  totalVolume: number;
  deltaPocPrice: number;
  deltaPocDelta: number;
  deltaPocDeltaPercent: number;
  volumePocPrice: number;
  maxPositiveDeltaPrice: number;
  maxNegativeDeltaPrice: number;
  trappedBuyersZone: string | null;
  trappedSellersZone: string | null;
  divergence: string | null;
  dataSource: string;
  isEstimated: boolean;
  summary: string;
}
