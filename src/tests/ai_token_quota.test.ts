/**
 * JARVIS AI Token Tracking & Quota Protection Tests
 * Validates real-time token deduction, remaining token calculations,
 * quota adjustments, counter resets, and quota exhaustion safeguards.
 */

import { describe, it, expect, afterAll, vi } from 'vitest';
import { aiKeyManager } from '../../server/services/ai/AIKeyManager';
import { AIOrchestrator } from '../services/ai/AIOrchestrator';

describe('JARVIS AI Token Quota & Tracking Engine', () => {
  it('initializes default token quotas for all providers', () => {
    const geminiStats = aiKeyManager.getTokenStats('gemini');
    const grokStats = aiKeyManager.getTokenStats('grok');
    const openaiStats = aiKeyManager.getTokenStats('openai');

    expect(geminiStats.totalTokens).toBeGreaterThanOrEqual(500000);
    expect(grokStats.totalTokens).toBeGreaterThanOrEqual(100000);
    expect(openaiStats.totalTokens).toBeGreaterThanOrEqual(200000);
    expect(geminiStats.remainingTokens).toBeLessThanOrEqual(geminiStats.totalTokens);
    expect(geminiStats.percentRemaining).toBeGreaterThanOrEqual(0);
    expect(geminiStats.percentRemaining).toBeLessThanOrEqual(100);
  });

  it('allows dynamically setting quota and updates remaining percentage', () => {
    aiKeyManager.setTokenQuota('gemini', 2000000);
    const stats = aiKeyManager.getTokenStats('gemini');
    expect(stats.totalTokens).toBe(2000000);
    expect(stats.remainingTokens).toBe(2000000 - stats.usedTokens);
    expect(stats.percentRemaining).toBe(Math.round(((2000000 - stats.usedTokens) / 2000000) * 1000) / 10);
  });

  it('records token usage and deducts remaining tokens accurately', () => {
    aiKeyManager.setKey('openai', 'sk-test-mock-tracking-key-vault');
    aiKeyManager.resetTokenStats('openai', 500000);
    const initialStats = aiKeyManager.getTokenStats('openai');
    expect(initialStats.usedTokens).toBe(0);
    expect(initialStats.remainingTokens).toBe(500000);
    expect(initialStats.percentRemaining).toBe(100);

    // Simulate usage of 15,000 tokens
    const updatedStats = aiKeyManager.recordTokenUsage('openai', 10000, 5000);
    expect(updatedStats.usedTokens).toBe(15000);
    expect(updatedStats.remainingTokens).toBe(485000);
    expect(updatedStats.lastCallTokens).toBe(15000);
    expect(updatedStats.promptTokens).toBe(10000);
    expect(updatedStats.completionTokens).toBe(5000);
    expect(updatedStats.percentRemaining).toBe(97);
  });

  it('marks provider as exhausted when remaining tokens drop to zero', () => {
    aiKeyManager.setTokenQuota('grok', 10000);
    aiKeyManager.recordTokenUsage('grok', 8000, 3000); // 11,000 used, exceeding 10,000
    const stats = aiKeyManager.getTokenStats('grok');
    expect(stats.remainingTokens).toBe(0);
    expect(stats.percentRemaining).toBe(0);

    const providerStatus = aiKeyManager.getStatus('grok');
    expect(providerStatus.tokens.remainingTokens).toBe(0);
    expect(providerStatus.tokens.percentRemaining).toBe(0);
  });

  it('resets token counters back to full quota upon reset request', () => {
    aiKeyManager.resetTokenStats('grok', 500000);
    const stats = aiKeyManager.getTokenStats('grok');
    expect(stats.usedTokens).toBe(0);
    expect(stats.totalTokens).toBe(500000);
    expect(stats.remainingTokens).toBe(500000);
    expect(stats.percentRemaining).toBe(100);
  });

  it('configures true provider account tiers and provides auto-reset schedule', () => {
    // Configure Gemini Pay-as-you-go Tier 1 (4M TPM)
    const geminiTier = aiKeyManager.setAccountTier('gemini', 'tier1');
    expect(geminiTier.totalTokens).toBe(4000000);
    expect(geminiTier.tierId).toBe('tier1');
    expect(geminiTier.rateLimitType).toBe('tpm');
    expect(geminiTier.resetTimeFormatted).toContain('00:00 UTC');

    // Configure Groq Free Tier (100K TPD daily)
    const groqTier = aiKeyManager.setAccountTier('grok', 'groq_free');
    expect(groqTier.totalTokens).toBe(100000);
    expect(groqTier.rateLimitType).toBe('tpd');
  });

  it('handles Render Static Site empty 200 response when saving key without throwing JSON error', async () => {
    const origFetch = global.fetch;
    // Mock fetch returning empty body (Render Static Site behavior)
    global.fetch = vi.fn().mockResolvedValue(new Response('', { status: 200, headers: { 'content-length': '0' } }));

    const orchestrator = new AIOrchestrator();
    const res = await orchestrator.saveKey('gemini', 'AIzaSyMockTestKey123456');

    expect(res.success).toBe(true);
    expect(orchestrator.getProviderConfigs().gemini.hasKey).toBe(true);
    expect(orchestrator.getProviderConfigs().gemini.status).toBe('connected');

    global.fetch = origFetch;
  });

  it('clears key from vault when removeKey is called', async () => {
    const origFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue(new Response('', { status: 200 }));

    const orchestrator = new AIOrchestrator();
    await orchestrator.removeKey('gemini');

    expect(orchestrator.getProviderConfigs().gemini.hasKey).toBe(false);
    expect(orchestrator.getProviderConfigs().gemini.status).toBe('disconnected');

    global.fetch = origFetch;
  });

  afterAll(() => {
    aiKeyManager.removeKey('openai');
    aiKeyManager.resetTokenStats('grok', 500000);
  });
});
