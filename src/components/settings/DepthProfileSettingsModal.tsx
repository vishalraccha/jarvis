/**
 * Current Order Book (COB) Profile Settings Modal
 * Configures profile width, depth levels, bid/ask colors, opacity, labels & normalization
 * JARVIS HEATMAP TERMINAL - SECTION 4
 */

import React from 'react';
import { X, RotateCcw } from 'lucide-react';
import { DepthProfileSettings } from '../../types/heatmap';
import { DEFAULT_DEPTH_PROFILE_SETTINGS } from '../../types/settings';

interface DepthProfileSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: DepthProfileSettings;
  onChange: (updated: DepthProfileSettings) => void;
  onReset?: () => void;
}

export const DepthProfileSettingsModal: React.FC<DepthProfileSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onChange,
  onReset,
}) => {
  if (!isOpen) return null;

  const handleUpdate = (patch: Partial<DepthProfileSettings>) => {
    onChange({ ...settings, ...patch });
  };

  const handleReset = () => {
    if (onReset) {
      onReset();
    } else {
      onChange(DEFAULT_DEPTH_PROFILE_SETTINGS);
    }
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
          <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>
            CURRENT ORDER BOOK (COB) PROFILE SETTINGS
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Show / Hide Toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#f1f5f9', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={settings.enabled !== false}
              onChange={(e) => handleUpdate({ enabled: e.target.checked })}
              style={{ accentColor: '#00b4d8', width: 15, height: 15 }}
            />
            <span><strong>Enable COB Profile Overlay</strong> (Right margin aligned with price scale)</span>
          </label>

          {/* Profile Width */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
              <span>Profile Width:</span>
              <span style={{ color: '#38bdf8', fontWeight: 600 }}>{settings.widthPx || 220}px</span>
            </div>
            <input
              type="range"
              min="140"
              max="320"
              step="10"
              value={settings.widthPx || 220}
              onChange={(e) => handleUpdate({ widthPx: parseInt(e.target.value) })}
              style={{ width: '100%', accentColor: '#00b4d8' }}
            />
          </div>

          {/* Max Depth Levels */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
              <span>Maximum Depth Levels:</span>
              <span style={{ color: '#38bdf8', fontWeight: 600 }}>{settings.maxLevels || 150} levels</span>
            </div>
            <input
              type="range"
              min="50"
              max="500"
              step="25"
              value={settings.maxLevels || 150}
              onChange={(e) => handleUpdate({ maxLevels: parseInt(e.target.value) })}
              style={{ width: '100%', accentColor: '#00b4d8' }}
            />
          </div>

          {/* Opacity */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
              <span>Panel &amp; Bar Opacity:</span>
              <span style={{ color: '#38bdf8', fontWeight: 600 }}>{Math.round((settings.opacity || 0.90) * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.3"
              max="1.0"
              step="0.05"
              value={settings.opacity || 0.90}
              onChange={(e) => handleUpdate({ opacity: parseFloat(e.target.value) })}
              style={{ width: '100%', accentColor: '#00b4d8' }}
            />
          </div>

          {/* Color Customization */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <span style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 6 }}>
                Bid Liquidity Color (Support):
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                {['#00e676', '#00c853', '#22c55e', '#38bdf8'].map((col) => (
                  <button
                    key={col}
                    onClick={() => handleUpdate({ bidColor: col })}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 4,
                      backgroundColor: col,
                      border: settings.bidColor === col ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.2)',
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
            </div>

            <div>
              <span style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 6 }}>
                Ask Liquidity Color (Resistance):
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                {['#ff2d55', '#ff1744', '#ef4444', '#f59e0b'].map((col) => (
                  <button
                    key={col}
                    onClick={() => handleUpdate({ askColor: col })}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 4,
                      backgroundColor: col,
                      border: settings.askColor === col ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.2)',
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Options Toggles */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#e2e8f0', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.showDelta !== false}
                onChange={(e) => handleUpdate({ showDelta: e.target.checked })}
                style={{ accentColor: '#00b4d8' }}
              />
              Show Traded Delta at Price (+Buy / -Sell Imbalance)
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#e2e8f0', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.showVolumeProfile !== false}
                onChange={(e) => handleUpdate({ showVolumeProfile: e.target.checked })}
                style={{ accentColor: '#00b4d8' }}
              />
              Show Traded Volume Profile (Total Executed Volume)
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#e2e8f0', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.showPoc !== false}
                onChange={(e) => handleUpdate({ showPoc: e.target.checked })}
                style={{ accentColor: '#00b4d8' }}
              />
              Highlight Point of Control (POC - Highest Traded Volume)
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#e2e8f0', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.showValues !== false}
                onChange={(e) => handleUpdate({ showValues: e.target.checked })}
                style={{ accentColor: '#00b4d8' }}
              />
              Show Numeric Quantity Labels beside price levels
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#e2e8f0', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.normalized !== false}
                onChange={(e) => handleUpdate({ normalized: e.target.checked })}
                style={{ accentColor: '#00b4d8' }}
              />
              Auto-Fit Normalization (Scale bar lengths relative to visible peak size)
            </label>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <button className="tool-btn" onClick={handleReset}>
            <RotateCcw size={12} style={{ marginRight: 4 }} />
            Reset Defaults
          </button>
          <button className="tool-btn active" onClick={onClose} style={{ padding: '0 16px' }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
