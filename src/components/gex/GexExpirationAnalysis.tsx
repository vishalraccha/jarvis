/**
 * J.A.R.V.I.S 2.0 - GEX Expiration Breakdown Analysis
 * Displays 0DTE, 1-7 DTE, Weekly, and Monthly expiration concentration bars,
 * volume, and Open Interest.
 */

import React from 'react';
import { GexExpirationBreakdown } from '../../types/gex';
import { Calendar, Zap } from 'lucide-react';

interface GexExpirationAnalysisProps {
  expirations: GexExpirationBreakdown[];
  nearExpPct: number;
}

export const GexExpirationAnalysis: React.FC<GexExpirationAnalysisProps> = ({
  expirations,
  nearExpPct,
}) => {
  const formatDollar = (val: number): string => {
    const abs = Math.abs(val);
    const sign = val < 0 ? '-' : '+';
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
    return `${sign}$${abs.toFixed(0)}`;
  };

  const maxNet = Math.max(1, ...expirations.map((e) => Math.abs(e.netGex)));

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Calendar size={14} style={{ color: '#38bdf8' }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>
            Expiration Cycle Breakdown
          </span>
        </div>
        <span
          style={{
            fontSize: 10,
            color: '#f59e0b',
            background: 'rgba(245, 158, 11, 0.15)',
            padding: '2px 7px',
            borderRadius: 4,
            fontWeight: 700,
          }}
        >
          {nearExpPct}% in ≤ 7 DTE
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
        {expirations.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: '#64748b', fontSize: 12 }}>
            No expiration data available.
          </div>
        ) : (
          expirations.map((e) => {
            const barWidth = Math.max(4, (Math.abs(e.netGex) / maxNet) * 100);
            const isPositive = e.netGex >= 0;

            return (
              <div
                key={e.expiration}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '95px 60px 1fr 90px',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 6px',
                  borderRadius: 4,
                  background: e.is0DTE ? 'rgba(245, 158, 11, 0.06)' : 'transparent',
                  border: e.is0DTE ? '1px solid rgba(245, 158, 11, 0.2)' : '1px solid transparent',
                  fontSize: 11,
                }}
              >
                {/* Expiration date & 0DTE tag */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {e.is0DTE && <Zap size={11} style={{ color: '#f59e0b' }} />}
                  <span style={{ fontWeight: e.is0DTE ? 800 : 600, color: e.is0DTE ? '#f59e0b' : '#cbd5e1' }}>
                    {e.expiration}
                  </span>
                </div>

                {/* DTE */}
                <span style={{ color: '#94a3b8', fontSize: 10 }}>
                  {e.is0DTE ? '0DTE' : `${e.dte}d`}
                </span>

                {/* Exposure bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                  <div
                    style={{
                      height: 10,
                      width: `${barWidth}%`,
                      maxWidth: '100%',
                      background: isPositive
                        ? 'linear-gradient(90deg, #059669, #10b981)'
                        : 'linear-gradient(90deg, #dc2626, #f43f5e)',
                      borderRadius: 2,
                    }}
                  />
                  <span style={{ fontSize: 9.5, color: '#64748b' }}>{e.percentageOfTotal}%</span>
                </div>

                {/* Net GEX */}
                <div
                  style={{
                    textAlign: 'right',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    color: isPositive ? '#10b981' : '#f43f5e',
                  }}
                >
                  {formatDollar(e.netGex)}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
