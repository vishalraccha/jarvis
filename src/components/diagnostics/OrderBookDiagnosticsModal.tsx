/**
 * Order Book Diagnostics & Sequence Validation Inspector
 * Mathematical validation & live level inspection
 * JARVIS HEATMAP TERMINAL
 */

import React, { useState, useEffect } from 'react';
import { X, RefreshCw, CheckCircle, AlertTriangle, ShieldCheck } from 'lucide-react';
import { OrderBookManager, OrderBookStats } from '../../services/orderbook/OrderBookManager';
import { LatencyMetrics } from '../../types/market';
import { formatPrice, formatQuantity } from '../../utils/formatters';

interface OrderBookDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderBook: OrderBookManager;
  metrics: LatencyMetrics;
  onTriggerResync: () => void;
}

export const OrderBookDiagnosticsModal: React.FC<OrderBookDiagnosticsModalProps> = ({
  isOpen,
  onClose,
  orderBook,
  metrics,
  onTriggerResync,
}) => {
  const [stats, setStats] = useState<OrderBookStats>(orderBook.getStats());

  useEffect(() => {
    if (!isOpen) return;
    const unsub = orderBook.subscribe((newStats) => {
      setStats(newStats);
    });
    return unsub;
  }, [isOpen, orderBook]);

  if (!isOpen) return null;

  const { bids, asks } = orderBook.getDepthProfile(10);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 650 }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={18} color="#00b4d8" />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>
              ORDER BOOK MATHEMATICAL INTEGRITY & RECONSTRUCTION
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Status Row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: 6,
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {stats.syncStatus === 'SYNCHRONIZED' ? (
                <CheckCircle size={18} color="#00e676" />
              ) : (
                <AlertTriangle size={18} color="#ffb300" />
              )}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>
                  STATUS: <span style={{ color: stats.syncStatus === 'SYNCHRONIZED' ? '#00e676' : '#ffb300' }}>{stats.syncStatus}</span>
                </div>
                <div style={{ fontSize: 10, color: '#64748b' }}>
                  Sequence protocol: Binance Spot Depth Snapshot + Incremental Delta Alignment
                </div>
              </div>
            </div>

            <button className="tool-btn" onClick={onTriggerResync} title="Simulate / Trigger Snapshot Resync">
              <RefreshCw size={12} style={{ marginRight: 4 }} />
              Force Resync
            </button>
          </div>

          {/* Metrics Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px 10px', borderRadius: 4 }}>
              <div style={{ fontSize: 10, color: '#64748b' }}>LAST UPDATE ID</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#38bdf8', fontFamily: 'JetBrains Mono' }}>
                {stats.lastUpdateId > 0 ? stats.lastUpdateId : '--'}
              </div>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px 10px', borderRadius: 4 }}>
              <div style={{ fontSize: 10, color: '#64748b' }}>SEQUENCE GAPS</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: stats.sequenceGapsDetected === 0 ? '#00e676' : '#ff2d55', fontFamily: 'JetBrains Mono' }}>
                {stats.sequenceGapsDetected}
              </div>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px 10px', borderRadius: 4 }}>
              <div style={{ fontSize: 10, color: '#64748b' }}>RESYNC COUNT</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#cbd5e1', fontFamily: 'JetBrains Mono' }}>
                {stats.resyncCount}
              </div>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px 10px', borderRadius: 4 }}>
              <div style={{ fontSize: 10, color: '#64748b' }}>TOTAL MESSAGES</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#cbd5e1', fontFamily: 'JetBrains Mono' }}>
                {metrics.totalMessagesProcessed.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Pricing & Spread Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <div style={{ background: 'rgba(0, 230, 118, 0.05)', border: '1px solid rgba(0, 230, 118, 0.2)', padding: '8px 10px', borderRadius: 4 }}>
              <div style={{ fontSize: 10, color: '#00e676' }}>BEST BID</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#00e676', fontFamily: 'JetBrains Mono' }}>
                {formatPrice(stats.bestBid)}
              </div>
              <div style={{ fontSize: 9, color: '#94a3b8' }}>{stats.bidLevelsCount} active levels</div>
            </div>

            <div style={{ background: 'rgba(255, 45, 85, 0.05)', border: '1px solid rgba(255, 45, 85, 0.2)', padding: '8px 10px', borderRadius: 4 }}>
              <div style={{ fontSize: 10, color: '#ff2d55' }}>BEST ASK</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#ff2d55', fontFamily: 'JetBrains Mono' }}>
                {formatPrice(stats.bestAsk)}
              </div>
              <div style={{ fontSize: 9, color: '#94a3b8' }}>{stats.askLevelsCount} active levels</div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '8px 10px', borderRadius: 4 }}>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>SPREAD / MID</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', fontFamily: 'JetBrains Mono' }}>
                {formatPrice(stats.spread)}
              </div>
              <div style={{ fontSize: 9, color: '#94a3b8' }}>Mid: {formatPrice(stats.midPrice)}</div>
            </div>
          </div>

          {/* Order Book Depth Inspector Table (Top 10 Asks & Bids) */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
              LIVE RECONSTRUCTED DEPTH LEVELS (SOURCE ALIGNED)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {/* Top 10 Asks */}
              <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 4, padding: 8, border: '1px solid rgba(255, 45, 85, 0.15)' }}>
                <div style={{ fontSize: 10, color: '#ff2d55', fontWeight: 700, marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                  <span>ASK PRICE</span>
                  <span>QUANTITY</span>
                </div>
                {asks.slice(0, 8).map((a, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'JetBrains Mono', color: '#ff8fa3', lineHeight: '18px' }}>
                    <span>{formatPrice(a.price)}</span>
                    <span>{formatQuantity(a.quantity, 4)}</span>
                  </div>
                ))}
              </div>

              {/* Top 10 Bids */}
              <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 4, padding: 8, border: '1px solid rgba(0, 230, 118, 0.15)' }}>
                <div style={{ fontSize: 10, color: '#00e676', fontWeight: 700, marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                  <span>BID PRICE</span>
                  <span>QUANTITY</span>
                </div>
                {bids.slice(0, 8).map((b, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'JetBrains Mono', color: '#69f0ae', lineHeight: '18px' }}>
                    <span>{formatPrice(b.price)}</span>
                    <span>{formatQuantity(b.quantity, 4)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', textAlign: 'right' }}>
          <button className="tool-btn active" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
