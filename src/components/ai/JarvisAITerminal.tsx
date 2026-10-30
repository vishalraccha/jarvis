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
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  AlertTriangle,
  Compass,
  Copy,
  Layers,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Bot,
} from 'lucide-react';
import { aiOrchestrator } from '../../services/ai/AIOrchestrator';
import { CandleLike } from '../../services/ai/AIToolRegistry';
import { TradeSetup, AIEvidenceSnapshot } from '../../types/ai';

interface JarvisAITerminalProps {
  symbol: string;
  timeframe: string;
  candles: CandleLike[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onOpenConfig: () => void;
}

export const JarvisAITerminal: React.FC<JarvisAITerminalProps> = ({
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
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // Sync state with orchestrator
  useEffect(() => {
    const unsub = aiOrchestrator.subscribe(() => {
      setMessages([...aiOrchestrator.getMessages()]);
      setIsAnalyzing(aiOrchestrator.getIsAnalyzing());
      setActiveSetup(aiOrchestrator.getCurrentSetup());
      setSnapshot(aiOrchestrator.getCurrentSnapshot());
    });
    return unsub;
  }, []);

  // Auto-scroll chat stream to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isAnalyzing]);

  const handleSend = async (queryText?: string) => {
    const text = queryText || inputQuery;
    if (!text.trim() || isAnalyzing) return;
    setInputQuery('');
    await aiOrchestrator.requestMarketAnalysis(symbol, timeframe, candles, text);
  };

  const handleRunFullAnalysis = async () => {
    if (isAnalyzing) return;
    await aiOrchestrator.requestMarketAnalysis(symbol, timeframe, candles);
  };

  const handleCopySetup = () => {
    if (!activeSetup) return;
    const text = `JARVIS AI Trade Setup (${activeSetup.instrument} - ${timeframe})\nDirection: ${activeSetup.direction}\nEntry: ${activeSetup.entryPrice}\nStop Loss: ${activeSetup.stopLoss}\nTP1: ${activeSetup.takeProfit1} | TP2: ${activeSetup.takeProfit2} | TP3: ${activeSetup.takeProfit3}\nRisk/Reward: 1:${activeSetup.rewardToRiskRatio}\nConfidence: ${activeSetup.confidenceScore}%\nInvalidation: ${activeSetup.invalidationCondition}`;
    navigator.clipboard.writeText(text);
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

  const settings = aiOrchestrator.getSettings();
  const providerConfigs = aiOrchestrator.getProviderConfigs();
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
                onClick={onOpenConfig}
                style={{
                  fontSize: 9.5,
                  padding: '1px 5px',
                  borderRadius: 3,
                  background: 'rgba(56, 189, 248, 0.15)',
                  color: '#38bdf8',
                  cursor: 'pointer',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}
                title="Click to configure API keys"
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
            <span style={{ fontSize: 11, fontWeight: 800, color: activeSetup.direction === 'LONG' ? '#0ecb81' : '#f6465d' }}>
              {activeSetup.direction} ({activeSetup.entryType})
            </span>
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
              <span style={{ color: '#fff', fontWeight: 700 }}>{activeSetup.entryPrice}</span>
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
          <div
            key={msg.id}
            style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '92%',
              padding: '8px 11px',
              borderRadius: msg.role === 'user' ? '8px 8px 0px 8px' : '8px 8px 8px 0px',
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
                {msg.content.split('\n').map((line, idx) => {
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
                  const rawBody = isBullet ? trimmed.replace(/^[\*\-•]\s*/, '') : trimmed;
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
