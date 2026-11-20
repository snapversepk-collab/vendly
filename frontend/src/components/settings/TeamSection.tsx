// Settings: team list, roles, remove, invite (owner only)
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, del, patch, post } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { fmtPhone } from '../../lib/format';
import { useApi } from '../../lib/hooks';
import type { Role, TeamMember } from '../../lib/types';
import { Avatar, CopyField, Field, Modal, Skeleton, useToast } from '../ui';
import { IconTrash } from '../icons';
import { Section, rowStyle } from './common';

const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', manager: 'Manager', staff: 'Event staff' };

export function TeamSection() {
  const { user } = useAuth();
  const toast = useToast();
  const team = useApi<TeamMember[]>('/team');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const [rowErr, setRowErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const setRole = async (m: TeamMember, role: Role) => {
    const prev = m.role;
    team.setData((x) => x?.map((y) => (y.id === m.id ? { ...y, role } : y)) ?? x);
    setRowErr((e) => ({ ...e, [m.id]: '' }));
    try {
      await patch(`/team/${m.id}`, { role });
      toast({ text: `${m.name} is now ${ROLE_LABEL[role].toLowerCase()}` });
    } catch (e: any) {
      team.setData((x) => x?.map((y) => (y.id === m.id ? { ...y, role: prev } : y)) ?? x);
      setRowErr((er) => ({ ...er, [m.id]: e.message ?? "Couldn't change the role" }));
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await del(`/team/${removing.id}`);
      team.setData((x) => x?.filter((y) => y.id !== removing.id) ?? x);
      toast({ text: `${removing.name} removed from your team` });
      setRemoving(null);
    } catch (e: any) {
      setRowErr((er) => ({ ...er, [removing.id]: e.message ?? "Couldn't remove" }));
      setRemoving(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section id="team" title="Team" sub="Staff see the jobs they're on. Only owners and managers see money."
      action={<button type="button" className="btn btn-ghost" style={{ height: 40, borderColor: 'var(--field-line)' }} onClick={() => setInviteOpen(true)}>Invite someone</button>}>
      {team.loading && !team.data ? (
        <div style={{ ...rowStyle }}><Skeleton h={44} /></div>
      ) : team.error && !team.data ? (
        <div style={{ ...rowStyle }} className="row">
          <span className="error-text">{team.error.message}</span>
          <button className="btn btn-ghost btn-sm" onClick={team.reload}>Try again</button>
        </div>
      ) : (
        (team.data ?? []).map((m) => {
          const me = m.userId === user?.id;
          return (
            <div key={m.id} style={{ ...rowStyle, display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr) auto', gap: 14, alignItems: 'center' }}>
              <Avatar name={m.name} dark={false} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 15, fontWeight: 500, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {m.name}{me && <span className="faint small">(you)</span>}
                  {m.pending && <span className="pill pill-inquiry">Invite pending</span>}
                </span>
                <span className="num" style={{ fontSize: 13, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.phone ? fmtPhone(m.phone) : m.email}</span>
                {rowErr[m.id] && <span className="error-text" role="alert">{rowErr[m.id]}</span>}
              </span>
              <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                <select className="select" aria-label={`Role for ${m.name}`} value={m.role} disabled={me}
                  onChange={(e) => setRole(m, e.target.value as Role)} style={{ height: 38, width: 'auto', padding: '0 10px', borderRadius: 10, borderColor: 'var(--line)', fontSize: 14 }}>
                  <option value="owner">Owner</option>
                  <option value="manager">Manager</option>
                  <option value="staff">Event staff</option>
                </select>
                {!me && (
                  <button type="button" className="btn btn-ghost btn-sm" style={{ width: 38, padding: 0 }} aria-label={`Remove ${m.name}`} onClick={() => setRemoving(m)}>
                    <IconTrash />
                  </button>
                )}
              </span>
            </div>
          );
        })
      )}

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} onInvited={team.reload} />

      <Modal open={!!removing} onClose={() => setRemoving(null)} title={`Remove ${removing?.name ?? ''}?`}
        footer={<>
          <button type="button" className="btn btn-ghost" onClick={() => setRemoving(null)}>Keep</button>
          <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>{busy ? 'Removing…' : 'Remove'}</button>
        </>}>
        <p className="muted">They won't be able to sign in to your business any more. Bookings they were on stay as they are.</p>
      </Modal>
    </Section>
  );
}

function InviteModal({ open, onClose, onInvited }: { open: boolean; onClose: () => void; onInvited: () => void }) {
  const { role: myRole } = useAuth();
  const [f, setF] = useState({ name: '', email: '', phone: '', role: 'staff' as 'manager' | 'staff' });
  const [err, setErr] = useState<{ name?: string; email?: string; form?: string; code?: string }>({});
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const close = () => {
    onClose();
    setTimeout(() => { setF({ name: '', email: '', phone: '', role: 'staff' }); setErr({}); setLink(null); }, 0);
  };

  const submit = async () => {
    const e: typeof err = {};
    if (!f.name.trim()) e.name = 'Enter their name';
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = 'Enter a valid email';
    setErr(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const r = await post<{ inviteLink: string }>('/team/invite', { name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim() || undefined, role: f.role });
      setLink(r.inviteLink);
      onInvited();
    } catch (x) {
      const a = x as ApiError;
      setErr({ form: a.message, code: a.code });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title={link ? 'Invite ready' : 'Invite someone'}
      footer={link
        ? <button type="button" className="btn btn-dark" onClick={close}>Done</button>
        : <>
            <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'Inviting…' : 'Send invite'}</button>
          </>}>
      {link ? (
        <>
          <p className="muted">We've emailed {f.name.split(' ')[0] || 'them'} an invite. If it doesn't arrive, send them this link on WhatsApp. It lets them set a password and join.</p>
          <div className="card-tight" style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '8px 12px' }}>
            <CopyField value={link} label="Copy link" />
          </div>
        </>
      ) : (
        <form className="stack" style={{ gap: 14 }} onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <Field label="Name" htmlFor="inv-name" error={err.name}>
            <input id="inv-name" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-invalid={!!err.name || undefined} />
          </Field>
          <Field label="Email" htmlFor="inv-email" error={err.email}>
            <input id="inv-email" className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} aria-invalid={!!err.email || undefined} />
          </Field>
          <Field label={<>Phone <span className="faint" style={{ fontWeight: 400 }}>(optional)</span></>} htmlFor="inv-phone">
            <input id="inv-phone" className="input num" type="tel" placeholder="0300 1234567" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </Field>
          <div className="field">
            <span className="label" id="inv-role">Role</span>
            <div className="seg" role="group" aria-labelledby="inv-role" style={{ alignSelf: 'flex-start' }}>
              <button type="button" aria-pressed={f.role === 'staff'} onClick={() => setF({ ...f, role: 'staff' })}>Event staff</button>
              <button type="button" aria-pressed={f.role === 'manager'} onClick={() => setF({ ...f, role: 'manager' })}>Manager</button>
            </div>
            <span className="hint">{f.role === 'staff' ? 'Sees only the jobs they are on: time, venue, client and checklist. No money.' : 'Runs bookings, payments, quotes and inquiries. Cannot change the plan or team.'}</span>
          </div>
          {err.form && (
            <div className={`banner ${err.code === 'plan_limit' ? 'banner-amber' : 'banner-danger'}`} role="alert" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ flex: 1 }}>{err.form}</span>
              {err.code === 'plan_limit' && myRole === 'owner' && <Link to="/upgrade" className="btn btn-ghost btn-sm" onClick={close}>See Team plan</Link>}
            </div>
          )}
          <button type="submit" hidden />
        </form>
      )}
    </Modal>
  );
}
