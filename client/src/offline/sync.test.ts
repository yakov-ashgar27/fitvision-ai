import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addSet, finishWorkout, getWorkout, isSynced, startWorkout, sync } from "./sync";

const setBody = { exercise_id: 1, started_at: "2028-03-05T10:00:00Z", ended_at: "2028-03-05T10:01:00Z", reps: [], scores: [], messages: [], valid: 0 };

describe("offline queue (NFR-12)", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("keeps sets while offline and syncs them once, in order, when the network returns", async () => {
    const calls: string[] = [];
    let online = false;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      if (!online) throw new TypeError("network down");
      calls.push(`${init.method} ${url}`);
      const body = url.endsWith("/sessions") ? { session_id: 7 } : url.endsWith("/finish") ? { report_id: 3 } : {};
      return new Response(JSON.stringify(body), { status: url.endsWith("/sets") ? 201 : 200, headers: { "content-type": "application/json" } });
    }));
    const w = await startWorkout(1, null);
    await addSet(w.localId, setBody);
    await addSet(w.localId, setBody);
    await finishWorkout(w.localId, "Done");
    await sync();
    expect(isSynced((await getWorkout(w.localId))!)).toBe(false);
    expect(calls).toHaveLength(0);

    online = true;
    await sync();
    const after = (await getWorkout(w.localId))!;
    expect(isSynced(after)).toBe(true);
    expect(after.reportId).toBe(3);
    expect(calls).toEqual(["POST /api/sessions", "POST /api/sessions/7/sets", "POST /api/sessions/7/sets", "POST /api/sessions/7/finish"]);
    await sync(); // nothing left to send
    expect(calls).toHaveLength(4);
  });
});
