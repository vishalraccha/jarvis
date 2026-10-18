/**
 * Professional Trading Terminal Top Toolbar
 * JARVIS HEATMAP TERMINAL - ORGANIZED MODULAR UI
 * Grouped into: Market | Chart | Liquidity | Order Flow | View | Status
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Flame,
  CandlestickChart,
  CircleDot,
  BarChart3,
  GitCommit,
  Maximize2,
  Minimize2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Sliders,
  Activity,
  ArrowRightCircle,
  Database,
  Layers,
  ChevronDown,
  Settings,
  PanelBottom,
  PanelRight,
  PanelLeft,
  Percent,
  Hash,
  Lock,
  Power,
} from 'lucide-react';
import { CandleTimeframe, ConnectionState, ExchangeId, LatencyMetrics } from '../../types/market';
import { TerminalPreferences } from '../../types/settings';
import { ChartMode } from '../../types/footprint';
import { ColorMapEngine } from '../../services/heatmap/ColorMap';
import { ColorScaleType } from '../../types/heatmap';

interface TopToolbarProps {
  preferences: TerminalPreferences;
  onUpdatePreferences: (updated: Partial<TerminalPreferences>) => void;
  connectionState: ConnectionState;
  latencyMetrics: LatencyMetrics;
  colorMapEngine: ColorMapEngine;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onJumpToLatest: () => void;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
  onOpenHeatmapSettings?: () => void;
  onOpenBubbleSettings?: () => void;
  onOpenDepthProfileSettings?: () => void;
  onOpenFootprintSettings?: () => void;
  onOpenDiagnostics: () => void;
  onOpenCacheModal: () => void;
  onLockTerminal?: () => void;
}

import { InstrumentRegistry } from '../../services/market/InstrumentRegistry';
import { MarketSessionService } from '../../services/market/MarketSessionService';

const SUPPORTED_TIMEFRAMES: CandleTimeframe[] = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '1d'];

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title?: string;
}

const Switch: React.FC<SwitchProps> = ({ checked, onChange, title }) => (
  <label className="terminal-switch" title={title} onClick={(e) => e.stopPropagation()}>
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
    <span className="terminal-switch-slider" />
  </label>
);

export const TopToolbar: React.FC<TopToolbarProps> = ({
  preferences,
  onUpdatePreferences,
  connectionState,
  latencyMetrics,
  colorMapEngine,
  onZoomIn,
  onZoomOut,
  onResetView,
  onJumpToLatest,
  onToggleFullscreen,
  isFullscreen,
  onOpenHeatmapSettings,
  onOpenBubbleSettings,
  onOpenDepthProfileSettings,
  onOpenFootprintSettings,
  onOpenDiagnostics,
  onOpenCacheModal,
  onLockTerminal,
}) => {
  const [openMenu, setOpenMenu] = useState<'chart' | 'liquidity' | 'orderFlow' | 'view' | null>(null);
  const toolbarRef = useRef<HTMLElement | null>(null);

  // Close open dropdowns on click outside
  useEffect(() => {
    if (!openMenu) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [openMenu]);

  // Live Asia/Kolkata Clock
  const [kolkataTime, setKolkataTime] = useState<string>('');
  useEffect(() => {
    const updateTime = () => {
      const formatted = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(new Date());
      setKolkataTime(formatted);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const currentInst = InstrumentRegistry.getInstrument(preferences.symbol);
  const currentSession = MarketSessionService.getSessionInfo(currentInst.marketSchedule);

  const getStatusBadge = () => {
    if (!currentSession.isOpen) {
      return {
        label: currentSession.isWeekend ? 'CLOSED' : 'BREAK',
        bg: 'rgba(239, 68, 68, 0.16)',
        color: '#f87171',
        border: 'rgba(239, 68, 68, 0.4)',
        title: currentSession.reason,
      };
    }

    switch (connectionState) {
      case 'LIVE':
        return {
          label: 'LIVE',
          bg: 'rgba(0, 230, 118, 0.12)',
          color: '#00e676',
          border: 'rgba(0, 230, 118, 0.35)',
          title: 'Connected to live stream',
        };
      case 'CONNECTING':
        return {
          label: 'CONNECTING',
          bg: 'rgba(255, 179, 0, 0.12)',
          color: '#ffb300',
          border: 'rgba(255, 179, 0, 0.35)',
          title: 'Connecting to exchange',
        };
      case 'RESYNCING':
        return {
          label: 'RESYNCING',
          bg: 'rgba(168, 85, 247, 0.12)',
          color: '#c084fc',
          border: 'rgba(168, 85, 247, 0.35)',
          title: 'Resynchronizing order book sequence',
        };
      case 'STALE':
        return {
          label: 'STALE',
          bg: 'rgba(249, 115, 22, 0.12)',
          color: '#fb923c',
          border: 'rgba(249, 115, 22, 0.35)',
          title: 'Stale quotes or no new trades received',
        };
      case 'DISCONNECTED':
      default:
        return {
          label: 'OFFLINE',
          bg: 'rgba(255, 45, 85, 0.12)',
          color: '#ff2d55',
          border: 'rgba(255, 45, 85, 0.35)',
          title: 'Disconnected',
        };
    }
  };

  const badge = getStatusBadge();
  const baseAsset = preferences.symbol.replace(/(USDT|USDC|FDUSD|BUSD|USD)$/i, '') || 'BTC';

  const toggleMenu = (menu: 'chart' | 'liquidity' | 'orderFlow' | 'view') => {
    setOpenMenu((prev) => (prev === menu ? null : menu));
  };

  return (
    <header
      ref={toolbarRef}
      style={{
        height: '42px',
        background: '#0c1017',
        borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 10px',
        userSelect: 'none',
        gap: 6,
        position: 'relative',
        zIndex: 100,
        overflow: 'visible',
      }}
    >
      {/* ============================================================ */}
      {/* 1. MARKET GROUP: Exchange, Symbol, Timeframe                 */}
      {/* ============================================================ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {/* Terminal Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 2 }}>
          <div
            style={{
              width: 20,
              height: 20,
              background: 'linear-gradient(135deg, #00b4d8 0%, #0077b6 100%)',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: 11,
              color: '#ffffff',
              boxShadow: '0 0 8px rgba(0, 180, 216, 0.35)',
            }}
          >
            J
          </div>
          <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: '0.08em', color: '#f8fafc' }}>
            J.A.R.V.I.S
          </span>
        </div>

        {/* Exchange Selector */}
        <select
          value={preferences.exchange}
          onChange={(e) => {
            const newEx = e.target.value as ExchangeId;
            const instruments = InstrumentRegistry.getInstrumentsByExchange(newEx);
            if (instruments.length > 0) {
              const first = instruments[0];
              onUpdatePreferences({
                exchange: newEx,
                symbol: first.symbol,
                timeframe: first.supportedIntervals.includes(preferences.timeframe)
                  ? preferences.timeframe
                  : first.defaultTimeframe,
              });
            } else {
              onUpdatePreferences({ exchange: newEx });
            }
          }}
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 4,
            color: '#94a3b8',
            fontSize: 11,
            fontWeight: 600,
            padding: '3px 6px',
            outline: 'none',
            cursor: 'pointer',
          }}
          title="Exchange data feed"
        >
          <option value="binance" style={{ background: '#0d121c' }}>BINANCE</option>
          <option value="bybit" style={{ background: '#0d121c' }}>BYBIT</option>
          <option value="goldprice_dev" style={{ background: '#0d121c' }}>GOLDPRICE.DEV</option>
        </select>

        {/* Symbol Selector */}
        <select
          value={preferences.symbol}
          onChange={(e) => {
            const selected = e.target.value;
            const inst = InstrumentRegistry.getInstrument(selected);
            const patch: Partial<TerminalPreferences> = {
              symbol: inst.symbol,
              exchange: inst.providerId,
            };
            if (!inst.supportedIntervals.includes(preferences.timeframe)) {
              patch.timeframe = inst.defaultTimeframe;
            }
            onUpdatePreferences(patch);
          }}
          style={{
            background: 'rgba(0, 180, 216, 0.08)',
            border: '1px solid rgba(0, 180, 216, 0.3)',
            borderRadius: 4,
            color: '#38bdf8',
            fontSize: 11.5,
            fontWeight: 700,
            padding: '3px 8px',
            outline: 'none',
            cursor: 'pointer',
          }}
          title="Active trading pair & instrument type"
        >
          <optgroup label="Gold & Metals" style={{ background: '#0b101b', color: '#fbbf24', fontWeight: 700 }}>
            <option value="XAUUSD" style={{ background: '#0d121c', color: '#f1f5f9' }}>
              XAUUSD Spot • GoldPrice.dev (OTC 1D)
            </option>
            <option value="XAUUSDT" style={{ background: '#0d121c', color: '#f1f5f9' }}>
              XAUUSDT Perpetual • Binance Futures (24/7)
            </option>
            <option value="GC" style={{ background: '#0d121c', color: '#94a3b8' }}>
              GC Gold Futures • COMEX (Proxy 1D)
            </option>
          </optgroup>
          <optgroup label="Crypto Spot (24/7 Live L2)" style={{ background: '#0b101b', color: '#38bdf8', fontWeight: 700 }}>
            <option value="BTCUSDT" style={{ background: '#0d121c', color: '#f1f5f9' }}>
              BTC/USDT Spot • Binance
            </option>
            <option value="ETHUSDT" style={{ background: '#0d121c', color: '#f1f5f9' }}>
              ETH/USDT Spot • Binance
            </option>
            <option value="SOLUSDT" style={{ background: '#0d121c', color: '#f1f5f9' }}>
              SOL/USDT Spot • Binance
            </option>
            <option value="BNBUSDT" style={{ background: '#0d121c', color: '#f1f5f9' }}>
              BNB/USDT Spot • Binance
            </option>
          </optgroup>
        </select>

        {/* Timeframe Selector Pills */}
        <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.03)', borderRadius: 4, padding: 1.5, gap: 1 }}>
          {SUPPORTED_TIMEFRAMES.map((tf) => {
            const isSupported = currentInst.supportedIntervals.includes(tf);
            return (
              <button
                key={tf}
                disabled={!isSupported}
                style={{
                  height: 22,
                  padding: '0 5px',
                  fontSize: 10.5,
                  fontWeight: preferences.timeframe === tf ? 700 : 500,
                  border: 'none',
                  background: preferences.timeframe === tf ? 'rgba(0, 180, 216, 0.22)' : 'transparent',
                  color: preferences.timeframe === tf ? '#38bdf8' : isSupported ? '#788497' : '#334155',
                  borderRadius: 3,
                  cursor: isSupported ? 'pointer' : 'not-allowed',
                  opacity: isSupported ? 1 : 0.35,
                  transition: 'all 0.12s ease',
                }}
                onClick={() => isSupported && onUpdatePreferences({ timeframe: tf })}
                title={
                  !isSupported
                    ? `${currentInst.provider} free tier supports ${currentInst.supportedIntervals.join(', ')} only`
                    : `Switch timeframe to ${tf}`
                }
              >
                {tf}
              </button>
            );
          })}
        </div>
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 18, background: 'rgba(255, 255, 255, 0.08)', margin: '0 2px' }} />

      {/* ============================================================ */}
      {/* 2. NESTED DROPDOWN GROUPS: Chart | Liquidity | Order Flow | View */}
      {/* ============================================================ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        {/* --- CHART TOOLS DROPDOWN --- */}
        <div style={{ position: 'relative' }}>
          <button
            className={`terminal-dropdown-btn ${preferences.showCandles ? 'active' : ''} ${openMenu === 'chart' ? 'open' : ''}`}
            onClick={() => toggleMenu('chart')}
            title="Chart Display Modes & Core Layers"
          >
            <CandlestickChart size={13} />
            <span>Chart</span>
            <ChevronDown size={11} style={{ opacity: 0.6 }} />
          </button>

          {openMenu === 'chart' && (
            <div className="terminal-dropdown-menu" style={{ width: 240 }}>
              <div className="terminal-menu-header">Primary Mode</div>
              <div style={{ padding: '4px 10px 8px 10px' }}>
                <select
                  value={preferences.chartMode || 'candles'}
                  onChange={(e) => {
                    const mode = e.target.value as ChartMode;
                    if (mode === 'candles') {
                      onUpdatePreferences({
                        chartMode: mode,
                        showCandles: true,
                        showHeatmap: false,
                        showFootprint: false,
                        showBubbles: false,
                        bubbles: { ...preferences.bubbles, enabled: false },
                        showDepthProfile: false,
                        footprint: { ...preferences.footprint, enabled: false },
                      });
                    } else if (mode === 'heatmap') {
                      onUpdatePreferences({
                        chartMode: mode,
                        showCandles: true,
                        showHeatmap: true,
                        showFootprint: false,
                        showBubbles: true,
                        bubbles: { ...preferences.bubbles, enabled: true },
                        showDepthProfile: true,
                        depthProfile: { ...preferences.depthProfile, enabled: true },
                        footprint: { ...preferences.footprint, enabled: false },
                      });
                    } else if (mode === 'footprint') {
                      onUpdatePreferences({
                        chartMode: mode,
                        showCandles: false,
                        showHeatmap: false,
                        showFootprint: true,
                        showBubbles: preferences.showBubbles,
                        bubbles: { ...preferences.bubbles, enabled: preferences.showBubbles },
                        showDepthProfile: false,
                        footprint: { ...preferences.footprint, enabled: true, showSideProfile: true },
                      });
                    } else if (mode === 'heatmap_footprint') {
                      onUpdatePreferences({
                        chartMode: mode,
                        showCandles: false,
                        showHeatmap: true,
                        showFootprint: true,
                        showBubbles: preferences.showBubbles,
                        bubbles: { ...preferences.bubbles, enabled: preferences.showBubbles },
                        showDepthProfile: false,
                        footprint: { ...preferences.footprint, enabled: true },
                      });
                    }
                  }}
                  style={{
                    width: '100%',
                    background: '#141a27',
                    border: '1px solid rgba(0, 180, 216, 0.35)',
                    borderRadius: 4,
                    color: '#38bdf8',
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '4px 8px',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="candles">Standard Candles</option>
                  <option value="heatmap">Heatmap</option>
                  <option value="footprint">Footprint</option>
                  <option value="heatmap_footprint">Heatmap + Footprint</option>
                </select>
              </div>

              <div className="terminal-menu-divider" />
              <div className="terminal-menu-header">Display Layers</div>

              <div
                className="terminal-menu-item"
                onClick={() => onUpdatePreferences({ showCandles: !preferences.showCandles })}
              >
                <span>Candlesticks</span>
                <Switch checked={preferences.showCandles} onChange={(c) => onUpdatePreferences({ showCandles: c })} />
              </div>

              <div
                className="terminal-menu-item"
                onClick={() => onUpdatePreferences({ showHeatmap: !preferences.showHeatmap })}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>Liquidity Heatmap</span>
                  {onOpenHeatmapSettings && (
                    <span
                      title="Open Heatmap Settings"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenu(null);
                        onOpenHeatmapSettings();
                      }}
                      style={{
                        color: preferences.showHeatmap ? '#00b4d8' : '#64748b',
                        cursor: 'pointer',
                        padding: '1px 3px',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <Sliders size={11} />
                    </span>
                  )}
                </div>
                <Switch checked={preferences.showHeatmap} onChange={(c) => onUpdatePreferences({ showHeatmap: c })} />
              </div>

              <div
                className="terminal-menu-item"
                onClick={() => {
                  const next = !preferences.showFootprint;
                  onUpdatePreferences({
                    showFootprint: next,
                    footprint: { ...preferences.footprint, enabled: next },
                  });
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>Footprint Order Flow</span>
                  {onOpenFootprintSettings && (
                    <span
                      title="Open Footprint Settings"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenu(null);
                        onOpenFootprintSettings();
                      }}
                      style={{
                        color: preferences.showFootprint ? '#00b4d8' : '#64748b',
                        cursor: 'pointer',
                        padding: '1px 3px',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <Sliders size={11} />
                    </span>
                  )}
                </div>
                <Switch checked={preferences.showFootprint} onChange={(c) => onUpdatePreferences({ showFootprint: c, footprint: { ...preferences.footprint, enabled: c } })} />
              </div>

              <div
                className="terminal-menu-item"
                onClick={() => {
                  const next = !preferences.showBubbles;
                  onUpdatePreferences({
                    showBubbles: next,
                    bubbles: { ...preferences.bubbles, enabled: next },
                  });
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>Trade Volume Bubbles</span>
                  {onOpenBubbleSettings && (
                    <span
                      title="Open Bubble Settings"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenu(null);
                        onOpenBubbleSettings();
                      }}
                      style={{
                        color: preferences.showBubbles ? '#00b4d8' : '#64748b',
                        cursor: 'pointer',
                        padding: '1px 3px',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <Sliders size={11} />
                    </span>
                  )}
                </div>
                <Switch
                  checked={preferences.showBubbles}
                  onChange={(c) =>
                    onUpdatePreferences({
                      showBubbles: c,
                      bubbles: { ...preferences.bubbles, enabled: c },
                    })
                  }
                />
              </div>

              <div
                className="terminal-menu-item"
                onClick={() => {
                  const next = !preferences.showDepthProfile;
                  onUpdatePreferences({
                    showDepthProfile: next,
                    depthProfile: { ...preferences.depthProfile, enabled: next },
                  });
                }}
              >
                <span>Order Book Ladder (COB)</span>
                <Switch checked={preferences.showDepthProfile} onChange={(c) => onUpdatePreferences({ showDepthProfile: c, depthProfile: { ...preferences.depthProfile, enabled: c } })} />
              </div>

              <div
                className="terminal-menu-item"
                onClick={() => onUpdatePreferences({ showBestBidAskLines: !preferences.showBestBidAskLines })}
              >
                <span>Best Bid / Ask Ribbon</span>
                <Switch checked={preferences.showBestBidAskLines} onChange={(c) => onUpdatePreferences({ showBestBidAskLines: c })} />
              </div>

              <div
                className="terminal-menu-item"
                onClick={() => onUpdatePreferences({ showCurrentPriceLine: !preferences.showCurrentPriceLine })}
              >
                <span>Current Price Line</span>
                <Switch checked={preferences.showCurrentPriceLine} onChange={(c) => onUpdatePreferences({ showCurrentPriceLine: c })} />
              </div>

              {onOpenBubbleSettings && (
                <>
                  <div className="terminal-menu-divider" />
                  <div
                    className="terminal-menu-item action-btn"
                    onClick={() => {
                      setOpenMenu(null);
                      onOpenBubbleSettings();
                    }}
                  >
                    <span>Trade Bubble Settings...</span>
                    <Sliders size={12} />
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* --- LIQUIDITY DROPDOWN --- */}
        <div style={{ position: 'relative' }}>
          <button
            className={`terminal-dropdown-btn ${preferences.showHeatmap ? 'active' : ''} ${openMenu === 'liquidity' ? 'open' : ''}`}
            onClick={() => toggleMenu('liquidity')}
            title="Heatmap Settings, Liquidity Filter, Color Scales & COB"
          >
            <Flame size={13} />
            <span>Liquidity</span>
            <ChevronDown size={11} style={{ opacity: 0.6 }} />
          </button>

          {openMenu === 'liquidity' && (
            <div className="terminal-dropdown-menu" style={{ width: 270 }}>
              <div className="terminal-menu-header">Heatmap Master</div>
              <div
                className="terminal-menu-item"
                onClick={() => onUpdatePreferences({ showHeatmap: !preferences.showHeatmap })}
              >
                <span style={{ fontWeight: 600, color: '#f8fafc' }}>Enable Heatmap</span>
                <Switch checked={preferences.showHeatmap} onChange={(c) => onUpdatePreferences({ showHeatmap: c })} />
              </div>

              <div className="terminal-menu-divider" />
              <div className="terminal-menu-header">Liquidity Filter</div>

              <div style={{ padding: '4px 12px 8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {/* Filter Mode & Inputs */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <div style={{ display: 'flex', background: '#141a27', borderRadius: 3, border: '1px solid rgba(255, 255, 255, 0.1)', overflow: 'hidden' }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdatePreferences({ heatmap: { ...preferences.heatmap, liquidityFilterMode: 'percentile' } });
                      }}
                      style={{
                        padding: '2px 8px',
                        border: 'none',
                        background: preferences.heatmap.liquidityFilterMode === 'percentile' ? 'rgba(0, 180, 216, 0.35)' : 'transparent',
                        color: preferences.heatmap.liquidityFilterMode === 'percentile' ? '#38bdf8' : '#64748b',
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      %
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdatePreferences({ heatmap: { ...preferences.heatmap, liquidityFilterMode: 'absolute' } });
                      }}
                      style={{
                        padding: '2px 8px',
                        border: 'none',
                        background: preferences.heatmap.liquidityFilterMode === 'absolute' ? 'rgba(0, 180, 216, 0.35)' : 'transparent',
                        color: preferences.heatmap.liquidityFilterMode === 'absolute' ? '#38bdf8' : '#64748b',
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      QTY
                    </button>
                  </div>

                  {preferences.heatmap.liquidityFilterMode === 'percentile' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input
                        type="number"
                        min={0}
                        max={99}
                        value={preferences.heatmap.liquidityFilterPercentile ?? 0}
                        onChange={(e) => {
                          const val = Math.max(0, Math.min(99, parseInt(e.target.value, 10) || 0));
                          onUpdatePreferences({ heatmap: { ...preferences.heatmap, liquidityFilterPercentile: val, saturation: val } });
                        }}
                        style={{
                          width: 44,
                          background: '#141a27',
                          border: '1px solid rgba(0, 180, 216, 0.35)',
                          borderRadius: 3,
                          color: '#38bdf8',
                          fontSize: 11,
                          fontWeight: 700,
                          textAlign: 'center',
                          padding: '2px 4px',
                          outline: 'none',
                        }}
                      />
                      <span style={{ fontSize: 10, color: '#64748b' }}>%</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={preferences.heatmap.minLiquidityQty}
                        onChange={(e) => {
                          const val = Math.max(0, parseFloat(e.target.value) || 0);
                          onUpdatePreferences({ heatmap: { ...preferences.heatmap, minLiquidityQty: val } });
                        }}
                        style={{
                          width: 55,
                          background: '#141a27',
                          border: '1px solid rgba(0, 180, 216, 0.35)',
                          borderRadius: 3,
                          color: '#38bdf8',
                          fontSize: 11,
                          fontWeight: 700,
                          textAlign: 'right',
                          padding: '2px 4px',
                          outline: 'none',
                        }}
                      />
                      <span style={{ fontSize: 9.5, color: '#64748b' }}>{baseAsset}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdatePreferences({ heatmap: { ...preferences.heatmap, liquidityFilterPercentile: 0, saturation: 0, minLiquidityQty: 0 } });
                    }}
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: 3,
                      color: '#94a3b8',
                      fontSize: 10,
                      fontWeight: 600,
                      padding: '2px 6px',
                      cursor: 'pointer',
                    }}
                  >
                    Auto
                  </button>
                </div>
              </div>

              <div
                className="terminal-menu-item"
                onClick={() => onUpdatePreferences({ heatmap: { ...preferences.heatmap, removeTradedLiquidity: !preferences.heatmap.removeTradedLiquidity } })}
              >
                <span>Active Only (Clear Traded)</span>
                <Switch
                  checked={preferences.heatmap.removeTradedLiquidity}
                  onChange={(c) => onUpdatePreferences({ heatmap: { ...preferences.heatmap, removeTradedLiquidity: c } })}
                />
              </div>

              <div className="terminal-menu-divider" />
              <div className="terminal-menu-header">Color Palette</div>

              <div style={{ padding: '4px 12px 6px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div
                    style={{
                      height: 12,
                      flex: 1,
                      borderRadius: 2,
                      background: colorMapEngine.generateCssGradient(),
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                    }}
                  />
                  <select
                    value={preferences.heatmap.colorScale}
                    onChange={(e) => {
                      const scale = e.target.value as ColorScaleType;
                      const updated = { ...preferences.heatmap, colorScale: scale };
                      colorMapEngine.rebuildLut(scale, updated.colorSaturation ?? 1.0, updated.brightness, updated.opacity);
                      onUpdatePreferences({ heatmap: updated });
                    }}
                    style={{
                      background: '#141a27',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: 3,
                      color: '#38bdf8',
                      fontSize: 10.5,
                      fontWeight: 600,
                      padding: '2px 4px',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="bookmap">Bookmap</option>
                    <option value="fire">Thermal Fire</option>
                    <option value="grayscale">Grayscale</option>
                  </select>
                </div>
              </div>

              <div className="terminal-menu-divider" />
              <div className="terminal-menu-header">Order Book Ladder (COB)</div>

              <div
                className="terminal-menu-item"
                onClick={() => {
                  const next = !preferences.showDepthProfile;
                  onUpdatePreferences({
                    showDepthProfile: next,
                    depthProfile: { ...preferences.depthProfile, enabled: next },
                  });
                }}
              >
                <span>Show Ladder</span>
                <Switch checked={preferences.showDepthProfile} onChange={(c) => onUpdatePreferences({ showDepthProfile: c, depthProfile: { ...preferences.depthProfile, enabled: c } })} />
              </div>

              {onOpenDepthProfileSettings && (
                <div
                  className="terminal-menu-item action-btn"
                  onClick={() => {
                    setOpenMenu(null);
                    onOpenDepthProfileSettings();
                  }}
                >
                  <span>Ladder Settings...</span>
                  <Sliders size={12} />
                </div>
              )}

              <div className="terminal-menu-divider" />
              <div
                className="terminal-menu-item action-btn"
                onClick={() => {
                  setOpenMenu(null);
                  onOpenHeatmapSettings?.();
                }}
              >
                <span>Advanced Heatmap Settings...</span>
                <Sliders size={12} />
              </div>
            </div>
          )}
        </div>

        {/* --- ORDER FLOW DROPDOWN --- */}
        <div style={{ position: 'relative' }}>
          <button
            className={`terminal-dropdown-btn ${preferences.showFootprint ? 'active' : ''} ${openMenu === 'orderFlow' ? 'open' : ''}`}
            onClick={() => toggleMenu('orderFlow')}
            title="Footprint Order Flow, Ticks, Imbalances & Delta"
          >
            <Layers size={13} />
            <span>Order Flow</span>
            <ChevronDown size={11} style={{ opacity: 0.6 }} />
          </button>

          {openMenu === 'orderFlow' && (
            <div className="terminal-dropdown-menu" style={{ width: 260 }}>
              <div className="terminal-menu-header">Footprint Master</div>
              <div
                className="terminal-menu-item"
                onClick={() => {
                  const next = !preferences.showFootprint;
                  onUpdatePreferences({
                    showFootprint: next,
                    footprint: { ...preferences.footprint, enabled: next },
                  });
                }}
              >
                <span style={{ fontWeight: 600, color: '#f8fafc' }}>Enable Footprint</span>
                <Switch checked={preferences.showFootprint} onChange={(c) => onUpdatePreferences({ showFootprint: c, footprint: { ...preferences.footprint, enabled: c } })} />
              </div>

              <div className="terminal-menu-divider" />
              <div className="terminal-menu-header">Price Aggregation (Ticks)</div>

              <div style={{ padding: '4px 12px 6px 12px', display: 'flex', gap: 4 }}>
                {[1, 2, 3, 5, 10].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdatePreferences({ footprint: { ...preferences.footprint, tickMultiplier: t } });
                    }}
                    style={{
                      flex: 1,
                      height: 22,
                      border: 'none',
                      borderRadius: 3,
                      background: (preferences.footprint?.tickMultiplier || 1) === t ? 'rgba(0, 180, 216, 0.35)' : '#141a27',
                      color: (preferences.footprint?.tickMultiplier || 1) === t ? '#38bdf8' : '#94a3b8',
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {t}x
                  </button>
                ))}
              </div>

              <div className="terminal-menu-divider" />
              <div className="terminal-menu-header">Order Flow Signals</div>

              <div
                className="terminal-menu-item"
                onClick={() => onUpdatePreferences({ footprint: { ...preferences.footprint, showImbalances: !preferences.footprint.showImbalances } })}
              >
                <span>Bid/Ask Imbalances</span>
                <Switch checked={preferences.footprint.showImbalances} onChange={(c) => onUpdatePreferences({ footprint: { ...preferences.footprint, showImbalances: c } })} />
              </div>

              <div
                className="terminal-menu-item"
                onClick={() => onUpdatePreferences({ footprint: { ...preferences.footprint, showStackedImbalances: !preferences.footprint.showStackedImbalances } })}
              >
                <span>Stacked Imbalances</span>
                <Switch checked={preferences.footprint.showStackedImbalances} onChange={(c) => onUpdatePreferences({ footprint: { ...preferences.footprint, showStackedImbalances: c } })} />
              </div>

              <div
                className="terminal-menu-item"
                onClick={() => onUpdatePreferences({ footprint: { ...preferences.footprint, showPocHighlight: !preferences.footprint.showPocHighlight } })}
              >
                <span>POC Level Highlight</span>
                <Switch checked={preferences.footprint.showPocHighlight} onChange={(c) => onUpdatePreferences({ footprint: { ...preferences.footprint, showPocHighlight: c } })} />
              </div>

              <div
                className="terminal-menu-item"
                onClick={() => onUpdatePreferences({ footprint: { ...preferences.footprint, showCandleDelta: !preferences.footprint.showCandleDelta } })}
              >
                <span>Candle Delta Summary</span>
                <Switch checked={preferences.footprint.showCandleDelta} onChange={(c) => onUpdatePreferences({ footprint: { ...preferences.footprint, showCandleDelta: c } })} />
              </div>

              <div className="terminal-menu-divider" />
              <div className="terminal-menu-header">Panels & Profiles</div>

              <div
                className="terminal-menu-item"
                onClick={() => onUpdatePreferences({ footprint: { ...preferences.footprint, showBottomPanel: !preferences.footprint.showBottomPanel } })}
              >
                <span>Bottom Volume & Delta Panel</span>
                <Switch checked={preferences.footprint.showBottomPanel} onChange={(c) => onUpdatePreferences({ footprint: { ...preferences.footprint, showBottomPanel: c } })} />
              </div>

              <div
                className="terminal-menu-item"
                onClick={() => onUpdatePreferences({ footprint: { ...preferences.footprint, showSideProfile: !preferences.footprint.showSideProfile } })}
              >
                <span>Side Volume Profile (VR POC)</span>
                <Switch checked={preferences.footprint.showSideProfile} onChange={(c) => onUpdatePreferences({ footprint: { ...preferences.footprint, showSideProfile: c } })} />
              </div>

              <div
                className="terminal-menu-item"
                onClick={() => onUpdatePreferences({ footprint: { ...preferences.footprint, showDebugInspection: !preferences.footprint.showDebugInspection } })}
              >
                <span>Debug Inspection Mode</span>
                <Switch checked={preferences.footprint.showDebugInspection || false} onChange={(c) => onUpdatePreferences({ footprint: { ...preferences.footprint, showDebugInspection: c } })} />
              </div>

              <div className="terminal-menu-divider" />
              <div className="terminal-menu-header">Trade Bubbles</div>

              <div
                className="terminal-menu-item"
                onClick={() => {
                  const next = !preferences.showBubbles;
                  onUpdatePreferences({
                    showBubbles: next,
                    bubbles: { ...preferences.bubbles, enabled: next },
                  });
                }}
              >
                <span>Show Trade Bubbles</span>
                <Switch
                  checked={preferences.showBubbles}
                  onChange={(c) =>
                    onUpdatePreferences({
                      showBubbles: c,
                      bubbles: { ...preferences.bubbles, enabled: c },
                    })
                  }
                />
              </div>

              <div style={{ padding: '3px 12px 6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>Min Trade Size:</span>
                <select
                  value={
                    [0, 1000, 10000, 50000, 250000, 500000, 1000000, 5000000].includes(preferences.bubbles.minTradeNotional)
                      ? preferences.bubbles.minTradeNotional
                      : 'custom'
                  }
                  onChange={(e) => {
                    if (e.target.value === 'custom') {
                      setOpenMenu(null);
                      onOpenBubbleSettings?.();
                    } else {
                      onUpdatePreferences({ bubbles: { ...preferences.bubbles, minTradeNotional: parseFloat(e.target.value) } });
                    }
                  }}
                  style={{
                    background: '#141a27',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 3,
                    color: '#38bdf8',
                    fontSize: 10.5,
                    fontWeight: 700,
                    padding: '2px 4px',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value={0}>All ($0)</option>
                  <option value={1000}>&gt; $1K</option>
                  <option value={10000}>&gt; $10K</option>
                  <option value={50000}>&gt; $50K</option>
                  <option value={250000}>&gt; $250K</option>
                  <option value={500000}>&gt; $500K</option>
                  <option value={1000000}>&gt; $1M</option>
                  <option value={5000000}>&gt; $5M</option>
                  <option value="custom">Custom...</option>
                </select>
              </div>

              {onOpenBubbleSettings && (
                <div
                  className="terminal-menu-item action-btn"
                  onClick={() => {
                    setOpenMenu(null);
                    onOpenBubbleSettings();
                  }}
                >
                  <span>Trade Bubble Settings...</span>
                  <Sliders size={12} />
                </div>
              )}

              <div className="terminal-menu-divider" />
              {onOpenFootprintSettings && (
                <div
                  className="terminal-menu-item action-btn"
                  onClick={() => {
                    setOpenMenu(null);
                    onOpenFootprintSettings();
                  }}
                >
                  <span>Advanced Footprint Settings...</span>
                  <Sliders size={12} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* --- VIEW & PANELS DROPDOWN --- */}
        <div style={{ position: 'relative' }}>
          <button
            className={`terminal-dropdown-btn ${openMenu === 'view' ? 'open' : ''}`}
            onClick={() => toggleMenu('view')}
            title="Panels, Zoom, Fullscreen & Diagnostics"
          >
            <BarChart3 size={13} />
            <span>View</span>
            <ChevronDown size={11} style={{ opacity: 0.6 }} />
          </button>

          {openMenu === 'view' && (
            <div className="terminal-dropdown-menu" style={{ width: 230 }}>
              <div className="terminal-menu-header">Panels Visibility</div>

              <div
                className="terminal-menu-item"
                onClick={() => onUpdatePreferences({ footprint: { ...preferences.footprint, showBottomPanel: !preferences.footprint.showBottomPanel } })}
              >
                <span>Bottom Delta Panel</span>
                <Switch checked={preferences.footprint.showBottomPanel} onChange={(c) => onUpdatePreferences({ footprint: { ...preferences.footprint, showBottomPanel: c } })} />
              </div>

              <div
                className="terminal-menu-item"
                onClick={() => onUpdatePreferences({ footprint: { ...preferences.footprint, showSideProfile: !preferences.footprint.showSideProfile } })}
              >
                <span>Side Volume Profile</span>
                <Switch checked={preferences.footprint.showSideProfile} onChange={(c) => onUpdatePreferences({ footprint: { ...preferences.footprint, showSideProfile: c } })} />
              </div>

              <div
                className="terminal-menu-item"
                onClick={() => {
                  const next = !preferences.showDepthProfile;
                  onUpdatePreferences({ showDepthProfile: next, depthProfile: { ...preferences.depthProfile, enabled: next } });
                }}
              >
                <span>Order Book (COB) Ladder</span>
                <Switch checked={preferences.showDepthProfile} onChange={(c) => onUpdatePreferences({ showDepthProfile: c, depthProfile: { ...preferences.depthProfile, enabled: c } })} />
              </div>

              <div className="terminal-menu-divider" />
              <div className="terminal-menu-header">Navigation & Display</div>

              <div
                className="terminal-menu-item"
                onClick={() => {
                  onJumpToLatest();
                  onUpdatePreferences({ autoScrollToLatest: !preferences.autoScrollToLatest });
                }}
              >
                <span>Auto-Follow Price</span>
                <Switch checked={preferences.autoScrollToLatest} onChange={(c) => onUpdatePreferences({ autoScrollToLatest: c })} />
              </div>

              <div
                className="terminal-menu-item"
                onClick={() => {
                  setOpenMenu(null);
                  onResetView();
                }}
              >
                <span>Reset Chart View</span>
                <RotateCcw size={12} style={{ opacity: 0.7 }} />
              </div>

              <div
                className="terminal-menu-item"
                onClick={() => {
                  setOpenMenu(null);
                  onToggleFullscreen();
                }}
              >
                <span>Fullscreen</span>
                {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
              </div>

              <div className="terminal-menu-divider" />
              <div className="terminal-menu-header">Diagnostics & System</div>

              <div
                className="terminal-menu-item"
                onClick={() => {
                  setOpenMenu(null);
                  onOpenDiagnostics();
                }}
              >
                <span>Order Book Diagnostics</span>
                <Activity size={12} style={{ opacity: 0.7 }} />
              </div>

              <div
                className="terminal-menu-item"
                onClick={() => {
                  setOpenMenu(null);
                  onOpenCacheModal();
                }}
              >
                <span>Historical Cache & Storage</span>
                <Database size={12} style={{ opacity: 0.7 }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 18, background: 'rgba(255, 255, 255, 0.08)', margin: '0 2px' }} />

      {/* ============================================================ */}
      {/* 3. CENTER-RIGHT QUICK 1-CLICK ACTION TOGGLES                */}
      {/* ============================================================ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        {/* Quick Toggles: Candles | Heatmap | Footprint | COB | Bubbles */}
        <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.03)', borderRadius: 4, padding: 1.5, gap: 1 }}>
          <button
            className={`tool-btn ${preferences.showCandles ? 'active' : ''}`}
            onClick={() => onUpdatePreferences({ showCandles: !preferences.showCandles })}
            title="Toggle Candles"
            style={{ height: 24, padding: '0 6px', fontSize: 11 }}
          >
            Candles
          </button>
          {/* Heatmap Tool with inline Settings Button */}
          <div style={{ display: 'inline-flex', alignItems: 'center' }}>
            <button
              className={`tool-btn ${preferences.showHeatmap ? 'active' : ''}`}
              onClick={() => onUpdatePreferences({ showHeatmap: !preferences.showHeatmap })}
              title="Toggle Heatmap"
              style={{
                height: 24,
                padding: '0 6px',
                fontSize: 11,
                borderTopRightRadius: onOpenHeatmapSettings ? 0 : 3,
                borderBottomRightRadius: onOpenHeatmapSettings ? 0 : 3,
              }}
            >
              Heatmap
            </button>
            {onOpenHeatmapSettings && (
              <button
                className={`tool-btn ${preferences.showHeatmap ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenHeatmapSettings();
                }}
                title="Heatmap Settings"
                style={{
                  height: 24,
                  padding: '0 4px',
                  borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
                  borderTopLeftRadius: 0,
                  borderBottomLeftRadius: 0,
                }}
              >
                <Sliders size={10} />
              </button>
            )}
          </div>

          {/* Footprint Tool with inline Settings Button */}
          <div style={{ display: 'inline-flex', alignItems: 'center' }}>
            <button
              className={`tool-btn ${preferences.showFootprint ? 'active' : ''}`}
              onClick={() => {
                const next = !preferences.showFootprint;
                onUpdatePreferences({
                  showFootprint: next,
                  footprint: { ...preferences.footprint, enabled: next },
                });
              }}
              title="Toggle Footprint"
              style={{
                height: 24,
                padding: '0 6px',
                fontSize: 11,
                borderTopRightRadius: onOpenFootprintSettings ? 0 : 3,
                borderBottomRightRadius: onOpenFootprintSettings ? 0 : 3,
              }}
            >
              Footprint
            </button>
            {onOpenFootprintSettings && (
              <button
                className={`tool-btn ${preferences.showFootprint ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenFootprintSettings();
                }}
                title="Footprint Settings"
                style={{
                  height: 24,
                  padding: '0 4px',
                  borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
                  borderTopLeftRadius: 0,
                  borderBottomLeftRadius: 0,
                }}
              >
                <Sliders size={10} />
              </button>
            )}
          </div>
          {/* COB Tool with inline Settings Button */}
          <div style={{ display: 'inline-flex', alignItems: 'center' }}>
            <button
              className={`tool-btn ${preferences.showDepthProfile ? 'active' : ''}`}
              onClick={() => {
                const next = !preferences.showDepthProfile;
                onUpdatePreferences({
                  showDepthProfile: next,
                  depthProfile: { ...preferences.depthProfile, enabled: next },
                });
              }}
              title="Toggle Order Book (COB) Ladder"
              style={{
                height: 24,
                padding: '0 6px',
                fontSize: 11,
                borderTopRightRadius: onOpenDepthProfileSettings ? 0 : 3,
                borderBottomRightRadius: onOpenDepthProfileSettings ? 0 : 3,
              }}
            >
              COB
            </button>
            {onOpenDepthProfileSettings && (
              <button
                className={`tool-btn ${preferences.showDepthProfile ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenDepthProfileSettings();
                }}
                title="Order Book (COB) Settings"
                style={{
                  height: 24,
                  padding: '0 4px',
                  borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
                  borderTopLeftRadius: 0,
                  borderBottomLeftRadius: 0,
                }}
              >
                <Sliders size={10} />
              </button>
            )}
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center' }}>
            <button
              className={`tool-btn ${preferences.showBubbles ? 'active' : ''}`}
              onClick={() => {
                const next = !preferences.showBubbles;
                onUpdatePreferences({
                  showBubbles: next,
                  bubbles: { ...preferences.bubbles, enabled: next },
                });
              }}
              title="Toggle Trade Bubbles"
              style={{
                height: 24,
                padding: '0 6px',
                fontSize: 11,
                borderTopRightRadius: onOpenBubbleSettings ? 0 : 3,
                borderBottomRightRadius: onOpenBubbleSettings ? 0 : 3,
              }}
            >
              Bubbles
            </button>
            {onOpenBubbleSettings && (
              <button
                className={`tool-btn ${preferences.showBubbles ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenBubbleSettings();
                }}
                title="Trade Bubble Settings"
                style={{
                  height: 24,
                  padding: '0 4px',
                  borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
                  borderTopLeftRadius: 0,
                  borderBottomLeftRadius: 0,
                }}
              >
                <Sliders size={10} />
              </button>
            )}
          </div>
        </div>

        {/* Quick Zoom, Reset, Follow & Fullscreen Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255, 255, 255, 0.03)', borderRadius: 4, padding: 1.5, gap: 1 }}>
          <button className="tool-btn" title="Zoom In" onClick={onZoomIn} style={{ height: 24, width: 24, padding: 0 }}>
            <ZoomIn size={12} />
          </button>
          <button className="tool-btn" title="Zoom Out" onClick={onZoomOut} style={{ height: 24, width: 24, padding: 0 }}>
            <ZoomOut size={12} />
          </button>
          <button className="tool-btn" title="Reset View" onClick={onResetView} style={{ height: 24, width: 24, padding: 0 }}>
            <RotateCcw size={12} />
          </button>
          <button
            className={`tool-btn ${preferences.autoScrollToLatest ? 'active' : ''}`}
            title="Auto Follow Latest Price"
            onClick={() => {
              onJumpToLatest();
              onUpdatePreferences({ autoScrollToLatest: !preferences.autoScrollToLatest });
            }}
            style={{ height: 24, width: 24, padding: 0 }}
          >
            <ArrowRightCircle size={12} />
          </button>
          <button className="tool-btn" title="Toggle Fullscreen" onClick={onToggleFullscreen} style={{ height: 24, width: 24, padding: 0 }}>
            {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 4. STATUS & CLOCK GROUP: IST Clock, Exchange Latency & Power */}
      {/* ============================================================ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 'auto' }}>
        {/* Indian Standard Time (Asia/Kolkata) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 6px',
            borderRadius: 4,
            background: 'rgba(255, 153, 51, 0.08)',
            border: '1px solid rgba(255, 153, 51, 0.25)',
            fontSize: 10,
            fontWeight: 700,
            color: '#ff9933',
            fontFamily: 'JetBrains Mono, monospace',
            whiteSpace: 'nowrap',
          }}
          title="Terminal Time: Asia/Kolkata (IST, UTC+5:30)"
        >
          <span style={{ fontSize: 10 }}>🇮🇳</span>
          <span>{kolkataTime || '--:--:--'}</span>
          <span style={{ fontSize: 8.5, color: '#f59e0b', fontWeight: 600 }}>IST</span>
        </div>

        {/* Live Status Pill with Latency */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '2px 7px',
            borderRadius: 4,
            background: badge.bg,
            border: `1px solid ${badge.border}`,
            fontSize: 10,
            fontWeight: 600,
            color: badge.color,
            fontFamily: 'JetBrains Mono, monospace',
            whiteSpace: 'nowrap',
          }}
          title={`Sequence gaps: ${latencyMetrics.sequenceGapsDetected} | Resyncs: ${latencyMetrics.resyncCount} | Msg/s: ${latencyMetrics.messageRatePerSec}`}
        >
          <div
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              backgroundColor: badge.color,
              boxShadow: `0 0 5px ${badge.color}`,
            }}
          />
          <span>{badge.label}</span>
          <span style={{ color: '#94a3b8', fontWeight: 400 }}>
            {latencyMetrics.orderBookAgeMs > 0 ? `${latencyMetrics.orderBookAgeMs}ms` : '--'}
          </span>
        </div>

        {/* Dedicated Single Power Button */}
        {onLockTerminal && (
          <button
            className="tool-btn"
            title="Power Off / Log Out (Requires Passcode Loveu3000)"
            onClick={onLockTerminal}
            style={{
              height: 24,
              width: 24,
              padding: 0,
              color: '#ff2d55',
              background: 'rgba(255, 45, 85, 0.12)',
              border: '1px solid rgba(255, 45, 85, 0.4)',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 0 8px rgba(255, 45, 85, 0.25)',
              flexShrink: 0,
              marginLeft: 2,
            }}
          >
            <Power size={12} />
          </button>
        )}
      </div>
    </header>
  );
};
