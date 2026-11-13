'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [['/studio', 'Schedule'], ['/studio/clients', 'Clients'], ['/studio/hours', 'Hours'], ['/studio/newsletter', 'Newsletter'], ['/studio/templates', 'Templates']] as const;

export function NavTabs() {
  const path = usePathname();
  const active = (href: string) => (href === '/studio' ? path === '/studio' || path.startsWith('/studio/packages') : path.startsWith(href));
  return (
    <nav className="tabs">
      {TABS.map(([href, label]) => <Link key={href} href={href} className={active(href) ? 'on' : undefined}>{label}</Link>)}
    </nav>
  );
}
