/**
 * Absorption Tool Settings Modal
 * JARVIS HEATMAP TERMINAL - ORDER FLOW ABSORPTION
 */

import React from 'react';
import { X, RotateCcw, Target } from 'lucide-react';
import { AbsorptionSettings, DEFAULT_ABSORPTION_SETTINGS } from '../../types/absorption';
import { AbsorptionEngine } from '../../services/absorption/AbsorptionEngine';

interface AbsorptionSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AbsorptionSettings;
  onChange: (updated: AbsorptionSettings) => void;
  onReset?: () => void;
  absorptionEngine?: AbsorptionEngine;
}

export const AbsorptionSettingsModal: React.FC<AbsorptionSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onChange,
  onReset,
  absorptionEngine,
}) => {
  if (!isOpen) return null;

  const handleUpdate = (patch: Partial<AbsorptionSettings>) => {
    onChange({ ...settings, ...patch });
  };

  const handleReset = () => {
    if (onReset) {
      onReset();
    } else {
      onChange({ ...DEFAULT_ABSORPTION_SETTINGS });
    }
  };

  const summary = absorptionEngine ? absorptionEngine.getEventsSummary() : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
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
            <Target size={16} style={{ color: '#facc15' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>
              ABSORPTION SETTINGS (A & A+)
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
          {/* Live Status Badge */}
          {summary && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 12px',
                background: 'rgba(250, 204, 21, 0.08)',
                borderRadius: 4,
                border: '1px solid rgba(250, 204, 21, 0.25)',
                fontSize: 11,
              }}
            >
              <span style={{ color: '#94a3b8' }}>Liquidity Zone Absorptions:</span>
              <span style={{ color: '#facc15', fontWeight: 700 }}>
                {summary.visible} visible ({summary.aPlusCount} A+, {summary.aCount} A)
              </span>
            </div>
          )}
          {/* Master Enable Toggle */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              background: 'rgba(250, 204, 21, 0.05)',
              borderRadius: 6,
              border: '1px solid rgba(250, 204, 21, 0.2)',
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                color: '#facc15',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => handleUpdate({ enabled: e.target.checked })}
                style={{ accentColor: '#facc15', width: 14, height: 14 }}
              />
              Enable Order-Flow Absorption
            </label>
            <span
              style={{
                fontSize: 10,
                color: settings.enabled ? '#00e676' : '#64748b',
                fontWeight: 700,
              }}
            >
              {settings.enabled ? 'ACTIVE' : 'DISABLED'}
            </span>
          </div>

          {/* Grade Display Filter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
              Absorption Grade Filter
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button
                type="button"
                onClick={() => handleUpdate({ gradeFilter: 'all' })}
                style={{
                  padding: '7px 10px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: settings.gradeFilter === 'all'
                    ? '1.5px solid #facc15'
                    : '1px solid rgba(255, 255, 255, 0.1)',
                  background: settings.gradeFilter === 'all'
                    ? 'rgba(250, 204, 21, 0.15)'
                    : 'rgba(255, 255, 255, 0.03)',
                  color: settings.gradeFilter === 'all' ? '#facc15' : '#94a3b8',
                }}
              >
                Show A & A+
              </button>
              <button
                type="button"
                onClick={() => handleUpdate({ gradeFilter: 'a_plus_only' })}
                style={{
                  padding: '7px 10px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: settings.gradeFilter === 'a_plus_only'
                    ? '1.5px solid #ffd700'
                    : '1px solid rgba(255, 255, 255, 0.1)',
                  background: settings.gradeFilter === 'a_plus_only'
                    ? 'rgba(255, 215, 0, 0.2)'
                    : 'rgba(255, 255, 255, 0.03)',
                  color: settings.gradeFilter === 'a_plus_only' ? '#ffd700' : '#94a3b8',
                }}
              >
                A+ Only (Exceptional)
              </button>
            </div>
          </div>

          {/* Volume Threshold Multiplier */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ color: '#94a3b8' }}>Volume Threshold Multiplier:</span>
              <span style={{ color: '#facc15', fontWeight: 700 }}>
                {settings.minVolumeMultiplier}x baseline
              </span>
            </div>
            <input
              type="range"
              min="1.0"
              max="4.0"
              step="0.25"
              value={settings.minVolumeMultiplier}
              onChange={(e) => handleUpdate({ minVolumeMultiplier: parseFloat(e.target.value) })}
              style={{ accentColor: '#facc15' }}
            />
            <span style={{ fontSize: 9.5, color: '#64748b' }}>
              Adaptive to recent trade size distribution per instrument. Higher = only large clusters.
            </span>
          </div>

          {/* Minimum Confidence Score */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ color: '#94a3b8' }}>Minimum Confidence Score:</span>
              <span style={{ color: '#38bdf8', fontWeight: 700 }}>
                {settings.minConfidenceScore}/100
              </span>
            </div>
            <input
              type="range"
              min="60"
              max="90"
              step="5"
              value={settings.minConfidenceScore}
              onChange={(e) => handleUpdate({ minConfidenceScore: parseInt(e.target.value, 10) })}
              style={{ accentColor: '#38bdf8' }}
            />
            <span style={{ fontSize: 9.5, color: '#64748b' }}>
              Requires sufficient evidence from executed volume, price halt, and zone relevance.
            </span>
          </div>

          {/* Visual Options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: 10 }}>
            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Visual Presentation</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: '#e2e8f0', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.showGlowForAPlus}
                onChange={(e) => handleUpdate({ showGlowForAPlus: e.target.checked })}
                style={{ accentColor: '#ffd700' }}
              />
              Show Golden Glow & Dual Ring on A+ Events
            </label>
          </div>

          {/* Sizing: Min & Max Radius */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 10.5, color: '#94a3b8' }}>Min Bubble Radius</span>
              <input
                type="number"
                min="10"
                max="24"
                value={settings.bubbleMinRadius}
                onChange={(e) => handleUpdate({ bubbleMinRadius: parseInt(e.target.value, 10) || 14 })}
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  padding: '4px 8px',
                  borderRadius: 4,
                  fontSize: 11,
                }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 10.5, color: '#94a3b8' }}>Max Bubble Radius</span>
              <input
                type="number"
                min="25"
                max="60"
                value={settings.bubbleMaxRadius}
                onChange={(e) => handleUpdate({ bubbleMaxRadius: parseInt(e.target.value, 10) || 38 })}
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  padding: '4px 8px',
                  borderRadius: 4,
                  fontSize: 11,
                }}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(0, 0, 0, 0.2)',
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
            <RotateCcw size={12} />
            Reset Defaults
          </button>
          <button
            onClick={onClose}
            style={{
              background: '#facc15',
              color: '#0f172a',
              border: 'none',
              padding: '5px 14px',
              borderRadius: 4,
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
