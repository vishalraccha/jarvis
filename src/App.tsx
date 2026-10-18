/**
 * J.A.R.V.I.S - Application Root & Security Orchestrator
 * Controls 12-Hour Access Security Gateway and Mounts Trading Terminal
 */

import React, { useState, useEffect, useCallback } from 'react';
import { JarvisGatekeeper } from './components/auth/JarvisGatekeeper';
import { TradingTerminal } from './components/terminal/TradingTerminal';
import { AuthService } from './services/auth/AuthService';

export const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() =>
    AuthService.checkIsAuthenticated()
  );

  // 1. Verify 12-hour session expiration periodically
  useEffect(() => {
    const verifySession = () => {
      const valid = AuthService.checkIsAuthenticated();
      if (!valid && isAuthenticated) {
        setIsAuthenticated(false);
      }
    };

    // Check every 10 seconds while active
    const timer = setInterval(verifySession, 10000);

    // Also check immediately when window regains focus
    window.addEventListener('focus', verifySession);

    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', verifySession);
    };
  }, [isAuthenticated]);

  // 2. Handle manual lock from top toolbar
  const handleLockTerminal = useCallback(() => {
    AuthService.logout();
    setIsAuthenticated(false);
  }, []);

  const handleAuthenticated = useCallback(() => {
    setIsAuthenticated(true);
  }, []);

  if (!isAuthenticated) {
    return <JarvisGatekeeper onAuthenticated={handleAuthenticated} />;
  }

  return <TradingTerminal onLockTerminal={handleLockTerminal} />;
};

export default App;
