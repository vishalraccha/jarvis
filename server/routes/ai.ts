/**
 * JARVIS Multi-AI Router
 * Secure backend endpoints for provider keys, test connectivity, chat proxying,
 * multi-model comparison, and macro news.
 */

import { Router, Request, Response } from 'express';
import { aiKeyManager, AIProviderId } from '../services/ai/AIKeyManager.js';
import { externalResearchService } from '../services/ai/ExternalResearchService.js';

export const aiRouter = Router();

/**
 * GET /api/ai/status
 * Returns masked keys, active models, and connectivity state for all 3 providers
 */
aiRouter.get('/status', (_req: Request, res: Response) => {
  try {
    const statuses = aiKeyManager.getAllStatuses();
    res.json({
      status: 'ok',
      providers: statuses,
      timestamp: Date.now(),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve AI status', message: err.message });
  }
});

/**
 * POST /api/ai/key
 * Saves or updates an API key for a provider (OpenAI, Gemini, Grok)
 */
aiRouter.post('/key', (req: Request, res: Response) => {
  try {
    const { provider, key, model } = req.body;
    if (!provider || !['openai', 'gemini', 'grok'].includes(provider)) {
      res.status(400).json({ error: 'Invalid provider. Must be openai, gemini, or grok.' });
      return;
    }

    if (typeof key !== 'string') {
      res.status(400).json({ error: 'API key must be a string' });
      return;
    }

    aiKeyManager.setKey(provider as AIProviderId, key, model);
    res.json({
      success: true,
      provider,
      status: aiKeyManager.getStatus(provider as AIProviderId),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to save key', message: err.message });
  }
});

/**
 * DELETE /api/ai/key/:provider
 * Removes stored key for a provider
 */
aiRouter.delete('/key/:provider', (req: Request, res: Response) => {
  try {
    const provider = req.params.provider as AIProviderId;
    if (!['openai', 'gemini', 'grok'].includes(provider)) {
      res.status(400).json({ error: 'Invalid provider' });
      return;
    }

    aiKeyManager.removeKey(provider);
    res.json({ success: true, provider, status: aiKeyManager.getStatus(provider) });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to remove key', message: err.message });
  }
});

/**
 * POST /api/ai/test
 * Tests connectivity to a provider model
 */
aiRouter.post('/test', async (req: Request, res: Response) => {
  try {
    const { provider, model } = req.body;
    if (!provider || !['openai', 'gemini', 'grok'].includes(provider)) {
      res.status(400).json({ error: 'Invalid provider' });
      return;
    }

    const result = await aiKeyManager.testProvider(provider as AIProviderId, model);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, latencyMs: 0 });
  }
});

/**
 * POST /api/ai/chat
 * Primary chat endpoint proxying to the configured AI model with market snapshot
 */
aiRouter.post('/chat', async (req: Request, res: Response) => {
  try {
    const { provider, model, messages, temperature } = req.body;
    if (!provider || !['openai', 'gemini', 'grok'].includes(provider)) {
      res.status(400).json({ error: 'Invalid or missing provider' });
      return;
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'Messages array is required' });
      return;
    }

    const response = await aiKeyManager.executeChat(
      provider as AIProviderId,
      model || (provider === 'gemini' ? 'gemini-3.8-flash' : provider === 'openai' ? 'gpt-4o-mini' : 'grok-2-mini'),
      messages,
      typeof temperature === 'number' ? temperature : 0.2
    );

    res.json({
      success: true,
      ...response,
      timestamp: Date.now(),
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || 'AI chat execution failed',
    });
  }
});

/**
 * GET /api/ai/news
 * Returns macro intelligence headlines
 */
aiRouter.get('/news', async (req: Request, res: Response) => {
  try {
    const symbol = (req.query.symbol as string) || 'XAUUSD';
    const news = await externalResearchService.getMacroIntelligence(symbol);
    res.json({
      status: 'ok',
      news,
      timestamp: Date.now(),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch macro intelligence', message: err.message });
  }
});
