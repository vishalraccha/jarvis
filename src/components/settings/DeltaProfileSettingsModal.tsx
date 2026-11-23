/**
 * JARVIS 2.0 Delta Profile Settings Modal
 * Configuration panel for Buy/Sell Delta Distribution, Range Modes,
 * Price Aggregation, Trapped Trader Annotations, and Visual Aesthetics.
 */

import React from 'react';
import { X, RotateCcw, Sliders, Eye, Zap, Layers } from 'lucide-react';
import {
  DeltaProfileSettings,
  DeltaProfileRangeMode,
  DeltaProfileScalingMode,
  DEFAULT_DELTA_PROFILE_SETTINGS,
} from '../../types/deltaProfile';
import { InstrumentRegistry } from '../../services/market/InstrumentRegistry';
import { ExchangeId } from '../../types/market';

interface DeltaProfileSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: DeltaProfileSettings;
  symbol?: string;
  exchange?: ExchangeId;
  onChange: (updated: DeltaProfileSettings) => void;
  onReset?: () => void;
}

export const DeltaProfileSettingsModal: React.FC<DeltaProfileSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  symbol = 'XAUUSD',
  exchange = 'binance',
  onChange,
  onReset,
}) => {
  if (!isOpen) return null;

  const inst = InstrumentRegistry.getInstrument(symbol, exchange);
  const baseTick = inst?.priceTick || 0.1;
  const currentStep = (baseTick * (settings.ticksPerRow || 1)).toFixed(
    Math.max(2, (baseTick.toString().split('.')[1] || '').length)
  );

  const handleUpdate = (patch: Partial<DeltaProfileSettings>) => {
    onChange({ ...settings, ...patch });
  };

  const handleReset = () => {
    if (onReset) {
      onReset();
    } else {
      onChange(DEFAULT_DELTA_PROFILE_SETTINGS);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 480,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(11, 15, 25, 0.98)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 16px 48px rgba(0, 0, 0, 0.8)',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(15, 23, 42, 0.6)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', letterSpacing: '0.04em' }}>
              DELTA PROFILE CONFIGURATION
            </span>
            <span style={{ fontSize: 10, background: 'rgba(0, 230, 118, 0.15)', color: '#00e676', padding: '2px 6px', borderRadius: 3, fontWeight: 600 }}>
              {symbol}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div style={{ padding: '16px 18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Main Toggle */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: 6,
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9' }}>
                Enable Delta Profile Overlay
              </div>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>
                Display buy/sell delta distribution on right side of chart
              </div>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => handleUpdate({ enabled: e.target.checked })}
              />
              <span className="toggle-slider" />
            </label>
          </div>

          {/* Section: Profile Range & Session Selection */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Layers size={13} /> PROFILE RANGE & SESSION
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {(
                [
                  { id: 'visible', label: 'Visible Chart Range', desc: 'Syncs with chart view' },
                  { id: 'session', label: 'Current Session', desc: 'Active market session' },
                  { id: 'prev_session', label: 'Previous Session', desc: 'Prior market session' },
                  { id: 'daily', label: 'Daily (UTC)', desc: '00:00 UTC to now' },
                  { id: 'weekly', label: 'Weekly', desc: 'Current week to now' },
                  { id: 'lookback', label: 'Rolling Lookback', desc: `${settings.lookbackBars || 100} bars window` },
                ] as { id: DeltaProfileRangeMode; label: string; desc: string }[]
              ).map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => handleUpdate({ rangeMode: mode.id })}
                  style={{
                    padding: '8px 10px',
                    textAlign: 'left',
                    borderRadius: 4,
                    border: settings.rangeMode === mode.id ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                    background: settings.rangeMode === mode.id ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 600, color: settings.rangeMode === mode.id ? '#38bdf8' : '#f1f5f9' }}>
                    {mode.label}
                  </div>
                  <div style={{ fontSize: 9, color: '#94a3b8' }}>{mode.desc}</div>
                </button>
              ))}
            </div>

            {settings.rangeMode === 'lookback' && (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: '#cbd5e1' }}>Lookback Candle Bars:</span>
                <input
                  type="number"
                  min="20"
                  max="1000"
                  step="10"
                  value={settings.lookbackBars || 100}
                  onChange={(e) => handleUpdate({ lookbackBars: Math.max(10, parseInt(e.target.value) || 100) })}
                  style={{
                    width: 75,
                    padding: '4px 8px',
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: 4,
                    color: '#f8fafc',
                    fontSize: 11,
                    textAlign: 'center',
                  }}
                />
              </div>
            )}
          </div>

          {/* Section: Price-Level Aggregation */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#fbbf24', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sliders size={13} /> PRICE-LEVEL AGGREGATION
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#cbd5e1' }}>Ticks per Row Bucket:</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => handleUpdate({ ticksPerRow: 1 })}
                  style={{
                    padding: '3px 8px',
                    borderRadius: 3,
                    fontSize: 10,
                    fontWeight: 600,
                    border: settings.ticksPerRow === 1 ? '1px solid #fbbf24' : '1px solid rgba(255, 255, 255, 0.1)',
                    background: settings.ticksPerRow === 1 ? 'rgba(251, 191, 36, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                    color: settings.ticksPerRow === 1 ? '#fbbf24' : '#cbd5e1',
                    cursor: 'pointer',
                  }}
                >
                  Auto
                </button>
                {[2, 5, 10, 20].map((multiplier) => (
                  <button
                    key={multiplier}
                    onClick={() => handleUpdate({ ticksPerRow: multiplier })}
                    style={{
                      padding: '3px 8px',
                      borderRadius: 3,
                      fontSize: 10,
                      fontWeight: 600,
                      border: settings.ticksPerRow === multiplier ? '1px solid #fbbf24' : '1px solid rgba(255, 255, 255, 0.1)',
                      background: settings.ticksPerRow === multiplier ? 'rgba(251, 191, 36, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                      color: settings.ticksPerRow === multiplier ? '#fbbf24' : '#cbd5e1',
                      cursor: 'pointer',
                    }}
                  >
                    {multiplier}x
                  </button>
                ))}
              </div>
            </div>

            <div style={{ fontSize: 10, color: '#94a3b8', background: 'rgba(255, 255, 255, 0.02)', padding: '6px 8px', borderRadius: 4 }}>
              Instrument Base Tick: <strong>{baseTick}</strong> • Effective Bucket Size: <strong>${currentStep}</strong>
            </div>
          </div>

          {/* Section: Visual Display & Scaling */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#00e676', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Eye size={13} /> VISUAL PROFILE & SCALING
            </div>

            {/* Profile Width */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: '#cbd5e1' }}>Profile Width:</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="range"
                  min="160"
                  max="320"
                  step="10"
                  value={settings.widthPx || 220}
                  onChange={(e) => handleUpdate({ widthPx: parseInt(e.target.value) })}
                  style={{ width: 110 }}
                />
                <span style={{ fontSize: 11, color: '#f1f5f9', width: 38, textAlign: 'right' }}>
                  {settings.widthPx || 220}px
                </span>
              </div>
            </div>

            {/* Scaling Mode */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: '#cbd5e1' }}>Delta Scaling Mode:</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['normalized', 'absolute'] as DeltaProfileScalingMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => handleUpdate({ scalingMode: mode })}
                    style={{
                      padding: '3px 8px',
                      borderRadius: 3,
                      fontSize: 10,
                      fontWeight: 600,
                      border: settings.scalingMode === mode ? '1px solid #00e676' : '1px solid rgba(255, 255, 255, 0.1)',
                      background: settings.scalingMode === mode ? 'rgba(0, 230, 118, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                      color: settings.scalingMode === mode ? '#00e676' : '#cbd5e1',
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                    }}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {/* Show Numbers on Bars (COB Ladder Style) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: '#cbd5e1' }}>Show Numbers on Bars</div>
                <div style={{ fontSize: 9, color: '#94a3b8' }}>Display order-flow delta (+/-) directly on rows (COB style)</div>
              </div>
              <input
                type="checkbox"
                checked={settings.showNumbersOnBars !== false}
                onChange={(e) => handleUpdate({ showNumbersOnBars: e.target.checked })}
              />
            </div>

            {/* Colors */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>+ Delta</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="color"
                    value={settings.posColor || '#00e676'}
                    onChange={(e) => handleUpdate({ posColor: e.target.value })}
                    style={{ width: 26, height: 26, border: 'none', background: 'none', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 10, color: '#cbd5e1' }}>Buy Delta</span>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>- Delta</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="color"
                    value={settings.negColor || '#ff2d55'}
                    onChange={(e) => handleUpdate({ negColor: e.target.value })}
                    style={{ width: 26, height: 26, border: 'none', background: 'none', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 10, color: '#cbd5e1' }}>Sell Delta</span>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>Delta POC</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="color"
                    value={settings.pocColor || '#facc15'}
                    onChange={(e) => handleUpdate({ pocColor: e.target.value })}
                    style={{ width: 26, height: 26, border: 'none', background: 'none', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 10, color: '#cbd5e1' }}>POC Marker</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section: Trapped Traders & Divergence Toggles */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#f43f5e', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Zap size={13} /> ORDER FLOW ANNOTATIONS & TRAPS
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: '#cbd5e1' }}>Show Delta POC Badge ([POC])</span>
                <input
                  type="checkbox"
                  checked={settings.showPoc}
                  onChange={(e) => handleUpdate({ showPoc: e.target.checked })}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: '#cbd5e1' }}>POTENTIAL TRAPPED BUYERS (Highs Absorption)</span>
                <input
                  type="checkbox"
                  checked={settings.showTrappedBuyers}
                  onChange={(e) => handleUpdate({ showTrappedBuyers: e.target.checked })}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: '#cbd5e1' }}>POTENTIAL TRAPPED SELLERS (Lows Absorption)</span>
                <input
                  type="checkbox"
                  checked={settings.showTrappedSellers}
                  onChange={(e) => handleUpdate({ showTrappedSellers: e.target.checked })}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: '#cbd5e1' }}>Delta Divergence Warnings</span>
                <input
                  type="checkbox"
                  checked={settings.showDivergence}
                  onChange={(e) => handleUpdate({ showDivergence: e.target.checked })}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 18px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(15, 23, 42, 0.6)',
          }}
        >
          <button
            onClick={handleReset}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            <RotateCcw size={12} /> Reset to Defaults
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '6px 14px',
              borderRadius: 4,
              background: '#38bdf8',
              border: 'none',
              color: '#090d16',
              fontWeight: 700,
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            Apply & Close
          </button>
        </div>
      </div>
    </div>
  );
};
