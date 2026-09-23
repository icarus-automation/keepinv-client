import { addDays, endOfDay, isSameDay, startOfDay, startOfMonth } from 'date-fns';

import { endOfDayIso, startOfDayIso } from './dates';

/** The calendar math the screens used to copy by hand. */
function legacyStartOfDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

function legacyEndOfDay(date: Date): Date {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

function legacyAddDays(date: Date, days: number): Date {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

function legacyStartOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function legacySameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const SAMPLES = [
  new Date(2026, 8, 24, 15, 30, 45, 123),
  new Date(2026, 0, 1, 0, 0, 0, 0),
  new Date(2024, 1, 29, 23, 59, 59, 999),
  new Date(2026, 11, 31, 12, 0, 0, 0),
];

describe('local calendar bounds', () => {
  it('matches the previous setHours and setDate helpers', () => {
    for (const date of SAMPLES) {
      expect(startOfDay(date).getTime()).toBe(legacyStartOfDay(date).getTime());
      expect(endOfDay(date).getTime()).toBe(legacyEndOfDay(date).getTime());
      expect(addDays(date, -6).getTime()).toBe(legacyAddDays(date, -6).getTime());
      expect(addDays(date, -29).getTime()).toBe(legacyAddDays(date, -29).getTime());
      expect(startOfMonth(date).getTime()).toBe(legacyStartOfMonth(date).getTime());
      expect(isSameDay(date, legacyStartOfDay(date))).toBe(legacySameDay(date, legacyStartOfDay(date)));
      expect(isSameDay(date, addDays(date, 1))).toBe(false);
    }
  });

  it('turns a local day into an inclusive ISO filter bound', () => {
    const date = new Date(2026, 8, 24, 15, 30, 0, 0);
    expect(startOfDayIso(date)).toBe(legacyStartOfDay(date).toISOString());
    expect(endOfDayIso(date)).toBe(legacyEndOfDay(date).toISOString());
    expect(startOfDayIso(null)).toBeUndefined();
    expect(endOfDayIso(undefined)).toBeUndefined();
  });
});
