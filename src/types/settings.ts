/**
 * Terminal Global Preferences and View State
 * JARVIS HEATMAP TERMINAL
 */

import { CandleTimeframe, ExchangeId } from './market';
import { BubbleSettings, DepthProfileSettings, HeatmapSettings } from './heatmap';
import { ChartMode, FootprintSettings } from './footprint';

export interface VwapSettings {
  enabled: boolean;
  anchor: 'session' | 'week' | 'month' | 'continuous';
  source: 'hlc3' | 'close' | 'hl2';
  showBands1: boolean;
  multiplier1: number;
  showBands2: boolean;
  multiplier2: number;
  vwapColor: string;
  band1Color: string;
  band2Color: string;
  lineWidth: number;
  bandsStyle: 'dashed' | 'dotted' | 'solid';
}

export const DEFAULT_VWAP_SETTINGS: VwapSettings = {
  enabled: true,
  anchor: 'session',
  source: 'hlc3',
  showBands1: true,
  multiplier1: 1.0,
  showBands2: true,
  multiplier2: 2.0,
  vwapColor: '#ff9f1c', // Radiant golden-orange
  band1Color: '#38bdf8', // Sky blue for SD 1
  band2Color: '#a855f7', // Purple/violet for SD 2
  lineWidth: 2,
  bandsStyle: 'dashed',
};

export interface TerminalPreferences {
  exchange: ExchangeId;
  symbol: string;
  timeframe: CandleTimeframe;
  chartMode: ChartMode;
  showHeatmap: boolean;
  showCandles: boolean;
  showBubbles: boolean;
  showDepthProfile: boolean;
  showFootprint: boolean;
  showBestBidAskLines: boolean;
  showCurrentPriceLine: boolean;
  showLiquidityShifts: boolean;
  showVwap: boolean;
  autoScrollToLatest: boolean;
  heatmap: HeatmapSettings;
  bubbles: BubbleSettings;
  depthProfile: DepthProfileSettings;
  footprint: FootprintSettings;
  vwap: VwapSettings;
}

export const DEFAULT_HEATMAP_SETTINGS: HeatmapSettings = {
  colorScale: 'bookmap',
  saturation: 0, // Deprecated alias / default 0% filter
  liquidityFilterPercentile: 0, // 0% = show all valid observed liquidity
  liquidityFilterMode: 'percentile',
  colorSaturation: 1.15, // Rich Bookmap color saturation
  brightness: 1.05,
  opacity: 0.95,
  contrast: 1.10,
  autoContrast: true,
  normalizationMode: 'visible_window',
  normalizationWindowMs: 3600000,
  lowerCutoffPercentile: 0, // Keep full depth visible
  upperCutoffPercentile: 98,
  lowerCutoffAbsolute: 0,
  upperCutoffAbsolute: 0,
  useLogScale: true,
  verticalSmoothing: 'auto',
  smoothingStrength: 0.35,
  visibleDepthLevels: 400,
  staleLevelTimeoutSec: 180,
  priceAggregationTicks: 5,
  minLiquidityQty: 0, // Show all visible order book liquidity including ambient blue field
  minLiquidityNotional: 0,
  zoneThickness: 'medium',
  removeTradedLiquidity: false, // Major liquidity remains prominently visible as Red & Orange bands across time!
  zoneMinDurationMs: 1500,
  zoneMergeDistanceTicks: 2,
  zoneActivationThreshold: 75,
  zoneDeactivationThreshold: 50,
  maxOutlinedZones: 15,
  showZoneOutlines: false,
  showContinuousHeatmap: true,
};

export const DEFAULT_BUBBLE_SETTINGS: BubbleSettings = {
  enabled: true,
  minTradeNotional: 1000,
  minTradeQty: 0.01,
  bubbleScale: 0.85,
  minRadiusPx: 4,
  maxRadiusPx: 26,
  opacity: 0.90,
  showBuyBubbles: true,
  showSellBubbles: true,
  aggregationIntervalMs: 300,
  render3DStyle: true,
};

export const DEFAULT_DEPTH_PROFILE_SETTINGS: DepthProfileSettings = {
  enabled: true,
  widthPx: 220,
  opacity: 0.90,
  bidColor: '#00d26a',
  askColor: '#eb2d4b',
  showValues: true,
  normalized: true,
  maxLevels: 150,
  showDelta: true,
  showVolumeProfile: true,
  showPoc: true,
};

export const DEFAULT_FOOTPRINT_SETTINGS: FootprintSettings = {
  enabled: true,
  chartMode: 'footprint',
  showBidAskText: true,
  showVolumeColors: true,
  showDeltaColors: true,
  showImbalances: true,
  showStackedImbalances: true,
  showPocHighlight: true,
  showCandleDelta: true, // Display overall delta below each candle by default
  showBottomPanel: false,
  showSideProfile: true, // Solid blue profile on the left matching Image 2
  showWickAndBody: true,
  showDebugInspection: false,
  imbalanceRatio: 3.0,
  minImbalanceVolume: 0.5,
  stackedImbalanceMinLevels: 3,
  tickMultiplier: 1,
  fontSize: 10,
  volumeIntensity: 1.0,
  bidColor: '#f6465d',
  askColor: '#38bdf8',
  imbalanceAskColor: '#38bdf8',
  imbalanceBidColor: '#f6465d',
  pocColor: '#ef4444',
  deltaPositiveColor: '#0ecb81',
  deltaNegativeColor: '#f6465d',
  sideProfileWidth: 125,
  valueAreaPercent: 70,
  bottomPanelHeight: 120,
  bottomPanelMinimized: false,
};

export const DEFAULT_TERMINAL_PREFERENCES: TerminalPreferences = {
  exchange: 'binance',
  symbol: 'XAUUSD',
  timeframe: '1m',
  chartMode: 'candles',
  showHeatmap: true,
  showCandles: true,
  showBubbles: true,
  showDepthProfile: true, // Bookmap COB / DOM profile active by default
  showFootprint: false,
  showBestBidAskLines: false,
  showCurrentPriceLine: true,
  showLiquidityShifts: false,
  showVwap: true, // VWAP active by default
  autoScrollToLatest: true,
  heatmap: DEFAULT_HEATMAP_SETTINGS,
  bubbles: DEFAULT_BUBBLE_SETTINGS,
  depthProfile: DEFAULT_DEPTH_PROFILE_SETTINGS,
  footprint: DEFAULT_FOOTPRINT_SETTINGS,
  vwap: DEFAULT_VWAP_SETTINGS,
};
