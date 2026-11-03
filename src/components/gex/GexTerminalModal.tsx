/**
 * J.A.R.V.I.S 2.0 - GEX Terminal Modal & Tool Interface
 * Independent, full-featured Options Gamma Exposure intelligence modal.
 * Tabbed navigation:
 *   - Overview & Strikes (KPIs, Call/Put Walls, Gamma Flip, Strike Histogram)
 *   - Heatmap Matrix (Strike x Expiration)
 *   - Expiration Breakdown (0DTE, Weeklies, Monthlies)
 *   - Price Scenarios (+/-0.5%, +/-1%, +/-2% repricing)
 *   - Model Sensitivity Comparison
 *   - Visual & Chart Overlay Settings
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Sliders,
  BarChart2,
  Grid,
  Calendar,
  TrendingUp,
  Cpu,
  Layers,
  AlertTriangle,
  RefreshCw,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  GexMetrics,
  GexSettings,
  OptionChainSnapshot,
} from '../../types/gex';
import { GexEngine } from '../../services/gex/GexEngine';
import { OptionsDataProvider } from '../../services/gex/OptionsDataProvider';
import { GexSummaryCard } from './GexSummaryCard';
import { GexStrikeHistogram } from './GexStrikeHistogram';
import { GexHeatmapMatrix } from './GexHeatmapMatrix';
import { GexExpirationAnalysis } from './GexExpirationAnalysis';
import { GexScenarioTable } from './GexScenarioTable';
import { GexModelComparisonTable } from './GexModelComparisonTable';

interface GexTerminalModalProps {
  isOpen: boolean;
  onClose: () => void;
  symbol?: string;
  currentSpotPrice?: number;
  settings: GexSettings;
  onUpdateSettings: (patch: Partial<GexSettings>) => void;
  metrics?: GexMetrics | null;
  onRefresh?: () => void;
  isLoading?: boolean;
}

type TabType = 'overview' | 'heatmap' | 'expirations' | 'scenarios' | 'models' | 'settings';

export const GexTerminalModal: React.FC<GexTerminalModalProps> = ({
  isOpen,
  onClose,
  symbol = 'BTCUSDT',
  currentSpotPrice = 0,
  settings,
  onUpdateSettings,
  metrics: externalMetrics,
  onRefresh: externalRefresh,
  isLoading: externalLoading,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [snapshot, setSnapshot] = useState<OptionChainSnapshot | null>(null);
  const [internalMetrics, setInternalMetrics] = useState<GexMetrics | null>(null);
  const [internalLoading, setInternalLoading] = useState<boolean>(false);
  const [engine] = useState(() => new GexEngine());

  const metrics = externalMetrics !== undefined ? externalMetrics : internalMetrics;
  const isLoading = externalLoading !== undefined ? externalLoading : internalLoading;

  // Load and calculate options data
  const loadOptionsData = useCallback(async () => {
    setInternalLoading(true);
    try {
      const snap = await OptionsDataProvider.fetchOptionChain(symbol, currentSpotPrice);
      setSnapshot(snap);
      const res = engine.calculate(snap, settings);
      setInternalMetrics(res);
    } catch (err) {
      console.error('[GexTerminalModal] Error loading options data:', err);
    } finally {
      setInternalLoading(false);
    }
  }, [symbol, currentSpotPrice, settings, engine]);

  useEffect(() => {
    if (isOpen && externalMetrics === undefined) {
      loadOptionsData();
    }
  }, [isOpen, symbol, externalMetrics, loadOptionsData]);

  // Recalculate if settings (model or unit) change
  useEffect(() => {
    if (snapshot) {
      const res = engine.calculate(snapshot, settings);
      setInternalMetrics(res);
    }
  }, [settings, snapshot, engine]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(3, 7, 18, 0.82)',
        backdropFilter: 'blur(8px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px',
      }}
    >
      <div
        className="modal-content"
        style={{
          width: '95vw',
          maxWidth: 960,
          maxHeight: '92vh',
          background: '#090d18',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          borderRadius: 10,
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.95), 0 0 0 1px rgba(255, 255, 255, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#f1f5f9',
        }}
      >
        {/* 1. Modal Top Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 18px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(15, 23, 42, 0.75)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#38bdf8',
              }}
            >
              <Cpu size={16} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.04em' }}>
                  GAMMA EXPOSURE (GEX) TERMINAL
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    background: 'rgba(56, 189, 248, 0.18)',
                    color: '#38bdf8',
                    padding: '1px 6px',
                    borderRadius: 4,
                  }}
                >
                  {snapshot?.optionsUnderlying || symbol}
                </span>
                {snapshot?.isStale && (
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 700,
                      background: 'rgba(239, 68, 68, 0.18)',
                      color: '#f87171',
                      padding: '1px 6px',
                      borderRadius: 4,
                    }}
                  >
                    DELAYED / STALE
                  </span>
                )}
              </div>
              <div style={{ fontSize: 10.5, color: '#94a3b8' }}>
                Provider: {snapshot?.provider || 'Authentic Exchange Feeds'} • Underlying: {symbol} @ $
                {currentSpotPrice.toFixed(currentSpotPrice >= 1000 ? 1 : 2)}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => externalRefresh ? externalRefresh() : loadOptionsData()}
              disabled={isLoading}
              title="Refresh Options Chain"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#cbd5e1',
                padding: '6px 10px',
                borderRadius: 6,
                fontSize: 11,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">{isLoading ? 'Syncing...' : 'Refresh'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: 'none',
                color: '#94a3b8',
                padding: 6,
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* 2. Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '6px 14px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(0, 0, 0, 0.25)',
            overflowX: 'auto',
          }}
        >
          {[
            { id: 'overview', label: 'Overview & Strikes', icon: BarChart2 },
            { id: 'heatmap', label: 'GEX Heatmap', icon: Grid },
            { id: 'expirations', label: 'Expirations & 0DTE', icon: Calendar },
            { id: 'scenarios', label: 'Scenario Analysis', icon: TrendingUp },
            { id: 'models', label: 'Model Sensitivity', icon: Layers },
            { id: 'settings', label: 'Overlay Settings', icon: Sliders },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as TabType)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? '#38bdf8' : '#94a3b8',
                  background: isActive ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                  border: isActive ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid transparent',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <Icon size={13} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* 3. Tab Content Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {isLoading && !metrics ? (
            <div style={{ padding: '60px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              Loading and evaluating live options chain...
            </div>
          ) : !metrics || metrics.strikes.length === 0 ? (
            <div
              style={{
                padding: '40px 20px',
                textAlign: 'center',
                background: 'rgba(239, 68, 68, 0.05)',
                border: '1px solid rgba(239, 68, 68, 0.15)',
                borderRadius: 8,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <AlertTriangle size={24} style={{ color: '#ef4444' }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f87171' }}>
                Options Data Unavailable for {symbol}
              </div>
              <div style={{ fontSize: 11.5, color: '#94a3b8', maxWidth: 480 }}>
                {metrics?.basisNotice ||
                  'No authentic exchange-cleared options chain feed is currently reachable for this asset. Synthetic data is prohibited to preserve mathematical integrity.'}
              </div>
            </div>
          ) : (
            <>
              {/* Tab 1: Overview & Strikes */}
              {activeTab === 'overview' && (
                <>
                  <GexSummaryCard
                    metrics={metrics}
                    selectedModel={settings.positioningModel}
                    onModelChange={(model) => onUpdateSettings({ positioningModel: model })}
                    selectedUnit={settings.unit}
                    onUnitChange={(unit) => onUpdateSettings({ unit })}
                    onRefresh={loadOptionsData}
                    isRefreshing={isLoading}
                  />

                  <GexStrikeHistogram
                    strikes={metrics.strikes}
                    spotPrice={currentSpotPrice}
                    callWall={metrics.callWall}
                    putWall={metrics.putWall}
                    gammaFlip={metrics.gammaFlip}
                    unitLabel={settings.unit === 'dollar_per_1pct' ? '$/1% move' : '$/point'}
                  />
                </>
              )}

              {/* Tab 2: Heatmap Matrix */}
              {activeTab === 'heatmap' && snapshot && (
                <GexHeatmapMatrix
                  contracts={snapshot.contracts}
                  spotPrice={currentSpotPrice}
                  selectedModel={settings.positioningModel}
                  selectedUnit={settings.unit}
                />
              )}

              {/* Tab 3: Expirations */}
              {activeTab === 'expirations' && (
                <GexExpirationAnalysis
                  expirations={metrics.expirations}
                  nearExpPct={metrics.nearExpirationConcentrationPct}
                />
              )}

              {/* Tab 4: Scenarios */}
              {activeTab === 'scenarios' && (
                <GexScenarioTable
                  scenarios={metrics.scenarioAnalysis}
                  currentSpot={currentSpotPrice}
                />
              )}

              {/* Tab 5: Model Sensitivity */}
              {activeTab === 'models' && (
                <GexModelComparisonTable
                  comparisons={metrics.modelComparisons}
                  activeModel={settings.positioningModel}
                  onSelectModel={(model) => onUpdateSettings({ positioningModel: model })}
                />
              )}

              {/* Tab 6: Settings */}
              {activeTab === 'settings' && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    background: '#0a0f1d',
                    borderRadius: 8,
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    padding: 16,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>
                    Chart Overlay & Visual Settings
                  </span>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* Master Chart Overlay Switch */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        borderRadius: 6,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>Show GEX Overlay on Main Chart</div>
                        <div style={{ fontSize: 10.5, color: '#94a3b8' }}>
                          Draws horizontal Gamma Flip, Call Wall, and Put Wall levels on TradingView chart
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onUpdateSettings({ showChartOverlay: !settings.showChartOverlay })}
                        style={{
                          background: settings.showChartOverlay ? '#0284c7' : 'rgba(255, 255, 255, 0.1)',
                          border: 'none',
                          color: '#fff',
                          padding: '4px 10px',
                          borderRadius: 4,
                          fontSize: 11,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        {settings.showChartOverlay ? <Eye size={12} /> : <EyeOff size={12} />}
                        <span>{settings.showChartOverlay ? 'Enabled' : 'Disabled'}</span>
                      </button>
                    </div>

                    {/* Individual Lines Toggles */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={settings.showGammaFlipLine}
                          onChange={(e) => onUpdateSettings({ showGammaFlipLine: e.target.checked })}
                        />
                        <span>Show Gamma Flip Line (Gold)</span>
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={settings.showCallWallLine}
                          onChange={(e) => onUpdateSettings({ showCallWallLine: e.target.checked })}
                        />
                        <span>Show Call Wall Line (Cyan)</span>
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={settings.showPutWallLine}
                          onChange={(e) => onUpdateSettings({ showPutWallLine: e.target.checked })}
                        />
                        <span>Show Put Wall Line (Pink)</span>
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={settings.showMajorGammaLines}
                          onChange={(e) => onUpdateSettings({ showMajorGammaLines: e.target.checked })}
                        />
                        <span>Show Major Gamma Clusters</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
