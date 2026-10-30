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
  AIConsensusResult,
  AIAnalysisResponse,
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

  constructor() {
    this.loadSettings();
    this.refreshProviderStatuses();
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
   * Sync provider statuses from secure backend
   */
  public async refreshProviderStatuses(): Promise<void> {
    try {
      const res = await fetch('/api/ai/status');
      if (res.ok) {
        const data = await res.json();
        if (data.providers) {
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
                hasKey: stat.hasKey,
                maskedKey: stat.maskedKey,
                status: stat.status,
                lastTested: stat.lastTested,
                lastError: stat.lastError,
                model,
              };
            }
          }
          this.notify();
        }
      }
    } catch {}
  }

  /**
   * Save API Key to backend
   */
  public async saveKey(provider: AIProvider, key: string, model?: string): Promise<{ success: boolean; message?: string }> {
    try {
      const res = await fetch('/api/ai/key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, key, model }),
      });
      const data = await res.json();
      if (res.ok) {
        await this.refreshProviderStatuses();
        return { success: true };
      }
      return { success: false, message: data.error || 'Failed to save key' };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  /**
   * Test connection to a provider
   */
  public async testProvider(provider: AIProvider, model?: string): Promise<{ success: boolean; message: string; latencyMs: number }> {
    try {
      const res = await fetch('/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, model }),
      });
      const data = await res.json();
      await this.refreshProviderStatuses();
      return data;
    } catch (err: any) {
      return { success: false, message: err.message, latencyMs: 0 };
    }
  }

  /**
   * Core Analysis Trigger: Captures live snapshot, evaluates setup, and prompts AI
   */
  public async requestMarketAnalysis(
    symbol: string,
    timeframe: string,
    candles: CandleLike[],
    customUserPrompt?: string
  ): Promise<void> {
    if (this.isAnalyzing) return;
    this.isAnalyzing = true;
    this.notify();

    try {
      // 1. Generate verified order-book & footprint evidence snapshot
      const snapshot = aiToolRegistry.generateSnapshot(symbol, timeframe, candles);
      this.currentSnapshot = snapshot;

      // 2. Derive deterministic Trade Setup anchored to actual order book levels
      const deterministicSetup = marketIntelligenceEngine.generateTradeSetup(snapshot, this.currentSetup);
      this.currentSetup = deterministicSetup;

      // Record in journal
      tradeJournalEngine.recordSetup(deterministicSetup, snapshot);

      const systemPrompt = marketIntelligenceEngine.buildSystemPrompt(snapshot);
      const userText = customUserPrompt
        ? `${customUserPrompt}\n(Note: Explain concisely in 2-3 short, human-friendly bullet points without markdown clutter or asterisks)`
        : `Provide a short, direct order-flow analysis of ${symbol} (${timeframe}). Focus on resting order-book walls, absorption, and the exact trade plan.`;

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

      // Smart Failover: If current primary is quota-exceeded or has no key, auto-switch to a healthy connected provider (e.g. Groq)
      if (
        (this.providerConfigs[primary]?.status === 'quota_exceeded' || !this.providerConfigs[primary]?.hasKey) &&
        this.settings.fallbackEnabled
      ) {
        const healthy = (['grok', 'openai', 'gemini'] as AIProvider[]).find(
          (p) => this.providerConfigs[p]?.hasKey && this.providerConfigs[p]?.status === 'connected'
        );
        if (healthy) {
          primary = healthy;
        }
      }

      const primaryModel = this.providerConfigs[primary]?.model || PROVIDER_SUPPORTED_MODELS[primary][0].id;

      if (mode === 'single') {
        let textResult = '';
        let modelUsed = primaryModel;
        let providerUsed = primary;

        try {
          const res = await this.callChatEndpoint(primary, primaryModel, [
            { role: 'system', content: systemPrompt },
            ...this.messages.slice(-5).map((m) => ({ role: m.role, content: m.content })),
          ]);
          textResult = res.text;
          modelUsed = res.model;
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
  ): Promise<{ text: string; model: string; provider: AIProvider }> {
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, model, messages, temperature: 0.2 }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    return {
      text: data.text,
      model: data.model,
      provider: data.provider,
    };
  }
}

export const aiOrchestrator = new AIOrchestrator();
