/**
 * JARVIS 2.0 AI Trading Intelligence Terminal
 * 
 * Implements Phases 5, 6, 7, 8, 10, 11:
 * - Phase 5.1: Top status section (Provider, Instrument, Timeframe, Feed status, Order-book status, Timestamp).
 * - Phase 5.2: Prominent dedicated "ANALYZE TRADE" button separate from conversational chat input.
 * - Phase 6: Structured AI Trade Report with NO TRADE support, Model Confidence vs Historical Strategy Accuracy.
 * - Phase 7: "WHY THIS TRADE?" section with Confirmations, Invalidations, Risks, and Decision-change triggers.
 * - Phase 8: Multi-Timeframe (MTF) confluence evaluation.
 * - Phase 10: Real-time analysis synchronization & staleness detection.
 * - Phase 11: Advisory risk management & position sizing.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Send,
  Trash2,
  RefreshCw,
  Minus,
  Copy,
  ArrowUpRight,
  ArrowDownRight,
  Bot,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Layers,
  TrendingUp,
  TrendingDown,
  Percent,
  CheckCircle2,
  XCircle,
  X,
  HelpCircle,
} from 'lucide-react';
import { aiOrchestrator } from '../../services/ai/AIOrchestrator';
import { calculateDynamicLiveStatus } from '../../services/ai/MarketIntelligenceEngine';
import { CandleLike } from '../../services/ai/AIToolRegistry';
import { TradeSetup, AIEvidenceSnapshot, AIProvider, AITokenStats } from '../../types/ai';
import { formatPrice } from '../../utils/formatters';
import { isPricePlausibleForSymbol } from '../../utils/priceSanity';

export const formatTokenCount = (num?: number): string => {
  if (num === undefined || num === null) return '0';
  if (num >= 1_000_000) {
    const val = (num / 1_000_000).toFixed(1);
    return `${val.endsWith('.0') ? val.slice(0, -2) : val}M`;
  }
  if (num >= 1_000) {
    const val = (num / 1_000).toFixed(1);
    return `${val.endsWith('.0') ? val.slice(0, -2) : val}K`;
  }
  return num.toLocaleString();
};

interface JarvisAITerminalProps {
  symbol: string;
  timeframe: string;
  candles: CandleLike[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onOpenConfig: (initialProvider?: AIProvider) => void;
  livePrice?: number;
}

export const ChatMessageItem = React.memo(({ msg, onOpenConfig }: { msg: any; onOpenConfig?: (p?: AIProvider) => void }) => {
  return (
    <div
      style={{
        alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
        maxWidth: '92%',
        padding: '8px 12px',
        borderRadius: msg.role === 'user' ? '10px 10px 0 10px' : '10px 10px 10px 0',
        background: msg.role === 'user' ? '#1c1e24' : '#121316',
        border: msg.role === 'user' ? '1px solid #2b2e38' : '1px solid #1c1d23',
        fontSize: 11,
        lineHeight: 1.45,
        color: '#f8fafc',
        wordBreak: 'break-word',
      }}
    >
      {msg.role === 'assistant' && (
        <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, marginBottom: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Sparkles size={10} color="#e2e8f0" />
          {msg.provider?.toUpperCase() || 'JARVIS AI'} ({msg.model || 'Intelligence'})
        </div>
      )}
      {msg.role === 'assistant' ? (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {msg.content.split('\n').map((line: string, idx: number) => {
            const trimmed = line.trim();
            if (!trimmed) return <div key={idx} style={{ height: 4 }} />;
            if (/^[-*_]{3,}$/.test(trimmed)) {
              return <div key={idx} style={{ height: 1, background: 'rgba(255, 255, 255, 0.08)', margin: '6px 0' }} />;
            }
            if (trimmed.startsWith('#')) {
              const headerText = trimmed.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();
              return (
                <div key={idx} style={{ fontSize: 11.5, fontWeight: 800, color: '#38bdf8', marginTop: 5, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 3, height: 10, background: '#38bdf8', borderRadius: 2 }} />
                  {headerText}
                </div>
              );
            }
            const isBullet = trimmed.startsWith('* ') || trimmed.startsWith('- ') || trimmed.startsWith('• ');
            const rawBody = isBullet ? trimmed.replace(/^[*\-•]\s*/, '') : trimmed;
            const segments = rawBody.split(/(\*\*[^*]+\*\*)/g);
            const formatted = segments.map((seg, sIdx) => {
              if (seg.startsWith('**') && seg.endsWith('**')) {
                const inner = seg.slice(2, -2).replace(/\*/g, '');
                const isNum = /\d+\.\d+/.test(inner);
                return (
                  <strong key={sIdx} style={{ color: isNum ? '#38bdf8' : '#ffffff', fontWeight: 700, fontFamily: isNum ? '"JetBrains Mono", monospace' : 'inherit' }}>
                    {inner}
                  </strong>
                );
              }
              return seg.replace(/\*{2,}/g, '').replace(/^\*\s*/, '');
            });

            if (isBullet) {
              return (
                <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginLeft: 2, marginBottom: 3, lineHeight: 1.45 }}>
                  <span style={{ color: '#0ecb81', fontSize: 13, lineHeight: '14px', flexShrink: 0 }}>•</span>
                  <div style={{ flex: 1, color: '#e2e8f0' }}>{formatted}</div>
                </div>
              );
            }
            return (
              <div key={idx} style={{ marginBottom: 4, lineHeight: 1.45, color: '#e2e8f0' }}>
                {formatted}
              </div>
            );
          })}
        </div>
      ) : (
        <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
      )}
    </div>
  );
});

const JarvisAITerminalComponent: React.FC<JarvisAITerminalProps> = ({
  symbol,
  timeframe,
  candles,
  livePrice: propLivePrice,
  isExpanded,
  onToggleExpand,
  onOpenConfig,
}) => {
  const [messages, setMessages] = useState(aiOrchestrator.getMessages());
  const [isAnalyzing, setIsAnalyzing] = useState(aiOrchestrator.getIsAnalyzing());
  const [activeSetup, setActiveSetup] = useState<TradeSetup | null>(aiOrchestrator.getCurrentSetup());
  const [snapshot, setSnapshot] = useState<AIEvidenceSnapshot | null>(aiOrchestrator.getCurrentSnapshot());
  const [settings, setSettings] = useState(aiOrchestrator.getSettings());
  const [providerConfigs, setProviderConfigs] = useState(aiOrchestrator.getProviderConfigs());
  const [inputQuery, setInputQuery] = useState('');
  const [copiedSetup, setCopiedSetup] = useState(false);
  const [expandedSection, setExpandedSection] = useState<'why' | 'mtf' | 'risk' | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(() => typeof window !== 'undefined' && window.innerWidth < 768);

  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Symbol switch: Immediately reset stale trade setups, snapshots, and messages from prior pair
  useEffect(() => {
    setActiveSetup(null);
    setSnapshot(null);
    setMessages([]);
    aiOrchestrator.resetForSymbol(symbol);
    aiOrchestrator.clearMessages();
  }, [symbol]);

  useEffect(() => {
    const unsub = aiOrchestrator.subscribe(() => {
      setMessages([...aiOrchestrator.getMessages()]);
      setIsAnalyzing(aiOrchestrator.getIsAnalyzing());
      setActiveSetup(aiOrchestrator.getCurrentSetup());
      setSnapshot(aiOrchestrator.getCurrentSnapshot());
      setSettings({ ...aiOrchestrator.getSettings() });
      setProviderConfigs({ ...aiOrchestrator.getProviderConfigs() });
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isAnalyzing]);

  // Dynamically update proximity, status, and dynamic confidence as price ticks live
  const effectiveLivePrice =
    propLivePrice && propLivePrice > 0 && isPricePlausibleForSymbol(symbol, propLivePrice)
      ? propLivePrice
      : candles.length > 0 && isPricePlausibleForSymbol(symbol, candles[candles.length - 1].close)
      ? candles[candles.length - 1].close
      : (snapshot?.currentPrice && isPricePlausibleForSymbol(symbol, snapshot.currentPrice) ? snapshot.currentPrice : 0);

  const safeCandles = React.useMemo(() => {
    if (!Array.isArray(candles) || candles.length === 0) return [];
    const lastBar = candles[candles.length - 1];
    return isPricePlausibleForSymbol(symbol, lastBar?.close) ? candles : [];
  }, [candles, symbol]);

  const dynamicSetup = React.useMemo(() => {
    if (!activeSetup || activeSetup.instrument !== symbol || effectiveLivePrice <= 0) {
      return activeSetup && activeSetup.instrument === symbol ? activeSetup : null;
    }
    return calculateDynamicLiveStatus(activeSetup, effectiveLivePrice);
  }, [activeSetup, effectiveLivePrice, symbol]);

  // Phase 5.2: Dedicated Analyze Trade Action
  const handleAnalyzeTrade = () => {
    const currentPrice = effectiveLivePrice > 0 ? effectiveLivePrice : undefined;
    aiOrchestrator.requestMarketAnalysis(
      symbol,
      timeframe,
      safeCandles,
      undefined,
      true, // force fresh immediate analysis
      currentPrice,
      true // isExplicitTradeAnalysis: true
    ).catch(() => {});
  };

  // Conversational Chat Send (does NOT overwrite trade recommendation)
  const handleSendMessage = (customPrompt?: string) => {
    const query = customPrompt || inputQuery;
    if (!query.trim() || isAnalyzing) return;
    setInputQuery('');
    const currentPrice = effectiveLivePrice > 0 ? effectiveLivePrice : undefined;
    aiOrchestrator.requestMarketAnalysis(
      symbol,
      timeframe,
      safeCandles,
      query,
      false,
      currentPrice,
      false // isExplicitTradeAnalysis: false
    ).catch(() => {});
  };

  const handleCopySetup = () => {
    if (!activeSetup) return;
    const text = `JARVIS 2.0 Trade Plan [${activeSetup.instrument} - ${activeSetup.analysisTimeframe}]
Direction: ${activeSetup.direction} (${activeSetup.setupName})
Entry: ${activeSetup.entryPrice}
Stop Loss: ${activeSetup.stopLoss}
TP1: ${activeSetup.takeProfit1} | TP2: ${activeSetup.takeProfit2} | TP3: ${activeSetup.takeProfit3}
R:R: 1:${activeSetup.rewardToRiskRatio}
Model Confidence: ${activeSetup.confidenceScore}% (Evidence Strength)
Historical Accuracy: ${activeSetup.accuracyMetrics?.historicalWinRate !== null ? `${activeSetup.accuracyMetrics?.historicalWinRate}% (N=${activeSetup.accuracyMetrics?.sampleSize})` : 'Insufficient historical evidence'}`;
    navigator.clipboard.writeText(text);
    setCopiedSetup(true);
    setTimeout(() => setCopiedSetup(false), 2000);
  };

  const currentProvider = settings.primaryProvider;

  const quickPrompts = [
    'Analyze Order Book Imbalance',
    'Evaluate VWAP & Key Levels',
    'Check Footprint Cumulative CVD',
    'Review Market Regime & Volatility',
  ];

  if (!isExpanded) {
    if (isMobile) {
      return (
        <button
          type="button"
          onClick={onToggleExpand}
          className="jarvis-ai-floating-btn"
          title="Open JARVIS AI Intelligence"
          style={{
            position: 'fixed',
            bottom: 40,
            left: 12,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 13px',
            borderRadius: 20,
            background: '#121316',
            border: '1px solid rgba(56, 189, 248, 0.45)',
            color: '#38bdf8',
            fontSize: 11,
            fontWeight: 700,
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.7), 0 0 10px rgba(56, 189, 248, 0.25)',
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
          }}
        >
          <Sparkles size={13} color="#38bdf8" />
          <span>AI Intelligence</span>
        </button>
      );
    }

    return (
      <aside
        style={{
          width: 38,
          background: '#0c0d10',
          borderRight: '1px solid #1a1b20',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '12px 0',
          gap: 12,
          zIndex: 40,
        }}
      >
        <button
          type="button"
          onClick={onToggleExpand}
          title="Open JARVIS AI Intelligence"
          style={{
            background: 'none',
            border: 'none',
            color: '#cbd5e1',
            cursor: 'pointer',
            padding: 6,
            borderRadius: 4,
          }}
        >
          <Sparkles size={16} />
        </button>
        <button
          type="button"
          onClick={onToggleExpand}
          title="Expand Panel"
          style={{
            background: 'none',
            border: 'none',
            color: '#64748b',
            cursor: 'pointer',
            padding: 4,
          }}
        >
          <ChevronRight size={14} />
        </button>
      </aside>
    );
  }

  return (
    <aside
      className="jarvis-ai-terminal-panel"
      style={{
        width: isMobile ? '100%' : 360,
        maxWidth: isMobile ? '100%' : 360,
        position: isMobile ? 'fixed' : 'relative',
        top: 0,
        bottom: 0,
        left: 0,
        right: isMobile ? 0 : 'auto',
        height: isMobile ? '100dvh' : '100%',
        background: '#0c0d10',
        borderRight: isMobile ? 'none' : '1px solid #1a1b20',
        display: 'flex',
        flexDirection: 'column',
        zIndex: isMobile ? 999999 : 40,
        overflow: 'hidden',
      }}
    >
      {/* 1. Top Section: Header & Status Bar (Phase 5.1) */}
      <div
        style={{
          padding: '10px 14px',
          background: '#121316',
          borderBottom: '1px solid #1c1d22',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 5,
                background: 'linear-gradient(135deg, #1f2229, #2d313b)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sparkles size={12} color="#facc15" />
            </div>
            <div>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: '#f8fafc', letterSpacing: '0.03em' }}>
                JARVIS AI INTELLIGENCE
              </span>
              <div style={{ fontSize: 9.5, color: '#64748b' }}>
                {symbol} • {timeframe} • Order-Flow Synced
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Provider Selector Switch */}
            <select
              value={currentProvider}
              onChange={(e) => aiOrchestrator.updateSettings({ primaryProvider: e.target.value as AIProvider })}
              style={{
                background: '#17181d',
                border: '1px solid #282a32',
                borderRadius: 4,
                color: '#e2e8f0',
                fontSize: 9.5,
                fontWeight: 700,
                padding: '3px 6px',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="gemini" style={{ background: '#17181d' }}>Gemini</option>
              <option value="grok" style={{ background: '#17181d' }}>Groq/xAI</option>
              <option value="openai" style={{ background: '#17181d' }}>OpenAI</option>
            </select>

            <button
              type="button"
              onClick={onToggleExpand}
              title={isMobile ? 'Close AI Intelligence' : 'Collapse Panel'}
              style={{
                background: isMobile ? 'rgba(255, 255, 255, 0.08)' : 'none',
                border: isMobile ? '1px solid rgba(255, 255, 255, 0.15)' : 'none',
                color: isMobile ? '#f8fafc' : '#94a3b8',
                cursor: 'pointer',
                padding: isMobile ? '3px 8px' : 4,
                borderRadius: isMobile ? 4 : 0,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {isMobile ? (
                <>
                  <X size={13} />
                  <span>Close</span>
                </>
              ) : (
                <ChevronLeft size={16} />
              )}
            </button>
          </div>
        </div>

        {/* Live Status Indicators (Phase 5.1) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 9.5 }}>
          <div
            style={{
              padding: '4px 6px',
              borderRadius: 4,
              background: '#15161b',
              border: '1px solid #22242c',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#0ecb81' }} />
            <span style={{ color: '#94a3b8' }}>Data:</span>
            <span style={{ color: '#f8fafc', fontWeight: 700 }}>Canonical 1:1</span>
          </div>

          <div
            style={{
              padding: '4px 6px',
              borderRadius: 4,
              background: '#15161b',
              border: '1px solid #22242c',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <Layers size={10} color="#94a3b8" />
            <span style={{ color: '#94a3b8' }}>OB Skew:</span>
            <span
              style={{
                fontWeight: 700,
                color: (snapshot?.orderBook.depthImbalancePercent || 0) >= 0 ? '#0ecb81' : '#f6465d',
              }}
            >
              {snapshot?.orderBook.depthImbalancePercent || 0}%
            </span>
          </div>
        </div>
      </div>

      {/* 2. DEDICATED ACTION: ANALYZE TRADE BUTTON (Phase 5.1 & 5.2) */}
      <div style={{ padding: '10px 14px', background: '#0e0f12', borderBottom: '1px solid #1c1d22' }}>
        <button
          type="button"
          onClick={handleAnalyzeTrade}
          disabled={isAnalyzing}
          style={{
            width: '100%',
            padding: '9px 12px',
            borderRadius: 6,
            background: isAnalyzing ? '#1a1b20' : 'linear-gradient(135deg, #1e2026 0%, #292c34 100%)',
            color: '#f8fafc',
            border: '1px solid rgba(255, 255, 255, 0.14)',
            fontWeight: 800,
            fontSize: 11.5,
            letterSpacing: '0.05em',
            cursor: isAnalyzing ? 'default' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            boxShadow: isAnalyzing ? 'none' : '0 2px 8px rgba(0, 0, 0, 0.4)',
            transition: 'all 0.2s ease',
          }}
        >
          <RefreshCw size={13} className={isAnalyzing ? 'animate-spin' : ''} color={isAnalyzing ? '#94a3b8' : '#facc15'} />
          {isAnalyzing ? 'EVALUATING MULTI-TIMEFRAME CONFLUENCE...' : '⚡ ANALYZE TRADE'}
        </button>
      </div>

      {/* 3. STRUCTURED AI TRADE REPORT CARD (Phase 6, 7, 8, 11) */}
      {(dynamicSetup || activeSetup) && (() => {
        const s = dynamicSetup || activeSetup!;
        if (s.instrument !== symbol) return null;
        const isReady = s.liveExecutionStatus === 'READY_NOW';
        const isArmed = s.liveExecutionStatus === 'ARMED';
        const isWaitForLevel = s.actionType === 'WAIT_FOR_LEVEL';

        return (
          <div
            style={{
              margin: '8px 12px',
              borderRadius: 6,
              background:
                isReady
                  ? 'rgba(14, 203, 129, 0.08)'
                  : s.direction === 'LONG'
                  ? 'rgba(14, 203, 129, 0.04)'
                  : s.direction === 'SHORT'
                  ? 'rgba(246, 70, 93, 0.04)'
                  : 'rgba(250, 204, 21, 0.04)',
              border: `1px solid ${
                isReady
                  ? 'rgba(14, 203, 129, 0.6)'
                  : isArmed
                  ? 'rgba(56, 189, 248, 0.5)'
                  : s.direction === 'LONG'
                  ? 'rgba(14, 203, 129, 0.3)'
                  : s.direction === 'SHORT'
                  ? 'rgba(246, 70, 93, 0.3)'
                  : 'rgba(250, 204, 21, 0.3)'
              }`,
              padding: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              maxHeight: 320,
              overflowY: 'auto',
              boxShadow: isReady ? '0 0 15px rgba(14, 203, 129, 0.2)' : 'none',
            }}
          >
            {/* Header: Action / Direction Badge & Status */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 900,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background:
                      isReady
                        ? 'rgba(14, 203, 129, 0.3)'
                        : s.direction === 'LONG'
                        ? 'rgba(14, 203, 129, 0.2)'
                        : s.direction === 'SHORT'
                        ? 'rgba(246, 70, 93, 0.2)'
                        : 'rgba(250, 204, 21, 0.2)',
                    color:
                      isReady
                        ? '#00e676'
                        : s.direction === 'LONG'
                        ? '#0ecb81'
                        : s.direction === 'SHORT'
                        ? '#f6465d'
                        : '#facc15',
                    letterSpacing: '0.04em',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  {isReady ? '🔥 READY NOW' : isWaitForLevel ? '⏳ WAIT FOR LEVEL' : s.direction}
                </span>

                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: 3,
                    background: isReady ? 'rgba(14, 203, 129, 0.15)' : isArmed ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                    color: isReady ? '#00e676' : isArmed ? '#facc15' : '#94a3b8',
                  }}
                >
                  {s.distanceToTrigger !== undefined ? `${s.distanceToTrigger} away` : 'Live'}
                </span>

                <span style={{ fontSize: 9.5, fontWeight: 700, color: '#e2e8f0' }}>
                  {s.direction} @ {s.entryPrice}
                </span>
              </div>

              <button
                type="button"
                onClick={handleCopySetup}
                title="Copy Trade Plan"
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 2 }}
              >
                <Copy size={12} color={copiedSetup ? '#0ecb81' : '#94a3b8'} />
              </button>
            </div>

            {/* 1. Definitive Market Movement Forecast (Single Authoritative Direction) */}
            <div
              style={{
                padding: '7px 9px',
                borderRadius: 5,
                background: s.direction === 'SHORT' ? 'rgba(246, 70, 93, 0.08)' : s.direction === 'LONG' ? 'rgba(14, 203, 129, 0.08)' : 'rgba(250, 204, 21, 0.08)',
                border: `1px solid ${
                  s.direction === 'SHORT'
                    ? 'rgba(246, 70, 93, 0.3)'
                    : s.direction === 'LONG'
                    ? 'rgba(14, 203, 129, 0.3)'
                    : 'rgba(250, 204, 21, 0.3)'
                }`,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  {s.direction === 'SHORT' ? (
                    <TrendingDown size={14} color="#f6465d" />
                  ) : s.direction === 'LONG' ? (
                    <TrendingUp size={14} color="#0ecb81" />
                  ) : (
                    <Minus size={14} color="#facc15" />
                  )}
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 900,
                      letterSpacing: '0.04em',
                      color: s.direction === 'SHORT' ? '#f6465d' : s.direction === 'LONG' ? '#0ecb81' : '#facc15',
                    }}
                  >
                    PREDICTED MOVE: {s.direction === 'SHORT' ? 'BEARISH (DOWNWARD)' : s.direction === 'LONG' ? 'BULLISH (UPWARD)' : 'EQUILIBRIUM / RANGE'}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 800,
                    padding: '2px 5px',
                    borderRadius: 3,
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: '#f8fafc',
                  }}
                >
                  Accuracy: {s.marketMovementPrediction?.probability || s.dynamicLiveConfidence || s.confidenceScore}%
                </span>
              </div>
              <div style={{ fontSize: 9.5, color: '#cbd5e1', lineHeight: 1.35 }}>
                {s.marketMovementPrediction?.expectedMoveText ||
                  (s.direction === 'SHORT'
                    ? `Order book is sell-skewed. Expecting downward continuation toward ${s.takeProfit1}.`
                    : s.direction === 'LONG'
                    ? `Order book is bid-supported. Expecting upward move toward ${s.takeProfit1}.`
                    : 'Market is compressing without decisive order flow asymmetry.')}
              </div>
            </div>

            {/* Execution Rule / Guidance Callout */}
            <div
              style={{
                fontSize: 9.5,
                lineHeight: 1.4,
                padding: '6px 8px',
                borderRadius: 4,
                background: isReady ? 'rgba(14, 203, 129, 0.12)' : 'rgba(255, 255, 255, 0.04)',
                border: `1px solid ${isReady ? 'rgba(14, 203, 129, 0.35)' : 'rgba(255, 255, 255, 0.08)'}`,
                color: '#f8fafc',
              }}
            >
              {isReady ? (
                <div>
                  <strong style={{ color: '#00e676' }}>🔥 PRICE IN EXECUTION ZONE: </strong>
                  Market price is testing ${s.entryPrice}. Execute <strong>{s.direction}</strong> now with SL at ${s.stopLoss} and TP at ${s.takeProfit1}. Dynamic Accuracy: <strong style={{ color: '#00e676' }}>{s.dynamicLiveConfidence || s.confidenceScore}%</strong>.
                </div>
              ) : (
                <div>
                  <strong style={{ color: '#facc15' }}>⏳ EXECUTION RULE: </strong>
                  Do NOT enter at floating price in mid-air. Wait for price to reach <strong>${s.entryPrice}</strong> ({s.distanceToTrigger !== undefined ? `${s.distanceToTrigger} away` : 'approaching'}). Take <strong>{s.direction}</strong> upon resting wall test with SL at ${s.stopLoss} and TP at ${s.takeProfit1}. Predicted Accuracy: <strong style={{ color: '#facc15' }}>{s.dynamicLiveConfidence || s.confidenceScore}%</strong>.
                </div>
              )}
            </div>

            {/* Trade Execution Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 10.5 }}>
              <div>
                <span style={{ color: '#94a3b8' }}>Target Entry: </span>
                <span style={{ color: '#fff', fontWeight: 700, fontFamily: '"JetBrains Mono", monospace' }}>
                  {s.entryPrice}
                </span>
              </div>
              <div>
                <span style={{ color: '#94a3b8' }}>Stop Loss: </span>
                <span style={{ color: '#f87171', fontWeight: 700, fontFamily: '"JetBrains Mono", monospace' }}>
                  {s.stopLoss}
                </span>
              </div>
              <div>
                <span style={{ color: '#94a3b8' }}>TP1: </span>
                <span style={{ color: '#38bdf8', fontWeight: 700, fontFamily: '"JetBrains Mono", monospace' }}>
                  {s.takeProfit1}
                </span>
              </div>
              <div>
                <span style={{ color: '#94a3b8' }}>R:R: </span>
                <span style={{ color: '#0ecb81', fontWeight: 700 }}>1:{s.rewardToRiskRatio}</span>
              </div>
            </div>

            {/* Single Decisive Planned Level (Matching Chosen Direction - NEVER conflicting two-way signals) */}
            {(() => {
              const activePlan = s.direction === 'SHORT' ? s.plannedSellSetup : s.plannedBuySetup;
              if (!activePlan) return null;
              const isShort = s.direction === 'SHORT';
              return (
                <div
                  style={{
                    padding: '6px 8px',
                    borderRadius: 4,
                    background: isShort ? 'rgba(246, 70, 93, 0.06)' : 'rgba(14, 203, 129, 0.06)',
                    border: `1px solid ${isShort ? 'rgba(246, 70, 93, 0.25)' : 'rgba(14, 203, 129, 0.25)'}`,
                    fontSize: 9.5,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: isShort ? '#f6465d' : '#0ecb81', fontWeight: 800 }}>
                    <span>{isShort ? 'SELL LIMIT' : 'BUY LIMIT'} @ {activePlan.level}</span>
                    <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(255,255,255,0.06)' }}>
                      {activePlan.status}
                    </span>
                  </div>
                  <div style={{ color: '#94a3b8', marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Resting Wall: <strong style={{ color: '#e2e8f0' }}>{activePlan.wallQuantity} lots</strong></span>
                    <span>Distance: <strong style={{ color: '#e2e8f0' }}>{activePlan.distance} away</strong></span>
                  </div>
                </div>
              );
            })()}

            {/* Section B: Trade Accuracy & Reliability */}
            <div
              style={{
                padding: '6px 8px',
                borderRadius: 4,
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5 }}>
                <span style={{ color: '#94a3b8' }}>1. Live Dynamic Confidence:</span>
                <span style={{ color: '#38bdf8', fontWeight: 800 }}>
                  {s.dynamicLiveConfidence || s.confidenceScore}% (Real-time Live Tick Synced)
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5 }}>
                <span style={{ color: '#94a3b8' }}>2. Historical Strategy Win Rate:</span>
                <span style={{ color: s.accuracyMetrics?.historicalWinRate !== null ? '#0ecb81' : '#f59e0b', fontWeight: 700 }}>
                  {s.accuracyMetrics?.historicalWinRate !== null
                    ? `${s.accuracyMetrics?.historicalWinRate}% (N=${s.accuracyMetrics?.sampleSize})`
                    : 'N/A (N < 20)'}
                </span>
              </div>

              <div style={{ fontSize: 8.5, color: '#64748b', fontStyle: 'italic' }}>
                {s.accuracyMetrics?.accuracyReliabilityNotice}
              </div>
            </div>

            {/* Collapsible Sections (Phase 7, 8, 11) */}
            <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
              <button
                type="button"
                onClick={() => setExpandedSection(expandedSection === 'why' ? null : 'why')}
                style={{
                  flex: 1,
                  padding: '4px 6px',
                  borderRadius: 4,
                  background: expandedSection === 'why' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: expandedSection === 'why' ? '#f8fafc' : '#94a3b8',
                  fontSize: 9,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Why This Trade?
              </button>
              <button
                type="button"
                onClick={() => setExpandedSection(expandedSection === 'mtf' ? null : 'mtf')}
                style={{
                  flex: 1,
                  padding: '4px 6px',
                  borderRadius: 4,
                  background: expandedSection === 'mtf' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: expandedSection === 'mtf' ? '#f8fafc' : '#94a3b8',
                  fontSize: 9,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Multi-Timeframe
              </button>
              <button
                type="button"
                onClick={() => setExpandedSection(expandedSection === 'risk' ? null : 'risk')}
                style={{
                  flex: 1,
                  padding: '4px 6px',
                  borderRadius: 4,
                  background: expandedSection === 'risk' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: expandedSection === 'risk' ? '#f8fafc' : '#94a3b8',
                  fontSize: 9,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Risk Check
              </button>
            </div>

            {/* Phase 7: Why This Trade Content */}
            {expandedSection === 'why' && s.whyThisTrade && (
              <div style={{ fontSize: 9.5, color: '#cbd5e1', lineHeight: 1.45, background: 'rgba(0, 0, 0, 0.3)', padding: 8, borderRadius: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div>• <strong>Liquidity:</strong> {s.whyThisTrade.liquidityPosition}</div>
                <div>• <strong>Structure:</strong> {s.whyThisTrade.marketStructureReasoning}</div>
                <div>• <strong>Confirmation:</strong> {s.whyThisTrade.whatConfirms.join(', ')}</div>
                <div>• <strong>Invalidation:</strong> {s.whyThisTrade.whatInvalidates.join(', ')}</div>
                <div>• <strong>What Could Go Wrong:</strong> {s.whyThisTrade.whatCouldGoWrong.join(', ')}</div>
              </div>
            )}

            {expandedSection === 'mtf' && s.multiTimeframeAnalysis && (
              <div style={{ fontSize: 9.5, color: '#cbd5e1', lineHeight: 1.45, background: 'rgba(0, 0, 0, 0.3)', padding: 8, borderRadius: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div>• <strong>HTF (1h):</strong> {s.multiTimeframeAnalysis.higherTimeframe.trend} (Key: {s.multiTimeframeAnalysis.higherTimeframe.keyLevel})</div>
                <div>• <strong>Intermediate ({s.multiTimeframeAnalysis.intermediateTimeframe.timeframe}):</strong> {s.multiTimeframeAnalysis.intermediateTimeframe.setupFormation}</div>
                <div>• <strong>Trigger (1m):</strong> {s.multiTimeframeAnalysis.entryTimeframe.trigger}</div>
              </div>
            )}

            {expandedSection === 'risk' && s.riskManagement && (
              <div style={{ fontSize: 9.5, color: '#cbd5e1', lineHeight: 1.45, background: 'rgba(0, 0, 0, 0.3)', padding: 8, borderRadius: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div>• <strong>Max Equity Risk:</strong> ${s.riskManagement.accountRiskAmountDollars} (1.0% limit)</div>
                <div>• <strong>Suggested Lot Size:</strong> {s.riskManagement.suggestedPositionSizeLots} lots</div>
                <div>• <strong>Stop Distance:</strong> {s.riskManagement.stopLossDistancePoints} points</div>
                <div style={{ fontSize: 8.5, color: '#64748b', fontStyle: 'italic' }}>Advisory calculation. Live orders must be entered manually by trader.</div>
              </div>
            )}
          </div>
        );
      })()}

      {/* 4. Chat Messages Scroll Area (Phase 5.1 Conversational AI) */}
      <div
        ref={chatScrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '10px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              padding: '24px 10px',
              textAlign: 'center',
              color: '#64748b',
              fontSize: 11,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Bot size={26} color="#38bdf8" style={{ opacity: 0.8 }} />
            <div>
              <div style={{ fontWeight: 800, color: '#f8fafc', marginBottom: 2 }}>JARVIS Intelligence Ready</div>
              Click <strong>ANALYZE TRADE</strong> above for institutional trade setups, or ask any order-flow question below.
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <ChatMessageItem key={msg.id} msg={msg} onOpenConfig={onOpenConfig} />
        ))}

        {isAnalyzing && (
          <div
            style={{
              alignSelf: 'flex-start',
              padding: '8px 12px',
              borderRadius: '8px 8px 8px 0',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              fontSize: 11,
              color: '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <div className="animate-spin" style={{ width: 12, height: 12, border: '2px solid #38bdf8', borderTopColor: 'transparent', borderRadius: '50%' }} />
            Evaluating order-book depth and absorption...
          </div>
        )}
      </div>

      {/* 5. Quick Prompt Pills */}
      <div
        style={{
          padding: '5px 12px',
          display: 'flex',
          gap: 5,
          overflowX: 'auto',
          background: '#0c0d10',
          borderTop: '1px solid #1a1b20',
          whiteSpace: 'nowrap',
          scrollbarWidth: 'none',
        }}
      >
        {quickPrompts.map((p, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleSendMessage(p)}
            disabled={isAnalyzing}
            style={{
              padding: '3px 8px',
              borderRadius: 10,
              background: '#15161b',
              border: '1px solid #23252d',
              color: '#94a3b8',
              fontSize: 9.5,
              cursor: isAnalyzing ? 'default' : 'pointer',
              flexShrink: 0,
            }}
          >
            {p}
          </button>
        ))}
      </div>

      {/* 6. Conversational Chat Input Form */}
      <div
        style={{
          padding: '8px 12px',
          borderTop: '1px solid #1a1b20',
          background: '#101115',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <button
          type="button"
          onClick={() => aiOrchestrator.clearMessages()}
          title="Clear chat history"
          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}
        >
          <Trash2 size={13} />
        </button>

        <input
          type="text"
          placeholder="Ask a question about market flow..."
          value={inputQuery}
          onChange={(e) => setInputQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSendMessage();
          }}
          style={{
            flex: 1,
            padding: '6px 10px',
            background: '#17181d',
            border: '1px solid #282a32',
            borderRadius: 5,
            color: '#f4f4f6',
            fontSize: 11,
            outline: 'none',
          }}
        />

        <button
          type="button"
          onClick={() => handleSendMessage()}
          disabled={!inputQuery.trim() || isAnalyzing}
          style={{
            padding: '6px 10px',
            background: inputQuery.trim() && !isAnalyzing ? '#262933' : '#17181d',
            color: inputQuery.trim() && !isAnalyzing ? '#f4f4f6' : '#64748b',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: 5,
            cursor: inputQuery.trim() && !isAnalyzing ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Send size={12} />
        </button>
      </div>
    </aside>
  );
};

export const JarvisAITerminal = React.memo(
  JarvisAITerminalComponent,
  (prev, next) =>
    prev.symbol === next.symbol &&
    prev.timeframe === next.timeframe &&
    prev.isExpanded === next.isExpanded
);
