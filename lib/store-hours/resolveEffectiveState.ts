import { SupabaseClient } from "@supabase/supabase-js";

export interface EffectiveState {
  operating_status: "open" | "closed_exception" | "closed_regular";
  control_phase: "occupied" | "unoccupied";
  source: "exception" | "base" | "none";
  effective_date: string;
  effective_open_time: string | null;
  effective_close_time: string | null;
  exception_event_id: string | null;
  exception_name: string | null;
  warning: string | null;
}

const DAY_NAMES = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

function timeToMinutes(timeStr: string | null): number | null {
  if (!timeStr) return null;
  const parts = timeStr.split(":");
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

/**
 * Canonical resolver for store operating state.
 * This is the SOLE source of truth for whether a site is open, closed,
 * occupied, or unoccupied at any given date/time.
 */
export async function resolveEffectiveState(
  supabase: SupabaseClient,
  siteId: string,
  tz: string,
  /** Override for testing: inject current local date and time-of-day in minutes */
  _nowOverride?: { localDate: string; currentMins: number }
): Promise<EffectiveState> {
  const localDate = _nowOverride?.localDate
    ?? new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const currentMins = _nowOverride?.currentMins ?? (() => {
    const nowInTz = new Date().toLocaleString("en-US", { timeZone: tz });
    const nowDate = new Date(nowInTz);
    return nowDate.getHours() * 60 + nowDate.getMinutes();
  })();
  const [y, m, d] = localDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dayOfWeek = DAY_NAMES[dt.getDay()];

  let operatingStatus: EffectiveState["operating_status"];
  let source: EffectiveState["source"];
  let effectiveOpen: string | null = null;
  let effectiveClose: string | null = null;
  let exceptionEventId: string | null = null;
  let exceptionName: string | null = null;
  let warning: string | null = null;

  // ── STEP A: Check for exception events on today's date ──
  const { data: events } = await supabase
    .from("b_store_hours_events")
    .select("event_id, rule_id, event_date, event_name, is_closed, open_time, close_time, updated_at, created_at")
    .eq("site_id", siteId)
    .eq("event_date", localDate)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (events && events.length > 0) {
    if (events.length > 1) {
      warning = `Multiple exception events (${events.length}) on ${localDate} for site ${siteId}`;
      console.warn(`[resolveEffectiveState] ${warning}`);
    }

    // Closed exception takes precedence
    const closedEvent = events.find((e: any) => e.is_closed);
    if (closedEvent) {
      operatingStatus = "closed_exception";
      source = "exception";
      effectiveOpen = null;
      effectiveClose = null;
      exceptionEventId = closedEvent.event_id;
      exceptionName = closedEvent.event_name || null;
    } else {
      // Hours-modified exception (not closed)
      const event = events[0];

      // Fetch rule details for date_range_daily handling
      let eventOpen = event.open_time;
      let eventClose = event.close_time;

      if (event.rule_id) {
        const { data: rule } = await supabase
          .from("b_store_hours_exception_rules")
          .select("*")
          .eq("rule_id", event.rule_id)
          .single();

        if (rule?.rule_type === "date_range_daily") {
          if (localDate === rule.effective_from_date) {
            eventOpen = rule.start_day_open;
            eventClose = rule.start_day_close;
          } else if (localDate === rule.effective_to_date) {
            eventOpen = rule.end_day_open;
            eventClose = rule.end_day_close;
          } else {
            eventOpen = rule.middle_days_open;
            eventClose = rule.middle_days_close;
          }
        } else if (rule) {
          eventOpen = rule.open_time ?? eventOpen;
          eventClose = rule.close_time ?? eventClose;
        }
      }

      operatingStatus = "open";
      source = "exception";
      effectiveOpen = eventOpen || null;
      effectiveClose = eventClose || null;
      exceptionEventId = event.event_id;
      exceptionName = event.event_name || null;
    }
  } else {
    // ── STEP B: No exception — use base schedule ──
    const { data: baseHours } = await supabase
      .from("b_store_hours")
      .select("open_time, close_time, is_closed")
      .eq("site_id", siteId)
      .eq("day_of_week", dayOfWeek)
      .single();

    if (!baseHours) {
      return {
        operating_status: "closed_regular",
        control_phase: "unoccupied",
        source: "none",
        effective_date: localDate,
        effective_open_time: null,
        effective_close_time: null,
        exception_event_id: null,
        exception_name: null,
        warning: `No base schedule row for site ${siteId} on ${localDate}`,
      };
    }

    if (baseHours.is_closed) {
      operatingStatus = "closed_regular";
      source = "base";
      effectiveOpen = null;
      effectiveClose = null;
    } else {
      operatingStatus = "open";
      source = "base";
      effectiveOpen = baseHours.open_time || null;
      effectiveClose = baseHours.close_time || null;
    }
  }

  // ── STEP C: Resolve control_phase ──
  let controlPhase: EffectiveState["control_phase"] = "unoccupied";

  if (operatingStatus === "open" && effectiveOpen && effectiveClose) {
    const openMins = timeToMinutes(effectiveOpen);
    const closeMins = timeToMinutes(effectiveClose);

    if (openMins !== null && closeMins !== null) {
      if (closeMins < openMins) {
        // Overnight hours: occupied if current >= open OR current < close
        controlPhase = (currentMins >= openMins || currentMins < closeMins)
          ? "occupied"
          : "unoccupied";
      } else {
        // Normal hours: occupied if current >= open AND current < close
        controlPhase = (currentMins >= openMins && currentMins < closeMins)
          ? "occupied"
          : "unoccupied";
      }
    }
  }

  return {
    operating_status: operatingStatus,
    control_phase: controlPhase,
    source,
    effective_date: localDate,
    effective_open_time: effectiveOpen,
    effective_close_time: effectiveClose,
    exception_event_id: exceptionEventId,
    exception_name: exceptionName,
    warning,
  };
}
