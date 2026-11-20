// Starter data copied into a business at setup. Everything here is editable later.

export const FUNCTION_TYPES = ['Mehndi', 'Barat', 'Walima', 'Nikah', 'Engagement', 'Birthday', 'Corporate', 'Other'] as const;
export const NEXT_FUNCTION: Record<string, string> = { Mehndi: 'Barat', Barat: 'Walima', Nikah: 'Walima', Engagement: 'Mehndi' };
export const PAYMENT_METHODS = ['cash', 'bank', 'jazzcash', 'easypaisa', 'other'] as const;

type Svc = { name: string; hours: number | null; price: number | null; includes: string };
type Item = { label: string; phase: string; auto?: 'advance' | 'balance' };
export interface Trade {
  key: string;
  name: string;
  blurb: string;
  services: Svc[];
  checklist: Item[];
}

const money: Item[] = [
  { label: 'Advance received', phase: 'Booking', auto: 'advance' },
  { label: 'Balance collected', phase: 'On the day', auto: 'balance' },
];

export const TRADES: Trade[] = [
  {
    key: 'photo_booth', name: 'Photo booth', blurb: 'Mirror, 360 or classic booths',
    services: [
      { name: 'Classic booth', hours: 2, price: 45000, includes: 'Unlimited prints, props, one backdrop' },
      { name: 'Signature booth', hours: 3, price: 85000, includes: 'Prints on the night, plus digital copies by link' },
      { name: 'Grand booth', hours: 4, price: 120000, includes: 'Mirror booth, custom template, guest book' },
    ],
    checklist: [
      money[0],
      { label: 'Print template approved', phase: 'Before' },
      { label: 'Backdrop and props packed', phase: 'Before' },
      { label: 'Printer paper and ink checked', phase: 'Before' },
      { label: 'Venue power point confirmed', phase: 'Before' },
      { label: 'Set up and test prints', phase: 'On the day' },
      money[1],
      { label: 'Digital copies shared', phase: 'After' },
    ],
  },
  {
    key: 'photographer', name: 'Photography & video', blurb: 'Photo and film coverage',
    services: [
      { name: 'Photography, one function', hours: 5, price: null, includes: 'Two photographers, edited album by link' },
      { name: 'Photo + video, one function', hours: 6, price: null, includes: 'Highlights film and full edit' },
      { name: 'Drone coverage', hours: 2, price: null, includes: 'Aerial shots of the venue and entry' },
    ],
    checklist: [
      money[0],
      { label: 'Shot list from the family', phase: 'Before' },
      { label: 'Batteries and cards ready', phase: 'Before' },
      { label: 'Team confirmed', phase: 'Before' },
      money[1],
      { label: 'Backup photos', phase: 'After' },
      { label: 'Edited album delivered', phase: 'After' },
    ],
  },
  {
    key: 'decorator', name: 'Decor', blurb: 'Stage, flowers and lights',
    services: [
      { name: 'Stage decor', hours: 6, price: null, includes: 'Stage, sofa, backdrop and flowers' },
      { name: 'Full venue decor', hours: 8, price: null, includes: 'Stage, entrance, tables and lighting' },
    ],
    checklist: [
      money[0],
      { label: 'Theme and colours agreed', phase: 'Before' },
      { label: 'Flowers ordered', phase: 'Before' },
      { label: 'Venue access time confirmed', phase: 'Before' },
      { label: 'Setup done and photographed', phase: 'On the day' },
      money[1],
      { label: 'Teardown', phase: 'After' },
    ],
  },
  {
    key: 'dj', name: 'DJ & sound', blurb: 'Music, sound and lights',
    services: [
      { name: 'DJ with sound', hours: 4, price: null, includes: 'DJ, speakers and mic' },
      { name: 'DJ, sound and lights', hours: 5, price: null, includes: 'DJ, speakers, mics, dance-floor lights' },
    ],
    checklist: [
      money[0],
      { label: 'Song list from the family', phase: 'Before' },
      { label: 'Venue power and timing confirmed', phase: 'Before' },
      { label: 'Sound check', phase: 'On the day' },
      money[1],
    ],
  },
  {
    key: 'mehndi_artist', name: 'Mehndi artist', blurb: 'Bridal and guest mehndi',
    services: [
      { name: 'Bridal mehndi', hours: 4, price: null, includes: 'Hands and feet, full bridal design' },
      { name: 'Guest mehndi', hours: 3, price: null, includes: 'Simple designs for guests' },
    ],
    checklist: [
      money[0],
      { label: 'Design chosen', phase: 'Before' },
      { label: 'Fresh cones prepared', phase: 'Before' },
      money[1],
    ],
  },
  {
    key: 'caterer', name: 'Catering', blurb: 'Food for every function',
    services: [
      { name: 'Menu A, per 100 guests', hours: null, price: null, includes: 'Two mains, rice, dessert' },
      { name: 'Menu B, per 100 guests', hours: null, price: null, includes: 'Three mains, BBQ, two desserts' },
    ],
    checklist: [
      money[0],
      { label: 'Menu and guest count final', phase: 'Before' },
      { label: 'Ingredients ordered', phase: 'Before' },
      { label: 'Staff and crockery confirmed', phase: 'Before' },
      money[1],
    ],
  },
  {
    key: 'makeup_artist', name: 'Makeup artist', blurb: 'Bridal and party makeup',
    services: [
      { name: 'Bridal makeup', hours: 3, price: null, includes: 'Makeup, hair and dupatta setting' },
      { name: 'Party makeup', hours: 1.5, price: null, includes: 'Makeup and hair' },
    ],
    checklist: [
      money[0],
      { label: 'Trial done', phase: 'Before' },
      { label: 'Look and outfit colours shared', phase: 'Before' },
      money[1],
    ],
  },
];

export const tradeByKey = (k: string) => TRADES.find((t) => t.key === k);

export const DEFAULT_CHECKLIST: Item[] = [money[0], { label: 'Details confirmed with client', phase: 'Before' }, money[1]];

export const MESSAGE_TEMPLATES: { kind: string; channel: 'whatsapp' | 'email'; name: string; text: string; enabled: boolean; timing: string | null }[] = [
  // WhatsApp click-to-chat (vendor taps to send)
  { kind: 'advance_reminder', channel: 'whatsapp', name: 'Advance reminder', timing: 'When an inquiry has no advance yet',
    text: 'Assalam o Alaikum [client], a quick reminder about your [function] on [date]. A [advance] advance confirms the date for you. Thank you!', enabled: true },
  { kind: 'quote', channel: 'whatsapp', name: 'Quote', timing: 'When you send a quote',
    text: 'Assalam o Alaikum [client], thank you for asking about [date]. Your quote is [amount] for the [function]. A [advance] advance confirms the date. View it here: [quote link]', enabled: true },
  { kind: 'receipt', channel: 'whatsapp', name: 'Receipt', timing: 'After you record a payment',
    text: 'Thank you [client], we have received [amount] for your [function] on [date]. Your receipt: [receipt link]', enabled: true },
  { kind: 'thanks', channel: 'whatsapp', name: 'Thank you', timing: 'The day after the event',
    text: 'Thank you [client] for having us at your [function]! It would mean a lot if you left us a review: [review link]', enabled: true },
  { kind: 'suggest', channel: 'whatsapp', name: 'Suggest another date', timing: 'When the date asked for is full',
    text: 'Assalam o Alaikum [client], thank you for asking. We are booked on [date], but we are free on [dates]. Would one of these work?', enabled: true },
  { kind: 'decline', channel: 'whatsapp', name: 'Decline politely', timing: 'When you cannot take a request',
    text: 'Assalam o Alaikum [client], thank you so much for thinking of us. Sadly we cannot take your [function] on [date]. We have kept your details and will message you if we free up.', enabled: true },
  // Automatic emails (server sends)
  { kind: 'inquiry_received', channel: 'email', name: 'Inquiry received', timing: 'Right away, if they gave an email', text: 'We have your request for [date] and will reply on WhatsApp soon.', enabled: true },
  { kind: 'new_inquiry', channel: 'email', name: 'New inquiry', timing: 'Right away, to you', text: '[client] asked about [date].', enabled: true },
  { kind: 'booking_confirmed', channel: 'email', name: 'Booking confirmed', timing: 'When a booking becomes Confirmed', text: 'Your [function] on [date] is confirmed.', enabled: true },
  { kind: 'payment_received', channel: 'email', name: 'Payment received', timing: 'Each payment recorded', text: 'We received [amount] for your [function].', enabled: true },
  { kind: 'event_reminder', channel: 'email', name: 'Reminder before the event', timing: '2 days before, 10:00 am', text: 'See you on [date]. Balance due: [amount].', enabled: true },
  { kind: 'tomorrow_glance', channel: 'email', name: 'Tomorrow at a glance', timing: '8:00 pm the day before any event', text: 'Your events tomorrow.', enabled: true },
  { kind: 'advance_missing', channel: 'email', name: 'Advance still missing', timing: '3 days before an event still in Inquiry', text: '[client] has not paid an advance for [date].', enabled: true },
  { kind: 'thank_you', channel: 'email', name: 'Thank you and review', timing: 'Day after, off by default', text: 'Thank you for having us at your [function].', enabled: false },
];
