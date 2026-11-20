# Datebook build spec

Nov 18, 2026 · @Hasnat

## Overview

Datebook is booking software for event vendors in Pakistan: photo booths, photographers, decorators, DJs, mehndi artists, caterers and makeup artists. Version 1 lets a vendor take inquiries from a public booking page, quote, track advances and balances in rupees, run a checklist per event, and message clients through WhatsApp click-to-chat and automatic email.

The design is the Datebook canvas (21 screens). Build from it screen by screen; this spec says what each screen does, the data behind it, and the rules it follows.

|  | Version 1 | Later |
| --- | --- | --- |
| Vendors | One business per account, multiple staff | Agencies running several brands |
| Bookings | Inquiry, quote, confirm, payments, checklist, family functions | Contracts with e-signature |
| Clients | Public booking page, quote and receipt links | Client login, online advance payment |
| Messaging | WhatsApp click-to-chat, automatic email | WhatsApp Business Platform for automatic WhatsApp |
| Money | Record cash, bank, JazzCash, Easypaisa by hand | Payment links through a local gateway |
| Insight | Month totals on Today, Agenda view, Reports page (Team plan) | Accounting exports, Instagram lead tracking |
| Language | English | Urdu |

## Users and roles

Three roles sign in; clients never do. Every signed-in user belongs to exactly one business, and every query is filtered by that business.

| Role | Sees | Can change | Cannot |
| --- | --- | --- | --- |
| Owner | Everything, including money and reports | Everything, plan and billing, team | — |
| Manager | Everything, including money | Bookings, payments, quotes, inquiries, services | Plan, billing, team roles |
| Event staff | Bookings they're assigned to: time, venue, client name and phone, checklist, notes | Tick checklist items, add notes | See or record money, quotes, other bookings |
| Client (no login) | Their quote, receipt and the vendor's booking page, through links | Send an inquiry | Anything else |

Quote and receipt links use a long random token (at least 22 characters), never a guessable id.

## Data model

Every table except `users` carries `business_id`, and row-level security limits each user to their own business. Money is stored as whole rupees in integers; dates as `date`, times as `time` in Asia/Karachi.

| Table | Key fields | Notes |
| --- | --- | --- |
| businesses | name, handle (booking-page slug, unique), whatsapp, email, cities\[\], trades\[\], capacity\_per\_date (default 1), advance\_pct (default 40), balance\_due (`event_day` or `before_event`), reschedule\_notice\_days (default 7), payment\_methods\[\], plan, logo | One per vendor |
| users | name, email, phone, auth id | Login identity |
| memberships | user\_id, business\_id, role (`owner`, `manager`, `staff`) | Links users to a business |
| services | name, trade, hours, price (nullable until set), includes, active, sort | Prefilled from trade templates at setup |
| clients | name, whatsapp, email (optional) | Reused across a family's functions |
| families | client\_id, label ("Ayesha & Hamza") | Groups Mehndi, Barat, Walima |
| bookings | family\_id, client\_id, function\_type, date, start\_time, hours, service\_id, venue, city, status, total, advance\_pct (copied from business at creation), notes, source (`manual`, `booking_page`, `import`), assigned\_user\_ids\[\] | Status values in Key flows |
| payments | booking\_id, amount, received\_on, method, note, receipt\_token, recorded\_by | A booking's paid amount = sum of its payments |
| quotes | booking\_id, lines (name, amount), advance\_pct, hold\_until, note, token, sent\_at, status (`draft`, `sent`, `accepted`, `expired`) | Discounts are negative lines |
| inquiries | client name, whatsapp, email, function\_type, date, service\_id, venue, status (`new`, `quoted`, `suggested`, `declined`), booking\_id | Created by the public booking page |
| checklist\_templates | trade, items (label, phase, auto: `advance` or `balance` or none) | One per trade, editable in Settings |
| checklist\_items | booking\_id, label, phase, done, auto | Copied from templates when a booking is created |
| message\_templates | kind (`advance_reminder`, `receipt`, `thanks`, …), channel (`whatsapp` or `email`), text with \[placeholders\], enabled, timing | Settings → WhatsApp and Automatic emails |
| email\_log | booking\_id, kind, to, sent\_at, provider\_id, status | Prevents duplicate sends |

## Screens and states

Each row is one artboard on the canvas. Desktop pages are fluid and must also work at phone width; phone artboards show the layout for screens vendors use at events.

| Screen (canvas name) | Who | What it does | States to build |
| --- | --- | --- | --- |
| Landing page | Public | Pitch, trades, features, pricing, Start free | — |
| Sign up | Public | Name, business name, WhatsApp (+92), email, password, or Google | Email taken, weak password |
| Setup: your trade | Owner | Pick trades (multi), cities, events per date | Nothing picked → Continue disabled |
| Setup: services and policy | Owner | Edit prefilled services, advance %, balance due, reschedule days, payment methods | Missing prices flagged, not blocking |
| Setup: booking page | Owner | Claim handle, share link, import or add bookings | Handle taken, invalid characters |
| First day (empty) | Owner | Setup checklist, booking link, 14 empty dates | Shown until the first booking exists |
| Today | All | Next event, month money, next 14 dates, Needs you, after tonight | No event today; staff view hides money |
| Calendar | All | Month grid, filters, selected-day panel, free dates | Month or Agenda view |
| Inquiries | Owner, manager | Inbox, request detail, accept / suggest / decline | Date already full; inquiry with no service |
| Quote | Owner, manager | Line items, advance %, hold-until, note, send | No email → email send disabled |
| Booking detail | All | Family functions, status track, payments, checklist, details, notes | Inside reschedule window; cancelled; staff view |
| New booking | Owner, manager | One page form, live summary, clash check, family functions | Date full; past date; advance more than total |
| Settings | Owner (manager: services, messages) | Plan, team, events per date, automatic emails, WhatsApp messages | Free-plan limit reached |
| Sign in | Public | Email + password or Google | Wrong password, forgot password |
| Booking page (client) | Public | Services, free dates, inquiry form | Vendor has no free dates this month |
| Receipt (client) | Public | Payment confirmation and balance | Fully paid |
| Email: booking confirmed | Client | Confirmation with receipt link | — |
| Phone: Today, Booking, New booking, Sign in | All | Same as desktop, one-handed, fixed bottom actions | Same as desktop |

## Agenda, reports and dark mode

All three ship in version 1. Agenda and dark mode are for everyone; the full Reports page is on the Team plan. They're on the canvas as Agenda, Reports, Today · dark mode and Phone · Today · dark mode.

**Agenda** (Calendar → Agenda)

- A list of bookings grouped into This week, Next week and Later (weeks run Monday to Sunday). Each group header shows its event count and the money still to collect.
- Each row: date, client, function and time, service, venue, prep progress (done of total), status, and one money line.
- Money line: confirmed with balance → "Rs X due" ("due tonight" on the day); fully paid → "Paid in full"; inquiry with a quote → "Quoted Rs X"; inquiry without → "No advance yet".
- Filters: Upcoming / Past / All (Past is newest first), search by client, venue or phone, and a status filter that includes "Money still due".
- Export to Excel: one row per booking with date, client, phone, function, service, venue, status, total, paid, balance.
- Event staff see only bookings they're assigned to, with no money line.

**Reports** (owner and manager)

| Figure | How it's worked out |
| --- | --- |
| Booked | Sum of totals of non-cancelled bookings dated in the period |
| Collected | Sum of all payments on those same bookings, whenever they were paid |
| Still to collect | Booked minus collected |
| Average booking | Booked divided by the number of those bookings |
| Booked and collected by month | The same two figures per event month, as paired bars |
| Events by function | Count of bookings per function type |
| Money booked by service | Totals grouped by service, with each one's share |
| Booking page inquiries | Inquiries made in the period → those that got a quote → those whose booking reached Confirmed |
| Where bookings came from | Count of bookings by source: booking page, added by hand, imported |

- Period choices: This month, This season (July to December), Last 12 months, Custom dates. Default: This season.
- The headline sentence under the title names the biggest month and compares it with earlier months, worked out from the same data.
- Export to Excel gives one row per booking for the period.
- On Free and Pro, Reports shows the four totals only, with an upgrade prompt for the rest.

**Dark mode**

- Follows the device setting by default. Settings → Appearance offers Light, Dark and Match phone, saved per user.
- Client pages (booking page, quote, receipt) follow the client's device. Emails are always light.
- Confirmed date tiles flip to a light tile with dark text, so booked dates stay the strongest mark on the screen.

| Token | Dark value | Light value |
| --- | --- | --- |
| ground | #0B0E0D | #F4F5F2 |
| surface | #141917 | #FFFFFF |
| raised (selected tab) | #2C3632 | #FFFFFF |
| line | #262D2A | #E4E6E1 |
| field-line | #33403A | #D3D6CF |
| ink | #EEF1EE | #0E1311 |
| ink-2 | #B4BDB8 | #4A524E |
| ink-3 | #8A948F | #69716D |
| accent | #3CC48C, with #06140E text on it | #0A6B4D, with white text |
| accent-soft | #123A2A | #E2F0E9 |
| amber | #E3A64A on #2E2412 | #965800 on #FBF1E0 |
| danger | #F07B6E on #3A1A17 | #B42318 on #FCEBE9 |
| hero card | #1A2420 | #0E1311 |
| confirmed date tile | #E9EDEA with #0B0E0D text | #0E1311 with white text |

## Key flows

A booking moves from a client's request to Completed, and a date only counts as Confirmed once the advance is recorded.

&#91;embedded content: booking flow · 6 stages, 4 side paths\]

Bookings store four statuses: Inquiry (covers new inquiry and quote sent), Confirmed, Completed and Cancelled. Inquiries track their own reply state: new, quoted, suggested, declined.

- **Clash check**: a date is full when non-cancelled bookings on it reach capacity\_per\_date. New booking, Accept and the booking page all check it; the booking page hides full dates, the vendor sees a warning and can still override.
- **Pencilled-in dates** show as Inquiry tiles and count toward capacity until hold\_until passes, then they stop counting and the vendor is told.
- **Family functions**: "Add another function" copies client, family, venue and service, and suggests the next function (Mehndi → Barat → Walima) on the next day.
- **Completed**: the day after the event, a booking still Confirmed moves to Completed if its balance is zero; otherwise it stays and shows in Needs you.
- **Setup**: sign up → trades → services and rules → booking page → First day; any step can be skipped and finished from the First day checklist.

## Messaging

WhatsApp messages open the sender's own WhatsApp with the text filled in; nothing is sent without a tap. Emails are sent automatically by the server. No WhatsApp Business Platform in version 1.

**WhatsApp click-to-chat**

- Link format: `https://wa.me/<number>?text=<url-encoded message>`; convert a local number by dropping the leading 0 and adding 92 (0300 1234567 → 923001234567).
- Vendor → client buttons: advance reminder, quote, receipt, thank you. Text comes from `message_templates` with placeholders filled: \[client\], \[function\], \[date\], \[amount\], \[advance\], \[receipt link\], \[review link\].
- Client → vendor: the booking page saves the inquiry first, then opens WhatsApp with the request filled in.
- Inside the claude.ai preview these links can be blocked; in the real app they open normally. Always show the number as copyable text too.

**Automatic email**

- Send through a transactional email service with a free tier. Verify the sending domain with SPF, DKIM and DMARC before launch.
- From: "\<Business name> via Datebook" at a Datebook address; Reply-To: the vendor's email.
- Each email is on or off per business in Settings. Log every send in `email_log` and never send the same kind for the same booking twice.

| Email | To | When |
| --- | --- | --- |
| Inquiry received | Client | Right away, if they gave an email |
| New inquiry | Vendor | Right away |
| Booking confirmed, with receipt link | Client | When status becomes Confirmed |
| Payment received | Client | Each payment recorded |
| Reminder before the event, with balance due | Client | 2 days before, 10:00 am |
| Tomorrow at a glance | Vendor | 8:00 pm the day before any event |
| Advance still missing | Vendor | 3 days before an event still in Inquiry |
| Thank you and review | Client | Day after, off by default |

Scheduled emails run from one job every 15 minutes that finds due sends in Asia/Karachi time.

## Money rules

All amounts are whole rupees, shown with Pakistani grouping (Rs 1,20,000, and "Rs 14.6 lakh" for big totals). Datebook records payments; it does not move money in version 1.

- **Total** = sum of quote lines once accepted, or the agreed total typed in New booking.
- **Advance due** = round(total × advance\_pct ÷ 100). advance\_pct is copied onto the booking when it's created, so changing Settings later doesn't change old bookings.
- **Paid** = sum of payments. **Balance** = max(0, total − paid).
- Recording a payment that brings paid ≥ advance on an Inquiry offers to mark it Confirmed. Paid ≥ total ticks the "Balance collected" checklist item automatically; paid ≥ advance ticks "Advance received".
- A payment can't be more than the balance left; the form says so and keeps the amount.
- Removing a payment shows an Undo for 6 seconds.
- Each payment gets its own receipt number per business (YS-0142) and a receipt link token.
- **Reschedule rule**: inside reschedule\_notice\_days of the event, Booking detail shows the warning and date changes ask for a second confirm. It never blocks the vendor.
- **Month figures on Today**: booked = sum of totals of non-cancelled bookings dated in the month; collected = payments on those bookings; due in 7 days = balances of bookings in the next 7 days.
- Cancelled bookings keep their payments on record and show as Cancelled, with any refund recorded as a negative payment.

## Design tokens

Copy these into the app's theme. The canvas uses one font, Geist, with tabular numbers wherever digits line up.

| Token | Value | Use |
| --- | --- | --- |
| ground | #F4F5F2 | Page background |
| surface | #FFFFFF | Cards, inputs |
| line | #E4E6E1 | Card borders, dividers |
| field-line | #D3D6CF | Input borders |
| ink | #0E1311 | Text, dark hero cards, confirmed date tiles |
| ink-2 | #4A524E | Secondary text |
| ink-3 | #69716D | Captions, labels |
| accent | #0A6B4D | Primary buttons, progress, today, money received |
| accent-soft | #E2F0E9 | Success pills, selected tint |
| amber | #965800 on #FBF1E0 / #FDF6EA | Inquiries, missing prices, money due |
| danger | #B42318 on #FCEBE9 | Urgent items, delete |
| function colours | Mehndi #7FA82A, Barat #E0476F, Walima #8E73E0, Nikah #27A3B0, Engagement #E56A2B, Birthday #4C86F0, Corporate #8A96A3, Other #B59A68 | Dots only, never text |

- **Type scale**: 12, 13, 14, 15, 16, 18, 20, 24, 28, 34, 44 px. Headlines weight 600 with −0.035em letter-spacing; body 400–500.
- **Radius**: 24 for cards, 12–14 for buttons and inputs, 999 for pills.
- **Sizes**: buttons and inputs 40–52 px tall; touch targets at least 44 px on phone.
- **Date tiles**: confirmed = ink fill; inquiry = amber dashed border on light amber; free = grey dashed border; today = accent outline.
- Dark mode values are in the Agenda, reports and dark mode section.

## Tech stack and build order

Suggested stack: Next.js (App Router, TypeScript) with Tailwind, Supabase for Postgres, auth and row-level security, Resend for email, and Vercel for hosting and cron. Any equivalent works; the spec doesn't depend on these choices.

Build in this order, each step usable before the next:

1. Project, light and dark design tokens, app shell (header, Today and Calendar tabs, phone layout).
2. Sign up, sign in, Google sign-in, business and membership tables with row-level security.
3. Setup: trades, cities, capacity, services from trade templates, booking rules.
4. Bookings: New booking, Booking detail, family functions, checklist from templates, clash check against capacity\_per\_date.
5. Payments and money rules, receipts with token links, the client Receipt page.
6. Today, Calendar and Agenda views from real data, First day empty state.
7. Public booking page and inquiries: inbox, accept, suggest dates, decline.
8. Quotes with token links and the client quote view.
9. WhatsApp click-to-chat buttons and editable message templates.
10. Automatic emails, the 15-minute scheduler, email\_log, then the Reports page.
11. Team invites and role limits for staff.
12. Plans: Free limit, upgrade screen; payments for the subscription itself last.

Each step ships with tests for its money and date rules (advance rounding, balance, clash check, Asia/Karachi dates).

## Open decisions

- [ ] Product name: Datebook, Bayana, Mehfil or Vendly (check domain and trademark first)
- [ ] Pro and Team monthly prices, and the Free plan's monthly booking limit (\[PRICE\] and \[N\] on the canvas)
- [ ] Booking page domain (the canvas uses datebook.pk/handle as a placeholder)
- [ ] Does an inquiry pencil in its date, and for how long by default?
- [ ] Which trades get checklist and service templates at launch
- [ ] Excel import: which columns to accept
- [ ] Settled: Agenda view, Reports page and dark mode ship in version 1
