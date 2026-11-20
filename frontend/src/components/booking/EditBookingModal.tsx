import { useEffect, useState } from 'react';
import { patch, type ApiError } from '../../lib/api';
import { fmtPhone, fmtShort } from '../../lib/format';
import { useApi } from '../../lib/hooks';
import { FUNCTION_TYPES, type Booking, type BookingDetail, type Clash, type Service, type TeamMember } from '../../lib/types';
import { IconClock } from '../icons';
import { Field, Modal, RupeeInput } from '../ui';
import { ClashNotice } from './shared';

interface Form {
  functionType: string; date: string; startTime: string; hours: string; serviceId: string;
  venue: string; city: string; total: number | null; familyLabel: string;
  name: string; whatsapp: string; email: string; assigned: string[];
}

const init = (b: BookingDetail): Form => ({
  functionType: b.functionType, date: b.date, startTime: b.startTime ?? '', hours: b.hours != null ? String(b.hours) : '',
  serviceId: b.serviceId ?? '', venue: b.venue ?? '', city: b.city ?? '', total: b.money?.total ?? null,
  familyLabel: b.familyLabel ?? '', name: b.client.name, whatsapp: fmtPhone(b.client.whatsapp), email: b.client.email ?? '',
  assigned: b.assignedUserIds ?? [],
});

/** Edit booking: date, time, service, venue, money and client. Handles the reschedule window and full dates. */
export function EditBookingModal({ booking, open, onClose, onSaved }: { booking: BookingDetail; open: boolean; onClose: () => void; onSaved: (b: Booking) => void }) {
  const services = useApi<Service[]>(open ? '/services' : null);
  const team = useApi<TeamMember[]>(open ? '/team' : null);
  const [f, setF] = useState<Form>(() => init(booking));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ field?: string; text: string } | null>(null);
  const [windowMsg, setWindowMsg] = useState<string | null>(null);
  const [clash, setClash] = useState<Clash | null>(null);
  const [flags, setFlags] = useState({ confirmReschedule: false, overrideClash: false });

  useEffect(() => {
    if (!open) return;
    setF(init(booking));
    setErr(null); setWindowMsg(null); setClash(null);
    setFlags({ confirmReschedule: false, overrideClash: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const dateChanged = f.date !== booking.date;

  async function save(fl = flags) {
    setErr(null);
    if (!f.date) return setErr({ field: 'date', text: 'Pick a date' });
    if (!f.name.trim()) return setErr({ field: 'name', text: 'Enter the client name' });
    const client: Record<string, string> = {};
    if (f.name.trim() !== booking.client.name) client.name = f.name.trim();
    if (f.whatsapp.replace(/\D/g, '') !== (booking.client.whatsapp ?? '').replace(/\D/g, '')) client.whatsapp = f.whatsapp.trim();
    if (f.email.trim() !== (booking.client.email ?? '')) client.email = f.email.trim();
    const body: Record<string, unknown> = {
      functionType: f.functionType, date: f.date, startTime: f.startTime || null,
      hours: f.hours.trim() === '' ? null : Number(f.hours), serviceId: f.serviceId || null,
      venue: f.venue.trim() || null, city: f.city.trim() || null, assignedUserIds: f.assigned,
      ...fl,
    };
    if (booking.money) body.total = f.total ?? 0;
    if (Object.keys(client).length) body.client = client;
    if (f.familyLabel.trim() && f.familyLabel.trim() !== (booking.familyLabel ?? '')) body.familyLabel = f.familyLabel.trim();
    setBusy(true);
    try {
      const r = await patch<Booking>(`/bookings/${booking.id}`, body);
      onSaved(r);
      onClose();
    } catch (e) {
      const ae = e as ApiError;
      if (ae.code === 'reschedule_window') setWindowMsg(ae.message);
      else if (ae.code === 'date_full') setClash(ae.data?.clash ?? null);
      else if (ae.code === 'total_below_paid') setErr({ field: 'total', text: ae.message });
      else setErr({ text: ae.message });
    } finally {
      setBusy(false);
    }
  }

  const people = (team.data ?? []).filter((m) => m.role === 'staff' || m.role === 'manager');
  const svc = services.data?.find((s) => s.id === f.serviceId);

  let footer;
  if (windowMsg) {
    footer = (
      <>
        <button type="button" className="btn btn-ghost" onClick={() => { set('date', booking.date); setWindowMsg(null); }}>Keep {fmtShort(booking.date)}</button>
        <button type="button" className="btn btn-dark" disabled={busy} onClick={() => { const fl = { ...flags, confirmReschedule: true }; setFlags(fl); setWindowMsg(null); save(fl); }}>Move the date anyway</button>
      </>
    );
  } else if (clash) {
    footer = (
      <>
        <button type="button" className="btn btn-ghost" onClick={() => setClash(null)}>Pick another date</button>
        <button type="button" className="btn btn-dark" disabled={busy || !flags.overrideClash} onClick={() => { setClash(null); save(); }}>Save anyway</button>
      </>
    );
  } else {
    footer = (
      <>
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => save()}>{busy ? 'Saving…' : 'Save changes'}</button>
      </>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit booking" width={640} footer={footer}>
      {windowMsg && (
        <div className="banner banner-amber" role="alert">
          <IconClock />
          <span>{windowMsg}</span>
        </div>
      )}
      {clash && (
        <ClashNotice clash={clash} date={f.date} override={flags.overrideClash} onOverride={(v) => setFlags((x) => ({ ...x, overrideClash: v }))} />
      )}
      {err && !err.field && <div className="banner banner-danger" role="alert">{err.text}</div>}

      <div style={grid2}>
        <Field label="Function" htmlFor="eb-fn">
          <select id="eb-fn" className="select" value={f.functionType} onChange={(e) => set('functionType', e.target.value)}>
            {FUNCTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Family or event name" htmlFor="eb-fam" hint="Shared by all of this family's functions">
          <input id="eb-fam" className="input" value={f.familyLabel} onChange={(e) => set('familyLabel', e.target.value)} />
        </Field>
      </div>
      <div style={grid3}>
        <Field label="Date" htmlFor="eb-date" error={err?.field === 'date' ? err.text : undefined}
          hint={dateChanged && booking.insideRescheduleWindow ? `Inside the ${booking.rescheduleNoticeDays}-day window` : undefined}>
          <input id="eb-date" type="date" className="input num" value={f.date} onChange={(e) => { set('date', e.target.value); setFlags({ confirmReschedule: false, overrideClash: false }); }} />
        </Field>
        <Field label="Start time" htmlFor="eb-time">
          <input id="eb-time" type="time" className="input num" value={f.startTime} onChange={(e) => set('startTime', e.target.value)} />
        </Field>
        <Field label="Hours" htmlFor="eb-hours">
          <input id="eb-hours" type="number" min={0} max={48} step={0.5} inputMode="decimal" className="input num" value={f.hours} onChange={(e) => set('hours', e.target.value)} />
        </Field>
      </div>
      <Field label="Service" htmlFor="eb-svc" hint={svc?.includes ?? undefined}>
        <select id="eb-svc" className="select" value={f.serviceId} onChange={(e) => {
          const s = services.data?.find((x) => x.id === e.target.value);
          setF((x) => ({ ...x, serviceId: e.target.value, hours: s?.hours != null ? String(s.hours) : x.hours, total: x.total || s?.price || x.total }));
        }}>
          <option value="">Custom</option>
          {(services.data ?? []).filter((s) => s.active || s.id === f.serviceId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <div style={grid2}>
        <Field label="Venue" htmlFor="eb-venue">
          <input id="eb-venue" className="input" value={f.venue} onChange={(e) => set('venue', e.target.value)} />
        </Field>
        <Field label="City" htmlFor="eb-city">
          <input id="eb-city" className="input" value={f.city} onChange={(e) => set('city', e.target.value)} />
        </Field>
      </div>
      {booking.money && (
        <Field label="Agreed total" htmlFor="eb-total" error={err?.field === 'total' ? err.text : undefined}>
          <RupeeInput id="eb-total" value={f.total} onChange={(v) => set('total', v)} invalid={err?.field === 'total'} />
        </Field>
      )}
      <div style={grid3}>
        <Field label="Client name" htmlFor="eb-name" error={err?.field === 'name' ? err.text : undefined}>
          <input id="eb-name" className="input" value={f.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="WhatsApp" htmlFor="eb-wa">
          <input id="eb-wa" type="tel" className="input num" value={f.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} />
        </Field>
        <Field label="Email" htmlFor="eb-email">
          <input id="eb-email" type="email" className="input" value={f.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
      </div>
      {people.length > 0 && (
        <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <legend className="label" style={{ padding: 0, marginBottom: 8 }}>Assigned team</legend>
          <div className="row" style={{ gap: 8 }}>
            {people.map((m) => {
              const on = f.assigned.includes(m.userId);
              return (
                <button key={m.userId} type="button" className="chip" aria-pressed={on}
                  onClick={() => set('assigned', on ? f.assigned.filter((x) => x !== m.userId) : [...f.assigned, m.userId])}>
                  {m.name}{m.pending ? ' (invited)' : ''}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}
    </Modal>
  );
}

const grid2 = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 } as const;
const grid3 = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 } as const;
