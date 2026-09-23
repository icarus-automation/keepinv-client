import { summarizeSales } from './report.types';
import { SaleListItem } from '../types/pos.types';

function sale(completedAt: Date, total = '100.00'): SaleListItem {
  return {
    id: completedAt.toISOString(),
    receiptNo: 'R-1',
    status: 'COMPLETED',
    subtotal: total,
    total,
    amountTendered: total,
    changeDue: '0.00',
    paymentMethod: 'CASH',
    note: null,
    completedAt: completedAt.toISOString(),
    voidedAt: null,
    voidReason: null,
    cashier: null,
    voidedBy: null,
    _count: { items: 1 },
  };
}

describe('summarizeSales day buckets', () => {
  it('keeps one bar per day, including empty days', () => {
    const from = new Date(2026, 5, 1, 8, 0, 0);
    const to = new Date(2026, 5, 3, 18, 0, 0);
    const summary = summarizeSales([sale(new Date(2026, 5, 2, 12, 0, 0))], from, to, 'day');

    expect(summary.trend.map((bucket) => bucket.label)).toEqual(['1', '2', '3']);
    expect(summary.trend.map((bucket) => bucket.fullLabel)).toEqual(['Mon Jun 1', 'Tue Jun 2', 'Wed Jun 3']);
    expect(summary.trend.map((bucket) => bucket.revenueCents)).toEqual([0, 10000, 0]);
  });

  it('caps a long custom range at 92 bars', () => {
    const summary = summarizeSales([], new Date(2026, 0, 1), new Date(2026, 11, 31), 'day');
    expect(summary.trend).toHaveLength(92);
    expect(summary.trend[0].label).toBe('1');
  });

  it('returns no bars when the range is backwards', () => {
    const summary = summarizeSales([], new Date(2026, 5, 3), new Date(2026, 5, 1), 'day');
    expect(summary.trend).toEqual([]);
  });
});
