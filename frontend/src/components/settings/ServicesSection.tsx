// Settings: services and prices (grouped by trade, like setup) + checklist templates per trade
import { useEffect, useState } from 'react';
import { del, patch, post, put } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import type { Service } from '../../lib/types';
import { Field, Modal, RupeeInput, SaveState, Skeleton } from '../ui';
import { IconPlus, IconTrash } from '../icons';
import { tradeName } from '../client/ClientParts';
import { Section, rowStyle, useSaver } from './common';

type Svc = ReturnType<typeof useApi<Service[]>>;

export function ServicesSection({ svc, trades }: { svc: Svc; trades: string[] }) {
  const saver = useSaver();
  const [editing, setEditing] = useState<Service | 'new' | null>(null);
  const [newTrade, setNewTrade] = useState<string | null>(null);
  const list = svc.data ?? [];
  const missing = list.filter((s) => s.active && s.price == null).length;

  const groups: { key: string | null; name: string; items: Service[] }[] = [];
  const keys = Array.from(new Set([...trades, ...list.map((s) => s.trade).filter((t): t is string => !!t)]));
  for (const k of keys) groups.push({ key: k, name: tradeName(k), items: list.filter((s) => s.trade === k) });
  const other = list.filter((s) => !s.trade || !keys.includes(s.trade));
  if (other.length || !keys.length) groups.push({ key: null, name: keys.length ? 'Other services' : 'Your services', items: other });

  const update = async (s: Service, body: Partial<Service>) => {
    const prev = s;
    svc.setData((x) => x?.map((y) => (y.id === s.id ? { ...y, ...body } : y)) ?? x);
    const ok = await saver.run(() => patch(`/services/${s.id}`, body));
    if (!ok) svc.setData((x) => x?.map((y) => (y.id === s.id ? prev : y)) ?? x);
  };

  return (
    <Section id="services" title="Services and prices" sub="Shown on your booking page and added to quotes. Switch off what you don't offer."
      action={<span className="row" style={{ gap: 10 }}><SaveState state={saver.state} />{missing > 0 && <span className="small" style={{ color: 'var(--amber)' }}>{missing} {missing === 1 ? 'price' : 'prices'} to add</span>}</span>}>
      {saver.error && <p className="error-text" role="alert" style={{ padding: '0 18px 8px' }}>{saver.error}</p>}
      {svc.loading && !svc.data ? (
        <div style={rowStyle}><Skeleton h={120} /></div>
      ) : svc.error && !svc.data ? (
        <div style={rowStyle} className="row"><span className="error-text">{svc.error.message}</span><button className="btn btn-ghost btn-sm" onClick={svc.reload}>Try again</button></div>
      ) : (
        groups.map((g) => (
          <div key={g.key ?? '_'} style={{ borderTop: '1px solid var(--line-soft)' }}>
            <h3 style={{ padding: '14px 18px 6px', fontSize: 13, fontWeight: 600, color: 'var(--ink-3)' }}>{g.name}</h3>
            <div className="svc-head small faint" aria-hidden="true">
              <span>Service and what's included</span><span>Hours on site</span><span>Price (Rs)</span><span style={{ textAlign: 'right' }}>Offer</span>
            </div>
            {g.items.map((s) => <ServiceRow key={s.id} s={s} onSave={(b) => update(s, b)} onEdit={() => setEditing(s)} />)}
            {!g.items.length && <p className="small faint" style={{ padding: '6px 18px' }}>No services here yet.</p>}
            <div style={{ padding: '8px 18px 14px' }}>
              <button type="button" className="btn btn-link" onClick={() => { setNewTrade(g.key); setEditing('new'); }}><IconPlus size={14} />Add a service</button>
            </div>
          </div>
        ))
      )}
      <ServiceModal key={editing === 'new' ? `new-${newTrade}` : editing?.id ?? 'none'} open={!!editing} service={editing === 'new' ? null : editing} trade={newTrade} trades={keys}
        onClose={() => setEditing(null)}
        onSaved={(s, isNew) => { svc.setData((x) => (isNew ? [...(x ?? []), s] : x?.map((y) => (y.id === s.id ? s : y)) ?? x)); setEditing(null); }}
        onDeleted={(id) => { svc.setData((x) => x?.filter((y) => y.id !== id) ?? x); setEditing(null); }} />
      <style>{`
        .svc-head, .svc-row { display: grid; grid-template-columns: minmax(0, 1fr) 110px 170px 56px; gap: 14px; align-items: center; padding: 0 18px; }
        .svc-head { padding-bottom: 6px; }
        .svc-missing .input { border: 1.5px dashed var(--amber); background: var(--amber-soft-2); }
        .svc-missing .input::placeholder { color: var(--amber); }
        .svc-row { padding: 12px 18px; border-top: 1px solid var(--line-soft); }
        .svc-row .svc-l { display: none; }
        @media (max-width: 640px) {
          .svc-head { display: none; }
          .svc-row { grid-template-columns: 1fr 1fr; }
          .svc-row > :first-child { grid-column: 1 / -1; }
          .svc-row .svc-l { display: block; }
          .svc-row > :last-child { grid-column: 1 / -1; justify-content: flex-start !important; }
        }
      `}</style>
    </Section>
  );
}

function ServiceRow({ s, onSave, onEdit }: { s: Service; onSave: (b: Partial<Service>) => void; onEdit: () => void }) {
  const [hours, setHours] = useState(s.hours == null ? '' : String(s.hours));
  const [price, setPrice] = useState<number | null>(s.price);
  useEffect(() => { setHours(s.hours == null ? '' : String(s.hours)); setPrice(s.price); }, [s.hours, s.price]);
  const noPrice = price == null;
  return (
    <div className="svc-row" style={{ opacity: s.active ? 1 : 0.6 }}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>{s.name}</span>
          <button type="button" className="btn-link small" style={{ cursor: 'pointer', background: 'none', border: 0 }} onClick={onEdit} aria-label={`Edit ${s.name}`}>Edit</button>
        </span>
        {s.includes && <span className="small" style={{ color: 'var(--ink-3)' }}>{s.includes}</span>}
      </span>
      <label className="field" style={{ gap: 4 }}>
        <span className="svc-l label">Hours on site</span>
        <input className="input num" inputMode="decimal" aria-label={`Hours for ${s.name}`} placeholder="—" value={hours}
          onChange={(e) => setHours(e.target.value.replace(/[^\d.]/g, ''))}
          onBlur={() => {
            const n = hours === '' ? null : Number(hours);
            if (n !== null && (Number.isNaN(n) || n > 48)) { setHours(s.hours == null ? '' : String(s.hours)); return; }
            if (n !== s.hours) onSave({ hours: n });
          }} />
      </label>
      <div className="field" style={{ gap: 4 }} onBlur={() => { if (price !== s.price) onSave({ price }); }}>
        <span className="svc-l label">Price</span>
        <div className={noPrice ? 'svc-missing' : undefined}>
          <RupeeInput value={price} onChange={setPrice} placeholder="Add your price" />
        </div>
      </div>
      <label className="check" style={{ justifyContent: 'flex-end', minHeight: 44 }}>
        <span className="svc-l small muted">Offer this</span>
        <input type="checkbox" checked={s.active} onChange={(e) => onSave({ active: e.target.checked })} aria-label={`Offer ${s.name}`} style={{ width: 22, height: 22 }} />
      </label>
    </div>
  );
}

function ServiceModal({ open, service, trade, trades, onClose, onSaved, onDeleted }: {
  open: boolean; service: Service | null; trade: string | null; trades: string[];
  onClose: () => void; onSaved: (s: Service, isNew: boolean) => void; onDeleted: (id: string) => void;
}) {
  const [f, setF] = useState({
    name: service?.name ?? '', includes: service?.includes ?? '', hours: service?.hours == null ? '' : String(service.hours),
    price: service?.price ?? null as number | null, trade: service ? service.trade ?? '' : trade ?? '',
  });
  const [err, setErr] = useState<{ name?: string; hours?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const save = async () => {
    const e: typeof err = {};
    if (!f.name.trim()) e.name = 'Give the service a name';
    const hours = f.hours === '' ? null : Number(f.hours);
    if (hours !== null && (Number.isNaN(hours) || hours > 48)) e.hours = 'Use 0 to 48 hours';
    setErr(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const body = { name: f.name.trim(), includes: f.includes.trim() || null, hours, price: f.price, trade: f.trade || null };
    try {
      const s = service ? await patch<Service>(`/services/${service.id}`, body) : await post<Service>('/services', body);
      onSaved(s, !service);
    } catch (x: any) {
      setErr({ form: x.message });
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!service) return;
    setBusy(true);
    try {
      await del(`/services/${service.id}`);
      onDeleted(service.id);
    } catch (x: any) {
      setErr({ form: x.message });
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={service ? `Edit ${service.name}` : 'Add a service'}
      footer={<>
        {service && (confirmDel
          ? <button type="button" className="btn btn-danger" onClick={remove} disabled={busy} style={{ marginRight: 'auto' }}>Yes, delete it</button>
          : <button type="button" className="btn btn-danger" onClick={() => setConfirmDel(true)} style={{ marginRight: 'auto' }}><IconTrash />Delete</button>)}
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </>}>
      <form className="stack" style={{ gap: 14 }} onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Name" htmlFor="sv-name" error={err.name}>
          <input id="sv-name" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Signature booth" aria-invalid={!!err.name || undefined} />
        </Field>
        <Field label="What's included" htmlFor="sv-inc">
          <input id="sv-inc" className="input" value={f.includes} onChange={(e) => setF({ ...f, includes: e.target.value })} placeholder="Prints and digital copies" />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 14 }}>
          <Field label="Hours on site" htmlFor="sv-hours" error={err.hours}>
            <input id="sv-hours" className="input num" inputMode="decimal" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value.replace(/[^\d.]/g, '') })} />
          </Field>
          <Field label="Price" htmlFor="sv-price" hint="Leave empty to show “Ask for price”">
            <RupeeInput id="sv-price" value={f.price} onChange={(v) => setF({ ...f, price: v })} />
          </Field>
        </div>
        {trades.length > 0 && (
          <Field label="Trade" htmlFor="sv-trade">
            <select id="sv-trade" className="select" value={f.trade} onChange={(e) => setF({ ...f, trade: e.target.value })}>
              {trades.map((t) => <option key={t} value={t}>{tradeName(t)}</option>)}
              <option value="">Other</option>
            </select>
          </Field>
        )}
        {err.form && <p className="error-text" role="alert">{err.form}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

// ---------- Checklist templates ----------
interface TplItem { label: string; phase: string; auto?: 'advance' | 'balance' | null }
const PHASES = ['Booking', 'Before', 'On the day', 'After'];

export function ChecklistsSection() {
  const tpl = useApi<{ trade: string; items: TplItem[] }[]>('/checklist-templates');
  return (
    <Section id="checklists" title="Checklists" sub="Copied onto every new booking for that trade. Money items tick themselves when you record payments.">
      {tpl.loading && !tpl.data ? <div style={rowStyle}><Skeleton h={120} /></div>
        : tpl.error && !tpl.data ? <div style={rowStyle} className="row"><span className="error-text">{tpl.error.message}</span><button className="btn btn-ghost btn-sm" onClick={tpl.reload}>Try again</button></div>
        : !tpl.data?.length ? <p className="muted small" style={{ ...rowStyle }}>No checklists yet. They're added when you pick your trades in setup.</p>
        : tpl.data.map((t) => <TradeChecklist key={t.trade} trade={t.trade} items={t.items} />)}
    </Section>
  );
}

function TradeChecklist({ trade, items: initial }: { trade: string; items: TplItem[] }) {
  const [items, setItems] = useState<TplItem[]>(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [label, setLabel] = useState('');
  const [phase, setPhase] = useState('Before');
  const saver = useSaver();
  const dirty = JSON.stringify(items) !== saved;
  const phases = Array.from(new Set([...PHASES, ...items.map((i) => i.phase)]));

  const save = async () => {
    const clean = items.filter((i) => i.label.trim()).map((i) => ({ ...i, label: i.label.trim() }));
    const ok = await saver.run(() => put(`/checklist-templates/${trade}`, { items: clean }));
    if (ok) { setItems(clean); setSaved(JSON.stringify(clean)); }
  };
  const add = () => {
    if (!label.trim()) return;
    setItems((x) => [...x, { label: label.trim(), phase }]);
    setLabel('');
  };

  return (
    <div style={{ ...rowStyle, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h3 style={{ fontSize: 15, fontWeight: 600 }}>{tradeName(trade)}</h3>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((it, i) => (
          <li key={i} className="ck-row">
            <input className="input" style={{ height: 40 }} aria-label="Checklist item" value={it.label} onChange={(e) => setItems((x) => x.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} />
            <select className="select" style={{ height: 40, padding: '0 8px' }} aria-label={`Phase for ${it.label}`} value={it.phase} onChange={(e) => setItems((x) => x.map((y, j) => (j === i ? { ...y, phase: e.target.value } : y)))}>
              {phases.map((p) => <option key={p}>{p}</option>)}
            </select>
            {it.auto ? (
              <span className="tiny faint" title="Ticks itself from payments" style={{ textAlign: 'center' }}>Auto</span>
            ) : (
              <button type="button" className="btn btn-ghost btn-sm" style={{ width: 40, padding: 0 }} aria-label={`Remove ${it.label}`} onClick={() => setItems((x) => x.filter((_, j) => j !== i))}><IconTrash /></button>
            )}
          </li>
        ))}
      </ul>
      <style>{`.ck-row{display:grid;grid-template-columns:minmax(0,1fr) 130px 40px;gap:8px;align-items:center}
        @media (max-width:640px){.ck-row{grid-template-columns:minmax(0,1fr) 40px;padding-bottom:8px;border-bottom:1px solid var(--line-soft)}.ck-row>:first-child{grid-column:1/-1}}`}</style>
      <form className="row" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input className="input" style={{ height: 40, flex: '1 1 200px' }} placeholder="Add an item" aria-label={`New item for ${tradeName(trade)}`} value={label} onChange={(e) => setLabel(e.target.value)} />
        <select className="select" style={{ height: 40, width: 130, padding: '0 8px' }} aria-label="Phase" value={phase} onChange={(e) => setPhase(e.target.value)}>
          {phases.map((p) => <option key={p}>{p}</option>)}
        </select>
        <button type="submit" className="btn btn-ghost btn-sm" disabled={!label.trim()}><IconPlus size={14} />Add</button>
      </form>
      <div className="row" style={{ gap: 10 }}>
        <button type="button" className="btn btn-dark btn-sm" onClick={save} disabled={!dirty || saver.state === 'saving'}>Save checklist</button>
        <SaveState state={saver.state} />
        {saver.error && <span className="error-text" role="alert">{saver.error}</span>}
      </div>
    </div>
  );
}
