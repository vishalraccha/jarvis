/**
 * JARVIS TradingView-Style Interactive Long & Short Position Tool Overlay
 * Features:
 * - Green profit zone (take-profit), red risk zone (stop-loss)
 * - Compact default placement (~140px width, ~120px total height, never spans full screen)
 * - Fully customizable width and height via:
 *   • Right handle: drag left/right to adjust box width in pixels
 *   • Left handle: drag left/right to move start edge
 *   • Top handle: drag vertically to adjust Target (or Stop Loss on short)
 *   • Bottom handle: drag vertically to adjust Stop Loss (or Target on short)
 *   • Middle handle: drag vertically to adjust Entry price
 *   • Box body: drag to move entire setup across price and time
 * - Floating HUD above selected setup with [-] and [+] steppers for Width, TP, and SL
 * - Persistent server-side disk storage in data/chart_positions.json
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { ChartPosition, PositionType, calculatePositionMetrics } from '../../types/position';
import { positionService } from '../../services/positions/PositionService';
import { Trash2, TrendingUp, TrendingDown, Minus, Plus } from 'lucide-react';

interface PositionDrawingOverlayProps {
  chart: IChartApi | null;
  series: ISeriesApi<'Candlestick'> | null;
  symbol: string;
  width: number;
  height: number;
  timeframe?: string;
  activeDrawingTool: PositionType | null;
  onClearDrawingTool: () => void;
}

type DragTarget =
  | { type: 'tp'; posId: string }
  | { type: 'sl'; posId: string }
  | { type: 'entry'; posId: string }
  | { type: 'left'; posId: string }
  | { type: 'right'; posId: string }
  | { type: 'body'; posId: string };

export const PositionDrawingOverlay: React.FC<PositionDrawingOverlayProps> = ({
  chart,
  series,
  symbol,
  width,
  height,
  activeDrawingTool,
  onClearDrawingTool,
}) => {
  const [positions, setPositions] = useState<ChartPosition[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{
    target: DragTarget;
    startY: number;
    startX: number;
    initialPos: ChartPosition;
  } | null>(null);

  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [, setRenderTick] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 1. Subscribe to PositionService and load positions from server on symbol change
  useEffect(() => {
    positionService.loadPositions(symbol).then((list) => {
      // Ensure existing positions have a clean, clamped widthPx
      const sanitized = list.map((p) => ({
        ...p,
        widthPx: p.widthPx && p.widthPx > 30 && p.widthPx < 1200 ? p.widthPx : 140,
      }));
      setPositions(sanitized);
    });

    const unsub = positionService.subscribe((list) => {
      const sanitized = list.map((p) => ({
        ...p,
        widthPx: p.widthPx && p.widthPx > 30 && p.widthPx < 1200 ? p.widthPx : 140,
      }));
      setPositions(sanitized);
    });
    return unsub;
  }, [symbol]);

  // 1.5. Real-time 60fps Chart Pan & Zoom synchronization (zero-lag tracking)
  useEffect(() => {
    if (!chart) return;
    let animId: number | null = null;
    const handleRangeChange = () => {
      if (animId !== null) return;
      animId = requestAnimationFrame(() => {
        animId = null;
        setRenderTick((t) => (t + 1) | 0);
      });
    };

    chart.timeScale().subscribeVisibleTimeRangeChange(handleRangeChange);
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleRangeChange);

    return () => {
      if (animId !== null) cancelAnimationFrame(animId);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(handleRangeChange);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleRangeChange);
    };
  }, [chart]);

  // 1.6. Global click-away listener: deselect active position when clicking outside
  useEffect(() => {
    const handleGlobalPointerDown = (e: MouseEvent | PointerEvent) => {
      if (!selectedId) return;
      const target = e.target as HTMLElement | SVGElement | null;
      if (
        target &&
        (target.closest?.('[data-position-element="true"]') ||
          target.closest?.('[data-position-hud="true"]'))
      ) {
        return;
      }
      setSelectedId(null);
    };

    window.addEventListener('pointerdown', handleGlobalPointerDown);
    return () => window.removeEventListener('pointerdown', handleGlobalPointerDown);
  }, [selectedId]);

  // 1.7. Deselect when clicking on chart background canvas
  useEffect(() => {
    if (!chart) return;
    const handleChartClick = () => {
      if (!activeDrawingTool) {
        setSelectedId(null);
      }
    };
    chart.subscribeClick(handleChartClick);
    return () => chart.unsubscribeClick(handleChartClick);
  }, [chart, activeDrawingTool]);

  // 2. Coordinate conversion helpers
  const getVisibleRange = useCallback(() => {
    if (!chart) return null;
    const range = chart.timeScale().getVisibleRange();
    if (!range || (range.to as number) <= (range.from as number)) return null;
    return { from: range.from as number, to: range.to as number };
  }, [chart]);

  const timeToX = useCallback(
    (tSec: number): number => {
      if (!chart) return -9999;
      const coord = chart.timeScale().timeToCoordinate(tSec as any);
      if (coord !== null && Number.isFinite(coord)) return coord;

      const range = getVisibleRange();
      if (!range) return -9999;
      const diff = range.to - range.from;
      if (diff <= 0) return -9999;
      return ((tSec - range.from) / diff) * width;
    },
    [chart, getVisibleRange, width]
  );

  const xToTime = useCallback(
    (x: number): number => {
      if (!chart) return Date.now() / 1000;
      const t = chart.timeScale().coordinateToTime(x);
      if (t !== null && typeof t === 'number') return t;

      const range = getVisibleRange();
      if (!range || width <= 0) return Date.now() / 1000;
      const diff = range.to - range.from;
      return range.from + (x / width) * diff;
    },
    [chart, getVisibleRange, width]
  );

  const priceToY = useCallback(
    (p: number): number => {
      if (!series) return -9999;
      const coord = series.priceToCoordinate(p);
      return coord !== null && Number.isFinite(coord) ? coord : -9999;
    },
    [series]
  );

  const yToPrice = useCallback(
    (y: number): number => {
      if (!series) return 0;
      const price = series.coordinateToPrice(y);
      return price !== null && Number.isFinite(price) ? price : 0;
    },
    [series]
  );

  // 3. Handle Keyboard Deletion (Delete / Backspace)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;

        e.preventDefault();
        positionService.deletePosition(selectedId, symbol);
        setSelectedId(null);
      } else if (e.key === 'Escape' && activeDrawingTool) {
        onClearDrawingTool();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, symbol, activeDrawingTool, onClearDrawingTool]);

  // 4. Drag interaction handlers
  const handleStartDrag = (
    e: React.MouseEvent,
    target: DragTarget,
    pos: ChartPosition
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(pos.id);
    setDragState({
      target,
      startX: e.clientX,
      startY: e.clientY,
      initialPos: { ...pos },
    });
  };

  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      const { target, initialPos, startY, startX } = dragState;
      const deltaY = e.clientY - startY;
      const deltaX = e.clientX - startX;

      setPositions((prev) =>
        prev.map((p) => {
          if (p.id !== target.posId) return p;

          const updated = { ...p };

          if (target.type === 'tp') {
            const initialY = priceToY(initialPos.takeProfit);
            const currentY = initialY + deltaY;
            const newPrice = Math.round(yToPrice(currentY) * 100) / 100;
            if (p.type === 'LONG') {
              updated.takeProfit = Math.max(p.entryPrice + 0.1, newPrice);
            } else {
              updated.takeProfit = Math.min(p.entryPrice - 0.1, newPrice);
            }
          } else if (target.type === 'sl') {
            const initialY = priceToY(initialPos.stopLoss);
            const currentY = initialY + deltaY;
            const newPrice = Math.round(yToPrice(currentY) * 100) / 100;
            if (p.type === 'LONG') {
              updated.stopLoss = Math.min(p.entryPrice - 0.1, newPrice);
            } else {
              updated.stopLoss = Math.max(p.entryPrice + 0.1, newPrice);
            }
          } else if (target.type === 'entry') {
            const initialY = priceToY(initialPos.entryPrice);
            const currentY = initialY + deltaY;
            const newPrice = Math.round(yToPrice(currentY) * 100) / 100;
            const tpOffset = initialPos.takeProfit - initialPos.entryPrice;
            const slOffset = initialPos.stopLoss - initialPos.entryPrice;
            updated.entryPrice = newPrice;
            updated.takeProfit = Math.round((newPrice + tpOffset) * 100) / 100;
            updated.stopLoss = Math.round((newPrice + slOffset) * 100) / 100;
          } else if (target.type === 'left') {
            const initialStartX = timeToX(initialPos.startTime);
            const currentStartX = initialStartX + deltaX;
            const newStartTime = Math.round(xToTime(currentStartX));
            const initialWidth = initialPos.widthPx || 140;
            const newWidth = Math.max(40, initialWidth - deltaX);
            updated.startTime = newStartTime;
            updated.widthPx = Math.round(newWidth);
          } else if (target.type === 'right') {
            const initialWidth = initialPos.widthPx || 140;
            const newWidth = Math.max(40, initialWidth + deltaX);
            updated.widthPx = Math.round(newWidth);
          } else if (target.type === 'body') {
            const initialEntryY = priceToY(initialPos.entryPrice);
            const currentEntryY = initialEntryY + deltaY;
            const deltaPrice = Math.round((yToPrice(currentEntryY) - initialPos.entryPrice) * 100) / 100;

            const initialStartX = timeToX(initialPos.startTime);
            const currentStartX = initialStartX + deltaX;
            const deltaTime = Math.round(xToTime(currentStartX) - initialPos.startTime);

            updated.entryPrice = Math.round((initialPos.entryPrice + deltaPrice) * 100) / 100;
            updated.takeProfit = Math.round((initialPos.takeProfit + deltaPrice) * 100) / 100;
            updated.stopLoss = Math.round((initialPos.stopLoss + deltaPrice) * 100) / 100;
            updated.startTime = initialPos.startTime + deltaTime;
            updated.endTime = initialPos.endTime + deltaTime;
          }
          return updated;
        })
      );
    };

    const handleMouseUp = () => {
      const current = positions.find((p) => p.id === dragState.target.posId);
      if (current) {
        positionService.savePosition(current);
      }
      setDragState(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, positions, priceToY, timeToX, yToPrice, xToTime]);

  // 5. Handle Click on Chart to Place New Position
  const handleContainerClick = (e: React.MouseEvent) => {
    if (!activeDrawingTool) {
      if (e.target === containerRef.current) {
        setSelectedId(null);
      }
      return;
    }

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const clickPrice = yToPrice(clickY);
    const clickTime = xToTime(clickX);

    if (clickPrice <= 0) return;

    // Compact default height: ~40px risk and ~80px reward (2:1 R:R)
    const priceAt40PxBelow = yToPrice(clickY + 40);
    const defaultRisk = Math.max(0.4, Math.abs(clickPrice - priceAt40PxBelow));
    const roundedRisk = Math.round(defaultRisk * 100) / 100;
    const roundedReward = Math.round(roundedRisk * 2.0 * 100) / 100;

    const roundedEntry = Math.round(clickPrice * 100) / 100;
    const isLong = activeDrawingTool === 'LONG';

    const newPosition: ChartPosition = {
      id: `pos_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      symbol,
      type: activeDrawingTool,
      entryPrice: roundedEntry,
      takeProfit: isLong
        ? Math.round((roundedEntry + roundedReward) * 100) / 100
        : Math.round((roundedEntry - roundedReward) * 100) / 100,
      stopLoss: isLong
        ? Math.round((roundedEntry - roundedRisk) * 100) / 100
        : Math.round((roundedEntry + roundedRisk) * 100) / 100,
      startTime: Math.round(clickTime),
      endTime: Math.round(clickTime + 3600),
      widthPx: 140, // Clean, compact default width (never spans full screen)
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    positionService.savePosition(newPosition);
    setSelectedId(newPosition.id);
    onClearDrawingTool();
  };

  const handleContainerMouseMove = (e: React.MouseEvent) => {
    if (activeDrawingTool) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }
    }
  };

  // Helper step adjusters for selected position HUD
  const handleAdjustWidth = (pos: ChartPosition, deltaPx: number) => {
    const currentWidth = pos.widthPx || 140;
    const nextWidth = Math.max(40, currentWidth + deltaPx);
    const updated = { ...pos, widthPx: nextWidth, updatedAt: Date.now() };
    positionService.savePosition(updated);
  };

  const handleAdjustTP = (pos: ChartPosition, deltaPrice: number) => {
    const nextTP = Math.round((pos.takeProfit + deltaPrice) * 100) / 100;
    const updated = { ...pos, takeProfit: nextTP, updatedAt: Date.now() };
    positionService.savePosition(updated);
  };

  const handleAdjustSL = (pos: ChartPosition, deltaPrice: number) => {
    const nextSL = Math.round((pos.stopLoss + deltaPrice) * 100) / 100;
    const updated = { ...pos, stopLoss: nextSL, updatedAt: Date.now() };
    positionService.savePosition(updated);
  };

  const hudBtnStyle: React.CSSProperties = {
    background: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    color: '#ffffff',
    width: 18,
    height: 18,
    borderRadius: 3,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
    fontSize: 10,
    lineHeight: 1,
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 11,
        pointerEvents: activeDrawingTool ? 'auto' : 'none',
        cursor: activeDrawingTool ? 'crosshair' : 'default',
        overflow: 'hidden',
      }}
      onClick={handleContainerClick}
      onMouseMove={handleContainerMouseMove}
    >
      {/* Placement Preview Tooltip */}
      {activeDrawingTool && mousePos && (
        <div
          style={{
            position: 'absolute',
            left: mousePos.x + 14,
            top: mousePos.y - 12,
            background: 'rgba(15, 23, 42, 0.94)',
            border: `1px solid ${activeDrawingTool === 'LONG' ? '#089981' : '#f23645'}`,
            color: '#ffffff',
            padding: '3px 8px',
            borderRadius: 4,
            fontSize: 10.5,
            fontWeight: 700,
            fontFamily: 'JetBrains Mono, monospace',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.6)',
          }}
        >
          {activeDrawingTool === 'LONG' ? (
            <TrendingUp size={12} color="#089981" />
          ) : (
            <TrendingDown size={12} color="#f23645" />
          )}
          <span>Click to place {activeDrawingTool}</span>
        </div>
      )}

      {/* Render All Positions */}
      <svg
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
          pointerEvents: 'none',
        }}
      >
        {positions.map((pos) => {
          const startX = timeToX(pos.startTime);
          // Directly use widthPx for completely controlled width
          const boxWidth = Math.max(40, pos.widthPx || 140);

          const yEntry = priceToY(pos.entryPrice);
          const yTP = priceToY(pos.takeProfit);
          const ySL = priceToY(pos.stopLoss);

          const isSelected = selectedId === pos.id;
          const isHovered = hoveredId === pos.id;
          const isLong = pos.type === 'LONG';

          const profitY = isLong ? Math.min(yEntry, yTP) : yEntry;
          const profitHeight = Math.abs(yTP - yEntry);

          const stopY = isLong ? yEntry : Math.min(yEntry, ySL);
          const stopHeight = Math.abs(ySL - yEntry);

          const metrics = calculatePositionMetrics(pos);

          return (
            <g
              key={pos.id}
              data-position-element="true"
              style={{ pointerEvents: 'auto', cursor: isSelected ? 'move' : 'pointer' }}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedId(pos.id);
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                setSelectedId(pos.id);
              }}
              onMouseEnter={() => setHoveredId(pos.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {/* Active selection outline highlight (clearly indicates active state when clicked) */}
              {isSelected && (
                <rect
                  x={startX - 2}
                  y={Math.min(profitY, stopY) - 2}
                  width={boxWidth + 4}
                  height={profitHeight + stopHeight + 4}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  rx={4}
                  style={{ pointerEvents: 'none' }}
                />
              )}

              {/* --- 1. Target / Profit Zone Box (Green) --- */}
              <rect
                x={startX}
                y={profitY}
                width={boxWidth}
                height={profitHeight}
                fill={isSelected ? 'rgba(8, 153, 129, 0.32)' : 'rgba(8, 153, 129, 0.20)'}
                stroke={isSelected ? '#10b981' : '#089981'}
                strokeWidth={isSelected ? 1.5 : 1}
                style={{ cursor: isSelected ? 'move' : 'pointer' }}
                onMouseDown={(e) => handleStartDrag(e, { type: 'body', posId: pos.id }, pos)}
              />

              {/* --- 2. Stop Loss Zone Box (Red) --- */}
              <rect
                x={startX}
                y={stopY}
                width={boxWidth}
                height={stopHeight}
                fill={isSelected ? 'rgba(242, 54, 69, 0.32)' : 'rgba(242, 54, 69, 0.20)'}
                stroke={isSelected ? '#ef4444' : '#f23645'}
                strokeWidth={isSelected ? 1.5 : 1}
                style={{ cursor: isSelected ? 'move' : 'pointer' }}
                onMouseDown={(e) => handleStartDrag(e, { type: 'body', posId: pos.id }, pos)}
              />

              {/* --- 3. Entry Center Line (Solid Blue/White) --- */}
              <line
                x1={startX}
                y1={yEntry}
                x2={startX + boxWidth}
                y2={yEntry}
                stroke="#38bdf8"
                strokeWidth={isSelected ? 2 : 1.5}
                strokeDasharray="4 3"
              />

              {/* --- 4. Badges & Labels --- */}
              {/* Target Price Badge */}
              <rect
                x={startX + 4}
                y={yTP - (isLong ? 18 : -2)}
                width={120}
                height={16}
                rx={3}
                fill="rgba(8, 153, 129, 0.94)"
              />
              <text
                x={startX + 8}
                y={yTP - (isLong ? 6 : -14)}
                fill="#ffffff"
                fontSize={9.5}
                fontWeight="700"
                fontFamily="JetBrains Mono, monospace"
              >
                TP: {pos.takeProfit.toFixed(2)} (+{metrics.rewardPercent.toFixed(2)}%)
              </text>

              {/* Entry Price Badge */}
              <rect
                x={startX + 4}
                y={yEntry - 8}
                width={98}
                height={16}
                rx={3}
                fill="rgba(15, 23, 42, 0.94)"
                stroke="#38bdf8"
                strokeWidth={1}
              />
              <text
                x={startX + 8}
                y={yEntry + 4}
                fill="#38bdf8"
                fontSize={9.5}
                fontWeight="700"
                fontFamily="JetBrains Mono, monospace"
              >
                Entry: {pos.entryPrice.toFixed(2)}
              </text>

              {/* Stop Loss Price Badge */}
              <rect
                x={startX + 4}
                y={ySL + (isLong ? 2 : -18)}
                width={120}
                height={16}
                rx={3}
                fill="rgba(242, 54, 69, 0.94)"
              />
              <text
                x={startX + 8}
                y={ySL + (isLong ? 14 : -6)}
                fill="#ffffff"
                fontSize={9.5}
                fontWeight="700"
                fontFamily="JetBrains Mono, monospace"
              >
                SL: {pos.stopLoss.toFixed(2)} (-{metrics.riskPercent.toFixed(2)}%)
              </text>

              {/* Center Info Badge: Risk / Reward Ratio */}
              <g
                transform={`translate(${startX + boxWidth / 2 - 45}, ${yEntry - 10})`}
                style={{ pointerEvents: 'none' }}
              >
                <rect
                  width={90}
                  height={20}
                  rx={3}
                  fill="rgba(10, 15, 26, 0.94)"
                  stroke={isSelected ? '#38bdf8' : 'rgba(255, 255, 255, 0.25)'}
                  strokeWidth={1}
                />
                <text
                  x={45}
                  y={14}
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize={10}
                  fontWeight="700"
                  fontFamily="JetBrains Mono, monospace"
                >
                  R:R {metrics.riskRewardRatio.toFixed(2)}
                </text>
              </g>

              {/* --- 5. Interactive Drag Handles: ONLY SHOWN WHEN ACTIVE / SELECTED --- */}
              {isSelected && (
                <>
                  {/* Top Handle (Take Profit or Stop Loss) */}
                  <circle
                    cx={startX + boxWidth / 2}
                    cy={isLong ? yTP : ySL}
                    r={5.5}
                    fill={isLong ? '#089981' : '#f23645'}
                    stroke="#ffffff"
                    strokeWidth={2}
                    style={{ cursor: 'ns-resize' }}
                    onMouseDown={(e) =>
                      handleStartDrag(e, { type: isLong ? 'tp' : 'sl', posId: pos.id }, pos)
                    }
                  />

                  {/* Bottom Handle (Stop Loss or Take Profit) */}
                  <circle
                    cx={startX + boxWidth / 2}
                    cy={isLong ? ySL : yTP}
                    r={5.5}
                    fill={isLong ? '#f23645' : '#089981'}
                    stroke="#ffffff"
                    strokeWidth={2}
                    style={{ cursor: 'ns-resize' }}
                    onMouseDown={(e) =>
                      handleStartDrag(e, { type: isLong ? 'sl' : 'tp', posId: pos.id }, pos)
                    }
                  />

                  {/* Middle Handle (Entry) */}
                  <circle
                    cx={startX + boxWidth / 2}
                    cy={yEntry}
                    r={5.5}
                    fill="#38bdf8"
                    stroke="#ffffff"
                    strokeWidth={2}
                    style={{ cursor: 'ns-resize' }}
                    onMouseDown={(e) =>
                      handleStartDrag(e, { type: 'entry', posId: pos.id }, pos)
                    }
                  />

                  {/* Left Handle (Adjust Start Time / Left Edge) */}
                  <circle
                    cx={startX}
                    cy={yEntry}
                    r={5.5}
                    fill="#ffffff"
                    stroke="#0284c7"
                    strokeWidth={2}
                    style={{ cursor: 'ew-resize' }}
                    onMouseDown={(e) =>
                      handleStartDrag(e, { type: 'left', posId: pos.id }, pos)
                    }
                  />

                  {/* Right Handle (Adjust Width / Length) */}
                  <circle
                    cx={startX + boxWidth}
                    cy={yEntry}
                    r={5.5}
                    fill="#ffffff"
                    stroke="#0284c7"
                    strokeWidth={2}
                    style={{ cursor: 'ew-resize' }}
                    onMouseDown={(e) =>
                      handleStartDrag(e, { type: 'right', posId: pos.id }, pos)
                    }
                  />
                </>
              )}
            </g>
          );
        })}
      </svg>

      {/* Floating Action & Custom Dimension HUD for Selected Position */}
      {selectedId && (() => {
        const sel = positions.find((p) => p.id === selectedId);
        if (!sel) return null;

        const startX = timeToX(sel.startTime);
        const yTop = Math.min(priceToY(sel.takeProfit), priceToY(sel.stopLoss), priceToY(sel.entryPrice));
        const hudX = Math.max(10, Math.min(width - 330, startX));
        const hudY = Math.max(10, yTop - 38);

        const currentWidth = sel.widthPx || 140;
        const metrics = calculatePositionMetrics(sel);

        return (
          <div
            data-position-hud="true"
            style={{
              position: 'absolute',
              left: hudX,
              top: hudY,
              zIndex: 25,
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              background: 'rgba(15, 23, 42, 0.96)',
              border: `1.5px solid ${sel.type === 'LONG' ? '#089981' : '#f23645'}`,
              borderRadius: 6,
              padding: '3px 9px',
              boxShadow: '0 4px 18px rgba(0, 0, 0, 0.8), 0 0 10px rgba(56, 189, 248, 0.2)',
              fontFamily: 'JetBrains Mono, monospace',
              pointerEvents: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* Type badge */}
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: sel.type === 'LONG' ? '#089981' : '#f23645',
              }}
            >
              {sel.type}
            </span>

            <div style={{ width: 1, height: 12, background: 'rgba(255, 255, 255, 0.15)' }} />

            {/* Custom Width Stepper */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 9, color: '#94a3b8' }}>Width:</span>
              <button
                type="button"
                onClick={() => handleAdjustWidth(sel, -25)}
                style={hudBtnStyle}
                title="Decrease Width (-25px)"
              >
                <Minus size={9} />
              </button>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: '#f1f5f9' }}>{currentWidth}px</span>
              <button
                type="button"
                onClick={() => handleAdjustWidth(sel, 25)}
                style={hudBtnStyle}
                title="Increase Width (+25px)"
              >
                <Plus size={9} />
              </button>
            </div>

            <div style={{ width: 1, height: 12, background: 'rgba(255, 255, 255, 0.15)' }} />

            {/* Custom TP Stepper */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 9, color: '#089981' }}>TP:</span>
              <button
                type="button"
                onClick={() => handleAdjustTP(sel, sel.type === 'LONG' ? -0.5 : 0.5)}
                style={hudBtnStyle}
                title="Decrease TP"
              >
                <Minus size={9} />
              </button>
              <button
                type="button"
                onClick={() => handleAdjustTP(sel, sel.type === 'LONG' ? 0.5 : -0.5)}
                style={hudBtnStyle}
                title="Increase TP"
              >
                <Plus size={9} />
              </button>
            </div>

            <div style={{ width: 1, height: 12, background: 'rgba(255, 255, 255, 0.15)' }} />

            {/* Custom SL Stepper */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 9, color: '#f23645' }}>SL:</span>
              <button
                type="button"
                onClick={() => handleAdjustSL(sel, sel.type === 'LONG' ? 0.5 : -0.5)}
                style={hudBtnStyle}
                title="Decrease SL"
              >
                <Minus size={9} />
              </button>
              <button
                type="button"
                onClick={() => handleAdjustSL(sel, sel.type === 'LONG' ? -0.5 : 0.5)}
                style={hudBtnStyle}
                title="Increase SL"
              >
                <Plus size={9} />
              </button>
            </div>

            <div style={{ width: 1, height: 12, background: 'rgba(255, 255, 255, 0.15)' }} />

            {/* R:R Ratio */}
            <span style={{ fontSize: 9.5, fontWeight: 700, color: '#38bdf8' }}>
              R:R {metrics.riskRewardRatio.toFixed(2)}
            </span>

            <div style={{ width: 1, height: 12, background: 'rgba(255, 255, 255, 0.15)' }} />

            {/* Delete button (only visible when selected/active) */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                positionService.deletePosition(sel.id, symbol);
                setSelectedId(null);
              }}
              title="Delete Position Tool (Delete / Backspace)"
              style={{
                background: 'rgba(239, 68, 68, 0.20)',
                border: '1px solid rgba(239, 68, 68, 0.45)',
                color: '#f87171',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 7px',
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              <Trash2 size={11} color="#f87171" />
              <span>Delete</span>
            </button>
          </div>
        );
      })()}
    </div>
  );
};
