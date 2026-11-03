/**
 * J.A.R.V.I.S 2.0 - GEX by Strike Horizontal Histogram
 * Displays:
 *   - Strike prices along vertical axis
 *   - Call GEX (right / green) vs Put GEX (left / red) bars
 *   - Current Spot Price marker line
 *   - Gamma Flip line with badge
 *   - Call Wall and Put Wall badges
 *   - Tooltip inspection for strike-level OI, GEX, and concentration
 */

import React, { useState, useMemo } from 'react';
import { GexStrikeLevel, WallLevel, ZeroCrossing } from '../../types/gex';

interface GexStrikeHistogramProps {
  strikes: GexStrikeLevel[];
  spotPrice: number;
  callWall: WallLevel;
  putWall: WallLevel;
  gammaFlip: ZeroCrossing | null;
  unitLabel: string;
}

export const GexStrikeHistogram: React.FC<GexStrikeHistogramProps> = ({
  strikes,
  spotPrice,
  callWall,
  putWall,
  gammaFlip,
  unitLabel,
}) => {
  const [hoveredStrike, setHoveredStrike] = useState<GexStrikeLevel | null>(null);
  const [filterRangePct, setFilterRangePct] = useState<number>(15); // Default +/-15% around spot

  // Filter strikes around spot
  const displayedStrikes = useMemo(() => {
    if (!strikes || strikes.length === 0) return [];
    if (filterRangePct >= 100 || spotPrice <= 0) return strikes;

    const minPrice = spotPrice * (1 - filterRangePct / 100);
    const maxPrice = spotPrice * (1 + filterRangePct / 100);

    const filtered = strikes.filter((s) => s.strike >= minPrice && s.strike <= maxPrice);
    return filtered.length > 0 ? filtered : strikes.slice(0, 40);
  }, [strikes, spotPrice, filterRangePct]);

  // Find maximum absolute GEX bar for scaling
  const maxAbsGex = useMemo(() => {
    let maxVal = 1;
    for (const s of displayedStrikes) {
      if (Math.abs(s.callGex) > maxVal) maxVal = Math.abs(s.callGex);
      if (Math.abs(s.putGex) > maxVal) maxVal = Math.abs(s.putGex);
    }
    return maxVal;
  }, [displayedStrikes]);

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
        position: 'relative',
      }}
    >
      {/* Top Header & Range Filters */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          paddingBottom: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>
            GEX by Strike Distribution
          </span>
          <span style={{ fontSize: 10, color: '#94a3b8' }}>({unitLabel})</span>
        </div>

        {/* Range Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10.5, color: '#64748b' }}>Range:</span>
          {[5, 10, 15, 25, 100].map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => setFilterRangePct(pct)}
              style={{
                background: filterRangePct === pct ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                color: filterRangePct === pct ? '#38bdf8' : '#94a3b8',
                border: filterRangePct === pct ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid transparent',
                borderRadius: 4,
                padding: '2px 7px',
                fontSize: 10,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {pct === 100 ? 'All' : `±${pct}%`}
            </button>
          ))}
        </div>
      </div>

      {/* Legend & Column Headers */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 70px 1fr',
          fontSize: 10,
          fontWeight: 700,
          color: '#94a3b8',
          textTransform: 'uppercase',
          textAlign: 'center',
          padding: '4px 0',
        }}
      >
        <div style={{ textAlign: 'right', paddingRight: 10, color: '#f43f5e' }}>
          ◀ Put GEX (Downside Hedging)
        </div>
        <div style={{ color: '#cbd5e1' }}>Strike ($)</div>
        <div style={{ textAlign: 'left', paddingLeft: 10, color: '#10b981' }}>
          Call GEX (Upside Hedging) ▶
        </div>
      </div>

      {/* Scrollable Histogram Body */}
      <div
        style={{
          maxHeight: 380,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column-reverse', // Highest strikes at top, lowest at bottom
          gap: 2,
          paddingRight: 4,
        }}
      >
        {displayedStrikes.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: '#64748b', fontSize: 12 }}>
            No options strikes found in the selected range.
          </div>
        ) : (
          displayedStrikes.map((s) => {
            const isCallWall = s.strike === callWall.strike;
            const isPutWall = s.strike === putWall.strike;
            const isClosestToFlip =
              gammaFlip && Math.abs(s.strike - gammaFlip.price) / spotPrice < 0.004;
            const isNearSpot = Math.abs(s.strike - spotPrice) / spotPrice < 0.003;

            const putWidthPct = (Math.abs(s.putGex) / maxAbsGex) * 100;
            const callWidthPct = (Math.abs(s.callGex) / maxAbsGex) * 100;

            return (
              <div
                key={s.strike}
                onMouseEnter={() => setHoveredStrike(s)}
                onMouseLeave={() => setHoveredStrike(null)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 70px 1fr',
                  alignItems: 'center',
                  height: 22,
                  padding: '1px 0',
                  borderRadius: 4,
                  background:
                    isNearSpot
                      ? 'rgba(56, 189, 248, 0.08)'
                      : hoveredStrike?.strike === s.strike
                      ? 'rgba(255, 255, 255, 0.04)'
                      : 'transparent',
                  cursor: 'pointer',
                  position: 'relative',
                }}
              >
                {/* Left: Put GEX Bar (aligned right towards center) */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    height: '100%',
                    paddingRight: 6,
                    gap: 6,
                  }}
                >
                  {isPutWall && (
                    <span
                      style={{
                        fontSize: 8.5,
                        fontWeight: 800,
                        background: '#ec4899',
                        color: '#000',
                        padding: '1px 5px',
                        borderRadius: 3,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      PUT WALL
                    </span>
                  )}
                  {s.putGex !== 0 && (
                    <span
                      style={{
                        fontSize: 9,
                        fontFamily: 'var(--font-mono)',
                        color: '#fda4af',
                        opacity: hoveredStrike?.strike === s.strike ? 1 : 0.7,
                      }}
                    >
                      {formatDollar(s.putGex)}
                    </span>
                  )}
                  <div
                    style={{
                      height: 12,
                      width: `${Math.max(2, putWidthPct)}%`,
                      maxWidth: '85%',
                      background: isPutWall
                        ? 'linear-gradient(90deg, #ec4899, #f43f5e)'
                        : 'rgba(244, 63, 94, 0.75)',
                      borderRadius: '3px 0 0 3px',
                      transition: 'width 0.2s ease',
                    }}
                  />
                </div>

                {/* Center: Strike Price */}
                <div
                  style={{
                    textAlign: 'center',
                    fontSize: 10.5,
                    fontWeight: isNearSpot || isCallWall || isPutWall ? 800 : 600,
                    fontFamily: 'var(--font-mono)',
                    color: isNearSpot
                      ? '#38bdf8'
                      : isCallWall
                      ? '#10b981'
                      : isPutWall
                      ? '#ec4899'
                      : isClosestToFlip
                      ? '#f59e0b'
                      : '#cbd5e1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 3,
                  }}
                >
                  <span>{s.strike.toFixed(s.strike >= 1000 ? 0 : 2)}</span>
                  {isNearSpot && (
                    <span style={{ fontSize: 8, color: '#38bdf8', fontWeight: 800 }}>•</span>
                  )}
                </div>

                {/* Right: Call GEX Bar (aligned left towards outside) */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-start',
                    alignItems: 'center',
                    height: '100%',
                    paddingLeft: 6,
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      height: 12,
                      width: `${Math.max(2, callWidthPct)}%`,
                      maxWidth: '85%',
                      background: isCallWall
                        ? 'linear-gradient(90deg, #10b981, #06b6d4)'
                        : 'rgba(16, 185, 129, 0.75)',
                      borderRadius: '0 3px 3px 0',
                      transition: 'width 0.2s ease',
                    }}
                  />
                  {s.callGex !== 0 && (
                    <span
                      style={{
                        fontSize: 9,
                        fontFamily: 'var(--font-mono)',
                        color: '#6ee7b7',
                        opacity: hoveredStrike?.strike === s.strike ? 1 : 0.7,
                      }}
                    >
                      {formatDollar(s.callGex)}
                    </span>
                  )}
                  {isCallWall && (
                    <span
                      style={{
                        fontSize: 8.5,
                        fontWeight: 800,
                        background: '#06b6d4',
                        color: '#000',
                        padding: '1px 5px',
                        borderRadius: 3,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      CALL WALL
                    </span>
                  )}
                  {isClosestToFlip && (
                    <span
                      style={{
                        fontSize: 8.5,
                        fontWeight: 800,
                        background: '#f59e0b',
                        color: '#000',
                        padding: '1px 5px',
                        borderRadius: 3,
                        textTransform: 'uppercase',
                      }}
                    >
                      Γ FLIP
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Hovered Strike Inspector Tooltip Card */}
      {hoveredStrike && (
        <div
          style={{
            position: 'absolute',
            bottom: 14,
            right: 14,
            background: 'rgba(15, 23, 42, 0.96)',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            borderRadius: 6,
            padding: '8px 12px',
            fontSize: 11,
            color: '#f8fafc',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.8)',
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
            minWidth: 180,
          }}
        >
          <div style={{ fontWeight: 800, color: '#38bdf8', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: 4 }}>
            Strike: ${hoveredStrike.strike} ({hoveredStrike.gammaConcentration}% of total)
          </div>
          <div>Net GEX: <b style={{ color: hoveredStrike.netGex >= 0 ? '#10b981' : '#ef4444' }}>{formatDollar(hoveredStrike.netGex)}</b></div>
          <div>Call GEX: <b style={{ color: '#10b981' }}>{formatDollar(hoveredStrike.callGex)}</b> (OI: {hoveredStrike.callOpenInterest.toLocaleString()})</div>
          <div>Put GEX: <b style={{ color: '#ef4444' }}>{formatDollar(hoveredStrike.putGex)}</b> (OI: {hoveredStrike.putOpenInterest.toLocaleString()})</div>
          <div>Total OI: <b>{hoveredStrike.totalOpenInterest.toLocaleString()}</b> contracts</div>
        </div>
      )}
    </div>
  );
};
