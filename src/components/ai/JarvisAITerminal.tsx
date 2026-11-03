/**
 * JARVIS AI Terminal Side Panel
 * Positioned on the LEFT side of the trading terminal opposite the COB.
 * Features automated market context, live regime/bias status, confidence meter,
 * active trade setup card, conversational history, and quick-prompt pills.
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
} from 'lucide-react';
import { aiOrchestrator } from '../../services/ai/AIOrchestrator';
import { CandleLike } from '../../services/ai/AIToolRegistry';
import { TradeSetup, AIEvidenceSnapshot, AIProvider, AITokenStats } from '../../types/ai';

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
}

export const ChatMessageItem = React.memo(({ msg, onOpenConfig }: { msg: any; onOpenConfig?: (p?: AIProvider) => void }) => {
  return (
    <div
      style={{
        alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
        maxWidth: '92%',
        padding: '8px 12px',
        borderRadius: msg.role === 'user' ? '10px 10px 0 10px' : '10px 10px 10px 0',
        background: msg.role === 'user' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.04)',
        border: msg.role === 'user' ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
        fontSize: 11,
        lineHeight: 1.45,
        color: '#f8fafc',
        wordBreak: 'break-word',
      }}
    >
      {msg.role === 'assistant' && (
        <div style={{ fontSize: 9, color: '#38bdf8', fontWeight: 700, marginBottom: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Sparkles size={10} />
          {msg.provider?.toUpperCase() || 'JARVIS AI'} ({msg.model || 'Engine'})
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

          {/* Assistant Token Usage & Remaining Balance Footer */}
          {(msg.tokensUsed !== undefined || msg.remainingTokens !== undefined) && (
            <div
              style={{
                marginTop: 8,
                paddingTop: 6,
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 9.5,
                color: '#94a3b8',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: '#38bdf8' }}>⚡</span>
                <span>
                  {msg.tokensUsed !== undefined ? `${msg.tokensUsed.toLocaleString()} tokens` : 'Tokens'} •{' '}
                  <strong style={{ color: '#38bdf8', fontFamily: '"JetBrains Mono", monospace' }}>
                    {formatTokenCount(msg.remainingTokens)}
                  </strong>
                  {msg.totalTokens ? ` / ${formatTokenCount(msg.totalTokens)} left` : ' remaining'}
                </span>
              </div>
              {onOpenConfig && (
                <button
                  type="button"
                  onClick={() => onOpenConfig(msg.provider)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#38bdf8',
                    fontSize: 9,
                    cursor: 'pointer',
                    padding: '1px 4px',
                    textDecoration: 'underline',
                  }}
                  title="Change API key or quota before tokens exhaust"
                >
                  Change API
                </button>
              )}
            </div>
          )}
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
  isExpanded,
  onToggleExpand,
  onOpenConfig,
}) => {
  const [messages, setMessages] = useState(aiOrchestrator.getMessages());
  const [isAnalyzing, setIsAnalyzing] = useState(aiOrchestrator.getIsAnalyzing());
  const [activeSetup, setActiveSetup] = useState<TradeSetup | null>(aiOrchestrator.getCurrentSetup());
  const [snapshot, setSnapshot] = useState<AIEvidenceSnapshot | null>(aiOrchestrator.getCurrentSnapshot());
  const [inputQuery, setInputQuery] = useState('');
  const [copiedSetup, setCopiedSetup] = useState(false);
  const [providerConfigs, setProviderConfigs] = useState(aiOrchestrator.getProviderConfigs());
  const [settings, setSettings] = useState(aiOrchestrator.getSettings());
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // Store candles in ref so streaming market ticks do NOT trigger chat re-renders
  const candlesRef = useRef(candles);
  useEffect(() => {
    candlesRef.current = candles;
  }, [candles]);

  // Sync state with orchestrator
  useEffect(() => {
    const unsub = aiOrchestrator.subscribe(() => {
      setMessages([...aiOrchestrator.getMessages()]);
      setIsAnalyzing(aiOrchestrator.getIsAnalyzing());
      setActiveSetup(aiOrchestrator.getCurrentSetup());
      setSnapshot(aiOrchestrator.getCurrentSnapshot());
      setProviderConfigs({ ...aiOrchestrator.getProviderConfigs() });
      setSettings({ ...aiOrchestrator.getSettings() });
    });
    return unsub;
  }, []);

  // Auto-scroll chat stream to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isAnalyzing]);

  const ensureActiveCandles = async (): Promise<CandleLike[]> => {
    let current = candlesRef.current;
    if (!current || current.length === 0) {
      try {
        const res = await fetch(`/api/candles?symbol=${symbol}&timeframe=${timeframe}&limit=100`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            current = data;
            candlesRef.current = data;
          }
        }
      } catch {}
    }
    return current || [];
  };

  const handleSend = async (queryText?: string) => {
    const text = queryText || inputQuery;
    if (!text.trim() || isAnalyzing) return;
    setInputQuery('');
    const activeCandles = await ensureActiveCandles();
    await aiOrchestrator.requestMarketAnalysis(symbol, timeframe, activeCandles, text);
  };

  const handleRunFullAnalysis = async () => {
    if (isAnalyzing) return;
    const activeCandles = await ensureActiveCandles();
    await aiOrchestrator.requestMarketAnalysis(symbol, timeframe, activeCandles, undefined, true);
  };

  const handleCopySetup = () => {
    if (!activeSetup) return;
    const text = `JARVIS AI Trade Setup (${activeSetup.instrument} - ${timeframe})\nDirection: ${activeSetup.direction}\nEntry: ${activeSetup.entryPrice}\nStop Loss: ${activeSetup.stopLoss}\nTP1: ${activeSetup.takeProfit1} | TP2: ${activeSetup.takeProfit2} | TP3: ${activeSetup.takeProfit3}\nRisk/Reward: 1:${activeSetup.rewardToRiskRatio}\nConfidence: ${activeSetup.confidenceScore}%\nInvalidation: ${activeSetup.invalidationCondition}`;
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedSetup(true);
    setTimeout(() => setCopiedSetup(false), 2000);
  };

  const quickPrompts = [
    'Analyze current market',
    'Where are buyers absorbing?',
    'Where are sellers absorbing?',
    'What is the strongest liquidity zone?',
    'Is there an opportunity to enter long?',
    'Is this a sweep or genuine breakout?',
    'Explain the footprint delta',
  ];

  const primaryConfig = providerConfigs[settings.primaryProvider];

  // Collapsed Sidebar View
  if (!isExpanded) {
    return (
      <div
        style={{
          width: 38,
          background: 'rgba(10, 15, 29, 0.96)',
          borderRight: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '10px 0',
          gap: 12,
          zIndex: 8,
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={onToggleExpand}
          title="Expand JARVIS AI Terminal"
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            background: 'rgba(56, 189, 248, 0.15)',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            color: '#38bdf8',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Sparkles size={14} />
        </button>

        <button
          type="button"
          onClick={onToggleExpand}
          style={{
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            padding: 4,
          }}
        >
          <ChevronRight size={16} />
        </button>

        {/* Vertical Text Label */}
        <div
          onClick={onToggleExpand}
          style={{
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            fontSize: 10.5,
            fontWeight: 800,
            letterSpacing: '0.12em',
            color: '#94a3b8',
            cursor: 'pointer',
            marginTop: 8,
          }}
        >
          JARVIS AI
        </div>

        {/* Live Bias Dot Indicator */}
        <div
          title={`Market Bias: ${snapshot?.bias || 'NEUTRAL'}`}
          style={{
            marginTop: 'auto',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: snapshot?.bias === 'BULLISH' ? '#0ecb81' : snapshot?.bias === 'BEARISH' ? '#f6465d' : '#facc15',
            boxShadow: '0 0 6px rgba(56, 189, 248, 0.5)',
          }}
        />
      </div>
    );
  }

  // Expanded AI Terminal Panel View
  return (
    <aside
      className="jarvis-ai-terminal-panel"
      style={{
        width: 360,
        minWidth: 320,
        maxWidth: 420,
        background: 'rgba(10, 15, 29, 0.98)',
        borderRight: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        zIndex: 8,
        flexShrink: 0,
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {/* 1. Header with Model Info & Collapse */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(0, 0, 0, 0.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 4,
              background: 'linear-gradient(135deg, #00b4d8 0%, #0077b6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 800,
              fontSize: 12,
            }}
          >
            J
          </div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: '#f8fafc', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 6 }}>
              JARVIS AI
              <span
                onClick={() => onOpenConfig()}
                style={{
                  fontSize: 9,
                  padding: '1px 5px',
                  borderRadius: 3,
                  background: 'rgba(56, 189, 248, 0.15)',
                  color: '#38bdf8',
                  cursor: 'pointer',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  maxWidth: 130,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  display: 'inline-block',
                  verticalAlign: 'middle',
                }}
                title={`Active Model: ${primaryConfig?.model || settings.primaryProvider}. Click to configure.`}
              >
                {primaryConfig?.model || settings.primaryProvider}
              </span>
            </div>
            <div style={{ fontSize: 9.5, color: '#64748b' }}>
              {symbol} • {timeframe} • Live Order Flow
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            onClick={handleRunFullAnalysis}
            disabled={isAnalyzing}
            title="Re-analyze current market state"
            style={{
              background: 'none',
              border: 'none',
              color: isAnalyzing ? '#64748b' : '#38bdf8',
              cursor: isAnalyzing ? 'default' : 'pointer',
              padding: 4,
            }}
          >
            <RefreshCw size={13} className={isAnalyzing ? 'animate-spin' : ''} />
          </button>

          <button
            type="button"
            onClick={onToggleExpand}
            title="Collapse AI Panel"
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: 4,
            }}
          >
            <ChevronLeft size={16} />
          </button>
        </div>
      </div>

      {/* AI Token Balance & Quota Bar (Remaining vs Total) */}
      <div
        style={{
          padding: '8px 12px',
          background: 'rgba(15, 23, 42, 0.75)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Tokens Remaining
          </span>
          <button
            type="button"
            onClick={() => onOpenConfig()}
            style={{
              background: 'none',
              border: 'none',
              color: '#38bdf8',
              fontSize: 9.5,
              fontWeight: 600,
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
          >
            API Limits & Plan →
          </button>
        </div>

        {/* 3 Provider Token Cards in Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          {(['gemini', 'grok', 'openai'] as AIProvider[]).map((prov) => {
            const conf = providerConfigs[prov];
            const defQuota = prov === 'gemini' ? 1000000 : prov === 'openai' ? 200000 : 100000;
            const tokens: AITokenStats = conf?.tokens || {
              usedTokens: 0,
              totalTokens: defQuota,
              remainingTokens: defQuota,
              promptTokens: 0,
              completionTokens: 0,
              lastCallTokens: 0,
              percentRemaining: 100,
              lastUpdated: Date.now(),
            };
            const isConnected = Boolean(conf?.hasKey && conf?.status !== 'disconnected');
            const isExhausted = isConnected && (conf?.status === 'exhausted' || conf?.status === 'quota_exceeded' || tokens.remainingTokens <= 0);
            const isLow = isConnected && tokens.percentRemaining < 20 && !isExhausted;
            const isPrimary = settings.primaryProvider === prov && isConnected;

            // Bar color
            const barColor = !isConnected
              ? '#334155'
              : isExhausted
              ? '#ef4444'
              : isLow
              ? '#f59e0b'
              : tokens.percentRemaining < 40
              ? '#facc15'
              : '#0ecb81';

            const provLabel = prov === 'gemini' ? 'Gemini' : prov === 'grok' ? 'Groq/xAI' : 'OpenAI';

            return (
              <div
                key={prov}
                onClick={() => onOpenConfig(prov)}
                title={
                  !isConnected
                    ? `${provLabel}: Not connected. Click to add API key.`
                    : `${provLabel}: ${tokens.remainingTokens.toLocaleString()} remaining / ${tokens.totalTokens.toLocaleString()} total tokens (${tokens.usedTokens.toLocaleString()} used). Click to configure.`
                }
                style={{
                  background: isExhausted
                    ? 'rgba(239, 68, 68, 0.08)'
                    : isPrimary
                    ? 'rgba(56, 189, 248, 0.08)'
                    : 'rgba(255, 255, 255, 0.03)',
                  border: isExhausted
                    ? '1px solid rgba(239, 68, 68, 0.35)'
                    : isPrimary
                    ? '1px solid rgba(56, 189, 248, 0.35)'
                    : '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: 5,
                  padding: '6px 7px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                  transition: 'background 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: isPrimary ? '#38bdf8' : isConnected ? '#e2e8f0' : '#94a3b8' }}>
                    {provLabel}
                  </span>
                  <span
                    style={{
                      fontSize: 8.5,
                      fontWeight: 700,
                      color: !isConnected ? '#64748b' : isExhausted ? '#ef4444' : isLow ? '#f59e0b' : '#64748b',
                    }}
                  >
                    {!isConnected ? 'OFF' : isExhausted ? '0%' : `${tokens.percentRemaining}%`}
                  </span>
                </div>

                {/* Remaining / Total token count */}
                <div style={{ fontSize: 10, fontWeight: 700, color: isConnected ? '#f8fafc' : '#64748b', fontFamily: '"JetBrains Mono", monospace' }}>
                  {!isConnected ? (
                    <span style={{ fontSize: 9, color: '#64748b', fontWeight: 500 }}>Not Configured</span>
                  ) : (
                    <>
                      {formatTokenCount(tokens.remainingTokens)}
                      <span style={{ fontSize: 8.5, color: '#64748b', fontWeight: 500 }}>
                        /{formatTokenCount(tokens.totalTokens)}
                      </span>
                    </>
                  )}
                </div>

                {/* Progress bar */}
                <div style={{ width: '100%', height: 3, background: 'rgba(255, 255, 255, 0.08)', borderRadius: 2, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: isConnected ? `${Math.max(0, Math.min(100, tokens.percentRemaining))}%` : '0%',
                      height: '100%',
                      background: barColor,
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Low Quota or Exhaustion Alert Banner */}
        {(() => {
          const criticalProvider = (['gemini', 'grok', 'openai'] as AIProvider[]).find((p) => {
            const conf = providerConfigs[p];
            if (!conf?.hasKey || conf?.status === 'disconnected') return false;
            return conf.status === 'exhausted' || conf.status === 'quota_exceeded' || (conf.tokens && conf.tokens.percentRemaining < 20);
          });

          if (!criticalProvider) return null;
          const conf = providerConfigs[criticalProvider];
          const tokens = conf?.tokens;
          const isExhausted = conf?.status === 'exhausted' || conf?.status === 'quota_exceeded' || (tokens && tokens.remainingTokens <= 0);
          const pName = criticalProvider === 'gemini' ? 'Gemini' : criticalProvider === 'grok' ? 'Groq/xAI' : 'OpenAI';

          return (
            <div
              style={{
                marginTop: 2,
                padding: '6px 8px',
                borderRadius: 4,
                background: isExhausted ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                border: `1px solid ${isExhausted ? 'rgba(239, 68, 68, 0.4)' : 'rgba(245, 158, 11, 0.4)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 6,
              }}
            >
              <div style={{ fontSize: 9.5, color: isExhausted ? '#fca5a5' : '#fde68a', lineHeight: 1.3 }}>
                ⚠️ <strong>{pName}</strong> {isExhausted ? 'exhausted!' : `low: ${tokens?.percentRemaining}% left (${formatTokenCount(tokens?.remainingTokens)} / ${formatTokenCount(tokens?.totalTokens)})`}.
              </div>
              <button
                type="button"
                onClick={() => onOpenConfig(criticalProvider)}
                style={{
                  background: isExhausted ? '#ef4444' : '#f59e0b',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 3,
                  padding: '3px 7px',
                  fontSize: 9,
                  fontWeight: 700,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                Change API
              </button>
            </div>
          );
        })()}
      </div>

      {/* 2. Live Market Condition & Bias Banner */}
      <div
        style={{
          padding: '10px 14px',
          background: 'rgba(15, 23, 42, 0.65)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 600 }}>Market Condition:</span>
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 800,
              padding: '2px 7px',
              borderRadius: 4,
              textTransform: 'uppercase',
              background:
                snapshot?.bias === 'BULLISH'
                  ? 'rgba(14, 203, 129, 0.15)'
                  : snapshot?.bias === 'BEARISH'
                  ? 'rgba(246, 70, 93, 0.15)'
                  : 'rgba(250, 204, 21, 0.15)',
              color:
                snapshot?.bias === 'BULLISH'
                  ? '#0ecb81'
                  : snapshot?.bias === 'BEARISH'
                  ? '#f6465d'
                  : '#facc15',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {snapshot?.bias === 'BULLISH' ? <ArrowUpRight size={12} /> : snapshot?.bias === 'BEARISH' ? <ArrowDownRight size={12} /> : <Minus size={12} />}
            {snapshot?.bias || 'NEUTRAL'} ({snapshot?.regime.replace(/_/g, ' ') || 'ANALYZING'})
          </span>
        </div>

        {/* Confidence Meter */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
            <span style={{ color: '#64748b' }}>Order Flow Confidence</span>
            <span style={{ color: '#38bdf8', fontWeight: 700 }}>{activeSetup?.confidenceScore || 50}%</span>
          </div>
          <div style={{ width: '100%', height: 4, background: 'rgba(255, 255, 255, 0.08)', borderRadius: 2, overflow: 'hidden' }}>
            <div
              style={{
                width: `${activeSetup?.confidenceScore || 50}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #38bdf8, #0ecb81)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      </div>

      {/* 3. Active Trade Setup Card */}
      {activeSetup && activeSetup.direction !== 'NO_TRADE' && (
        <div
          style={{
            margin: '10px 14px',
            padding: 10,
            borderRadius: 6,
            background:
              activeSetup.direction === 'LONG'
                ? 'rgba(14, 203, 129, 0.06)'
                : 'rgba(246, 70, 93, 0.06)',
            border: `1px solid ${
              activeSetup.direction === 'LONG'
                ? 'rgba(14, 203, 129, 0.25)'
                : 'rgba(246, 70, 93, 0.25)'
            }`,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: activeSetup.direction === 'LONG' ? '#0ecb81' : '#f6465d' }}>
                {activeSetup.direction} ({activeSetup.entryType})
              </span>
              <span
                style={{
                  fontSize: 8,
                  fontWeight: 800,
                  padding: '1px 5px',
                  borderRadius: 3,
                  background: 'rgba(56, 189, 248, 0.15)',
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  letterSpacing: '0.04em',
                }}
              >
                {activeSetup.status === 'READY_NOW' ? '⚡ IMMINENT (READY NOW)' : '⏳ WAITING CONFIRMATION'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 9.5, color: '#94a3b8' }}>R:R 1:{activeSetup.rewardToRiskRatio}</span>
              <button
                type="button"
                onClick={handleCopySetup}
                title="Copy trade plan"
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 2 }}
              >
                <Copy size={12} style={{ color: copiedSetup ? '#0ecb81' : '#94a3b8' }} />
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 10.5 }}>
            <div>
              <span style={{ color: '#64748b' }}>Entry: </span>
              <span style={{ color: '#fff', fontWeight: 700 }}>
                {activeSetup.entryPrice}
                <span style={{ fontSize: 8.5, color: '#0ecb81', marginLeft: 4 }}>
                  {activeSetup.entryType === 'MARKET' ? '[LIVE]' : '[LIMIT]'}
                </span>
              </span>
            </div>
            <div>
              <span style={{ color: '#64748b' }}>Stop: </span>
              <span style={{ color: '#f87171', fontWeight: 700 }}>{activeSetup.stopLoss}</span>
            </div>
            <div>
              <span style={{ color: '#64748b' }}>TP1: </span>
              <span style={{ color: '#38bdf8', fontWeight: 700 }}>{activeSetup.takeProfit1}</span>
            </div>
            <div>
              <span style={{ color: '#64748b' }}>TP2: </span>
              <span style={{ color: '#38bdf8', fontWeight: 700 }}>{activeSetup.takeProfit2}</span>
            </div>
          </div>

          <div style={{ fontSize: 9.5, color: '#94a3b8', lineHeight: 1.3, marginTop: 2 }}>
            <span style={{ color: '#64748b' }}>Order Book: </span>
            {activeSetup.orderBookEvidence}
          </div>
        </div>
      )}

      {/* 4. Chat Messages Scroll Area */}
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
              padding: '20px 10px',
              textAlign: 'center',
              color: '#64748b',
              fontSize: 11,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Bot size={28} style={{ color: '#38bdf8', opacity: 0.8 }} />
            <div>
              <div style={{ fontWeight: 700, color: '#f8fafc', marginBottom: 2 }}>JARVIS Intelligence Active</div>
              Analyzing live order-book depth, resting walls, and absorption. Ask any question or click a quick prompt below.
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
            Analyzing order-book depth and absorption...
          </div>
        )}
      </div>

      {/* 5. Quick Prompt Pills */}
      <div
        style={{
          padding: '6px 14px',
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          background: 'rgba(0, 0, 0, 0.2)',
          borderTop: '1px solid rgba(255, 255, 255, 0.04)',
          whiteSpace: 'nowrap',
          scrollbarWidth: 'none',
        }}
      >
        {quickPrompts.map((p, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleSend(p)}
            disabled={isAnalyzing}
            style={{
              padding: '3px 8px',
              borderRadius: 12,
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#94a3b8',
              fontSize: 10,
              cursor: isAnalyzing ? 'default' : 'pointer',
              flexShrink: 0,
            }}
          >
            {p}
          </button>
        ))}
      </div>

      {/* 6. Chat Input Form */}
      <div
        style={{
          padding: '10px 14px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(10, 15, 29, 0.98)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={() => aiOrchestrator.clearMessages()}
          title="Clear chat history"
          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}
        >
          <Trash2 size={14} />
        </button>

        <input
          type="text"
          placeholder="Ask JARVIS AI about order flow..."
          value={inputQuery}
          onChange={(e) => setInputQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSend();
          }}
          style={{
            flex: 1,
            padding: '7px 10px',
            background: 'rgba(15, 23, 42, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: 5,
            color: '#fff',
            fontSize: 11.5,
            outline: 'none',
          }}
        />

        <button
          type="button"
          onClick={() => handleSend()}
          disabled={!inputQuery.trim() || isAnalyzing}
          style={{
            padding: '7px 10px',
            background: inputQuery.trim() && !isAnalyzing ? '#38bdf8' : 'rgba(255, 255, 255, 0.05)',
            color: inputQuery.trim() && !isAnalyzing ? '#0f172a' : '#64748b',
            border: 'none',
            borderRadius: 5,
            cursor: inputQuery.trim() && !isAnalyzing ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Send size={13} />
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
