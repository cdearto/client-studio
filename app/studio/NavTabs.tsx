'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

const TABS = [['/studio', 'Schedule'], ['/studio/clients', 'Clients'], ['/studio/hours', 'Hours'], ['/studio/newsletter', 'Newsletter'],
  ['/studio/templates', 'Templates'], ['/studio/analytics', 'Analytics']] as const;

export function NavTabs() {
  const path = usePathname();
  const nav = useRef<HTMLElement>(null);
  const active = (href: string) => (href === '/studio' ? path === '/studio' || path.startsWith('/studio/packages') : path.startsWith(href));
  // On a phone the tab bar scrolls sideways; keep the current tab in view.
  useEffect(() => {
    const n = nav.current, a = n?.querySelector<HTMLElement>('a.on');
    if (n && a && a.offsetLeft + a.offsetWidth > n.scrollLeft + n.clientWidth) n.scrollLeft = a.offsetLeft - n.offsetLeft - 16;
  }, [path]);
  return (
    <nav className="tabs" ref={nav}>
      {TABS.map(([href, label]) => <Link key={href} href={href} className={active(href) ? 'on' : undefined}>{label}</Link>)}
    </nav>
  );
}
