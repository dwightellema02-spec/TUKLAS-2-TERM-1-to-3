import type { Metadata } from 'next';
import { IBM_Plex_Sans, Sora } from 'next/font/google';
import './globals.css';
import './shell.css';
import './landing.css';

// Self-hosted by Next.js (no request to Google at runtime, which the Content-Security-Policy would block anyway).
const display = Sora({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-display', display: 'swap' });
const body = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-body', display: 'swap' });

export const metadata: Metadata = {
  title: 'Tuklas: Learn smarter. Understand deeper. Master more.',
  description: 'Tuklas turns a teacher’s lesson into an interactive learning loop: practice, feedback and a mastery record both student and teacher can see.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
