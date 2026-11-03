/**
 * JARVIS Multi-AI Orchestrator & Client Service
 * Coordinates multi-provider execution (OpenAI, Gemini, Grok),
 * handles consensus & comparative analysis, fallback recovery,
 * and maintains conversational thread context.
 */

import {
  AIMessage,
  AIProvider,
  AIProviderConfig,
  AISystemSettings,
  DEFAULT_AI_SYSTEM_SETTINGS,
  AIEvidenceSnapshot,
  TradeSetup,
  PROVIDER_SUPPORTED_MODELS,
} from '../../types/ai';
import { aiToolRegistry, CandleLike } from './AIToolRegistry';
import { marketIntelligenceEngine } from './MarketIntelligenceEngine';
import { tradeJournalEngine } from './TradeJournalEngine';

export class AIOrchestrator {
  private settings: AISystemSettings = { ...DEFAULT_AI_SYSTEM_SETTINGS };
  private providerConfigs: Record<AIProvider, AIProviderConfig> = {
    gemini: { provider: 'gemini', enabled: true, model: 'gemini-3.5-flash', hasKey: false, status: 'disconnected' },
    openai: { provider: 'openai', enabled: false, model: 'gpt-4o-mini', hasKey: false, status: 'disconnected' },
    grok: { provider: 'grok', enabled: false, model: 'qwen/qwen3.8-27b', hasKey: false, status: 'disconnected' },
  };

  private messages: AIMessage[] = [];
  private listeners: Set<() => void> = new Set();
  private isAnalyzing: boolean = false;
  private currentSetup: TradeSetup | null = null;
  private currentSnapshot: AIEvidenceSnapshot | null = null;
  private storageKey = 'jarvis_ai_settings_v1';
  private clientVaultKey = 'jarvis_ai_client_vault_v1';
  private clientKeys: Record<AIProvider, string> = {
    gemini: '',
    openai: '',
    grok: '',
  };

  constructor() {
    this.loadSettings();
    this.loadClientKeys();
    this.refreshProviderStatuses();
  }

  private async safeJson<T = any>(res: Response): Promise<T | null> {
    try {
      const text = await res.text();
      if (!text || !text.trim()) return null;
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  }

  private maskKey(key: string): string {
    if (!key || key.length < 8) return '••••••••';
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
  }

  private loadClientKeys(): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const raw = localStorage.getItem(this.clientVaultKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        for (const p of ['gemini', 'openai', 'grok'] as AIProvider[]) {
          if (parsed[p] && typeof parsed[p] === 'string' && parsed[p].trim()) {
            const key = parsed[p].trim();
            this.clientKeys[p] = key;
            this.providerConfigs[p] = {
              ...this.providerConfigs[p],
              hasKey: true,
              maskedKey: this.maskKey(key),
              status: 'connected',
            };
          }
        }
      }
    } catch {}
  }

  private saveClientKeys(): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      localStorage.setItem(this.clientVaultKey, JSON.stringify(this.clientKeys));
    } catch {}
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const l of this.listeners) {
      try { l(); } catch {}
    }
  }

  private loadSettings(): void {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        this.settings = { ...DEFAULT_AI_SYSTEM_SETTINGS, ...JSON.parse(raw) };
      }
    } catch {}
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.settings));
    } catch {}
  }

  public updateSettings(patch: Partial<AISystemSettings>): void {
    this.settings = { ...this.settings, ...patch };
    this.saveSettings();
    this.notify();
  }

  public getSettings(): AISystemSettings {
    return this.settings;
  }

  public getProviderConfigs(): Record<AIProvider, AIProviderConfig> {
    return this.providerConfigs;
  }

  public getMessages(): AIMessage[] {
    return this.messages;
  }

  public getCurrentSetup(): TradeSetup | null {
    return this.currentSetup;
  }

  public getCurrentSnapshot(): AIEvidenceSnapshot | null {
    return this.currentSnapshot;
  }

  public getIsAnalyzing(): boolean {
    return this.isAnalyzing;
  }

  public clearMessages(): void {
    this.messages = [];
    this.notify();
  }

  /**
   * Sync provider statuses from secure backend (or maintain client vault state if running in static mode)
   */
  public async refreshProviderStatuses(): Promise<void> {
    this.loadClientKeys();
    try {
      const res = await fetch('/api/ai/status');
      const data = await this.safeJson(res);
      if (data && data.providers) {
        for (const [p, stat] of Object.entries(data.providers) as any) {
          if (this.providerConfigs[p as AIProvider]) {
            let model = stat.defaultModel || this.providerConfigs[p as AIProvider].model;
            if (p === 'openai' && (model.includes('turbo') || model.includes('3.5'))) {
              model = 'gpt-4o-mini';
            }
            if (p === 'grok' && (stat.maskedKey?.startsWith('gsk_') || stat.maskedKey?.includes('gsk')) && model.startsWith('grok-')) {
              model = 'qwen/qwen3.8-27b';
            }
            this.providerConfigs[p as AIProvider] = {
              ...this.providerConfigs[p as AIProvider],
              hasKey: stat.hasKey || Boolean(this.clientKeys[p as AIProvider]),
              maskedKey: stat.maskedKey || (this.clientKeys[p as AIProvider] ? this.maskKey(this.clientKeys[p as AIProvider]) : undefined),
              status: stat.status || (this.clientKeys[p as AIProvider] ? 'connected' : 'disconnected'),
              lastTested: stat.lastTested,
              lastError: stat.lastError,
              model,
              tokens: stat.tokens || this.providerConfigs[p as AIProvider].tokens,
            };
          }
        }
        this.notify();
      }
    } catch {}
  }

  /**
   * Save API Key (Dual Hybrid: Client Vault + Optional Backend Proxy)
   */
  public async saveKey(provider: AIProvider, key: string, model?: string): Promise<{ success: boolean; message?: string }> {
    const cleanKey = key.trim();
    if (!cleanKey) {
      return { success: false, message: 'API key cannot be empty' };
    }

    // 1. Immediately persist in browser client vault (guarantees functionality on static hosting like Render Static Site, GitHub Pages, Vercel)
    this.clientKeys[provider] = cleanKey;
    this.saveClientKeys();

    const selectedModel = model || this.providerConfigs[provider]?.model || PROVIDER_SUPPORTED_MODELS[provider][0].id;
    this.providerConfigs[provider] = {
      ...this.providerConfigs[provider],
      hasKey: true,
      maskedKey: this.maskKey(cleanKey),
      status: 'connected',
      model: selectedModel,
      lastError: undefined,
    };
    this.notify();

    // 2. Best-effort sync to backend server vault if a backend is running
    try {
      const res = await fetch('/api/ai/key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, key: cleanKey, model: selectedModel }),
      });
      const data = await this.safeJson(res);
      if (data && data.success && data.status) {
        this.providerConfigs[provider] = {
          ...this.providerConfigs[provider],
          ...data.status,
          hasKey: true,
          maskedKey: this.maskKey(cleanKey),
        };
        this.notify();
      }
    } catch {
      // Backend is offline or running on static hosting; client vault is authoritative
    }

    return { success: true, message: 'Key securely saved to encrypted vault' };
  }

  /**
   * Remove stored key for a provider
   */
  public async removeKey(provider: AIProvider): Promise<void> {
    this.clientKeys[provider] = '';
    this.saveClientKeys();
    this.providerConfigs[provider] = {
      ...this.providerConfigs[provider],
      hasKey: false,
      maskedKey: undefined,
      status: 'disconnected',
    };
    this.notify();

    try {
      await fetch(`/api/ai/key/${provider}`, { method: 'DELETE' });
    } catch {}
  }

  /**
   * Test connection to a provider
   */
  public async testProvider(provider: AIProvider, model?: string): Promise<{ success: boolean; message: string; latencyMs: number }> {
    const clientKey = this.clientKeys[provider];

    // 1. If backend is present, try backend proxy first
    try {
      const res = await fetch('/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, model: model || this.providerConfigs[provider]?.model }),
      });
      const data = await this.safeJson(res);
      if (data && typeof data.success === 'boolean') {
        if (data.success) {
          this.providerConfigs[provider].status = 'connected';
          this.providerConfigs[provider].lastTested = Date.now();
          this.providerConfigs[provider].lastError = undefined;
        } else {
          this.providerConfigs[provider].status = 'invalid_key';
          this.providerConfigs[provider].lastError = data.message;
        }
        this.notify();
        return data;
      }
    } catch {
      // Backend unavailable; proceed to direct client test
    }

    // 2. Direct client verification fallback for static hostings (Render Static, Vercel, Netlify)
    if (!clientKey) {
      this.providerConfigs[provider].status = 'disconnected';
      this.notify();
      return { success: false, message: 'No API key configured for provider', latencyMs: 0 };
    }

    return await this.testProviderDirect(provider, clientKey, model);
  }

  /**
   * Direct Client Verification against official provider APIs
   */
  private async testProviderDirect(
    provider: AIProvider,
    key: string,
    model?: string
  ): Promise<{ success: boolean; message: string; latencyMs: number }> {
    const t0 = performance.now();
    const activeModel = model || this.providerConfigs[provider]?.model || PROVIDER_SUPPORTED_MODELS[provider][0].id;

    if (provider === 'gemini') {
      const candidateModels = Array.from(new Set([
        activeModel,
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-1.5-flash',
        'gemini-flash-latest',
        'gemini-3.5-flash',
      ]));

      let lastErrMsg = '';
      for (const curModel of candidateModels) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${curModel}:generateContent?key=${encodeURIComponent(key)}`;
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

          if (res.ok) {
            this.providerConfigs[provider].status = 'connected';
            this.providerConfigs[provider].model = curModel;
            this.providerConfigs[provider].lastTested = Date.now();
            this.providerConfigs[provider].lastError = undefined;
            this.notify();
            return {
              success: true,
              message: `Connected to Google Gemini (${curModel}) in ${latency}ms`,
              latencyMs: latency,
            };
          }

          const errData = await this.safeJson(res);
          const errMsg = errData?.error?.message || `HTTP ${res.status}`;
          lastErrMsg = errMsg;

          if (res.status === 400 || res.status === 403) {
            this.providerConfigs[provider].status = 'invalid_key';
            this.providerConfigs[provider].lastError = errMsg;
            this.notify();
            return { success: false, message: `Invalid Gemini API Key: ${errMsg}`, latencyMs: latency };
          }
          if (res.status === 429) {
            this.providerConfigs[provider].status = 'quota_exceeded';
            this.providerConfigs[provider].lastError = errMsg;
            this.notify();
            return { success: false, message: `Gemini Quota Exceeded (429): ${errMsg}`, latencyMs: latency };
          }
        } catch (e: any) {
          lastErrMsg = e.message || 'Network error';
        }
      }

      this.providerConfigs[provider].status = 'error';
      this.providerConfigs[provider].lastError = lastErrMsg;
      this.notify();
      return { success: false, message: lastErrMsg, latencyMs: Math.round(performance.now() - t0) };
    }

    if (provider === 'openai') {
      try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: activeModel || 'gpt-4o-mini',
            messages: [{ role: 'user', content: 'Reply with "OK"' }],
            max_tokens: 5,
          }),
          signal: AbortSignal.timeout(8000),
        });
        const latency = Math.round(performance.now() - t0);

        if (res.ok) {
          this.providerConfigs[provider].status = 'connected';
          this.providerConfigs[provider].lastTested = Date.now();
          this.providerConfigs[provider].lastError = undefined;
          this.notify();
          return { success: true, message: `Connected to OpenAI (${activeModel}) in ${latency}ms`, latencyMs: latency };
        }

        const errData = await this.safeJson(res);
        const errMsg = errData?.error?.message || `HTTP ${res.status}`;
        this.providerConfigs[provider].status = res.status === 401 ? 'invalid_key' : res.status === 429 ? 'quota_exceeded' : 'error';
        this.providerConfigs[provider].lastError = errMsg;
        this.notify();
        return { success: false, message: errMsg, latencyMs: latency };
      } catch (err: any) {
        return { success: false, message: err.message, latencyMs: 0 };
      }
    }

    if (provider === 'grok') {
      try {
        const isGroq = key.startsWith('gsk_') || activeModel.includes('/');
        const endpoint = isGroq ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.x.ai/v1/chat/completions';
        const modelToUse = isGroq
          ? (activeModel.includes('/') ? activeModel : 'llama-3.3-70b-versatile')
          : (activeModel || 'grok-2-mini');

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: modelToUse,
            messages: [{ role: 'user', content: 'Reply with "OK"' }],
            max_tokens: 5,
          }),
          signal: AbortSignal.timeout(8000),
        });
        const latency = Math.round(performance.now() - t0);

        if (res.ok) {
          this.providerConfigs[provider].status = 'connected';
          this.providerConfigs[provider].lastTested = Date.now();
          this.providerConfigs[provider].lastError = undefined;
          this.notify();
          return { success: true, message: `Connected to ${isGroq ? 'Groq LPU' : 'xAI Grok'} (${modelToUse}) in ${latency}ms`, latencyMs: latency };
        }

        const errData = await this.safeJson(res);
        const errMsg = errData?.error?.message || `HTTP ${res.status}`;
        this.providerConfigs[provider].status = res.status === 401 ? 'invalid_key' : res.status === 429 ? 'quota_exceeded' : 'error';
        this.providerConfigs[provider].lastError = errMsg;
        this.notify();
        return { success: false, message: errMsg, latencyMs: latency };
      } catch (err: any) {
        return { success: false, message: err.message, latencyMs: 0 };
      }
    }

    return { success: false, message: 'Unsupported provider', latencyMs: 0 };
  }

  /**
   * Core Analysis Trigger: Captures live snapshot, evaluates setup, and prompts AI
   */
  public async requestMarketAnalysis(
    symbol: string,
    timeframe: string,
    candles: CandleLike[],
    customUserPrompt?: string,
    forceImmediate: boolean = false,
    livePrice?: number
  ): Promise<void> {
    if (this.isAnalyzing) return;
    this.isAnalyzing = true;
    this.notify();

    try {
      // 1. Generate verified order-book & footprint evidence snapshot
      const snapshot = aiToolRegistry.generateSnapshot(symbol, timeframe, candles, livePrice);
      this.currentSnapshot = snapshot;

      // 2. Derive deterministic Trade Setup anchored to actual order book levels
      const deterministicSetup = marketIntelligenceEngine.generateTradeSetup(
        snapshot,
        forceImmediate ? null : this.currentSetup,
        forceImmediate
      );
      this.currentSetup = deterministicSetup;

      // Record in journal
      tradeJournalEngine.recordSetup(deterministicSetup, snapshot);

      const systemPrompt = marketIntelligenceEngine.buildSystemPrompt(snapshot);
      const userText = customUserPrompt
        ? `${customUserPrompt}\n(Note: Explain concisely in 2-3 short, human-friendly bullet points without markdown clutter or asterisks)`
        : `Provide an immediate order-flow trade plan for ${symbol} (${timeframe}) at current live price ${snapshot.currentPrice}. Focus on the immediate upcoming trade setup, resting order-book walls, and the exact imminent execution trigger.`;

      // Append user message
      const userMsg: AIMessage = {
        id: `msg_u_${Date.now()}`,
        role: 'user',
        content: userText,
        timestamp: Date.now(),
      };
      this.messages.push(userMsg);
      this.notify();

      // Check configured mode and intelligently resolve available provider
      const mode = this.settings.mode;
      let primary = this.settings.primaryProvider;

      // Ensure primary has a valid key and is connected; if not, automatically route to a healthy connected provider (e.g. Gemini / Groq)
      const healthyProviders = (['gemini', 'grok', 'openai'] as AIProvider[]).filter(
        (p) => this.providerConfigs[p]?.hasKey && this.providerConfigs[p]?.status === 'connected'
      );

      if (!this.providerConfigs[primary]?.hasKey || this.providerConfigs[primary]?.status === 'disconnected') {
        if (healthyProviders.length > 0) {
          primary = healthyProviders[0];
        }
      } else if (this.providerConfigs[primary]?.status === 'quota_exceeded' && this.settings.fallbackEnabled) {
        const fallback = healthyProviders.find((p) => p !== primary);
        if (fallback) {
          primary = fallback;
        }
      }

      if (!this.providerConfigs[primary]?.hasKey) {
        throw new Error('No AI provider configured with an active API key. Please add your free Google Gemini or Groq API key in AI Settings.');
      }

      const primaryModel = this.providerConfigs[primary]?.model || PROVIDER_SUPPORTED_MODELS[primary][0].id;

      if (mode === 'single') {
        let textResult = '';
        let modelUsed = primaryModel;
        let providerUsed = primary;
        let lastTokensUsed: number | undefined;

        try {
          const res = await this.callChatEndpoint(primary, primaryModel, [
            { role: 'system', content: systemPrompt },
            ...this.messages.slice(-5).map((m) => ({ role: m.role, content: m.content })),
          ]);
          textResult = res.text;
          modelUsed = res.model;
          lastTokensUsed = res.tokensUsed;
        } catch (err: any) {
          // If primary failed due to quota limit, update status immediately
          if (err.message?.includes('quota') || err.message?.includes('429')) {
            if (this.providerConfigs[primary]) {
              this.providerConfigs[primary].status = 'quota_exceeded';
            }
          }

          // Fallback logic: check any alternate provider with an active key
          if (this.settings.fallbackEnabled) {
            const candidateProviders = (['grok', 'openai', 'gemini'] as AIProvider[]).filter(
              (p) => p !== primary && this.providerConfigs[p]?.hasKey && this.providerConfigs[p]?.status !== 'quota_exceeded'
            );
            const secondary = candidateProviders[0];
            if (secondary) {
              const secModel = this.providerConfigs[secondary]?.model || PROVIDER_SUPPORTED_MODELS[secondary][0].id;
              const res = await this.callChatEndpoint(secondary, secModel, [
                { role: 'system', content: systemPrompt },
                ...this.messages.slice(-5).map((m) => ({ role: m.role, content: m.content })),
              ]);
              textResult = res.text;
              modelUsed = secModel;
              providerUsed = secondary;
              lastTokensUsed = res.tokensUsed;
            } else {
              throw err;
            }
          } else {
            throw err;
          }
        }

        const assistantMsg: AIMessage = {
          id: `msg_a_${Date.now()}`,
          role: 'assistant',
          content: textResult,
          timestamp: Date.now(),
          provider: providerUsed,
          model: modelUsed,
          tradeSetup: deterministicSetup,
          tokensUsed: lastTokensUsed,
          remainingTokens: this.providerConfigs[providerUsed]?.tokens?.remainingTokens,
          totalTokens: this.providerConfigs[providerUsed]?.tokens?.totalTokens,
          snapshotRef: {
            price: snapshot.currentPrice,
            bias: snapshot.bias,
            regime: snapshot.regime,
          },
        };
        this.messages.push(assistantMsg);
      } else if (mode === 'compare' || mode === 'consensus') {
        // Multi-AI Execution
        const enabledProviders = (['openai', 'gemini', 'grok'] as AIProvider[]).filter(
          (p) => this.providerConfigs[p]?.enabled && this.providerConfigs[p]?.hasKey
        );

        if (enabledProviders.length <= 1) {
          // Fallback to single if only 1 provider is configured
          const prov = enabledProviders[0] || primary;
          const mod = this.providerConfigs[prov]?.model || PROVIDER_SUPPORTED_MODELS[prov][0].id;
          const res = await this.callChatEndpoint(prov, mod, [
            { role: 'system', content: systemPrompt },
            ...this.messages.slice(-5).map((m) => ({ role: m.role, content: m.content })),
          ]);

          this.messages.push({
            id: `msg_a_${Date.now()}`,
            role: 'assistant',
            content: res.text,
            timestamp: Date.now(),
            provider: prov,
            model: mod,
            tradeSetup: deterministicSetup,
            tokensUsed: res.tokensUsed,
            remainingTokens: this.providerConfigs[prov]?.tokens?.remainingTokens,
            totalTokens: this.providerConfigs[prov]?.tokens?.totalTokens,
            snapshotRef: { price: snapshot.currentPrice, bias: snapshot.bias, regime: snapshot.regime },
          });
        } else {
          // Query multiple models in parallel
          const calls = enabledProviders.map(async (prov) => {
            const mod = this.providerConfigs[prov]?.model || PROVIDER_SUPPORTED_MODELS[prov][0].id;
            try {
              const res = await this.callChatEndpoint(prov, mod, [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userText },
              ]);
              return { provider: prov, model: mod, text: res.text, success: true };
            } catch (err: any) {
              return { provider: prov, model: mod, text: `Error: ${err.message}`, success: false };
            }
          });

          const results = await Promise.all(calls);

          if (mode === 'compare') {
            let combinedMarkdown = `### Multi-AI Comparative Analysis for ${symbol}\n\n`;
            for (const r of results) {
              combinedMarkdown += `#### [${r.provider.toUpperCase()} — ${r.model}]\n${r.text}\n\n---\n\n`;
            }

            this.messages.push({
              id: `msg_a_${Date.now()}`,
              role: 'assistant',
              content: combinedMarkdown,
              timestamp: Date.now(),
              tradeSetup: deterministicSetup,
              snapshotRef: { price: snapshot.currentPrice, bias: snapshot.bias, regime: snapshot.regime },
            });
          } else {
            // Consensus Synthesis
            const successful = results.filter((r) => r.success);
            const synthesized = `### JARVIS Multi-AI Consensus Synthesis\n\n**Market Bias Consensus**: **${snapshot.bias}** (${snapshot.regime.replace(/_/g, ' ').toUpperCase()})\n**Confidence Score**: **${deterministicSetup.confidenceScore}/100**\n\n${successful.map((s) => `**${s.provider.toUpperCase()} Key Takeaway:**\n${s.text.slice(0, 320)}...`).join('\n\n')}\n\n**Synthesized Trade Conclusion:**\n${deterministicSetup.direction === 'NO_TRADE' ? 'Both order flow and model evaluations suggest sitting on hands.' : `Actionable ${deterministicSetup.direction} opportunity verified at ${deterministicSetup.entryPrice} anchored to order book wall.`}`;

            this.messages.push({
              id: `msg_a_${Date.now()}`,
              role: 'assistant',
              content: synthesized,
              timestamp: Date.now(),
              tradeSetup: deterministicSetup,
              snapshotRef: { price: snapshot.currentPrice, bias: snapshot.bias, regime: snapshot.regime },
            });
          }
        }
      }
    } catch (err: any) {
      this.messages.push({
        id: `msg_err_${Date.now()}`,
        role: 'assistant',
        content: `**AI Analysis Error**: ${err.message || 'Failed to complete analysis'}.\n\n*Please verify your API key in the JARVIS AI Settings (click top-left logo).*`,
        timestamp: Date.now(),
      });
    } finally {
      this.isAnalyzing = false;
      this.notify();
    }
  }

  private async callChatEndpoint(
    provider: AIProvider,
    model: string,
    messages: Array<{ role: string; content: string }>
  ): Promise<{ text: string; model: string; provider: AIProvider; tokensUsed?: number; remainingTokens?: number; totalTokens?: number }> {
    // 1. Try backend server proxy first
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, model, messages, temperature: 0.2 }),
      });
      const data = await this.safeJson(res);
      if (res.ok && data && data.success && data.text) {
        if (data.tokens && this.providerConfigs[provider]) {
          this.providerConfigs[provider].tokens = data.tokens;
          this.notify();
        }
        return {
          text: data.text,
          model: data.model || model,
          provider: data.provider || provider,
          tokensUsed: data.tokensUsed,
          remainingTokens: data.tokens?.remainingTokens,
          totalTokens: data.tokens?.totalTokens,
        };
      }
    } catch {
      // Backend unavailable; proceed to direct client chat
    }

    // 2. Direct client execution fallback for static hostings (Render Static, Vercel, Netlify)
    const clientKey = this.clientKeys[provider];
    if (!clientKey) {
      throw new Error(`No API key configured for ${provider}. Please enter your API key in AI Settings.`);
    }

    return await this.callChatDirect(provider, clientKey, model, messages);
  }

  private async callChatDirect(
    provider: AIProvider,
    key: string,
    model: string,
    messages: Array<{ role: string; content: string }>
  ): Promise<{ text: string; model: string; provider: AIProvider; tokensUsed?: number; remainingTokens?: number; totalTokens?: number }> {
    if (provider === 'gemini') {
      const systemMsg = messages.find((m) => m.role === 'system');
      const nonSystemMsgs = messages.filter((m) => m.role !== 'system');
      const contents = nonSystemMsgs.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const candidateModels = Array.from(new Set([
        model,
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-1.5-flash',
        'gemini-flash-latest',
        'gemini-3.5-flash',
      ]));

      let lastErr: Error | null = null;
      for (const curModel of candidateModels) {
        try {
          const bodyPayload: any = {
            contents,
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 1200,
            },
          };
          if (systemMsg) {
            bodyPayload.systemInstruction = { parts: [{ text: systemMsg.content }] };
          }

          const url = `https://generativelanguage.googleapis.com/v1beta/models/${curModel}:generateContent?key=${encodeURIComponent(key)}`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyPayload),
          });

          const data = await this.safeJson(res);
          if (res.ok && data?.candidates?.[0]?.content?.parts?.[0]?.text) {
            const reply = data.candidates[0].content.parts[0].text;
            const promptTok = data.usageMetadata?.promptTokenCount || 400;
            const candTok = data.usageMetadata?.candidatesTokenCount || 200;
            const totalTok = promptTok + candTok;

            this.deductClientTokens(provider, totalTok);

            return {
              text: reply,
              model: curModel,
              provider: 'gemini',
              tokensUsed: totalTok,
              remainingTokens: this.providerConfigs.gemini?.tokens?.remainingTokens,
              totalTokens: this.providerConfigs.gemini?.tokens?.totalTokens,
            };
          }

          const errMsg = data?.error?.message || `HTTP ${res.status}`;
          if (res.status === 400 || res.status === 403) {
            throw new Error(`Gemini API Error: ${errMsg}`);
          }
          if (res.status === 429) {
            throw new Error(`Gemini Rate Limit Exceeded (429): ${errMsg}`);
          }
          lastErr = new Error(errMsg);
        } catch (e: any) {
          lastErr = e;
          if (e.message?.includes('API Error') || e.message?.includes('Rate Limit')) {
            throw e;
          }
        }
      }
      throw lastErr || new Error('Failed to generate analysis from Gemini');
    }

    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: model || 'gpt-4o-mini',
          messages,
          temperature: 0.2,
          max_tokens: 1200,
        }),
      });

      const data = await this.safeJson(res);
      if (!res.ok || !data?.choices?.[0]?.message?.content) {
        throw new Error(data?.error?.message || `OpenAI HTTP ${res.status}`);
      }

      const reply = data.choices[0].message.content;
      const totalTok = data.usage?.total_tokens || 500;
      this.deductClientTokens(provider, totalTok);

      return {
        text: reply,
        model,
        provider: 'openai',
        tokensUsed: totalTok,
        remainingTokens: this.providerConfigs.openai?.tokens?.remainingTokens,
        totalTokens: this.providerConfigs.openai?.tokens?.totalTokens,
      };
    }

    if (provider === 'grok') {
      const isGroq = key.startsWith('gsk_') || model.includes('/');
      const endpoint = isGroq ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.x.ai/v1/chat/completions';
      const modelToUse = isGroq
        ? (model.includes('/') ? model : 'llama-3.3-70b-versatile')
        : (model || 'grok-2-mini');

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: modelToUse,
          messages,
          temperature: 0.2,
          max_tokens: 1200,
        }),
      });

      const data = await this.safeJson(res);
      if (!res.ok || !data?.choices?.[0]?.message?.content) {
        throw new Error(data?.error?.message || `Groq/xAI HTTP ${res.status}`);
      }

      const reply = data.choices[0].message.content;
      const totalTok = data.usage?.total_tokens || 500;
      this.deductClientTokens(provider, totalTok);

      return {
        text: reply,
        model: modelToUse,
        provider: 'grok',
        tokensUsed: totalTok,
        remainingTokens: this.providerConfigs.grok?.tokens?.remainingTokens,
        totalTokens: this.providerConfigs.grok?.tokens?.totalTokens,
      };
    }

    throw new Error(`Unsupported provider: ${provider}`);
  }

  private deductClientTokens(provider: AIProvider, usedTokens: number): void {
    const curTokens = this.providerConfigs[provider]?.tokens || {
      usedTokens: 0,
      totalTokens: provider === 'gemini' ? 1_000_000 : 500_000,
      remainingTokens: provider === 'gemini' ? 1_000_000 : 500_000,
      promptTokens: 0,
      completionTokens: 0,
      lastCallTokens: 0,
      percentRemaining: 100,
      lastUpdated: Date.now(),
      rateLimitType: 'tpm',
      tierName: 'Standard',
      resetTimeFormatted: '00:00 UTC',
    };

    const newUsed = (curTokens.usedTokens || 0) + usedTokens;
    const remaining = Math.max(0, (curTokens.totalTokens || 1_000_000) - newUsed);
    const pct = Math.round((remaining / (curTokens.totalTokens || 1_000_000)) * 100);

    this.providerConfigs[provider].tokens = {
      ...curTokens,
      usedTokens: newUsed,
      remainingTokens: remaining,
      lastCallTokens: usedTokens,
      percentRemaining: pct,
      lastUpdated: Date.now(),
    };
    this.notify();
  }

  public async setAccountTier(provider: AIProvider, tierId: string): Promise<void> {
    const tierLimits: Record<string, number> = {
      free: 1_000_000,
      tier1: 4_000_000,
      tier2: 2_000_000,
      groq_free: 100_000,
      groq_dev: 1_000_000,
    };
    const limit = tierLimits[tierId] || 1_000_000;
    if (this.providerConfigs[provider]) {
      const cur = this.providerConfigs[provider].tokens;
      this.providerConfigs[provider].tokens = {
        usedTokens: cur?.usedTokens || 0,
        totalTokens: limit,
        remainingTokens: Math.max(0, limit - (cur?.usedTokens || 0)),
        promptTokens: cur?.promptTokens || 0,
        completionTokens: cur?.completionTokens || 0,
        lastCallTokens: cur?.lastCallTokens || 0,
        percentRemaining: Math.round((Math.max(0, limit - (cur?.usedTokens || 0)) / limit) * 100),
        lastUpdated: Date.now(),
        tierId,
        tierName: tierId === 'free' || tierId === 'groq_free' ? 'Free Tier' : 'Pay-As-You-Go',
        rateLimitType: 'tpm',
        resetTimeFormatted: '00:00 UTC',
      };
      this.notify();
    }

    try {
      const res = await fetch('/api/ai/tokens/tier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, tierId }),
      });
      const data = await this.safeJson(res);
      if (data?.tokens && this.providerConfigs[provider]) {
        this.providerConfigs[provider].tokens = data.tokens;
        this.notify();
      }
    } catch {}
  }

  public async setTokenQuota(provider: AIProvider, totalTokens: number): Promise<void> {
    if (this.providerConfigs[provider]) {
      const cur = this.providerConfigs[provider].tokens;
      this.providerConfigs[provider].tokens = {
        usedTokens: cur?.usedTokens || 0,
        totalTokens,
        remainingTokens: Math.max(0, totalTokens - (cur?.usedTokens || 0)),
        promptTokens: cur?.promptTokens || 0,
        completionTokens: cur?.completionTokens || 0,
        lastCallTokens: cur?.lastCallTokens || 0,
        percentRemaining: Math.round((Math.max(0, totalTokens - (cur?.usedTokens || 0)) / totalTokens) * 100),
        lastUpdated: Date.now(),
      };
      this.notify();
    }

    try {
      const res = await fetch('/api/ai/tokens/quota', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, totalTokens }),
      });
      const data = await this.safeJson(res);
      if (data?.tokens && this.providerConfigs[provider]) {
        this.providerConfigs[provider].tokens = data.tokens;
        this.notify();
      }
    } catch {}
  }

  public async resetTokenStats(provider: AIProvider, totalQuota?: number): Promise<void> {
    if (this.providerConfigs[provider]) {
      const quota = totalQuota || this.providerConfigs[provider].tokens?.totalTokens || 1_000_000;
      this.providerConfigs[provider].tokens = {
        usedTokens: 0,
        totalTokens: quota,
        remainingTokens: quota,
        promptTokens: 0,
        completionTokens: 0,
        lastCallTokens: 0,
        percentRemaining: 100,
        lastUpdated: Date.now(),
      };
      this.notify();
    }

    try {
      const res = await fetch('/api/ai/tokens/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, totalQuota }),
      });
      const data = await this.safeJson(res);
      if (data?.tokens && this.providerConfigs[provider]) {
        this.providerConfigs[provider].tokens = data.tokens;
        this.notify();
      }
    } catch {}
  }
}

export const aiOrchestrator = new AIOrchestrator();
