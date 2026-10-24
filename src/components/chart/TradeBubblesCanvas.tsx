/**
 * High-Performance Bookmap 3D Trade Bubbles Canvas Overlay
 * Rendered on TOP of Candlesticks (zIndex: 4) so trade aggression is never obscured.
 * Aligned 1:1 with Lightweight Charts time and price scale.
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { TradeBubbleManager } from '../../services/bubbles/TradeBubbleManager';
import { BubbleSettings, TradeBubble } from '../../types/heatmap';

interface TradeBubblesCanvasProps {
  chart: IChartApi | null;
  series: ISeriesApi<'Candlestick'> | null;
  bubbleManager: TradeBubbleManager;
  bubbleSettings: BubbleSettings;
  showCandles?: boolean;
  onUpdateBubbleCoords?: (coords: Array<{ bubble: TradeBubble; cx: number; cy: number; radius: number }>) => void;
  width: number;
  height: number;
}

const TradeBubblesCanvasComponent: React.FC<TradeBubblesCanvasProps> = ({
  chart,
  series,
  bubbleManager,
  bubbleSettings,
  showCandles = true,
  onUpdateBubbleCoords,
  width,
  height,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isDirtyRef = useRef<boolean>(true);
  const lastRenderTimeRef = useRef<number>(0);
  const visibleBubblesWithCoordsRef = useRef<
    Array<{ bubble: TradeBubble; cx: number; cy: number; radius: number }>
  >([]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !chart || !series || width <= 0 || height <= 0) return;

    if (bubbleSettings.enabled === false) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, width, height);
      return;
    }

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

    const timeScale = chart.timeScale();
    const visibleRange = timeScale.getVisibleRange();

    let tFromSec = 0;
    let tToSec = 0;

    if (visibleRange) {
      tFromSec = typeof visibleRange.from === 'number'
        ? visibleRange.from
        : (visibleRange.from as any).timestamp || 0;
      tToSec = typeof visibleRange.to === 'number'
        ? visibleRange.to
        : (visibleRange.to as any).timestamp || 0;
    }

    if (tFromSec === 0 || tToSec === 0 || tToSec <= tFromSec) {
      const now = Math.floor(Date.now() / 1000);
      tFromSec = now - 3600;
      tToSec = now + 300;
    }

    const timeDiff = tToSec - tFromSec;
    const timeToX = (tSec: number): number => {
      const coord = timeScale.timeToCoordinate(tSec as any);
      if (coord !== null) return coord;
      return ((tSec - tFromSec) / timeDiff) * width;
    };

    const priceToY = (p: number): number => {
      const coord = series.priceToCoordinate(p);
      if (coord !== null) return coord;
      return -9999;
    };

    const rawBubbles = bubbleManager.getVisibleBubbles(
      (tFromSec - 1800) * 1000,
      (tToSec + 1800) * 1000,
      bubbleSettings
    );

    const bubbles = rawBubbles.slice().sort((a, b) => a.timestamp - b.timestamp);

    // 1. Bookmap Price Trail Line (Connecting trades when candles are hidden)
    if (!showCandles && bubbles.length > 1) {
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.75)';
      ctx.lineWidth = 1.3;
      let started = false;
      for (const b of bubbles) {
        const bx = timeToX(b.timestamp / 1000);
        const by = priceToY(b.price);
        if (bx < -60 || bx > width + 60) continue;
        if (!started) {
          ctx.moveTo(bx, by);
          started = true;
        } else {
          ctx.lineTo(bx, by);
        }
      }
      ctx.stroke();
      ctx.restore();
    }

    // 2. Render 3D Trade Bubbles floating on top of candles
    const bubbleCoords: Array<{ bubble: TradeBubble; cx: number; cy: number; radius: number }> = [];

    for (const b of bubbles) {
      const x = timeToX(b.timestamp / 1000);
      const y = priceToY(b.price);
      if (x < -60 || x > width - 40 || y < -60 || y > height + 60) continue;

      const radius = bubbleManager.calculateRadius(b, bubbleSettings);
      bubbleCoords.push({ bubble: b, cx: x, cy: y, radius });

      ctx.save();
      ctx.globalAlpha = bubbleSettings.opacity;

      const buyRatio = b.buyRatio;

      if (bubbleSettings.render3DStyle) {
        if (buyRatio >= 0.95) {
          // Pure Buy Sphere (Green)
          draw3DSphere(ctx, x, y, radius, '#00e676', '#007a3d', '#a7f3d0');
        } else if (buyRatio <= 0.05) {
          // Pure Sell Sphere (Red)
          draw3DSphere(ctx, x, y, radius, '#ff2d55', '#990022', '#ff8fa3');
        } else {
          // Two-tone split sphere: Red lower / Green upper matching Bookmap reference
          drawSplit3DSphere(ctx, x, y, radius, buyRatio);
        }
      } else {
        // Flat style
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = b.dominantSide === 'buy' ? 'rgba(0, 230, 118, 0.85)' : 'rgba(255, 45, 85, 0.85)';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Display total amount traded clearly inside the 3D bubble
      if (radius >= 7) {
        ctx.save();
        const amountText = formatBubbleAmount(b.totalQty, b.totalNotional, radius);
        const fontSize = Math.max(8, Math.min(13, Math.round(radius * 0.52)));
        ctx.font = `bold ${fontSize}px JetBrains Mono, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';

        if (amountText.secondary && radius >= 22) {
          ctx.fillText(amountText.primary, x, y - Math.round(fontSize * 0.45));
          ctx.font = `bold ${Math.max(7, Math.round(fontSize * 0.72))}px JetBrains Mono, monospace`;
          ctx.fillStyle = '#e2e8f0';
          ctx.fillText(amountText.secondary, x, y + Math.round(fontSize * 0.65));
        } else {
          ctx.fillText(amountText.primary, x, y);
        }
        ctx.restore();
      }

      ctx.restore();
    }

    visibleBubblesWithCoordsRef.current = bubbleCoords;
    onUpdateBubbleCoords?.(bubbleCoords);
    ctx.restore();
  }, [
    chart,
    series,
    width,
    height,
    bubbleManager,
    bubbleSettings,
    showCandles,
    onUpdateBubbleCoords,
  ]);

  // RequestAnimationFrame Render Loop
  useEffect(() => {
    if (bubbleSettings.enabled === false) return;
    let active = true;

    const loop = () => {
      if (!active) return;
      const now = performance.now();
      if (isDirtyRef.current) {
        if (now - lastRenderTimeRef.current >= 30) {
          lastRenderTimeRef.current = now;
          render();
          isDirtyRef.current = false;
        }
      }
      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      active = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [render, bubbleSettings.enabled]);

  // Event Subscriptions
  useEffect(() => {
    const unsubBubbles = bubbleManager.subscribe(() => {
      isDirtyRef.current = true;
    });

    if (chart) {
      const handleRange = () => {
        isDirtyRef.current = true;
      };
      chart.timeScale().subscribeVisibleTimeRangeChange(handleRange);
      chart.timeScale().subscribeVisibleLogicalRangeChange(handleRange);

      return () => {
        unsubBubbles();
        chart.timeScale().unsubscribeVisibleTimeRangeChange(handleRange);
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleRange);
      };
    }

    return () => {
      unsubBubbles();
    };
  }, [chart, bubbleManager]);

  useEffect(() => {
    isDirtyRef.current = true;
  }, [width, height, bubbleSettings, showCandles]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 6, // Higher than Footprint Canvas (zIndex: 5) and Candlesticks (zIndex: 2) -> Bubbles render ON TOP
        pointerEvents: 'none',
      }}
    />
  );
};

/**
 * 3D Photorealistic Sphere with ambient, diffuse, and specular illumination
 */
function draw3DSphere(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  mainColor: string,
  shadowColor: string,
  highlightColor: string
): void {
  const grad = ctx.createRadialGradient(
    x - radius * 0.35,
    y - radius * 0.35,
    radius * 0.08,
    x,
    y,
    radius
  );
  grad.addColorStop(0, highlightColor);
  grad.addColorStop(0.3, mainColor);
  grad.addColorStop(0.85, shadowColor);
  grad.addColorStop(1, '#090d16');

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

/**
 * Bookmap Two-Tone 3D Split Sphere (Buyer green upper / Seller red lower)
 */
function drawSplit3DSphere(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  buyRatio: number
): void {
  // 1. Draw base red sphere (seller volume)
  const redGrad = ctx.createRadialGradient(
    x - radius * 0.35,
    y - radius * 0.35,
    radius * 0.08,
    x,
    y,
    radius
  );
  redGrad.addColorStop(0, '#ff8fa3');
  redGrad.addColorStop(0.3, '#ff2d55');
  redGrad.addColorStop(0.85, '#990022');
  redGrad.addColorStop(1, '#2b0008');

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = redGrad;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);

  // 2. Draw top green portion (buyer volume)
  if (buyRatio > 0.02) {
    const splitY = y + radius * (1 - buyRatio * 2);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - radius, y - radius, radius * 2, splitY - (y - radius));
    ctx.clip();

    const greenGrad = ctx.createRadialGradient(
      x - radius * 0.35,
      y - radius * 0.35,
      radius * 0.08,
      x,
      y,
      radius
    );
    greenGrad.addColorStop(0, '#a7f3d0');
    greenGrad.addColorStop(0.3, '#00e676');
    greenGrad.addColorStop(0.85, '#007a3d');
    greenGrad.addColorStop(1, '#002914');

    ctx.fillStyle = greenGrad;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.restore();
  }

  // 3. Specular highlight
  const specGrad = ctx.createRadialGradient(
    x - radius * 0.35,
    y - radius * 0.35,
    radius * 0.05,
    x - radius * 0.35,
    y - radius * 0.35,
    radius * 0.65
  );
  specGrad.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
  specGrad.addColorStop(0.3, 'rgba(255, 255, 255, 0.25)');
  specGrad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');

  ctx.fillStyle = specGrad;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);

  ctx.restore();

  // 4. Subtle glass rim edge
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function formatBubbleAmount(
  qty: number,
  notional?: number,
  radius: number = 20
): { primary: string; secondary?: string } {
  let primary = '';
  if (qty >= 1000) {
    primary = `${(qty / 1000).toFixed(1)}k`;
  } else if (qty >= 100) {
    primary = `${Math.round(qty)}`;
  } else if (qty >= 10) {
    primary = qty.toFixed(1);
  } else {
    primary = qty.toFixed(2);
  }

  let secondary: string | undefined = undefined;
  if (radius >= 22 && notional && notional > 0) {
    if (notional >= 1000000) {
      secondary = `$${(notional / 1000000).toFixed(1)}M`;
    } else if (notional >= 1000) {
      secondary = `$${Math.round(notional / 1000)}k`;
    }
  }

  return { primary, secondary };
}

export const TradeBubblesCanvas = React.memo(TradeBubblesCanvasComponent);
