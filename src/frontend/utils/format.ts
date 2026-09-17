const pad = (n: number) => n.toString().padStart(2, "0");

/** "4 Sep": the day and month piece of every date shown at list size. */
function dayMonth(d: Date): string {
	return `${d.getDate()} ${d.toLocaleDateString("en-US", { month: "short" })}`;
}

/** An ISO timestamp as a local day: "4 Sep 2026". */
export function formatFullDate(iso: string): string {
	const d = new Date(iso);
	return `${dayMonth(d)} ${d.getFullYear()}`;
}

/** An ISO timestamp as a local day and time: "4 Sep 2026, 13:42". */
export function formatDateTime(iso: string): string {
	const d = new Date(iso);
	return `${formatFullDate(iso)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A "YYYY-MM-DD" day as a local Date. `new Date(day)` would be UTC midnight: the day before, west of UTC. */
function parseDay(day: string): Date {
	return new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
}

/** A "YYYY-MM-DD" day as "04.09.2026". */
export function formatDay(day: string): string {
	return `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;
}

/** Typed "dd.mm.yyyy" or "d.m.yyyy" as "YYYY-MM-DD", or null when the text is not a real day. */
export function parseTypedDay(text: string): string | null {
	const match = /^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*$/.exec(text);
	if (match === null) return null;
	const d = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
	// An overflow such as 31.02 rolls into the next month: not the typed day.
	return d.getDate() === Number(match[1]) && d.getMonth() === Number(match[2]) - 1 ? toDay(d) : null;
}

/** A "YYYY-MM-DD" day at list size: "4 Sep" this year, "4 Sep 2025" before or after. */
export function formatShortDay(day: string): string {
	const d = parseDay(day);
	return d.getFullYear() === new Date().getFullYear() ? dayMonth(d) : `${dayMonth(d)} ${d.getFullYear()}`;
}

function toDay(d: Date): string {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Today in local time as "YYYY-MM-DD". */
export function today(): string {
	return toDay(new Date());
}

export type DueUrgency = "overdue" | "soon" | "later";

/**
 * How pressing a due day is against `now`, today by default: before it is overdue, within the next 3 days is soon,
 * so the same cut for every mark and list. The format sorts as text.
 */
export function dueUrgency(day: string, now = today()): DueUrgency {
	if (day < now) return "overdue";
	return day <= addDays(now, 3) ? "soon" : "later";
}

/** The day `days` after `day`. */
export function addDays(day: string, days: number): string {
	const d = parseDay(day);
	d.setDate(d.getDate() + days);
	return toDay(d);
}

/** A repeat as "every 60 days" or "every day". */
export function formatRepeat(days: number): string {
	return days === 1 ? "every day" : `every ${days} days`;
}

/** An ISO timestamp at list size: "13:42" today, "4 Sep" this year, "4 Sep 2025" before. */
export function formatShortDate(iso: string): string {
	const d = new Date(iso);
	const now = new Date();
	if (d.toDateString() === now.toDateString()) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
	return d.getFullYear() === now.getFullYear() ? dayMonth(d) : `${dayMonth(d)} ${d.getFullYear()}`;
}
