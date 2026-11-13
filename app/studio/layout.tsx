import type { Metadata } from 'next';
import { config } from '@/lib/config.ts';
import { isSignedIn } from '@/lib/session.ts';
import { NavTabs } from './NavTabs.tsx';
import { signOut } from './actions.ts';
import './studio.css';

export const metadata: Metadata = { title: 'Studio', robots: { index: false }, appleWebApp: { capable: true, title: 'Studio' } };

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  if (!(await isSignedIn())) return <div className="studio">{children}</div>;   // the login page
  return (
    <div className="studio">
      <div className="wrap">
        <header className="top">
          <a className="brand" href="/studio">Studio</a>
          <form action={signOut} className="meta">{config.businessName} · <button className="link">Sign out</button></form>
        </header>
        <NavTabs />
        {children}
      </div>
    </div>
  );
}
