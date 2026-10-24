/**
 * JARVIS Feature Flags & Cloud Storage Configuration
 * Controls gradual rollout and safe fallback between cloud backend and legacy IndexedDB.
 */

export interface FeatureConfig {
  useBackendStorage: boolean;
  activeWorkingSetSize: number;
  dprLimit: number;
  enableIdbSliceDumping: boolean;
  historyPagingChunkSize: number;
}

export const FEATURES: FeatureConfig = {
  // Primary flag: when true, routes historical candle queries through SQLite/Redis backend API
  useBackendStorage: true,

  // Bound browser candle memory: keep 300 active candles in state instead of 1000+
  activeWorkingSetSize: 300,

  // Device pixel ratio limit for canvas overlays on mobile (avoids 60MB+ GPU texture memory)
  dprLimit: 2.0,

  // Disables client-side dumping of 14,400 raw depth slices/hour into browser IndexedDB
  enableIdbSliceDumping: false,

  // Chunk size when scrolling backward in history (infinite scroll paging)
  historyPagingChunkSize: 200,
};

let isBackendAvailable: boolean | null = null;
let lastCheckTime = 0;

/**
 * Check if the backend API is live and responsive (< 1500ms timeout)
 * Automatically falls back to legacy client path if backend is down.
 */
export async function checkBackendHealth(): Promise<boolean> {
  const now = Date.now();
  // Cache health check result for 10 seconds
  if (isBackendAvailable !== null && now - lastCheckTime < 10000) {
    return isBackendAvailable;
  }

  try {
    const res = await fetch('/api/health', {
      signal: AbortSignal.timeout(1500),
    });
    if (res.ok) {
      const data = await res.json();
      isBackendAvailable = data.status === 'ok';
      lastCheckTime = now;
      return isBackendAvailable;
    }
  } catch {
    // Backend unreachable
  }

  isBackendAvailable = false;
  lastCheckTime = now;
  return false;
}

/**
 * Check if backend storage path should be used for this query
 */
export async function shouldUseBackendStorage(): Promise<boolean> {
  if (!FEATURES.useBackendStorage) return false;
  return checkBackendHealth();
}
