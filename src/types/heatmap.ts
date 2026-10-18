/**
 * Heatmap, Liquidity Shifts, and Trade Bubble Types
 * JARVIS HEATMAP TERMINAL
 */

import { TradeSide } from './market';

export interface HeatmapPricePoint {
  price: number;
  bidQty: number;
  askQty: number;
  totalQty: number;
}

export type ZoneClassificationState =
  | 'ACTIVE LIQUIDITY'
  | 'APPROACHED'
  | 'TOUCHED'
  | 'TRADE-ASSOCIATED DEPLETION'
  | 'POSSIBLY PULLED'
  | 'SWEPT / TRADED THROUGH'
  | 'REJECTED'
  | 'PARTIALLY DEPLETED'
  | 'REPLENISHED'
  | 'INDETERMINATE';

export interface HeatmapObservation {
  exchange: string;
  symbol: string;
  marketType: 'spot' | 'linear_perpetual';
  price: number;
  timestamp: number;
  bidQty: number;
  askQty: number;
  totalQty: number;
  sourceUpdateId?: number;
  isValid: boolean;
  dataFreshnessMs: number;
}

export interface HeatmapTimeSlice {
  exchange?: string;
  symbol?: string;
  marketType?: 'spot' | 'linear_perpetual';
  timestamp: number;        // Milliseconds
  bestBid: number;
  bestAsk: number;
  levels: Map<number, number>; // Price -> Quantity (resting limit orders)
  bids: Map<number, number>;
  asks: Map<number, number>;
  totalBidLiquidity: number;
  totalAskLiquidity: number;
  sourceUpdateId?: number;
  isValid?: boolean;
  freshnessTimestamp?: number;
}

export type LiquidityShiftType =
  | 'added'
  | 'reduced'
  | 'removed'
  | 'replenished'
  | 'depleted_by_trade';

export interface LiquidityShiftEvent {
  id: string;
  timestamp: number;
  price: number;
  type: LiquidityShiftType;
  deltaQty: number;
  absChange: number;
  pctChange: number;
  previousQty: number;
  currentQty: number;
  isAsk: boolean;
  attribution: 'observed' | 'inferred';
}

export interface TradeBubble {
  id: string;
  timestamp: number;       // Milliseconds
  price: number;           // Volume-weighted average price of aggregated cluster
  buyQty: number;          // Aggressor buyer volume
  sellQty: number;         // Aggressor seller volume
  totalQty: number;
  totalNotional: number;
  buyRatio: number;        // buyQty / totalQty (0 to 1)
  tradeCount: number;
  dominantSide: TradeSide;
}

export type ColorScaleType = 'bookmap' | 'grayscale' | 'fire' | 'custom';

export type LiquidityZoneState = 'candidate' | 'active' | 'weakening' | 'removed' | 'expired';

export interface ZoneHistorySegment {
  startTime: number;
  endTime: number;
  avgQty: number;
  maxQty: number;
  significance: number;
}

export interface LiquidityZone {
  id: string;
  exchange: string;
  symbol: string;
  marketType: string;
  priceMin: number;
  priceMax: number;
  centerPrice: number;
  firstObservedTime: number;
  lastObservedTime: number;
  maxObservedQty: number;
  avgObservedQty: number;
  currentObservedQty: number;
  persistenceDurationMs: number;
  relativeSignificance: number; // 0 - 100 score
  state: LiquidityZoneState;
  classification: ZoneClassificationState;
  isBid: boolean;
  historySegments: ZoneHistorySegment[];
  tradeCount: number;
  observationCount: number;
  touchCount: number;
  tradeAssociatedExecutedQty: number;
  observedRemoval: boolean;
  replenishmentCount: number;
  isValid: boolean;
  lastUpdateId?: number;
}

export interface LiquidityInspectionResult {
  hasObservation: boolean;
  exchange: string;
  symbol: string;
  marketType: string;
  price: number;
  priceMin: number;
  priceMax: number;
  timestamp: number;
  firstObservedTime: number;
  lastObservedTime: number;
  persistenceMs: number;
  currentQty: number;
  maxQty: number;
  avgQty: number;
  touchCount: number;
  tradeExecutedQty: number;
  observedRemoval: boolean;
  replenishmentCount: number;
  classification: ZoneClassificationState;
  isValid: boolean;
  freshnessMs: number;
  sourceUpdateId?: number;
  isZone: boolean;
  zoneId?: string;
}

export type NormalizationMode = 'visible_window' | 'rolling' | 'fixed';

export type LiquidityLifecycleState =
  | 'active'
  | 'increased'
  | 'reduced'
  | 'replenished'
  | 'consumed'
  | 'withdrawn'
  | 'stale';

export interface HeatmapSettings {
  colorScale: ColorScaleType;
  saturation: number;      // Deprecated alias for liquidityFilterPercentile / backwards compatibility
  liquidityFilterPercentile: number; // 0 to 100% (filters weaker liquidity below percentile without altering colors)
  liquidityFilterMode: 'percentile' | 'absolute'; // 'percentile' (default) or 'absolute' (using minLiquidityQty)
  colorSaturation: number; // 0.2 to 2.0 (graphics color saturation, default: 1.0)
  brightness: number;      // 0.2 to 2.0 (default: 1.0)
  opacity: number;         // 0.1 to 1.0 (default: 0.85)
  contrast: number;        // 0.1 to 3.0 (default: 1.25)
  autoContrast: boolean;   // Calculate robust percentile-based dynamic range
  normalizationMode: NormalizationMode; // 'visible_window' (default) | 'rolling' | 'fixed'
  normalizationWindowMs: number; // e.g. 3600000 (1 hour for rolling mode)
  lowerCutoffPercentile: number; // e.g. 10th percentile to suppress noise
  upperCutoffPercentile: number; // e.g. 96th percentile
  lowerCutoffAbsolute: number;   // 0 = disabled
  upperCutoffAbsolute: number;   // 0 = disabled
  useLogScale: boolean;    // log1p scaling for orders
  verticalSmoothing: 'none' | 'auto' | 'manual';
  smoothingStrength: number; // 0 to 1
  visibleDepthLevels: number; // 100 to 1000 levels
  staleLevelTimeoutSec: number; // Clear levels not touched after X seconds
  priceAggregationTicks: number; // 1 = 1 tick, 2 = 2 ticks, 5, 10, etc. (display bucket step)
  minLiquidityQty: number;       // e.g. 2.0 BTC: only show resting liquidity >= this qty in absolute mode
  minLiquidityNotional: number;  // e.g. 250000 USD: only show resting walls >= this notional
  zoneThickness: 'fine' | 'medium' | 'thick'; // Liquidity zone visual thickness
  removeTradedLiquidity: boolean; // Strictly remove orders that have been traded/filled

  // Zone Engine Parameters (Sections 4, 7, 9)
  zoneMinDurationMs: number;     // Minimum persistence duration (e.g. 1500ms)
  zoneMergeDistanceTicks: number;// Adjacent price bucket merge threshold (e.g. 2 ticks)
  zoneActivationThreshold: number;// Significance score required to activate (e.g. 75)
  zoneDeactivationThreshold: number;// Significance score below which zone deactivates (e.g. 50)
  maxOutlinedZones: number;      // Rendering budget for prominent outlined zones (e.g. 15)
  showZoneOutlines: boolean;     // Render clean institutional zone borders
  showContinuousHeatmap: boolean;// Render underlying continuous time x price surface
}

export interface BubbleSettings {
  enabled: boolean;
  minTradeNotional: number;  // e.g. 1000 USD
  minTradeQty: number;       // e.g. 0.05 BTC
  bubbleScale: number;       // 0.5 to 3.0
  minRadiusPx: number;       // 4px
  maxRadiusPx: number;       // 40px
  opacity: number;           // 0.2 to 1.0
  showBuyBubbles: boolean;
  showSellBubbles: boolean;
  aggregationIntervalMs: number; // 250ms aggregation
  render3DStyle: boolean;    // Realistic 3D Bookmap sphere styling
}

export interface DepthProfileSettings {
  enabled: boolean;
  widthPx: number;           // 120px to 320px
  opacity: number;           // 0.8
  bidColor: string;          // #00e676 (green)
  askColor: string;          // #ff1744 (red)
  showValues: boolean;
  normalized: boolean;
  maxLevels: number;
  showDelta?: boolean;          // Show Delta at price (buy vol - sell vol)
  showVolumeProfile?: boolean;  // Show traded Volume Profile at price
  showPoc?: boolean;            // Highlight Point of Control (peak traded volume)
}
