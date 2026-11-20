import { useEffect, useRef, useState, type FormEvent } from 'react';
import { del, patch, post, type ApiError } from '../../lib/api';
import { useDebounced } from '../../lib/hooks';
import type { ChecklistItem } from '../../lib/types';
import { IconX } from '../icons';
import { SaveState, useToast } from '../ui';
import { PHASES, phaseLabel } from './shared';

/** Checklist grouped by phase. Auto items tick themselves from payments. */
export function ChecklistCard({ bookingId, items: initial, manager, compact }: { bookingId: string; items: ChecklistItem[]; manager: boolean; compact?: boolean }) {
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [label, setLabel] = useState('');
  const [phase, setPhase] = useState('Before');
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setItems(initial), [initial]);

  const order = [...PHASES.map((p) => p.key), ...Array.from(new Set(items.map((i) => i.phase))).filter((p) => !PHASES.some((x) => x.key === p))];
  const groups = order.map((p) => ({ phase: p, items: items.filter((i) => i.phase === p) })).filter((g) => g.items.length);
  const done = items.filter((i) => i.done).length;

  async function toggle(it: ChecklistItem) {
    if (it.auto) return;
    const next = !it.done;
    setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, done: next } : x)));
    try {
      await patch(`/checklist-items/${it.id}`, { done: next });
    } catch (e) {
      setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, done: !next } : x)));
      toast({ text: (e as ApiError).message, tone: 'error' });
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!label.trim()) return setErr('Write what needs doing');
    setAdding(true); setErr(null);
    try {
      const r = await post<ChecklistItem>(`/bookings/${bookingId}/checklist`, { label: label.trim(), phase });
      setItems((xs) => [...xs, r]);
      setLabel('');
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setAdding(false);
    }
  }

  async function remove(it: ChecklistItem) {
    setItems((xs) => xs.filter((x) => x.id !== it.id));
    try {
      await del(`/checklist-items/${it.id}`);
    } catch (e) {
      setItems((xs) => [...xs, it]);
      toast({ text: (e as ApiError).message, tone: 'error' });
    }
  }

  return (
    <article aria-labelledby="chk-h" className="card" style={{ padding: compact ? 14 : 24, display: 'flex', flexDirection: 'column', gap: compact ? 8 : 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', padding: compact ? '4px 6px 0' : 0 }}>
        <h2 id="chk-h" style={{ fontSize: compact ? 16 : 20, fontWeight: 600, letterSpacing: '-0.01em' }}>Checklist</h2>
        <span className="num small faint">{done} of {items.length} done</span>
      </div>
      {items.length === 0 && <p className="small faint">Nothing on the checklist yet.</p>}
      {groups.map((g) => (
        <div key={g.phase} className="stack" style={{ gap: 2 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', padding: compact ? '8px 6px 2px' : '6px 0 4px' }}>
            <h3 style={{ fontSize: compact ? 12 : 14, fontWeight: 600, color: compact ? 'var(--ink-3)' : 'var(--ink)' }}>{phaseLabel(g.phase)}</h3>
            <span className="num tiny faint">{g.items.filter((i) => i.done).length} of {g.items.length}</span>
          </div>
          {g.items.map((it) => {
            const id = `chk-${it.id}`;
            return (
              <div key={it.id} className={it.auto ? undefined : 'hov'} style={{ display: 'flex', alignItems: 'center', gap: 4, borderRadius: 12 }}>
                <label htmlFor={id} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, padding: '10px', minHeight: 44, cursor: it.auto ? 'default' : 'pointer', minWidth: 0 }}>
                  <input id={id} type="checkbox" checked={it.done} disabled={!!it.auto} onChange={() => toggle(it)}
                    style={{ width: 18, height: 18, margin: 0, accentColor: 'var(--accent)', flex: 'none' }} />
                  <span style={{ flex: 1, fontSize: 15, color: it.done ? 'var(--ink-3)' : 'var(--ink)', textDecoration: it.done ? 'line-through' : undefined, minWidth: 0 }}>{it.label}</span>
                  {it.auto && <span className="tiny faint" style={{ textAlign: 'right' }}>Ticks itself from payments</span>}
                </label>
                {manager && !it.auto && (
                  <button type="button" className="btn btn-ghost btn-sm" aria-label={`Remove ${it.label}`} style={{ width: 36, padding: 0, border: 0, background: 'transparent', color: 'var(--ink-3)' }} onClick={() => remove(it)}>
                    <IconX size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}
      {manager && (
        <form onSubmit={add} className="stack" style={{ gap: 6, paddingTop: 4 }}>
          <div className="row" style={{ gap: 8 }}>
            <label htmlFor={`chk-new-${bookingId}`} className="sr-only">New checklist item</label>
            <input id={`chk-new-${bookingId}`} className="input" style={{ flex: '1 1 200px' }} placeholder="Add an item" value={label} onChange={(e) => { setLabel(e.target.value); setErr(null); }} />
            <label htmlFor={`chk-phase-${bookingId}`} className="sr-only">When</label>
            <select id={`chk-phase-${bookingId}`} className="select" style={{ flex: '0 1 170px' }} value={phase} onChange={(e) => setPhase(e.target.value)}>
              {PHASES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
            <button type="submit" className="btn btn-ghost" disabled={adding}>Add</button>
          </div>
          {err && <span className="error-text" role="alert">{err}</span>}
        </form>
      )}
    </article>
  );
}

/** Notes with autosave (debounced PATCH). Staff may edit notes too. */
export function NotesCard({ bookingId, initial }: { bookingId: string; initial: string | null }) {
  const [text, setText] = useState(initial ?? '');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saved = useRef(initial ?? '');
  const debounced = useDebounced(text, 800);
  const latest = useRef(text);
  latest.current = text;

  // Leaving the page before the debounce fires still saves
  useEffect(() => () => {
    if (latest.current !== saved.current) patch(`/bookings/${bookingId}`, { notes: latest.current || null }).catch(() => {});
  }, [bookingId]);

  useEffect(() => {
    if (debounced === saved.current) return;
    let live = true;
    setState('saving');
    patch(`/bookings/${bookingId}`, { notes: debounced || null })
      .then(() => { saved.current = debounced; if (live) setState('saved'); })
      .catch(() => live && setState('error'));
    return () => { live = false; };
  }, [debounced, bookingId]);

  return (
    <article aria-labelledby="note-h" className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 id="note-h" style={{ fontSize: 17, fontWeight: 600 }}>Notes</h2>
        <SaveState state={text !== debounced ? 'idle' : state} />
      </div>
      <label htmlFor={`notes-${bookingId}`} className="sr-only">Notes</label>
      <textarea id={`notes-${bookingId}`} className="textarea" style={{ minHeight: 140, background: 'var(--ground)', borderColor: 'var(--line)' }}
        placeholder="Venue contact, colours, anything the team should know"
        value={text} onChange={(e) => setText(e.target.value)} />
    </article>
  );
}
