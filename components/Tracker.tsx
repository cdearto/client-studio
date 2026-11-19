'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { startTracking } from '@/lib/tracker.ts';

/** Installs the tracker once and records a pageview on every route change. */
export function Tracker() {
  const pathname = usePathname();
  const tracker = useRef<{ pageview: () => void; last: string } | null>(null);
  useEffect(() => {
    tracker.current ??= { pageview: startTracking('/api/track'), last: '' };
    if (tracker.current.last === pathname) return;   // React dev mode runs effects twice
    tracker.current.last = pathname;
    tracker.current.pageview();
  }, [pathname]);
  return null;
}
