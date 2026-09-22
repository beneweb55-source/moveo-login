"use client";

import { useEffect, useRef, useCallback } from 'react';
import { getAnonSessionId } from '@/utils/historyManager';
import { hasPlaybackBeenObserved } from '@/lib/playbackSignal';

interface WatchTimerProps {
  mediaType: string;
  mediaId: string | number;
  title?: string;
  posterPath?: string;
  season?: number;
  episode?: number;
}

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const SAVE_INTERVAL_MINUTES = 5;

const WatchTimer = ({ mediaType, mediaId, title, posterPath, season, episode }: WatchTimerProps) => {
  const minutesRef = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const lastActivityRef = useRef(0);
  const isActiveRef = useRef(true);

  useEffect(() => {
    lastActivityRef.current = Date.now();
    // The key has ONE owner: utils/historyManager.ts, which is also the code
    // that sends it. A second inline copy of the same literal here was a
    // contract with nothing holding it together — renaming the key on one side
    // would have looked like a working build and silently split the identity.
    sessionIdRef.current = getAnonSessionId();
  }, []);

  // Track user activity to detect inactivity
  useEffect(() => {
    const handleActivity = () => {
      lastActivityRef.current = Date.now();
      isActiveRef.current = true;
    };

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(event => window.addEventListener(event, handleActivity, { passive: true }));

    // Periodically check inactivity
    const inactivityCheck = setInterval(() => {
      if (Date.now() - lastActivityRef.current > INACTIVITY_TIMEOUT_MS) {
        isActiveRef.current = false;
      }
    }, 60000); // Check every minute

    return () => {
      events.forEach(event => window.removeEventListener(event, handleActivity));
      clearInterval(inactivityCheck);
    };
  }, []);

  const saveWatchTime = useCallback((minutes: number, isUnmount: boolean = false) => {
    if (minutes <= 0) return;
    
    try {
      const payload = JSON.stringify({
        media_type: mediaType,
        media_id: mediaId,
        minutes: minutes,
        session_id: sessionIdRef.current,
        title: title || null,
        poster_path: posterPath || null,
        // OMITTED, not nulled, when the mount site does not supply them.
        // /api/watch-time reads a NUMERIC season/episode as "the caller is
        // telling me where the viewer is"; a `null` would be indistinguishable
        // from that statement with an empty value. This path must never touch
        // progression — a minute count is not a position — and leaving the
        // fields out of the payload is how it says so. `??` is still avoided in
        // favour of a typeof test because season 0 is TMDB's SPECIALS season and
        // is a real value.
        ...(typeof season === 'number' ? { season } : {}),
        ...(typeof episode === 'number' ? { episode } : {}),
      });

      if (isUnmount && navigator.sendBeacon) {
        const blob = new Blob([payload], { type: 'application/json' });
        const success = navigator.sendBeacon('/api/watch-time', blob);
        if (!success) {
          fetch('/api/watch-time', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            keepalive: true,
          });
        }
      } else {
        fetch('/api/watch-time', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: isUnmount,
        });
      }
    } catch (error) {
      console.error('Failed to save watch time:', error);
    }
  }, [mediaType, mediaId, title, posterPath, season, episode]);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      // Count a minute only when the page is visible, the viewer has been active
      // recently, AND something has actually played.
      //
      // The third condition is the fix, and it is not cosmetic. Before it, this
      // interval counted page-presence as viewing: a tab left open on a detail
      // page accrued an hour of "watch time", and because the write also bumps
      // `last_updated` it pushed that title above what the viewer was actually
      // watching in the resume list. The signal it reads is set by VideoPlayer
      // only after a position has passed every validation check, so an iframe
      // that merely loaded still counts for nothing — which is what §13 asks
      // for.
      if (
        document.visibilityState === 'visible' &&
        isActiveRef.current &&
        hasPlaybackBeenObserved(mediaType, mediaId)
      ) {
        minutesRef.current += 1;

        if (minutesRef.current % SAVE_INTERVAL_MINUTES === 0) {
          saveWatchTime(SAVE_INTERVAL_MINUTES);
          minutesRef.current = 0;
        }
      }
    }, 60000); // 60 seconds

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (minutesRef.current > 0) {
        saveWatchTime(minutesRef.current, true);
      }
    };
    // `mediaType`/`mediaId` are listed because the interval reads them directly
    // to ask whether playback was observed for THIS title. `saveWatchTime`
    // already changes with them, so this is belt-and-braces for the linter and
    // makes the dependency the code actually has visible at the call site.
  }, [saveWatchTime, mediaType, mediaId]);

  return null; // Invisible component
};

export default WatchTimer;
