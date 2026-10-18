/**
 * ColorMap Engine for Market Liquidity Heatmap
 * Bookmap-inspired deterministic gradient lookup & normalization
 * Features stable palette mapping, robust intensity graduation,
 * and independent Liquidity Filter vs Graphics Color Saturation.
 * JARVIS HEATMAP TERMINAL
 */

import { ColorScaleType, HeatmapSettings } from '../../types/heatmap';

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export class ColorMapEngine {
  public static readonly LUT_SIZE = 1024;
  private lut: Uint8ClampedArray = new Uint8ClampedArray(ColorMapEngine.LUT_SIZE * 4);
  private currentScaleType: ColorScaleType = 'bookmap';
  private currentColorSaturation: number = 1.0;
  private currentBrightness: number = 1.0;
  private currentOpacity: number = 0.95;

  constructor() {
    this.rebuildLut();
  }

  /**
   * Rebuild the fast Lookup Table (LUT) whenever graphics color settings change.
   * Note: Liquidity Filtering is performed at query time and does NOT mutate this palette!
   */
  rebuildLut(
    scaleType: ColorScaleType = this.currentScaleType,
    colorSaturation: number = this.currentColorSaturation,
    brightness: number = this.currentBrightness,
    opacity: number = this.currentOpacity
  ): void {
    this.currentScaleType = scaleType;
    this.currentColorSaturation = colorSaturation;
    this.currentBrightness = brightness;
    this.currentOpacity = opacity;

    const size = ColorMapEngine.LUT_SIZE;

    for (let i = 0; i < size; i++) {
      const t = i / (size - 1); // 0.0 to 1.0
      const baseRgba = this.interpolateScale(t, scaleType);

      // Apply graphics color saturation & brightness
      const adjusted = this.adjustSaturationBrightness(
        baseRgba.r,
        baseRgba.g,
        baseRgba.b,
        colorSaturation,
        brightness
      );

      const offset = i * 4;
      this.lut[offset] = adjusted.r;
      this.lut[offset + 1] = adjusted.g;
      this.lut[offset + 2] = adjusted.b;
      this.lut[offset + 3] = Math.round(opacity * 255);
    }
  }

  /**
   * Base gradient definition matching Bookmap's signature palette
   * Low: Dark blue -> Ocean Blue -> Cyan -> Yellow -> Orange -> Red
   */
  private interpolateScale(t: number, scaleType: ColorScaleType): RGBA {
    if (scaleType === 'grayscale') {
      const v = Math.round(t * 255);
      return { r: v, g: v, b: v, a: t < 0.05 ? 0 : 0.85 };
    }

    if (scaleType === 'fire') {
      if (t < 0.15) {
        return { r: 9, g: 13, b: 22, a: 0 };
      } else if (t < 0.45) {
        const f = (t - 0.15) / 0.3;
        return { r: Math.round(f * 220), g: 0, b: 0, a: 0.8 };
      } else if (t < 0.75) {
        const f = (t - 0.45) / 0.3;
        return { r: 255, g: Math.round(f * 180), b: 0, a: 0.9 };
      } else {
        const f = (t - 0.75) / 0.25;
        return { r: 255, g: Math.round(180 + f * 75), b: Math.round(f * 255), a: 1 };
      }
    }

    // Default: Bookmap signature multi-chromatic palette
    // 0.00 - 0.20: Deep Navy (#031c38) -> Rich Ocean Blue (#005b96) (Normal ambient levels)
    // 0.20 - 0.40: Ocean Blue (#005b96) -> Electric Cyan (#00f0ff) (Moderate levels)
    // 0.40 - 0.60: Electric Cyan -> Bright Glowing Golden Yellow (#ffea00) (Strong levels)
    // 0.60 - 0.80: Glowing Golden Yellow -> Radiant Fiery Orange (#ff7b00) (Very strong levels)
    // 0.80 - 1.00: Radiant Orange -> Crimson & Hot Red (#ff0044) (Exceptional peak walls)
    if (t <= 0.20) {
      const f = t / 0.20;
      const alpha = 0.88 + f * 0.08;
      return {
        r: Math.round(3 + f * (0 - 3)),
        g: Math.round(28 + f * (91 - 28)),
        b: Math.round(56 + f * (150 - 56)),
        a: alpha,
      };
    } else if (t <= 0.40) {
      const f = (t - 0.20) / 0.20;
      return {
        r: 0,
        g: Math.round(91 + f * (240 - 91)),
        b: Math.round(150 + f * (255 - 150)),
        a: 0.90 + f * 0.04,
      };
    } else if (t <= 0.60) {
      const f = (t - 0.40) / 0.20;
      return {
        r: Math.round(0 + f * 255),
        g: Math.round(240 + f * (234 - 240)),
        b: Math.round(255 - f * 255),
        a: 0.94 + f * 0.02,
      };
    } else if (t <= 0.80) {
      const f = (t - 0.60) / 0.20;
      return {
        r: 255,
        g: Math.round(234 - f * (234 - 123)),
        b: 0,
        a: 0.96 + f * 0.02,
      };
    } else {
      const f = Math.min(1.0, (t - 0.80) / 0.20);
      return {
        r: 255,
        g: Math.round(123 - f * 123),
        b: Math.round(f * 68),
        a: 1.0,
      };
    }
  }

  /**
   * Adjust color saturation and brightness in RGB space
   */
  private adjustSaturationBrightness(
    r: number,
    g: number,
    b: number,
    sat: number,
    bright: number
  ): { r: number; g: number; b: number } {
    const gray = 0.2989 * r + 0.587 * g + 0.114 * b;
    let nr = gray + (r - gray) * sat;
    let ng = gray + (g - gray) * sat;
    let nb = gray + (b - gray) * sat;

    nr *= bright;
    ng *= bright;
    nb *= bright;

    return {
      r: Math.max(0, Math.min(255, Math.round(nr))),
      g: Math.max(0, Math.min(255, Math.round(ng))),
      b: Math.max(0, Math.min(255, Math.round(nb))),
    };
  }

  /**
   * Map observed liquidity quantity to a deterministic color.
   * Filtering hides weaker liquidity cells without altering the colors of surviving cells!
   */
  getColor(
    quantity: number,
    minQty: number,
    maxQty: number,
    settings: HeatmapSettings,
    filterThreshold?: number
  ): RGBA & { hex: string } {
    // 1. Empty check
    if (!quantity || quantity <= 0 || !isFinite(quantity)) {
      return { r: 9, g: 13, b: 22, a: 0, hex: 'transparent' };
    }

    // 2. Liquidity Filter: Hide cells below threshold without changing colors of surviving cells
    const activeThreshold = filterThreshold !== undefined && filterThreshold > 0
      ? filterThreshold
      : (settings.liquidityFilterMode === 'absolute' && settings.minLiquidityQty > 0)
        ? settings.minLiquidityQty
        : (settings.lowerCutoffAbsolute > 0)
          ? settings.lowerCutoffAbsolute
          : 0;

    if (activeThreshold > 0 && quantity < activeThreshold) {
      return { r: 9, g: 13, b: 22, a: 0, hex: 'transparent' };
    }

    if (settings.lowerCutoffAbsolute > 0 && quantity < settings.lowerCutoffAbsolute) {
      return { r: 9, g: 13, b: 22, a: 0, hex: 'transparent' };
    }

    let effectiveVal = quantity;
    if (settings.upperCutoffAbsolute > 0) {
      effectiveVal = Math.min(effectiveVal, settings.upperCutoffAbsolute);
    }

    // 3. Robust Monotonic Intensity Normalization
    const effectiveMin = Math.max(0, minQty);
    const effectiveMax = Math.max(effectiveMin + 0.001, maxQty);
    let norm: number;

    if (settings.useLogScale !== false) {
      const vRoot = Math.sqrt(Math.max(0, effectiveVal));
      const minRoot = Math.sqrt(effectiveMin);
      const maxRoot = Math.sqrt(effectiveMax);
      norm = (vRoot - minRoot) / Math.max(0.0001, maxRoot - minRoot);
    } else {
      norm = (effectiveVal - effectiveMin) / Math.max(0.001, effectiveMax - effectiveMin);
    }
    norm = Math.max(0, Math.min(1, norm));

    // Contrast mapping
    if (settings.contrast && settings.contrast !== 1.0) {
      norm = Math.pow(norm, Math.max(0.2, settings.contrast));
    }

    const index = Math.max(
      0,
      Math.min(ColorMapEngine.LUT_SIZE - 1, Math.floor(norm * (ColorMapEngine.LUT_SIZE - 1)))
    );
    const offset = index * 4;

    const r = this.lut[offset];
    const g = this.lut[offset + 1];
    const b = this.lut[offset + 2];
    const a = this.lut[offset + 3];

    return {
      r,
      g,
      b,
      a,
      hex: `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(2)})`,
    };
  }

  /**
   * Fast RGBA extraction for Canvas pixel buffers
   */
  getLutEntry(norm: number): { r: number; g: number; b: number; a: number } {
    const clamped = Math.max(0, Math.min(1, norm));
    const index = Math.floor(clamped * (ColorMapEngine.LUT_SIZE - 1));
    const offset = index * 4;
    return {
      r: this.lut[offset],
      g: this.lut[offset + 1],
      b: this.lut[offset + 2],
      a: this.lut[offset + 3],
    };
  }

  /**
   * Render color bar gradient for UI preview
   */
  generateCssGradient(): string {
    const stops: string[] = [];
    const step = 0.1;
    for (let t = 0; t <= 1.0; t += step) {
      const rgba = this.interpolateScale(t, this.currentScaleType);
      const adj = this.adjustSaturationBrightness(
        rgba.r,
        rgba.g,
        rgba.b,
        this.currentColorSaturation,
        this.currentBrightness
      );
      stops.push(`rgb(${adj.r}, ${adj.g}, ${adj.b}) ${(t * 100).toFixed(0)}%`);
    }
    return `linear-gradient(to right, ${stops.join(', ')})`;
  }
}

export const colorMapEngine = new ColorMapEngine();
