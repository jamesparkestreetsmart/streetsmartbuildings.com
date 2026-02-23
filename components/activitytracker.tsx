"use client";
import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function ActivityTracker({ userId }: { userId: string }) {
  useEffect(() => {
    if (!userId) return;

    const updateActivity = async () => {
      await supabase
        .from("a_users")
        .update({ last_activity_at: new Date().toISOString() })
        .eq("user_id", userId);
    };

    // Update once when the user loads the page
    updateActivity();

    // And every 5 minutes while active
    const interval = setInterval(updateActivity, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [userId]);

  return null;
}
