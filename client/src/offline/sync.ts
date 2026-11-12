/**
 * Offline-first workout storage (NFR-12, R-05). Every set is written to IndexedDB first and shown as
 * "saved" immediately (optimistic, 6.3.1); a background loop pushes it to the server when the network allows.
 * Re-sending a set is safe: the server's unique (session_id, set_number) index makes it idempotent.
 */
import { api, ApiError } from "../api/client";
import type { SessionSummary, SetIn } from "../api/types";
import { store } from "./db";

export interface LocalSet extends SetIn {
  synced: boolean;
  scores: number[]; // per-rep scores, for the local summary
  valid: number; // valid reps (BR-01)
  messages: string[]; // feedback shown, for the local summary
}

export interface LocalWorkout {
  localId: string;
  serverId: number | null;
  planId: number | null;
  startedAt: string;
  sets: LocalSet[];
  finish: { status: "Done" | "Aborted"; endedAt: string; synced: boolean } | null;
  reportId: number | null;
  ownerId: number;
}

type Listener = (w: LocalWorkout[]) => void;
const listeners = new Set<Listener>();
let running: Promise<void> | null = null;

export function onChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function emit() {
  const all = await store.all<LocalWorkout>();
  listeners.forEach((l) => l(all));
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export async function startWorkout(ownerId: number, planId: number | null): Promise<LocalWorkout> {
  const w: LocalWorkout = { localId: uid(), serverId: null, planId, startedAt: new Date().toISOString(), sets: [], finish: null, reportId: null, ownerId };
  await store.put(w);
  void sync();
  return w;
}

export async function addSet(localId: string, set: Omit<LocalSet, "synced" | "set_number">): Promise<LocalWorkout> {
  const w = await store.get<LocalWorkout>(localId);
  if (!w) throw new Error("workout not found");
  w.sets.push({ ...set, set_number: w.sets.length + 1, synced: false });
  await store.put(w);
  await emit();
  void sync();
  return w;
}

export async function finishWorkout(localId: string, status: "Done" | "Aborted"): Promise<LocalWorkout> {
  const w = await store.get<LocalWorkout>(localId);
  if (!w) throw new Error("workout not found");
  w.finish = { status, endedAt: new Date().toISOString(), synced: false };
  await store.put(w);
  await emit();
  void sync();
  return w;
}

export const getWorkout = (localId: string) => store.get<LocalWorkout>(localId);
export const pendingCount = async () => (await store.all<LocalWorkout>()).filter((w) => !isSynced(w)).length;
export const isSynced = (w: LocalWorkout) => w.serverId !== null && w.sets.every((s) => s.synced) && (w.finish?.synced ?? false);

async function syncOne(w: LocalWorkout): Promise<void> {
  if (w.serverId === null) {
    const s = await api<SessionSummary>("/sessions", {
      method: "POST",
      json: { plan_id: w.planId, started_at: w.startedAt, device_info: navigator.userAgent.slice(0, 120) },
    });
    w.serverId = s.session_id;
    await store.put(w);
  }
  for (const s of w.sets) {
    if (s.synced) continue;
    const body = {
      exercise_id: s.exercise_id,
      set_number: s.set_number,
      started_at: s.started_at,
      ended_at: s.ended_at,
      reps: s.reps,
    };
    await api(`/sessions/${w.serverId}/sets`, { method: "POST", json: body });
    s.synced = true;
    await store.put(w);
  }
  if (w.finish && !w.finish.synced) {
    const res = await api<{ report_id: number | null }>(`/sessions/${w.serverId}/finish`, {
      method: "POST",
      json: { status: w.finish.status, ended_at: w.finish.endedAt },
    });
    w.finish.synced = true;
    w.reportId = res.report_id;
    await store.put(w);
  }
}

/** Pushes every unsynced workout; stops quietly when offline and resumes on the next trigger. */
export function sync(): Promise<void> {
  if (running) return running;
  running = (async () => {
    try {
      for (const w of await store.all<LocalWorkout>()) {
        if (isSynced(w)) continue;
        try {
          await syncOne(w);
        } catch (e) {
          if (e instanceof ApiError && e.status === 0) break; // offline: retry later
          if (e instanceof ApiError && (e.status === 401 || e.status === 409)) break; // needs login / consent
          console.warn("sync failed", e);
        }
      }
    } finally {
      running = null;
      await emit();
    }
  })();
  return running;
}

/** Removes synced workouts older than a week so the device does not keep data it no longer needs. */
export async function prune(): Promise<void> {
  const weekAgo = Date.now() - 7 * 86400_000;
  for (const w of await store.all<LocalWorkout>()) if (isSynced(w) && Date.parse(w.startedAt) < weekAgo) await store.remove(w.localId);
}

export function startBackgroundSync(): () => void {
  const onOnline = () => void sync();
  window.addEventListener("online", onOnline);
  const t = window.setInterval(() => void sync(), 15_000);
  void sync().then(prune);
  return () => {
    window.removeEventListener("online", onOnline);
    window.clearInterval(t);
  };
}
