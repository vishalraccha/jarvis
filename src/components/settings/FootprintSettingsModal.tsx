/**
 * Footprint Configuration & Order Flow Settings Modal
 * JARVIS ORDER FLOW TERMINAL
 */

import React from 'react';
import { X, Sliders, RefreshCw } from 'lucide-react';
import { FootprintSettings } from '../../types/footprint';

interface FootprintSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: FootprintSettings;
  onChange: (updated: FootprintSettings) => void;
  onReset: () => void;
}

export const FootprintSettingsModal: React.FC<FootprintSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onChange,
  onReset,
}) => {
  if (!isOpen) return null;

  const handleChange = (patch: Partial<FootprintSettings>) => {
    onChange({ ...settings, ...patch });
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(5, 8, 15, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '540px',
          maxHeight: '85vh',
          backgroundColor: '#0c101a',
          border: '1px solid rgba(0, 180, 216, 0.35)',
          borderRadius: 8,
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.7), 0 0 20px rgba(0, 180, 216, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#e2e8f0',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '12px 18px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 255, 255, 0.02)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sliders size={18} color="#00b4d8" />
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: '0.02em', color: '#f8fafc' }}>
              Footprint & Order Flow Settings
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              padding: 4,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body Content */}
        <div
          style={{
            padding: '16px 18px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            fontSize: 12,
          }}
        >
          {/* Master Enable & Chart Mode */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              background: 'rgba(0, 180, 216, 0.08)',
              border: '1px solid rgba(0, 180, 216, 0.25)',
              borderRadius: 6,
            }}
          >
            <div>
              <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: 13 }}>Enable Footprint Mode</div>
              <div style={{ color: '#94a3b8', fontSize: 11 }}>
                Display executed Bid × Ask trade ladder inside each candle
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => handleChange({ enabled: e.target.checked })}
              style={{ width: 18, height: 18, accentColor: '#00b4d8', cursor: 'pointer' }}
            />
          </div>

          {/* Section: Diagonal Imbalances */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontWeight: 700, color: '#38bdf8', fontSize: 12, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 4 }}>
              DIAGONAL IMBALANCE DETECTION
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', color: '#94a3b8', marginBottom: 4 }}>Imbalance Ratio</label>
                <select
                  value={settings.imbalanceRatio}
                  onChange={(e) => handleChange({ imbalanceRatio: parseFloat(e.target.value) })}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    background: '#131926',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: 4,
                    color: '#f8fafc',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                >
                  <option value={2.0}>2:1 (Aggressive)</option>
                  <option value={3.0}>3:1 (Standard / Recommended)</option>
                  <option value={4.0}>4:1 (Conservative)</option>
                  <option value={5.0}>5:1 (Strict Institutional)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', color: '#94a3b8', marginBottom: 4 }}>Min Volume Filter (BTC)</label>
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  value={settings.minImbalanceVolume}
                  onChange={(e) => handleChange({ minImbalanceVolume: Math.max(0, parseFloat(e.target.value) || 0) })}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    background: '#131926',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: 4,
                    color: '#f8fafc',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings.showImbalances}
                  onChange={(e) => handleChange({ showImbalances: e.target.checked })}
                  style={{ accentColor: '#00b4d8' }}
                />
                <span>Highlight Imbalance Cells</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings.showStackedImbalances}
                  onChange={(e) => handleChange({ showStackedImbalances: e.target.checked })}
                  style={{ accentColor: '#00b4d8' }}
                />
                <span>Stacked Imbalances (≥ {settings.stackedImbalanceMinLevels} levels)</span>
              </label>
            </div>
          </div>

          {/* Section: Price Aggregation & Tick Size */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontWeight: 700, color: '#38bdf8', fontSize: 12, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 4 }}>
              PRICE-LEVEL AGGREGATION
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', color: '#94a3b8', marginBottom: 4 }}>Tick Multiplier</label>
                <select
                  value={settings.tickMultiplier}
                  onChange={(e) => handleChange({ tickMultiplier: parseInt(e.target.value, 10) })}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    background: '#131926',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: 4,
                    color: '#f8fafc',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                >
                  <option value={1}>1 Tick (Exact Instrument Step)</option>
                  <option value={2}>2 Ticks</option>
                  <option value={4}>4 Ticks</option>
                  <option value={8}>8 Ticks</option>
                  <option value={16}>16 Ticks</option>
                  <option value={50}>50 Ticks ($0.50)</option>
                  <option value={100}>100 Ticks ($1.00)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', color: '#94a3b8', marginBottom: 4 }}>Font Size (px)</label>
                <input
                  type="number"
                  min={8}
                  max={14}
                  value={settings.fontSize}
                  onChange={(e) => handleChange({ fontSize: parseInt(e.target.value, 10) || 10 })}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    background: '#131926',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: 4,
                    color: '#f8fafc',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Section: Display Toggles */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontWeight: 700, color: '#38bdf8', fontSize: 12, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 4 }}>
              DISPLAY OPTIONS
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings.showBidAskText}
                  onChange={(e) => handleChange({ showBidAskText: e.target.checked })}
                  style={{ accentColor: '#00b4d8' }}
                />
                <span>Bid × Ask Numbers</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings.showVolumeColors}
                  onChange={(e) => handleChange({ showVolumeColors: e.target.checked })}
                  style={{ accentColor: '#00b4d8' }}
                />
                <span>Volume Heat Gradient</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings.showPocHighlight}
                  onChange={(e) => handleChange({ showPocHighlight: e.target.checked })}
                  style={{ accentColor: '#00b4d8' }}
                />
                <span>Highlight POC Row</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings.showCandleDelta}
                  onChange={(e) => handleChange({ showCandleDelta: e.target.checked })}
                  style={{ accentColor: '#00b4d8' }}
                />
                <span>Per-Candle Delta Label</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings.showBottomPanel}
                  onChange={(e) => handleChange({ showBottomPanel: e.target.checked })}
                  style={{ accentColor: '#00b4d8' }}
                />
                <span>Bottom Volume & Delta Panel</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings.showSideProfile}
                  onChange={(e) => handleChange({ showSideProfile: e.target.checked })}
                  style={{ accentColor: '#00b4d8' }}
                />
                <span>Side Volume Profile (VR POC)</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings.showDebugInspection || false}
                  onChange={(e) => handleChange({ showDebugInspection: e.target.checked })}
                  style={{ accentColor: '#00b4d8' }}
                />
                <span style={{ color: '#38bdf8', fontWeight: 600 }}>Debug Inspection Mode (Price Alignment Tooltip)</span>
              </label>
            </div>
          </div>

          {/* Section: Colors */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontWeight: 700, color: '#38bdf8', fontSize: 12, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 4 }}>
              COLOR CUSTOMIZATION
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Seller (Bid) Color:</span>
                <input
                  type="color"
                  value={settings.bidColor}
                  onChange={(e) => handleChange({ bidColor: e.target.value })}
                  style={{ width: 32, height: 24, border: 'none', background: 'transparent', cursor: 'pointer' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Buyer (Ask) Color:</span>
                <input
                  type="color"
                  value={settings.askColor}
                  onChange={(e) => handleChange({ askColor: e.target.value })}
                  style={{ width: 32, height: 24, border: 'none', background: 'transparent', cursor: 'pointer' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>POC Row Color:</span>
                <input
                  type="color"
                  value={settings.pocColor}
                  onChange={(e) => handleChange({ pocColor: e.target.value })}
                  style={{ width: 32, height: 24, border: 'none', background: 'transparent', cursor: 'pointer' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Imbalance Highlight:</span>
                <input
                  type="color"
                  value={settings.imbalanceAskColor}
                  onChange={(e) => handleChange({ imbalanceAskColor: e.target.value })}
                  style={{ width: 32, height: 24, border: 'none', background: 'transparent', cursor: 'pointer' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 18px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 255, 255, 0.02)',
          }}
        >
          <button
            onClick={onReset}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#94a3b8',
              borderRadius: 4,
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            <RefreshCw size={12} />
            Reset Defaults
          </button>

          <button
            onClick={onClose}
            style={{
              background: '#00b4d8',
              border: 'none',
              color: '#0a0e17',
              borderRadius: 4,
              padding: '6px 18px',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
