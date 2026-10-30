/**
 * JARVIS Backend Secure AI Key Manager & Execution Proxy
 * Manages secret API keys, encryption, masked status reporting,
 * and handles resilient upstream API proxying for OpenAI, Gemini, and Grok.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export type AIProviderId = 'openai' | 'gemini' | 'grok';

interface StoredKeyConfig {
  key: string;
  updatedAt: number;
  lastTested?: number;
  status: 'connected' | 'invalid_key' | 'rate_limited' | 'quota_exceeded' | 'error' | 'disconnected';
  lastError?: string;
  defaultModel?: string;
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

    this.keys.set(provider, {
      key: cleanKey,
      updatedAt: Date.now(),
      status: cleanKey ? 'connected' : 'disconnected',
      defaultModel: resolvedModel,
    });
    this.saveToStorage();
  }

  public removeKey(provider: AIProviderId): void {
    this.keys.delete(provider);
    this.saveToStorage();
  }

  public getStatus(provider: AIProviderId) {
    const c = this.keys.get(provider);
    return {
      provider,
      hasKey: Boolean(c && c.key),
      maskedKey: this.getMaskedKey(provider),
      status: c?.status || 'disconnected',
      lastTested: c?.lastTested,
      lastError: c?.lastError,
      defaultModel: c?.defaultModel,
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
          (!model || model.includes('2.5')) ? 'gemini-3.5-flash' : model,
          'gemini-3.5-flash',
          'gemini-3.8-flash',
          'gemini-3.1-flash-lite',
        ]));

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
  ): Promise<{ text: string; model: string; provider: AIProviderId; tokensUsed?: number }> {
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
      return {
        text,
        model: resolvedModel,
        provider,
        tokensUsed: data?.usage?.total_tokens,
      };
    }

    if (provider === 'gemini') {
      const candidateModels = Array.from(new Set([
        (!model || model.includes('2.5')) ? 'gemini-3.5-flash' : model,
        'gemini-3.5-flash',
        'gemini-3.8-flash',
        'gemini-3.1-flash-lite',
      ]));

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
            return {
              text,
              model: resolvedModel,
              provider,
              tokensUsed: data?.usageMetadata?.totalTokenCount,
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
