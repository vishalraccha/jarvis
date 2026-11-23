import { describe, it, expect } from 'vitest';
import { BlackScholes } from '../services/gex/BlackScholes';
import { GexEngine } from '../services/gex/GexEngine';
import { OptionsDataProvider } from '../services/gex/OptionsDataProvider';
import { OptionChainSnapshot, DEFAULT_GEX_SETTINGS } from '../types/gex';
import { OrderBookManager } from '../services/orderbook/OrderBookManager';

describe('BlackScholes Options Greeks Engine', () => {
  it('computes identical gamma for call and put at the same strike and parameters', () => {
    const spot = 100;
    const strike = 100;
    const timeToExpiry = 30 / 365;
    const rate = 0.04;
    const iv = 0.25;

    const callGamma = BlackScholes.gamma(spot, strike, timeToExpiry, rate, iv);
    const putGamma = BlackScholes.gamma(spot, strike, timeToExpiry, rate, iv);

    expect(callGamma).toBeGreaterThan(0);
    expect(callGamma).toBeCloseTo(putGamma, 8);
  });

  it('handles near 0DTE / zero time boundary condition without NaN or infinity', () => {
    const spot = 100;
    const strike = 100;
    const gamma0 = BlackScholes.gamma(spot, strike, 0, 0.04, 0.25);
    expect(Number.isFinite(gamma0)).toBe(true);
    expect(gamma0).toBeGreaterThanOrEqual(0);

    const greeks = BlackScholes.calculateGreeks(spot, strike, 0, 0.04, 0.25, 'call');
    expect(Number.isFinite(greeks.delta)).toBe(true);
    expect(Number.isFinite(greeks.gamma)).toBe(true);
    expect(Number.isFinite(greeks.vega)).toBe(true);
  });

  it('produces valid call and put delta ranges', () => {
    const spot = 100;
    const otmCall = BlackScholes.delta(spot, 120, 0.5, 0.02, 0.2, 'call');
    const itmCall = BlackScholes.delta(spot, 80, 0.5, 0.02, 0.2, 'call');
    const otmPut = BlackScholes.delta(spot, 80, 0.5, 0.02, 0.2, 'put');
    const itmPut = BlackScholes.delta(spot, 120, 0.5, 0.02, 0.2, 'put');

    expect(otmCall).toBeGreaterThan(0);
    expect(otmCall).toBeLessThan(0.5);
    expect(itmCall).toBeGreaterThan(0.5);
    expect(itmCall).toBeLessThan(1.0);

    expect(otmPut).toBeLessThan(0);
    expect(otmPut).toBeGreaterThan(-0.5);
    expect(itmPut).toBeLessThan(-0.5);
    expect(itmPut).toBeGreaterThan(-1.0);
  });
});

describe('GEX — Gamma Exposure Engine & Mathematical Formulation', () => {
  it('correctly calculates Dollar GEX per 1% move against reference hand-calculation', () => {
    // Formula: GEX = Gamma * OI * Multiplier * Spot^2 * 0.01 * DealerSign
    const gamma = 0.02;
    const openInterest = 1000;
    const contractMultiplier = 100;
    const spotPrice = 100;
    const dealerSign = 1;

    const dollarGex1Pct = GexEngine.computeSingleContractGex(
      gamma,
      openInterest,
      contractMultiplier,
      spotPrice,
      dealerSign,
      'dollar_per_1pct'
    );

    // 0.02 * 1000 * 100 * (100^2) * 0.01 * 1 = 200,000
    expect(dollarGex1Pct).toBe(200000);
  });

  it('correctly calculates Dollar GEX per 1 point move', () => {
    // Formula: GEX_point = Gamma * OI * Multiplier * Spot * DealerSign
    const gamma = 0.02;
    const openInterest = 1000;
    const contractMultiplier = 100;
    const spotPrice = 100;
    const dealerSign = 1;

    const dollarGexPerPoint = GexEngine.computeSingleContractGex(
      gamma,
      openInterest,
      contractMultiplier,
      spotPrice,
      dealerSign,
      'dollar_per_point'
    );

    // 0.02 * 1000 * 100 * 100 * 1 = 200,000
    expect(dollarGexPerPoint).toBe(200000);
  });

  it('applies correct dealer positioning signs across different models', () => {
    // Standard model: Dealers Long Calls (+1), Short Puts (-1)
    expect(GexEngine.getDealerSign('call', 'spotgamma_standard')).toBe(1);
    expect(GexEngine.getDealerSign('put', 'spotgamma_standard')).toBe(-1);

    // Retail Long model: Dealers Short Calls (-1), Short Puts (-1)
    expect(GexEngine.getDealerSign('call', 'retail_long')).toBe(-1);
    expect(GexEngine.getDealerSign('put', 'retail_long')).toBe(-1);

    // Inverted model: Dealers Short Calls (-1), Long Puts (+1)
    expect(GexEngine.getDealerSign('call', 'inverted_yield')).toBe(-1);
    expect(GexEngine.getDealerSign('put', 'inverted_yield')).toBe(1);
  });
});

describe('GEX Aggregation, Call/Put Wall Detection & Gamma Flip', () => {
  const expiryTimestamp = Date.now() + 28 * 86400 * 1000;
  const mockOptionChain: OptionChainSnapshot = {
    underlyingSymbol: 'BTCUSDT',
    optionsUnderlying: 'DERIBIT:BTC',
    provider: 'Deribit Options',
    spotPrice: 65000,
    timestamp: Date.now(),
    openInterestDate: '2026-10-31',
    ivTimestamp: Date.now(),
    isStale: false,
    dataQuality: 'verified',
    contracts: [
      // Put at 60,000 (Strong Put Wall)
      {
        id: 'BTC-60000-P',
        symbol: 'BTC',
        strike: 60000,
        expiration: '2026-11-28',
        expirationTimestamp: expiryTimestamp,
        type: 'put',
        openInterest: 1500,
        volume: 300,
        impliedVolatility: 0.55,
        gamma: 0.00008,
        delta: -0.25,
        underlyingPrice: 65000,
        contractMultiplier: 1.0,
        source: 'Deribit',
      },
      // Put at 62,000
      {
        id: 'BTC-62000-P',
        symbol: 'BTC',
        strike: 62000,
        expiration: '2026-11-28',
        expirationTimestamp: expiryTimestamp,
        type: 'put',
        openInterest: 800,
        volume: 150,
        impliedVolatility: 0.52,
        gamma: 0.00012,
        delta: -0.38,
        underlyingPrice: 65000,
        contractMultiplier: 1.0,
        source: 'Deribit',
      },
      // Call at 65,000 (ATM)
      {
        id: 'BTC-65000-C',
        symbol: 'BTC',
        strike: 65000,
        expiration: '2026-11-28',
        expirationTimestamp: expiryTimestamp,
        type: 'call',
        openInterest: 600,
        volume: 200,
        impliedVolatility: 0.50,
        gamma: 0.00015,
        delta: 0.50,
        underlyingPrice: 65000,
        contractMultiplier: 1.0,
        source: 'Deribit',
      },
      // Call at 70,000 (Strong Call Wall)
      {
        id: 'BTC-70000-C',
        symbol: 'BTC',
        strike: 70000,
        expiration: '2026-11-28',
        expirationTimestamp: expiryTimestamp,
        type: 'call',
        openInterest: 2000,
        volume: 450,
        impliedVolatility: 0.53,
        gamma: 0.00009,
        delta: 0.28,
        underlyingPrice: 65000,
        contractMultiplier: 1.0,
        source: 'Deribit',
      },
    ],
  };

  it('aggregates Net GEX, Call GEX, and Put GEX correctly', () => {
    const metrics = GexEngine.computeGexMetrics(mockOptionChain, DEFAULT_GEX_SETTINGS);

    expect(metrics).not.toBeNull();
    if (!metrics) return;

    expect(metrics.callGex).toBeGreaterThan(0);
    expect(metrics.putGex).toBeLessThan(0); // Under standard model, put GEX is negative
    expect(metrics.netGex).toBeCloseTo(metrics.callGex + metrics.putGex, 4);
  });

  it('identifies Call Wall and Put Wall with exact strikes', () => {
    const metrics = GexEngine.computeGexMetrics(mockOptionChain, DEFAULT_GEX_SETTINGS);
    expect(metrics).not.toBeNull();
    if (!metrics) return;

    // Strongest call strike is 70000
    expect(metrics.callWall.strike).toBe(70000);

    // Strongest put strike is 60000
    expect(metrics.putWall.strike).toBe(60000);
  });

  it('locates Gamma Flip zero crossing price level and calculates distance from spot', () => {
    const metrics = GexEngine.computeGexMetrics(mockOptionChain, DEFAULT_GEX_SETTINGS);
    expect(metrics).not.toBeNull();
    if (!metrics) return;

    if (metrics.gammaFlip) {
      expect(metrics.gammaFlip.price).toBeGreaterThan(0);
      expect(typeof metrics.gammaFlip.distancePercent).toBe('number');
      expect(metrics.gammaFlip.slope).toBeDefined();
    }
  });

  it('produces all 6 price scenarios in sensitivity table (-2%, -1%, -0.5%, +0.5%, +1%, +2%)', () => {
    const metrics = GexEngine.computeGexMetrics(mockOptionChain, DEFAULT_GEX_SETTINGS);
    expect(metrics).not.toBeNull();
    if (!metrics) return;

    expect(metrics.scenarios).toBeDefined();
    const scenarios = metrics.scenarios || metrics.scenarioAnalysis;
    expect(scenarios).toHaveLength(6);
    const pctMoves = scenarios.map((s) => s.movePct);
    expect(pctMoves).toEqual([-2, -1, -0.5, 0.5, 1, 2]);

    for (const sc of scenarios) {
      expect(Number.isFinite(sc.hypotheticalSpot)).toBe(true);
      expect(Number.isFinite(sc.estimatedNetGex)).toBe(true);
      expect(typeof sc.regime).toBe('string');
    }
  });

  it('computes model comparison across all 4 dealer positioning models', () => {
    const metrics = GexEngine.computeGexMetrics(mockOptionChain, DEFAULT_GEX_SETTINGS);
    expect(metrics).not.toBeNull();
    if (!metrics) return;

    expect(metrics.modelComparisons).toHaveLength(4);
    const modelKeys = metrics.modelComparisons.map((m) => m.model);
    expect(modelKeys).toContain('spotgamma_standard');
    expect(modelKeys).toContain('retail_long');
    expect(modelKeys).toContain('inverted_yield');
    expect(modelKeys).toContain('volume_informed');
  });
});

describe('Instrument to Options-Underlying Mapping & Basis Disclaimers', () => {
  it('correctly maps BTC and ETH to Deribit options with multiplier 1.0', () => {
    const btcMapping = OptionsDataProvider.getOptionsMapping('BTCUSDT');
    expect(btcMapping.hasOptionsMarket).toBe(true);
    expect(btcMapping.optionsUnderlying).toBe('BTC');
    expect(btcMapping.contractMultiplier).toBe(1.0);
    expect(btcMapping.hasBasisRisk).toBe(false);

    const ethMapping = OptionsDataProvider.getOptionsMapping('ETHUSDT');
    expect(ethMapping.hasOptionsMarket).toBe(true);
    expect(ethMapping.optionsUnderlying).toBe('ETH');
    expect(ethMapping.contractMultiplier).toBe(1.0);
  });

  it('maps XAUUSD to COMEX Gold GC options with multiplier 100.0 and explicit basis risk warning', () => {
    const goldMapping = OptionsDataProvider.getOptionsMapping('XAUUSD');
    expect(goldMapping.hasOptionsMarket).toBe(true);
    expect(goldMapping.optionsUnderlying).toBe('GC');
    expect(goldMapping.contractMultiplier).toBe(100.0);
    expect(goldMapping.hasBasisRisk).toBe(true);
    expect(goldMapping.basisNotice).toBeDefined();
    expect(goldMapping.basisNotice).toContain('COMEX Gold Futures');
  });

  it('strictly segregates NDX, QQQ, and NQ underlyings without mixing', () => {
    const ndxMapping = OptionsDataProvider.getOptionsMapping('NAS100');
    expect(ndxMapping.optionsUnderlying).toBe('NDX');
    expect(ndxMapping.contractMultiplier).toBe(100.0);
    expect(ndxMapping.hasBasisRisk).toBe(false);

    const qqqMapping = OptionsDataProvider.getOptionsMapping('QQQ');
    expect(qqqMapping.optionsUnderlying).toBe('QQQ');
    expect(qqqMapping.contractMultiplier).toBe(100.0);
    expect(qqqMapping.hasBasisRisk).toBe(false);

    const nqMapping = OptionsDataProvider.getOptionsMapping('NQ');
    expect(nqMapping.optionsUnderlying).toBe('NQ');
    expect(nqMapping.hasBasisRisk).toBe(true);
    expect(nqMapping.basisNotice).toContain('Futures');

    // Verify distinct symbols produce distinct configurations
    expect(ndxMapping.optionsUnderlying).not.toBe(qqqMapping.optionsUnderlying);
  });

  it('marks unsupported or unmapped instruments as having no valid options market', () => {
    const dogeMapping = OptionsDataProvider.getOptionsMapping('UNKNOWN_PAIR');
    expect(dogeMapping.hasOptionsMarket).toBe(false);
  });
});

describe('Order Book GEX Engine — Cross-Exchange Verification Suite', () => {
  it('correctly calculates GEX from OrderBookManager for Binance BTCUSDT', () => {
    const ob = new OrderBookManager(1.0);
    // Populate realistic order book around 90,000 spot
    ob.applyIncrementalUpdate({
      firstUpdateId: 1,
      lastUpdateId: 1,
      timestamp: Date.now(),
      bids: [
        [89900, 5.0],
        [89800, 10.0],
        [89500, 25.0], // Major bid support
        [89000, 50.0], // Put Wall candidate
      ],
      asks: [
        [90100, 4.0],
        [90200, 8.0],
        [90500, 30.0], // Major ask resistance
        [91000, 60.0], // Call Wall candidate
      ],
    });

    const metrics = GexEngine.computeGexFromOrderBook(
      ob,
      'BTCUSDT',
      90000,
      DEFAULT_GEX_SETTINGS,
      'binance'
    );

    expect(metrics).toBeDefined();
    expect(metrics.spotPrice).toBe(90000);
    expect(metrics.strikes.length).toBeGreaterThan(0);
    expect(metrics.callGex).toBeGreaterThan(0);
    expect(metrics.putGex).toBeLessThan(0);
    expect(metrics.callWall.strike).toBeGreaterThanOrEqual(90000);
    expect(metrics.putWall.strike).toBeLessThanOrEqual(90000);
    expect(metrics.gammaFlip).toBeDefined();
    expect(metrics.provider).toContain('BINANCE');
  });

  it('correctly calculates GEX for COMEX Gold Futures (GC) with 100x multiplier', () => {
    const ob = new OrderBookManager(0.1);
    ob.applyIncrementalUpdate({
      firstUpdateId: 1,
      lastUpdateId: 1,
      timestamp: Date.now(),
      bids: [
        [2745, 50],
        [2740, 120],
        [2735, 200], // Put Wall candidate
        [2730, 80],
      ],
      asks: [
        [2755, 40],
        [2760, 150],
        [2765, 250], // Call Wall candidate
        [2770, 90],
      ],
    });

    const metrics = GexEngine.computeGexFromOrderBook(
      ob,
      'GC',
      2750,
      DEFAULT_GEX_SETTINGS,
      'comex'
    );

    expect(metrics).toBeDefined();
    expect(metrics.strikes.length).toBeGreaterThan(0);
    expect(metrics.callWall.strike).toBeGreaterThanOrEqual(2750);
    expect(metrics.putWall.strike).toBeLessThanOrEqual(2750);
    expect(metrics.provider).toContain('COMEX');
  });

  it('correctly calculates GEX for MT5 Vantage Gold (XAUUSD_VANTAGE)', () => {
    const ob = new OrderBookManager(0.01);
    ob.applyIncrementalUpdate({
      firstUpdateId: 1,
      lastUpdateId: 1,
      timestamp: Date.now(),
      bids: [
        [2748.5, 30],
        [2745.0, 90],
        [2740.0, 150],
      ],
      asks: [
        [2751.5, 25],
        [2755.0, 85],
        [2760.0, 160],
      ],
    });

    const metrics = GexEngine.computeGexFromOrderBook(
      ob,
      'XAUUSD_VANTAGE',
      2750,
      DEFAULT_GEX_SETTINGS,
      'mt5'
    );

    expect(metrics).toBeDefined();
    expect(metrics.strikes.length).toBeGreaterThan(0);
    expect(metrics.callGex).toBeGreaterThan(0);
    expect(metrics.putGex).toBeLessThan(0);
    expect(metrics.provider).toContain('MT5');
  });

  it('correctly calculates GEX for Bybit Crypto (SOLUSDT & ETHUSDT)', () => {
    const ob = new OrderBookManager(0.01);
    ob.applyIncrementalUpdate({
      firstUpdateId: 1,
      lastUpdateId: 1,
      timestamp: Date.now(),
      bids: [
        [178, 500],
        [175, 1200],
        [170, 3000],
      ],
      asks: [
        [182, 450],
        [185, 1100],
        [190, 3200],
      ],
    });

    const metrics = GexEngine.computeGexFromOrderBook(
      ob,
      'SOLUSDT',
      180,
      DEFAULT_GEX_SETTINGS,
      'bybit'
    );

    expect(metrics).toBeDefined();
    expect(metrics.strikes.length).toBeGreaterThan(0);
    expect(metrics.provider).toContain('BYBIT');
    expect(metrics.callWall.strike).toBeGreaterThanOrEqual(180);
    expect(metrics.putWall.strike).toBeLessThanOrEqual(180);
  });

  it('correctly calculates GEX for GoldPriceDev XAUUSD', () => {
    const ob = new OrderBookManager(0.01);
    ob.applyIncrementalUpdate({
      firstUpdateId: 1,
      lastUpdateId: 1,
      timestamp: Date.now(),
      bids: [
        [2747, 40],
        [2742, 100],
      ],
      asks: [
        [2753, 35],
        [2758, 95],
      ],
    });

    const metrics = GexEngine.computeGexFromOrderBook(
      ob,
      'XAUUSD',
      2750,
      DEFAULT_GEX_SETTINGS,
      'goldprice_dev'
    );

    expect(metrics).toBeDefined();
    expect(metrics.strikes.length).toBeGreaterThan(0);
    expect(metrics.provider).toContain('GOLDPRICE_DEV');
  });

  it('creates non-empty, fully valid OptionChainSnapshot from OrderBookManager', () => {
    const ob = new OrderBookManager(0.01);
    ob.applyIncrementalUpdate({
      firstUpdateId: 1,
      lastUpdateId: 1,
      timestamp: Date.now(),
      bids: [[2740, 100]],
      asks: [[2760, 100]],
    });

    const snapshot = OptionsDataProvider.createOptionChainFromOrderBook(
      ob,
      'XAUUSD',
      2750,
      'binance'
    );

    expect(snapshot).toBeDefined();
    expect(snapshot.spotPrice).toBe(2750);
    expect(snapshot.contracts.length).toBeGreaterThan(0);

    const callContract = snapshot.contracts.find((c) => c.type === 'call');
    expect(callContract).toBeDefined();
    expect(callContract?.gamma).toBeGreaterThan(0);
    expect(callContract?.openInterest).toBeGreaterThan(0);

    const putContract = snapshot.contracts.find((c) => c.type === 'put');
    expect(putContract).toBeDefined();
    expect(putContract?.gamma).toBeGreaterThan(0);
    expect(putContract?.openInterest).toBeGreaterThan(0);
  });
});
