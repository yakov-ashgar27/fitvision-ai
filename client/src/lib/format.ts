const dtf = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "numeric", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const df = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "numeric", year: "numeric" });

/** Server timestamps are naive UTC. */
export const parseUtc = (s: string) => new Date(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : `${s}Z`);
export const fmtDateTime = (s: string | null | undefined) => (s ? dtf.format(parseUtc(s)) : "—");
export const fmtDate = (s: string | null | undefined) => (s ? df.format(parseUtc(s)) : "—");
export const fmtScore = (n: number | null | undefined) => (n == null ? "—" : Math.round(n).toString());
export const fmtPct = (n: number | null | undefined) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`);
export const daysAgo = (s: string | null | undefined) => (s ? Math.floor((Date.now() - parseUtc(s).getTime()) / 86400_000) : null);
export const STATUS_HE: Record<string, string> = { Draft: "טיוטה", Reviewed: "נסקר", Sent: "נשלח", Done: "הושלם", Aborted: "הופסק", InProgress: "בתהליך", Pending: "ממתין", Active: "פעיל", Ended: "הסתיים" };
