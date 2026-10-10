'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  /** Active only on this exact path (for Home, whose path is a prefix of the others). */
  exact?: boolean;
  /** Draw a divider above this item. */
  divider?: boolean;
};

type IconName = 'home' | 'compass' | 'play' | 'pencil' | 'chart' | 'refresh' | 'sparkle' | 'shield' | 'grid' | 'people' | 'plus';

const PATHS: Record<IconName, string> = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  compass: 'M12 3a9 9 0 100 18 9 9 0 000-18zm3.5 5.5l-2 5-5 2 2-5 5-2z',
  play: 'M8 5l11 7-11 7V5z',
  pencil: 'M4 20l1-4L16 5l3 3L8 19l-4 1zM14 7l3 3',
  chart: 'M4 20V10m6 10V4m6 16v-7m4 7H3',
  refresh: 'M20 12a8 8 0 10-3 6.2M20 5v5h-5',
  sparkle: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z',
  grid: 'M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z',
  people: 'M9 11a3 3 0 100-6 3 3 0 000 6zm8 1a2.5 2.5 0 100-5M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6m3-5.5c2.2.4 4 2.2 4 5.5',
  plus: 'M12 5v14M5 12h14',
};

function Icon({ name }: { name: IconName }) {
  return (
    <svg className="shell-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

export function ShellNav({ items, name, roleLabel }: { items: NavItem[]; name: string; roleLabel: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      router.push('/login');
      router.refresh();
    }
  }

  const isActive = (item: NavItem) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));

  return (
    <>
      <button type="button" className="shell-menu-button" aria-expanded={open} aria-controls="shell-menu" onClick={() => setOpen((value) => !value)}>
        {open ? 'Close menu' : 'Menu'}
      </button>
      <div id="shell-menu" className={`shell-menu${open ? ' open' : ''}`}>
        <nav aria-label="Main">
          <ul className="shell-nav">
            {items.map((item) => (
              <li key={item.href} className={item.divider ? 'divider' : undefined}>
                <Link href={item.href} aria-current={isActive(item) ? 'page' : undefined} className={isActive(item) ? 'active' : undefined} onClick={() => setOpen(false)}>
                  <Icon name={item.icon} />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="shell-user">
          <Link href="/profile" className="shell-user-name" aria-label={`${name}, edit your profile`}>
            {name}
          </Link>
          <p className="shell-user-role">{roleLabel}</p>
          <button type="button" className="shell-signout" onClick={signOut} disabled={busy}>
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </div>
    </>
  );
}
