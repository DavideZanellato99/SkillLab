import { useEffect, useRef } from 'react';

/**
 * Auto-logout after a period of user inactivity, synchronized across tabs.
 *
 * Activity (mouse/keyboard/click/scroll/touch) is tracked locally and
 * shared with the other tabs through a throttled localStorage timestamp:
 * using one tab keeps every tab "active". A periodic check (instead of
 * resetting a timer on every mousemove) fires the logout when the last
 * activity — local or remote — is older than the timeout. The tab that
 * fires broadcasts it via localStorage so the other tabs drop their
 * session state without repeating the API call.
 */

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const CHECK_INTERVAL_MS = 30 * 1000;
/* Cross-tab writes are throttled: sub-5s precision is irrelevant on a
 * 30-minute timeout and this keeps mousemove handlers cheap */
const ACTIVITY_WRITE_THROTTLE_MS = 5 * 1000;

const ACTIVITY_KEY = 'skilllab_last_activity';
const LOGOUT_KEY = 'skilllab_idle_logout';

const ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'click',
  'wheel',
  'scroll',
  'touchstart',
  'touchmove',
] as const;

interface UseIdleLogoutOptions {
  /** Track and enforce only while a session exists. */
  enabled: boolean;
  /** This tab hit the timeout: perform the real logout (API + state). */
  onIdle: () => void;
  /** Another tab already logged the session out: just drop local state. */
  onRemoteLogout: () => void;
}

export function useIdleLogout({ enabled, onIdle, onRemoteLogout }: UseIdleLogoutOptions): void {
  // Refs keep the effect independent from callback identities
  const onIdleRef = useRef(onIdle);
  const onRemoteLogoutRef = useRef(onRemoteLogout);
  onIdleRef.current = onIdle;
  onRemoteLogoutRef.current = onRemoteLogout;

  useEffect(() => {
    if (!enabled) return;

    let lastActivity = Date.now();
    let lastWrite = 0;
    let fired = false;

    // Opening/logging into a tab counts as activity for every tab
    try {
      localStorage.setItem(ACTIVITY_KEY, String(lastActivity));
    } catch {
      // Storage unavailable (private mode quota...): local tracking still works
    }

    const recordActivity = () => {
      lastActivity = Date.now();
      if (lastActivity - lastWrite >= ACTIVITY_WRITE_THROTTLE_MS) {
        lastWrite = lastActivity;
        try {
          localStorage.setItem(ACTIVITY_KEY, String(lastActivity));
        } catch {
          // ignore
        }
      }
    };

    const checkIdle = () => {
      if (fired || Date.now() - lastActivity < IDLE_TIMEOUT_MS) return;
      fired = true;
      // Tell the other tabs first, then log out for real
      try {
        localStorage.setItem(LOGOUT_KEY, String(Date.now()));
      } catch {
        // ignore
      }
      onIdleRef.current();
    };

    // storage events only fire in the OTHER tabs — exactly what we need
    const handleStorage = (e: StorageEvent) => {
      if (e.key === ACTIVITY_KEY && e.newValue) {
        const ts = Number(e.newValue);
        if (Number.isFinite(ts) && ts > lastActivity) {
          lastActivity = ts;
        }
      } else if (e.key === LOGOUT_KEY && e.newValue && !fired) {
        fired = true;
        onRemoteLogoutRef.current();
      }
    };

    // Re-check as soon as the tab comes back to the foreground: interval
    // timers are throttled (or frozen) in background tabs
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') checkIdle();
    };

    for (const evt of ACTIVITY_EVENTS) {
      // capture: nested-container scrolls don't bubble to window
      window.addEventListener(evt, recordActivity, { passive: true, capture: true });
    }
    window.addEventListener('storage', handleStorage);
    document.addEventListener('visibilitychange', handleVisibility);
    const interval = window.setInterval(checkIdle, CHECK_INTERVAL_MS);

    return () => {
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, recordActivity, { capture: true });
      }
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearInterval(interval);
    };
  }, [enabled]);
}
