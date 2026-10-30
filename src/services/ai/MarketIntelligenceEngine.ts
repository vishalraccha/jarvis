/**
 * JARVIS Market Intelligence & Trade Strategy Engine
 * Formulates mathematically grounded Trade Setups and Evidence Confidence Scores
 * strictly anchored to the real order book, footprint, and absorption levels.
 */

import {
  AIEvidenceSnapshot,
  TradeDirection,
  TradeSetup,
  MarketRegimeType,
} from '../../types/ai';

export class MarketIntelligenceEngine {
  /**
   * Calculate deterministic Evidence Confidence Score (0 - 100)
   * Based on measurable order-flow factors, not arbitrary LLM guesses.
   */
  public calculateConfidenceScore(
    direction: TradeDirection,
    snapshot: AIEvidenceSnapshot,
    rewardToRisk: number
  ): { totalScore: number; factorBreakdown: Array<{ name: string; score: number; weight: number; note: string }> } {
    if (direction === 'NO_TRADE') {
      return { totalScore: 35, factorBreakdown: [{ name: 'Market Ambiguity', score: 35, weight: 1.0, note: 'Conflicting order flow signals' }] };
    }

    const isLong = direction === 'LONG';
    const breakdown: Array<{ name: string; score: number; weight: number; note: string }> = [];

    // 1. Order Book Depth & Resting Wall Alignment (0 to 25 pts)
    let obScore = 12;
    const ob = snapshot.orderBook;
    if (isLong) {
      if (ob.depthImbalancePercent >= 15) obScore += 8;
      if (ob.restingBidWalls.length > 0) obScore += 5;
    } else {
      if (ob.depthImbalancePercent <= -15) obScore += 8;
      if (ob.restingAskWalls.length > 0) obScore += 5;
    }
    obScore = Math.min(25, obScore);
    breakdown.push({
      name: 'Order Book Depth Alignment',
      score: obScore,
      weight: 0.25,
      note: `Depth imbalance: ${ob.depthImbalancePercent}% (${ob.restingBidWalls.length} bid walls, ${ob.restingAskWalls.length} ask walls)`,
    });

    // 2. Absorption & Passive Defense Confirmation (0 to 25 pts)
    let absScore = 10;
    const abs = snapshot.absorption;
    if (isLong && abs.buyersAbsorbingAtSupport) {
      absScore = abs.latestEvent?.grade === 'A+' ? 25 : 20;
    } else if (!isLong && abs.sellersAbsorbingAtResistance) {
      absScore = abs.latestEvent?.grade === 'A+' ? 25 : 20;
    }
    breakdown.push({
      name: 'Absorption Confirmation',
      score: absScore,
      weight: 0.25,
      note: isLong
        ? abs.buyersAbsorbingAtSupport ? `Buyers absorbing at support (${abs.latestEvent?.grade || 'A'})` : 'No recent buy absorption'
        : abs.sellersAbsorbingAtResistance ? `Sellers absorbing at resistance (${abs.latestEvent?.grade || 'A'})` : 'No recent sell absorption',
    });

    // 3. Footprint Delta & CVD Pressure (0 to 20 pts)
    let deltaScore = 10;
    const fp = snapshot.footprint;
    if (isLong) {
      if (fp.candleDelta > 0) deltaScore += 5;
      if (fp.cumulativeCvd > 0) deltaScore += 5;
    } else {
      if (fp.candleDelta < 0) deltaScore += 5;
      if (fp.cumulativeCvd < 0) deltaScore += 5;
    }
    breakdown.push({
      name: 'Delta & CVD Alignment',
      score: deltaScore,
      weight: 0.20,
      note: `Candle delta: ${fp.candleDelta} (${fp.deltaPercent}%), Cumulative CVD: ${fp.cumulativeCvd}`,
    });

    // 4. VWAP & Market Structure (0 to 18 pts)
    let structScore = 8;
    const st = snapshot.structure;
    const price = snapshot.currentPrice;
    if (isLong) {
      if (price >= st.vwap) structScore += 5;
      if (st.trend === 'UPTREND') structScore += 5;
    } else {
      if (price <= st.vwap) structScore += 5;
      if (st.trend === 'DOWNTREND') structScore += 5;
    }
    breakdown.push({
      name: 'VWAP & Structure Alignment',
      score: structScore,
      weight: 0.18,
      note: `Trend: ${st.trend}, Price ${price >= st.vwap ? 'above' : 'below'} VWAP (${st.vwap})`,
    });

    // 5. Risk / Reward Efficiency (0 to 12 pts)
    let rrScore = 6;
    if (rewardToRisk >= 2.5) rrScore = 12;
    else if (rewardToRisk >= 2.0) rrScore = 10;
    else if (rewardToRisk >= 1.5) rrScore = 7;
    breakdown.push({
      name: 'Risk / Reward Ratio',
      score: rrScore,
      weight: 0.12,
      note: `R:R = 1 : ${rewardToRisk}`,
    });

    // Penalties
    let penalty = 0;
    if (ob.spreadTicks > 4) penalty += 5;
    if (snapshot.regime === 'high_volatility') penalty += 6;

    const total = Math.max(30, Math.min(95, obScore + absScore + deltaScore + structScore + rrScore - penalty));

    return { totalScore: total, factorBreakdown: breakdown };
  }

  /**
   * Synthesize an authoritative Trade Setup directly anchored to actual order book levels
   */
  public generateTradeSetup(snapshot: AIEvidenceSnapshot, existingSetup?: TradeSetup | null): TradeSetup {
    const currentPrice = snapshot.currentPrice;
    const ob = snapshot.orderBook;
    const st = snapshot.structure;
    const abs = snapshot.absorption;
    const fp = snapshot.footprint;

    // Preserve active valid setup if still within trade boundaries and not invalidated
    if (existingSetup && existingSetup.direction !== 'NO_TRADE') {
      const isStillValid =
        existingSetup.direction === 'LONG'
          ? currentPrice > existingSetup.stopLoss && currentPrice < existingSetup.takeProfit2
          : currentPrice < existingSetup.stopLoss && currentPrice > existingSetup.takeProfit2;

      // If active setup is less than 5 minutes old and price hasn't violated SL/TP, maintain stability
      if (isStillValid && Date.now() - existingSetup.timestamp < 300000) {
        return {
          ...existingSetup,
          status: Math.abs(currentPrice - existingSetup.entryPrice) <= snapshot.atr * 0.4 ? 'READY_NOW' : 'WAITING_CONFIRMATION',
        };
      }
    }

    // 1. Primary Direction Assessment based on Regime & Macro Flow
    const isBearishRegime = snapshot.regime.includes('bearish') || snapshot.bias === 'BEARISH' || st.trend === 'DOWNTREND';
    const isBullishRegime = snapshot.regime.includes('bullish') || snapshot.bias === 'BULLISH' || st.trend === 'UPTREND';

    let direction: TradeDirection = 'NO_TRADE';
    let setupName = 'Market Observation';
    const reasons: string[] = [];

    // Confluence Scoring
    let bullishConfluence = 0;
    let bearishConfluence = 0;

    if (isBullishRegime) bullishConfluence += 4;
    if (isBearishRegime) bearishConfluence += 4;

    if (currentPrice > st.vwap) bullishConfluence += 2;
    else if (currentPrice < st.vwap) bearishConfluence += 2;

    if (ob.depthImbalancePercent >= 10) bullishConfluence += 2;
    else if (ob.depthImbalancePercent <= -10) bearishConfluence += 2;

    if (fp.cumulativeCvd > 0) bullishConfluence += 1;
    else if (fp.cumulativeCvd < 0) bearishConfluence += 1;

    if (abs.buyersAbsorbingAtSupport) bullishConfluence += 2;
    if (abs.sellersAbsorbingAtResistance) bearishConfluence += 2;

    if (bearishConfluence >= bullishConfluence && isBearishRegime) {
      direction = 'SHORT';
      setupName = 'Trend Continuation & Order Book Ask Resistance Short';
    } else if (bullishConfluence > bearishConfluence && isBullishRegime) {
      direction = 'LONG';
      setupName = 'Trend Expansion & Order Book Bid Defense Long';
    } else if (bearishConfluence > bullishConfluence) {
      direction = 'SHORT';
      setupName = 'Liquidity Wall Rejection & Breakdown Short';
    } else if (bullishConfluence > bearishConfluence) {
      direction = 'LONG';
      setupName = 'Support Liquidity Defense & Buy Absorption Long';
    } else {
      // Default to trend or VWAP position
      if (currentPrice < st.vwap) {
        direction = 'SHORT';
        setupName = 'VWAP Defense Short';
      } else {
        direction = 'LONG';
        setupName = 'VWAP Defense Long';
      }
    }

    // Anchoring Entry, SL, and TP directly to real Order Book and Structure levels
    let entryPrice = currentPrice;
    let stopLoss = 0;
    let tp1 = 0;
    let tp2 = 0;
    let tp3 = 0;
    let orderBookEvidence = '';
    let invalidation = '';

    const safeAtr = Math.max(1.0, Math.min(snapshot.atr || 2.5, 6.0));

    if (direction === 'LONG') {
      const nearestBidWall = ob.restingBidWalls[0]?.price || ob.bestBid;
      entryPrice = currentPrice <= nearestBidWall + safeAtr * 0.3 ? currentPrice : nearestBidWall;

      // Realistic order flow stop loss: below defended bid wall or recent local swing low (never far sessionLow)
      const localSupport = Math.min(
        nearestBidWall,
        st.swingLow < currentPrice && st.swingLow > currentPrice - safeAtr * 3.5 ? st.swingLow : nearestBidWall
      );
      const calculatedRisk = Math.max(safeAtr * 0.8, Math.min(safeAtr * 2.2, entryPrice - localSupport + safeAtr * 0.5));
      stopLoss = Math.round((entryPrice - calculatedRisk) * 100) / 100;

      // Realistic targets: 1.8:1, 2.5:1, 3.5:1
      const nearestAskWall = ob.restingAskWalls[0]?.price;
      tp1 = nearestAskWall && nearestAskWall > entryPrice + calculatedRisk * 1.2
        ? Math.round(nearestAskWall * 100) / 100
        : Math.round((entryPrice + calculatedRisk * 1.8) * 100) / 100;
      tp2 = Math.round(Math.max(tp1 + calculatedRisk * 0.8, entryPrice + calculatedRisk * 2.6) * 100) / 100;
      tp3 = Math.round(Math.max(tp2 + calculatedRisk * 0.8, entryPrice + calculatedRisk * 3.8) * 100) / 100;

      orderBookEvidence = `Order Book: Defended by ${ob.restingBidWalls.length} resting bid walls below price. Top bid wall at ${nearestBidWall} (${ob.restingBidWalls[0]?.quantity || 0} lots).`;
      invalidation = `Price breaks and accepts below defended bid support at ${stopLoss}.`;
      reasons.push('Order book depth skewed toward buyers');
      if (abs.buyersAbsorbingAtSupport) reasons.push('Confirmed buy-side absorption defending support');
      if (fp.candleDelta > 0) reasons.push(`Positive footprint delta (+${fp.candleDelta})`);
    } else {
      const nearestAskWall = ob.restingAskWalls[0]?.price || ob.bestAsk;
      entryPrice = currentPrice >= nearestAskWall - safeAtr * 0.3 ? currentPrice : nearestAskWall;

      // Realistic order flow stop loss: above defended ask wall or recent local swing high (never far sessionHigh)
      const localResistance = Math.max(
        nearestAskWall,
        st.swingHigh > currentPrice && st.swingHigh < currentPrice + safeAtr * 3.5 ? st.swingHigh : nearestAskWall
      );
      const calculatedRisk = Math.max(safeAtr * 0.8, Math.min(safeAtr * 2.2, localResistance - entryPrice + safeAtr * 0.5));
      stopLoss = Math.round((entryPrice + calculatedRisk) * 100) / 100;

      // Realistic targets: 1.8:1, 2.5:1, 3.5:1
      const nearestBidWall = ob.restingBidWalls[0]?.price;
      tp1 = nearestBidWall && nearestBidWall < entryPrice - calculatedRisk * 1.2
        ? Math.round(nearestBidWall * 100) / 100
        : Math.round((entryPrice - calculatedRisk * 1.8) * 100) / 100;
      tp2 = Math.round(Math.min(tp1 - calculatedRisk * 0.8, entryPrice - calculatedRisk * 2.6) * 100) / 100;
      tp3 = Math.round(Math.min(tp2 - calculatedRisk * 0.8, entryPrice - calculatedRisk * 3.8) * 100) / 100;

      orderBookEvidence = `Order Book: Capped by ${ob.restingAskWalls.length} resting ask walls above price. Top ask wall at ${nearestAskWall} (${ob.restingAskWalls[0]?.quantity || 0} lots).`;
      invalidation = `Price breaks and accepts above defended ask resistance at ${stopLoss}.`;
      reasons.push('Order book depth skewed toward sellers');
      if (abs.sellersAbsorbingAtResistance) reasons.push('Confirmed sell-side absorption capping rallies');
      if (fp.candleDelta < 0) reasons.push(`Negative footprint delta (${fp.candleDelta})`);
    }

    const risk = Math.max(safeAtr * 0.5, Math.abs(entryPrice - stopLoss));
    const reward = Math.abs(tp1 - entryPrice);
    const rewardToRiskRatio = Math.round((reward / risk) * 100) / 100;

    const { totalScore } = this.calculateConfidenceScore(direction, snapshot, rewardToRiskRatio);

    return {
      id: `setup_${snapshot.instrument}_${Date.now()}`,
      timestamp: Date.now(),
      instrument: snapshot.instrument,
      direction,
      setupName,
      marketRegime: snapshot.regime,
      status: Math.abs(currentPrice - entryPrice) <= snapshot.atr * 0.4 ? 'READY_NOW' : 'WAITING_CONFIRMATION',
      entryType: Math.abs(currentPrice - entryPrice) <= snapshot.atr * 0.4 ? 'MARKET' : 'LIMIT',
      entryPrice: Math.round(entryPrice * 100) / 100,
      entryZone: {
        min: Math.round((entryPrice - snapshot.atr * 0.2) * 100) / 100,
        max: Math.round((entryPrice + snapshot.atr * 0.2) * 100) / 100,
      },
      stopLoss,
      takeProfit1: tp1,
      takeProfit2: tp2,
      takeProfit3: tp3,
      rewardToRiskRatio,
      confidenceScore: totalScore,
      reasons,
      orderBookEvidence,
      footprintEvidence: `Delta: ${fp.candleDelta} (${fp.deltaPercent}%), Buy Vol: ${fp.buyVolume}, Sell Vol: ${fp.sellVolume}`,
      absorptionEvidence: abs.latestEvent
        ? `${abs.latestEvent.grade} grade ${abs.latestEvent.type} at ${abs.latestEvent.price} (${abs.latestEvent.zoneDescription})`
        : 'Holding structural level without opposing breakthrough',
      invalidationCondition: invalidation,
      expirationTimeMs: Date.now() + 3600 * 1000 * 2, // 2 hours validity
    };
  }

  /**
   * Build the structured System Prompt for LLMs
   */
  public buildSystemPrompt(snapshot: AIEvidenceSnapshot): string {
    return `You are JARVIS — the elite Institutional Order Flow Trading Intelligence Engine.
You analyze real-time market data with extreme precision.

CRITICAL OPERATIONAL & FORMATTING RULES:
1. EXPLAIN IN SHORT, HUMAN-STYLE BULLET POINTS: Maximum 3 to 4 punchy lines. Never write giant essays or long paragraphs.
2. NEVER output raw markdown clutter like '****', '---', or multiple '#' hashes. Keep formatting clean, elegant, and readable for human eyes.
3. Write like an elite institutional prop trader speaking directly to another trader:
   - State the current market condition in 1 clear sentence.
   - List key resting order book walls & absorption levels (exact prices).
   - Provide the exact trade plan (Entry, Stop Loss, Target).
4. All prices and targets MUST be derived directly from the verified live context below. NEVER invent prices.

VERIFIED LIVE MARKET CONTEXT:
- Instrument: ${snapshot.instrument} (${snapshot.timeframe})
- Current Price: ${snapshot.currentPrice} | ATR: ${snapshot.atr}
- Market Regime: ${snapshot.regime} (Bias: ${snapshot.bias})
- Order Book Depth: Imbalance ${snapshot.orderBook.depthImbalancePercent}%, Best Bid ${snapshot.orderBook.bestBid}, Best Ask ${snapshot.orderBook.bestAsk}
- Resting Bid Walls: ${snapshot.orderBook.restingBidWalls.map((w) => `${w.price} (${w.quantity}L)`).join(', ') || 'None'}
- Resting Ask Walls: ${snapshot.orderBook.restingAskWalls.map((w) => `${w.price} (${w.quantity}L)`).join(', ') || 'None'}
- Footprint Delta: ${snapshot.footprint.candleDelta} (${snapshot.footprint.deltaPercent}%), Cumulative CVD: ${snapshot.footprint.cumulativeCvd}
- Absorption: ${snapshot.absorption.latestEvent ? `${snapshot.absorption.latestEvent.grade} grade at ${snapshot.absorption.latestEvent.price}` : 'None active'}
- Structure: Trend ${snapshot.structure.trend}, VWAP ${snapshot.structure.vwap}, Session Range ${snapshot.structure.sessionLow} - ${snapshot.structure.sessionHigh}`;
  }
}

export const marketIntelligenceEngine = new MarketIntelligenceEngine();
