/**
 * J.A.R.V.I.S 2.0 - GEX Dealer Positioning Model Comparison Table
 * Enables side-by-side comparison across all 4 dealer models to inspect
 * sensitivity to dealer positioning assumptions.
 */

import React from 'react';
import { ModelComparisonResult, DealerPositionModel, DEALER_POSITION_MODELS } from '../../types/gex';
import { Check } from 'lucide-react';

interface GexModelComparisonTableProps {
  comparisons: ModelComparisonResult[];
  activeModel: DealerPositionModel;
  onSelectModel: (model: DealerPositionModel) => void;
}

export const GexModelComparisonTable: React.FC<GexModelComparisonTableProps> = ({
  comparisons,
  activeModel,
  onSelectModel,
}) => {
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
          Dealer Positioning Assumptions Comparison
        </span>
        <span style={{ fontSize: 10, color: '#94a3b8' }}>
          Click any row to activate that model
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#94a3b8' }}>
              <th style={{ padding: '6px 8px', textAlign: 'left' }}>Model</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Net GEX</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Gamma Flip</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Call Wall</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Put Wall</th>
              <th style={{ padding: '6px 8px', textAlign: 'center' }}>Regime</th>
              <th style={{ padding: '6px 8px', textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {comparisons.map((c) => {
              const isSelected = c.model === activeModel;
              const meta = DEALER_POSITION_MODELS[c.model];

              return (
                <tr
                  key={c.model}
                  onClick={() => onSelectModel(c.model)}
                  style={{
                    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                    background: isSelected ? 'rgba(56, 189, 248, 0.10)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease',
                  }}
                >
                  <td style={{ padding: '6px 8px' }}>
                    <div style={{ fontWeight: 700, color: isSelected ? '#38bdf8' : '#f1f5f9' }}>
                      {meta?.name || c.name}
                    </div>
                    <div style={{ fontSize: 9.5, color: '#94a3b8' }}>{meta?.shortDescription}</div>
                  </td>
                  <td
                    style={{
                      padding: '6px 8px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      color: c.netGex >= 0 ? '#10b981' : '#ef4444',
                    }}
                  >
                    {formatDollar(c.netGex)}
                  </td>
                  <td
                    style={{
                      padding: '6px 8px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      color: '#f59e0b',
                    }}
                  >
                    {c.gammaFlipPrice ? `$${c.gammaFlipPrice.toFixed(1)}` : 'None'}
                  </td>
                  <td
                    style={{
                      padding: '6px 8px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      color: '#38bdf8',
                    }}
                  >
                    ${c.callWall}
                  </td>
                  <td
                    style={{
                      padding: '6px 8px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      color: '#ec4899',
                    }}
                  >
                    ${c.putWall}
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
                          c.regime === 'positive_gamma'
                            ? 'rgba(16, 185, 129, 0.15)'
                            : 'rgba(239, 68, 68, 0.15)',
                        color: c.regime === 'positive_gamma' ? '#10b981' : '#ef4444',
                      }}
                    >
                      {c.regime.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                    {isSelected ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          fontSize: 9.5,
                          fontWeight: 700,
                          color: '#38bdf8',
                        }}
                      >
                        <Check size={12} /> Active
                      </span>
                    ) : (
                      <span style={{ fontSize: 9.5, color: '#64748b' }}>Select</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
