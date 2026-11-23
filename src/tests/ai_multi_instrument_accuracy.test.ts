import { describe, it, expect, beforeEach } from 'vitest';
import { aiOrchestrator } from '../services/ai/AIOrchestrator';
import { aiToolRegistry } from '../services/ai/AIToolRegistry';
import { marketIntelligenceEngine } from '../services/ai/MarketIntelligenceEngine';
import { InstrumentIdentityService } from '../services/market/InstrumentIdentity';
import { isPricePlausibleForSymbol } from '../utils/priceSanity';
import { DeltaProfileEngine } from '../services/deltaProfile/DeltaProfileEngine';

describe('JARVIS Multi-Instrument AI Intelligence & Price Scale Authenticity Suite', () => {
  beforeEach(() => {
    aiOrchestrator.clearMessages();
  });

  it('1. Correctly anchors NAS100 trade setups to authentic Nasdaq 100 price scale (~26,800)', () => {
    const symbol = 'NAS100';
    const livePrice = 26837.5;
    const candles = [
      { time: 1795451580, open: 26800.0, high: 26840.0, low: 26790.0, close: 26820.0, volume: 500 },
      { time: 1795451640, open: 26820.0, high: 26850.0, low: 26815.0, close: 26837.5, volume: 520 },
    ];

    const snapshot = aiToolRegistry.generateSnapshot(symbol, '1m', candles, livePrice);
    expect(snapshot.instrument).toBe('NAS100');
    expect(snapshot.currentPrice).toBe(26837.5);
    // ATR should scale naturally with the instrument and never be hard-clamped to 10
    expect(snapshot.atr).toBeGreaterThan(15);

    const setup = marketIntelligenceEngine.generateTradeSetup(snapshot);
    expect(setup.instrument).toBe('NAS100');
    // Entry price, SL, and TP must be around 26.8k, NEVER ~15k
    expect(setup.entryPrice).toBeGreaterThan(26000);
    expect(setup.entryPrice).toBeLessThan(28000);
    expect(setup.stopLoss).toBeGreaterThan(26000);
    expect(setup.takeProfit1).toBeGreaterThan(26000);
  });

  it('2. Correctly anchors Gold (XAUUSD) trade setups to Spot Gold price scale (~3,670)', () => {
    const symbol = 'XAUUSD';
    const livePrice = 3675.50;
    const candles = [
      { time: 1795451580, open: 3672.0, high: 3676.0, low: 3671.0, close: 3674.0, volume: 150 },
      { time: 1795451640, open: 3674.0, high: 3677.0, low: 3673.0, close: 3675.50, volume: 180 },
    ];

    const snapshot = aiToolRegistry.generateSnapshot(symbol, '1m', candles, livePrice);
    expect(snapshot.instrument).toBe('XAUUSD');
    expect(snapshot.currentPrice).toBe(3675.5);

    const setup = marketIntelligenceEngine.generateTradeSetup(snapshot);
    expect(setup.instrument).toBe('XAUUSD');
    expect(setup.entryPrice).toBeGreaterThan(3600);
    expect(setup.entryPrice).toBeLessThan(3800);
    expect(setup.stopLoss).toBeGreaterThan(3600);
    expect(setup.takeProfit1).toBeGreaterThan(3600);
  });

  it('3. Correctly anchors Bitcoin (BTCUSDT) trade setups to crypto price scale (~90,000)', () => {
    const symbol = 'BTCUSDT';
    const livePrice = 91450.0;
    const candles = [
      { time: 1795451580, open: 91200.0, high: 91500.0, low: 91100.0, close: 91400.0, volume: 25 },
      { time: 1795451640, open: 91400.0, high: 91600.0, low: 91350.0, close: 91450.0, volume: 30 },
    ];

    const snapshot = aiToolRegistry.generateSnapshot(symbol, '1m', candles, livePrice);
    expect(snapshot.instrument).toBe('BTCUSDT');
    expect(snapshot.currentPrice).toBe(91450.0);
    expect(snapshot.atr).toBeGreaterThan(50);

    const setup = marketIntelligenceEngine.generateTradeSetup(snapshot);
    expect(setup.instrument).toBe('BTCUSDT');
    expect(setup.entryPrice).toBeGreaterThan(90000);
    expect(setup.stopLoss).toBeGreaterThan(88000);
    expect(setup.takeProfit1).toBeGreaterThan(90000);
  });

  it('4. Correctly respects 5-decimal precision for Forex (EURUSD)', () => {
    const symbol = 'EURUSD';
    const livePrice = 1.05425;
    const candles = [
      { time: 1795451580, open: 1.05400, high: 1.05440, low: 1.05390, close: 1.05420, volume: 100 },
      { time: 1795451640, open: 1.05420, high: 1.05450, low: 1.05410, close: 1.05425, volume: 120 },
    ];

    const snapshot = aiToolRegistry.generateSnapshot(symbol, '1m', candles, livePrice);
    expect(snapshot.instrument).toBe('EURUSD');
    expect(snapshot.currentPrice).toBe(1.05425);

    const setup = marketIntelligenceEngine.generateTradeSetup(snapshot);
    expect(setup.instrument).toBe('EURUSD');
    expect(setup.entryPrice).toBeGreaterThan(1.04);
    expect(setup.entryPrice).toBeLessThan(1.07);
    // Precision must not truncate decimals
    expect(setup.entryPrice.toString().split('.')[1]?.length).toBeGreaterThanOrEqual(2);
  });

  it('5. Switching symbols immediately resets previous trade setup and prevents cross-instrument leak', async () => {
    // Generate setup for Gold
    const goldCandles = [
      { time: 1795451580, open: 3670.0, high: 3675.0, low: 3669.0, close: 3674.0, volume: 100 },
    ];
    await aiOrchestrator.requestMarketAnalysis('XAUUSD', '1m', goldCandles, undefined, true, 3674.0, true);
    const goldSetup = aiOrchestrator.getCurrentSetup();
    expect(goldSetup?.instrument).toBe('XAUUSD');

    // Invalidate when switching to NAS100
    aiOrchestrator.resetForSymbol('NAS100');
    expect(aiOrchestrator.getCurrentSetup()).toBeNull();
    expect(aiOrchestrator.getCurrentSnapshot()).toBeNull();

    // Now request for NAS100
    const nasCandles = [
      { time: 1795451580, open: 26800.0, high: 26840.0, low: 26790.0, close: 26820.0, volume: 500 },
    ];
    await aiOrchestrator.requestMarketAnalysis('NAS100', '1m', nasCandles, undefined, true, 26820.0, true);
    const nasSetup = aiOrchestrator.getCurrentSetup();
    expect(nasSetup?.instrument).toBe('NAS100');
    expect(nasSetup?.entryPrice).toBeGreaterThan(26000);
  });

  it('6. Generates full structured fallback trade rationale if external LLM provider is busy', () => {
    const symbol = 'NAS100';
    const snapshot = aiToolRegistry.generateSnapshot(symbol, '1m', [
      { time: 1795451580, open: 26800.0, high: 26840.0, low: 26790.0, close: 26820.0, volume: 500 },
    ], 26820.0);

    const setup = marketIntelligenceEngine.generateTradeSetup(snapshot);
    const rationale = marketIntelligenceEngine.generateFallbackTradeRationale(setup, snapshot);

    expect(rationale).toContain('Institutional Order Flow Analysis: NAS100');
    expect(rationale).toContain('Target Entry Price');
    expect(rationale).toContain('Order Book Depth Imbalance');
    expect(rationale).toContain('Footprint & Cumulative Delta');
  });

  it('7. isPricePlausibleForSymbol correctly validates plausible price regimes per asset class', () => {
    // NAS100
    expect(isPricePlausibleForSymbol('NAS100', 26800.5)).toBe(true);
    expect(isPricePlausibleForSymbol('NAS100', 3662.1)).toBe(false); // Stale Gold price rejected
    expect(isPricePlausibleForSymbol('NAS100', 1.0542)).toBe(false); // Forex rejected

    // XAUUSD
    expect(isPricePlausibleForSymbol('XAUUSD', 3672.4)).toBe(true);
    expect(isPricePlausibleForSymbol('XAUUSD', 26800.5)).toBe(false); // Nasdaq rejected
    expect(isPricePlausibleForSymbol('XAUUSD', 91000.0)).toBe(false); // Bitcoin rejected

    // BTCUSDT
    expect(isPricePlausibleForSymbol('BTCUSDT', 91200.0)).toBe(true);
    expect(isPricePlausibleForSymbol('BTCUSDT', 3672.0)).toBe(false);

    // EURUSD
    expect(isPricePlausibleForSymbol('EURUSD', 1.0542)).toBe(true);
    expect(isPricePlausibleForSymbol('EURUSD', 3672.0)).toBe(false);
  });

  it('8. AIToolRegistry rejects stale Gold candles and Gold Delta Profile when requested for NAS100', () => {
    const deltaEngine = new DeltaProfileEngine('XAUUSD', 'binance', '1m');
    // Simulate Gold delta profile POC at $3672
    deltaEngine.addTrade({
      id: 't_gold_1',
      price: 3672.0,
      quantity: 100,
      side: 'buy',
      timestamp: Date.now(),
      notional: 367200,
    });
    aiToolRegistry.setContext({ deltaProfileEngine: deltaEngine });

    // Stale Gold candles from previous session
    const staleGoldCandles = [
      { time: 1795451580, open: 3670.0, high: 3675.0, low: 3669.0, close: 3672.0, volume: 100 },
    ];

    // Snapshot requested for NAS100 while memory still has Gold candles & live price 3662.1
    const snapshot = aiToolRegistry.generateSnapshot('NAS100', '1m', staleGoldCandles, 3662.1);

    expect(snapshot.instrument).toBe('NAS100');
    // Stale Gold price 3662.1 must NOT become currentPrice for NAS100!
    expect(snapshot.currentPrice).not.toBe(3662.1);
    expect(snapshot.currentPrice).not.toBe(3672.0);

    // Delta profile from Gold must NOT be leaked into NAS100 snapshot
    expect(snapshot.deltaProfile?.deltaPocPrice).not.toBe(3672.0);
  });

  it('9. aiOrchestrator.resetForSymbol clears chat messages and prevents prior pair advice from lingering', () => {
    aiOrchestrator.clearMessages();
    // Simulate messages from prior XAUUSD discussion
    (aiOrchestrator as any).messages = [
      { id: '1', role: 'user', content: 'Analyze XAUUSD', timestamp: Date.now() },
      { id: '2', role: 'assistant', content: 'Session VWAP (3662.79)... Delta POC anchored at 3672', timestamp: Date.now() },
    ];
    (aiOrchestrator as any).currentSetup = {
      instrument: 'XAUUSD',
      entryPrice: 3658.6,
    };
    (aiOrchestrator as any).currentSnapshot = {
      instrument: 'XAUUSD',
      currentPrice: 3662.1,
    };
    expect(aiOrchestrator.getMessages().length).toBe(2);

    // When switching from XAUUSD to NAS100
    aiOrchestrator.resetForSymbol('NAS100');

    // Messages must be cleared to prevent confusion
    expect(aiOrchestrator.getMessages().length).toBe(0);
    expect(aiOrchestrator.getCurrentSetup()).toBeNull();
    expect(aiOrchestrator.getCurrentSnapshot()).toBeNull();
  });
});
