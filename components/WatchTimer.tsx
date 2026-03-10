"use client";

import { useEffect, useRef, useCallback } from 'react';

interface WatchTimerProps {
  mediaType: string;
  mediaId: string | number;
}

const WatchTimer = ({ mediaType, mediaId }: WatchTimerProps) => {
  const minutesRef = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    let sessionId = localStorage.getItem('anon_session_id');
    if (!sessionId) {
      sessionId = `anon_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
      localStorage.setItem('anon_session_id', sessionId);
    }
    sessionIdRef.current = sessionId;
  }, []);

  const saveWatchTime = useCallback((minutes: number, isUnmount: boolean = false) => {
    try {
      const payload = JSON.stringify({
        media_type: mediaType,
        media_id: mediaId,
        minutes: minutes,
        session_id: sessionIdRef.current,
      });

      if (isUnmount && navigator.sendBeacon) {
        const blob = new Blob([payload], { type: 'application/json' });
        const success = navigator.sendBeacon('/api/watch-time', blob);
        if (!success) {
          fetch('/api/watch-time', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: payload,
            keepalive: true,
          });
        }
      } else {
        fetch('/api/watch-time', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: payload,
          keepalive: isUnmount,
        });
      }
    } catch (error) {
      console.error('Failed to save watch time:', error);
    }
  }, [mediaType, mediaId]);

  useEffect(() => {
    // Start interval
    intervalRef.current = setInterval(() => {
      if (document.visibilityState === 'visible') {
        minutesRef.current += 1;
        
        // Every 5 minutes, save to DB
        if (minutesRef.current % 5 === 0) {
          saveWatchTime(5);
          minutesRef.current = 0; // Reset local counter after save
        }
      }
    }, 60000); // 60 seconds

    return () => {
      // Clear interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      // Save remaining minutes on unmount
      if (minutesRef.current > 0) {
        saveWatchTime(minutesRef.current, true);
      }
    };
  }, [saveWatchTime]);

  return null; // Invisible component
};

export default WatchTimer;
