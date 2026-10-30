/**
 * JARVIS Multi-AI Trading Intelligence Engine & Expert Advisor Types
 * Types and interfaces for AI Providers, Analytics Snapshots, Trade Setups,
 * Market Intelligence, and Journaling.
 */

export type AIProvider = 'openai' | 'gemini' | 'grok';

export type AIProviderStatus =
  | 'disconnected'
  | 'connected'
  | 'testing'
  | 'invalid_key'
  | 'rate_limited'
  | 'quota_exceeded'
  | 'error';

export type AIMode = 'single' | 'compare' | 'consensus';

export interface AIProviderConfig {
  provider: AIProvider;
  enabled: boolean;
  model: string;
  hasKey: boolean;
  maskedKey?: string;
  status: AIProviderStatus;
  lastTested?: number;
  lastError?: string;
}

export interface AISystemSettings {
  enabled: boolean;
  mode: AIMode;
  primaryProvider: AIProvider;
  secondaryProvider: AIProvider;
  fallbackEnabled: boolean;
  autoAnalyzeOnRegimeChange: boolean;
  analysisIntervalSec: number;
  minConfidenceThreshold: number;
  showChartAnnotations: boolean;
  chartAnnotationFilter: 'all' | 'setups_only' | 'warnings_only';
  riskSettings: {
    riskPerTradePercent: number;
    maxDailyLossPercent: number;
    maxConcurrentSetups: number;
    rewardToRiskMin: number;
  };
}

export const DEFAULT_AI_SYSTEM_SETTINGS: AISystemSettings = {
  enabled: true,
  mode: 'single',
  primaryProvider: 'gemini',
  secondaryProvider: 'openai',
  fallbackEnabled: true,
  autoAnalyzeOnRegimeChange: true,
  analysisIntervalSec: 60,
  minConfidenceThreshold: 65,
  showChartAnnotations: true,
  chartAnnotationFilter: 'setups_only',
  riskSettings: {
    riskPerTradePercent: 1.0,
    maxDailyLossPercent: 3.0,
    maxConcurrentSetups: 2,
    rewardToRiskMin: 2.0,
  },
};

export const PROVIDER_SUPPORTED_MODELS: Record<AIProvider, Array<{ id: string; name: string; description: string; tier: 'fast' | 'pro' | 'reasoning' }>> = {
  gemini: [
    { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash (Recommended)', description: 'Ultra-fast, high-throughput order flow analysis', tier: 'fast' },
    { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', description: 'High-speed real-time market classification', tier: 'fast' },
    { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash-Lite', description: 'Ultra-low latency microstructural evaluation', tier: 'fast' },
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview', description: 'Deep institutional market reasoning & multi-timeframe synthesis', tier: 'pro' },
    { id: 'gemini-flash-latest', name: 'Gemini Flash Latest', description: 'Always points to latest production Flash tier', tier: 'fast' },
  ],
  openai: [
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Fast & Cost Efficient)', description: 'Fast, cost-efficient microstructural analysis for developer keys', tier: 'fast' },
    { id: 'gpt-4o', name: 'GPT-4o (Flagship Multimodal)', description: 'Flagship multimodal reasoning for macro & order-flow', tier: 'pro' },
    { id: 'chatgpt-4o-latest', name: 'ChatGPT-4o Latest', description: 'Dynamic latest production ChatGPT model', tier: 'pro' },
    { id: 'o3-mini', name: 'o3-mini (Reasoning)', description: 'Advanced reasoning model for complex setups', tier: 'reasoning' },
    { id: 'o1-mini', name: 'o1-mini (Reasoning)', description: 'Fast deliberative reasoning on institutional liquidity', tier: 'reasoning' },
  ],
  grok: [
    { id: 'qwen/qwen3.8-27b', name: 'Qwen 3.8 27B (Groq LPU — Ultra Fast)', description: 'Ultra-fast 500+ tok/s order flow analysis on Groq LPU', tier: 'fast' },
    { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B (Groq LPU — Deep Reasoning)', description: 'Flagship open reasoning model running on Groq LPU', tier: 'pro' },
    { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B (Groq LPU — Fast)', description: 'Instant microstructural classification on Groq LPU', tier: 'fast' },
    { id: 'grok-2', name: 'xAI Grok 2', description: 'Real-time intelligence and order flow momentum from xAI', tier: 'pro' },
    { id: 'grok-2-mini', name: 'xAI Grok 2 Mini', description: 'Fast concise market structure assessment from xAI', tier: 'fast' },
  ],
};

// ==========================================
// Market Intelligence & Regime Types
// ==========================================

export type MarketRegimeType =
  | 'strong_bullish'
  | 'strong_bearish'
  | 'weak_bullish'
  | 'weak_bearish'
  | 'ranging_sideways'
  | 'high_volatility'
  | 'low_volatility_compression'
  | 'expansion_breakout'
  | 'potential_reversal'
  | 'unclear_no_trade';

export type MarketBias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface MarketStructureAnalytics {
  trend: 'UPTREND' | 'DOWNTREND' | 'RANGING';
  swingHigh: number;
  swingLow: number;
  breakOfStructure: boolean;
  changeOfCharacter: boolean;
  structureNotes: string[];
  sessionHigh: number;
  sessionLow: number;
  pocPrice: number;
  vwap: number;
  vwapUpper: number;
  vwapLower: number;
}

export interface OrderBookAnalytics {
  bestBid: number;
  bestAsk: number;
  spread: number;
  spreadTicks: number;
  topBids: Array<{ price: number; quantity: number }>;
  topAsks: Array<{ price: number; quantity: number }>;
  restingBidWalls: Array<{ price: number; quantity: number; distancePct: number }>;
  restingAskWalls: Array<{ price: number; quantity: number; distancePct: number }>;
  totalBidDepth: number;
  totalAskDepth: number;
  bidAskDepthRatio: number; // > 1 indicates bid heavy, < 1 indicates ask heavy
  depthImbalancePercent: number; // e.g. +35% for bid dominance, -35% for ask dominance
  liveExecutionPace?: number;
}

export interface FootprintAnalytics {
  candleDelta: number;
  deltaPercent: number;
  cumulativeCvd: number;
  buyVolume: number;
  sellVolume: number;
  totalVolume: number;
  imbalanceCountBid: number;
  imbalanceCountAsk: number;
  stackedImbalances: Array<{ type: 'buy' | 'sell'; startPrice: number; endPrice: number; count: number }>;
  pocLevel: number;
}

export interface AbsorptionSummary {
  recentEventCount: number;
  latestEvent?: {
    type: 'buy_absorption' | 'sell_absorption';
    grade: 'A' | 'A+';
    price: number;
    volume: number;
    zoneDescription: string;
    timestamp: number;
  };
  buyersAbsorbingAtSupport: boolean;
  sellersAbsorbingAtResistance: boolean;
}

export interface ExternalNewsItem {
  id: string;
  headline: string;
  source: string;
  timestamp: number;
  impact: 'low' | 'medium' | 'high';
  category: 'central_bank' | 'economic_data' | 'geopolitical' | 'market_update';
}

/**
 * Compact, authoritative read-only market snapshot sent to the AI
 * Everything is derived directly from the real order book, footprint, and candles.
 */
export interface AIEvidenceSnapshot {
  instrument: string;
  timeframe: string;
  timestamp: number;
  currentPrice: number;
  atr: number;
  regime: MarketRegimeType;
  bias: MarketBias;
  structure: MarketStructureAnalytics;
  orderBook: OrderBookAnalytics;
  footprint: FootprintAnalytics;
  absorption: AbsorptionSummary;
  recentNews?: ExternalNewsItem[];
}

// ==========================================
// Trade Setup & Expert Advisor Types
// ==========================================

export type TradeDirection = 'LONG' | 'SHORT' | 'NO_TRADE';

export type EntryType = 'MARKET' | 'LIMIT' | 'STOP' | 'CONDITIONAL';

export interface TradeSetup {
  id: string;
  timestamp: number;
  instrument: string;
  direction: TradeDirection;
  setupName: string;
  marketRegime: MarketRegimeType;
  status: 'READY_NOW' | 'WAITING_CONFIRMATION' | 'TRIGGERED' | 'INVALIDATED' | 'COMPLETED';
  entryType: EntryType;
  entryPrice: number;
  entryZone?: { min: number; max: number };
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  rewardToRiskRatio: number;
  confidenceScore: number; // 0 - 100 evidence score
  reasons: string[];
  orderBookEvidence: string;
  footprintEvidence: string;
  absorptionEvidence: string;
  invalidationCondition: string;
  expirationTimeMs?: number;
  modelUsed?: string;
}

export interface ConditionalOpportunity {
  id: string;
  createdAt: number;
  instrument: string;
  targetPriceZone: { min: number; max: number };
  expectedDirection: 'LONG' | 'SHORT';
  conditionTitle: string;
  requiredConfirmation: string[];
  invalidationPrice: number;
  active: boolean;
  status: 'MONITORING' | 'TRIGGERED' | 'EXPIRED' | 'CANCELLED';
  notes: string;
}

// ==========================================
// Chat & Multi-AI Consensus Types
// ==========================================

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  provider?: AIProvider;
  model?: string;
  tradeSetup?: TradeSetup;
  snapshotRef?: {
    price: number;
    bias: MarketBias;
    regime: MarketRegimeType;
  };
  comparisonResponses?: Array<{
    provider: AIProvider;
    model: string;
    bias: MarketBias;
    confidence: number;
    summary: string;
  }>;
}

export interface AIAnalysisResponse {
  provider: AIProvider;
  model: string;
  timestamp: number;
  bias: MarketBias;
  regime: MarketRegimeType;
  confidenceScore: number;
  tradeSetup: TradeSetup;
  rawAnalysisText: string;
  evidenceFactors: Array<{ name: string; score: number; weight: number; note: string }>;
  limitationsAndRisks: string[];
}

export interface AIConsensusResult {
  timestamp: number;
  consensusBias: MarketBias;
  consensusConfidence: number;
  agreementRatio: number; // 0.0 - 1.0 (1.0 = full agreement)
  agreements: string[];
  disagreements: string[];
  finalSetup: TradeSetup;
  individualAnalyses: AIAnalysisResponse[];
  synthesizedExplanation: string;
}

// ==========================================
// Journal & Learning Engine Types
// ==========================================

export interface JournalRecord {
  id: string;
  setup: TradeSetup;
  snapshotAtCreation: AIEvidenceSnapshot;
  createdAt: number;
  triggeredAt?: number;
  closedAt?: number;
  outcome?: 'TP1_HIT' | 'TP2_HIT' | 'TP3_HIT' | 'STOP_LOSS_HIT' | 'INVALIDATED_BEFORE_TRIGGER' | 'MANUAL_EXIT';
  mfe: number; // Maximum Favourable Excursion in ticks
  mae: number; // Maximum Adverse Excursion in ticks
  realizedRR?: number;
  userFeedback?: 'GOOD' | 'BAD' | 'NEUTRAL';
  userNotes?: string;
}
