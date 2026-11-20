// Money rules (spec: Money rules). All amounts are whole rupees.

export const advanceDue = (total: number, advancePct: number) => Math.round((total * advancePct) / 100);

export const sumPaid = (payments: { amount: number }[]) => payments.reduce((s, p) => s + Number(p.amount), 0);

export const balance = (total: number, paid: number) => Math.max(0, total - paid);

export interface MoneySummary {
  total: number;
  paid: number;
  balance: number;
  advanceDue: number;
  advancePaid: boolean;
  fullyPaid: boolean;
}

export function moneySummary(total: number, advancePct: number, paid: number): MoneySummary {
  const adv = advanceDue(total, advancePct);
  return {
    total,
    paid,
    balance: balance(total, paid),
    advanceDue: adv,
    advancePaid: paid >= adv && (total > 0 || paid > 0),
    fullyPaid: total > 0 && paid >= total,
  };
}

/** A payment can't be more than the balance left. Refunds (negative) are allowed up to what was paid. */
export function validatePayment(amount: number, total: number, paid: number): string | null {
  if (!Number.isInteger(amount) || amount === 0) return 'Enter a whole-rupee amount';
  if (amount > 0 && amount > balance(total, paid)) {
    return `That is more than the balance left (Rs ${formatRs(balance(total, paid))})`;
  }
  if (amount < 0 && -amount > paid) return 'A refund cannot be more than what was paid';
  return null;
}

/** Pakistani digit grouping: 120000 -> "1,20,000" */
export function groupPk(n: number): string {
  const neg = n < 0;
  const s = String(Math.abs(Math.round(n)));
  if (s.length <= 3) return (neg ? '-' : '') + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return (neg ? '-' : '') + rest + ',' + last3;
}
export const formatRs = groupPk;
export const rs = (n: number) => `Rs ${groupPk(n)}`;

/** Big totals: 1460000 -> "Rs 14.6 lakh", 12500000 -> "Rs 1.25 crore" */
export function rsShort(n: number): string {
  const a = Math.abs(n);
  const trim = (x: number) => String(Number(x.toFixed(x >= 10 ? 1 : 2)));
  if (a >= 1e7) return `Rs ${n < 0 ? '-' : ''}${trim(a / 1e7)} crore`;
  if (a >= 1e5) return `Rs ${n < 0 ? '-' : ''}${trim(a / 1e5)} lakh`;
  return rs(n);
}
