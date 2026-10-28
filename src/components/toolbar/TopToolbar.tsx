/**
 * Professional Trading Terminal Top Toolbar
 * JARVIS HEATMAP TERMINAL - RESPONSIVE MODULAR UI
 * All tools grouped into a single unified Tools dropdown, compact exchange/symbol selectors, and zero-overlap layout.
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
  Database,
  Layers,
  ChevronDown,
  Settings,
  Power,
  Check,
  GitCommit,
  Zap,
} from 'lucide-react';
import { CandleTimeframe, ConnectionState, ExchangeId, LatencyMetrics } from '../../types/market';
import { TerminalPreferences } from '../../types/settings';
import { ChartMode } from '../../types/footprint';
import { ColorMapEngine } from '../../services/heatmap/ColorMap';
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
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    className={`terminal-switch ${checked ? 'checked' : ''}`}
    title={title}
    onClick={(e) => {
      e.stopPropagation();
      onChange(!checked);
    }}
  >
    <span className="terminal-switch-knob" />
  </button>
);

interface ToolItemProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  active: boolean;
  onToggle: (targetVal?: boolean) => void;
  onOpenSettings?: () => void;
  settingsTitle?: string;
}

const ToolItem: React.FC<ToolItemProps> = ({
  icon,
  title,
  subtitle,
  active,
  onToggle,
  onOpenSettings,
  settingsTitle,
}) => (
  <div
    className="terminal-menu-item"
    onClick={() => onToggle(!active)}
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '7px 12px',
      cursor: 'pointer',
      background: active ? 'rgba(0, 180, 216, 0.08)' : 'transparent',
      borderLeft: active ? '2px solid #00b4d8' : '2px solid transparent',
      transition: 'all 0.12s ease',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ fontSize: 11.5, fontWeight: active ? 700 : 500, color: active ? '#ffffff' : '#cbd5e1' }}>
          {title}
        </span>
        {subtitle && (
          <span style={{ fontSize: 9.5, color: '#64748b', fontWeight: 500 }}>
            {subtitle}
          </span>
        )}
      </div>
    </div>

    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {onOpenSettings && (
        <button
          type="button"
          title={settingsTitle || `Open ${title} Settings`}
          onClick={(e) => {
            e.stopPropagation();
            onOpenSettings();
          }}
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: 4,
            color: active ? '#00b4d8' : '#64748b',
            padding: '3px 6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.12s ease',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(0, 180, 216, 0.2)';
            (e.currentTarget as HTMLElement).style.color = '#38bdf8';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(255, 255, 255, 0.05)';
            (e.currentTarget as HTMLElement).style.color = active ? '#00b4d8' : '#64748b';
          }}
        >
          <Sliders size={12} />
        </button>
      )}
      <Switch checked={active} onChange={(newChecked) => onToggle(newChecked)} />
    </div>
  </div>
);

type MenuType = 'exchange' | 'symbol' | 'timeframe' | 'tools' | 'view';

const TopToolbarComponent: React.FC<TopToolbarProps> = ({
  preferences,
  onUpdatePreferences,
  connectionState,
  latencyMetrics,
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
    if (symbol === 'XAUUSD') return 'XAU/USD Spot Gold';
    if (symbol === 'XAUUSD_VANTAGE') return 'XAU/USD Vantage MT5';
    if (symbol === 'GC') return 'GC Gold';
    if (symbol === 'NAS100' || symbol === 'NASDAQ' || symbol === 'NDX') return 'NAS100 Nasdaq';
    return symbol.replace('USDT', '/USDT');
  };

  const handleSelectSymbol = (selected: string, targetExchange: ExchangeId) => {
    setOpenMenu(null);
    let sym = selected;
    let ex = targetExchange;

    if (selected === 'GC') {
      sym = 'GC';
      ex = 'comex';
    } else if (selected === 'XAUUSD_VANTAGE') {
      sym = 'XAUUSD_VANTAGE';
      ex = 'mt5';
    } else if (selected === 'XAUUSD') {
      sym = 'XAUUSD';
      ex = 'binance';
    } else if (selected === 'NAS100' || selected === 'NASDAQ') {
      sym = 'NAS100';
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

  const activeToolsCount = [
    preferences.showCandles,
    preferences.showHeatmap,
    preferences.showDepthProfile,
    preferences.showFootprint,
    preferences.showBubbles,
    preferences.showVwap,
    preferences.showBestBidAskLines,
    preferences.showLiquidityShifts,
  ].filter(Boolean).length;

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
        zIndex: 99999,
        overflow: 'visible',
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


        {/* Small Symbol / Pair Selector Dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            className={`terminal-dropdown-btn toolbar-symbol-btn ${openMenu === 'symbol' ? 'open' : ''}`}
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
                    <span style={{ fontWeight: 700 }}>XAU/USD • Spot Gold (MT5 Parity)</span>
                    <span style={{ fontSize: 9, padding: '0 4px', borderRadius: 3, background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>MT5 Parity</span>
                  </div>
                  <span style={{ fontSize: 9.5, color: '#94a3b8' }}>MT5 Spot Gold Benchmark • Live Level 2 DOM & Trades</span>
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
                onClick={() => handleSelectSymbol('XAUUSD_VANTAGE', 'mt5')}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 700 }}>XAU/USD • Vantage MT5</span>
                    <span style={{ fontSize: 9, padding: '0 4px', borderRadius: 3, background: 'rgba(168, 85, 247, 0.18)', color: '#c084fc' }}>Broker Bridge</span>
                  </div>
                  <span style={{ fontSize: 9.5, color: '#94a3b8' }}>Vantage Markets MT5 Bridge (Requires Credentials)</span>
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

              <div className="terminal-menu-divider" />
              <div className="terminal-menu-header">📈 Equity Indices</div>

              <div
                className="terminal-menu-item"
                style={{
                  background: preferences.symbol === 'NAS100' ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                  color: preferences.symbol === 'NAS100' ? '#38bdf8' : '#cbd5e1',
                  padding: '6px 12px',
                }}
                onClick={() => handleSelectSymbol('NAS100', 'binance')}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 700 }}>NAS100 • Nasdaq 100</span>
                    <span style={{ fontSize: 9, padding: '0 4px', borderRadius: 3, background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>TV & MT5 Parity</span>
                  </div>
                  <span style={{ fontSize: 9.5, color: '#94a3b8' }}>Nasdaq 100 Index CFD • Real-Time TradingView Benchmark</span>
                </div>
                {preferences.symbol === 'NAS100' && <Check size={13} style={{ color: '#38bdf8' }} />}
              </div>
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
      {/* 2. CENTER GROUP: SINGLE UNIFIED TOOLS DROPDOWN + VIEW MENU   */}
      {/* ============================================================ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        {/* --- SINGLE UNIFIED TOOLS & INDICATORS DROPDOWN --- */}
        <div style={{ position: 'relative' }}>
          <button
            className={`terminal-dropdown-btn ${activeToolsCount > 0 ? 'active' : ''} ${openMenu === 'tools' ? 'open' : ''}`}
            onClick={() => toggleMenu('tools')}
            title="Trading Tools, Overlays & Indicators"
            style={{ height: 26, padding: '0 8px', fontSize: 11, gap: 5 }}
          >
            <Sliders size={12} style={{ color: activeToolsCount > 0 ? '#38bdf8' : 'inherit' }} />
            <span style={{ fontWeight: 700 }}>Tools</span>
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                padding: '0 5px',
                borderRadius: 10,
                background: activeToolsCount > 0 ? 'rgba(0, 180, 216, 0.28)' : 'rgba(255, 255, 255, 0.08)',
                color: activeToolsCount > 0 ? '#38bdf8' : '#94a3b8',
              }}
            >
              {activeToolsCount}
            </span>
            <ChevronDown size={10} style={{ opacity: 0.6 }} />
          </button>

          {openMenu === 'tools' && (
            <div className="terminal-dropdown-menu" style={{ width: 310, left: 0 }}>
              <div className="terminal-menu-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Trading Tools & Indicators</span>
                <span style={{ fontSize: 9, color: '#38bdf8' }}>{activeToolsCount} Active</span>
              </div>

              {/* 1. VWAP + SD Bands */}
              <ToolItem
                icon={<Activity size={14} style={{ color: '#ff9f1c' }} />}
                title="VWAP + SD Bands"
                subtitle={`Anchor: ${preferences.vwap.anchor.toUpperCase()} • Multipliers: ±${preferences.vwap.multiplier1}σ, ±${preferences.vwap.multiplier2}σ`}
                active={preferences.showVwap}
                onToggle={(targetVal) => {
                  const next = typeof targetVal === 'boolean' ? targetVal : !preferences.showVwap;
                  onUpdatePreferences({
                    showVwap: next,
                    vwap: { ...preferences.vwap, enabled: next },
                  });
                }}
                onOpenSettings={
                  onOpenVwapSettings
                    ? () => {
                        setOpenMenu(null);
                        onOpenVwapSettings();
                      }
                    : undefined
                }
                settingsTitle="VWAP Settings (Anchor, Multipliers, Colors, Styles)"
              />

              {/* 2. Liquidity Heatmap */}
              <ToolItem
                icon={<Flame size={14} style={{ color: '#00b4d8' }} />}
                title="Liquidity Heatmap"
                subtitle={`Palette: ${preferences.heatmap.colorScale} • Resting L2 Depth`}
                active={preferences.showHeatmap}
                onToggle={(targetVal) => {
                  const next = typeof targetVal === 'boolean' ? targetVal : !preferences.showHeatmap;
                  onUpdatePreferences({ showHeatmap: next });
                }}
                onOpenSettings={
                  onOpenHeatmapSettings
                    ? () => {
                        setOpenMenu(null);
                        onOpenHeatmapSettings();
                      }
                    : undefined
                }
                settingsTitle="Heatmap Settings (Palette, Contrast, Cutoff)"
              />

              {/* 3. Order Book Ladder (COB) */}
              <ToolItem
                icon={<Layers size={14} style={{ color: '#fbbf24' }} />}
                title="Order Book Ladder (COB)"
                subtitle={`Depth: ${preferences.depthProfile.maxLevels} levels • Limit Walls`}
                active={preferences.showDepthProfile}
                onToggle={(targetVal) => {
                  const next = typeof targetVal === 'boolean' ? targetVal : !preferences.showDepthProfile;
                  onUpdatePreferences({
                    showDepthProfile: next,
                    depthProfile: { ...preferences.depthProfile, enabled: next },
                  });
                }}
                onOpenSettings={
                  onOpenDepthProfileSettings
                    ? () => {
                        setOpenMenu(null);
                        onOpenDepthProfileSettings();
                      }
                    : undefined
                }
                settingsTitle="COB Settings (Depth, Colors, Cumulative)"
              />

              {/* 4. Footprint Order Flow */}
              <ToolItem
                icon={<BarChart3 size={14} style={{ color: '#a855f7' }} />}
                title="Footprint Order Flow"
                subtitle={`Tick: ${preferences.footprint.tickMultiplier}x • Bid x Ask Clusters`}
                active={preferences.showFootprint}
                onToggle={(targetVal) => {
                  const next = typeof targetVal === 'boolean' ? targetVal : !preferences.showFootprint;
                  onUpdatePreferences({
                    showFootprint: next,
                    footprint: { ...preferences.footprint, enabled: next },
                    showCandles: true,
                    chartMode: next ? 'footprint' : (preferences.showHeatmap ? 'heatmap' : 'candles'),
                  });
                }}
                onOpenSettings={
                  onOpenFootprintSettings
                    ? () => {
                        setOpenMenu(null);
                        onOpenFootprintSettings();
                      }
                    : undefined
                }
                settingsTitle="Footprint Settings (Imbalance, Ticks, POC)"
              />

              {/* 5. Trade Volume Bubbles */}
              <ToolItem
                icon={<CircleDot size={14} style={{ color: '#38bdf8' }} />}
                title="Trade Volume Bubbles"
                subtitle={`Min: ${preferences.bubbles.minTradeNotional === 0 ? 'All Trades' : '$' + (preferences.bubbles.minTradeNotional / 1000) + 'k+'} • Market Orders`}
                active={preferences.showBubbles}
                onToggle={(targetVal) => {
                  const next = typeof targetVal === 'boolean' ? targetVal : !preferences.showBubbles;
                  onUpdatePreferences({
                    showBubbles: next,
                    bubbles: { ...preferences.bubbles, enabled: next },
                  });
                }}
                onOpenSettings={
                  onOpenBubbleSettings
                    ? () => {
                        setOpenMenu(null);
                        onOpenBubbleSettings();
                      }
                    : undefined
                }
                settingsTitle="Bubble Settings (Min Size, Scaling, Colors)"
              />

              {/* 6. Candlesticks */}
              <ToolItem
                icon={<CandlestickChart size={14} style={{ color: '#22c55e' }} />}
                title="Candlesticks"
                subtitle={`Mode: ${preferences.chartMode || 'candles'}`}
                active={preferences.showCandles}
                onToggle={(targetVal) => {
                  const next = typeof targetVal === 'boolean' ? targetVal : !preferences.showCandles;
                  onUpdatePreferences({ showCandles: next });
                }}
              />

              <div className="terminal-menu-divider" />
              <div className="terminal-menu-header">Overlays & Ribbons</div>

              {/* 7. Best Bid / Ask Ribbon */}
              <ToolItem
                icon={<GitCommit size={14} style={{ color: '#00e676' }} />}
                title="Best Bid / Ask Ribbon"
                subtitle="Live L1 BBO Price Lines"
                active={preferences.showBestBidAskLines}
                onToggle={(targetVal) => {
                  const next = typeof targetVal === 'boolean' ? targetVal : !preferences.showBestBidAskLines;
                  onUpdatePreferences({ showBestBidAskLines: next });
                }}
              />

              {/* 8. Liquidity Shift Highlights */}
              <ToolItem
                icon={<Zap size={14} style={{ color: '#f59e0b' }} />}
                title="Liquidity Shift Highlights"
                subtitle="Detect Resting Order Adds / Pulls"
                active={preferences.showLiquidityShifts}
                onToggle={(targetVal) => {
                  const next = typeof targetVal === 'boolean' ? targetVal : !preferences.showLiquidityShifts;
                  onUpdatePreferences({ showLiquidityShifts: next });
                }}
              />
            </div>
          )}
        </div>

        {/* --- VIEW & LAYOUT DROPDOWN --- */}
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
              <div className="terminal-menu-header">Chart Display Mode</div>
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
          className="toolbar-status-pill"
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
          <span className="toolbar-status-label">{badge.label}</span>
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

export const TopToolbar = React.memo(TopToolbarComponent);
