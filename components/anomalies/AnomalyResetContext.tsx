"use client";

// Scoped context for anomaly reset state management.
// Tracks RESETTING → CLEARED/WAITING transitions via localStorage + polling.
// No Supabase realtime available — uses 30-second polling against b_anomaly_events.

import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getAnomalyDefinition } from "@/lib/anomalies/anomaly-definitions";

type ResetState = "resetting" | "waiting" | null;

interface ResetEntry {
  t_reset: string;
  state: ResetState;
}

interface AnomalyResetContextType {
  getResetState: (anomalyKey: string) => ResetState;
  startReset: (anomalyKey: string, siteId: string) => void;
}

const AnomalyResetContext = createContext<AnomalyResetContextType>({
  getResetState: () => null,
  startReset: () => {},
});

export function useAnomalyReset() {
  return useContext(AnomalyResetContext);
}

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 30 * 1000;

function storageKey(siteId: string, anomalyKey: string) {
  return `anomaly_resetting_${siteId}_${anomalyKey}`;
}

export function AnomalyResetProvider({ siteId, children }: { siteId: string; children: React.ReactNode }) {
  const [resets, setResets] = useState<Record<string, ResetEntry>>({});
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const loaded: Record<string, ResetEntry> = {};
    const now = Date.now();

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(`anomaly_resetting_${siteId}_`)) continue;
      const anomalyKey = key.replace(`anomaly_resetting_${siteId}_`, "");
      const tReset = localStorage.getItem(key);
      if (!tReset) continue;

      const age = now - new Date(tReset).getTime();
      if (age >= FIVE_MINUTES_MS) {
        // Expired — show WAITING state, clear localStorage
        localStorage.removeItem(key);
        loaded[anomalyKey] = { t_reset: tReset, state: "waiting" };
        console.warn("Reset confirmation not received within 5 minutes:", { siteId, anomalyKey, t_reset: tReset });
      } else {
        loaded[anomalyKey] = { t_reset: tReset, state: "resetting" };
      }
    }

    if (Object.keys(loaded).length > 0) {
      setResets(loaded);
    }
  }, [siteId]);

  // Polling confirmation watcher
  useEffect(() => {
    const activeResets = Object.entries(resets).filter(([, r]) => r.state === "resetting");
    if (activeResets.length === 0) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }

    const poll = async () => {
      const now = Date.now();
      const updates: Record<string, ResetEntry> = {};

      for (const [anomalyKey, entry] of activeResets) {
        const age = now - new Date(entry.t_reset).getTime();

        // Timeout: 5 minutes
        if (age >= FIVE_MINUTES_MS) {
          localStorage.removeItem(storageKey(siteId, anomalyKey));
          updates[anomalyKey] = { ...entry, state: "waiting" };
          console.warn("Reset confirmation not received within 5 minutes:", { siteId, anomalyKey, t_reset: entry.t_reset });
          continue;
        }

        // Check for cleared event after t_reset
        const definition = getAnomalyDefinition(anomalyKey);
        if (!definition) continue;

        const { data: events } = await supabase
          .from("b_anomaly_events")
          .select("id, ended_at")
          .eq("site_id", siteId)
          .in("anomaly_type", definition.configKeys)
          .gt("started_at", entry.t_reset)
          .not("ended_at", "is", null)
          .limit(1);

        if (events && events.length > 0) {
          // Confirmed cleared
          localStorage.removeItem(storageKey(siteId, anomalyKey));
          updates[anomalyKey] = { ...entry, state: null };
        }
      }

      if (Object.keys(updates).length > 0) {
        setResets((prev) => {
          const next = { ...prev };
          for (const [key, val] of Object.entries(updates)) {
            if (val.state === null) {
              delete next[key];
            } else {
              next[key] = val;
            }
          }
          return next;
        });
      }
    };

    // Initial poll
    poll();
    // Recurring poll
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [resets, siteId]);

  const startReset = useCallback((anomalyKey: string, resetSiteId: string) => {
    const tReset = new Date().toISOString();
    localStorage.setItem(storageKey(resetSiteId, anomalyKey), tReset);
    setResets((prev) => ({
      ...prev,
      [anomalyKey]: { t_reset: tReset, state: "resetting" },
    }));
  }, []);

  const getResetState = useCallback((anomalyKey: string): ResetState => {
    return resets[anomalyKey]?.state || null;
  }, [resets]);

  return (
    <AnomalyResetContext.Provider value={{ getResetState, startReset }}>
      {children}
    </AnomalyResetContext.Provider>
  );
}
