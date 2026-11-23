/**
 * JARVIS AI Chart Overlay & Trade Annotation Canvas
 * Renders verified Entry, Stop-Loss, Target lines, shaded Risk/Reward zones,
 * and key resting Order Book walls & absorption levels directly on the chart.
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { TradeSetup, AIEvidenceSnapshot } from '../../types/ai';

interface AIChartOverlayProps {
  chart: IChartApi | null;
  series: ISeriesApi<'Candlestick'> | null;
  setup: TradeSetup | null;
  snapshot?: AIEvidenceSnapshot | null;
  enabled: boolean;
  width: number;
  height: number;
}

export const AIChartOverlay: React.FC<AIChartOverlayProps> = ({
  chart,
  series,
  setup,
  snapshot,
  enabled,
  width,
  height,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !chart || !series || width <= 0 || height <= 0 || !enabled) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const priceToY = (p: number): number | null => {
      const coord = series.priceToCoordinate(p);
      return coord !== null && Number.isFinite(coord) ? coord : null;
    };

    // Helper to draw horizontal level with badge
    const drawLevel = (
      y: number | null,
      color: string,
      label: string,
      price: number,
      dashed: boolean = true,
      lineWidth: number = 1.5,
      startXOffset: number = 420
    ) => {
      if (y === null || y < -20 || y > height + 20) return;

      const startX = Math.max(10, width - startXOffset);
      const endX = width - 10;

      ctx.save();
      ctx.beginPath();
      if (dashed) {
        ctx.setLineDash([5, 4]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
      ctx.stroke();

      // Right label badge
      ctx.setLineDash([]);
      ctx.font = 'bold 9.5px "JetBrains Mono", monospace';
      const text = `${label}: ${price.toFixed(2)}`;
      const textWidth = ctx.measureText(text).width;
      const badgeW = textWidth + 12;
      const badgeH = 17;
      const badgeX = endX - badgeW;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.fillRect(badgeX, y - badgeH / 2, badgeW, badgeH);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(badgeX, y - badgeH / 2, badgeW, badgeH);

      ctx.fillStyle = color;
      ctx.textBaseline = 'middle';
      ctx.fillText(text, badgeX + 6, y);
      ctx.restore();
    };

    // 1. Render Key Order Book Walls & Absorption from Snapshot
    if (snapshot) {
      const askWall = snapshot.orderBook.restingAskWalls[0];
      if (askWall) {
        const askY = priceToY(askWall.price);
        drawLevel(askY, 'rgba(244, 63, 94, 0.75)', `ASK WALL (${askWall.quantity}L)`, askWall.price, true, 1.2, 340);
      }

      const bidWall = snapshot.orderBook.restingBidWalls[0];
      if (bidWall) {
        const bidY = priceToY(bidWall.price);
        drawLevel(bidY, 'rgba(16, 185, 129, 0.75)', `BID WALL (${bidWall.quantity}L)`, bidWall.price, true, 1.2, 340);
      }

      const absEvent = snapshot.absorption.latestEvent;
      if (absEvent) {
        const absY = priceToY(absEvent.price);
        drawLevel(absY, 'rgba(250, 204, 21, 0.9)', `ABSORPTION (${absEvent.grade})`, absEvent.price, true, 1.5, 400);
      }
    }

    // 2. Render Active Trade Setup (Entry, SL, TP1, TP2, and Shaded Risk/Reward Zones)
    if (setup && setup.direction !== 'NO_TRADE') {
      const isLong = setup.direction === 'LONG';
      const entryY = priceToY(setup.entryPrice);
      const slY = priceToY(setup.stopLoss);
      const tp1Y = priceToY(setup.takeProfit1);
      const tp2Y = priceToY(setup.takeProfit2);

      const zoneStartX = Math.max(20, width - 420);
      const zoneEndX = width - 10;
      const zoneWidth = zoneEndX - zoneStartX;

      // Draw Shaded Risk Zone (Red)
      if (entryY !== null && slY !== null) {
        ctx.save();
        const topY = Math.min(entryY, slY);
        const boxH = Math.abs(entryY - slY);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.08)';
        ctx.fillRect(zoneStartX, topY, zoneWidth, boxH);
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.25)';
        ctx.setLineDash([2, 4]);
        ctx.strokeRect(zoneStartX, topY, zoneWidth, boxH);
        ctx.restore();
      }

      // Draw Shaded Reward Zone (Green)
      if (entryY !== null && tp1Y !== null) {
        ctx.save();
        const topY = Math.min(entryY, tp1Y);
        const boxH = Math.abs(entryY - tp1Y);
        ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
        ctx.fillRect(zoneStartX, topY, zoneWidth, boxH);
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.25)';
        ctx.setLineDash([2, 4]);
        ctx.strokeRect(zoneStartX, topY, zoneWidth, boxH);
        ctx.restore();
      }

      // Draw Left Connector Bracket with R:R Badge
      if (entryY !== null && slY !== null && tp1Y !== null) {
        ctx.save();
        const bracketX = zoneStartX;
        const highestY = Math.min(entryY, slY, tp1Y);
        const lowestY = Math.max(entryY, slY, tp1Y);

        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(bracketX + 8, highestY);
        ctx.lineTo(bracketX, highestY);
        ctx.lineTo(bracketX, lowestY);
        ctx.lineTo(bracketX + 8, lowestY);
        ctx.stroke();

        // R:R Pill badge
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        const rrText = `R:R 1:${setup.rewardToRiskRatio}`;
        const rrW = ctx.measureText(rrText).width + 8;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
        ctx.fillRect(bracketX + 4, entryY - 8, rrW, 16);
        ctx.strokeStyle = '#38bdf8';
        ctx.strokeRect(bracketX + 4, entryY - 8, rrW, 16);
        ctx.fillStyle = '#38bdf8';
        ctx.textBaseline = 'middle';
        ctx.fillText(rrText, bracketX + 8, entryY);
        ctx.restore();
      }

      // Draw Stop Loss
      drawLevel(slY, '#f87171', 'STOP LOSS', setup.stopLoss, true, 1.8, 420);

      // Entry Line (Solid with glow)
      if (entryY !== null) {
        ctx.save();
        ctx.shadowColor = isLong ? '#0ecb81' : '#38bdf8';
        ctx.shadowBlur = 6;
        drawLevel(entryY, isLong ? '#0ecb81' : '#38bdf8', `ENTRY (${setup.direction})`, setup.entryPrice, false, 2.0, 420);
        ctx.restore();
      }

      // Take Profits
      drawLevel(tp1Y, '#0ecb81', 'TP 1', setup.takeProfit1, true, 1.8, 420);
      if (tp2Y) drawLevel(tp2Y, '#00e676', 'TP 2', setup.takeProfit2, true, 1.5, 420);
    }

    ctx.restore();
  }, [chart, series, setup, snapshot, enabled, width, height]);

  useEffect(() => {
    render();
  }, [render]);

  useEffect(() => {
    if (!chart) return;
    const handleRange = () => render();
    chart.timeScale().subscribeVisibleTimeRangeChange(handleRange);
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleRange);
    return () => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(handleRange);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleRange);
    };
  }, [chart, render]);

  if (!enabled) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: `${width}px`,
        height: `${height}px`,
        pointerEvents: 'none',
        zIndex: 9,
      }}
    />
  );
};
