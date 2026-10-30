/**
 * Trade Bubble & Crosshair Tooltip Overlay
 * JARVIS HEATMAP TERMINAL
 */

import React from 'react';
import { LiquidityZone, TradeBubble } from '../../types/heatmap';
import { FootprintDebugInfo } from '../../types/footprint';
import { AbsorptionEvent } from '../../types/absorption';
import { AbsorptionTooltip } from './AbsorptionTooltip';
import { formatNotional, formatPrice, formatQuantity, formatTimePrecise } from '../../utils/formatters';

interface CrosshairOverlayProps {
  hoveredBubble: TradeBubble | null;
  hoveredZone?: LiquidityZone | null;
  hoveredFootprintDebug?: FootprintDebugInfo | null;
  hoveredAbsorption?: AbsorptionEvent | null;
  cursorX: number;
  cursorY: number;
  symbol?: string;
}

export const CrosshairOverlay: React.FC<CrosshairOverlayProps> = ({
  hoveredBubble,
  hoveredZone,
  hoveredFootprintDebug,
  hoveredAbsorption,
  cursorX,
  cursorY,
  symbol = 'XAUUSD',
}) => {
  if (hoveredAbsorption) {
    return (
      <AbsorptionTooltip
        event={hoveredAbsorption}
        cursorX={cursorX}
        cursorY={cursorY}
      />
    );
  }

  if (!hoveredBubble && !hoveredZone && !hoveredFootprintDebug) return null;

  const symUpper = symbol.toUpperCase();
  const unitLabel = symUpper.includes('XAU') || symUpper === 'GC'
    ? 'oz'
    : symUpper.includes('BTC')
    ? 'BTC'
    : symUpper.includes('ETH')
    ? 'ETH'
    : symUpper.includes('SOL')
    ? 'SOL'
    : 'contracts';

  // Position tooltip safely within screen bounds
  const left = Math.min(window.innerWidth - 300, cursorX + 16);
  const top = Math.max(10, Math.min(window.innerHeight - 360, cursorY - 110));

  const formatIST = (tsSecOrMs: number) => {
    const ms = tsSecOrMs < 1e11 ? tsSecOrMs * 1000 : tsSecOrMs;
    const d = new Date(ms);
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(d) + ' IST';
  };

  if (hoveredFootprintDebug && !hoveredBubble && !hoveredZone) {
    const dbg = hoveredFootprintDebug;
    const deltaSign = dbg.delta > 0 ? '+' : '';
    const deltaColor = dbg.delta > 0 ? '#10b981' : dbg.delta < 0 ? '#ef4444' : '#94a3b8';

    return (
      <div
        className="jarvis-tooltip"
        style={{
          left: `${left}px`,
          top: `${top}px`,
          minWidth: '280px',
          maxWidth: '320px',
          borderLeft: `3px solid ${dbg.isPoc ? '#f59e0b' : '#38bdf8'}`,
          background: 'rgba(10, 15, 26, 0.95)',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.7)',
          padding: '10px 12px',
          borderRadius: 6,
          fontFamily: "'JetBrains Mono', 'Inter', monospace",
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#38bdf8', fontSize: 10, fontWeight: 800, letterSpacing: '0.05em' }}>FOOTPRINT DEBUG</span>
            <span style={{ fontSize: 9, color: '#94a3b8' }}>{dbg.timeframe}</span>
          </div>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              padding: '1px 5px',
              borderRadius: 3,
              background: dbg.sourceDataValidity.includes('Live')
                ? 'rgba(0, 230, 118, 0.2)'
                : 'rgba(56, 189, 248, 0.2)',
              color: dbg.sourceDataValidity.includes('Live') ? '#00e676' : '#38bdf8',
            }}
          >
            {dbg.sourceDataValidity}
          </span>
        </div>

        {/* Candle Time Span */}
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', fontSize: 10, marginBottom: 4 }}>
          <span style={{ color: '#64748b' }}>Candle:</span>
          <span style={{ color: '#f1f5f9', fontWeight: 600 }}>
            {formatIST(dbg.candleStart)} – {formatIST(dbg.candleEnd)}
          </span>
        </div>

        {/* Price Bucket Bounds */}
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', fontSize: 11, marginBottom: 4, background: 'rgba(255,255,255,0.03)', padding: '3px 6px', borderRadius: 4 }}>
          <span style={{ color: '#94a3b8' }}>Price Bucket:</span>
          <span style={{ color: '#38bdf8', fontWeight: 700 }}>
            ${dbg.bucketMin.toFixed(2)} – ${dbg.bucketMax.toFixed(2)}
          </span>
        </div>

        {/* Screen Coordinate Verification */}
        <div style={{ marginBottom: 6, padding: '4px 6px', background: 'rgba(0, 180, 216, 0.06)', borderRadius: 4, border: '1px solid rgba(0, 180, 216, 0.15)' }}>
          <div style={{ fontSize: 9, color: '#00b4d8', fontWeight: 700, marginBottom: 2 }}>
            COORDINATE ALIGNMENT (1:1 SCALE)
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8' }}>
            <span>Screen Mouse Y:</span>
            <span style={{ color: '#f1f5f9', fontWeight: 600 }}>{dbg.mouseScreenY.toFixed(1)} px</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8' }}>
            <span>Bucket Box Y:</span>
            <span style={{ color: '#f1f5f9' }}>{dbg.calcScreenYTop.toFixed(1)} – {dbg.calcScreenYBottom.toFixed(1)} px</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8' }}>
            <span>Bucket Height / Center:</span>
            <span style={{ color: '#00e676' }}>
              {(dbg.calcScreenYBottom - dbg.calcScreenYTop).toFixed(1)} px @ {dbg.calcScreenYCenter.toFixed(1)} px
            </span>
          </div>
        </div>

        {/* Volume & Delta Breakdown */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
          <span style={{ color: '#94a3b8' }}>Bid × Ask Volume:</span>
          <span>
            <strong style={{ color: '#ef4444' }}>{Math.round(dbg.bidVolume)}</strong>
            <span style={{ color: '#64748b', margin: '0 4px' }}>×</span>
            <strong style={{ color: '#10b981' }}>{Math.round(dbg.askVolume)}</strong>
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
          <span style={{ color: '#94a3b8' }}>Total Executed Vol:</span>
          <span style={{ color: '#f1f5f9', fontWeight: 600 }}>{Math.round(dbg.totalVolume)}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
          <span style={{ color: '#94a3b8' }}>Level Delta:</span>
          <span style={{ color: deltaColor, fontWeight: 700 }}>
            {deltaSign}{Math.round(Math.abs(dbg.delta))}
          </span>
        </div>

        {/* Status Badges: POC & Imbalance */}
        <div style={{ display: 'flex', gap: 6, marginTop: 4, paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '2px 4px',
              borderRadius: 3,
              fontSize: 9,
              fontWeight: 700,
              background: dbg.isPoc ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.03)',
              color: dbg.isPoc ? '#f59e0b' : '#64748b',
              border: `1px solid ${dbg.isPoc ? '#f59e0b' : 'transparent'}`,
            }}
          >
            {dbg.isPoc ? 'POC LEVEL' : `POC @ $${dbg.pocPrice.toFixed(1)}`}
          </div>

          <div
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '2px 4px',
              borderRadius: 3,
              fontSize: 9,
              fontWeight: 700,
              background: dbg.isAskImbalance
                ? 'rgba(34, 197, 94, 0.2)'
                : dbg.isBidImbalance
                ? 'rgba(244, 63, 94, 0.2)'
                : 'rgba(255,255,255,0.03)',
              color: dbg.isAskImbalance
                ? '#22c55e'
                : dbg.isBidImbalance
                ? '#f43f5e'
                : '#64748b',
            }}
          >
            {dbg.isAskImbalance ? 'ASK IMBALANCE' : dbg.isBidImbalance ? 'BID IMBALANCE' : 'BALANCED'}
          </div>
        </div>
      </div>
    );
  }

  if (hoveredZone && !hoveredBubble) {
    const isBid = hoveredZone.isBid;
    const centerPrice = hoveredZone.centerPrice;
    const notional = hoveredZone.currentObservedQty * centerPrice;
    const durSec = Math.round(hoveredZone.persistenceDurationMs / 1000);
    const durText = durSec >= 60 ? `${Math.floor(durSec / 60)}m ${durSec % 60}s` : `${durSec}s`;

    const formatIST = (ts: number) => {
      const d = new Date(ts);
      return new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(d) + ' IST';
    };

    return (
      <div
        className="jarvis-tooltip"
        style={{
          left: `${left}px`,
          top: `${top}px`,
          minWidth: '240px',
          borderLeft: `3px solid ${isBid ? '#00e676' : '#ff2d55'}`,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ color: '#94a3b8', fontSize: 10, fontWeight: 700 }}>LIQUIDITY ZONE</span>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              padding: '1px 5px',
              borderRadius: 3,
              background:
                hoveredZone.state === 'active'
                  ? 'rgba(0, 230, 118, 0.2)'
                  : hoveredZone.state === 'weakening'
                  ? 'rgba(255, 179, 0, 0.2)'
                  : 'rgba(148, 163, 184, 0.2)',
              color:
                hoveredZone.state === 'active'
                  ? '#00e676'
                  : hoveredZone.state === 'weakening'
                  ? '#ffb300'
                  : '#94a3b8',
              textTransform: 'uppercase',
            }}
          >
            {hoveredZone.state}
          </span>
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>
          ${hoveredZone.priceMin.toFixed(2)} – ${hoveredZone.priceMax.toFixed(2)}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', fontSize: 11, marginBottom: 2 }}>
          <span>Side:</span>
          <span style={{ color: isBid ? '#00e676' : '#ff2d55', fontWeight: 700 }}>
            {isBid ? 'Resting Bid Wall' : 'Resting Ask Wall'}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', fontSize: 11, marginBottom: 2 }}>
          <span>Current Size:</span>
          <span style={{ fontWeight: 600, color: '#38bdf8' }}>{hoveredZone.currentObservedQty.toFixed(2)} {unitLabel}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', fontSize: 11, marginBottom: 2 }}>
          <span>Notional Value:</span>
          <span style={{ fontWeight: 600 }}>${Math.round(notional).toLocaleString()}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', fontSize: 11, marginBottom: 2 }}>
          <span>Peak Size:</span>
          <span>{hoveredZone.maxObservedQty.toFixed(2)} {unitLabel}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', fontSize: 11, marginBottom: 2 }}>
          <span>Significance:</span>
          <span style={{ fontWeight: 700, color: '#fbbf24' }}>{hoveredZone.relativeSignificance}%</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', fontSize: 11, marginBottom: 4 }}>
          <span>Persistence:</span>
          <span>{durText} ({hoveredZone.observationCount} ticks)</span>
        </div>

        <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 9, color: '#64748b' }}>
          <div>First: {formatIST(hoveredZone.firstObservedTime)}</div>
          <div>Last: {formatIST(hoveredZone.lastObservedTime)}</div>
        </div>
      </div>
    );
  }

  if (!hoveredBubble) return null;

  const buyPct = (hoveredBubble.buyRatio * 100).toFixed(1);
  const sellPct = ((1 - hoveredBubble.buyRatio) * 100).toFixed(1);

  return (
    <div
      className="jarvis-tooltip"
      style={{
        left: `${left}px`,
        top: `${top}px`,
        minWidth: '220px',
        borderLeft: `3px solid ${hoveredBubble.dominantSide === 'buy' ? '#00e676' : '#ff2d55'}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ color: '#94a3b8', fontSize: 10 }}>TRADE AGGREGATION</span>
        <span style={{ color: '#00b4d8', fontWeight: 600 }}>{symUpper}</span>
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>
        {formatPrice(hoveredBubble.price)} USD
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', fontSize: 11, marginBottom: 2 }}>
        <span>Total Volume:</span>
        <span style={{ fontWeight: 600 }}>{formatQuantity(hoveredBubble.totalQty, 3)} {unitLabel}</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', fontSize: 11, marginBottom: 2 }}>
        <span>Notional:</span>
        <span style={{ color: '#38bdf8', fontWeight: 600 }}>{formatNotional(hoveredBubble.totalNotional)}</span>
      </div>

      {hoveredBubble.tradeCount > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', fontSize: 11, marginBottom: 4 }}>
          <span>Trades Count:</span>
          <span>{hoveredBubble.tradeCount} fills</span>
        </div>
      )}

      {/* Buy vs Sell breakdown bar */}
      <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 3 }}>
          <span style={{ color: '#00e676' }}>Buy {buyPct}%</span>
          <span style={{ color: '#ff2d55' }}>Sell {sellPct}%</span>
        </div>
        <div style={{ height: 4, width: '100%', background: '#ff2d55', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${buyPct}%`, background: '#00e676' }} />
        </div>
      </div>

      <div style={{ marginTop: 6, fontSize: 10, color: '#64748b', textAlign: 'right' }}>
        {formatTimePrecise(hoveredBubble.timestamp)}
      </div>
    </div>
  );
};
