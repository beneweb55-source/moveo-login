"use client";

import { useEffect, useRef, useCallback } from 'react';

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
    let sessionId = localStorage.getItem('anon_session_id');
    if (!sessionId) {
      sessionId = `anon_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
      localStorage.setItem('anon_session_id', sessionId);
    }
    sessionIdRef.current = sessionId;
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
        season: season || null,
        episode: episode || null,
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
      // Only count if page is visible AND user has been active recently
      if (document.visibilityState === 'visible' && isActiveRef.current) {
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
  }, [saveWatchTime]);

  return null; // Invisible component
};

export default WatchTimer;
