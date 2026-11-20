import { describe, expect, it } from 'vitest';
import { addDays, insideRescheduleWindow, monthRange, periodRange, pkInstant, pkParts, startOfWeek, weekdayMon0 } from '../src/lib/dates.js';
import { advanceDue, balance, groupPk, moneySummary, rsShort, validatePayment } from '../src/lib/money.js';
import { fillTemplate, waNumber } from '../src/lib/util.js';

describe('money rules', () => {
  it('rounds the advance to whole rupees', () => {
    expect(advanceDue(85000, 40)).toBe(34000);
    expect(advanceDue(99999, 40)).toBe(40000); // 39999.6 -> 40000
    expect(advanceDue(12345, 33)).toBe(4074); // 4073.85
    expect(advanceDue(1001, 50)).toBe(501); // 500.5 rounds half up
    expect(advanceDue(0, 40)).toBe(0);
  });
  it('balance never goes below zero', () => {
    expect(balance(85000, 34000)).toBe(51000);
    expect(balance(85000, 90000)).toBe(0);
  });
  it('summarises advance and full payment', () => {
    const m = moneySummary(85000, 40, 34000);
    expect(m).toMatchObject({ balance: 51000, advanceDue: 34000, advancePaid: true, fullyPaid: false });
    expect(moneySummary(85000, 40, 33999).advancePaid).toBe(false);
    expect(moneySummary(85000, 40, 85000).fullyPaid).toBe(true);
  });
  it('rejects a payment above the balance and keeps refunds sane', () => {
    expect(validatePayment(51001, 85000, 34000)).toMatch(/more than the balance/);
    expect(validatePayment(51000, 85000, 34000)).toBeNull();
    expect(validatePayment(0, 85000, 0)).not.toBeNull();
    expect(validatePayment(12.5, 85000, 0)).not.toBeNull();
    expect(validatePayment(-34000, 85000, 34000)).toBeNull();
    expect(validatePayment(-34001, 85000, 34000)).not.toBeNull();
  });
  it('formats with Pakistani grouping', () => {
    expect(groupPk(120000)).toBe('1,20,000');
    expect(groupPk(1460000)).toBe('14,60,000');
    expect(groupPk(999)).toBe('999');
    expect(groupPk(12345678)).toBe('1,23,45,678');
    expect(rsShort(1460000)).toBe('Rs 14.6 lakh');
    expect(rsShort(336000)).toBe('Rs 3.36 lakh');
    expect(rsShort(51000)).toBe('Rs 51,000');
  });
});

describe('Asia/Karachi dates', () => {
  it('converts instants to Karachi wall-clock (UTC+5)', () => {
    // 20:30 UTC on 18 Nov is 01:30 on 19 Nov in Karachi
    expect(pkParts(new Date('2026-11-18T20:30:00Z'))).toMatchObject({ date: '2026-11-19', hour: 1, minute: 30 });
    expect(pkParts(new Date('2026-11-18T18:59:00Z')).date).toBe('2026-11-18');
    expect(pkInstant('2026-11-18', '19:00').toISOString()).toBe('2026-11-18T14:00:00.000Z');
  });
  it('does date maths without timezone drift', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(weekdayMon0('2026-11-18')).toBe(2); // Wednesday
    expect(startOfWeek('2026-11-22')).toBe('2026-11-16'); // Sunday -> Monday
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
  it('applies the reschedule window', () => {
    expect(insideRescheduleWindow('2026-11-24', 7, '2026-11-18')).toBe(true);
    expect(insideRescheduleWindow('2026-11-25', 7, '2026-11-18')).toBe(false);
    expect(insideRescheduleWindow('2026-11-17', 7, '2026-11-18')).toBe(false);
  });
  it('season runs July to December', () => {
    expect(periodRange('season', '2026-11-18')).toEqual({ from: '2026-07-01', to: '2026-12-31' });
    expect(periodRange('season', '2027-02-10')).toEqual({ from: '2026-07-01', to: '2026-12-31' });
    expect(periodRange('last12', '2026-11-18')).toEqual({ from: '2025-12-01', to: '2026-11-30' });
  });
});

describe('WhatsApp', () => {
  it('converts local numbers for wa.me', () => {
    expect(waNumber('0300 1234567')).toBe('923001234567');
    expect(waNumber('+92 300 1234567')).toBe('923001234567');
    expect(waNumber('3001234567')).toBe('923001234567');
  });
  it('fills placeholders', () => {
    expect(fillTemplate('Hi [client], [amount] for [receipt link]', { client: 'Ayesha', amount: 'Rs 51,000', 'receipt link': 'x' })).toBe('Hi Ayesha, Rs 51,000 for x');
  });
});
