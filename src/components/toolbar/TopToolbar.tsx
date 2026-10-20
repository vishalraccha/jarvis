/**
 * Professional Trading Terminal Top Toolbar
 * JARVIS HEATMAP TERMINAL - RESPONSIVE MODULAR UI
 * Each tool has a dedicated compact dropdown, small exchange/symbol buttons, and zero-overlap layout.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Flame,
  CandlestickChart,
  CircleDot,
  BarChart3,
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
  Power,
  Check,
} from 'lucide-react';
import { CandleTimeframe, ConnectionState, ExchangeId, LatencyMetrics } from '../../types/market';
import { TerminalPreferences } from '../../types/settings';
import { ChartMode } from '../../types/footprint';
import { ColorMapEngine } from '../../services/heatmap/ColorMap';
import { ColorScaleType } from '../../types/heatmap';
import { InstrumentRegistry } from '../../services/market/InstrumentRegistry';
import { MarketSessionService } from '../../services/market/MarketSessionService';

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
  onOpenVwapSettings?: () => void;
  onOpenDepthProfileSettings?: () => void;
  onOpenFootprintSettings?: () => void;
  onOpenDiagnostics: () => void;
  onOpenCacheModal: () => void;
  onLockTerminal?: () => void;
}

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

type MenuType =
  | 'exchange'
  | 'symbol'
  | 'timeframe'
  | 'candles'
  | 'heatmap'
  | 'footprint'
  | 'cob'
  | 'bubbles'
  | 'vwap'
  | 'view';

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
  onOpenVwapSettings,
  onOpenDepthProfileSettings,
  onOpenFootprintSettings,
  onOpenDiagnostics,
  onOpenCacheModal,
  onLockTerminal,
}) => {
  const [openMenu, setOpenMenu] = useState<MenuType | null>(null);
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
  const [kolkataTimeHhMm, setKolkataTimeHhMm] = useState<string>('');
  const [kolkataTimeSeconds, setKolkataTimeSeconds] = useState<string>('');
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      const parts = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).formatToParts(d);

      const h = parts.find((p) => p.type === 'hour')?.value || '00';
      const m = parts.find((p) => p.type === 'minute')?.value || '00';
      const s = parts.find((p) => p.type === 'second')?.value || '00';

      setKolkataTimeHhMm(`${h}:${m}`);
      setKolkataTimeSeconds(`:${s}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const currentInst = InstrumentRegistry.getInstrument(preferences.symbol, preferences.exchange);
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
          label: 'CONN',
          bg: 'rgba(255, 179, 0, 0.12)',
          color: '#ffb300',
          border: 'rgba(255, 179, 0, 0.35)',
          title: 'Connecting to exchange',
        };
      case 'RESYNCING':
        return {
          label: 'SYNC',
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

  const toggleMenu = (menu: MenuType) => {
    setOpenMenu((prev) => (prev === menu ? null : menu));
  };

  const getCompactSymbolLabel = (symbol: string): string => {
    if (symbol === 'XAUUSD') return 'XAU/USD (OANDA)';
    if (symbol === 'XAUUSD_VANTAGE') return 'XAU/USD (Vantage)';
    if (symbol === 'GC') return 'GC Gold';
    return symbol.replace('USDT', '/USDT');
  };

  const handleSelectSymbol = (selected: string, targetExchange: ExchangeId) => {
    setOpenMenu(null);
    let sym = selected;
    let ex = targetExchange;

    if (selected === 'GC') {
      sym = 'GC';
      ex = 'comex';
    } else if (selected === 'XAUUSD' || selected === 'XAUUSD_VANTAGE') {
      sym = selected;
      ex = 'binance';
    }

    const inst = InstrumentRegistry.getInstrument(sym, ex);
    const patch: Partial<TerminalPreferences> = {
      symbol: inst.symbol,
      exchange: ex,
    };
    if (!inst.supportedIntervals.includes(preferences.timeframe)) {
      patch.timeframe = inst.defaultTimeframe;
    }
    onUpdatePreferences(patch);
  };

  return (
    <header
      ref={toolbarRef}
      className="terminal-top-toolbar"
      style={{
        height: '42px',
        background: '#0c1017',
        borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px 0 10px',
        userSelect: 'none',
        gap: 6,
        position: 'relative',
        zIndex: 100,
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* ============================================================ */}
      {/* 1. MARKET GROUP: Logo, Exchange, Symbol, Timeframe            */}
      {/* ============================================================ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
        {/* Terminal Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginRight: 2 }}>
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
              flexShrink: 0,
            }}
          >
            J
          </div>
          <span className="terminal-brand-text" style={{ fontWeight: 800, fontSize: 12.5, letterSpacing: '0.08em', color: '#f8fafc' }}>
            J.A.R.V.I.S
          </span>
        </div>

        {/* Small Exchange Selector Dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            className={`terminal-dropdown-btn ${openMenu === 'exchange' ? 'open' : ''}`}
            onClick={() => toggleMenu('exchange')}
            style={{
              height: 26,
              padding: '0 7px',
              fontSize: 11,
              fontWeight: 700,
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.45)',
              color: '#fbbf24',
              gap: 4,
              maxWidth: 105,
            }}
            title="Trading Venue / Data Feed"
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {preferences.exchange === 'comex' ? 'COMEX GC' : 'Spot Gold'}
            </span>
            <ChevronDown size={10} style={{ opacity: 0.7, flexShrink: 0 }} />
          </button>

          {openMenu === 'exchange' && (
            <div className="terminal-dropdown-menu" style={{ width: 280, left: 0 }}>
              <div className="terminal-menu-header">Trading Venue / Data Feed</div>
              <div
                className="terminal-menu-item"
                style={{
                  background: preferences.exchange === 'binance' ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
                  color: preferences.exchange === 'binance' ? '#fcd34d' : '#cbd5e1',
                  padding: '7px 12px',
                }}
                onClick={() => {
                  setOpenMenu(null);
                  const newExchange: ExchangeId = 'binance';
                  const newSymbol = 'XAUUSD';
                  const inst = InstrumentRegistry.getInstrument(newSymbol, newExchange);
                  const patch: Partial<TerminalPreferences> = {
                    exchange: newExchange,
                    symbol: inst.symbol,
                  };
                  if (!inst.supportedIntervals.includes(preferences.timeframe)) {
                    patch.timeframe = inst.defaultTimeframe;
                  }
                  onUpdatePreferences(patch);
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 700 }}>Spot Gold</span>
                    <span style={{ fontSize: 9.5, padding: '1px 5px', borderRadius: 3, background: 'rgba(0, 230, 118, 0.15)', color: '#00e676', fontWeight: 700 }}>OANDA & VANTAGE</span>
                  </div>
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>Real-time L1 gold price with tick volume</span>
                </div>
                {preferences.exchange === 'binance' && <Check size={13} style={{ color: '#fbbf24', flexShrink: 0 }} />}
              </div>

              <div
                className="terminal-menu-item"
                style={{
                  background: preferences.exchange === 'comex' ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
                  color: preferences.exchange === 'comex' ? '#fcd34d' : '#cbd5e1',
                  padding: '7px 12px',
                }}
                onClick={() => {
                  setOpenMenu(null);
                  const newExchange: ExchangeId = 'comex';
                  const newSymbol = 'GC';
                  const inst = InstrumentRegistry.getInstrument(newSymbol, newExchange);
                  const patch: Partial<TerminalPreferences> = {
                    exchange: newExchange,
                    symbol: inst.symbol,
                  };
                  if (!inst.supportedIntervals.includes(preferences.timeframe)) {
                    patch.timeframe = inst.defaultTimeframe;
                  }
                  onUpdatePreferences(patch);
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 700 }}>COMEX GC</span>
                    <span style={{ fontSize: 9.5, padding: '1px 5px', borderRadius: 3, background: 'rgba(245, 158, 11, 0.18)', color: '#fbbf24', fontWeight: 700 }}>CME GLOBEX</span>
                  </div>
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>Official COMEX active futures contract</span>
                </div>
                {preferences.exchange === 'comex' && <Check size={13} style={{ color: '#fbbf24', flexShrink: 0 }} />}
              </div>
            </div>
          )}
        </div>

        {/* Small Symbol / Pair Selector Dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            className={`terminal-dropdown-btn ${openMenu === 'symbol' ? 'open' : ''}`}
            onClick={() => toggleMenu('symbol')}
            style={{
              height: 26,
              padding: '0 8px',
              fontSize: 11,
              fontWeight: 700,
              background: 'rgba(234, 179, 8, 0.08)',
              border: '1px solid rgba(234, 179, 8, 0.35)',
              color: '#facc15',
              gap: 4,
              maxWidth: 135,
            }}
            title="Active Trading Instrument"
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {getCompactSymbolLabel(preferences.symbol)}
            </span>
            <ChevronDown size={10} style={{ opacity: 0.7, flexShrink: 0 }} />
          </button>

          {openMenu === 'symbol' && (
            <div className="terminal-dropdown-menu" style={{ width: 290, left: 0 }}>
              <div className="terminal-menu-header">🥇 Gold Benchmark Instruments</div>

              <div
                className="terminal-menu-item"
                style={{
                  background: preferences.symbol === 'XAUUSD' ? 'rgba(234, 179, 8, 0.12)' : 'transparent',
                  color: preferences.symbol === 'XAUUSD' ? '#fde047' : '#cbd5e1',
                  padding: '6px 12px',
                }}
                onClick={() => handleSelectSymbol('XAUUSD', 'binance')}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 700 }}>XAU/USD • OANDA</span>
                    <span style={{ fontSize: 9, padding: '0 4px', borderRadius: 3, background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>Spot Gold</span>
                  </div>
                  <span style={{ fontSize: 9.5, color: '#94a3b8' }}>TradingView OANDA Benchmark</span>
                </div>
                {preferences.symbol === 'XAUUSD' && <Check size={13} style={{ color: '#facc15' }} />}
              </div>

              <div
                className="terminal-menu-item"
                style={{
                  background: preferences.symbol === 'XAUUSD_VANTAGE' ? 'rgba(234, 179, 8, 0.12)' : 'transparent',
                  color: preferences.symbol === 'XAUUSD_VANTAGE' ? '#fde047' : '#cbd5e1',
                  padding: '6px 12px',
                }}
                onClick={() => handleSelectSymbol('XAUUSD_VANTAGE', 'binance')}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 700 }}>XAU/USD • Vantage</span>
                    <span style={{ fontSize: 9, padding: '0 4px', borderRadius: 3, background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>Spot Gold</span>
                  </div>
                  <span style={{ fontSize: 9.5, color: '#94a3b8' }}>TradingView Vantage Benchmark</span>
                </div>
                {preferences.symbol === 'XAUUSD_VANTAGE' && <Check size={13} style={{ color: '#facc15' }} />}
              </div>

              <div
                className="terminal-menu-item"
                style={{
                  background: preferences.symbol === 'GC' ? 'rgba(234, 179, 8, 0.12)' : 'transparent',
                  color: preferences.symbol === 'GC' ? '#fde047' : '#cbd5e1',
                  padding: '6px 12px',
                }}
                onClick={() => handleSelectSymbol('GC', 'comex')}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 700 }}>GC • COMEX Futures</span>
                    <span style={{ fontSize: 9, padding: '0 4px', borderRadius: 3, background: 'rgba(245, 158, 11, 0.18)', color: '#fbbf24' }}>CME Globex</span>
                  </div>
                  <span style={{ fontSize: 9.5, color: '#94a3b8' }}>Official COMEX Gold Futures</span>
                </div>
                {preferences.symbol === 'GC' && <Check size={13} style={{ color: '#facc15' }} />}
              </div>

              <div className="terminal-menu-divider" />
              <div className="terminal-menu-header">⚡ Crypto Spot</div>

              {['BTCUSDT', 'ETHUSDT', 'SOLUSDT'].map((sym) => {
                const isSel = preferences.symbol === sym;
                return (
                  <div
                    key={sym}
                    className="terminal-menu-item"
                    style={{
                      background: isSel ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                      color: isSel ? '#38bdf8' : '#cbd5e1',
                      padding: '6px 12px',
                    }}
                    onClick={() => handleSelectSymbol(sym, 'binance')}
                  >
                    <span style={{ fontWeight: isSel ? 700 : 500 }}>{sym.replace('USDT', '/USDT Spot')}</span>
                    {isSel && <Check size={13} style={{ color: '#38bdf8' }} />}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Timeframe Selector Pills (Desktop) */}
        <div className="timeframe-pills" style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: 4, padding: 1.5, gap: 1 }}>
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
                    ? `${currentInst.provider} supports ${currentInst.supportedIntervals.join(', ')}`
                    : `Switch timeframe to ${tf}`
                }
              >
                {tf}
              </button>
            );
          })}
        </div>

        {/* Compact Timeframe Dropdown (Mobile / Tablet) */}
        <div className="timeframe-dropdown" style={{ position: 'relative' }}>
          <button
            className="terminal-dropdown-btn"
            onClick={() => toggleMenu('timeframe')}
            style={{ height: 26, padding: '0 6px', fontSize: 11, fontWeight: 700, color: '#38bdf8', gap: 3 }}
          >
            <span>{preferences.timeframe}</span>
            <ChevronDown size={10} style={{ opacity: 0.7 }} />
          </button>
          {openMenu === 'timeframe' && (
            <div className="terminal-dropdown-menu" style={{ width: 110, minWidth: 90 }}>
              <div className="terminal-menu-header">Timeframe</div>
              {SUPPORTED_TIMEFRAMES.map((tf) => {
                const isSupported = currentInst.supportedIntervals.includes(tf);
                return (
                  <div
                    key={tf}
                    className="terminal-menu-item"
                    style={{
                      fontWeight: preferences.timeframe === tf ? 700 : 500,
                      color: preferences.timeframe === tf ? '#38bdf8' : isSupported ? '#cbd5e1' : '#475569',
                      cursor: isSupported ? 'pointer' : 'not-allowed',
                      opacity: isSupported ? 1 : 0.4,
                      padding: '4px 10px',
                    }}
                    onClick={() => {
                      if (isSupported) {
                        setOpenMenu(null);
                        onUpdatePreferences({ timeframe: tf });
                      }
                    }}
                  >
                    <span>{tf}</span>
                    {preferences.timeframe === tf && <Check size={12} style={{ color: '#38bdf8' }} />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Subtle Vertical Divider */}
      <div style={{ width: 1, height: 18, background: 'rgba(255, 255, 255, 0.08)', margin: '0 2px', flexShrink: 0 }} />

      {/* ============================================================ */}
      {/* 2. DEDICATED TOOL DROPDOWNS: Candles, Heatmap, COB, Footprint, Bubbles, VWAP, View */}
      {/* ============================================================ */}
      <div className="toolbar-tools-group">
        {/* --- TOOL 1: CANDLES DROPDOWN --- */}
        <div style={{ position: 'relative' }}>
          <button
            className={`terminal-dropdown-btn ${preferences.showCandles ? 'active' : ''} ${openMenu === 'candles' ? 'open' : ''}`}
            onClick={() => toggleMenu('candles')}
            title="Candlestick Chart & Modes"
            style={{ height: 26, padding: '0 7px', fontSize: 11 }}
          >
            <CandlestickChart size={12} />
            <span>Candles</span>
            <ChevronDown size={9} style={{ opacity: 0.6 }} />
          </button>

          {openMenu === 'candles' && (
            <div className="terminal-dropdown-menu" style={{ width: 230 }}>
              <div className="terminal-menu-header">Candlestick Chart</div>
              <div
                className="terminal-menu-item"
                onClick={() => onUpdatePreferences({ showCandles: !preferences.showCandles })}
              >
                <span style={{ fontWeight: 600 }}>Show Candles</span>
                <Switch checked={preferences.showCandles} onChange={(c) => onUpdatePreferences({ showCandles: c })} />
              </div>

              <div className="terminal-menu-divider" />
              <div className="terminal-menu-header">Primary Mode</div>
              <div style={{ padding: '4px 10px 6px 10px' }}>
                <select
                  value={preferences.chartMode || 'candles'}
                  onChange={(e) => {
                    const mode = e.target.value as ChartMode;
                    if (mode === 'candles') {
                      onUpdatePreferences({ chartMode: mode, showCandles: true, showHeatmap: false, showFootprint: false });
                    } else if (mode === 'heatmap') {
                      onUpdatePreferences({ chartMode: mode, showCandles: true, showHeatmap: true, showFootprint: false });
                    } else if (mode === 'footprint') {
                      onUpdatePreferences({ chartMode: mode, showCandles: true, showHeatmap: false, showFootprint: true, footprint: { ...preferences.footprint, enabled: true } });
                    } else if (mode === 'heatmap_footprint') {
                      onUpdatePreferences({ chartMode: mode, showCandles: true, showHeatmap: true, showFootprint: true, footprint: { ...preferences.footprint, enabled: true } });
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
                    padding: '3px 6px',
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
              <div
                className="terminal-menu-item"
                onClick={() => onUpdatePreferences({ showBestBidAskLines: !preferences.showBestBidAskLines })}
              >
                <span>Best Bid / Ask Ribbon</span>
                <Switch checked={preferences.showBestBidAskLines} onChange={(c) => onUpdatePreferences({ showBestBidAskLines: c })} />
              </div>
              <div
                className="terminal-menu-item action-btn"
                onClick={() => {
                  setOpenMenu(null);
                  onResetView();
                }}
              >
                <span>Reset Chart View</span>
                <RotateCcw size={11} />
              </div>
            </div>
          )}
        </div>

        {/* --- TOOL 2: HEATMAP DROPDOWN --- */}
        <div style={{ position: 'relative' }}>
          <button
            className={`terminal-dropdown-btn ${preferences.showHeatmap ? 'active' : ''} ${openMenu === 'heatmap' ? 'open' : ''}`}
            onClick={() => toggleMenu('heatmap')}
            title="Liquidity Heatmap Settings"
            style={{ height: 26, padding: '0 7px', fontSize: 11 }}
          >
            <Flame size={12} style={{ color: preferences.showHeatmap ? '#38bdf8' : 'inherit' }} />
            <span>Heatmap</span>
            <ChevronDown size={9} style={{ opacity: 0.6 }} />
          </button>

          {openMenu === 'heatmap' && (
            <div className="terminal-dropdown-menu" style={{ width: 250 }}>
              <div className="terminal-menu-header">Liquidity Heatmap</div>
              <div
                className="terminal-menu-item"
                onClick={() => onUpdatePreferences({ showHeatmap: !preferences.showHeatmap })}
              >
                <span style={{ fontWeight: 600 }}>Enable Heatmap</span>
                <Switch checked={preferences.showHeatmap} onChange={(c) => onUpdatePreferences({ showHeatmap: c })} />
              </div>

              <div className="terminal-menu-divider" />
              <div className="terminal-menu-header">Color Palette</div>
              <div style={{ padding: '3px 10px 6px 10px' }}>
                <select
                  value={preferences.heatmap.colorScale}
                  onChange={(e) => {
                    const scale = e.target.value as ColorScaleType;
                    colorMapEngine.rebuildLut(scale);
                    onUpdatePreferences({ heatmap: { ...preferences.heatmap, colorScale: scale } });
                  }}
                  style={{
                    width: '100%',
                    background: '#141a27',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: 4,
                    color: '#f8fafc',
                    fontSize: 11,
                    padding: '3px 6px',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="bookmap">Bookmap Classic</option>
                  <option value="fire">Fire / Thermal</option>
                  <option value="grayscale">Grayscale</option>
                  <option value="custom">Custom Heat</option>
                </select>
              </div>

              <div
                className="terminal-menu-item"
                onClick={() => onUpdatePreferences({ showLiquidityShifts: !preferences.showLiquidityShifts })}
              >
                <span>Liquidity Shifts</span>
                <Switch checked={preferences.showLiquidityShifts} onChange={(c) => onUpdatePreferences({ showLiquidityShifts: c })} />
              </div>

              {onOpenHeatmapSettings && (
                <>
                  <div className="terminal-menu-divider" />
                  <div
                    className="terminal-menu-item action-btn"
                    onClick={() => {
                      setOpenMenu(null);
                      onOpenHeatmapSettings();
                    }}
                  >
                    <span>Heatmap Settings...</span>
                    <Sliders size={11} />
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* --- TOOL 3: COB (ORDER BOOK LADDER) DROPDOWN --- */}
        <div style={{ position: 'relative' }}>
          <button
            className={`terminal-dropdown-btn ${preferences.showDepthProfile ? 'active' : ''} ${openMenu === 'cob' ? 'open' : ''}`}
            onClick={() => toggleMenu('cob')}
            title="Order Book (COB) Ladder"
            style={{ height: 26, padding: '0 7px', fontSize: 11 }}
          >
            <Layers size={12} style={{ color: preferences.showDepthProfile ? '#38bdf8' : 'inherit' }} />
            <span>COB</span>
            <ChevronDown size={9} style={{ opacity: 0.6 }} />
          </button>

          {openMenu === 'cob' && (
            <div className="terminal-dropdown-menu" style={{ width: 230 }}>
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
                <span style={{ fontWeight: 600 }}>Show COB Ladder</span>
                <Switch
                  checked={preferences.showDepthProfile}
                  onChange={(c) =>
                    onUpdatePreferences({
                      showDepthProfile: c,
                      depthProfile: { ...preferences.depthProfile, enabled: c },
                    })
                  }
                />
              </div>

              <div className="terminal-menu-divider" />
              <div className="terminal-menu-header">Depth Levels</div>
              <div style={{ padding: '3px 10px 6px 10px', display: 'flex', gap: 4 }}>
                {[25, 50, 100, 200].map((levels) => (
                  <button
                    key={levels}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdatePreferences({ depthProfile: { ...preferences.depthProfile, maxLevels: levels } });
                    }}
                    style={{
                      flex: 1,
                      padding: '2px 0',
                      border: 'none',
                      background: preferences.depthProfile.maxLevels === levels ? 'rgba(0, 180, 216, 0.35)' : 'rgba(255, 255, 255, 0.04)',
                      color: preferences.depthProfile.maxLevels === levels ? '#38bdf8' : '#94a3b8',
                      borderRadius: 3,
                      fontSize: 10,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {levels}
                  </button>
                ))}
              </div>

              {onOpenDepthProfileSettings && (
                <>
                  <div className="terminal-menu-divider" />
                  <div
                    className="terminal-menu-item action-btn"
                    onClick={() => {
                      setOpenMenu(null);
                      onOpenDepthProfileSettings();
                    }}
                  >
                    <span>COB Settings...</span>
                    <Sliders size={11} />
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* --- TOOL 4: FOOTPRINT DROPDOWN --- */}
        <div style={{ position: 'relative' }}>
          <button
            className={`terminal-dropdown-btn ${preferences.showFootprint ? 'active' : ''} ${openMenu === 'footprint' ? 'open' : ''}`}
            onClick={() => toggleMenu('footprint')}
            title="Footprint Order Flow"
            style={{ height: 26, padding: '0 7px', fontSize: 11 }}
          >
            <BarChart3 size={12} style={{ color: preferences.showFootprint ? '#38bdf8' : 'inherit' }} />
            <span>Footprint</span>
            <ChevronDown size={9} style={{ opacity: 0.6 }} />
          </button>

          {openMenu === 'footprint' && (
            <div className="terminal-dropdown-menu" style={{ width: 250 }}>
              <div className="terminal-menu-header">Footprint Order Flow</div>
              <div
                className="terminal-menu-item"
                onClick={() => {
                  const next = !preferences.showFootprint;
                  onUpdatePreferences({
                    showFootprint: next,
                    footprint: { ...preferences.footprint, enabled: next },
                    showCandles: true,
                    chartMode: next ? 'footprint' : (preferences.showHeatmap ? 'heatmap' : 'candles'),
                  });
                }}
              >
                <span style={{ fontWeight: 600 }}>Enable Footprint</span>
                <Switch
                  checked={preferences.showFootprint}
                  onChange={(c) =>
                    onUpdatePreferences({
                      showFootprint: c,
                      footprint: { ...preferences.footprint, enabled: c },
                      showCandles: true,
                      chartMode: c ? 'footprint' : (preferences.showHeatmap ? 'heatmap' : 'candles'),
                    })
                  }
                />
              </div>

              <div className="terminal-menu-divider" />
              <div className="terminal-menu-header">Tick Multiplier</div>
              <div style={{ padding: '3px 10px 6px 10px', display: 'flex', gap: 4 }}>
                {[1, 2, 4, 8].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdatePreferences({ footprint: { ...preferences.footprint, tickMultiplier: t } });
                    }}
                    style={{
                      flex: 1,
                      padding: '2px 0',
                      border: 'none',
                      background: preferences.footprint.tickMultiplier === t ? 'rgba(0, 180, 216, 0.35)' : 'rgba(255, 255, 255, 0.04)',
                      color: preferences.footprint.tickMultiplier === t ? '#38bdf8' : '#94a3b8',
                      borderRadius: 3,
                      fontSize: 10,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {t}x
                  </button>
                ))}
              </div>

              <div
                className="terminal-menu-item"
                onClick={() => onUpdatePreferences({ footprint: { ...preferences.footprint, showImbalances: !preferences.footprint.showImbalances } })}
              >
                <span>Imbalances Highlights</span>
                <Switch checked={preferences.footprint.showImbalances} onChange={(c) => onUpdatePreferences({ footprint: { ...preferences.footprint, showImbalances: c } })} />
              </div>

              <div
                className="terminal-menu-item"
                onClick={() => onUpdatePreferences({ footprint: { ...preferences.footprint, showSideProfile: !preferences.footprint.showSideProfile } })}
              >
                <span>Side Volume Profile</span>
                <Switch checked={preferences.footprint.showSideProfile} onChange={(c) => onUpdatePreferences({ footprint: { ...preferences.footprint, showSideProfile: c } })} />
              </div>

              {onOpenFootprintSettings && (
                <>
                  <div className="terminal-menu-divider" />
                  <div
                    className="terminal-menu-item action-btn"
                    onClick={() => {
                      setOpenMenu(null);
                      onOpenFootprintSettings();
                    }}
                  >
                    <span>Footprint Settings...</span>
                    <Sliders size={11} />
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* --- TOOL 5: BUBBLES DROPDOWN --- */}
        <div style={{ position: 'relative' }}>
          <button
            className={`terminal-dropdown-btn ${preferences.showBubbles ? 'active' : ''} ${openMenu === 'bubbles' ? 'open' : ''}`}
            onClick={() => toggleMenu('bubbles')}
            title="Trade Volume Bubbles"
            style={{ height: 26, padding: '0 7px', fontSize: 11 }}
          >
            <CircleDot size={12} style={{ color: preferences.showBubbles ? '#38bdf8' : 'inherit' }} />
            <span>Bubbles</span>
            <ChevronDown size={9} style={{ opacity: 0.6 }} />
          </button>

          {openMenu === 'bubbles' && (
            <div className="terminal-dropdown-menu" style={{ width: 240 }}>
              <div className="terminal-menu-header">Trade Volume Bubbles</div>
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
                <span style={{ fontWeight: 600 }}>Show Bubbles</span>
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

              <div className="terminal-menu-divider" />
              <div className="terminal-menu-header">Min Trade Size</div>
              <div style={{ padding: '3px 10px 6px 10px' }}>
                <select
                  value={preferences.bubbles.minTradeNotional}
                  onChange={(e) => onUpdatePreferences({ bubbles: { ...preferences.bubbles, minTradeNotional: Number(e.target.value) } })}
                  style={{
                    width: '100%',
                    background: '#141a27',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: 4,
                    color: '#f8fafc',
                    fontSize: 11,
                    padding: '3px 6px',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value={0}>All Trades</option>
                  <option value={10000}>$10k+</option>
                  <option value={50000}>$50k+</option>
                  <option value={250000}>$250k+ (Whales)</option>
                  <option value={1000000}>$1M+ (Mega Whales)</option>
                </select>
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
                    <span>Bubble Settings...</span>
                    <Sliders size={11} />
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* --- TOOL 6: VWAP DROPDOWN --- */}
        <div style={{ position: 'relative' }}>
          <button
            className={`terminal-dropdown-btn ${preferences.showVwap ? 'active' : ''} ${openMenu === 'vwap' ? 'open' : ''}`}
            onClick={() => toggleMenu('vwap')}
            title="Volume-Weighted Average Price & SD Bands"
            style={{ height: 26, padding: '0 7px', fontSize: 11 }}
          >
            <Activity size={12} style={{ color: preferences.showVwap ? '#38bdf8' : 'inherit' }} />
            <span>VWAP</span>
            <ChevronDown size={9} style={{ opacity: 0.6 }} />
          </button>

          {openMenu === 'vwap' && (
            <div className="terminal-dropdown-menu" style={{ width: 250 }}>
              <div className="terminal-menu-header">Volume-Weighted Average Price</div>
              <div
                className="terminal-menu-item"
                onClick={() => {
                  const next = !preferences.showVwap;
                  onUpdatePreferences({
                    showVwap: next,
                    vwap: { ...preferences.vwap, enabled: next },
                  });
                }}
              >
                <span style={{ fontWeight: 600 }}>Enable VWAP</span>
                <Switch
                  checked={preferences.showVwap}
                  onChange={(c) =>
                    onUpdatePreferences({
                      showVwap: c,
                      vwap: { ...preferences.vwap, enabled: c },
                    })
                  }
                />
              </div>

              <div className="terminal-menu-divider" />
              <div className="terminal-menu-header">Anchor Period</div>
              <div style={{ padding: '3px 10px 6px 10px' }}>
                <select
                  value={preferences.vwap.anchor}
                  onChange={(e) => onUpdatePreferences({ vwap: { ...preferences.vwap, anchor: e.target.value as any } })}
                  style={{
                    width: '100%',
                    background: '#141a27',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: 4,
                    color: '#f8fafc',
                    fontSize: 11,
                    padding: '3px 6px',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="session">Session (Daily 00:00 UTC)</option>
                  <option value="week">Weekly</option>
                  <option value="month">Monthly</option>
                  <option value="continuous">Continuous</option>
                </select>
              </div>

              <div
                className="terminal-menu-item"
                onClick={() => onUpdatePreferences({ vwap: { ...preferences.vwap, showBands1: !preferences.vwap.showBands1 } })}
              >
                <span>SD 1 Bands (±1σ)</span>
                <Switch checked={preferences.vwap.showBands1} onChange={(c) => onUpdatePreferences({ vwap: { ...preferences.vwap, showBands1: c } })} />
              </div>

              <div
                className="terminal-menu-item"
                onClick={() => onUpdatePreferences({ vwap: { ...preferences.vwap, showBands2: !preferences.vwap.showBands2 } })}
              >
                <span>SD 2 Bands (±2σ)</span>
                <Switch checked={preferences.vwap.showBands2} onChange={(c) => onUpdatePreferences({ vwap: { ...preferences.vwap, showBands2: c } })} />
              </div>

              {onOpenVwapSettings && (
                <>
                  <div className="terminal-menu-divider" />
                  <div
                    className="terminal-menu-item action-btn"
                    onClick={() => {
                      setOpenMenu(null);
                      onOpenVwapSettings();
                    }}
                  >
                    <span>VWAP Settings...</span>
                    <Sliders size={11} />
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* --- TOOL 7: VIEW & LAYOUT DROPDOWN --- */}
        <div style={{ position: 'relative' }}>
          <button
            className={`terminal-dropdown-btn ${openMenu === 'view' ? 'open' : ''}`}
            onClick={() => toggleMenu('view')}
            title="View & Layout Controls"
            style={{ height: 26, padding: '0 7px', fontSize: 11 }}
          >
            <Settings size={12} />
            <span>View</span>
            <ChevronDown size={9} style={{ opacity: 0.6 }} />
          </button>

          {openMenu === 'view' && (
            <div className="terminal-dropdown-menu" style={{ width: 220 }}>
              <div className="terminal-menu-header">Navigation & Zoom</div>
              <div
                className="terminal-menu-item"
                onClick={() => {
                  onUpdatePreferences({ autoScrollToLatest: !preferences.autoScrollToLatest });
                  onJumpToLatest();
                }}
              >
                <span>Auto-Follow Price</span>
                <Switch
                  checked={preferences.autoScrollToLatest}
                  onChange={(c) => {
                    onUpdatePreferences({ autoScrollToLatest: c });
                    if (c) onJumpToLatest();
                  }}
                />
              </div>

              <div className="terminal-menu-item action-btn" onClick={onZoomIn}>
                <span>Zoom In</span>
                <ZoomIn size={12} />
              </div>
              <div className="terminal-menu-item action-btn" onClick={onZoomOut}>
                <span>Zoom Out</span>
                <ZoomOut size={12} />
              </div>
              <div className="terminal-menu-item action-btn" onClick={onResetView}>
                <span>Reset View</span>
                <RotateCcw size={12} />
              </div>
              <div className="terminal-menu-item action-btn" onClick={onToggleFullscreen}>
                <span>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
                {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
              </div>

              <div className="terminal-menu-divider" />
              <div className="terminal-menu-header">Diagnostics & Storage</div>
              <div
                className="terminal-menu-item action-btn"
                onClick={() => {
                  setOpenMenu(null);
                  onOpenDiagnostics();
                }}
              >
                <span>L2 Diagnostics</span>
                <Activity size={12} />
              </div>
              <div
                className="terminal-menu-item action-btn"
                onClick={() => {
                  setOpenMenu(null);
                  onOpenCacheModal();
                }}
              >
                <span>Cache & Storage</span>
                <Database size={12} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* 3. STATUS & CLOCK GROUP: IST Clock, Latency & Power          */}
      {/* ============================================================ */}
      <div className="toolbar-status-group">
        {/* Indian Standard Time (Asia/Kolkata) */}
        <div
          className="toolbar-clock-container"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
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
          <span>{kolkataTimeHhMm || '--:--'}</span>
          <span className="toolbar-clock-seconds">{kolkataTimeSeconds}</span>
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
          <span
            style={{
              color:
                latencyMetrics.orderBookAgeMs > 0 && latencyMetrics.orderBookAgeMs <= 120
                  ? '#00e676'
                  : latencyMetrics.orderBookAgeMs <= 250
                  ? '#ffb300'
                  : '#f87171',
              fontWeight: 500,
            }}
          >
            {latencyMetrics.orderBookAgeMs > 0
              ? `${latencyMetrics.orderBookAgeMs}ms`
              : latencyMetrics.wsPingMs > 0
              ? `${latencyMetrics.wsPingMs}ms`
              : '--'}
          </span>
        </div>

        {/* Dedicated Power Off / Lock Button */}
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
            }}
          >
            <Power size={11} />
          </button>
        )}
      </div>
    </header>
  );
};
