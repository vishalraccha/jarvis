/**
 * J.A.R.V.I.S 2.0 - GEX Summary Card
 * Professional high-density overview of aggregate Gamma Exposure:
 *   - Net GEX, Call GEX, Put GEX
 *   - Live Gamma Regime Badge (Positive Gamma / Negative Gamma / Near Flip)
 *   - Gamma Flip (Zero Gamma Level) with spot distance ($ & %)
 *   - Call Wall & Put Wall Levels with concentration
 *   - Options chain data quality, timestamps & basis warning
 */

import React from 'react';
import { GexMetrics, DealerPositionModel, DEALER_POSITION_MODELS, GexUnit } from '../../types/gex';
import { ShieldAlert, Info, Clock, AlertTriangle } from 'lucide-react';

interface GexSummaryCardProps {
  metrics: GexMetrics;
  selectedModel: DealerPositionModel;
  onModelChange: (model: DealerPositionModel) => void;
  selectedUnit: GexUnit;
  onUnitChange: (unit: GexUnit) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const GexSummaryCard: React.FC<GexSummaryCardProps> = ({
  metrics,
  selectedModel,
  onModelChange,
  selectedUnit,
  onUnitChange,
  onRefresh,
  isRefreshing,
}) => {
  const formatDollar = (val: number): string => {
    const abs = Math.abs(val);
    const sign = val < 0 ? '-' : '+';
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
    return `${sign}$${abs.toFixed(0)}`;
  };

  const getRegimeColor = (regime: string) => {
    switch (regime) {
      case 'positive_gamma':
        return { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', border: '#10b981' };
      case 'negative_gamma':
        return { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', border: '#ef4444' };
      case 'near_gamma_flip':
        return { bg: 'rgba(245, 158, 11, 0.18)', text: '#f59e0b', border: '#f59e0b' };
      default:
        return { bg: 'rgba(148, 163, 184, 0.15)', text: '#94a3b8', border: '#475569' };
    }
  };

  const regimeStyle = getRegimeColor(metrics.gammaRegime);
  const currentModelMeta = DEALER_POSITION_MODELS[selectedModel] || DEALER_POSITION_MODELS.spotgamma_standard;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 1. Header Row: Controls, Unit Toggle, Model Selector */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '8px 12px',
          background: 'rgba(255, 255, 255, 0.03)',
          borderRadius: 8,
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        {/* Left: Model Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
            Positioning Model:
          </span>
          <select
            value={selectedModel}
            onChange={(e) => onModelChange(e.target.value as DealerPositionModel)}
            style={{
              background: '#0f172a',
              color: '#38bdf8',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: 6,
              padding: '4px 8px',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {Object.values(DEALER_POSITION_MODELS).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {/* Right: GEX Unit & Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              display: 'flex',
              background: '#090d16',
              borderRadius: 6,
              padding: 2,
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <button
              type="button"
              onClick={() => onUnitChange('dollar_per_1pct')}
              style={{
                background: selectedUnit === 'dollar_per_1pct' ? 'rgba(56, 189, 248, 0.25)' : 'transparent',
                color: selectedUnit === 'dollar_per_1pct' ? '#38bdf8' : '#64748b',
                border: 'none',
                padding: '3px 8px',
                fontSize: 10,
                fontWeight: 700,
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              $/1% Move
            </button>
            <button
              type="button"
              onClick={() => onUnitChange('dollar_per_point')}
              style={{
                background: selectedUnit === 'dollar_per_point' ? 'rgba(56, 189, 248, 0.25)' : 'transparent',
                color: selectedUnit === 'dollar_per_point' ? '#38bdf8' : '#64748b',
                border: 'none',
                padding: '3px 8px',
                fontSize: 10,
                fontWeight: 700,
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              $/Point
            </button>
          </div>

          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#cbd5e1',
                padding: '4px 10px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <Clock size={12} />
              <span>{isRefreshing ? 'Syncing...' : 'Refresh'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Basis Warning / Notice if applicable */}
      {metrics.basisNotice && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 12px',
            background: 'rgba(245, 158, 11, 0.10)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            borderRadius: 6,
            fontSize: 11,
            color: '#fde047',
          }}
        >
          <AlertTriangle size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />
          <span>{metrics.basisNotice}</span>
        </div>
      )}

      {/* 2. Grid of 4 Key KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 10,
        }}
      >
        {/* Card 1: Net GEX & Regime */}
        <div
          style={{
            background: '#0d1322',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 8,
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>
              Aggregate Net GEX
            </span>
            <div
              style={{
                fontSize: 9.5,
                fontWeight: 800,
                textTransform: 'uppercase',
                padding: '2px 7px',
                borderRadius: 12,
                background: regimeStyle.bg,
                color: regimeStyle.text,
                border: `1px solid ${regimeStyle.border}`,
              }}
            >
              {metrics.gammaRegime.replace(/_/g, ' ')}
            </div>
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              fontFamily: 'var(--font-mono)',
              color: metrics.totalNetGex >= 0 ? '#10b981' : '#ef4444',
            }}
          >
            {formatDollar(metrics.totalNetGex)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b' }}>
            <span>Calls: <b style={{ color: '#10b981' }}>{formatDollar(metrics.callGex)}</b></span>
            <span>Puts: <b style={{ color: '#ef4444' }}>{formatDollar(metrics.putGex)}</b></span>
          </div>
        </div>

        {/* Card 2: Gamma Flip (Zero Gamma Level) */}
        <div
          style={{
            background: '#0d1322',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 8,
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>
              Gamma Flip (Zero Gamma)
            </span>
            <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 700 }}>Γ = 0</span>
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              fontFamily: 'var(--font-mono)',
              color: '#f59e0b',
            }}
          >
            {metrics.gammaFlip ? `$${metrics.gammaFlip.price.toFixed(2)}` : 'None in range'}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            {metrics.gammaFlip ? (
              <span>
                Distance: <b style={{ color: '#f8fafc' }}>{metrics.gammaFlip.distanceFromSpot >= 0 ? '+' : ''}{metrics.gammaFlip.distanceFromSpot.toFixed(2)}</b> ({metrics.gammaFlip.distancePercent >= 0 ? '+' : ''}{metrics.gammaFlip.distancePercent.toFixed(2)}%)
              </span>
            ) : (
              <span>Zero-crossing not detected within ±20% spot range</span>
            )}
          </div>
        </div>

        {/* Card 3: Call Wall */}
        <div
          style={{
            background: '#0d1322',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 8,
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>
              Call Wall (Max Call Γ)
            </span>
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                color: '#38bdf8',
                background: 'rgba(56, 189, 248, 0.15)',
                padding: '1px 6px',
                borderRadius: 4,
              }}
            >
              {metrics.callWall.concentrationPct}% Conc.
            </span>
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              fontFamily: 'var(--font-mono)',
              color: '#38bdf8',
            }}
          >
            ${metrics.callWall.strike.toFixed(2)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}>
            <span>Exposure: <b style={{ color: '#38bdf8' }}>{formatDollar(metrics.callWall.exposure)}</b></span>
            <span>Dist: <b style={{ color: '#f8fafc' }}>{metrics.callWall.distance >= 0 ? '+' : ''}{metrics.callWall.distancePct.toFixed(1)}%</b></span>
          </div>
        </div>

        {/* Card 4: Put Wall */}
        <div
          style={{
            background: '#0d1322',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 8,
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>
              Put Wall (Max Put Γ)
            </span>
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                color: '#ec4899',
                background: 'rgba(236, 72, 153, 0.15)',
                padding: '1px 6px',
                borderRadius: 4,
              }}
            >
              {metrics.putWall.concentrationPct}% Conc.
            </span>
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              fontFamily: 'var(--font-mono)',
              color: '#ec4899',
            }}
          >
            ${metrics.putWall.strike.toFixed(2)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}>
            <span>Exposure: <b style={{ color: '#ec4899' }}>{formatDollar(metrics.putWall.exposure)}</b></span>
            <span>Dist: <b style={{ color: '#f8fafc' }}>{metrics.putWall.distance >= 0 ? '+' : ''}{metrics.putWall.distancePct.toFixed(1)}%</b></span>
          </div>
        </div>
      </div>

      {/* 3. Regime Explanation & Assumptions Disclaimer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: '10px 14px',
          background: 'rgba(15, 23, 42, 0.65)',
          borderRadius: 8,
          border: '1px solid rgba(255, 255, 255, 0.06)',
          fontSize: 11,
          lineHeight: '1.45',
          color: '#cbd5e1',
        }}
      >
        <Info size={16} style={{ color: '#38bdf8', flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontWeight: 700, color: '#f1f5f9', marginBottom: 2 }}>
            Regime Context: <span style={{ color: regimeStyle.text }}>{metrics.regimeDescription}</span>
          </div>
          <div style={{ color: '#94a3b8', fontSize: 10.5 }}>
            <b style={{ color: '#cbd5e1' }}>Model Assumption:</b> {currentModelMeta.assumptions}{' '}
            <i>*GEX models potential dealer re-hedging activity and should be confirmed with real-time order flow and Level 2 depth.</i>
          </div>
        </div>
      </div>
    </div>
  );
};
