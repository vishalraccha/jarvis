/**
 * Streamlined Heatmap Settings Modal
 * Focuses exclusively on the required visualization controls:
 * Color Palette, Liquidity Filter, Contrast, Brightness, and Opacity.
 * JARVIS HEATMAP TERMINAL - BOOKMAP ENGINE
 */

import React from 'react';
import { X, RotateCcw } from 'lucide-react';
import { ColorScaleType, HeatmapSettings } from '../../types/heatmap';
import { DEFAULT_HEATMAP_SETTINGS } from '../../types/settings';
import { ColorMapEngine } from '../../services/heatmap/ColorMap';

interface HeatmapSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: HeatmapSettings;
  onChange: (updated: HeatmapSettings) => void;
  colorMapEngine: ColorMapEngine;
}

export const HeatmapSettingsModal: React.FC<HeatmapSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onChange,
  colorMapEngine,
}) => {
  if (!isOpen) return null;

  const handleUpdate = (patch: Partial<HeatmapSettings>) => {
    const updated = { ...settings, ...patch };
    colorMapEngine.rebuildLut(
      updated.colorScale,
      updated.colorSaturation ?? 1.15,
      updated.brightness ?? 1.05,
      updated.opacity ?? 0.95
    );
    onChange(updated);
  };

  const handleReset = () => {
    handleUpdate(DEFAULT_HEATMAP_SETTINGS);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 440,
          background: 'rgba(9, 13, 22, 0.98)',
          border: '1px solid rgba(0, 180, 216, 0.3)',
          borderRadius: 8,
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.8)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(15, 23, 42, 0.6)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', letterSpacing: '0.5px' }}>
              HEATMAP VISUALIZATION SETTINGS
            </span>
            <span
              style={{
                fontSize: 10,
                background: 'rgba(0, 180, 216, 0.15)',
                color: '#38bdf8',
                padding: '2px 6px',
                borderRadius: 4,
                fontWeight: 600,
              }}
            >
              BOOKMAP ENGINE
            </span>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Color Scale Palette */}
          <div>
            <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 8 }}>
              COLOR GRADIENT PALETTE
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {(['bookmap', 'fire', 'grayscale'] as ColorScaleType[]).map((scale) => (
                <button
                  key={scale}
                  className={`tool-btn ${settings.colorScale === scale ? 'active' : ''}`}
                  style={{
                    height: 34,
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: 'capitalize',
                    border: settings.colorScale === scale ? '1px solid #00b4d8' : '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                  onClick={() => handleUpdate({ colorScale: scale })}
                >
                  {scale === 'bookmap' ? 'Bookmap Signature' : scale === 'fire' ? 'Thermal Fire' : 'Grayscale'}
                </button>
              ))}
            </div>
          </div>

          {/* Liquidity Filter Threshold */}
          <div
            style={{
              background: 'rgba(0, 180, 216, 0.08)',
              border: '1px solid rgba(0, 180, 216, 0.25)',
              borderRadius: 6,
              padding: '12px 14px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#38bdf8', fontWeight: 700, marginBottom: 6 }}>
              <span>Liquidity Filter (Visibility Threshold):</span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {settings.liquidityFilterPercentile ?? settings.saturation ?? 0}%
                {(settings.liquidityFilterPercentile ?? 0) === 0 ? ' (Full Depth)' : (settings.liquidityFilterPercentile ?? 0) >= 75 ? ' (Major Walls)' : ''}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="95"
              step="1"
              value={settings.liquidityFilterPercentile ?? settings.saturation ?? 0}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                handleUpdate({ liquidityFilterPercentile: val, saturation: val });
              }}
              style={{ width: '100%', accentColor: '#00b4d8' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#64748b', marginTop: 4 }}>
              <span>0% (All Depth)</span>
              <span>25% (Moderate+)</span>
              <span>50% (Strong+)</span>
              <span>75% (Major Walls)</span>
              <span>90% (Peak Walls)</span>
            </div>
          </div>

          {/* Heatmap Contrast & Brightness */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
                <span>Contrast / Heat Intensity:</span>
                <span style={{ color: '#38bdf8', fontWeight: 600 }}>{settings.contrast.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.5"
                step="0.05"
                value={settings.contrast}
                onChange={(e) => handleUpdate({ contrast: parseFloat(e.target.value) })}
                style={{ width: '100%', accentColor: '#00b4d8' }}
              />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
                <span>Brightness:</span>
                <span style={{ color: '#38bdf8', fontWeight: 600 }}>{settings.brightness.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.05"
                value={settings.brightness}
                onChange={(e) => handleUpdate({ brightness: parseFloat(e.target.value) })}
                style={{ width: '100%', accentColor: '#00b4d8' }}
              />
            </div>
          </div>

          {/* Opacity & Saturation */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
                <span>Heatmap Opacity:</span>
                <span style={{ color: '#38bdf8', fontWeight: 600 }}>{(settings.opacity * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0.4"
                max="1.0"
                step="0.05"
                value={settings.opacity}
                onChange={(e) => handleUpdate({ opacity: parseFloat(e.target.value) })}
                style={{ width: '100%', accentColor: '#00b4d8' }}
              />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
                <span>Color Saturation:</span>
                <span style={{ color: '#38bdf8', fontWeight: 600 }}>{(settings.colorSaturation ?? 1.15).toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.05"
                value={settings.colorSaturation ?? 1.15}
                onChange={(e) => handleUpdate({ colorSaturation: parseFloat(e.target.value) })}
                style={{ width: '100%', accentColor: '#00b4d8' }}
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
              gap: 6,
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <RotateCcw size={13} />
            Reset to Bookmap Defaults
          </button>
          <button
            onClick={onClose}
            className="tool-btn active"
            style={{ height: 28, padding: '0 16px', fontSize: 11, fontWeight: 700 }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
