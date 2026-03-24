import { useState, useEffect } from 'react';

export type OS = 'ios' | 'android' | 'desktop';

export function useDeviceOS(): OS {
  const [os, setOs] = useState<OS>(() => {
    if (typeof window === 'undefined') return 'desktop';
    const userAgent = window.navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(userAgent)) return 'ios';
    if (/android/.test(userAgent)) return 'android';
    return 'desktop';
  });

  useEffect(() => {
    // No need for setOs here as it's already initialized
  }, []);

  return os;
}
