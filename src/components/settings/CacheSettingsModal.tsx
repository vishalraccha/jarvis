/**
 * Historical Cache & IndexedDB Settings Modal
 * JARVIS HEATMAP TERMINAL
 */

import React, { useState, useEffect } from 'react';
import { X, Trash2, Database, RefreshCw, HardDrive } from 'lucide-react';
import { CacheStatus, indexedDBCache } from '../../services/storage/IndexedDBCache';

interface CacheSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReloadHistory: () => void;
}

export const CacheSettingsModal: React.FC<CacheSettingsModalProps> = ({
  isOpen,
  onClose,
  onReloadHistory,
}) => {
  const [status, setStatus] = useState<CacheStatus | null>(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    indexedDBCache.getStatus().then(setStatus);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClear = async () => {
    setClearing(true);
    await indexedDBCache.clearAll();
    const updated = await indexedDBCache.getStatus();
    setStatus(updated);
    setClearing(false);
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
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
            <Database size={16} color="#00b4d8" />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>
              HISTORICAL STORAGE & PERSISTENCE
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5 }}>
            JARVIS HEATMAP caches historical order-book time slices and candlestick OHLC data locally in your browser's IndexedDB. Asynchronous persistence ensures non-blocking 60 FPS live rendering.
          </div>

          {/* Stats Box */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 4 }}>
              <div style={{ fontSize: 10, color: '#64748b' }}>STORED HEATMAP SLICES</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#38bdf8', fontFamily: 'JetBrains Mono' }}>
                {status ? status.totalHeatmapRecords.toLocaleString() : '--'}
              </div>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 4 }}>
              <div style={{ fontSize: 10, color: '#64748b' }}>STORED CANDLES</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#38bdf8', fontFamily: 'JetBrains Mono' }}>
                {status ? status.totalCandleRecords.toLocaleString() : '--'}
              </div>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 4, gridColumn: 'span 2' }}>
              <div style={{ fontSize: 10, color: '#64748b' }}>ESTIMATED DISK USAGE</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', fontFamily: 'JetBrains Mono' }}>
                {status ? formatBytes(status.estimatedSizeBytes) : '--'}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button
              className="tool-btn"
              style={{ flex: 1, height: 32, borderColor: 'rgba(255, 45, 85, 0.4)', color: '#ff8fa3' }}
              onClick={handleClear}
              disabled={clearing}
            >
              <Trash2 size={12} style={{ marginRight: 6 }} />
              Clear Local Cache
            </button>
            <button
              className="tool-btn"
              style={{ flex: 1, height: 32 }}
              onClick={() => {
                onReloadHistory();
                onClose();
              }}
            >
              <RefreshCw size={12} style={{ marginRight: 6 }} />
              Re-Fetch History
            </button>
          </div>
        </div>

        <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', textAlign: 'right' }}>
          <button className="tool-btn active" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
