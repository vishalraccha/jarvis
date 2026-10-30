/**
 * JARVIS Chart Position Types
 * Defines Long and Short Position Drawing Tools with TradingView-style Risk/Reward
 */

export type PositionType = 'LONG' | 'SHORT';

export interface ChartPosition {
  id: string;
  symbol: string;
  type: PositionType;
  entryPrice: number;
  takeProfit: number;
  stopLoss: number;
  startTime: number; // Unix timestamp in seconds
  endTime: number;   // Unix timestamp in seconds
  widthPx?: number;  // Visual pixel width for adjustable sizing
  accountSize?: number;
  riskAmount?: number;
  closed?: boolean;
  createdAt: number;
  updatedAt: number;
}

export type PositionHandle = 'top' | 'bottom' | 'middle' | 'right' | 'body';

export interface PositionCalculation {
  rewardDistance: number;
  riskDistance: number;
  rewardPercent: number;
  riskPercent: number;
  riskRewardRatio: number;
  ticksTarget: number;
  ticksStop: number;
}

/**
 * Calculates risk/reward ratio and distances for a position
 */
export function calculatePositionMetrics(
  pos: { type: PositionType; entryPrice: number; takeProfit: number; stopLoss: number },
  tickSize: number = 0.01
): PositionCalculation {
  const { type, entryPrice, takeProfit, stopLoss } = pos;
  const safeEntry = Math.max(0.0001, entryPrice);

  let rewardDistance = 0;
  let riskDistance = 0;

  if (type === 'LONG') {
    rewardDistance = Math.max(0, takeProfit - entryPrice);
    riskDistance = Math.max(0, entryPrice - stopLoss);
  } else {
    rewardDistance = Math.max(0, entryPrice - takeProfit);
    riskDistance = Math.max(0, stopLoss - entryPrice);
  }

  const rewardPercent = (rewardDistance / safeEntry) * 100;
  const riskPercent = (riskDistance / safeEntry) * 100;
  const riskRewardRatio = riskDistance > 0 ? rewardDistance / riskDistance : 0;
  const ticksTarget = Math.round(rewardDistance / tickSize);
  const ticksStop = Math.round(riskDistance / tickSize);

  return {
    rewardDistance,
    riskDistance,
    rewardPercent,
    riskPercent,
    riskRewardRatio,
    ticksTarget,
    ticksStop,
  };
}
