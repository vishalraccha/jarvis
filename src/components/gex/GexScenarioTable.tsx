/**
 * J.A.R.V.I.S 2.0 - GEX Price Scenario Analysis Table
 * Evaluates hypothetical spot moves: -2%, -1%, -0.5%, +0.5%, +1%, +2%
 * Displays estimated Net GEX, re-hedging requirements, and expected regime.
 */

import React from 'react';
import { PriceScenarioPoint } from '../../types/gex';
import { TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';

interface GexScenarioTableProps {
  scenarios: PriceScenarioPoint[];
  currentSpot: number;
}

export const GexScenarioTable: React.FC<GexScenarioTableProps> = ({ scenarios, currentSpot }) => {
  const formatDollar = (val: number): string => {
    const abs = Math.abs(val);
    const sign = val < 0 ? '-' : '+';
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
    return `${sign}$${abs.toFixed(0)}`;
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        background: '#0a0f1d',
        borderRadius: 8,
        border: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '12px 14px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>
          Hypothetical Price Scenario Analysis
        </span>
        <span style={{ fontSize: 10, color: '#94a3b8' }}>
          *Simulated repricing under static volatility surface
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#94a3b8' }}>
              <th style={{ padding: '6px 8px', textAlign: 'left' }}>Spot Move</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Hypothetical Spot</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Estimated Net GEX</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Re-hedging Flow / 1%</th>
              <th style={{ padding: '6px 8px', textAlign: 'center' }}>Predicted Regime</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((s) => {
              const isUp = s.movePct > 0;
              const isPositiveGex = s.estimatedNetGex >= 0;

              return (
                <tr
                  key={s.movePct}
                  style={{
                    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                    background:
                      s.movePct === 0
                        ? 'rgba(56, 189, 248, 0.06)'
                        : 'transparent',
                  }}
                >
                  <td style={{ padding: '6px 8px', fontWeight: 700 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      {isUp ? (
                        <TrendingUp size={13} style={{ color: '#10b981' }} />
                      ) : (
                        <TrendingDown size={13} style={{ color: '#ef4444' }} />
                      )}
                      <span style={{ color: isUp ? '#10b981' : '#ef4444' }}>
                        {isUp ? `+${s.movePct}%` : `${s.movePct}%`}
                      </span>
                    </div>
                  </td>
                  <td
                    style={{
                      padding: '6px 8px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      color: '#f8fafc',
                      fontWeight: 600,
                    }}
                  >
                    ${s.hypotheticalSpot.toFixed(currentSpot >= 1000 ? 1 : 2)}
                  </td>
                  <td
                    style={{
                      padding: '6px 8px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      color: isPositiveGex ? '#10b981' : '#ef4444',
                    }}
                  >
                    {formatDollar(s.estimatedNetGex)}
                  </td>
                  <td
                    style={{
                      padding: '6px 8px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      color: '#cbd5e1',
                    }}
                  >
                    {formatDollar(s.deltaHedgeDollar)}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                    <span
                      style={{
                        fontSize: 9.5,
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: 4,
                        textTransform: 'uppercase',
                        background:
                          s.regime === 'positive_gamma'
                            ? 'rgba(16, 185, 129, 0.15)'
                            : 'rgba(239, 68, 68, 0.15)',
                        color: s.regime === 'positive_gamma' ? '#10b981' : '#ef4444',
                      }}
                    >
                      {s.regime.replace(/_/g, ' ')}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 10,
          color: '#64748b',
          marginTop: 4,
        }}
      >
        <AlertCircle size={12} />
        <span>
          Re-hedging flow represents the estimated dollar amount market makers must buy (if positive) or sell (if negative) to restore delta neutrality upon a 1% move.
        </span>
      </div>
    </div>
  );
};
