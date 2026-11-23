/**
 * J.A.R.V.I.S - Cyber Security Gateway
 * High-Tech Holographic Access Interface & 12-Hour Session Expiry Matrix
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
  Volume2,
  VolumeX,
  Cpu,
  Radio,
  Clock,
  ArrowRight,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { AuthService } from '../../services/auth/AuthService';
import { cyberAudio } from '../../utils/cyberAudio';
import './JarvisGatekeeper.css';

interface JarvisGatekeeperProps {
  onAuthenticated: () => void;
}

export const JarvisGatekeeper: React.FC<JarvisGatekeeperProps> = ({ onAuthenticated }) => {
  const [passcode, setPasscode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isGranted, setIsGranted] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [isMuted, setIsMuted] = useState(() => cyberAudio.isMuted());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Real-time military clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-GB', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      setCurrentTime(timeStr);
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleToggleSound = () => {
    const newMuted = cyberAudio.toggleMute();
    setIsMuted(newMuted);
    if (!newMuted) {
      cyberAudio.playKeyClick(1600);
    }
  };

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isGranted) return;

    if (!passcode.trim()) {
      cyberAudio.playKeyClick(600);
      return;
    }

    const result = AuthService.verifyPasscode(passcode);

    if (result.success) {
      // ACCESS GRANTED
      setErrorMessage(null);
      setIsGranted(true);
      cyberAudio.playAccessGranted();

      // Smooth delay for hyper-drive startup animation before loading terminal
      setTimeout(() => {
        onAuthenticated();
      }, 1200);
    } else {
      // ULTRON DETECTED - DENIAL
      cyberAudio.playUltronAlert();
      setErrorMessage(result.error || 'you are ultron i wont let u in');
      setIsShaking(true);

      setTimeout(() => {
        setIsShaking(false);
        inputRef.current?.select();
      }, 500);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPasscode(e.target.value);
    cyberAudio.playKeyClick(1300 + Math.random() * 200);
    if (errorMessage) {
      setErrorMessage(null);
    }
  };

  return (
    <div className="jarvis-gatekeeper">
      {/* ============================================================ */}
      {/* 1. TOP HUD HEADER                                             */}
      {/* ============================================================ */}
      <header className="gate-hud-header">
        <div className="gate-brand">
          <div className="gate-brand-icon">
            <Cpu size={18} />
          </div>
          <div className="gate-brand-title">
            <span>J.A.R.V.I.S</span>
            <span className="gate-brand-sub">QUANTUM NEURAL INTERFACE</span>
          </div>
        </div>

        <div className="gate-status-pills">
          <div className="gate-pill live-pulse" title="System Defense Armed">
            <span className="status-dot" />
            <span>GRID: ARMED</span>
          </div>

          <div className="gate-pill" title="Digital Military Clock">
            <Clock size={11} color="#00e5ff" />
            <span>{currentTime || '00:00:00'} IST</span>
          </div>

          <button
            type="button"
            className="gate-action-icon-btn"
            onClick={handleToggleSound}
            title={isMuted ? 'Unmute Audio SFX' : 'Mute Audio SFX'}
          >
            {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} color="#00e5ff" />}
          </button>

          <button
            type="button"
            className="gate-action-icon-btn"
            onClick={handleToggleFullscreen}
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </header>

      {/* ============================================================ */}
      {/* 2. CENTRAL AUTHENTICATION PORTAL                             */}
      {/* ============================================================ */}
      <main className="gate-center-wrapper">
        {/* Holographic Arc Reactor Visualizer */}
        <div
          className={`arc-reactor-container ${errorMessage ? 'ultron-alert' : ''} ${
            isGranted ? 'granted' : ''
          }`}
        >
          <svg className="arc-svg" viewBox="0 0 160 160">
            {/* Outer Cardinal Ring */}
            <circle
              className="arc-ring-outer"
              cx="80"
              cy="80"
              r="72"
              fill="none"
              strokeWidth="1.5"
              strokeDasharray="6 8 2 8"
            />
            {/* Middle Segmented Ring */}
            <circle
              className="arc-ring-middle"
              cx="80"
              cy="80"
              r="58"
              fill="none"
              strokeWidth="2.5"
              strokeDasharray="24 16 10 16"
            />
            {/* Inner High-Frequency Ring */}
            <circle
              className="arc-ring-inner"
              cx="80"
              cy="80"
              r="44"
              fill="none"
              strokeWidth="2"
              strokeDasharray="4 6"
            />
          </svg>

          {/* Central Pulsing Arc Core */}
          <div className="arc-core-center">
            {errorMessage ? (
              <ShieldAlert size={26} color="#ffffff" />
            ) : isGranted ? (
              <ShieldCheck size={28} color="#ffffff" />
            ) : (
              <Lock size={22} color="#000000" />
            )}
          </div>
        </div>

        {/* Futuristic Audio/Frequency Waveform Bars */}
        <div className="gate-waveform-bars">
          {Array.from({ length: 10 }).map((_, idx) => (
            <div key={idx} className="waveform-bar" />
          ))}
        </div>

        {/* Security Card */}
        <div
          className={`gate-card ${isShaking ? 'card-ultron-shake' : ''} ${
            isGranted ? 'card-granted' : ''
          }`}
        >
          <div className="gate-card-header">
            <div className="gate-security-badge">
              <Radio size={10} />
              <span>CLASSIFIED // LEVEL 9 PROTOCOL</span>
            </div>
            {/* Name is strictly J.A.R.V.I.S */}
            <h1 className="gate-card-title">J.A.R.V.I.S</h1>
            <p className="gate-card-subtitle">
              STARK QUANTUM AI SYSTEM &bull; ACCESS PASSCODE VERIFICATION
            </p>
          </div>

          {/* Ultron Intruder Warning Alert */}
          {errorMessage && (
            <div className="ultron-alert-box" role="alert">
              <ShieldAlert size={20} className="ultron-alert-icon" />
              <div>
                <div className="ultron-alert-title">SECURITY BREACH // INTRUSION PREVENTED</div>
                <div className="ultron-alert-text">"{errorMessage}"</div>
              </div>
            </div>
          )}

          {/* Access Granted Welcome */}
          {isGranted && (
            <div className="granted-alert-box">
              <div className="granted-alert-title">
                <ShieldCheck size={16} />
                <span>ACCESS GRANTED // INITIALIZING J.A.R.V.I.S...</span>
              </div>
              <div className="granted-progress-bar">
                <div className="granted-progress-fill" />
              </div>
            </div>
          )}

          {/* Passcode Entry Form */}
          <form className="gate-form" onSubmit={handleSubmit}>
            <div className="gate-input-wrapper">
              <Lock size={16} className="gate-input-icon" />
              <input
                ref={inputRef}
                type={showPassword ? 'text' : 'password'}
                className="gate-input"
                placeholder="Enter security passcode..."
                value={passcode}
                onChange={handleInputChange}
                disabled={isGranted}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                className="gate-input-toggle-btn"
                onClick={() => {
                  setShowPassword(!showPassword);
                  cyberAudio.playKeyClick(1500);
                }}
                title={showPassword ? 'Hide passcode' : 'Show passcode'}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <button
              type="submit"
              className="gate-submit-btn"
              disabled={isGranted || !passcode.trim()}
            >
              <span>{isGranted ? 'AUTHENTICATED' : 'INITIALIZE SYSTEM'}</span>
              <ArrowRight size={14} />
            </button>
          </form>

          {/* 12-Hour Expiry Policy Notice */}
          <div className="gate-session-notice">
            <div className="gate-session-badge">
              <Lock size={11} />
              <span>12-Hour Secure Session</span>
            </div>
            <span>Passcode challenge recurs every 12hrs</span>
          </div>
        </div>
      </main>

      {/* ============================================================ */}
      {/* 3. BOTTOM HUD FOOTER                                         */}
      {/* ============================================================ */}
      <footer className="gate-hud-footer">
        <div className="gate-footer-telemetry">
          <div className="gate-telemetry-item">
            <span>CIPHER:</span>
            <span className="highlight">SHA-256 QUANTUM</span>
          </div>
          <div className="gate-telemetry-item">
            <span>SESSION LIFETIME:</span>
            <span className="highlight">12 HOURS</span>
          </div>
          <div className="gate-telemetry-item">
            <span>STATUS:</span>
            <span className="highlight">ARMED</span>
          </div>
        </div>

        <div className="gate-telemetry-item">
          <span>J.A.R.V.I.S</span>
        </div>
      </footer>
    </div>
  );
};
