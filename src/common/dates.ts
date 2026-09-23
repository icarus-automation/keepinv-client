import { endOfDay, startOfDay } from 'date-fns';

/** Local-day bound for a filter query. A missing date stays omitted. */
export function startOfDayIso(date: Date | null | undefined): string | undefined {
  if (!date) {
    return undefined;
  }
  return startOfDay(date).toISOString();
}

/** Last local millisecond of the day, for an inclusive filter query. */
export function endOfDayIso(date: Date | null | undefined): string | undefined {
  if (!date) {
    return undefined;
  }
  return endOfDay(date).toISOString();
}
