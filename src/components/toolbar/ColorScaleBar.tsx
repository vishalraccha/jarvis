/**
 * Color Scale Preview Bar
 * Shows the active Bookmap colormap gradient with cutoff & contrast indicators
 * JARVIS HEATMAP TERMINAL
 */

import React from 'react';
import { ColorMapEngine } from '../../services/heatmap/ColorMap';
import { ColorScaleType } from '../../types/heatmap';

interface ColorScaleBarProps {
  colorMapEngine: ColorMapEngine;
  activeScale: ColorScaleType;
  onScaleChange: (scale: ColorScaleType) => void;
  onOpenSettings: () => void;
}

export const ColorScaleBar: React.FC<ColorScaleBarProps> = ({
  colorMapEngine,
  activeScale,
  onScaleChange,
  onOpenSettings,
}) => {
  const gradient = colorMapEngine.generateCssGradient();

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 8px',
        background: 'rgba(255, 255, 255, 0.04)',
        borderRadius: 4,
        border: '1px solid rgba(255, 255, 255, 0.08)',
        cursor: 'pointer',
      }}
      title="Click to configure colormap gradient, cutoffs & contrast"
      onClick={onOpenSettings}
    >
      <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>Scale:</span>
      <div
        style={{
          width: 80,
          height: 12,
          borderRadius: 2,
          background: gradient,
          border: '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: '0 0 6px rgba(0, 180, 216, 0.2)',
        }}
      />
      <select
        value={activeScale}
        onChange={(e) => {
          e.stopPropagation();
          onScaleChange(e.target.value as ColorScaleType);
        }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#38bdf8',
          fontSize: 11,
          fontFamily: 'inherit',
          cursor: 'pointer',
          outline: 'none',
          padding: '0 2px',
        }}
      >
        <option value="bookmap" style={{ background: '#10141f' }}>Bookmap</option>
        <option value="fire" style={{ background: '#10141f' }}>Thermal Fire</option>
        <option value="grayscale" style={{ background: '#10141f' }}>Grayscale</option>
      </select>
    </div>
  );
};
