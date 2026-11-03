/**
 * JARVIS Chart Position Tool & Server-Side Persistence Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { positionStorageService, ChartPosition } from '../../server/services/positions/PositionStorageService';
import { calculatePositionMetrics } from '../types/position';

describe('TradingView-Style Position Tools & Risk-Reward Engine', () => {
  it('correctly calculates Long Position metrics and 2:1 R:R', () => {
    const longSetup = {
      type: 'LONG' as const,
      entryPrice: 4000.0,
      takeProfit: 4020.0,
      stopLoss: 3990.0,
    };
    const metrics = calculatePositionMetrics(longSetup, 0.01);

    expect(metrics.rewardDistance).toBe(20.0);
    expect(metrics.riskDistance).toBe(10.0);
    expect(metrics.riskRewardRatio).toBe(2.0);
    expect(metrics.rewardPercent).toBeCloseTo(0.5, 2);
    expect(metrics.riskPercent).toBeCloseTo(0.25, 2);
    expect(metrics.ticksTarget).toBe(2000);
    expect(metrics.ticksStop).toBe(1000);
  });

  it('correctly calculates Short Position metrics and 3:1 R:R', () => {
    const shortSetup = {
      type: 'SHORT' as const,
      entryPrice: 4000.0,
      takeProfit: 3970.0,
      stopLoss: 4010.0,
    };
    const metrics = calculatePositionMetrics(shortSetup, 0.01);

    expect(metrics.rewardDistance).toBe(30.0);
    expect(metrics.riskDistance).toBe(10.0);
    expect(metrics.riskRewardRatio).toBe(3.0);
    expect(metrics.ticksTarget).toBe(3000);
    expect(metrics.ticksStop).toBe(1000);
  });
});

describe('PositionStorageService (Server-Side Disk Storage)', () => {
  const testSymbol = 'XAUUSD';
  const filePath = path.join(process.cwd(), 'data', 'chart_positions.json');

  beforeEach(() => {
    positionStorageService.clearPositions(testSymbol);
  });

  afterEach(() => {
    positionStorageService.clearPositions(testSymbol);
  });

  it('persists positions to disk and reloads them without browser cache', () => {
    const mockPos: ChartPosition = {
      id: 'pos_test_1',
      symbol: testSymbol,
      type: 'LONG',
      entryPrice: 3985.5,
      takeProfit: 4015.0,
      stopLoss: 3970.0,
      startTime: 1730000000,
      endTime: 1730007200,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    positionStorageService.addOrUpdatePosition(mockPos);

    // Verify it is in data/chart_positions.json on disk
    expect(fs.existsSync(filePath)).toBe(true);
    const diskContent = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(diskContent[testSymbol]).toBeDefined();
    expect(diskContent[testSymbol][0].id).toBe('pos_test_1');
    expect(diskContent[testSymbol][0].entryPrice).toBe(3985.5);

    // Verify retrieval matches
    const retrieved = positionStorageService.getPositions(testSymbol);
    expect(retrieved.length).toBe(1);
    expect(retrieved[0].entryPrice).toBe(3985.5);
    expect(retrieved[0].takeProfit).toBe(4015.0);

    // Modify position (adjust TP and SL)
    const modified: ChartPosition = {
      ...mockPos,
      takeProfit: 4030.0,
      stopLoss: 3975.0,
    };
    positionStorageService.addOrUpdatePosition(modified);

    const afterUpdate = positionStorageService.getPositions(testSymbol);
    expect(afterUpdate.length).toBe(1);
    expect(afterUpdate[0].takeProfit).toBe(4030.0);
    expect(afterUpdate[0].stopLoss).toBe(3975.0);

    // Delete position
    const deleted = positionStorageService.deletePosition('pos_test_1');
    expect(deleted).toBe(true);
    const afterDelete = positionStorageService.getPositions(testSymbol);
    expect(afterDelete.length).toBe(0);
  });

  it('normalizes various symbol expressions (e.g. VANTAGE:XAUUSD, OANDA:XAUUSD, GOLD) to canonical XAUUSD', () => {
    const pos1: ChartPosition = {
      id: 'pos_test_canonical',
      symbol: 'VANTAGE:XAUUSD',
      type: 'SHORT',
      entryPrice: 3990.0,
      takeProfit: 3970.0,
      stopLoss: 4005.0,
      startTime: 1730000000,
      endTime: 1730007200,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    positionStorageService.addOrUpdatePosition(pos1);

    // Query with OANDA:XAUUSD or XAUUSD
    const res = positionStorageService.getPositions('OANDA:XAUUSD');
    expect(res.length).toBe(1);
    expect(res[0].symbol).toBe('XAUUSD');
    expect(res[0].id).toBe('pos_test_canonical');
  });
});
