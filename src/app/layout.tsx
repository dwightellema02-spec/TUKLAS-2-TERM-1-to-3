import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tuklas V2',
  description: 'Tuklas learning ecosystem foundation',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
