/**
 * J.A.R.V.I.S - Security & Access Protocol
 * Enforces Stark Industries Passcode Verification & 12-Hour Session Expiry
 */

export const JARVIS_PASSCODE = 'Loveu3000';
export const ULTRON_DENIAL_MESSAGE = 'you are ultron i wont let u in';
export const SESSION_DURATION_MS = 12 * 60 * 60 * 1000; // 12 hours in milliseconds
const STORAGE_KEY = 'jarvis_auth_session';

export interface JarvisAuthSession {
  authenticated: boolean;
  loginTimestamp: number;
  expiresAt: number;
}

export interface VerificationResult {
  success: boolean;
  message?: string;
  error?: string;
}

function getLocalStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
  } catch {}
  return null;
}

export class AuthService {
  /**
   * Check if current session is authenticated and within 24-hour validity window
   */
  public static checkIsAuthenticated(): boolean {
    const storage = getLocalStorage();
    if (!storage) return false;

    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return false;

      const session: JarvisAuthSession = JSON.parse(raw);
      if (!session || !session.authenticated || !session.expiresAt) {
        this.logout();
        return false;
      }

      const now = Date.now();
      if (now >= session.expiresAt) {
        // Expired after 24 hours
        this.logout();
        return false;
      }

      return true;
    } catch {
      this.logout();
      return false;
    }
  }

  /**
   * Verify passcode and create a 24-hour persistent session if correct
   */
  public static verifyPasscode(inputCode: string): VerificationResult {
    const trimmed = inputCode.trim();

    if (trimmed === JARVIS_PASSCODE) {
      const now = Date.now();
      const session: JarvisAuthSession = {
        authenticated: true,
        loginTimestamp: now,
        expiresAt: now + SESSION_DURATION_MS,
      };

      const storage = getLocalStorage();
      if (storage) {
        try {
          storage.setItem(STORAGE_KEY, JSON.stringify(session));
        } catch (err) {
          console.warn('Failed to persist Jarvis session to localStorage:', err);
        }
      }

      return {
        success: true,
        message: 'IDENTITY CONFIRMED: WELCOME BACK, SIR.',
      };
    }

    // Invalid passcode - Ultron intruder detected
    return {
      success: false,
      error: ULTRON_DENIAL_MESSAGE,
    };
  }

  /**
   * Invalidate session immediately
   */
  public static logout(): void {
    const storage = getLocalStorage();
    if (!storage) return;
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {}
  }

  /**
   * Get session data including remaining time
   */
  public static getSessionInfo(): {
    isAuthenticated: boolean;
    remainingMs: number;
    loginTime: Date | null;
    expiresTime: Date | null;
  } {
    const storage = getLocalStorage();
    if (!storage) {
      return { isAuthenticated: false, remainingMs: 0, loginTime: null, expiresTime: null };
    }

    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) {
        return { isAuthenticated: false, remainingMs: 0, loginTime: null, expiresTime: null };
      }

      const session: JarvisAuthSession = JSON.parse(raw);
      const now = Date.now();
      const remaining = session.expiresAt - now;

      if (remaining <= 0 || !session.authenticated) {
        return { isAuthenticated: false, remainingMs: 0, loginTime: null, expiresTime: null };
      }

      return {
        isAuthenticated: true,
        remainingMs: remaining,
        loginTime: new Date(session.loginTimestamp),
        expiresTime: new Date(session.expiresAt),
      };
    } catch {
      return { isAuthenticated: false, remainingMs: 0, loginTime: null, expiresTime: null };
    }
  }
}
