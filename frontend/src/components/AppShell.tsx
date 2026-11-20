import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { get } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtShort, initials } from '../lib/format';
import { useDebounced } from '../lib/hooks';
import type { Booking } from '../lib/types';
import { IconCalendar, IconChart, IconHome, IconInbox, IconPlus, IconSearch, Logo } from './icons';
import { FnDot, StatusPill } from './ui';

/** Header (Today / Calendar / Inquiries / Reports tabs, search, New booking, avatar) + phone tab bar. */
export function AppShell() {
  const { business, user, role } = useAuth();
  const [inq, setInq] = useState(0);
  const loc = useLocation();
  const nav = useNavigate();
  const manager = role === 'owner' || role === 'manager';

  useEffect(() => {
    if (!manager) return;
    get<{ newInquiries: number }>('/counts').then((r) => setInq(r.newInquiries)).catch(() => {});
  }, [loc.pathname, manager]);

  // Keyboard shortcuts from the canvas: N new booking, T today, ⌘K search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        document.getElementById('global-search')?.focus();
        return;
      }
      if (t.closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'n' && manager) nav('/bookings/new');
      if (e.key === 't') nav('/today');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [nav, manager]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ground)', display: 'flex', flexDirection: 'column' }}>
      <header className="appbar">
        <div className="appbar-inner">
          <Link to="/today" style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }} aria-label="Home">
            <Logo />
            <span style={{ fontWeight: 600, fontSize: 16, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{business?.name ?? 'Vendly'}</span>
          </Link>
          <nav aria-label="Views" className="seg hide-phone">
            <NavLink to="/today" aria-current={loc.pathname === '/today' ? 'page' : undefined}>Today</NavLink>
            <Link to="/calendar" aria-current={loc.pathname === '/calendar' || loc.pathname === '/agenda' ? 'page' : undefined}>Calendar</Link>
            {manager && (
              <NavLink to="/inquiries">Inquiries{inq > 0 && <span className="badge num">{inq}</span>}</NavLink>
            )}
            {manager && <NavLink to="/reports">Reports</NavLink>}
          </nav>
          <div className="spacer" />
          <GlobalSearch />
          {manager && (
            <Link to="/bookings/new" className="btn btn-primary hide-phone" style={{ height: 40 }}>
              <IconPlus />New booking
            </Link>
          )}
          <Link to="/settings" aria-label="Settings" style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--ink)', color: 'var(--ground)', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 600, flex: 'none' }}>
            {initials(user?.name)}
          </Link>
        </div>
      </header>
      <main style={{ flex: 1 }}>
        <Outlet />
      </main>
      <PhoneTabBar inquiries={inq} manager={manager} />
    </div>
  );
}

function PhoneTabBar({ inquiries, manager }: { inquiries: number; manager: boolean }) {
  const Item = ({ to, icon, label, extra }: { to: string; icon: ReactNode; label: string; extra?: ReactNode }) => (
    <NavLink to={to}>
      {icon}
      <span>{label}</span>
      {extra}
    </NavLink>
  );
  return (
    <nav className="tabbar show-phone" aria-label="Main">
      <Item to="/today" icon={<IconHome />} label="Today" />
      <Item to="/calendar" icon={<IconCalendar />} label="Calendar" />
      {manager ? (
        <NavLink to="/bookings/new" className="tab-new" aria-label="New booking">
          <span><IconPlus size={20} /></span>
        </NavLink>
      ) : (
        <span />
      )}
      {manager ? (
        <Item to="/inquiries" icon={<IconInbox />} label="Inquiries" extra={inquiries > 0 ? <span className="badge num" style={{ position: 'absolute', top: 2, right: '22%' }}>{inquiries}</span> : null} />
      ) : (
        <span />
      )}
      {manager ? <Item to="/reports" icon={<IconChart />} label="Reports" /> : <span />}
    </nav>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Booking[]>([]);
  const dq = useDebounced(q, 200);
  const nav = useNavigate();
  const box = useRef<HTMLLabelElement>(null);

  useEffect(() => {
    if (dq.trim().length < 2) { setResults([]); return; }
    let live = true;
    get<Booking[]>('/search', { q: dq }).then((r) => live && setResults(r)).catch(() => {});
    return () => { live = false; };
  }, [dq]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <label ref={box} htmlFor="global-search" className="hide-phone" style={{ position: 'relative', display: 'flex', alignItems: 'center', width: 320, maxWidth: '100%' }}>
      <span style={{ position: 'absolute', left: 14, color: 'var(--ink-3)', display: 'flex' }}><IconSearch /></span>
      <span className="sr-only">Search</span>
      <input
        id="global-search"
        type="search"
        placeholder="Search clients, phones, venues"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results[0]) { nav(`/bookings/${results[0].id}`); setOpen(false); setQ(''); }
          if (e.key === 'Escape') setOpen(false);
        }}
        style={{ width: '100%', height: 40, padding: '0 52px 0 40px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', fontSize: 14 }}
      />
      <span style={{ position: 'absolute', right: 10, fontSize: 12, color: 'var(--ink-3)', border: '1px solid var(--line)', borderRadius: 6, padding: '1px 6px' }}>⌘K</span>
      {open && dq.trim().length >= 2 && (
        <div className="search-pop">
          {results.length === 0 ? (
            <p className="small faint" style={{ padding: 12 }}>No bookings match "{dq}"</p>
          ) : (
            results.map((b) => (
              <Link key={b.id} to={`/bookings/${b.id}`} className="hov" onClick={() => { setOpen(false); setQ(''); }}
                style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 10, padding: '10px 12px', borderRadius: 12, alignItems: 'center' }}>
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontWeight: 500, fontSize: 14 }}>{b.familyLabel ?? b.client.name}</span>
                  <span className="small faint row" style={{ gap: 6 }}><FnDot fn={b.functionType} size={7} />{b.functionType} · {fmtShort(b.date)}{b.venue ? ` · ${b.venue}` : ''}</span>
                </span>
                <StatusPill status={b.status} />
              </Link>
            ))
          )}
        </div>
      )}
    </label>
  );
}
