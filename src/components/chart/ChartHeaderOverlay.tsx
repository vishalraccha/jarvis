/**
 * Chart Header Overlay
 * Displays authoritative instrument classification, provider provenance,
 * market session status (Open/Closed/Break/Stale), and feature notices.
 */

import React from 'react';
import { InstrumentConfig, InstrumentRegistry } from '../../services/market/InstrumentRegistry';
import { MarketSessionInfo, MarketSessionService } from '../../services/market/MarketSessionService';
import { CandleTimeframe } from '../../types/market';
import { AlertTriangle, Clock, Info } from 'lucide-react';

interface ChartHeaderOverlayProps {
  symbol: string;
  timeframe: CandleTimeframe;
  connectionState: string;
  isStale?: boolean;
  lastQuoteTime?: number;
  showHeatmap: boolean;
  showFootprint: boolean;
}

export const ChartHeaderOverlay: React.FC<ChartHeaderOverlayProps> = ({
  symbol,
  timeframe,
  connectionState,
  isStale,
  lastQuoteTime,
  showHeatmap,
  showFootprint,
}) => {
  const instrument: InstrumentConfig = InstrumentRegistry.getInstrument(symbol);
  const session: MarketSessionInfo = MarketSessionService.getSessionInfo(instrument.marketSchedule);

  const isClosed = !session.isOpen;
  const isMarketStale = isStale || connectionState === 'STALE';

  // Badge colors
  const getSessionBadgeStyle = () => {
    if (isClosed) {
      return {
        bg: 'rgba(239, 68, 68, 0.16)',
        color: '#f87171',
        border: 'rgba(239, 68, 68, 0.4)',
        dot: '#ef4444',
      };
    }
    if (session.status === 'BREAK') {
      return {
        bg: 'rgba(245, 158, 11, 0.16)',
        color: '#fbbf24',
        border: 'rgba(245, 158, 11, 0.4)',
        dot: '#f59e0b',
      };
    }
    if (isMarketStale) {
      return {
        bg: 'rgba(249, 115, 22, 0.16)',
        color: '#fb923c',
        border: 'rgba(249, 115, 22, 0.4)',
        dot: '#f97316',
      };
    }
    return {
      bg: 'rgba(16, 185, 129, 0.16)',
      color: '#34d399',
      border: 'rgba(16, 185, 129, 0.4)',
      dot: '#10b981',
    };
  };

  const badgeStyle = getSessionBadgeStyle();
  const showFeatureWarning = (!instrument.supportsHeatmap && showHeatmap) || (!instrument.supportsFootprint && showFootprint);

  return (
    <div
      style={{
        position: 'absolute',
        top: 10,
        left: 12,
        zIndex: 25,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        pointerEvents: 'none',
      }}
    >
      {/* Primary Instrument Header Pill */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(12, 16, 25, 0.88)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 6,
          padding: '4px 10px',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.4)',
          pointerEvents: 'auto',
        }}
      >
        {/* Instrument Title */}
        <span style={{ fontWeight: 800, fontSize: 13, color: '#f8fafc', letterSpacing: '0.02em' }}>
          {instrument.displayName}
        </span>

        {/* Contract Type Badge */}
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            padding: '2px 6px',
            borderRadius: 3,
            background: 'rgba(56, 189, 248, 0.12)',
            color: '#38bdf8',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {instrument.typeLabel}
        </span>

        {/* Provider Provenance Badge */}
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 600,
            padding: '2px 6px',
            borderRadius: 3,
            background: 'rgba(255, 255, 255, 0.05)',
            color: '#94a3b8',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}
          title={`Data source: ${instrument.provider}`}
        >
          {instrument.provider}
        </span>

        {/* Timeframe Badge */}
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: '#cbd5e1',
            background: 'rgba(0, 0, 0, 0.3)',
            padding: '2px 5px',
            borderRadius: 3,
          }}
        >
          {timeframe.toUpperCase()}
        </span>

        {/* Market Session Status Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '2px 7px',
            borderRadius: 3,
            background: badgeStyle.bg,
            border: `1px solid ${badgeStyle.border}`,
            color: badgeStyle.color,
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: '0.04em',
          }}
          title={session.reason}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: badgeStyle.dot,
              boxShadow: `0 0 6px ${badgeStyle.dot}`,
            }}
          />
          <span>{isClosed ? 'CLOSED (WEEKEND)' : session.status === 'BREAK' ? 'BREAK' : isMarketStale ? 'STALE' : 'LIVE'}</span>
        </div>

        {/* Timestamp of last quote or settlement */}
        {lastQuoteTime && lastQuoteTime > 0 && (
          <span
            style={{
              fontSize: 9,
              color: '#64748b',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              marginLeft: 2,
            }}
            title="Last quote / settlement timestamp"
          >
            <Clock size={10} />
            {MarketSessionService.formatDisplayTime(lastQuoteTime)}
          </span>
        )}
      </div>

      {/* Feature Compatibility Warning (If Heatmap/Footprint is toggled on for unsupported instruments like XAUUSD Spot) */}
      {showFeatureWarning && instrument.unsupportedFeaturesNotice && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(245, 158, 11, 0.12)',
            backdropFilter: 'blur(6px)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 5,
            padding: '5px 10px',
            color: '#fbbf24',
            fontSize: 10.5,
            fontWeight: 500,
            maxWidth: 580,
            pointerEvents: 'auto',
          }}
        >
          <AlertTriangle size={13} style={{ flexShrink: 0, color: '#f59e0b' }} />
          <span>{instrument.unsupportedFeaturesNotice}</span>
        </div>
      )}

      {/* Weekend Closed Banner Notice */}
      {isClosed && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(239, 68, 68, 0.1)',
            backdropFilter: 'blur(6px)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: 5,
            padding: '4px 9px',
            color: '#fca5a5',
            fontSize: 10,
            maxWidth: 520,
            pointerEvents: 'auto',
          }}
        >
          <Info size={12} style={{ flexShrink: 0, color: '#f87171' }} />
          <span>{session.formattedSessionNotice} • Showing last authentic settled candle. No fake weekend bars generated.</span>
        </div>
      )}
    </div>
  );
};
