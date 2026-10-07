// Everything the dashboard shows or sends as a date is in India time (IST),
// matching how the backend reads admin dates.
const IST = 'Asia/Kolkata';

function parts(value: string | Date, options: Intl.DateTimeFormatOptions): Record<string, string> {
  const formatted = new Intl.DateTimeFormat('en-GB', { timeZone: IST, ...options }).formatToParts(new Date(value));
  return Object.fromEntries(formatted.map((part) => [part.type, part.value]));
}

/** 21-Sep-2026 */
export function formatDate(value?: string | null): string {
  if (!value) return '—';
  const p = parts(value, { day: '2-digit', month: 'short', year: 'numeric' });
  return `${p.day}-${p.month}-${p.year}`;
}

/** 21-Sep-2026 10:30 */
export function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const p = parts(value, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return `${formatDate(value)} ${p.hour}:${p.minute}`;
}

/** Today's date in IST as YYYY-MM-DD — the value format of <input type="date">. */
export function todayInputValue(): string {
  const p = parts(new Date(), { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${p.year}-${p.month}-${p.day}`;
}

/** A YYYY-MM-DD date-picker value, as 21-Sep-2026. */
export function formatInputDate(value: string): string {
  return formatDate(`${value}T12:00:00+05:30`);
}
