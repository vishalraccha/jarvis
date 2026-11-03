/**
 * J.A.R.V.I.S 2.0 - Gamma Exposure (GEX) & Options Intelligence Types
 * Defines data structures for options chains, Black-Scholes Greeks,
 * dealer positioning models, gamma flip price scenarios, and wall detection.
 */

export type OptionType = 'call' | 'put';

/**
 * Dealer Positioning Models:
 * - spotgamma_standard: Dealers assumed Long Calls (+1) and Short Puts (-1).
 * - retail_long: Retail traders buy calls & puts; Dealers are Short All (-1 Calls, -1 Puts).
 * - inverted_yield: Covered call overwriting / put selling; Dealers Short Calls (-1), Long Puts (+1).
 * - volume_informed: Trade aggressor side weighting (buyer-maker / seller-maker estimation).
 * - provider_supplied: Authorized dealer inventory when available from provider.
 */
export type DealerPositionModel =
  | 'spotgamma_standard'
  | 'retail_long'
  | 'inverted_yield'
  | 'volume_informed'
  | 'provider_supplied';

export interface DealerModelMetadata {
  id: DealerPositionModel;
  name: string;
  shortDescription: string;
  assumptions: string;
  callSign: number;
  putSign: number;
  confidenceScore: number;
}

export const DEALER_POSITION_MODELS: Record<DealerPositionModel, DealerModelMetadata> = {
  spotgamma_standard: {
    id: 'spotgamma_standard',
    name: 'Standard Market Maker (SpotGamma Convention)',
    shortDescription: 'Dealers Long Calls (+), Short Puts (-)',
    assumptions:
      'Assumes market makers are net long calls (institutional overwriting supply) and net short puts (downside hedging demand). Net positive gamma dampens volatility above flip; net negative gamma accelerates volatility below flip.',
    callSign: 1,
    putSign: -1,
    confidenceScore: 85,
  },
  retail_long: {
    id: 'retail_long',
    name: 'Retail Long / Dealer Short All',
    shortDescription: 'Dealers Short Calls (-), Short Puts (-)',
    assumptions:
      'Assumes customers and retail traders are net buyers of all options contracts for directional leverage and protection. Dealers are net short gamma across both wings, requiring hedging in the direction of the trend.',
    callSign: -1,
    putSign: -1,
    confidenceScore: 75,
  },
  inverted_yield: {
    id: 'inverted_yield',
    name: 'Yield Overwrite / Systematic Put Selling',
    shortDescription: 'Dealers Short Calls (-), Long Puts (+)',
    assumptions:
      'Assumes systematic funds sell cash-secured puts and retail aggressively buys upside call options. Reverses standard put hedging dynamics.',
    callSign: -1,
    putSign: 1,
    confidenceScore: 65,
  },
  volume_informed: {
    id: 'volume_informed',
    name: 'Volume-Informed Trade Sign Model',
    shortDescription: 'Estimated from aggressor side volume',
    assumptions:
      'Dynamically weights dealer position sign based on intraday buyer vs seller aggressor volume on the option contract. If trades executed on the ask, customers bought (dealers sold = short gamma). If on the bid, customers sold (dealers bought = long gamma).',
    callSign: 1, // Dynamically adjusted
    putSign: -1,
    confidenceScore: 80,
  },
  provider_supplied: {
    id: 'provider_supplied',
    name: 'Provider-Supplied Verified Inventory',
    shortDescription: 'Exchange-reported dealer positioning',
    assumptions:
      'Uses exchange-cleared or regulatory positioning reports (e.g., CFTC/OCC/broker inventory) when verified and authorized. Falls back to standard model when unverified.',
    callSign: 1,
    putSign: -1,
    confidenceScore: 95,
  },
};

/**
 * GEX Calculation Unit:
 * - dollar_per_1pct: Dollar GEX per 1% move in underlying = Gamma * OI * Multiplier * Spot^2 * 0.01 * Sign
 * - dollar_per_point: Dollar GEX per 1-point move in underlying = Gamma * OI * Multiplier * Spot * Sign
 * - contract_gamma: Raw share/contract Gamma = Gamma * OI * Multiplier * Sign
 */
export type GexUnit = 'dollar_per_1pct' | 'dollar_per_point' | 'contract_gamma';

export interface OptionContract {
  id: string;
  symbol: string;
  strike: number;
  type: OptionType;
  expiration: string;            // 'YYYY-MM-DD'
  expirationTimestamp: number;   // Epoch ms
  openInterest: number;
  volume: number;
  impliedVolatility: number;     // e.g. 0.55 for 55%
  gamma: number;                 // Provider-supplied or Black-Scholes calculated
  delta?: number;
  theta?: number;
  vega?: number;
  underlyingPrice: number;
  contractMultiplier: number;    // e.g. 100 for Equity/ETF/Index, 1 for Deribit Crypto, 100 for COMEX
  bidPrice?: number;
  askPrice?: number;
  markPrice?: number;
  source: string;                // e.g. 'Deribit', 'CBOE', 'OPRA', 'COMEX'
  isProviderGamma?: boolean;
}

export type GexDataQuality = 'verified' | 'delayed' | 'synthetic_unavailable' | 'basis_adjusted';

export interface OptionChainSnapshot {
  underlyingSymbol: string;      // e.g. 'BTCUSDT', 'XAUUSD', 'NAS100', 'QQQ'
  optionsUnderlying: string;     // e.g. 'DERIBIT:BTC', 'COMEX:GC_OPT', 'CBOE:NDX', 'OPRA:QQQ'
  spotPrice: number;
  timestamp: number;
  openInterestDate: string;
  ivTimestamp: number;
  contracts: OptionContract[];
  isStale: boolean;
  dataQuality: GexDataQuality;
  basisWarning?: string;
  provider: string;
}

export interface GexStrikeLevel {
  strike: number;
  callGex: number;
  putGex: number;
  netGex: number;
  totalOpenInterest: number;
  callOpenInterest: number;
  putOpenInterest: number;
  totalVolume: number;
  gammaConcentration: number;    // Percentage (0 - 100%) of aggregate absolute gamma
  isCallWall?: boolean;
  isPutWall?: boolean;
  isCurrentSpot?: boolean;
  isGammaFlip?: boolean;
}

export interface GexExpirationBreakdown {
  expiration: string;
  dte: number;                   // Days to expiration (e.g. 0 for 0DTE)
  is0DTE: boolean;
  netGex: number;
  callGex: number;
  putGex: number;
  totalOpenInterest: number;
  totalVolume: number;
  percentageOfTotal: number;
}

export type GammaRegime = 'positive_gamma' | 'negative_gamma' | 'near_gamma_flip' | 'unresolved';

export interface ZeroCrossing {
  price: number;
  distanceFromSpot: number;
  distancePercent: number;
  slope: 'positive_to_negative' | 'negative_to_positive';
}

export interface WallLevel {
  strike: number;
  exposure: number;
  callExposure: number;
  putExposure: number;
  distance: number;
  distancePct: number;
  concentrationPct: number;
  dominantExpiration: string;
}

export interface PriceScenarioPoint {
  movePct: number;
  hypotheticalSpot: number;
  estimatedNetGex: number;
  deltaHedgeDollar: number;      // Dollar delta re-hedging requirement per 1% move
  regime: GammaRegime;
}

export interface ModelComparisonResult {
  model: DealerPositionModel;
  name: string;
  netGex: number;
  gammaFlipPrice: number | null;
  callWall: number;
  putWall: number;
  regime: GammaRegime;
}

export interface GexMetrics {
  totalNetGex: number;
  netGex?: number;
  spotPrice?: number;
  positiveGex: number;
  negativeGex: number;
  callGex: number;
  putGex: number;
  gammaRegime: GammaRegime;
  regime?: GammaRegime;
  regimeDescription: string;
  gammaFlip: ZeroCrossing | null;
  allZeroCrossings: ZeroCrossing[];
  callWall: WallLevel;
  putWall: WallLevel;
  majorPositiveLevels: number[];
  majorNegativeLevels: number[];
  nearExpirationConcentrationPct: number; // 0-7 DTE exposure percentage
  topStrikesConcentrationPct: number;     // Top 3 strikes concentration percentage
  strikes: GexStrikeLevel[];
  expirations: GexExpirationBreakdown[];
  scenarioAnalysis: PriceScenarioPoint[];
  scenarios?: PriceScenarioPoint[];
  modelComparisons: ModelComparisonResult[];
  snapshotTimestamp: number;
  calculatedAt: number;
  positioningModel: DealerPositionModel;
  unit: GexUnit;
  underlying: string;
  optionsUnderlying: string;
  dataQuality: GexDataQuality;
  isStale: boolean;
  basisNotice?: string;
  provider: string;
}

export interface GexSettings {
  enabled: boolean;
  showChartOverlay: boolean;
  showGammaFlipLine: boolean;
  showCallWallLine: boolean;
  showPutWallLine: boolean;
  showMajorGammaLines: boolean;
  positioningModel: DealerPositionModel;
  unit: GexUnit;
  minExposureFilter: number;
  selectedExpirations: string[];
  enableScenarioAnalysis: boolean;
  colorCall: string;
  colorPut: string;
  colorFlip: string;
  colorCallWall: string;
  colorPutWall: string;
  showProfileLadder: boolean;
  profileWidthPx: number;
}

export const DEFAULT_GEX_SETTINGS: GexSettings = {
  enabled: true,
  showChartOverlay: true,
  showProfileLadder: true,
  profileWidthPx: 260,
  showGammaFlipLine: true,
  showCallWallLine: true,
  showPutWallLine: true,
  showMajorGammaLines: true,
  positioningModel: 'spotgamma_standard',
  unit: 'dollar_per_1pct',
  minExposureFilter: 0,
  selectedExpirations: [],
  enableScenarioAnalysis: true,
  colorCall: '#10b981',      // Emerald Green
  colorPut: '#f43f5e',       // Rose Red
  colorFlip: '#f59e0b',      // Amber Gold
  colorCallWall: '#06b6d4',  // Cyan Blue
  colorPutWall: '#ec4899',   // Vivid Pink
};
