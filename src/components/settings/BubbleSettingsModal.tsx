/**
 * Trade Bubble Settings Modal
 * JARVIS HEATMAP TERMINAL
 */

import React from 'react';
import { X, RotateCcw } from 'lucide-react';
import { BubbleSettings } from '../../types/heatmap';
import { DEFAULT_BUBBLE_SETTINGS } from '../../types/settings';

interface BubbleSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: BubbleSettings;
  onChange: (updated: BubbleSettings) => void;
}

export const BubbleSettingsModal: React.FC<BubbleSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onChange,
}) => {
  if (!isOpen) return null;

  const handleUpdate = (patch: Partial<BubbleSettings>) => {
    onChange({ ...settings, ...patch });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
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
          <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>TRADE BUBBLE SETTINGS</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Master Enable & Toggles */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: 4, border: '1px solid rgba(255, 255, 255, 0.07)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#38bdf8', fontWeight: 700, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => handleUpdate({ enabled: e.target.checked })}
                style={{ accentColor: '#00b4d8', width: 14, height: 14 }}
              />
              Enable Trade Volume Bubbles
            </label>
            <span style={{ fontSize: 10, color: settings.enabled ? '#00e676' : '#64748b', fontWeight: 600 }}>
              {settings.enabled ? 'ACTIVE' : 'DISABLED'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#e2e8f0', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.render3DStyle}
                onChange={(e) => handleUpdate({ render3DStyle: e.target.checked })}
                style={{ accentColor: '#00b4d8' }}
              />
              3D Sphere Shading (Bookmap)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#00e676', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.showBuyBubbles}
                onChange={(e) => handleUpdate({ showBuyBubbles: e.target.checked })}
                style={{ accentColor: '#00e676' }}
              />
              Show Buys
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#ff2d55', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.showSellBubbles}
                onChange={(e) => handleUpdate({ showSellBubbles: e.target.checked })}
                style={{ accentColor: '#ff2d55' }}
              />
              Show Sells
            </label>
          </div>

          {/* Min Notional & Min Qty */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
                <span>Min Trade Notional:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <span style={{ color: '#64748b', fontSize: 11 }}>$</span>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={settings.minTradeNotional}
                    onChange={(e) => handleUpdate({ minTradeNotional: Math.max(0, parseInt(e.target.value) || 0) })}
                    style={{
                      width: 75,
                      background: 'rgba(0,0,0,0.4)',
                      border: '1px solid rgba(0, 180, 216, 0.4)',
                      borderRadius: 3,
                      color: '#38bdf8',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 4px',
                      outline: 'none',
                      fontFamily: 'JetBrains Mono, monospace',
                      textAlign: 'right',
                    }}
                  />
                </div>
              </div>
              <input
                type="range"
                min="0"
                max="25000000"
                step="50000"
                value={settings.minTradeNotional}
                onChange={(e) => handleUpdate({ minTradeNotional: parseInt(e.target.value) || 0 })}
                style={{ width: '100%', accentColor: '#00b4d8', marginBottom: 6 }}
              />
              {/* Quick Presets */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {[0, 1000, 10000, 50000, 250000, 500000, 1000000, 5000000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleUpdate({ minTradeNotional: preset })}
                    style={{
                      fontSize: 9,
                      padding: '2px 5px',
                      background: settings.minTradeNotional === preset ? 'rgba(0, 180, 216, 0.35)' : 'rgba(255, 255, 255, 0.05)',
                      border: settings.minTradeNotional === preset ? '1px solid #00b4d8' : '1px solid rgba(255, 255, 255, 0.1)',
                      color: settings.minTradeNotional === preset ? '#ffffff' : '#94a3b8',
                      borderRadius: 3,
                      cursor: 'pointer',
                      fontFamily: 'JetBrains Mono, monospace',
                    }}
                  >
                    {preset === 0 ? 'All' : `$${preset >= 1000000 ? `${preset / 1000000}M` : `${preset / 1000}k`}`}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
                <span>Min Trade Qty:</span>
                <span style={{ color: '#38bdf8', fontWeight: 600 }}>{settings.minTradeQty} BTC</span>
              </div>
              <input
                type="range"
                min="0"
                max="250.0"
                step="1.0"
                value={settings.minTradeQty}
                onChange={(e) => handleUpdate({ minTradeQty: parseFloat(e.target.value) })}
                style={{ width: '100%', accentColor: '#00b4d8', marginBottom: 6 }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {[0, 1, 5, 10, 25, 50, 100, 250].map((qty) => (
                  <button
                    key={qty}
                    type="button"
                    onClick={() => handleUpdate({ minTradeQty: qty })}
                    style={{
                      fontSize: 9,
                      padding: '2px 5px',
                      background: settings.minTradeQty === qty ? 'rgba(0, 180, 216, 0.35)' : 'rgba(255, 255, 255, 0.05)',
                      border: settings.minTradeQty === qty ? '1px solid #00b4d8' : '1px solid rgba(255, 255, 255, 0.1)',
                      color: settings.minTradeQty === qty ? '#ffffff' : '#94a3b8',
                      borderRadius: 3,
                      cursor: 'pointer',
                      fontFamily: 'JetBrains Mono, monospace',
                    }}
                  >
                    {qty}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Scale & Opacity */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
                <span>Bubble Size Scale:</span>
                <span style={{ color: '#38bdf8', fontWeight: 600 }}>{settings.bubbleScale.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.5"
                step="0.1"
                value={settings.bubbleScale}
                onChange={(e) => handleUpdate({ bubbleScale: parseFloat(e.target.value) })}
                style={{ width: '100%', accentColor: '#00b4d8' }}
              />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
                <span>Bubble Opacity:</span>
                <span style={{ color: '#38bdf8', fontWeight: 600 }}>{(settings.opacity * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="1.0"
                step="0.05"
                value={settings.opacity}
                onChange={(e) => handleUpdate({ opacity: parseFloat(e.target.value) })}
                style={{ width: '100%', accentColor: '#00b4d8' }}
              />
            </div>
          </div>

          {/* Aggregation interval */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
              <span>Time Aggregation Window:</span>
              <span style={{ color: '#38bdf8', fontWeight: 600 }}>{settings.aggregationIntervalMs} ms</span>
            </div>
            <input
              type="range"
              min="100"
              max="1000"
              step="50"
              value={settings.aggregationIntervalMs}
              onChange={(e) => handleUpdate({ aggregationIntervalMs: parseInt(e.target.value) })}
              style={{ width: '100%', accentColor: '#00b4d8' }}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <button className="tool-btn" onClick={() => onChange(DEFAULT_BUBBLE_SETTINGS)}>
            <RotateCcw size={12} style={{ marginRight: 4 }} />
            Restore Defaults
          </button>
          <button className="tool-btn active" style={{ padding: '0 16px' }} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
