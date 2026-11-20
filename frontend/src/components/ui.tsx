// Shared UI building blocks. Every colour comes from a CSS variable.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { post } from '../lib/api';
import { STATUS_LABEL, fmtPhone, fnColor, waLink } from '../lib/format';
import { copyText } from '../lib/hooks';
import type { BookingStatus } from '../lib/types';
import { IconCopy, IconWhatsApp, IconX } from './icons';

export function StatusPill({ status, children }: { status: BookingStatus; children?: ReactNode }) {
  return <span className={`pill pill-${status}`}>{children ?? STATUS_LABEL[status]}</span>;
}

/** Function colour dot. Function colours are dots only, never text. */
export function FnDot({ fn, size = 8, style }: { fn?: string | null; size?: number; style?: CSSProperties }) {
  return <span className="dot" style={{ width: size, height: size, background: fnColor(fn), ...style }} aria-hidden="true" />;
}

export function Field({ label, hint, error, children, htmlFor }: { label?: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      {label && <label className="label" htmlFor={htmlFor}>{label}</label>}
      {children}
      {error ? <span className="error-text" role="alert">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function Skeleton({ h = 20, w = '100%', r = 12, style }: { h?: number | string; w?: number | string; r?: number; style?: CSSProperties }) {
  return <div className="skel" style={{ height: h, width: w, borderRadius: r, ...style }} />;
}

export function PageSkeleton() {
  return (
    <div className="page" aria-busy="true">
      <Skeleton h={14} w={180} />
      <Skeleton h={44} w="50%" />
      <div className="row" style={{ alignItems: 'stretch' }}>
        <Skeleton h={260} style={{ flex: '7 1 420px' }} r={24} />
        <Skeleton h={260} style={{ flex: '5 1 300px' }} r={24} />
      </div>
      <Skeleton h={200} r={24} />
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: { message: string } | null; onRetry?: () => void }) {
  return (
    <div className="page page-narrow">
      <div className="card stack" style={{ alignItems: 'flex-start' }}>
        <h2 className="h-section">That didn't load</h2>
        <p className="muted">{error?.message ?? 'Something went wrong.'}</p>
        {onRetry && <button className="btn btn-ghost" onClick={onRetry}>Try again</button>}
      </div>
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div style={{ padding: '28px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <p style={{ fontWeight: 600 }}>{title}</p>
      {children && <p className="muted small" style={{ maxWidth: '46ch' }}>{children}</p>}
      {action}
    </div>
  );
}

/** Accessible modal dialog; on phones it becomes a bottom sheet. */
export function Modal({ open, onClose, title, children, footer, width = 520 }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const first = ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])');
    (first ?? ref.current)?.focus();
    const ov = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = ov;
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} tabIndex={-1} style={{ maxWidth: width }}>
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
          <h2 className="h-section">{title}</h2>
          <button type="button" data-close className="btn btn-ghost btn-sm" style={{ width: 36, padding: 0 }} onClick={onClose} aria-label="Close"><IconX /></button>
        </div>
        <div className="stack" style={{ gap: 16 }}>{children}</div>
        {footer && <div className="row" style={{ justifyContent: 'flex-end' }}>{footer}</div>}
      </div>
    </div>
  );
}

// ---------- Toasts (with optional Undo) ----------
interface Toast { id: number; text: string; action?: { label: string; onClick: () => void }; ms: number; tone?: 'ok' | 'error' }
const ToastCtx = createContext<(t: Omit<Toast, 'id' | 'ms'> & { ms?: number }) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, 'id' | 'ms'> & { ms?: number }) => {
    const id = Date.now() + Math.random();
    const toast = { ms: 4000, ...t, id };
    setToasts((x) => [...x, toast]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), toast.ms);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone === 'error' ? 'toast-error' : ''}`}>
            <span>{t.text}</span>
            {t.action && (
              <button type="button" className="btn-link" style={{ color: 'inherit', fontWeight: 600, textDecoration: 'underline', background: 'none', border: 0, cursor: 'pointer' }}
                onClick={() => { t.action!.onClick(); setToasts((x) => x.filter((y) => y.id !== t.id)); }}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/** Text with a copy button (used for links and phone numbers) */
export function CopyField({ value, display, label = 'Copy' }: { value: string; display?: ReactNode; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="row" style={{ gap: 8, flexWrap: 'nowrap', minWidth: 0 }}>
      <span className="num" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{display ?? value}</span>
      <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { if (await copyText(value)) { setDone(true); setTimeout(() => setDone(false), 1500); } }}>
        <IconCopy size={14} />{done ? 'Copied' : label}
      </button>
    </div>
  );
}

/**
 * Opens the vendor's own WhatsApp with a message filled in (click-to-chat). Nothing is sent
 * without a tap. If `kind` is given, the text comes from the business's message template.
 * The number is always shown as copyable text too (links can be blocked in previews).
 */
export function WhatsAppButton({ bookingId, kind, phone, text, label, className = 'btn btn-ghost', paymentId, showNumber = false, style }: {
  bookingId?: string; kind?: 'advance_reminder' | 'quote' | 'receipt' | 'thanks' | 'plain'; phone?: string | null; text?: string;
  label: ReactNode; className?: string; paymentId?: string; showNumber?: boolean; style?: CSSProperties;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const open = async () => {
    // Open the window synchronously so popup blockers allow it, then point it at wa.me
    const w = window.open('about:blank', '_blank');
    try {
      setBusy(true);
      let href = waLink(phone, text ?? '');
      if (bookingId && kind) {
        const r = await post<{ url: string }>(`/bookings/${bookingId}/whatsapp`, { kind, paymentId });
        href = r.url;
      }
      if (w) w.location.href = href; else window.location.href = href;
    } catch (e: any) {
      w?.close();
      toast({ text: e.message ?? 'Could not open WhatsApp', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="row" style={{ gap: 8, display: 'inline-flex', ...style }}>
      <button type="button" className={className} onClick={open} disabled={busy}>
        <IconWhatsApp />{label}
      </button>
      {showNumber && phone && <CopyField value={phone} display={fmtPhone(phone)} />}
    </span>
  );
}

/** Rupee amount input with Pakistani grouping as you type */
export function RupeeInput({ value, onChange, id, placeholder, invalid, ...rest }: { value: number | null; onChange: (v: number | null) => void; id?: string; placeholder?: string; invalid?: boolean; autoFocus?: boolean; disabled?: boolean }) {
  const fmt = (n: number | null) => (n === null || Number.isNaN(n) ? '' : n.toLocaleString('en-IN'));
  return (
    <div className="input-prefix">
      <span>Rs</span>
      <input
        id={id}
        className="input num"
        inputMode="numeric"
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        value={fmt(value)}
        onChange={(e) => {
          const d = e.target.value.replace(/[^\d]/g, '');
          onChange(d ? parseInt(d, 10) : null);
        }}
        {...rest}
      />
    </div>
  );
}

/** Small "Saved" / "Saving…" indicator */
export function SaveState({ state }: { state: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (state === 'idle') return null;
  return (
    <span className="row small" style={{ gap: 8, color: state === 'error' ? 'var(--danger)' : 'var(--ink-2)' }}>
      <span className="dot" style={{ background: state === 'error' ? 'var(--danger)' : state === 'saving' ? 'var(--amber-bar)' : 'var(--accent)' }} />
      {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : "Couldn't save"}
    </span>
  );
}

export function Avatar({ name, size = 40, dark = true }: { name: string; size?: number; dark?: boolean }) {
  const ini = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
  return (
    <span style={{ width: size, height: size, borderRadius: '50%', background: dark ? 'var(--ink)' : 'var(--track)', color: dark ? 'var(--ground)' : 'var(--ink)', display: 'grid', placeItems: 'center', fontSize: size * 0.33, fontWeight: 600, flex: 'none' }}>
      {ini}
    </span>
  );
}
