import { eachDayOfInterval, format, startOfDay } from 'date-fns';

import { PaymentMethod, SaleListItem, paymentMethodMeta, priceToCents } from '../types/pos.types';

/** A preset reporting window, or a custom date range. */
export type ReportPeriod = 'today' | '7d' | '30d' | 'custom';

/** Trend bars are bucketed by hour for a single day, by day for a longer range. */
export type TrendGranularity = 'hour' | 'day';

/** One bar on the revenue trend. Money in centavos so bar scaling never drifts. */
export interface TrendBucket {
  /** Stable key for `@for` tracking. */
  readonly key: string;
  /** Compact axis label, e.g. "2pm" or "3". */
  readonly label: string;
  /** Full label for tooltip/aria, e.g. "Tue Jun 3" or "2:00 PM". */
  readonly fullLabel: string;
  readonly revenueCents: number;
  readonly salesCount: number;
}

/** Revenue split by how it was paid. */
export interface PaymentSlice {
  readonly method: PaymentMethod;
  readonly label: string;
  readonly amountCents: number;
  readonly count: number;
  /** Share of revenue, 0–100, rounded for display. */
  readonly pct: number;
}

/** The fully aggregated report for one period. Voids are tracked apart from revenue. */
export interface ReportSummary {
  readonly revenueCents: number;
  readonly salesCount: number;
  readonly itemsSold: number;
  readonly avgTicketCents: number;
  readonly voidCount: number;
  readonly voidAmountCents: number;
  readonly payments: PaymentSlice[];
  readonly trend: TrendBucket[];
  /** Largest bucket revenue, for scaling bar heights. At least 1 to avoid divide-by-zero. */
  readonly maxBucketCents: number;
}

interface MutableBucket {
  key: string;
  label: string;
  fullLabel: string;
  revenueCents: number;
  salesCount: number;
}

/**
 * Aggregate a period's sales into the report summary. Revenue, count, items, and the
 * payment mix come from COMPLETED sales only; VOIDED sales are excluded from revenue
 * and reported separately. All money is summed in integer centavos. Pure: the same
 * sales over the same window always produce the same summary.
 */
export function summarizeSales(
  sales: SaleListItem[],
  from: Date,
  to: Date,
  granularity: TrendGranularity,
): ReportSummary {
  const completed = sales.filter((sale) => sale.status === 'COMPLETED');
  const voided = sales.filter((sale) => sale.status === 'VOIDED');

  const revenueCents = completed.reduce((sum, sale) => sum + priceToCents(sale.total), 0);
  const salesCount = completed.length;
  const itemsSold = completed.reduce((sum, sale) => sum + (sale._count?.items ?? 0), 0);
  const avgTicketCents = salesCount ? Math.round(revenueCents / salesCount) : 0;
  const voidAmountCents = voided.reduce((sum, sale) => sum + priceToCents(sale.total), 0);

  const trend = granularity === 'hour' ? hourBuckets(completed) : dayBuckets(completed, from, to);
  const maxBucketCents = Math.max(1, ...trend.map((bucket) => bucket.revenueCents));

  return {
    revenueCents,
    salesCount,
    itemsSold,
    avgTicketCents,
    voidCount: voided.length,
    voidAmountCents,
    payments: paymentSlices(completed, revenueCents),
    trend,
    maxBucketCents,
  };
}

function paymentSlices(completed: SaleListItem[], revenueCents: number): PaymentSlice[] {
  const totals = new Map<PaymentMethod, { amountCents: number; count: number }>();
  for (const sale of completed) {
    const current = totals.get(sale.paymentMethod) ?? { amountCents: 0, count: 0 };
    current.amountCents += priceToCents(sale.total);
    current.count += 1;
    totals.set(sale.paymentMethod, current);
  }

  return [...totals.entries()]
    .map(([method, { amountCents, count }]) => ({
      method,
      label: paymentMethodMeta(method).label,
      amountCents,
      count,
      pct: revenueCents ? Math.round((amountCents / revenueCents) * 100) : 0,
    }))
    .sort((a, b) => b.amountCents - a.amountCents);
}

/** One bar per day in [from, to]. Empty days render as zero-height bars, keeping the rhythm honest. */
function dayBuckets(completed: SaleListItem[], from: Date, to: Date): TrendBucket[] {
  const start = startOfDay(from);
  const end = startOfDay(to);
  if (start.getTime() > end.getTime()) {
    return [];
  }

  // Cap at a quarter's worth of bars so a pathological custom range can't run away.
  const days = eachDayOfInterval({ start, end }).slice(0, 92);
  const buckets: MutableBucket[] = days.map((day) => ({
    key: format(day, 'yyyy-MM-dd'),
    label: format(day, 'd'),
    fullLabel: format(day, 'EEE MMM d'),
    revenueCents: 0,
    salesCount: 0,
  }));
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  for (const sale of completed) {
    const bucket = byKey.get(format(new Date(sale.completedAt), 'yyyy-MM-dd'));
    if (bucket) {
      bucket.revenueCents += priceToCents(sale.total);
      bucket.salesCount += 1;
    }
  }

  return buckets;
}

/** One bar per active hour, from the first sale's hour to the last. Skips dead early/late hours. */
function hourBuckets(completed: SaleListItem[]): TrendBucket[] {
  if (completed.length === 0) {
    return [];
  }

  const hours = completed.map((sale) => new Date(sale.completedAt).getHours());
  const min = Math.min(...hours);
  const max = Math.max(...hours);

  const buckets: MutableBucket[] = [];
  const byHour = new Map<number, MutableBucket>();
  for (let hour = min; hour <= max; hour += 1) {
    const bucket: MutableBucket = {
      key: `h${hour}`,
      label: shortHour(hour),
      fullLabel: fullHour(hour),
      revenueCents: 0,
      salesCount: 0,
    };
    buckets.push(bucket);
    byHour.set(hour, bucket);
  }

  for (const sale of completed) {
    const bucket = byHour.get(new Date(sale.completedAt).getHours());
    if (bucket) {
      bucket.revenueCents += priceToCents(sale.total);
      bucket.salesCount += 1;
    }
  }

  return buckets;
}

function shortHour(hour: number): string {
  const period = hour < 12 ? 'am' : 'pm';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}${period}`;
}

function fullHour(hour: number): string {
  const period = hour < 12 ? 'AM' : 'PM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:00 ${period}`;
}
