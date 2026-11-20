// Creates a demo vendor with realistic bookings through the public API.
// Usage: API_URL=http://localhost:4000 node scripts/seed-demo.mjs
// Sign in afterwards with demo@vendly.pk / demo12345
const API = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '') + '/api';
const EMAIL = process.env.DEMO_EMAIL ?? 'demo@vendly.pk';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'demo12345';
let token = '';

async function call(path, body, method) {
  const r = await fetch(API + path, {
    method: method ?? (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: ${r.status} ${j.error}`);
  return j;
}

const pk = (d = 0) => new Date(Date.now() + 5 * 3600e3 + d * 86400e3).toISOString().slice(0, 10);

try {
  token = (await call('/auth/signup', { name: 'Zain Ahmed', businessName: 'Your Studio', whatsapp: '0300 1234567', email: EMAIL, password: PASSWORD })).token;
} catch (e) {
  if (!String(e.message).includes('409')) throw e;
  token = (await call('/auth/signin', { email: EMAIL, password: PASSWORD })).token;
  console.log('Demo account exists; adding more bookings to it.');
}

await call('/setup/trades', { trades: ['photo_booth'], cities: ['Islamabad', 'Rawalpindi'], capacityPerDate: 1 });
await call('/business/handle', { handle: 'yourstudio' }, 'PUT').catch(() => {});
await call('/business', { setupDone: { services: true } }, 'PATCH');
// Demo uses the Team plan so the Free monthly limit and the Reports upgrade prompt don't get in the way
if (process.env.ADMIN_SECRET) {
  await fetch(`${API}/admin/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-secret': process.env.ADMIN_SECRET }, body: JSON.stringify({ email: EMAIL, plan: 'team' }) });
} else console.warn('ADMIN_SECRET not set: demo stays on the Free plan (10 bookings a month).');
const services = await call('/services');

const people = [
  ['Ayesha & Hamza', 'Ayesha Khan', '0300 1112233', 'Mehndi', 0, '19:00', 3, 1, 'Shalimar Marquee, Bahria Town', 0.4],
  ['Ayesha & Hamza', 'Ayesha Khan', '0300 1112233', 'Barat', 1, '20:00', 4, 2, 'Shalimar Marquee, Bahria Town', 0.4],
  ['Sana & Bilal', 'Sana Malik', '0301 2223344', 'Walima', 2, '13:00', 3, 1, 'Serena Hotel, Islamabad', 1],
  ['Laiba & Usman', 'Laiba Shah', '0302 3334455', 'Barat', 4, '20:00', 4, 2, 'Grand Marquee, DHA Phase 2', 0.4],
  ['Hira Birthday', 'Hira Qureshi', '0303 4445566', 'Birthday', 5, '17:00', 2, 0, 'F-7 Markaz', 0],
  ['Mahnoor & Ali', 'Mahnoor Raza', '0304 5556677', 'Mehndi', 6, '19:30', 3, 1, 'Pearl Continental, Rawalpindi', 0.4],
  ['Areeba & Saad', 'Areeba Iqbal', '0305 6667788', 'Nikah', 8, '16:00', 2, 0, 'Faisal Mosque lawn', 0],
  ['TechCorp dinner', 'Kamran Butt', '0306 7778899', 'Corporate', 9, '20:00', 3, 1, 'Marriott, Islamabad', 0.5],
  ['Zara & Fahad', 'Zara Hussain', '0307 8889900', 'Engagement', 11, '18:00', 2, 0, 'Monal, Pir Sohawa', 0.4],
  ['Noor & Hassan', 'Noor Fatima', '0308 9990011', 'Barat', 15, '20:00', 4, 2, 'Royal Palm, Lahore Road', 0.4],
  ['Iqra & Omer', 'Iqra Javed', '0309 1231231', 'Walima', -3, '13:00', 3, 1, 'Serena Hotel, Islamabad', 1],
  ['Amna & Taha', 'Amna Riaz', '0310 3213213', 'Mehndi', -6, '19:00', 3, 1, 'Jinnah Convention Centre', 0.7],
];

let n = 0;
let familyIds = {};
for (const [family, name, phone, fn, day, time, hours, svc, venue, paidShare] of people) {
  const s = services[svc] ?? services[0];
  try {
    const b = await call('/bookings', {
      client: { name, whatsapp: phone },
      ...(familyIds[family] ? { familyId: familyIds[family].fid, clientId: familyIds[family].cid, client: undefined } : { familyLabel: family }),
      functionType: fn, date: pk(day), startTime: time, hours, serviceId: s.id, venue, city: 'Islamabad',
      total: s.price ?? 85000, overrideClash: true, allowPast: true,
      advance: paidShare > 0 ? { amount: Math.round((s.price ?? 85000) * Math.min(paidShare, 0.4)), method: 'bank', receivedOn: pk(Math.min(day, 0) - 20) } : null,
    });
    familyIds[family] ??= { fid: b.familyId, cid: b.client.id };
    const rest = Math.round((s.price ?? 85000) * paidShare) - Math.round((s.price ?? 85000) * Math.min(paidShare, 0.4));
    if (rest > 0) await call(`/bookings/${b.id}/payments`, { amount: rest, method: 'cash', receivedOn: pk(Math.min(day, 0)) });
    n++;
  } catch (e) {
    console.warn('skip', family, fn, e.message);
  }
}

for (const [name, phone, fn, day] of [['Maryam Khalid', '0321 7654321', 'Barat', 30], ['Fatima Noor', '0322 1112223', 'Mehndi', 21], ['Rabia Anwar', '0323 2223334', 'Walima', 4]]) {
  await fetch(`${API}/public/b/yourstudio/inquiries`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientName: name, whatsapp: phone, functionType: fn, date: pk(day), serviceId: services[1]?.id, message: 'Is this date free?' }),
  });
}
console.log(`Seeded ${n} bookings and 3 inquiries. Sign in: ${EMAIL} / ${PASSWORD}`);
