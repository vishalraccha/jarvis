/**
 * JARVIS Backend Secure AI Key Manager & Execution Proxy
 * Manages secret API keys, encryption, masked status reporting,
 * and handles resilient upstream API proxying for OpenAI, Gemini, and Grok.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export type AIProviderId = 'openai' | 'gemini' | 'grok';

export interface AITokenStats {
  usedTokens: number;
  totalTokens: number;
  remainingTokens: number;
  promptTokens: number;
  completionTokens: number;
  lastCallTokens: number;
  percentRemaining: number;
  lastUpdated: number;
  tierId?: string;
  tierName?: string;
  resetTimeFormatted?: string;
  rateLimitType?: 'tpm' | 'tpd';
  tpmLimit?: number;
  dailyLimit?: number;
}

export interface ProviderTierDefinition {
  tierId: string;
  name: string;
  tpm: number;
  dailyQuota: number;
  rateLimitType: 'tpm' | 'tpd';
  description: string;
}

export const PROVIDER_TIERS: Record<AIProviderId, ProviderTierDefinition[]> = {
  gemini: [
    {
      tierId: 'free',
      name: 'Free Tier',
      tpm: 1_000_000,
      dailyQuota: 1_000_000,
      rateLimitType: 'tpm',
      description: '1M TPM • 1,500 RPD • Google AI Studio Free',
    },
    {
      tierId: 'tier1',
      name: 'Pay-As-You-Go (Tier 1)',
      tpm: 4_000_000,
      dailyQuota: 4_000_000,
      rateLimitType: 'tpm',
      description: '4M TPM • 2,000 RPM • Cloud Billing Tier',
    },
  ],
  openai: [
    {
      tierId: 'tier1',
      name: 'Tier 1 (Pay-As-You-Go)',
      tpm: 200_000,
      dailyQuota: 200_000,
      rateLimitType: 'tpm',
      description: '200K TPM (mini) / 30K TPM (4o) • $5+ prepaid',
    },
    {
      tierId: 'tier2',
      name: 'Tier 2 (Pro)',
      tpm: 2_000_000,
      dailyQuota: 2_000_000,
      rateLimitType: 'tpm',
      description: '2M TPM (mini) / 450K TPM (4o) • Standard Tier',
    },
    {
      tierId: 'free',
      name: 'Usage Tier 0 / Free',
      tpm: 30_000,
      dailyQuota: 30_000,
      rateLimitType: 'tpm',
      description: '30K TPM • 200 RPD Developer Free Tier',
    },
  ],
  grok: [
    {
      tierId: 'groq_free',
      name: 'Groq Free Tier (Llama 3.3)',
      tpm: 30_000,
      dailyQuota: 100_000,
      rateLimitType: 'tpd',
      description: '30K TPM • 100K Daily Tokens • Ultra-fast inference',
    },
    {
      tierId: 'groq_dev',
      name: 'Groq Developer (Paid)',
      tpm: 100_000,
      dailyQuota: 1_000_000,
      rateLimitType: 'tpd',
      description: '100K TPM • 1M Daily Tokens • High Concurrency',
    },
    {
      tierId: 'xai_standard',
      name: 'xAI Grok Standard',
      tpm: 2_000_000,
      dailyQuota: 2_000_000,
      rateLimitType: 'tpm',
      description: '2M TPM • Grok-2 & Grok-beta API',
    },
  ],
};

export const DEFAULT_TOKEN_QUOTAS: Record<AIProviderId, number> = {
  gemini: 1_000_000, // True Gemini 2.0 Flash Free limit: 1M TPM
  openai: 200_000,   // True OpenAI Tier 1 GPT-4o-mini limit: 200K TPM
  grok: 100_000,     // True Groq Free daily quota: 100K TPD
};

interface StoredKeyConfig {
  key: string;
  updatedAt: number;
  lastTested?: number;
  status: 'connected' | 'invalid_key' | 'rate_limited' | 'quota_exceeded' | 'error' | 'disconnected';
  lastError?: string;
  defaultModel?: string;
  tokensUsed?: number;
  totalTokens?: number;
  remainingTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  lastCallTokens?: number;
  lastUpdated?: number;
  tierId?: string;
  lastResetDate?: string;
}

class AIKeyManager {
  private keys: Map<AIProviderId, StoredKeyConfig> = new Map();
  private storageFile: string;
  private encryptionSecret: Buffer;

  constructor() {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
      } catch {}
    }
    this.storageFile = path.join(dataDir, 'ai_keys_vault.enc');

    // Deterministic host key derivation
    const seed = process.env.JARVIS_SECRET || 'JARVIS_ENTERPRISE_TRADING_INTELLIGENCE_KEY_2026';
    this.encryptionSecret = crypto.createHash('sha256').update(seed).digest();

    this.loadFromStorage();
    this.seedFromEnv();
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionSecret, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  }

  private decrypt(encryptedText: string): string | null {
    try {
      const parts = encryptedText.split(':');
      if (parts.length !== 2) return null;
      const iv = Buffer.from(parts[0], 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionSecret, iv);
      let decrypted = decipher.update(parts[1], 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch {
      return null;
    }
  }

  private loadFromStorage(): void {
    if (!fs.existsSync(this.storageFile)) return;
    try {
      const raw = fs.readFileSync(this.storageFile, 'utf8');
      const decrypted = this.decrypt(raw);
      if (decrypted) {
        const parsed = JSON.parse(decrypted);
        for (const [p, config] of Object.entries(parsed)) {
          const cfg = config as StoredKeyConfig;
          if (p === 'gemini' && (!cfg.defaultModel || cfg.defaultModel.includes('2.5') || cfg.defaultModel.includes('1.5-flash'))) {
            cfg.defaultModel = 'gemini-3.8-flash';
          }
          if (p === 'openai' && (!cfg.defaultModel || cfg.defaultModel.includes('turbo') || cfg.defaultModel.includes('3.5'))) {
            cfg.defaultModel = 'gpt-4o-mini';
          }
          if (p === 'grok' && cfg.key?.startsWith('gsk_') && (!cfg.defaultModel || cfg.defaultModel.startsWith('grok-'))) {
            cfg.defaultModel = 'qwen/qwen3.8-27b';
          }
          this.keys.set(p as AIProviderId, cfg);
        }
      }
    } catch (err) {
      console.warn('[AIKeyManager] Vault load warning:', (err as any)?.message);
    }
  }

  private saveToStorage(): void {
    try {
      const obj: Record<string, StoredKeyConfig> = {};
      for (const [p, config] of this.keys.entries()) {
        obj[p] = config;
      }
      const encrypted = this.encrypt(JSON.stringify(obj));
      fs.writeFileSync(this.storageFile, encrypted, 'utf8');
    } catch (err) {
      console.error('[AIKeyManager] Failed to persist key vault:', err);
    }
  }

  private seedFromEnv(): void {
    const envOpenAI = process.env.OPENAI_API_KEY;
    if (envOpenAI && !this.keys.has('openai')) {
      this.keys.set('openai', {
        key: envOpenAI,
        updatedAt: Date.now(),
        status: 'connected',
        defaultModel: 'gpt-4o-mini',
      });
    }

    const envGemini = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (envGemini && !this.keys.has('gemini')) {
      this.keys.set('gemini', {
        key: envGemini,
        updatedAt: Date.now(),
        status: 'connected',
        defaultModel: 'gemini-3.8-flash',
      });
    }

    const envGrok = process.env.XAI_API_KEY || process.env.GROK_API_KEY || process.env.GROQ_API_KEY;
    if (envGrok && !this.keys.has('grok')) {
      const isGroq = envGrok.startsWith('gsk_');
      this.keys.set('grok', {
        key: envGrok,
        updatedAt: Date.now(),
        status: 'connected',
        defaultModel: isGroq ? 'qwen/qwen3.8-27b' : 'grok-2-mini',
      });
    }
  }

  public hasKey(provider: AIProviderId): boolean {
    const c = this.keys.get(provider);
    return Boolean(c && c.key && c.key.trim().length > 5);
  }

  public getMaskedKey(provider: AIProviderId): string | null {
    const c = this.keys.get(provider);
    if (!c || !c.key) return null;
    const raw = c.key.trim();
    if (raw.length <= 8) return '********';
    return `${raw.slice(0, 4)}...${raw.slice(-4)}`;
  }

  public setKey(provider: AIProviderId, key: string, model?: string): void {
    const cleanKey = key.trim();
    const existing = this.keys.get(provider);
    let resolvedModel = model || existing?.defaultModel;

    if (provider === 'openai') {
      if (!resolvedModel || resolvedModel.includes('turbo') || resolvedModel.includes('3.5')) {
        resolvedModel = 'gpt-4o-mini';
      }
    } else if (provider === 'grok') {
      const isGroq = cleanKey.startsWith('gsk_');
      if (isGroq && (!resolvedModel || resolvedModel.startsWith('grok-'))) {
        resolvedModel = 'qwen/qwen3.8-27b';
      } else if (!isGroq && (!resolvedModel || resolvedModel.includes('/'))) {
        resolvedModel = 'grok-2-mini';
      }
    } else if (provider === 'gemini') {
      if (!resolvedModel || resolvedModel.includes('2.5')) {
        resolvedModel = 'gemini-3.5-flash';
      }
    }

    const isNewKey = existing ? existing.key !== cleanKey : Boolean(cleanKey);
    const prevQuota = existing?.totalTokens || DEFAULT_TOKEN_QUOTAS[provider];
    const prevUsed = isNewKey ? 0 : (existing?.tokensUsed || 0);
    const prevRemaining = isNewKey ? prevQuota : (existing?.remainingTokens !== undefined ? existing.remainingTokens : prevQuota);

    this.keys.set(provider, {
      key: cleanKey,
      updatedAt: Date.now(),
      status: cleanKey ? 'connected' : 'disconnected',
      defaultModel: resolvedModel,
      tokensUsed: prevUsed,
      totalTokens: prevQuota,
      remainingTokens: prevRemaining,
      promptTokens: isNewKey ? 0 : (existing?.promptTokens || 0),
      completionTokens: isNewKey ? 0 : (existing?.completionTokens || 0),
      lastCallTokens: isNewKey ? 0 : (existing?.lastCallTokens || 0),
      lastUpdated: Date.now(),
    });
    this.saveToStorage();
  }

  public removeKey(provider: AIProviderId): void {
    this.keys.delete(provider);
    this.saveToStorage();
  }

  private checkAutoReset(c: StoredKeyConfig, provider: AIProviderId): void {
    const todayUtc = new Date().toISOString().slice(0, 10);
    if (!c.lastResetDate) {
      c.lastResetDate = todayUtc;
      return;
    }
    if (c.lastResetDate !== todayUtc) {
      // 00:00 UTC reached: automatic reset of daily tokens used (no manual button needed!)
      c.tokensUsed = 0;
      c.promptTokens = 0;
      c.completionTokens = 0;
      c.lastCallTokens = 0;
      const defaultQuota = DEFAULT_TOKEN_QUOTAS[provider] || 500_000;
      c.remainingTokens = c.totalTokens || defaultQuota;
      c.lastResetDate = todayUtc;
      c.lastUpdated = Date.now();
      if (c.status === 'quota_exceeded') {
        c.status = 'connected';
      }
      this.saveToStorage();
    }
  }

  private getUtcResetCountdown(): string {
    const now = new Date();
    const nextUtcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
    const diffMs = nextUtcMidnight.getTime() - now.getTime();
    const hours = Math.floor(diffMs / 3600000);
    const mins = Math.floor((diffMs % 3600000) / 60000);
    return `00:00 UTC (in ${hours}h ${mins}m)`;
  }

  public getTokenStats(provider: AIProviderId): AITokenStats {
    const c = this.keys.get(provider);
    if (c) {
      this.checkAutoReset(c, provider);
    }
    const hasKey = this.hasKey(provider);
    const tiers = PROVIDER_TIERS[provider] || [];
    const activeTier = tiers.find((t) => t.tierId === c?.tierId) || tiers[0];
    const defaultQuota = activeTier ? (activeTier.dailyQuota || activeTier.tpm) : (DEFAULT_TOKEN_QUOTAS[provider] || 500_000);
    const totalTokens = c?.totalTokens && c.totalTokens > 0 ? c.totalTokens : defaultQuota;
    const usedTokens = hasKey ? (c?.tokensUsed || 0) : 0;
    let remainingTokens = hasKey
      ? (c?.remainingTokens !== undefined ? c.remainingTokens : Math.max(0, totalTokens - usedTokens))
      : totalTokens;
    if (hasKey && c?.status === 'quota_exceeded') {
      remainingTokens = 0;
    }
    const percentRemaining = hasKey && totalTokens > 0
      ? Math.max(0, Math.min(100, Math.round((remainingTokens / totalTokens) * 1000) / 10))
      : 100;

    return {
      usedTokens,
      totalTokens,
      remainingTokens,
      promptTokens: hasKey ? (c?.promptTokens || 0) : 0,
      completionTokens: hasKey ? (c?.completionTokens || 0) : 0,
      lastCallTokens: hasKey ? (c?.lastCallTokens || 0) : 0,
      percentRemaining,
      lastUpdated: c?.lastUpdated || c?.updatedAt || Date.now(),
      tierId: activeTier?.tierId || 'default',
      tierName: activeTier?.name || 'Standard Tier',
      resetTimeFormatted: this.getUtcResetCountdown(),
      rateLimitType: activeTier?.rateLimitType || 'tpm',
      tpmLimit: activeTier?.tpm || totalTokens,
      dailyLimit: activeTier?.dailyQuota || totalTokens,
    };
  }

  public setAccountTier(provider: AIProviderId, tierId: string): AITokenStats {
    let c = this.keys.get(provider);
    if (!c) {
      c = {
        key: '',
        status: 'disconnected',
        updatedAt: Date.now(),
        tokensUsed: 0,
        totalTokens: DEFAULT_TOKEN_QUOTAS[provider] || 500_000,
        remainingTokens: DEFAULT_TOKEN_QUOTAS[provider] || 500_000,
      };
      this.keys.set(provider, c);
    }
    const tiers = PROVIDER_TIERS[provider] || [];
    const matched = tiers.find((t) => t.tierId === tierId) || tiers[0];
    if (matched) {
      c.tierId = matched.tierId;
      const quota = matched.dailyQuota || matched.tpm;
      c.totalTokens = quota;
      c.remainingTokens = Math.max(0, quota - (c.tokensUsed || 0));
      c.lastUpdated = Date.now();
      this.saveToStorage();
    }
    return this.getTokenStats(provider);
  }

  public setTokenQuota(provider: AIProviderId, totalTokens: number): AITokenStats {
    let c = this.keys.get(provider);
    if (!c) {
      c = {
        key: '',
        status: 'disconnected',
        updatedAt: Date.now(),
        tokensUsed: 0,
        totalTokens: DEFAULT_TOKEN_QUOTAS[provider] || 500_000,
        remainingTokens: DEFAULT_TOKEN_QUOTAS[provider] || 500_000,
      };
      this.keys.set(provider, c);
    }
    c.totalTokens = Math.max(1000, totalTokens);
    c.remainingTokens = Math.max(0, c.totalTokens - (c.tokensUsed || 0));
    c.lastUpdated = Date.now();
    this.saveToStorage();
    return this.getTokenStats(provider);
  }

  public resetTokenStats(provider: AIProviderId, newTotalQuota?: number): AITokenStats {
    let c = this.keys.get(provider);
    if (!c) {
      c = {
        key: '',
        status: 'disconnected',
        updatedAt: Date.now(),
        tokensUsed: 0,
        totalTokens: DEFAULT_TOKEN_QUOTAS[provider] || 500_000,
        remainingTokens: DEFAULT_TOKEN_QUOTAS[provider] || 500_000,
      };
      this.keys.set(provider, c);
    }
    c.tokensUsed = 0;
    c.promptTokens = 0;
    c.completionTokens = 0;
    c.lastCallTokens = 0;
    if (newTotalQuota && newTotalQuota > 0) {
      c.totalTokens = newTotalQuota;
    }
    const quota = c.totalTokens || DEFAULT_TOKEN_QUOTAS[provider] || 500_000;
    c.remainingTokens = quota;
    c.lastUpdated = Date.now();
    if (c.status === 'quota_exceeded') {
      c.status = 'connected';
    }
    this.saveToStorage();
    return this.getTokenStats(provider);
  }

  public recordTokenUsage(
    provider: AIProviderId,
    promptTokens: number = 0,
    completionTokens: number = 0,
    totalTokens?: number,
    headers?: Headers
  ): AITokenStats {
    let c = this.keys.get(provider);
    if (!c) {
      c = {
        key: '',
        status: 'disconnected',
        updatedAt: Date.now(),
        tokensUsed: 0,
        totalTokens: DEFAULT_TOKEN_QUOTAS[provider] || 500_000,
        remainingTokens: DEFAULT_TOKEN_QUOTAS[provider] || 500_000,
      };
      this.keys.set(provider, c);
    }

    const callTotal = (totalTokens && totalTokens > 0) ? totalTokens : (promptTokens + completionTokens);
    c.tokensUsed = (c.tokensUsed || 0) + callTotal;
    c.promptTokens = (c.promptTokens || 0) + promptTokens;
    c.completionTokens = (c.completionTokens || 0) + completionTokens;
    c.lastCallTokens = callTotal;
    c.lastUpdated = Date.now();

    // Check upstream rate limit headers (OpenAI / Groq)
    const limitHdr = headers?.get('x-ratelimit-limit-tokens');
    const remainingHdr = headers?.get('x-ratelimit-remaining-tokens');
    if (limitHdr && remainingHdr) {
      const parsedLimit = parseInt(limitHdr, 10);
      const parsedRem = parseInt(remainingHdr, 10);
      if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
        c.totalTokens = parsedLimit;
      }
      if (Number.isFinite(parsedRem) && parsedRem >= 0) {
        c.remainingTokens = parsedRem;
      }
    } else {
      const quota = c.totalTokens || DEFAULT_TOKEN_QUOTAS[provider] || 500_000;
      c.totalTokens = quota;
      c.remainingTokens = Math.max(0, quota - c.tokensUsed);
    }

    if (c.remainingTokens !== undefined && c.remainingTokens <= 0) {
      c.status = 'quota_exceeded';
    }

    this.saveToStorage();
    return this.getTokenStats(provider);
  }

  public getStatus(provider: AIProviderId) {
    const c = this.keys.get(provider);
    const hasKey = this.hasKey(provider);
    return {
      provider,
      hasKey,
      maskedKey: this.getMaskedKey(provider),
      status: hasKey ? (c?.status || 'connected') : 'disconnected',
      lastTested: c?.lastTested,
      lastError: hasKey ? c?.lastError : undefined,
      defaultModel: c?.defaultModel,
      tokens: this.getTokenStats(provider),
    };
  }

  public getAllStatuses() {
    return {
      openai: this.getStatus('openai'),
      gemini: this.getStatus('gemini'),
      grok: this.getStatus('grok'),
    };
  }

  public getKey(provider: AIProviderId): string | null {
    return this.keys.get(provider)?.key || null;
  }

  public updateStatus(
    provider: AIProviderId,
    status: 'connected' | 'invalid_key' | 'rate_limited' | 'quota_exceeded' | 'error' | 'disconnected',
    error?: string
  ): void {
    const c = this.keys.get(provider);
    if (c) {
      c.status = status;
      c.lastTested = Date.now();
      c.lastError = error;
      this.saveToStorage();
    }
  }

  /**
   * Ping / test provider connectivity with minimal token cost
   */
  public async testProvider(provider: AIProviderId, model?: string): Promise<{ success: boolean; message: string; latencyMs: number }> {
    const key = this.getKey(provider);
    if (!key) {
      this.updateStatus(provider, 'disconnected', 'No API key provided');
      return { success: false, message: 'No API key configured for provider', latencyMs: 0 };
    }

    const t0 = performance.now();
    try {
      if (provider === 'openai') {
        let selectedModel = model || this.keys.get(provider)?.defaultModel || 'gpt-4o-mini';
        if (selectedModel === 'o1' || selectedModel.includes('turbo') || selectedModel.includes('3.5')) {
          selectedModel = 'gpt-4o-mini';
        }
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: selectedModel,
            messages: [{ role: 'user', content: 'Reply with "OK"' }],
            max_tokens: 5,
          }),
          signal: AbortSignal.timeout(10000),
        });

        const latency = Math.round(performance.now() - t0);
        if (res.ok) {
          this.updateStatus(provider, 'connected');
          const cfg = this.keys.get(provider);
          if (cfg) {
            cfg.defaultModel = selectedModel;
            this.saveToStorage();
          }
          return { success: true, message: `Connected to OpenAI (${selectedModel}) in ${latency}ms`, latencyMs: latency };
        }

        const errJson = (await res.json().catch(() => ({}))) as any;
        let errMsg = errJson?.error?.message || `HTTP ${res.status}`;
        const errCode = errJson?.error?.code;

        if (res.status === 401) {
          this.updateStatus(provider, 'invalid_key', errMsg);
        } else if (res.status === 429 || errCode === 'credit_balance_exhausted' || errCode === 'insufficient_quota' || errMsg.includes('credits') || errMsg.includes('quota')) {
          errMsg = 'OpenAI API balance exhausted ($0 credits). Add prepaid API credits at platform.openai.com/settings/organization/billing (Note: ChatGPT Plus subscription does not cover API credits).';
          this.updateStatus(provider, 'quota_exceeded', errMsg);
        } else {
          this.updateStatus(provider, 'error', errMsg);
        }
        return { success: false, message: errMsg, latencyMs: latency };
      }

      if (provider === 'gemini') {
        const candidateModels = Array.from(new Set([
          model,
          'gemini-2.5-flash',
          'gemini-2.0-flash',
          'gemini-1.5-flash',
          'gemini-flash-latest',
          'gemini-3.5-flash',
          'gemini-3.8-flash',
          'gemini-3.1-flash-lite',
        ].filter(Boolean)));

        let lastErrMsg = '';
        let lastLatency = 0;

        for (const selectedModel of candidateModels) {
          try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${key}`;
            const res = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: 'Reply with "OK"' }] }],
                generationConfig: { maxOutputTokens: 5 },
              }),
              signal: AbortSignal.timeout(8000),
            });

            const latency = Math.round(performance.now() - t0);
            lastLatency = latency;

            if (res.ok) {
              this.updateStatus(provider, 'connected');
              const cfg = this.keys.get(provider);
              if (cfg) {
                cfg.defaultModel = selectedModel;
                this.saveToStorage();
              }
              return { success: true, message: `Connected to Google Gemini (${selectedModel}) in ${latency}ms`, latencyMs: latency };
            }

            const errJson = (await res.json().catch(() => ({}))) as any;
            const errMsg = errJson?.error?.message || `HTTP ${res.status}`;
            lastErrMsg = errMsg;

            if (res.status === 400 || res.status === 403) {
              this.updateStatus(provider, 'invalid_key', errMsg);
              return { success: false, message: errMsg, latencyMs: latency };
            }
            if (res.status === 429) {
              this.updateStatus(provider, 'quota_exceeded', errMsg);
              return { success: false, message: errMsg, latencyMs: latency };
            }
          } catch (err: any) {
            lastErrMsg = err.message || 'Request error';
          }
        }

        this.updateStatus(provider, 'error', lastErrMsg);
        return { success: false, message: lastErrMsg, latencyMs: lastLatency };
      }

      if (provider === 'grok') {
        const isGroq = key.startsWith('gsk_') || (model && (model.includes('/') || model.includes('qwen') || model.includes('oss')));
        const endpoint = isGroq
          ? 'https://api.groq.com/openai/v1/chat/completions'
          : 'https://api.x.ai/v1/chat/completions';

        let selectedModel = model;
        if (isGroq) {
          if (!selectedModel || selectedModel.startsWith('grok-')) {
            selectedModel = 'qwen/qwen3.8-27b';
          }
        } else {
          if (!selectedModel || selectedModel.includes('/')) {
            selectedModel = 'grok-2-mini';
          }
        }

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: selectedModel,
            messages: [{ role: 'user', content: 'Reply with "OK"' }],
            max_tokens: 5,
          }),
          signal: AbortSignal.timeout(10000),
        });

        const latency = Math.round(performance.now() - t0);
        if (res.ok) {
          this.updateStatus(provider, 'connected');
          const cfg = this.keys.get(provider);
          if (cfg) {
            cfg.defaultModel = selectedModel;
            this.saveToStorage();
          }
          const providerLabel = isGroq ? 'Groq LPU' : 'xAI Grok';
          return { success: true, message: `Connected to ${providerLabel} (${selectedModel}) in ${latency}ms`, latencyMs: latency };
        }

        const errJson = (await res.json().catch(() => ({}))) as any;
        const errMsg = errJson?.error?.message || `HTTP ${res.status}`;
        if (res.status === 401) {
          this.updateStatus(provider, 'invalid_key', errMsg);
        } else if (res.status === 429) {
          this.updateStatus(provider, 'quota_exceeded', errMsg);
        } else {
          this.updateStatus(provider, 'error', errMsg);
        }
        return { success: false, message: errMsg, latencyMs: latency };
      }

      return { success: false, message: 'Unknown provider', latencyMs: 0 };
    } catch (err: any) {
      const latency = Math.round(performance.now() - t0);
      const isTimeout = err.name === 'TimeoutError' || err.message?.includes('timeout');
      const msg = isTimeout ? 'Connection timed out after 10s' : (err.message || 'Network error');
      this.updateStatus(provider, 'error', msg);
      return { success: false, message: msg, latencyMs: latency };
    }
  }

  /**
   * Universal completion executor across OpenAI, Gemini, and Grok
   */
  public async executeChat(
    provider: AIProviderId,
    model: string,
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    temperature: number = 0.2
  ): Promise<{ text: string; model: string; provider: AIProviderId; tokensUsed?: number; tokens?: AITokenStats }> {
    const key = this.getKey(provider);
    if (!key) {
      throw new Error(`API key for provider ${provider.toUpperCase()} is not configured. Please open JARVIS AI Settings.`);
    }

    if (provider === 'openai' || provider === 'grok') {
      let endpoint = 'https://api.openai.com/v1/chat/completions';
      let resolvedModel = model;

      if (provider === 'openai') {
        if (resolvedModel === 'o1' || resolvedModel.includes('turbo') || resolvedModel.includes('3.5')) {
          resolvedModel = 'gpt-4o-mini';
        }
      } else if (provider === 'grok') {
        const isGroq = key.startsWith('gsk_') || resolvedModel.includes('/') || resolvedModel.includes('qwen') || resolvedModel.includes('oss');
        endpoint = isGroq
          ? 'https://api.groq.com/openai/v1/chat/completions'
          : 'https://api.x.ai/v1/chat/completions';

        if (isGroq && (!resolvedModel || resolvedModel.startsWith('grok-'))) {
          resolvedModel = 'qwen/qwen3.8-27b';
        } else if (!isGroq && (!resolvedModel || resolvedModel.includes('/'))) {
          resolvedModel = 'grok-2-mini';
        }
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: resolvedModel,
          messages,
          temperature,
          max_tokens: 1800,
        }),
        signal: AbortSignal.timeout(25000),
      });

      if (!res.ok) {
        const errJson = (await res.json().catch(() => ({}))) as any;
        let errMsg = errJson?.error?.message || `Upstream provider error (${res.status})`;
        const errCode = errJson?.error?.code;

        if (res.status === 429 || errCode === 'credit_balance_exhausted' || errCode === 'insufficient_quota') {
          if (provider === 'openai') {
            errMsg = 'OpenAI API balance exhausted ($0 credits). Add prepaid credits at platform.openai.com/settings/organization/billing (Note: ChatGPT Plus subscription does not cover API credits).';
          }
          this.updateStatus(provider, 'quota_exceeded', errMsg);
        }
        throw new Error(`[${provider.toUpperCase()}] ${errMsg}`);
      }

      const data = (await res.json()) as any;
      const text = data?.choices?.[0]?.message?.content || '';
      const promptToks = data?.usage?.prompt_tokens || 0;
      const compToks = data?.usage?.completion_tokens || 0;
      const totToks = data?.usage?.total_tokens || (promptToks + compToks);
      const tokenStats = this.recordTokenUsage(provider, promptToks, compToks, totToks, res.headers);
      return {
        text,
        model: resolvedModel,
        provider,
        tokensUsed: totToks,
        tokens: tokenStats,
      };
    }

    if (provider === 'gemini') {
      const candidateModels = Array.from(new Set([
        model,
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-1.5-flash',
        'gemini-flash-latest',
        'gemini-3.5-flash',
        'gemini-3.8-flash',
        'gemini-3.1-flash-lite',
      ].filter(Boolean)));

      // Separate system messages for Gemini
      const systemMsg = messages.find((m) => m.role === 'system')?.content;
      const conversationMsgs = messages.filter((m) => m.role !== 'system');

      const geminiContents = conversationMsgs.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const bodyPayload: any = {
        contents: geminiContents,
        generationConfig: {
          temperature,
          maxOutputTokens: 1800,
        },
      };

      if (systemMsg) {
        bodyPayload.systemInstruction = {
          parts: [{ text: systemMsg }],
        };
      }

      let lastError = '';
      for (const resolvedModel of candidateModels) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:generateContent?key=${key}`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyPayload),
            signal: AbortSignal.timeout(25000),
          });

          if (res.ok) {
            const data = (await res.json()) as any;
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const promptToks = data?.usageMetadata?.promptTokenCount || 0;
            const compToks = data?.usageMetadata?.candidatesTokenCount || 0;
            const totToks = data?.usageMetadata?.totalTokenCount || (promptToks + compToks);
            const tokenStats = this.recordTokenUsage(provider, promptToks, compToks, totToks, res.headers);
            return {
              text,
              model: resolvedModel,
              provider,
              tokensUsed: totToks,
              tokens: tokenStats,
            };
          }

          const errJson = (await res.json().catch(() => ({}))) as any;
          const errMsg = errJson?.error?.message || `Gemini API error (${res.status})`;
          lastError = errMsg;
          if (res.status === 429) {
            this.updateStatus(provider, 'quota_exceeded', errMsg);
            throw new Error(`[GEMINI] ${errMsg}`);
          }
          if (res.status === 400 || res.status === 403) {
            this.updateStatus(provider, 'invalid_key', errMsg);
            throw new Error(`[GEMINI] ${errMsg}`);
          }
        } catch (err: any) {
          if (err.message?.includes('[GEMINI]')) throw err;
          lastError = err.message;
        }
      }
      throw new Error(`[GEMINI] ${lastError || 'Service unavailable'}`);
    }

    throw new Error(`Unsupported AI provider: ${provider}`);
  }
}

export const aiKeyManager = new AIKeyManager();
