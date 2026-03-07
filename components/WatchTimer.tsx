"use client";

import { useEffect, useRef, useCallback } from 'react';

interface WatchTimerProps {
  mediaType: string;
  mediaId: string | number;
}

const WatchTimer = ({ mediaType, mediaId }: WatchTimerProps) => {
  const minutesRef = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const saveWatchTime = useCallback(async (minutes: number) => {
    try {
      await fetch('/api/watch-time', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          media_type: mediaType,
          media_id: mediaId,
          minutes: minutes,
        }),
      });
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
        saveWatchTime(minutesRef.current);
      }
    };
  }, [saveWatchTime]);

  return null; // Invisible component
};

export default WatchTimer;
