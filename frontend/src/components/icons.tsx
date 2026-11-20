// Stroke icons from the design canvas. All use currentColor.
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 16, vb = '0 0 16 16') => ({ width: size, height: size, viewBox: vb, fill: 'none', 'aria-hidden': true as const });

export const IconPlus = ({ size = 16, ...p }: P) => (<svg {...base(size)} {...p}><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>);
export const IconSearch = ({ size = 16, ...p }: P) => (<svg {...base(size, '0 0 20 20')} {...p}><circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" /><path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>);
export const IconWhatsApp = ({ size = 16, ...p }: P) => (<svg {...base(size)} {...p}><path d="M3 13l.8-2.6A5.5 5.5 0 1 1 6 12.6z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>);
export const IconPin = ({ size = 16, ...p }: P) => (<svg {...base(size)} {...p}><path d="M8 14s4.5-4 4.5-7.5a4.5 4.5 0 0 0-9 0C3.5 10 8 14 8 14z" stroke="currentColor" strokeWidth="1.4" /><circle cx="8" cy="6.5" r="1.6" stroke="currentColor" strokeWidth="1.4" /></svg>);
export const IconAlert = ({ size = 18, ...p }: P) => (<svg {...base(size, '0 0 20 20')} {...p}><path d="M10 3.5l7 12.5H3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M10 8.5v3.2M10 14v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>);
export const IconClock = ({ size = 18, ...p }: P) => (<svg {...base(size, '0 0 20 20')} {...p}><circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.6" /><path d="M10 6.5V10l2.5 1.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>);
export const IconCheck = ({ size = 18, ...p }: P) => (<svg {...base(size, '0 0 20 20')} {...p}><path d="M4 10.5l3.5 3.5L16 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>);
export const IconChevronLeft = ({ size = 16, ...p }: P) => (<svg {...base(size)} {...p}><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>);
export const IconChevronRight = ({ size = 16, ...p }: P) => (<svg {...base(size)} {...p}><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>);
export const IconChevronDown = ({ size = 16, ...p }: P) => (<svg {...base(size)} {...p}><path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>);
export const IconX = ({ size = 16, ...p }: P) => (<svg {...base(size)} {...p}><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>);
export const IconCopy = ({ size = 16, ...p }: P) => (<svg {...base(size)} {...p}><rect x="5.5" y="5.5" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.4" /><path d="M10.5 3.5h-6a1 1 0 0 0-1 1v6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>);
export const IconExternal = ({ size = 16, ...p }: P) => (<svg {...base(size)} {...p}><path d="M9 3h4v4M13 3L7.5 8.5M11 9.5V12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>);
export const IconDownload = ({ size = 16, ...p }: P) => (<svg {...base(size)} {...p}><path d="M8 2.5v8M4.5 7L8 10.5 11.5 7M3 13h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>);
export const IconCalendar = ({ size = 18, ...p }: P) => (<svg {...base(size, '0 0 20 20')} {...p}><rect x="3" y="4.5" width="14" height="12.5" rx="3" stroke="currentColor" strokeWidth="1.6" /><path d="M7 2.5v4M13 2.5v4M3 9h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>);
export const IconHome = ({ size = 18, ...p }: P) => (<svg {...base(size, '0 0 20 20')} {...p}><path d="M3.5 9L10 3.5 16.5 9v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>);
export const IconInbox = ({ size = 18, ...p }: P) => (<svg {...base(size, '0 0 20 20')} {...p}><path d="M3 11l2-7h10l2 7v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M3 11h4l1 2h4l1-2h4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>);
export const IconChart = ({ size = 18, ...p }: P) => (<svg {...base(size, '0 0 20 20')} {...p}><path d="M4 16V9M10 16V4M16 16v-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>);
export const IconSettings = ({ size = 18, ...p }: P) => (<svg {...base(size, '0 0 20 20')} {...p}><circle cx="10" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.6" /><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>);
export const IconTrash = ({ size = 16, ...p }: P) => (<svg {...base(size)} {...p}><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>);
export const IconEdit = ({ size = 16, ...p }: P) => (<svg {...base(size)} {...p}><path d="M10.5 3l2.5 2.5L6 12.5H3.5V10z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>);
export const IconGoogle = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
    <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05z" />
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
  </svg>
);

/** Brand mark from the canvas: calendar with an accent dot */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="26" height="24" rx="7" fill="var(--ink)" />
      <path d="M10 3v5M22 3v5" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="20.5" cy="19.5" r="3.2" fill="var(--accent)" />
    </svg>
  );
}
