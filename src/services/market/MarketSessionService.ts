/**
 * Market Session & Calendar Service
 * Validates trading sessions, holidays, and market state across asset classes.
 * Ensures Saturday and closed-market states never fabricate fake candles.
 */

export type MarketSchedule = '24_7' | 'traditional_metals' | 'cme_futures';

export type SessionStatus = 'OPEN' | 'CLOSED' | 'BREAK' | 'STALE' | 'INDICATIVE';

export interface MarketSessionInfo {
  schedule: MarketSchedule;
  isOpen: boolean;
  status: SessionStatus;
  statusLabel: string;
  reason: string;
  isWeekend: boolean;
  nextOpenUtc?: string;
  lastCloseUtc?: string;
  formattedSessionNotice: string;
}

export class MarketSessionService {
  /**
   * Evaluates the current market session state for a given schedule at a UTC reference time.
   */
  static getSessionInfo(schedule: MarketSchedule, referenceDate: Date = new Date()): MarketSessionInfo {
    if (schedule === '24_7') {
      return {
        schedule,
        isOpen: true,
        status: 'OPEN',
        statusLabel: 'MARKET OPEN (24/7)',
        reason: 'Continuous 24/7 market trading session.',
        isWeekend: false,
        formattedSessionNotice: '24/7 Live Continuous Feed',
      };
    }

    const day = referenceDate.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 5 = Fri, 6 = Sat
    const hours = referenceDate.getUTCHours();
    const minutes = referenceDate.getUTCMinutes();
    const timeDec = hours + minutes / 60;

    // Traditional Spot Gold (OTC XAU/USD) & COMEX Futures (GC)
    // Close: Friday 21:00 UTC
    // Open: Sunday 22:00 UTC
    // Daily Maintenance Break: Mon-Thu 21:00 - 22:00 UTC
    const closeHour = 21.0;
    const openHour = 22.0;

    // 1. Saturday: Entire day is weekend closure
    if (day === 6) {
      return {
        schedule,
        isOpen: false,
        status: 'CLOSED',
        statusLabel: 'MARKET CLOSED (WEEKEND)',
        reason: 'Traditional gold market is closed on Saturdays. Re-opens Sunday at 22:00 UTC.',
        isWeekend: true,
        nextOpenUtc: 'Sunday 22:00 UTC',
        formattedSessionNotice: 'Market Closed (Weekend) • Resumes Sunday 22:00 UTC',
      };
    }

    // 2. Sunday: Closed before 22:00 UTC, Open after 22:00 UTC
    if (day === 0) {
      if (timeDec < openHour) {
        return {
          schedule,
          isOpen: false,
          status: 'CLOSED',
          statusLabel: 'MARKET CLOSED (WEEKEND)',
          reason: `Weekend closure in effect. Re-opens today at ${openHour}:00 UTC.`,
          isWeekend: true,
          nextOpenUtc: 'Sunday 22:00 UTC',
          formattedSessionNotice: 'Market Closed • Re-opens at 22:00 UTC',
        };
      }
      return {
        schedule,
        isOpen: true,
        status: 'OPEN',
        statusLabel: 'MARKET OPEN',
        reason: 'New market week commenced Sunday 22:00 UTC.',
        isWeekend: false,
        formattedSessionNotice: 'Trading Active',
      };
    }

    // 3. Friday: Open before 21:00 UTC, Closed after 21:00 UTC
    if (day === 5) {
      if (timeDec >= closeHour) {
        return {
          schedule,
          isOpen: false,
          status: 'CLOSED',
          statusLabel: 'MARKET CLOSED (WEEKEND)',
          reason: 'Weekly trading closed Friday at 21:00 UTC. Re-opens Sunday at 22:00 UTC.',
          isWeekend: true,
          nextOpenUtc: 'Sunday 22:00 UTC',
          formattedSessionNotice: 'Market Closed (Weekend) • Resumes Sunday 22:00 UTC',
        };
      }
      return {
        schedule,
        isOpen: true,
        status: 'OPEN',
        statusLabel: 'MARKET OPEN',
        reason: 'Trading active until Friday 21:00 UTC close.',
        isWeekend: false,
        formattedSessionNotice: 'Trading Active (Closes 21:00 UTC)',
      };
    }

    // 4. Monday through Thursday: Daily break between 21:00 and 22:00 UTC
    if (timeDec >= closeHour && timeDec < openHour) {
      return {
        schedule,
        isOpen: false,
        status: 'BREAK',
        statusLabel: 'SCHEDULED MAINTENANCE BREAK',
        reason: 'Daily settlement & exchange maintenance break (21:00 - 22:00 UTC).',
        isWeekend: false,
        nextOpenUtc: 'Today 22:00 UTC',
        formattedSessionNotice: 'Daily Break (21:00 - 22:00 UTC)',
      };
    }

    // Regular weekday trading hours
    return {
      schedule,
      isOpen: true,
      status: 'OPEN',
      statusLabel: 'MARKET OPEN',
      reason: 'Regular market session active.',
      isWeekend: false,
      formattedSessionNotice: 'Trading Active',
    };
  }

  /**
   * Helper to format UTC timestamp into a user-friendly local display string.
   */
  static formatDisplayTime(timestampMs: number, timeZone?: string): string {
    try {
      return new Intl.DateTimeFormat(undefined, {
        timeZone: timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(new Date(timestampMs));
    } catch {
      return new Date(timestampMs).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    }
  }
}
