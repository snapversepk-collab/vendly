// Settings (canvas: Settings). Owner sees everything; manager: capacity, services, messages; staff: appearance + sign out.
import { useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useApi, useDocumentTitle } from '../lib/hooks';
import type { Business, MessageTemplate, Service } from '../lib/types';
import { Skeleton } from '../components/ui';
import { AppearanceSection, BusinessSection, CapacitySection, PlanCard, RulesSection } from '../components/settings/BusinessSections';
import { TeamSection } from '../components/settings/TeamSection';
import { ChecklistsSection, ServicesSection } from '../components/settings/ServicesSection';
import { EmailsSection, WhatsAppSection } from '../components/settings/MessagesSection';

export default function Settings() {
  useDocumentTitle('Settings');
  const { role, user, signOut } = useAuth();
  const nav = useNavigate();
  const owner = role === 'owner';
  const manager = role === 'owner' || role === 'manager';

  const biz = useApi<Business>(manager ? '/business' : null);
  const svc = useApi<Service[]>(manager ? '/services' : null);
  const tpl = useApi<MessageTemplate[]>(manager ? '/message-templates' : null);
  const setBiz = useCallback((fn: (b: Business) => Business) => biz.setData((x) => (x ? fn(x) : x)), [biz.setData]);

  const missingPrices = (svc.data ?? []).filter((s) => s.active && s.price == null).length;
  const sections: { id: string; name: string; flag?: string; show: boolean }[] = [
    { id: 'plan', name: 'Plan and billing', show: owner },
    { id: 'business', name: 'Business profile', show: owner },
    { id: 'services', name: 'Services and prices', flag: missingPrices ? `${missingPrices} ${missingPrices === 1 ? 'price' : 'prices'} missing` : undefined, show: manager },
    { id: 'rules', name: 'Booking and payment rules', show: owner },
    { id: 'capacity', name: 'Events on the same date', show: manager },
    { id: 'whatsapp', name: 'WhatsApp messages', show: manager },
    { id: 'emails', name: 'Automatic emails', show: manager },
    { id: 'checklists', name: 'Checklists', show: owner },
    { id: 'team', name: 'Team', show: owner },
    { id: 'appearance', name: 'Appearance', show: true },
    { id: 'account', name: 'Sign out', show: true },
  ].filter((s) => s.show);

  const b = biz.data;
  const bizBlock = (render: (b: Business) => ReactNode, h = 160) =>
    b ? render(b) : biz.error ? (
      <div className="card row"><span className="error-text">{biz.error.message}</span><button className="btn btn-ghost btn-sm" onClick={biz.reload}>Try again</button></div>
    ) : <Skeleton h={h} r={24} />;

  return (
    <div className="page" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 32, alignItems: 'flex-start', paddingTop: 36 }}>
      <nav aria-label="Settings sections" className="hide-phone" style={{ flex: '1 1 220px', maxWidth: 260, display: 'flex', flexDirection: 'column', gap: 2, position: 'sticky', top: 90 }}>
        <h1 className="h-page" style={{ margin: '0 0 14px 12px', fontSize: 32 }}>Settings</h1>
        {sections.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="hov" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, fontSize: 15, color: 'var(--ink-2)' }}>
            {s.name}{s.flag && <span style={{ fontSize: 12, color: 'var(--amber)', textAlign: 'right' }}>{s.flag}</span>}
          </a>
        ))}
      </nav>
      <div style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h1 className="h-page show-phone">Settings</h1>
        {owner && bizBlock((x) => <PlanCard b={x} />, 140)}
        {owner && bizBlock((x) => <BusinessSection key={x.id} b={x} setBiz={setBiz} />, 320)}
        {manager && <ServicesSection svc={svc} trades={b?.trades ?? []} />}
        {owner && bizBlock((x) => <RulesSection key={x.id} b={x} setBiz={setBiz} />, 220)}
        {manager && bizBlock((x) => <CapacitySection b={x} setBiz={setBiz} />, 110)}
        {manager && <WhatsAppSection tpl={tpl} />}
        {manager && <EmailsSection tpl={tpl} b={b} />}
        {owner && <ChecklistsSection />}
        {owner && <TeamSection />}
        <AppearanceSection />
        <section id="account" aria-labelledby="account-h" className="card" style={{ padding: 24, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between', scrollMarginTop: 90 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <h2 id="account-h" className="h-section">Signed in as {user?.name}</h2>
            <span className="small faint" style={{ overflowWrap: 'anywhere' }}>{user?.email}</span>
          </div>
          <button type="button" className="btn btn-danger" onClick={() => { signOut(); nav('/signin', { replace: true }); }}>Sign out</button>
        </section>
      </div>
    </div>
  );
}
