import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService, JARVIS_PASSCODE, ULTRON_DENIAL_MESSAGE, SESSION_DURATION_MS } from '../services/auth/AuthService';

// In-memory mock storage for vitest node environment
class MockStorage implements Storage {
  private store: Map<string, string> = new Map();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] || null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

const mockLocalStorage = new MockStorage();
Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

describe('Jarvis 2.0 Security Gateway & Authentication Protocol', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    vi.restoreAllMocks();
  });

  it('rejects incorrect passcode with Ultron warning message', () => {
    const wrongAttempt = AuthService.verifyPasscode('Secret123');
    expect(wrongAttempt.success).toBe(false);
    expect(wrongAttempt.error).toBe(ULTRON_DENIAL_MESSAGE);
    expect(wrongAttempt.error).toBe('you are ultron i wont let u in');
    expect(AuthService.checkIsAuthenticated()).toBe(false);
  });

  it('accepts valid passcode Loveu3000 and activates session', () => {
    const validAttempt = AuthService.verifyPasscode(JARVIS_PASSCODE);
    expect(validAttempt.success).toBe(true);
    expect(validAttempt.message).toBe('IDENTITY CONFIRMED: WELCOME BACK, SIR.');
    expect(AuthService.checkIsAuthenticated()).toBe(true);
  });

  it('handles passcode with surrounding whitespace correctly', () => {
    const attempt = AuthService.verifyPasscode('   Loveu3000   ');
    expect(attempt.success).toBe(true);
    expect(AuthService.checkIsAuthenticated()).toBe(true);
  });

  it('enforces 12-hour session expiration policy', () => {
    const startTime = 1700000000000;
    vi.setSystemTime(startTime);

    // Login successfully at startTime
    const result = AuthService.verifyPasscode('Loveu3000');
    expect(result.success).toBe(true);
    expect(AuthService.checkIsAuthenticated()).toBe(true);

    // After 11 hours 59 minutes: Still authenticated
    vi.setSystemTime(startTime + (11 * 3600 + 59 * 60) * 1000);
    expect(AuthService.checkIsAuthenticated()).toBe(true);

    // After 12 hours + 1 second: Session MUST expire
    vi.setSystemTime(startTime + SESSION_DURATION_MS + 1000);
    expect(AuthService.checkIsAuthenticated()).toBe(false);
  });

  it('clears session upon manual logout', () => {
    AuthService.verifyPasscode('Loveu3000');
    expect(AuthService.checkIsAuthenticated()).toBe(true);

    AuthService.logout();
    expect(AuthService.checkIsAuthenticated()).toBe(false);
  });

  it('provides accurate remaining session info', () => {
    const startTime = 1700000000000;
    vi.setSystemTime(startTime);

    AuthService.verifyPasscode('Loveu3000');

    // Fast-forward 10 hours (out of 12 hours)
    vi.setSystemTime(startTime + 10 * 3600 * 1000);
    const info = AuthService.getSessionInfo();

    expect(info.isAuthenticated).toBe(true);
    expect(info.remainingMs).toBe(2 * 3600 * 1000);
  });
});
