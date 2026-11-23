/**
 * J.A.R.V.I.S 2.0 - GEX Chart Price Lines Overlay
 * Renders native Lightweight Charts price lines for:
 *   - Gamma Flip (Gold dashed line with 'Γ FLIP' badge on price scale)
 *   - Call Wall (Cyan solid line with 'CALL WALL' badge)
 *   - Put Wall (Pink solid line with 'PUT WALL' badge)
 *   - Major +Gamma / -Gamma strike clusters
 * Completely independent lifecycle: zero mutations to candles, heatmaps, or VWAP.
 */

import React, { useEffect, useRef } from 'react';
import { IChartApi, ISeriesApi, LineStyle, IPriceLine } from 'lightweight-charts';
import { GexMetrics, GexSettings } from '../../types/gex';

interface GexChartOverlayProps {
  chart: IChartApi | null;
  series: ISeriesApi<'Candlestick'> | null;
  settings: GexSettings;
  metrics: GexMetrics | null;
  showGex: boolean;
}

export const GexChartOverlay: React.FC<GexChartOverlayProps> = ({
  chart,
  series,
  settings,
  metrics,
  showGex,
}) => {
  const priceLinesRef = useRef<IPriceLine[]>([]);

  useEffect(() => {
    // 1. Clean up existing price lines
    if (series && priceLinesRef.current.length > 0) {
      for (const line of priceLinesRef.current) {
        try {
          series.removePriceLine(line);
        } catch {}
      }
      priceLinesRef.current = [];
    }

    // 2. Validate prerequisites
    if (!chart || !series || !showGex || !settings.enabled || !settings.showChartOverlay || !metrics) {
      return;
    }

    const createdLines: IPriceLine[] = [];

    try {
      // 3. Gamma Flip Line (Gold dashed)
      if (settings.showGammaFlipLine && metrics.gammaFlip && metrics.gammaFlip.price > 0) {
        const line = series.createPriceLine({
          price: metrics.gammaFlip.price,
          color: settings.colorFlip || '#f59e0b',
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `Γ FLIP ($${metrics.gammaFlip.price.toFixed(1)})`,
        });
        createdLines.push(line);
      }

      // 4. Call Wall Line (Cyan solid)
      if (settings.showCallWallLine && metrics.callWall && metrics.callWall.strike > 0) {
        const line = series.createPriceLine({
          price: metrics.callWall.strike,
          color: settings.colorCallWall || '#06b6d4',
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: `CALL WALL ($${metrics.callWall.strike})`,
        });
        createdLines.push(line);
      }

      // 5. Put Wall Line (Pink solid)
      if (settings.showPutWallLine && metrics.putWall && metrics.putWall.strike > 0) {
        const line = series.createPriceLine({
          price: metrics.putWall.strike,
          color: settings.colorPutWall || '#ec4899',
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: `PUT WALL ($${metrics.putWall.strike})`,
        });
        createdLines.push(line);
      }

      // 6. Major Gamma Clusters (Dotted)
      if (settings.showMajorGammaLines) {
        for (const price of metrics.majorPositiveLevels.slice(0, 2)) {
          if (price !== metrics.callWall.strike && price > 0) {
            const line = series.createPriceLine({
              price,
              color: settings.colorCall || '#10b981',
              lineWidth: 1,
              lineStyle: LineStyle.Dotted,
              axisLabelVisible: true,
              title: `+Γ CLUSTER`,
            });
            createdLines.push(line);
          }
        }

        for (const price of metrics.majorNegativeLevels.slice(0, 2)) {
          if (price !== metrics.putWall.strike && price > 0) {
            const line = series.createPriceLine({
              price,
              color: settings.colorPut || '#f43f5e',
              lineWidth: 1,
              lineStyle: LineStyle.Dotted,
              axisLabelVisible: true,
              title: `-Γ CLUSTER`,
            });
            createdLines.push(line);
          }
        }
      }
    } catch (err) {
      console.warn('[GexChartOverlay] Error rendering price lines:', err);
    }

    priceLinesRef.current = createdLines;

    return () => {
      if (series && priceLinesRef.current.length > 0) {
        for (const line of priceLinesRef.current) {
          try {
            series.removePriceLine(line);
          } catch {}
        }
        priceLinesRef.current = [];
      }
    };
  }, [
    chart,
    series,
    showGex,
    settings.enabled,
    settings.showChartOverlay,
    settings.showGammaFlipLine,
    settings.showCallWallLine,
    settings.showPutWallLine,
    settings.showMajorGammaLines,
    settings.colorFlip,
    settings.colorCallWall,
    settings.colorPutWall,
    settings.colorCall,
    settings.colorPut,
    metrics,
  ]);

  return null; // Native price lines are managed directly on the Lightweight Charts series
};
