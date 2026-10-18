/**
 * Liquidity Inspector & Debug Overlay Modal
 * JARVIS HEATMAP TERMINAL - CRITICAL DATA INTEGRITY
 * Section 10 & Section 2 Implementation
 */

import React from 'react';
import { LiquidityInspectionResult } from '../../types/heatmap';
import { X, Search, ShieldCheck, AlertCircle, Clock, BarChart2, Activity, Layers } from 'lucide-react';

interface LiquidityInspectorModalProps {
  inspection: LiquidityInspectionResult | null;
  onClose: () => void;
}

export const LiquidityInspectorModal: React.FC<LiquidityInspectorModalProps> = ({
  inspection,
  onClose,
}) => {
  if (!inspection) return null;

  const formatDate = (ts: number): string => {
    if (!ts || ts <= 0) return 'N/A';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  };

  const formatDuration = (ms: number): string => {
    if (ms <= 0) return 'N/A';
    const sec = Math.floor(ms / 1000);
    const min = Math.floor(sec / 60);
    const remainingSec = sec % 60;
    if (min > 0) return `${min}m ${remainingSec}s`;
    return `${sec}s`;
  };

  const getClassificationBadgeClass = (state: string): string => {
    switch (state) {
      case 'ACTIVE LIQUIDITY':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'SWEPT / TRADED THROUGH':
        return 'bg-red-500/20 text-red-300 border-red-500/40';
      case 'POSSIBLY PULLED':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'TRADE-ASSOCIATED DEPLETION':
      case 'PARTIALLY DEPLETED':
        return 'bg-orange-500/20 text-orange-300 border-orange-500/40';
      case 'REJECTED':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      case 'REPLENISHED':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
      case 'APPROACHED':
      case 'TOUCHED':
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
      default:
        return 'bg-slate-700/40 text-slate-400 border-slate-600/40';
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 60,
        right: 170,
        zIndex: 50,
        width: 320,
        backdropFilter: 'blur(12px)',
        backgroundColor: 'rgba(10, 14, 22, 0.94)',
        border: '1px solid rgba(0, 240, 255, 0.25)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.65)',
        borderRadius: 8,
        color: '#f8fafc',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
      className="p-3 select-none text-xs pointer-events-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
        <div className="flex items-center gap-1.5 font-semibold text-cyan-400">
          <Search size={14} />
          <span>LIQUIDITY INSPECTOR</span>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white transition-colors p-0.5 rounded hover:bg-white/10"
          title="Close Inspector"
        >
          <X size={14} />
        </button>
      </div>

      {!inspection.hasObservation ? (
        <div className="py-4 text-center">
          <AlertCircle size={24} className="mx-auto text-slate-500 mb-2" />
          <div className="text-slate-300 font-medium">EMPTY / UNOBSERVED CELL</div>
          <div className="text-slate-500 text-[11px] mt-1 font-mono">
            Price: ${inspection.price.toFixed(2)}
          </div>
          <div className="text-slate-500 text-[11px] font-mono">
            Time: {formatDate(inspection.timestamp)}
          </div>
          <div className="text-[10px] text-slate-600 mt-2 px-2">
            No valid order book observations were recorded at this coordinate.
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Classification & Source Badge */}
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] font-mono uppercase text-slate-400">
              {inspection.exchange.toUpperCase()} • {inspection.symbol}
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold border tracking-wider ${getClassificationBadgeClass(
                inspection.classification
              )}`}
            >
              {inspection.classification}
            </span>
          </div>

          {/* Price Range */}
          <div className="bg-slate-900/60 p-2 rounded border border-white/5 flex items-center justify-between font-mono">
            <span className="text-slate-400 text-[11px]">Price Range</span>
            <span className="text-cyan-300 font-bold text-[11px]">
              ${inspection.priceMin.toFixed(2)} – ${inspection.priceMax.toFixed(2)}
            </span>
          </div>

          {/* Quantitative Metrics Grid */}
          <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
            <div className="bg-slate-900/40 p-1.5 rounded border border-white/5">
              <div className="text-slate-400 text-[10px] flex items-center gap-1">
                <BarChart2 size={10} /> Current Qty
              </div>
              <div className="text-white font-semibold mt-0.5">
                {inspection.currentQty > 0 ? inspection.currentQty.toFixed(2) : '0.00'}
              </div>
            </div>

            <div className="bg-slate-900/40 p-1.5 rounded border border-white/5">
              <div className="text-slate-400 text-[10px] flex items-center gap-1">
                <Activity size={10} /> Max Qty
              </div>
              <div className="text-white font-semibold mt-0.5">
                {inspection.maxQty > 0 ? inspection.maxQty.toFixed(2) : 'N/A'}
              </div>
            </div>

            <div className="bg-slate-900/40 p-1.5 rounded border border-white/5">
              <div className="text-slate-400 text-[10px]">Avg Observed</div>
              <div className="text-slate-200 mt-0.5">
                {inspection.avgQty > 0 ? inspection.avgQty.toFixed(2) : 'N/A'}
              </div>
            </div>

            <div className="bg-slate-900/40 p-1.5 rounded border border-white/5">
              <div className="text-slate-400 text-[10px]">Trade Executed</div>
              <div
                className={`mt-0.5 font-bold ${
                  inspection.tradeExecutedQty > 0 ? 'text-emerald-400' : 'text-slate-400'
                }`}
              >
                {inspection.tradeExecutedQty > 0 ? inspection.tradeExecutedQty.toFixed(2) : '0.00'}
              </div>
            </div>
          </div>

          {/* Temporal & Interaction Details */}
          <div className="space-y-1 font-mono text-[10px] bg-slate-900/30 p-2 rounded border border-white/5">
            <div className="flex justify-between text-slate-400">
              <span>First Observed:</span>
              <span className="text-slate-200">{formatDate(inspection.firstObservedTime)}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Last Observed:</span>
              <span className="text-slate-200">{formatDate(inspection.lastObservedTime)}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Persistence:</span>
              <span className="text-slate-200">{formatDuration(inspection.persistenceMs)}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Touch Count:</span>
              <span className="text-slate-200">{inspection.touchCount} times</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Observed Removal:</span>
              <span className={inspection.observedRemoval ? 'text-amber-300' : 'text-slate-400'}>
                {inspection.observedRemoval ? 'Yes' : 'No (Active in Book)'}
              </span>
            </div>
            {inspection.replenishmentCount > 0 && (
              <div className="flex justify-between text-purple-400 font-semibold">
                <span>Replenished:</span>
                <span>{inspection.replenishmentCount} times</span>
              </div>
            )}
          </div>

          {/* Integrity & Diagnostics */}
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1 border-t border-white/5">
            <span className="flex items-center gap-1">
              <ShieldCheck size={11} className={inspection.isValid ? 'text-emerald-400' : 'text-amber-400'} />
              {inspection.isValid ? 'Verified Valid' : 'Unsynchronized'}
            </span>
            <span>
              {inspection.sourceUpdateId ? `Seq #${inspection.sourceUpdateId}` : 'Stream Event'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
