"use client";
import { useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function ActivityTracker({ userId }: { userId: string }) {
  useEffect(() => {
    if (!userId) return;

    const updateActivity = async () => {
      await supabase
        .from("a_users")
        .update({ last_activity_at: new Date().toISOString() })
        .eq("id", userId);
    };

    // Update once when the user loads the page
    updateActivity();

    // And every 5 minutes while active
    const interval = setInterval(updateActivity, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [userId]);

  return null;
}
