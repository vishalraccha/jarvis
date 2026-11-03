/**
 * J.A.R.V.I.S 2.0 - GEX Heatmap Matrix
 * Visualizes Strike vs Expiration matrix with cell color intensity
 * reflecting Gamma Exposure magnitude (Positive = Green/Cyan, Negative = Red/Pink).
 */

import React, { useState, useMemo } from 'react';
import { OptionContract, DealerPositionModel, GexUnit } from '../../types/gex';
import { GexEngine } from '../../services/gex/GexEngine';

interface GexHeatmapMatrixProps {
  contracts: OptionContract[];
  spotPrice: number;
  selectedModel: DealerPositionModel;
  selectedUnit: GexUnit;
}

export const GexHeatmapMatrix: React.FC<GexHeatmapMatrixProps> = ({
  contracts,
  spotPrice,
  selectedModel,
  selectedUnit,
}) => {
  const [hoveredCell, setHoveredCell] = useState<{
    strike: number;
    exp: string;
    netGex: number;
    callGex: number;
    putGex: number;
  } | null>(null);

  // Group contracts by (Strike, Expiration)
  const { strikesList, expList, matrix, maxAbsVal } = useMemo(() => {
    const strikeSet = new Set<number>();
    const expSet = new Set<string>();
    const map = new Map<string, { callGex: number; putGex: number }>();
    let maxAbs = 1;

    for (const c of contracts) {
      if (!c.strike || !c.expiration) continue;
      strikeSet.add(c.strike);
      expSet.add(c.expiration);

      const key = `${c.strike}__${c.expiration}`;
      let entry = map.get(key);
      if (!entry) {
        entry = { callGex: 0, putGex: 0 };
        map.set(key, entry);
      }

      const { gex } = GexEngine.calculateContractGex(c, spotPrice, selectedModel, selectedUnit);
      if (c.type === 'call') entry.callGex += gex;
      else entry.putGex += gex;

      const net = Math.abs(entry.callGex + entry.putGex);
      if (net > maxAbs) maxAbs = net;
    }

    // Sort strikes around spot
    const sortedStrikes = Array.from(strikeSet).sort((a, b) => b - a);
    const sortedExpirations = Array.from(expSet).sort();

    // Limit to top 25 strikes around spot for performance & clean layout
    const spotDistances = sortedStrikes.map((s) => ({ s, dist: Math.abs(s - spotPrice) }));
    spotDistances.sort((a, b) => a.dist - b.dist);
    const topStrikes = spotDistances.slice(0, 20).map((x) => x.s).sort((a, b) => b - a);

    // Limit to next 8 expirations
    const topExpirations = sortedExpirations.slice(0, 8);

    return {
      strikesList: topStrikes,
      expList: topExpirations,
      matrix: map,
      maxAbsVal: maxAbs,
    };
  }, [contracts, spotPrice, selectedModel, selectedUnit]);

  const formatDollar = (val: number): string => {
    const abs = Math.abs(val);
    const sign = val < 0 ? '-' : '+';
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
    return `${sign}$${abs.toFixed(0)}`;
  };

  const getCellBg = (netGex: number): string => {
    if (netGex === 0) return 'rgba(255, 255, 255, 0.02)';
    const intensity = Math.min(1.0, Math.max(0.15, Math.abs(netGex) / maxAbsVal));
    if (netGex > 0) {
      return `rgba(16, 185, 129, ${intensity * 0.85})`;
    } else {
      return `rgba(244, 63, 94, ${intensity * 0.85})`;
    }
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
        overflowX: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>
          GEX Heatmap (Strike × Expiration Matrix)
        </span>
        <span style={{ fontSize: 10, color: '#94a3b8' }}>
          Green = +Gamma | Red = -Gamma | Color Intensity = Exposure Magnitude
        </span>
      </div>

      {strikesList.length === 0 ? (
        <div style={{ padding: '24px 0', textAlign: 'center', color: '#64748b', fontSize: 12 }}>
          No multi-expiration option chain data available for heatmap view.
        </div>
      ) : (
        <div style={{ minWidth: 500, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
            <thead>
              <tr>
                <th
                  style={{
                    padding: '6px 8px',
                    textAlign: 'left',
                    color: '#94a3b8',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                >
                  Strike
                </th>
                {expList.map((exp) => (
                  <th
                    key={exp}
                    style={{
                      padding: '6px 8px',
                      textAlign: 'center',
                      color: '#cbd5e1',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {exp.replace('202', '2')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {strikesList.map((s) => {
                const isNearSpot = Math.abs(s - spotPrice) / spotPrice < 0.003;
                return (
                  <tr key={s}>
                    <td
                      style={{
                        padding: '4px 8px',
                        fontWeight: isNearSpot ? 800 : 600,
                        fontFamily: 'var(--font-mono)',
                        color: isNearSpot ? '#38bdf8' : '#cbd5e1',
                        borderRight: '1px solid rgba(255, 255, 255, 0.06)',
                        background: isNearSpot ? 'rgba(56, 189, 248, 0.08)' : 'transparent',
                      }}
                    >
                      ${s.toFixed(s >= 1000 ? 0 : 2)}
                    </td>
                    {expList.map((exp) => {
                      const key = `${s}__${exp}`;
                      const cell = matrix.get(key) || { callGex: 0, putGex: 0 };
                      const net = cell.callGex + cell.putGex;
                      const bg = getCellBg(net);

                      return (
                        <td
                          key={exp}
                          onMouseEnter={() =>
                            setHoveredCell({
                              strike: s,
                              exp,
                              netGex: net,
                              callGex: cell.callGex,
                              putGex: cell.putGex,
                            })
                          }
                          onMouseLeave={() => setHoveredCell(null)}
                          style={{
                            padding: '4px 6px',
                            textAlign: 'center',
                            background: bg,
                            color: Math.abs(net) > 0 ? '#f8fafc' : '#475569',
                            fontFamily: 'var(--font-mono)',
                            fontSize: 10,
                            cursor: 'pointer',
                            border: '1px solid rgba(0, 0, 0, 0.25)',
                          }}
                        >
                          {net !== 0 ? formatDollar(net) : '-'}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Hover info badge */}
      {hoveredCell && (
        <div
          style={{
            fontSize: 11,
            color: '#cbd5e1',
            padding: '6px 10px',
            background: 'rgba(15, 23, 42, 0.85)',
            borderRadius: 6,
            border: '1px solid rgba(56, 189, 248, 0.2)',
            display: 'flex',
            gap: 12,
            justifyContent: 'space-between',
          }}
        >
          <span>
            Strike: <b style={{ color: '#38bdf8' }}>${hoveredCell.strike}</b> | Expiry: <b>{hoveredCell.exp}</b>
          </span>
          <span>
            Net GEX:{' '}
            <b style={{ color: hoveredCell.netGex >= 0 ? '#10b981' : '#f43f5e' }}>
              {formatDollar(hoveredCell.netGex)}
            </b>
          </span>
          <span>Calls: <b style={{ color: '#10b981' }}>{formatDollar(hoveredCell.callGex)}</b></span>
          <span>Puts: <b style={{ color: '#f43f5e' }}>{formatDollar(hoveredCell.putGex)}</b></span>
        </div>
      )}
    </div>
  );
};
