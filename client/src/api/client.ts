/** Thin fetch wrapper: JWT header, Hebrew error messages from the server, and job polling. */
import type { Job } from "./types";

const TOKEN_KEY = "fv:token";
export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode */
  }
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

function detailToText(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => (d && typeof d === "object" && "msg" in d ? String(d.msg) : String(d))).join(" · ");
  return "שגיאה בבקשה";
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers, body });
  } catch {
    throw new ApiError(0, "אין חיבור לשרת");
  }
  if (res.status === 401 && token) onUnauthorized?.();
  if (!res.ok) {
    let msg = `שגיאה ${res.status}`;
    try {
      msg = detailToText((await res.json()).detail);
    } catch {
      /* not json */
    }
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") ?? "";
  return (ct.includes("application/json") ? res.json() : res.blob()) as Promise<T>;
}

/** Waits for a background job (202 + job id) to finish, polling with a gentle backoff. */
export async function waitForJob(job: Job, timeoutMs = 30_000): Promise<Job> {
  const start = Date.now();
  let delay = 300;
  let cur = job;
  while (cur.status !== "finished" && cur.status !== "failed") {
    if (Date.now() - start > timeoutMs) throw new ApiError(504, "הפעולה נמשכת יותר מהצפוי");
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, 2000);
    cur = await api<Job>(`/jobs/${job.job_id}`);
  }
  if (cur.status === "failed") throw new ApiError(500, cur.error ?? "הפעולה נכשלה");
  return cur;
}

export async function downloadFile(path: string, filename: string): Promise<void> {
  const blob = await api<Blob>(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
