/**
 * Absorption Detail Tooltip / HUD Panel
 * Displays verified order-flow evidence and data quality upon hovering or clicking an absorption bubble.
 * JARVIS HEATMAP TERMINAL - ORDER FLOW ABSORPTION
 */

import React from 'react';
import { AbsorptionEvent } from '../../types/absorption';
import { formatNotional, formatPrice, formatQuantity } from '../../utils/formatters';
import { ShieldCheck, Target, Zap, Clock, Activity, BarChart2 } from 'lucide-react';

interface AbsorptionTooltipProps {
  event: AbsorptionEvent | null;
  cursorX: number;
  cursorY: number;
}

export const AbsorptionTooltip: React.FC<AbsorptionTooltipProps> = ({
  event,
  cursorX,
  cursorY,
}) => {
  if (!event) return null;

  const isBuyAbs = event.type === 'buy_absorption';
  const isAPlus = event.grade === 'A+';

  // Format timestamp (IST & UTC)
  const dateObj = new Date(event.timestamp);
  const timeIST = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hour12: false,
  }).format(dateObj) + ' IST';

  // Safe screen boundary positioning
  const left = Math.min(window.innerWidth - 320, cursorX + 16);
  const top = Math.max(10, Math.min(window.innerHeight - 440, cursorY - 120));

  return (
    <div
      className="jarvis-tooltip"
      style={{
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        width: '300px',
        background: 'rgba(11, 17, 29, 0.96)',
        backdropFilter: 'blur(10px)',
        border: `1.5px solid ${isAPlus ? '#ffd700' : '#facc15'}`,
        borderLeft: `4px solid ${isAPlus ? '#ffd700' : '#facc15'}`,
        borderRadius: 8,
        boxShadow: isAPlus
          ? '0 12px 36px rgba(0, 0, 0, 0.8), 0 0 16px rgba(250, 204, 21, 0.35)'
          : '0 8px 32px rgba(0, 0, 0, 0.7)',
        padding: '12px 14px',
        color: '#f8fafc',
        fontFamily: "'JetBrains Mono', 'Inter', monospace",
        zIndex: 50,
        pointerEvents: 'none',
      }}
    >
      {/* Header Badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          paddingBottom: 8,
          marginBottom: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              background: isAPlus ? 'linear-gradient(135deg, #ffd700, #facc15)' : '#facc15',
              color: '#0f172a',
              fontSize: 11,
              fontWeight: 900,
              padding: '2px 7px',
              borderRadius: 4,
              letterSpacing: '0.05em',
            }}
          >
            GRADE {event.grade}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: isBuyAbs ? '#00e676' : '#ff2d55',
            }}
          >
            {isBuyAbs ? 'BUY-SIDE ABSORPTION' : 'SELL-SIDE ABSORPTION'}
          </span>
        </div>

        <span
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            color: '#38bdf8',
            background: 'rgba(56, 189, 248, 0.15)',
            padding: '2px 5px',
            borderRadius: 3,
          }}
        >
          {event.score}/100 CONF
        </span>
      </div>

      {/* Main Stats Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11 }}>
        {/* Price & Instrument */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#94a3b8' }}>Price Level:</span>
          <span style={{ fontWeight: 700, color: '#ffffff' }}>
            ${formatPrice(event.price)}
          </span>
        </div>

        {/* Timestamp */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#94a3b8' }}>Event Time:</span>
          <span style={{ color: '#cbd5e1', fontSize: 10 }}>{timeIST}</span>
        </div>

        {/* Absorbed Volume */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#94a3b8' }}>Total Absorbed:</span>
          <span style={{ fontWeight: 800, color: '#facc15' }}>
            {formatQuantity(event.totalAbsorbedVolume)} lots
          </span>
        </div>

        {/* Aggressor Breakdown */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#94a3b8' }}>Aggressor Side:</span>
          <span style={{ color: isBuyAbs ? '#ff2d55' : '#00e676', fontWeight: 600 }}>
            {isBuyAbs
              ? `${formatQuantity(event.aggressiveSellVolume)} Sells (${Math.round((event.aggressiveSellVolume / event.totalAbsorbedVolume) * 100)}%)`
              : `${formatQuantity(event.aggressiveBuyVolume)} Buys (${Math.round((event.aggressiveBuyVolume / event.totalAbsorbedVolume) * 100)}%)`}
          </span>
        </div>

        {/* Number of Executions */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#94a3b8' }}>Executions:</span>
          <span style={{ color: '#e2e8f0' }}>{event.tradeCount} trades</span>
        </div>

        {/* Price Displacement */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#94a3b8' }}>Price Displacement:</span>
          <span
            style={{
              color: event.priceDisplacementTicks <= 1 ? '#00e676' : '#fbbf24',
              fontWeight: 700,
            }}
          >
            {event.priceDisplacementTicks === 0 ? '0.0 ticks (Solid Halt)' : `${event.priceDisplacementTicks} ticks`}
          </span>
        </div>

        {/* Defended Liquidity Zone */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#94a3b8' }}>Defended Zone:</span>
          <span style={{ color: '#38bdf8', fontSize: 10, textAlign: 'right', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={event.zoneDescription}>
            {event.zoneDescription}
          </span>
        </div>

        {/* Hold Duration */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#94a3b8' }}>Hold Duration:</span>
          <span style={{ color: '#cbd5e1' }}>{event.holdDurationMs} ms</span>
        </div>

        {/* Replenishment */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#94a3b8' }}>Replenishment:</span>
          <span
            style={{
              color: event.replenishmentObserved ? '#00e676' : '#94a3b8',
              fontWeight: event.replenishmentObserved ? 700 : 400,
            }}
          >
            {event.replenishmentObserved ? `Observed (${(event.replenishmentRatio * 100).toFixed(0)}% depth)` : 'Not Observed'}
          </span>
        </div>

        {/* Data Source & Status */}
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: 5, marginTop: 2 }}>
          <span style={{ color: '#64748b', fontSize: 9.5 }}>Data Quality:</span>
          <span style={{ color: '#22c55e', fontSize: 9.5, fontWeight: 700 }}>Authoritative Tick & L2</span>
        </div>
      </div>

      {/* Transparent Disclaimer */}
      <div
        style={{
          marginTop: 8,
          paddingTop: 6,
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          fontSize: 8.5,
          color: '#64748b',
          lineHeight: '1.25',
          fontStyle: 'italic',
        }}
      >
        Observed order-flow execution resistance at resting liquidity; not a guaranteed reversal signal.
      </div>
    </div>
  );
};
