/**
 * Absorption Detection Engine Types & Configurations
 * JARVIS HEATMAP TERMINAL - ORDER FLOW ABSORPTION
 */

export type AbsorptionType = 'buy_absorption' | 'sell_absorption';

export type AbsorptionGrade = 'A' | 'A+';

export type AbsorptionZoneType =
  | 'resting_wall'
  | 'heatmap_band'
  | 'poc'
  | 'vwap'
  | 'session_high_low'
  | 'session_high'
  | 'session_low'
  | 'swing_level'
  | 'pdh_pdl';

export interface AbsorptionEvent {
  id: string;
  timestamp: number; // Event occurrence timestamp in ms
  candleTime?: number; // Integer seconds timestamp aligned with candle bar
  price: number; // Dominant absorbed price level
  priceCluster: {
    min: number;
    max: number;
  };
  type: AbsorptionType; // buy_absorption (bullish defense at support) or sell_absorption (bearish defense at resistance)
  grade: AbsorptionGrade; // 'A' (Strong) or 'A+' (Exceptional)
  score: number; // Internal evidence confidence score (0-100)
  totalAbsorbedVolume: number; // Total aggressive volume absorbed at this level
  aggressiveBuyVolume: number; // Volume of aggressive buyers lifting the ask
  aggressiveSellVolume: number; // Volume of aggressive sellers hitting the bid
  tradeCount: number; // Number of executions in the absorption cluster
  priceDisplacement: number; // Max penetration beyond the level during the event
  priceDisplacementTicks: number; // Penetration expressed in tick units
  holdDurationMs: number; // How long the defense held under pressure (ms)
  zoneType: AbsorptionZoneType;
  zoneStrength: number; // Resting depth or relative weight of defended zone
  zoneDescription: string; // Human-readable zone description (e.g., "Resting Bid Wall (145.2 oz)")
  replenishmentObserved: boolean; // Confirmed liquidity replenishment or iceberg behavior
  replenishmentRatio: number; // Volume absorbed divided by initially visible resting depth
  confidence: number; // Confidence level 0.00 - 1.00
  dataQuality: 'authoritative' | 'estimated_aggressor' | 'partial';
  rejectionObserved: boolean; // Subsequent price movement rejected away from defended level
  instrument: string; // Canonical symbol
  volumeMultiplier?: number; // Multiple of rolling average volume
}

export interface AbsorptionSettings {
  enabled: boolean;
  gradeFilter: 'all' | 'a_plus_only'; // 'all' displays both A and A+; 'a_plus_only' shows only A+
  minVolumeMultiplier: number; // Relative volume multiplier above instrument rolling baseline (default 1.5)
  minConfidenceScore: number; // Minimum confidence score (default 70 for A, 85 for A+)
  zoneRelevanceToleranceTicks: number; // Max ticks from a recognized liquidity zone (default 3)
  maxClusterSpreadTicks: number; // Max spread of price cluster to group executions (default 2)
  bubbleMinRadius: number; // Min radius in pixels (default 14)
  bubbleMaxRadius: number; // Max radius in pixels (default 38)
  color: string; // Bubble color (mandatory YELLOW: #facc15)
  showGlowForAPlus: boolean; // Visual golden pulse / dual border for A+
}

export const DEFAULT_ABSORPTION_SETTINGS: AbsorptionSettings = {
  enabled: true,
  gradeFilter: 'all',
  minVolumeMultiplier: 1.5,
  minConfidenceScore: 70,
  zoneRelevanceToleranceTicks: 3,
  maxClusterSpreadTicks: 2,
  bubbleMinRadius: 14,
  bubbleMaxRadius: 38,
  color: '#facc15', // Pure Yellow
  showGlowForAPlus: true,
};
