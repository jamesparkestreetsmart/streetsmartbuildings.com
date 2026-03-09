/**
 * Regression tests for resolveEffectiveState.
 *
 * Run with: npx jest __tests__/resolveEffectiveState.test.ts
 *
 * Uses a mock Supabase client — no DB connection needed.
 */

import { resolveEffectiveState } from "@/lib/store-hours/resolveEffectiveState";

// ── Mock Supabase builder ────────────────────────────────────────────────────

type MockData = {
  b_store_hours_events: any[];
  b_store_hours_exception_rules: Record<string, any>;
  b_store_hours: Record<string, any>; // keyed by day_of_week
};

function createMockSupabase(data: MockData) {
  return {
    from(table: string) {
      let filters: Record<string, any> = {};

      function makeThenable(resolveData: () => any) {
        const chain: any = {
          select() { return chain; },
          eq(col: string, val: any) { filters[col] = val; return chain; },
          order() { return chain; },
          single() {
            return Promise.resolve(resolveData());
          },
          then(resolve: any, reject?: any) {
            return Promise.resolve(resolveData()).then(resolve, reject);
          },
        };
        return chain;
      }

      return makeThenable(() => {
        if (table === "b_store_hours_events") {
          const eventDate = filters["event_date"];
          const rows = data.b_store_hours_events.filter((e: any) => e.event_date === eventDate);
          return { data: rows, error: null };
        }
        if (table === "b_store_hours") {
          const dow = filters["day_of_week"];
          return { data: data.b_store_hours[dow] ?? null, error: null };
        }
        if (table === "b_store_hours_exception_rules") {
          const ruleId = filters["rule_id"];
          return { data: data.b_store_hours_exception_rules[ruleId] ?? null, error: null };
        }
        return { data: null, error: null };
      });
    },
  } as any;
}

// ── Tests ────────────────────────────────────────────────────────────────────

// 2026-03-09 is a Monday

describe("resolveEffectiveState", () => {
  test("exception with is_closed = true → closed_exception", async () => {
    const sb = createMockSupabase({
      b_store_hours_events: [
        { event_id: "e1", rule_id: "r1", event_date: "2026-03-09", event_name: "Holiday", is_closed: true },
      ],
      b_store_hours_exception_rules: { r1: { rule_id: "r1", is_closed: true } },
      b_store_hours: { monday: { open_time: "07:00", close_time: "20:00", is_closed: false } },
    });
    const r = await resolveEffectiveState(sb, "site1", "America/Chicago", { localDate: "2026-03-09", currentMins: 720 });
    expect(r.operating_status).toBe("closed_exception");
    expect(r.control_phase).toBe("unoccupied");
    expect(r.source).toBe("exception");
    expect(r.exception_name).toBe("Holiday");
  });

  test("exception with modified hours, within window → occupied", async () => {
    const sb = createMockSupabase({
      b_store_hours_events: [
        { event_id: "e2", rule_id: "r2", event_date: "2026-03-09", event_name: "Early close", is_closed: false, open_time: "09:00", close_time: "14:00" },
      ],
      b_store_hours_exception_rules: { r2: { rule_id: "r2", is_closed: false, open_time: "09:00", close_time: "14:00" } },
      b_store_hours: { monday: { open_time: "07:00", close_time: "20:00", is_closed: false } },
    });
    const r = await resolveEffectiveState(sb, "site1", "America/Chicago", { localDate: "2026-03-09", currentMins: 600 }); // 10:00 AM
    expect(r.operating_status).toBe("open");
    expect(r.control_phase).toBe("occupied");
    expect(r.source).toBe("exception");
  });

  test("base schedule, within open window → occupied", async () => {
    const sb = createMockSupabase({
      b_store_hours_events: [],
      b_store_hours_exception_rules: {},
      b_store_hours: { monday: { open_time: "07:00", close_time: "20:00", is_closed: false } },
    });
    const r = await resolveEffectiveState(sb, "site1", "America/Chicago", { localDate: "2026-03-09", currentMins: 720 }); // noon
    expect(r.operating_status).toBe("open");
    expect(r.control_phase).toBe("occupied");
    expect(r.source).toBe("base");
  });

  test("base schedule, outside open window → unoccupied", async () => {
    const sb = createMockSupabase({
      b_store_hours_events: [],
      b_store_hours_exception_rules: {},
      b_store_hours: { monday: { open_time: "07:00", close_time: "20:00", is_closed: false } },
    });
    const r = await resolveEffectiveState(sb, "site1", "America/Chicago", { localDate: "2026-03-09", currentMins: 1260 }); // 9 PM
    expect(r.operating_status).toBe("open");
    expect(r.control_phase).toBe("unoccupied");
  });

  test("no base row for day_of_week → closed_regular with warning", async () => {
    const sb = createMockSupabase({
      b_store_hours_events: [],
      b_store_hours_exception_rules: {},
      b_store_hours: {}, // no monday entry
    });
    const r = await resolveEffectiveState(sb, "site1", "America/Chicago", { localDate: "2026-03-09", currentMins: 720 });
    expect(r.operating_status).toBe("closed_regular");
    expect(r.control_phase).toBe("unoccupied");
    expect(r.source).toBe("none");
    expect(r.warning).not.toBeNull();
  });

  test("multiple exceptions same date, closed wins", async () => {
    const sb = createMockSupabase({
      b_store_hours_events: [
        { event_id: "e3", rule_id: "r3", event_date: "2026-03-09", event_name: "Modified hours", is_closed: false, open_time: "10:00", close_time: "15:00" },
        { event_id: "e4", rule_id: "r4", event_date: "2026-03-09", event_name: "Emergency close", is_closed: true },
      ],
      b_store_hours_exception_rules: {},
      b_store_hours: { monday: { open_time: "07:00", close_time: "20:00", is_closed: false } },
    });
    const r = await resolveEffectiveState(sb, "site1", "America/Chicago", { localDate: "2026-03-09", currentMins: 720 });
    expect(r.operating_status).toBe("closed_exception");
    expect(r.exception_name).toBe("Emergency close");
    expect(r.warning).not.toBeNull();
  });

  test("overnight hours (close < open) — correct occupancy", async () => {
    const sb = createMockSupabase({
      b_store_hours_events: [],
      b_store_hours_exception_rules: {},
      b_store_hours: { monday: { open_time: "18:00", close_time: "02:00", is_closed: false } },
    });
    // 11 PM (23:00 = 1380 min) — should be occupied (after open)
    const r1 = await resolveEffectiveState(sb, "site1", "America/Chicago", { localDate: "2026-03-09", currentMins: 1380 });
    expect(r1.control_phase).toBe("occupied");

    // 1 AM (60 min) — should be occupied (before close)
    const r2 = await resolveEffectiveState(sb, "site1", "America/Chicago", { localDate: "2026-03-09", currentMins: 60 });
    expect(r2.control_phase).toBe("occupied");

    // 10 AM (600 min) — should be unoccupied (between close and open)
    const r3 = await resolveEffectiveState(sb, "site1", "America/Chicago", { localDate: "2026-03-09", currentMins: 600 });
    expect(r3.control_phase).toBe("unoccupied");
  });

  test("base row with is_closed = true → closed_regular", async () => {
    const sb = createMockSupabase({
      b_store_hours_events: [],
      b_store_hours_exception_rules: {},
      b_store_hours: { monday: { open_time: null, close_time: null, is_closed: true } },
    });
    const r = await resolveEffectiveState(sb, "site1", "America/Chicago", { localDate: "2026-03-09", currentMins: 720 });
    expect(r.operating_status).toBe("closed_regular");
    expect(r.control_phase).toBe("unoccupied");
    expect(r.source).toBe("base");
  });
});
