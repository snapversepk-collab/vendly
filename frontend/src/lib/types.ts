// Shapes returned by the backend API.
export type Role = 'owner' | 'manager' | 'staff';
export type Plan = 'free' | 'pro' | 'team';
export type BookingStatus = 'inquiry' | 'confirmed' | 'completed' | 'cancelled';
export type FunctionType = 'Mehndi' | 'Barat' | 'Walima' | 'Nikah' | 'Engagement' | 'Birthday' | 'Corporate' | 'Other';
export const FUNCTION_TYPES: FunctionType[] = ['Mehndi', 'Barat', 'Walima', 'Nikah', 'Engagement', 'Birthday', 'Corporate', 'Other'];
export const NEXT_FUNCTION: Record<string, FunctionType> = { Mehndi: 'Barat', Barat: 'Walima', Nikah: 'Walima', Engagement: 'Mehndi' };

export interface User { id: string; name: string; email: string; phone: string | null; appearance: 'light' | 'dark' | 'system' }

export interface Business {
  id: string;
  name: string;
  handle: string | null;
  whatsapp: string | null;
  email: string | null;
  cities: string[];
  trades: string[];
  capacityPerDate: number;
  advancePct: number;
  balanceDue: 'event_day' | 'before_event';
  rescheduleNoticeDays: number;
  paymentMethods: string[];
  plan: Plan;
  logo: string | null;
  setupDone: Record<string, boolean>;
  hasBookings?: boolean;
  usage?: { bookingsThisMonth: number; freeLimit: number };
  plans?: Record<Plan, { name: string; price: number }>;
}

export interface Me { user: User; role: Role | null; business: Business | null; isPlatformAdmin?: boolean }

export interface Money { total: number; paid: number; balance: number; advanceDue: number; advancePaid: boolean; fullyPaid: boolean; advancePct?: number }

export interface QuoteSummary { id: string; status: 'draft' | 'sent' | 'accepted' | 'expired'; token: string; holdUntil: string | null; sentAt: string | null; total: number }

export interface Booking {
  id: string;
  familyId: string | null;
  familyLabel: string | null;
  client: { id: string; name: string; whatsapp: string | null; email: string | null };
  functionType: FunctionType;
  date: string; // YYYY-MM-DD
  startTime: string | null; // HH:MM
  hours: number | null;
  serviceId: string | null;
  serviceName: string | null;
  venue: string | null;
  city: string | null;
  status: BookingStatus;
  notes: string | null;
  source: 'manual' | 'booking_page' | 'import';
  assignedUserIds: string[];
  prep: { done: number; total: number };
  createdAt: string;
  /** Absent for event staff */
  money?: Money;
  quote?: QuoteSummary | null;
}

export interface Payment { id: string; amount: number; receivedOn: string; method: string; note: string | null; receiptNo: string; receiptToken: string; recordedBy?: string | null }
export interface ChecklistItem { id: string; label: string; phase: string; done: boolean; auto: 'advance' | 'balance' | null; sort: number }
export interface QuoteLine { name: string; amount: number }
export interface Quote { id: string; lines: QuoteLine[]; advancePct: number; holdUntil: string | null; note: string | null; token: string; sentAt: string | null; status: QuoteSummary['status']; total: number }

export interface BookingDetail extends Booking {
  family: Booking[];
  checklist: ChecklistItem[];
  assigned: { id: string; name: string }[];
  insideRescheduleWindow: boolean;
  rescheduleNoticeDays: number;
  balanceDue: 'event_day' | 'before_event';
  payments?: Payment[];
  quote?: any;
}

export interface Service { id: string; name: string; trade: string | null; hours: number | null; price: number | null; includes: string | null; active: boolean; sort: number }

export interface Clash { date: string; capacity: number; count: number; full: boolean; bookings: { id: string; status: BookingStatus; functionType: string; clientName: string }[] }

export interface Inquiry {
  id: string; clientName: string; whatsapp: string; email: string | null; functionType: FunctionType; date: string;
  serviceId: string | null; serviceName: string | null; serviceHours: number | null; servicePrice: number | null;
  venue: string | null; city: string | null; guests: number | null; message: string | null; suggestedDates: string[];
  status: 'new' | 'quoted' | 'suggested' | 'declined'; bookingId: string | null; createdAt: string;
}
export interface InquiryDetail extends Inquiry { clash: Clash; freeNearby: string[]; relatedFunction: string | null }

export interface NeedsItem {
  kind: 'inquiry' | 'no_advance' | 'balance' | 'hold_expired' | 'overdue' | 'prep';
  level: 'urgent' | 'soon' | 'later';
  bookingId?: string; inquiryId?: string; what: string; date: string; functionType?: string; amount?: number; phone?: string | null; act: string;
}

export interface TodayData {
  now: { date: string; time: string };
  next: (Booking & { openItems: string[] }) | null;
  month: { from: string; to: string; events: number; ahead: number; booked: number; collected: number; outstanding: number; dueIn7: number } | null;
  dates: { date: string; bookings: Booking[]; full: boolean; capacity: number }[];
  needs: NeedsItem[];
  after: Booking[];
  firstDay: boolean;
  handle: string | null;
  setupDone: Record<string, boolean>;
}

export interface TeamMember { id: string; userId: string; role: Role; name: string; email: string; phone: string | null; pending: boolean }
export interface MessageTemplate { id: string; kind: string; channel: 'whatsapp' | 'email'; name: string; text: string; enabled: boolean; timing: string | null }
export interface Trade { key: string; name: string; blurb: string; services: { name: string; hours: number | null; price: number | null; includes: string }[]; checklist: { label: string; phase: string; auto?: string }[] }

export interface ReportsData {
  period: { key: string; from: string; to: string };
  totals: { booked: number; collected: number; stillToCollect: number; average: number; count: number };
  full: boolean;
  months?: { month: string; booked: number; collected: number }[];
  byFunction?: { name: string; count: number }[];
  byService?: { name: string; total: number; share: number }[];
  funnel?: { inquiries: number; quoted: number; confirmed: number };
  bySource?: Record<'booking_page' | 'manual' | 'import', number>;
  headline?: { month: string; booked: number; earlierMonths: string[]; earlierBooked: number } | null;
}

export interface PublicBusiness { name: string; handle: string; whatsapp: string | null; cities: string[]; trades: string[]; logo: string | null; advancePct: number; balanceDue: string; rescheduleNoticeDays: number; paymentMethods: string[] }
