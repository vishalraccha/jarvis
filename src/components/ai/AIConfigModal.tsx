/**
 * JARVIS Multi-AI API Configuration Modal
 * Opens when user clicks the JARVIS logo in the top-left corner.
 * Supports OpenAI, Google Gemini, and xAI Grok with live testing,
 * model selection, key masking, and consensus/comparison orchestration.
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Zap,
  Sliders,
  Shield,
  RotateCcw,
} from 'lucide-react';
import { AIProvider, PROVIDER_SUPPORTED_MODELS, AIMode, AITokenStats } from '../../types/ai';
import { aiOrchestrator } from '../../services/ai/AIOrchestrator';
import { formatTokenCount } from './JarvisAITerminal';

interface AIConfigModalProps {
  isOpen: boolean;
  initialProvider?: AIProvider;
  onClose: () => void;
}

const PROVIDER_TIERS_CLIENT: Record<AIProvider, Array<{ id: string; label: string; limit: number; desc: string }>> = {
  gemini: [
    { id: 'free', label: 'Free Tier (1M TPM / 1,500 RPD)', limit: 1_000_000, desc: 'Google AI Studio Free Tier' },
    { id: 'tier1', label: 'Pay-As-You-Go (4M TPM)', limit: 4_000_000, desc: 'Cloud Billing Enabled' },
  ],
  openai: [
    { id: 'tier1', label: 'Tier 1 Pay-As-You-Go (200K TPM)', limit: 200_000, desc: 'GPT-4o-mini 200K TPM / GPT-4o 30K TPM' },
    { id: 'tier2', label: 'Tier 2 Pro (2M TPM)', limit: 2_000_000, desc: 'Enterprise / High Concurrency Tier' },
    { id: 'free', label: 'Free Developer (30K TPM / 200 RPD)', limit: 30_000, desc: 'Usage Tier 0' },
  ],
  grok: [
    { id: 'groq_free', label: 'Groq Free Tier (100K Daily / 30K TPM)', limit: 100_000, desc: 'Llama 3.3 70B & 3.1 8B Free Tier' },
    { id: 'groq_dev', label: 'Groq Developer (1M Daily)', limit: 1_000_000, desc: 'Developer Tier Paid' },
    { id: 'xai_standard', label: 'xAI Grok Standard (2M TPM)', limit: 2_000_000, desc: 'Grok-2 / Grok-beta Tier' },
  ],
};

export const AIConfigModal: React.FC<AIConfigModalProps> = ({ isOpen, initialProvider, onClose }) => {
  const [activeTab, setActiveTab] = useState<AIProvider | 'orchestration'>(initialProvider || 'gemini');
  const [configs, setConfigs] = useState(aiOrchestrator.getProviderConfigs());
  const [settings, setSettings] = useState(aiOrchestrator.getSettings());
  const [inputKeys, setInputKeys] = useState<Record<AIProvider, string>>({
    gemini: '',
    openai: '',
    grok: '',
  });
  const [showKeys, setShowKeys] = useState<Record<AIProvider, boolean>>({
    gemini: false,
    openai: false,
    grok: false,
  });
  const [isUpdatingTokens, setIsUpdatingTokens] = useState<Record<AIProvider, boolean>>({
    gemini: false,
    openai: false,
    grok: false,
  });
  const [testResults, setTestResults] = useState<Record<AIProvider, { testing: boolean; result?: string; success?: boolean; latency?: number }>>({
    gemini: { testing: false },
    openai: { testing: false },
    grok: { testing: false },
  });

  useEffect(() => {
    if (initialProvider) {
      setActiveTab(initialProvider);
    }
  }, [initialProvider]);

  useEffect(() => {
    if (isOpen) {
      aiOrchestrator.refreshProviderStatuses().then(() => {
        setConfigs({ ...aiOrchestrator.getProviderConfigs() });
        setSettings({ ...aiOrchestrator.getSettings() });
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectTier = async (provider: AIProvider, tierId: string) => {
    setIsUpdatingTokens((prev) => ({ ...prev, [provider]: true }));
    await aiOrchestrator.setAccountTier(provider, tierId);
    setConfigs({ ...aiOrchestrator.getProviderConfigs() });
    setIsUpdatingTokens((prev) => ({ ...prev, [provider]: false }));
  };

  const handleSaveKey = async (provider: AIProvider) => {
    const rawKey = inputKeys[provider];
    if (!rawKey.trim()) return;

    const res = await aiOrchestrator.saveKey(provider, rawKey, configs[provider].model);
    if (res.success) {
      setInputKeys((prev) => ({ ...prev, [provider]: '' }));
      setConfigs({ ...aiOrchestrator.getProviderConfigs() });
      setTestResults((prev) => ({
        ...prev,
        [provider]: { testing: false, success: true, result: 'Key securely saved to encrypted vault' },
      }));
    } else {
      setTestResults((prev) => ({
        ...prev,
        [provider]: { testing: false, success: false, result: res.message || 'Failed to save key' },
      }));
    }
  };

  const handleTestConnection = async (provider: AIProvider) => {
    setTestResults((prev) => ({ ...prev, [provider]: { testing: true } }));
    const res = await aiOrchestrator.testProvider(provider, configs[provider].model);
    setConfigs({ ...aiOrchestrator.getProviderConfigs() });
    setTestResults((prev) => ({
      ...prev,
      [provider]: {
        testing: false,
        success: res.success,
        result: res.message,
        latency: res.latencyMs,
      },
    }));
  };

  const handleRemoveKey = async (provider: AIProvider) => {
    try {
      await fetch(`/api/ai/key/${provider}`, { method: 'DELETE' });
      await aiOrchestrator.refreshProviderStatuses();
      setConfigs({ ...aiOrchestrator.getProviderConfigs() });
      setTestResults((prev) => ({
        ...prev,
        [provider]: { testing: false, result: 'Key removed' },
      }));
    } catch {}
  };

  const renderProviderTab = (provider: AIProvider) => {
    const conf = configs[provider];
    const models = PROVIDER_SUPPORTED_MODELS[provider];
    const test = testResults[provider];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Enable Toggle & Status Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: 6,
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
            <input
              type="checkbox"
              checked={conf.enabled}
              onChange={(e) => {
                const updated = { ...conf, enabled: e.target.checked };
                setConfigs((prev) => ({ ...prev, [provider]: updated }));
              }}
              style={{ accentColor: '#38bdf8', width: 15, height: 15 }}
            />
            Enable {provider === 'gemini' ? 'Google Gemini' : provider === 'openai' ? 'OpenAI ChatGPT' : 'Grok / Groq'}
          </label>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: conf.status === 'connected' ? '#0ecb81' : conf.hasKey ? '#facc15' : '#64748b',
                boxShadow: conf.status === 'connected' ? '0 0 8px rgba(14, 203, 129, 0.5)' : 'none',
              }}
            />
            <span
              style={{
                color: conf.status === 'connected' ? '#0ecb81' : conf.hasKey ? '#facc15' : '#94a3b8',
                textTransform: 'uppercase',
              }}
            >
              {conf.status === 'connected' ? 'CONNECTED' : conf.hasKey ? 'CONFIGURED' : 'DISCONNECTED'}
            </span>
          </div>
        </div>

        {/* Token Quota & Remaining Balance Card */}
        {(() => {
          const tokens: AITokenStats = conf.tokens || {
            usedTokens: 0,
            totalTokens: provider === 'gemini' ? 1000000 : 500000,
            remainingTokens: provider === 'gemini' ? 1000000 : 500000,
            promptTokens: 0,
            completionTokens: 0,
            lastCallTokens: 0,
            percentRemaining: 100,
            lastUpdated: Date.now(),
          };
          const isConnected = Boolean(conf.hasKey && conf.status !== 'disconnected');
          const isExhausted = isConnected && (conf.status === 'exhausted' || conf.status === 'quota_exceeded' || tokens.remainingTokens <= 0);
          const isLow = isConnected && tokens.percentRemaining < 20 && !isExhausted;
          const barColor = !isConnected
            ? '#64748b'
            : isExhausted
            ? '#ef4444'
            : isLow
            ? '#f59e0b'
            : tokens.percentRemaining < 40
            ? '#facc15'
            : '#0ecb81';

          return (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 6,
                background: isExhausted
                  ? 'rgba(239, 68, 68, 0.08)'
                  : 'rgba(255, 255, 255, 0.03)',
                border: isExhausted
                  ? '1px solid rgba(239, 68, 68, 0.35)'
                  : isLow
                  ? '1px solid rgba(245, 158, 11, 0.35)'
                  : '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {/* Header with Title and Auto-Reset Countdown */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Zap size={14} style={{ color: barColor }} />
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: '#f8fafc', letterSpacing: '0.02em' }}>
                    RATE LIMIT & TOKEN BALANCE
                  </span>
                </div>
                <div
                  title="Tokens reset automatically according to provider limits (daily at 00:00 UTC and 1-minute rolling rate limit windows)"
                  style={{
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.10)',
                    borderRadius: 4,
                    color: '#94a3b8',
                    padding: '2px 8px',
                    fontSize: 9.5,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <RotateCcw size={10} style={{ color: '#38bdf8' }} />
                  <span>Resets: {tokens.resetTimeFormatted || '00:00 UTC'}</span>
                </div>
              </div>

              {/* Large Remaining Balance Counter */}
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: 20, fontWeight: 800, color: '#f8fafc', fontFamily: '"JetBrains Mono", monospace' }}>
                    {tokens.remainingTokens.toLocaleString()}
                  </span>
                  <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 6 }}>
                    remaining of <strong style={{ color: '#cbd5e1' }}>{tokens.totalTokens.toLocaleString()}</strong> ({tokens.rateLimitType === 'tpd' ? 'Daily Quota' : 'TPM Limit'})
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    fontWeight: 800,
                    color: barColor,
                    fontFamily: '"JetBrains Mono", monospace',
                    background: 'rgba(255, 255, 255, 0.04)',
                    padding: '2px 8px',
                    borderRadius: 4,
                  }}
                >
                  {!isConnected ? 'NOT CONNECTED' : isExhausted ? '0% AVAILABLE' : `${tokens.percentRemaining}% AVAILABLE`}
                </div>
              </div>

              {/* Progress Bar */}
              <div style={{ width: '100%', height: 6, background: 'rgba(255, 255, 255, 0.08)', borderRadius: 3, overflow: 'hidden' }}>
                <div
                  style={{
                    width: isConnected ? `${Math.max(0, Math.min(100, tokens.percentRemaining))}%` : '0%',
                    height: '100%',
                    background: barColor,
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>

              {/* Breakdown Stats Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, background: 'rgba(0, 0, 0, 0.25)', padding: '6px 10px', borderRadius: 4 }}>
                <div>
                  <div style={{ fontSize: 9.5, color: '#64748b' }}>Used Today</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#f8fafc', fontFamily: '"JetBrains Mono", monospace' }}>
                    {tokens.usedTokens.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9.5, color: '#64748b' }}>Last Request</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', fontFamily: '"JetBrains Mono", monospace' }}>
                    {tokens.lastCallTokens ? `${tokens.lastCallTokens.toLocaleString()}` : '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9.5, color: '#64748b' }}>Account Plan Tier</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0', fontFamily: '"JetBrains Mono", monospace' }}>
                    {tokens.tierName || 'Standard'}
                  </div>
                </div>
              </div>

              {/* True Provider Account Tier Presets */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>
                    Select True Provider Account Tier:
                  </span>
                  <span style={{ fontSize: 9, color: '#64748b' }}>
                    Auto-synced with API response headers
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                  {(PROVIDER_TIERS_CLIENT[provider] || []).map((t) => {
                    const isSelected = tokens.totalTokens === t.limit || tokens.tierId === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleSelectTier(provider, t.id)}
                        disabled={isUpdatingTokens[provider]}
                        title={t.desc}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 4,
                          background: isSelected ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                          border: isSelected ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                          color: isSelected ? '#38bdf8' : '#94a3b8',
                          fontSize: 10,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: '50%',
                            background: isSelected ? '#38bdf8' : '#64748b',
                          }}
                        />
                        <span>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Warning Alert if Exhausted or Low */}
              {isExhausted && (
                <div
                  style={{
                    padding: '8px 10px',
                    borderRadius: 4,
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    color: '#fca5a5',
                    fontSize: 10.5,
                    lineHeight: 1.4,
                  }}
                >
                  🚨 <strong>Token Quota Exhausted:</strong> All {tokens.totalTokens.toLocaleString()} tokens have been used. Rotate your API key below or increase your quota to continue real-time market analysis.
                </div>
              )}
              {isLow && (
                <div
                  style={{
                    padding: '8px 10px',
                    borderRadius: 4,
                    background: 'rgba(245, 158, 11, 0.15)',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    color: '#fde68a',
                    fontSize: 10.5,
                    lineHeight: 1.4,
                  }}
                >
                  ⚠️ <strong>Token Quota Running Low:</strong> Only {tokens.percentRemaining}% ({tokens.remainingTokens.toLocaleString()} tokens) remain. Rotate your API key or deposit platform credits to avoid interruption.
                </div>
              )}
            </div>
          );
        })()}

        {/* Model Selection Dropdown */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Selected Model Architecture</label>
          <select
            value={conf.model}
            onChange={(e) => {
              const updated = { ...conf, model: e.target.value };
              setConfigs((prev) => ({ ...prev, [provider]: updated }));
            }}
            style={{
              padding: '8px 10px',
              background: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 5,
              color: '#f8fafc',
              fontSize: 12,
              fontWeight: 600,
              outline: 'none',
            }}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.tier.toUpperCase()}) — {m.description}
              </option>
            ))}
          </select>
        </div>

        {/* API Key Input Field */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Provider API Key</label>
            {conf.maskedKey && (
              <span style={{ fontSize: 10, color: '#38bdf8', fontWeight: 600 }}>Active Key: {conf.maskedKey}</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type={showKeys[provider] ? 'text' : 'password'}
                placeholder={conf.hasKey ? 'Enter new key to rotate...' : provider === 'grok' ? 'gsk_... or xai-...' : 'sk-... or AIza...'}
                value={inputKeys[provider]}
                onChange={(e) => {
                  const val = e.target.value;
                  setInputKeys((prev) => ({ ...prev, [provider]: val }));
                  if (provider === 'grok' && val.trim().startsWith('gsk_')) {
                    setConfigs((prev) => ({
                      ...prev,
                      grok: { ...prev.grok, model: 'qwen/qwen3.8-27b' },
                    }));
                  }
                  if (provider === 'openai' && (conf.model.includes('turbo') || conf.model.includes('3.5'))) {
                    setConfigs((prev) => ({
                      ...prev,
                      openai: { ...prev.openai, model: 'gpt-4o-mini' },
                    }));
                  }
                }}
                style={{
                  width: '100%',
                  padding: '8px 34px 8px 10px',
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: 5,
                  color: '#fff',
                  fontSize: 11.5,
                  boxSizing: 'border-box',
                }}
              />
              <button
                type="button"
                onClick={() => setShowKeys((prev) => ({ ...prev, [provider]: !prev[provider] }))}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: 2,
                }}
              >
                {showKeys[provider] ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <button
              type="button"
              onClick={() => handleSaveKey(provider)}
              disabled={!inputKeys[provider].trim()}
              style={{
                padding: '0 12px',
                background: inputKeys[provider].trim() ? '#38bdf8' : 'rgba(255, 255, 255, 0.05)',
                color: inputKeys[provider].trim() ? '#0f172a' : '#64748b',
                border: 'none',
                borderRadius: 5,
                fontSize: 11.5,
                fontWeight: 700,
                cursor: inputKeys[provider].trim() ? 'pointer' : 'default',
              }}
            >
              Save Key
            </button>
          </div>

          {/* Contextual guidance for OpenAI billing / Grok vs Groq */}
          {provider === 'openai' && (
            <div
              style={{
                marginTop: 2,
                padding: '8px 10px',
                background: 'rgba(56, 189, 248, 0.06)',
                border: '1px solid rgba(56, 189, 248, 0.2)',
                borderRadius: 5,
                fontSize: 10.5,
                color: '#cbd5e1',
                lineHeight: 1.45,
              }}
            >
              <span style={{ color: '#38bdf8', fontWeight: 700 }}>OpenAI API Requirement:</span> Developer API keys require prepaid API credits deposited at{' '}
              <a
                href="https://platform.openai.com/settings/organization/billing"
                target="_blank"
                rel="noreferrer"
                style={{ color: '#38bdf8', textDecoration: 'underline', fontWeight: 600 }}
              >
                platform.openai.com/settings/organization/billing
              </a>
              . <span style={{ opacity: 0.85 }}>(Note: A consumer ChatGPT Plus subscription does not include OpenAI API platform credits).</span>
            </div>
          )}

          {provider === 'grok' && (
            <div
              style={{
                marginTop: 2,
                padding: '8px 10px',
                background: 'rgba(14, 203, 129, 0.06)',
                border: '1px solid rgba(14, 203, 129, 0.2)',
                borderRadius: 5,
                fontSize: 10.5,
                color: '#cbd5e1',
                lineHeight: 1.45,
              }}
            >
              <span style={{ color: '#0ecb81', fontWeight: 700 }}>Groq & xAI Dual Compatibility:</span> Paste your{' '}
              <strong>Groq API key</strong> (starts with <code>gsk_</code> from{' '}
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noreferrer"
                style={{ color: '#0ecb81', textDecoration: 'underline' }}
              >
                console.groq.com
              </a>
              ) or <strong>xAI Grok key</strong> (starts with <code>xai-</code>). Groq LPU models (Qwen 3.8 27B) execute at 500+ tok/s real-time.
            </div>
          )}

          <span style={{ fontSize: 9.5, color: '#64748b' }}>
            Keys are encrypted server-side and never exposed to the frontend or public logs.
          </span>
        </div>

        {/* Test Connection & Action Buttons */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
          <button
            type="button"
            onClick={() => handleTestConnection(provider)}
            disabled={!conf.hasKey || test.testing}
            style={{
              flex: 1,
              padding: '8px 12px',
              background: conf.hasKey ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: 5,
              color: conf.hasKey ? '#38bdf8' : '#64748b',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: conf.hasKey ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <Zap size={13} />
            {test.testing ? 'Testing Connection...' : 'Test Connection'}
          </button>

          {conf.hasKey && (
            <button
              type="button"
              onClick={() => handleRemoveKey(provider)}
              style={{
                padding: '8px 12px',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: 5,
                color: '#f87171',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Remove
            </button>
          )}
        </div>

        {/* Test Connection Output Feedback */}
        {test.result && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: 5,
              background: test.success ? 'rgba(14, 203, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
              border: `1px solid ${test.success ? 'rgba(14, 203, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              fontSize: 11,
              color: test.success ? '#0ecb81' : '#f87171',
            }}
          >
            {test.success ? <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />}
            <div>
              <div style={{ fontWeight: 700 }}>{test.result}</div>
              {test.latency ? <div style={{ fontSize: 9.5, color: '#94a3b8', marginTop: 2 }}>Round-trip latency: {test.latency}ms</div> : null}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderOrchestrationTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Operating Mode Selector */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>Multi-AI Operating Mode</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          {[
            { id: 'single' as AIMode, label: 'Single AI', desc: 'Fast & token-efficient' },
            { id: 'compare' as AIMode, label: 'Compare All', desc: 'Side-by-side models' },
            { id: 'consensus' as AIMode, label: 'Consensus', desc: 'Synthesized validation' },
          ].map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => {
                setSettings((prev) => ({ ...prev, mode: mode.id }));
                aiOrchestrator.updateSettings({ mode: mode.id });
              }}
              style={{
                padding: '8px 6px',
                borderRadius: 5,
                border: settings.mode === mode.id ? '1.5px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                background: settings.mode === mode.id ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                color: settings.mode === mode.id ? '#38bdf8' : '#94a3b8',
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 11.5, fontWeight: 700 }}>{mode.label}</div>
              <div style={{ fontSize: 9, opacity: 0.75, marginTop: 2 }}>{mode.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Primary & Secondary Provider Selectors */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Primary AI</label>
          <select
            value={settings.primaryProvider}
            onChange={(e) => {
              const val = e.target.value as AIProvider;
              setSettings((prev) => ({ ...prev, primaryProvider: val }));
              aiOrchestrator.updateSettings({ primaryProvider: val });
            }}
            style={{
              padding: '7px 8px',
              background: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 4,
              color: '#fff',
              fontSize: 11.5,
              fontWeight: 600,
            }}
          >
            <option value="gemini">Google Gemini</option>
            <option value="openai">OpenAI ChatGPT</option>
            <option value="grok">xAI Grok</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Secondary (Fallback)</label>
          <select
            value={settings.secondaryProvider}
            onChange={(e) => {
              const val = e.target.value as AIProvider;
              setSettings((prev) => ({ ...prev, secondaryProvider: val }));
              aiOrchestrator.updateSettings({ secondaryProvider: val });
            }}
            style={{
              padding: '7px 8px',
              background: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 4,
              color: '#fff',
              fontSize: 11.5,
              fontWeight: 600,
            }}
          >
            <option value="openai">OpenAI ChatGPT</option>
            <option value="gemini">Google Gemini</option>
            <option value="grok">xAI Grok</option>
          </select>
        </div>
      </div>

      {/* Fallback Resilience Toggle */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          background: 'rgba(255, 255, 255, 0.03)',
          borderRadius: 5,
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#f8fafc' }}>Automatic Fallback Resilience</div>
          <div style={{ fontSize: 9.5, color: '#64748b' }}>If primary model encounters rate limits or timeout, seamlessly switch to secondary.</div>
        </div>
        <input
          type="checkbox"
          checked={settings.fallbackEnabled}
          onChange={(e) => {
            setSettings((prev) => ({ ...prev, fallbackEnabled: e.target.checked }));
            aiOrchestrator.updateSettings({ fallbackEnabled: e.target.checked });
          }}
          style={{ accentColor: '#38bdf8', width: 14, height: 14 }}
        />
      </div>

      {/* Minimum Confidence Filter */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
          <span style={{ color: '#94a3b8' }}>Minimum Trade Setup Confidence:</span>
          <span style={{ color: '#38bdf8', fontWeight: 700 }}>{settings.minConfidenceThreshold}%</span>
        </div>
        <input
          type="range"
          min="50"
          max="85"
          step="5"
          value={settings.minConfidenceThreshold}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            setSettings((prev) => ({ ...prev, minConfidenceThreshold: val }));
            aiOrchestrator.updateSettings({ minConfidenceThreshold: val });
          }}
          style={{ accentColor: '#38bdf8' }}
        />
        <span style={{ fontSize: 9.5, color: '#64748b' }}>
          Filters out setups that do not have sufficient order book wall defense and absorption confirmation.
        </span>
      </div>

      {/* All AI Providers — Token Balance Matrix */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
          All AI Providers — Token Balance Comparison
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(['gemini', 'openai', 'grok'] as AIProvider[]).map((prov) => {
            const conf = configs[prov];
            const tokens: AITokenStats = conf?.tokens || {
              usedTokens: 0,
              totalTokens: prov === 'gemini' ? 1000000 : 500000,
              remainingTokens: prov === 'gemini' ? 1000000 : 500000,
              promptTokens: 0,
              completionTokens: 0,
              lastCallTokens: 0,
              percentRemaining: 100,
              lastUpdated: Date.now(),
            };
            const isConnected = Boolean(conf?.hasKey && conf?.status !== 'disconnected');
            const isExhausted = isConnected && (conf?.status === 'exhausted' || conf?.status === 'quota_exceeded' || tokens.remainingTokens <= 0);
            const isLow = isConnected && tokens.percentRemaining < 20 && !isExhausted;
            const barColor = !isConnected ? '#64748b' : isExhausted ? '#ef4444' : isLow ? '#f59e0b' : tokens.percentRemaining < 40 ? '#facc15' : '#0ecb81';
            const provName = prov === 'gemini' ? 'Google Gemini' : prov === 'openai' ? 'OpenAI ChatGPT' : 'xAI / Groq';

            return (
              <div
                key={prov}
                style={{
                  padding: '8px 10px',
                  borderRadius: 5,
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: isExhausted ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(255, 255, 255, 0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 5,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: barColor }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#f8fafc' }}>{provName}</span>
                    {settings.primaryProvider === prov && isConnected && (
                      <span style={{ fontSize: 9, background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', padding: '1px 4px', borderRadius: 2, fontWeight: 700 }}>
                        PRIMARY
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab(prov)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#38bdf8',
                      fontSize: 10,
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    Change Key / Quota →
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10.5 }}>
                  <span style={{ color: '#94a3b8' }}>
                    Remaining:{' '}
                    <strong style={{ color: '#f8fafc', fontFamily: '"JetBrains Mono", monospace' }}>
                      {!isConnected ? '0' : tokens.remainingTokens.toLocaleString()}
                    </strong>{' '}
                    / {formatTokenCount(tokens.totalTokens)}
                  </span>
                  <span style={{ color: barColor, fontWeight: 700, fontFamily: '"JetBrains Mono", monospace' }}>
                    {!isConnected ? 'NOT CONNECTED' : isExhausted ? 'EXHAUSTED' : `${tokens.percentRemaining}% left`}
                  </span>
                </div>

                <div style={{ width: '100%', height: 4, background: 'rgba(255, 255, 255, 0.08)', borderRadius: 2, overflow: 'hidden' }}>
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
      </div>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 480 }}>
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
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
            <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>
              JARVIS MULTI-AI ENGINE CONFIGURATION
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(0, 0, 0, 0.2)',
          }}
        >
          {(['gemini', 'openai', 'grok'] as AIProvider[]).map((p) => {
            const isConnected = Boolean(configs[p]?.hasKey && configs[p]?.status !== 'disconnected');
            const tok = configs[p]?.tokens;
            const isExhausted = isConnected && (configs[p]?.status === 'exhausted' || configs[p]?.status === 'quota_exceeded' || (tok && tok.remainingTokens <= 0));
            const isLow = isConnected && tok && tok.percentRemaining < 20 && !isExhausted;
            const dotColor = !isConnected ? '#64748b' : isExhausted ? '#ef4444' : isLow ? '#f59e0b' : '#0ecb81';
            return (
              <button
                key={p}
                type="button"
                onClick={() => setActiveTab(p)}
                style={{
                  flex: 1,
                  padding: '9px 10px',
                  background: activeTab === p ? 'rgba(255, 255, 255, 0.06)' : 'none',
                  border: 'none',
                  borderBottom: activeTab === p ? '2px solid #38bdf8' : '2px solid transparent',
                  color: activeTab === p ? '#38bdf8' : '#94a3b8',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  whiteSpace: 'nowrap',
                }}
              >
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: dotColor,
                    flexShrink: 0,
                  }}
                />
                <span>{p === 'gemini' ? 'Gemini' : p === 'openai' ? 'OpenAI' : 'Groq / xAI'}</span>
                {isConnected && tok && (
                  <span style={{ fontSize: 9.5, opacity: 0.85, fontFamily: '"JetBrains Mono", monospace' }}>
                    ({formatTokenCount(tok.remainingTokens)})
                  </span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setActiveTab('orchestration')}
            style={{
              flex: 1,
              padding: '9px 12px',
              background: activeTab === 'orchestration' ? 'rgba(255, 255, 255, 0.06)' : 'none',
              border: 'none',
              borderBottom: activeTab === 'orchestration' ? '2px solid #38bdf8' : '2px solid transparent',
              color: activeTab === 'orchestration' ? '#38bdf8' : '#94a3b8',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <Sliders size={13} />
            Consensus
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: 16 }}>
          {activeTab === 'orchestration' ? renderOrchestrationTab() : renderProviderTab(activeTab)}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(0, 0, 0, 0.2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: '#64748b' }}>
            <Shield size={12} style={{ color: '#0ecb81' }} />
            Zero Key Leakage Vault
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '5px 14px',
              background: '#38bdf8',
              color: '#0f172a',
              border: 'none',
              borderRadius: 4,
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
