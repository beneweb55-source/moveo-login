"use client";

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function PingTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const ping = async () => {
      try {
        await fetch('/api/ping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPath: pathname })
        });
      } catch (error) {
        console.error('Failed to ping', error);
      }
    };

    ping();
    const interval = setInterval(ping, 30000); // Ping every 30 seconds

    return () => clearInterval(interval);
  }, [pathname]);

  return null;
}
