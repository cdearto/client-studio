import type { Metadata, Viewport } from 'next';
import { config } from '@/lib/config.ts';
import './globals.css';

export const metadata: Metadata = { title: { default: config.businessName, template: `%s — ${config.businessName}` } };
export const viewport: Viewport = { themeColor: '#0a0a0b' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
