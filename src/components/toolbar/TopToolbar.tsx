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
  Target,
  TrendingUp,
  TrendingDown,
  Bot,
  Cpu,
  BarChart2,
  Clock,
  MoreHorizontal,
} from 'lucide-react';
import { CandleTimeframe, ConnectionState, ExchangeId, LatencyMetrics } from '../../types/market';
import { TerminalPreferences } from '../../types/settings';
import { ChartMode } from '../../types/footprint';
import { PositionType } from '../../types/position';
import { ColorMapEngine } from '../../services/heatmap/ColorMap';
import { InstrumentRegistry } from '../../services/market/InstrumentRegistry';
import { MarketSessionService } from '../../services/market/MarketSessionService';
import { GexMetrics } from '../../types/gex';

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
  onOpenAbsorptionSettings?: () => void;
  onOpenDiagnostics: () => void;
  onOpenCacheModal: () => void;
  onLockTerminal?: () => void;
  onOpenAIConfig?: () => void;
  onToggleAITerminal?: () => void;
  isAITerminalOpen?: boolean;
  activeDrawingTool?: PositionType | null;
  onSelectDrawingTool?: (tool: PositionType | null) => void;
  onOpenGexTerminal?: () => void;
  gexMetrics?: GexMetrics | null;
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

type MenuType = 'exchange' | 'symbol' | 'timeframe' | 'tools' | 'view' | 'more';

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
  onOpenAbsorptionSettings,
  onOpenDiagnostics,
  onOpenCacheModal,
  onLockTerminal,
  onOpenAIConfig,
  onToggleAITerminal,
  isAITerminalOpen = true,
  activeDrawingTool,
  onSelectDrawingTool,
  onOpenGexTerminal,
  gexMetrics,
}) => {
  const [openMenu, setOpenMenu] = useState<MenuType | null>(null);
  const toolbarRef = useRef<HTMLElement | null>(null);

  const [isMobileScreen, setIsMobileScreen] = useState<boolean>(
    () => typeof window !== 'undefined' && window.innerWidth < 768
  );

  useEffect(() => {
    const handleResize = () => {
      setIsMobileScreen(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
    if (symbol === 'GC') return 'GC Gold Futures';
    if (symbol === 'NAS100' || symbol === 'NASDAQ' || symbol === 'NDX') return 'NAS100 / NDX';
    if (symbol === 'QQQ') return 'QQQ ETF';
    if (symbol === 'NQ') return 'NQ Futures';
    if (symbol === 'MNQ') return 'MNQ Micro';
    if (symbol === 'EURUSD') return 'EUR/USD Forex';
    if (symbol === 'GBPUSD') return 'GBP/USD Forex';
    return symbol.replace('USDT', '/USDT');
  };

  const handleSelectSymbol = (selected: string, targetExchange: ExchangeId) => {
    setOpenMenu(null);
    let sym = selected;
    let ex = targetExchange;

    if (selected === 'GC' || selected === 'NQ' || selected === 'MNQ') {
      sym = selected;
      ex = 'comex';
    } else if (selected === 'XAUUSD_VANTAGE') {
      sym = 'XAUUSD_VANTAGE';
      ex = 'mt5';
    } else if (
      selected === 'XAUUSD' ||
      selected === 'NAS100' ||
      selected === 'NASDAQ' ||
      selected === 'QQQ' ||
      selected === 'EURUSD' ||
      selected === 'GBPUSD'
    ) {
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

  const activeToolsCount = [
    preferences.showCandles,
    preferences.showHeatmap,
    preferences.showDepthProfile,
    preferences.showGexProfile,
    preferences.showFootprint,
    preferences.showBubbles,
    preferences.showVwap,
    preferences.showAbsorption,
    preferences.showGex,
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
        {/* Terminal Logo with AI Configuration Modal Trigger */}
        <div
          onClick={onOpenAIConfig}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            marginRight: 4,
            cursor: 'pointer',
            padding: '2px 4px',
            borderRadius: 4,
            transition: 'background 0.15s ease',
          }}
          className="toolbar-logo-btn"
          title="JARVIS AI Intelligence Engine — Click to configure OpenAI, Gemini & Grok"
        >
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
          <span
            style={{
              fontSize: 8.5,
              fontWeight: 800,
              padding: '1px 4px',
              borderRadius: 3,
              background: 'rgba(0, 242, 254, 0.12)',
              border: '1px solid rgba(0, 242, 254, 0.3)',
              color: '#00f2fe',
              letterSpacing: '0.05em',
            }}
          >
            AI
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
            <div className="terminal-dropdown-menu" style={{ width: 310, maxHeight: '80vh', overflowY: 'auto', left: 0 }}>
              {/* Category 1: Metals */}
              <div className="terminal-menu-header">🥇 Metals & Gold Benchmarks</div>
              {[
                { sym: 'XAUUSD', ex: 'binance' as ExchangeId, label: 'XAU/USD • OANDA Spot Gold', sub: 'TradingView & MT5 Market Parity' },
                { sym: 'XAUUSD_VANTAGE', ex: 'mt5' as ExchangeId, label: 'XAU/USD • Vantage MT5', sub: 'Vantage Markets Broker Bridge' },
                { sym: 'GC', ex: 'comex' as ExchangeId, label: 'GC • COMEX Gold Futures', sub: 'Official CME Globex 100 oz Contract' },
              ].map(({ sym, ex, label, sub }) => {
                const isSel = preferences.symbol === sym;
                return (
                  <div
                    key={sym}
                    className="terminal-menu-item"
                    style={{
                      background: isSel ? 'rgba(234, 179, 8, 0.12)' : 'transparent',
                      color: isSel ? '#fde047' : '#cbd5e1',
                      padding: '5px 12px',
                    }}
                    onClick={() => handleSelectSymbol(sym, ex)}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <span style={{ fontWeight: isSel ? 700 : 500 }}>{label}</span>
                      <span style={{ fontSize: 9.5, color: '#94a3b8' }}>{sub}</span>
                    </div>
                    {isSel && <Check size={13} style={{ color: '#facc15' }} />}
                  </div>
                );
              })}

              {/* Category 2: Crypto */}
              <div className="terminal-menu-divider" />
              <div className="terminal-menu-header">🪙 Cryptocurrency Spot</div>
              {[
                { sym: 'BTCUSDT', ex: 'binance' as ExchangeId, label: 'BTC/USDT Spot', sub: 'Bitcoin • Deribit Options Reference' },
                { sym: 'ETHUSDT', ex: 'binance' as ExchangeId, label: 'ETH/USDT Spot', sub: 'Ethereum • Deribit Options Reference' },
                { sym: 'SOLUSDT', ex: 'binance' as ExchangeId, label: 'SOL/USDT Spot', sub: 'Solana High-Speed Spot' },
                { sym: 'BNBUSDT', ex: 'binance' as ExchangeId, label: 'BNB/USDT Spot', sub: 'BNB Ecosystem Spot' },
              ].map(({ sym, ex, label, sub }) => {
                const isSel = preferences.symbol === sym;
                return (
                  <div
                    key={sym}
                    className="terminal-menu-item"
                    style={{
                      background: isSel ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                      color: isSel ? '#38bdf8' : '#cbd5e1',
                      padding: '5px 12px',
                    }}
                    onClick={() => handleSelectSymbol(sym, ex)}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <span style={{ fontWeight: isSel ? 700 : 500 }}>{label}</span>
                      <span style={{ fontSize: 9.5, color: '#94a3b8' }}>{sub}</span>
                    </div>
                    {isSel && <Check size={13} style={{ color: '#38bdf8' }} />}
                  </div>
                );
              })}

              {/* Category 3: Forex */}
              <div className="terminal-menu-divider" />
              <div className="terminal-menu-header">💱 Foreign Exchange (Forex)</div>
              {[
                { sym: 'EURUSD', ex: 'binance' as ExchangeId, label: 'EUR/USD Spot Forex', sub: 'Euro Major • CME Options Parity' },
                { sym: 'GBPUSD', ex: 'binance' as ExchangeId, label: 'GBP/USD Spot Forex', sub: 'British Pound Major • CME Options Parity' },
              ].map(({ sym, ex, label, sub }) => {
                const isSel = preferences.symbol === sym;
                return (
                  <div
                    key={sym}
                    className="terminal-menu-item"
                    style={{
                      background: isSel ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                      color: isSel ? '#38bdf8' : '#cbd5e1',
                      padding: '5px 12px',
                    }}
                    onClick={() => handleSelectSymbol(sym, ex)}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <span style={{ fontWeight: isSel ? 700 : 500 }}>{label}</span>
                      <span style={{ fontSize: 9.5, color: '#94a3b8' }}>{sub}</span>
                    </div>
                    {isSel && <Check size={13} style={{ color: '#38bdf8' }} />}
                  </div>
                );
              })}

              {/* Category 4: Equity Indices */}
              <div className="terminal-menu-divider" />
              <div className="terminal-menu-header">📈 Equity Indices</div>
              <div
                className="terminal-menu-item"
                style={{
                  background: preferences.symbol === 'NAS100' ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                  color: preferences.symbol === 'NAS100' ? '#38bdf8' : '#cbd5e1',
                  padding: '5px 12px',
                }}
                onClick={() => handleSelectSymbol('NAS100', 'binance')}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontWeight: preferences.symbol === 'NAS100' ? 700 : 500 }}>
                    NAS100 / NDX • Nasdaq 100 Index
                  </span>
                  <span style={{ fontSize: 9.5, color: '#94a3b8' }}>Cash Index Benchmark • CBOE NDX Options</span>
                </div>
                {preferences.symbol === 'NAS100' && <Check size={13} style={{ color: '#38bdf8' }} />}
              </div>

              {/* Category 5: Index ETFs */}
              <div className="terminal-menu-divider" />
              <div className="terminal-menu-header">📊 Index ETFs</div>
              <div
                className="terminal-menu-item"
                style={{
                  background: preferences.symbol === 'QQQ' ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                  color: preferences.symbol === 'QQQ' ? '#38bdf8' : '#cbd5e1',
                  padding: '5px 12px',
                }}
                onClick={() => handleSelectSymbol('QQQ', 'binance')}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontWeight: preferences.symbol === 'QQQ' ? 700 : 500 }}>
                    QQQ • Invesco Nasdaq-100 ETF
                  </span>
                  <span style={{ fontSize: 9.5, color: '#94a3b8' }}>ETF Shares & OPRA Options (Distinct from NDX)</span>
                </div>
                {preferences.symbol === 'QQQ' && <Check size={13} style={{ color: '#38bdf8' }} />}
              </div>

              {/* Category 6: Futures */}
              <div className="terminal-menu-divider" />
              <div className="terminal-menu-header">⚡ CME Futures</div>
              {[
                { sym: 'NQ', ex: 'comex' as ExchangeId, label: 'NQ • E-mini Nasdaq-100 Futures', sub: 'CME Globex Front-Month ($20/pt)' },
                { sym: 'MNQ', ex: 'comex' as ExchangeId, label: 'MNQ • Micro E-mini Nasdaq-100', sub: 'CME Globex Micro Contract ($2/pt)' },
              ].map(({ sym, ex, label, sub }) => {
                const isSel = preferences.symbol === sym;
                return (
                  <div
                    key={sym}
                    className="terminal-menu-item"
                    style={{
                      background: isSel ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                      color: isSel ? '#38bdf8' : '#cbd5e1',
                      padding: '5px 12px',
                    }}
                    onClick={() => handleSelectSymbol(sym, ex)}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <span style={{ fontWeight: isSel ? 700 : 500 }}>{label}</span>
                      <span style={{ fontSize: 9.5, color: '#94a3b8' }}>{sub}</span>
                    </div>
                    {isSel && <Check size={13} style={{ color: '#38bdf8' }} />}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Timeframe Selector (Responsive Dropdown on Mobile <768px, Pills on Desktop) */}
        {isMobileScreen ? (
          <div style={{ position: 'relative' }}>
            <button
              className={`terminal-dropdown-btn ${openMenu === 'timeframe' ? 'open' : ''}`}
              onClick={() => toggleMenu('timeframe')}
              title="Select Candle Timeframe"
              style={{
                height: 26,
                padding: '0 7px',
                fontSize: 11,
                gap: 4,
                background: 'rgba(0, 180, 216, 0.1)',
                border: '1px solid rgba(0, 180, 216, 0.35)',
                color: '#38bdf8',
              }}
            >
              <Clock size={11} />
              <span style={{ fontWeight: 700 }}>{preferences.timeframe}</span>
              <ChevronDown size={10} style={{ opacity: 0.7 }} />
            </button>

            {openMenu === 'timeframe' && (
              <div className="terminal-dropdown-menu" style={{ width: 140, left: 0 }}>
                <div className="terminal-menu-header">Candle Timeframe</div>
                {SUPPORTED_TIMEFRAMES.map((tf) => {
                  const isSupported = currentInst.supportedIntervals.includes(tf);
                  const isSel = preferences.timeframe === tf;
                  return (
                    <div
                      key={tf}
                      className="terminal-menu-item"
                      style={{
                        padding: '6px 12px',
                        fontWeight: isSel ? 700 : 500,
                        color: isSel ? '#38bdf8' : isSupported ? '#cbd5e1' : '#475569',
                        background: isSel ? 'rgba(0, 180, 216, 0.15)' : 'transparent',
                        cursor: isSupported ? 'pointer' : 'not-allowed',
                        opacity: isSupported ? 1 : 0.4,
                      }}
                      onClick={() => {
                        if (isSupported) {
                          onUpdatePreferences({ timeframe: tf });
                          setOpenMenu(null);
                        }
                      }}
                    >
                      <span>{tf}</span>
                      {isSel && <Check size={12} style={{ color: '#38bdf8' }} />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
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
        )}
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
            <div className="terminal-dropdown-menu" style={{ width: 320, left: 0, maxHeight: '80vh', overflowY: 'auto' }}>
              <div className="terminal-menu-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Trading Tools & Intelligence</span>
                <span style={{ fontSize: 9, color: '#38bdf8' }}>{activeToolsCount} Active</span>
              </div>

              {/* GROUP 1: Options Intelligence */}
              <div className="terminal-menu-header" style={{ color: '#ec4899', background: 'rgba(236, 72, 153, 0.08)' }}>
                🎯 Options Intelligence (GEX)
              </div>
              <ToolItem
                icon={<BarChart2 size={14} style={{ color: '#ec4899' }} />}
                title="GEX Exposure Profile Ladder"
                subtitle="On-Chart Horizontal Net GEX & Wall Profile"
                active={preferences.showGexProfile}
                onToggle={(targetVal) => {
                  const next = typeof targetVal === 'boolean' ? targetVal : !preferences.showGexProfile;
                  onUpdatePreferences({
                    showGexProfile: next,
                    gex: { ...preferences.gex, showProfileLadder: next },
                  });
                }}
                onOpenSettings={
                  onOpenGexTerminal
                    ? () => {
                        setOpenMenu(null);
                        onOpenGexTerminal();
                      }
                    : undefined
                }
                settingsTitle="GEX Profile Settings & Analytics Matrix"
              />
              <ToolItem
                icon={<Cpu size={14} style={{ color: '#f472b6' }} />}
                title="GEX Price Level Lines"
                subtitle={
                  gexMetrics
                    ? `${(gexMetrics.gammaRegime || 'unresolved').toUpperCase().replace('_', ' ')} • Flip $${gexMetrics.gammaFlip ? Math.round(gexMetrics.gammaFlip.price).toLocaleString() : 'N/A'}`
                    : 'Call/Put Walls, Gamma Flip & HVL Bands'
                }
                active={preferences.showGex}
                onToggle={(targetVal) => {
                  const next = typeof targetVal === 'boolean' ? targetVal : !preferences.showGex;
                  onUpdatePreferences({
                    showGex: next,
                    gex: { ...preferences.gex, enabled: next },
                  });
                }}
                onOpenSettings={
                  onOpenGexTerminal
                    ? () => {
                        setOpenMenu(null);
                        onOpenGexTerminal();
                      }
                    : undefined
                }
                settingsTitle="Open Complete GEX Analytics & Settings Matrix"
              />

              {/* GROUP 2: Order Flow */}
              <div className="terminal-menu-divider" />
              <div className="terminal-menu-header" style={{ color: '#a855f7', background: 'rgba(168, 85, 247, 0.08)' }}>
                🌊 Order Flow & Footprint
              </div>
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
              <ToolItem
                icon={<Target size={14} style={{ color: '#facc15' }} />}
                title="Absorption (A / A+)"
                subtitle={`Grade: ${preferences.absorption?.gradeFilter === 'a_plus_only' ? 'A+ Only' : 'A & A+'} • Zone Defense`}
                active={preferences.showAbsorption}
                onToggle={(targetVal) => {
                  const next = typeof targetVal === 'boolean' ? targetVal : !preferences.showAbsorption;
                  onUpdatePreferences({
                    showAbsorption: next,
                    absorption: { ...preferences.absorption, enabled: next },
                  });
                }}
                onOpenSettings={
                  onOpenAbsorptionSettings
                    ? () => {
                        setOpenMenu(null);
                        onOpenAbsorptionSettings();
                      }
                    : undefined
                }
                settingsTitle="Absorption Settings (A & A+, Zone Defense, Multipliers)"
              />
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

              {/* GROUP 3: Liquidity */}
              <div className="terminal-menu-divider" />
              <div className="terminal-menu-header" style={{ color: '#00b4d8', background: 'rgba(0, 180, 216, 0.08)' }}>
                💧 Liquidity & Depth
              </div>
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

              {/* GROUP 4: Market & Chart */}
              <div className="terminal-menu-divider" />
              <div className="terminal-menu-header" style={{ color: '#22c55e', background: 'rgba(34, 197, 94, 0.08)' }}>
                📊 Market & Chart Indicators
              </div>
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

              {/* GROUP 5: AI Intelligence */}
              <div className="terminal-menu-divider" />
              <div className="terminal-menu-header" style={{ color: '#00f2fe', background: 'rgba(0, 242, 254, 0.08)' }}>
                🧠 AI Intelligence
              </div>
              <ToolItem
                icon={<Bot size={14} style={{ color: '#00f2fe' }} />}
                title="AI Neural Terminal"
                subtitle="Live Market Regimes & Multi-LLM Chat"
                active={isAITerminalOpen}
                onToggle={() => onToggleAITerminal?.()}
                onOpenSettings={onOpenAIConfig}
                settingsTitle="AI Intelligence Engine Settings"
              />
            </div>
          )}
        </div>


        {/* On Mobile (<768px), collapse View, Long/Short drawing tools, Diagnostics & Storage into a single "More" dropdown */}
        {isMobileScreen ? (
          <div style={{ position: 'relative' }}>
            <button
              className={`terminal-dropdown-btn ${openMenu === 'more' ? 'open' : ''} ${activeDrawingTool ? 'active' : ''}`}
              onClick={() => toggleMenu('more')}
              title="More Actions & View Controls"
              style={{ height: 26, padding: '0 7px', fontSize: 11, gap: 3 }}
            >
              <MoreHorizontal size={14} />
            </button>

            {openMenu === 'more' && (
              <div className="terminal-dropdown-menu" style={{ width: 230, right: 0, left: 'auto' }}>
                <div className="terminal-menu-header">Trading Tools</div>
                <div
                  className="terminal-menu-item"
                  style={{
                    background: activeDrawingTool === 'LONG' ? 'rgba(8, 153, 129, 0.18)' : 'transparent',
                    color: activeDrawingTool === 'LONG' ? '#10b981' : '#cbd5e1',
                  }}
                  onClick={() => {
                    onSelectDrawingTool?.(activeDrawingTool === 'LONG' ? null : 'LONG');
                    setOpenMenu(null);
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <TrendingUp size={13} color="#10b981" />
                    <span>Long Position Tool</span>
                  </div>
                  {activeDrawingTool === 'LONG' && <Check size={13} style={{ color: '#10b981' }} />}
                </div>

                <div
                  className="terminal-menu-item"
                  style={{
                    background: activeDrawingTool === 'SHORT' ? 'rgba(242, 54, 69, 0.18)' : 'transparent',
                    color: activeDrawingTool === 'SHORT' ? '#f87171' : '#cbd5e1',
                  }}
                  onClick={() => {
                    onSelectDrawingTool?.(activeDrawingTool === 'SHORT' ? null : 'SHORT');
                    setOpenMenu(null);
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <TrendingDown size={13} color="#f87171" />
                    <span>Short Position Tool</span>
                  </div>
                  {activeDrawingTool === 'SHORT' && <Check size={13} style={{ color: '#f87171' }} />}
                </div>

                <div className="terminal-menu-divider" />
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
                      setOpenMenu(null);
                    }}
                    style={{
                      width: '100%',
                      background: '#141a27',
                      border: '1px solid rgba(0, 180, 216, 0.35)',
                      borderRadius: 4,
                      color: '#38bdf8',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '4px 6px',
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
                <div className="terminal-menu-item action-btn" onClick={() => { onZoomIn(); setOpenMenu(null); }}>
                  <span>Zoom In</span>
                  <ZoomIn size={12} />
                </div>
                <div className="terminal-menu-item action-btn" onClick={() => { onZoomOut(); setOpenMenu(null); }}>
                  <span>Zoom Out</span>
                  <ZoomOut size={12} />
                </div>
                <div className="terminal-menu-item action-btn" onClick={() => { onResetView(); setOpenMenu(null); }}>
                  <span>Reset View</span>
                  <RotateCcw size={12} />
                </div>
                <div className="terminal-menu-item action-btn" onClick={() => { onToggleFullscreen(); setOpenMenu(null); }}>
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
        ) : (
          <>
            {/* --- VIEW & LAYOUT DROPDOWN (DESKTOP) --- */}
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

            {/* TradingView-Style Long & Short Position Icon-Only Quick Tools */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginLeft: 2 }}>
              <button
                className={`tool-btn ${activeDrawingTool === 'LONG' ? 'active' : ''}`}
                onClick={() => onSelectDrawingTool?.(activeDrawingTool === 'LONG' ? null : 'LONG')}
                style={{
                  width: 26,
                  height: 26,
                  padding: 0,
                  borderRadius: 4,
                  background: activeDrawingTool === 'LONG' ? 'rgba(8, 153, 129, 0.32)' : 'rgba(255, 255, 255, 0.04)',
                  border: `1px solid ${activeDrawingTool === 'LONG' ? '#089981' : 'rgba(255, 255, 255, 0.1)'}`,
                  color: activeDrawingTool === 'LONG' ? '#089981' : '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: activeDrawingTool === 'LONG' ? '0 0 8px rgba(8, 153, 129, 0.5)' : 'none',
                }}
                title="Long Position Tool - Click chart to place"
              >
                <TrendingUp size={13} color={activeDrawingTool === 'LONG' ? '#089981' : '#10b981'} />
              </button>

              <button
                className={`tool-btn ${activeDrawingTool === 'SHORT' ? 'active' : ''}`}
                onClick={() => onSelectDrawingTool?.(activeDrawingTool === 'SHORT' ? null : 'SHORT')}
                style={{
                  width: 26,
                  height: 26,
                  padding: 0,
                  borderRadius: 4,
                  background: activeDrawingTool === 'SHORT' ? 'rgba(242, 54, 69, 0.32)' : 'rgba(255, 255, 255, 0.04)',
                  border: `1px solid ${activeDrawingTool === 'SHORT' ? '#f23645' : 'rgba(255, 255, 255, 0.1)'}`,
                  color: activeDrawingTool === 'SHORT' ? '#f23645' : '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: activeDrawingTool === 'SHORT' ? '0 0 8px rgba(242, 54, 69, 0.5)' : 'none',
                }}
                title="Short Position Tool - Click chart to place"
              >
                <TrendingDown size={13} color={activeDrawingTool === 'SHORT' ? '#f23645' : '#ef4444'} />
              </button>
            </div>
          </>
        )}
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
