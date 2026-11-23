/**
 * Volume-Weighted Average Price (VWAP) Settings Modal
 * Provides full control over VWAP line, anchor periods, and SD 1 & SD 2 bands.
 * JARVIS HEATMAP TERMINAL - SETTINGS MODULE
 */

import React from 'react';
import { X, RotateCcw } from 'lucide-react';
import { VwapSettings, DEFAULT_VWAP_SETTINGS } from '../../types/settings';

interface VwapSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: VwapSettings;
  onChange: (updated: VwapSettings) => void;
  onReset?: () => void;
}

export const VwapSettingsModal: React.FC<VwapSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onChange,
  onReset,
}) => {
  if (!isOpen) return null;

  const handleUpdate = (patch: Partial<VwapSettings>) => {
    onChange({ ...settings, ...patch });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>VWAP & SD BANDS SETTINGS</span>
            <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 3, background: 'rgba(255, 159, 28, 0.15)', color: '#ff9f1c', fontWeight: 700 }}>
              SD 1 & 2
            </span>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Master Enable */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: 4, border: '1px solid rgba(255, 255, 255, 0.07)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#ff9f1c', fontWeight: 700, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => handleUpdate({ enabled: e.target.checked })}
                style={{ accentColor: '#ff9f1c', width: 14, height: 14 }}
              />
              Enable VWAP Indicator
            </label>
            <span style={{ fontSize: 10, color: settings.enabled ? '#00e676' : '#64748b', fontWeight: 600 }}>
              {settings.enabled ? 'ACTIVE' : 'DISABLED'}
            </span>
          </div>

          {/* Anchor & Source */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                Anchor Period (Reset)
              </label>
              <select
                value={settings.anchor}
                onChange={(e) => handleUpdate({ anchor: e.target.value as any })}
                style={{
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 4,
                  padding: '5px 8px',
                  color: '#f1f5f9',
                  fontSize: 12,
                }}
              >
                <option value="session">Session (Daily 00:00 UTC)</option>
                <option value="week">Weekly</option>
                <option value="month">Monthly</option>
                <option value="continuous">Continuous (No Reset)</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                Source Price
              </label>
              <select
                value={settings.source}
                onChange={(e) => handleUpdate({ source: e.target.value as any })}
                style={{
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 4,
                  padding: '5px 8px',
                  color: '#f1f5f9',
                  fontSize: 12,
                }}
              >
                <option value="hlc3">Typical Price (HLC3)</option>
                <option value="close">Close Price</option>
                <option value="hl2">Median Price (HL2)</option>
              </select>
            </div>
          </div>

          {/* VWAP Center Line Style */}
          <div style={{ padding: '8px 10px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: 4, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>
              VWAP Center Line
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>Color:</span>
                <input
                  type="color"
                  value={settings.vwapColor}
                  onChange={(e) => handleUpdate({ vwapColor: e.target.value })}
                  style={{ width: 24, height: 24, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 3 }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>Thickness:</span>
                <select
                  value={settings.lineWidth}
                  onChange={(e) => handleUpdate({ lineWidth: parseInt(e.target.value, 10) })}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 3,
                    padding: '2px 6px',
                    color: '#f1f5f9',
                    fontSize: 11,
                  }}
                >
                  <option value={1}>1 px</option>
                  <option value={2}>2 px (Default)</option>
                  <option value={3}>3 px</option>
                </select>
              </div>
            </div>
          </div>

          {/* Standard Deviation Band 1 (± 1.0 SD) */}
          <div style={{ padding: '8px 10px', background: 'rgba(56, 189, 248, 0.04)', borderRadius: 4, border: '1px solid rgba(56, 189, 248, 0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#38bdf8', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings.showBands1}
                  onChange={(e) => handleUpdate({ showBands1: e.target.checked })}
                  style={{ accentColor: '#38bdf8' }}
                />
                Standard Deviation Band 1 (±1σ)
              </label>
              <input
                type="color"
                value={settings.band1Color}
                onChange={(e) => handleUpdate({ band1Color: e.target.value })}
                style={{ width: 20, height: 20, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 3 }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>Multiplier:</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="5.0"
                  value={settings.multiplier1}
                  onChange={(e) => handleUpdate({ multiplier1: parseFloat(e.target.value) || 1.0 })}
                  style={{
                    width: 60,
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 3,
                    padding: '2px 6px',
                    color: '#f1f5f9',
                    fontSize: 11,
                    textAlign: 'center',
                  }}
                />
                <span style={{ fontSize: 10, color: '#64748b' }}>× σ</span>
              </div>
            </div>
          </div>

          {/* Standard Deviation Band 2 (± 2.0 SD) */}
          <div style={{ padding: '8px 10px', background: 'rgba(168, 85, 247, 0.04)', borderRadius: 4, border: '1px solid rgba(168, 85, 247, 0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#a855f7', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings.showBands2}
                  onChange={(e) => handleUpdate({ showBands2: e.target.checked })}
                  style={{ accentColor: '#a855f7' }}
                />
                Standard Deviation Band 2 (±2σ)
              </label>
              <input
                type="color"
                value={settings.band2Color}
                onChange={(e) => handleUpdate({ band2Color: e.target.value })}
                style={{ width: 20, height: 20, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 3 }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>Multiplier:</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="5.0"
                  value={settings.multiplier2}
                  onChange={(e) => handleUpdate({ multiplier2: parseFloat(e.target.value) || 2.0 })}
                  style={{
                    width: 60,
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 3,
                    padding: '2px 6px',
                    color: '#f1f5f9',
                    fontSize: 11,
                    textAlign: 'center',
                  }}
                />
                <span style={{ fontSize: 10, color: '#64748b' }}>× σ</span>
              </div>
            </div>
          </div>

          {/* Bands Style */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>Bands Line Style:</span>
            <select
              value={settings.bandsStyle}
              onChange={(e) => handleUpdate({ bandsStyle: e.target.value as any })}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 3,
                padding: '3px 8px',
                color: '#f1f5f9',
                fontSize: 11,
              }}
            >
              <option value="dashed">Dashed (Standard)</option>
              <option value="dotted">Dotted</option>
              <option value="solid">Solid</option>
            </select>
          </div>

          {/* Reset Defaults */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <button
              onClick={() => {
                if (onReset) onReset();
                else onChange(DEFAULT_VWAP_SETTINGS);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#94a3b8',
                borderRadius: 4,
                padding: '4px 10px',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              <RotateCcw size={12} />
              Reset Defaults
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
