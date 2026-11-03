import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[JARVIS ErrorBoundary] Caught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleHardReset = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      indexedDB.deleteDatabase('jarvis_heatmap_cache_v1');
    } catch {}
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            width: '100vw',
            background: '#090d16',
            color: '#f8fafc',
            fontFamily: 'Inter, sans-serif',
            padding: 24,
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              maxWidth: 540,
              width: '100%',
              background: 'rgba(15, 23, 42, 0.95)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: 12,
              padding: 28,
              boxShadow: '0 20px 40px rgba(0,0,0,0.8), 0 0 30px rgba(239,68,68,0.15)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                color: '#ef4444',
              }}
            >
              <AlertTriangle size={28} />
            </div>

            <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, letterSpacing: '0.04em' }}>
              J.A.R.V.I.S Subsystem Anomaly
            </h2>
            <p style={{ margin: '0 0 20px', color: '#94a3b8', fontSize: 13, lineHeight: 1.5 }}>
              A graphics or pipeline exception occurred. Click below to recover without losing your session.
            </p>

            {this.state.error && (
              <pre
                style={{
                  background: 'rgba(0,0,0,0.5)',
                  padding: 12,
                  borderRadius: 6,
                  color: '#fca5a5',
                  fontSize: 11,
                  textAlign: 'left',
                  overflowX: 'auto',
                  maxHeight: 120,
                  marginBottom: 20,
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                }}
              >
                {this.state.error.message}
              </pre>
            )}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={this.handleReset}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 18px',
                  background: '#0284c7',
                  border: 'none',
                  borderRadius: 6,
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <RefreshCw size={15} /> Resume Engine
              </button>

              <button
                onClick={this.handleHardReset}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 18px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  borderRadius: 6,
                  color: '#fca5a5',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <Trash2 size={15} /> Reset Local Cache
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
