//app/journey/page.tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Clock, User, Settings, UserPlus, UserCheck, Shield } from "lucide-react";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface RecordLog {
  id: number;
  org_id: string;
  event_type: string;
  source: string;
  message: string;
  metadata: Record<string, any>;
  created_by: string | null;
  created_by_user: string | null;
  created_at: string;
  event_date: string;
}

// Map event types to icons and colors
const eventConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  user_invited: { icon: UserPlus, color: "text-blue-600 bg-blue-100", label: "User Invited" },
  user_joined: { icon: UserCheck, color: "text-green-600 bg-green-100", label: "User Joined" },
  user_membership_updated: { icon: Shield, color: "text-purple-600 bg-purple-100", label: "Membership Updated" },
  user_retired: { icon: User, color: "text-gray-600 bg-gray-100", label: "User Retired" },
  org_settings_updated: { icon: Settings, color: "text-amber-600 bg-amber-100", label: "Org Updated" },
  default: { icon: Clock, color: "text-gray-600 bg-gray-100", label: "Event" },
};

function getEventConfig(eventType: string) {
  return eventConfig[eventType] || eventConfig.default;
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function JourneyPage() {
  const [records, setRecords] = useState<RecordLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);

      // Get org (for now, first org - later use auth context)
      const { data: orgData } = await supabase
        .from("a_organizations")
        .select("org_id")
        .limit(1)
        .single();

      if (orgData) {
        setOrgId(orgData.org_id);

        // Fetch org-level records (site_id, equipment_id, device_id all NULL)
        const { data: recordsData, error } = await supabase
          .from("b_records_log")
          .select("*")
          .eq("org_id", orgData.org_id)
          .is("site_id", null)
          .is("equipment_id", null)
          .is("device_id", null)
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) {
          console.error("Error fetching records:", error);
        } else {
          setRecords(recordsData || []);
        }
      }

      setLoading(false);
    }

    fetchData();
  }, []);

  return (
    <div className="p-6">
      {/* Gradient Header with subtle glow */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-extrabold bg-gradient-to-r from-[#00a859] to-[#e0b53f] bg-clip-text text-transparent mb-2 drop-shadow-[0_0_6px_rgba(224,181,63,0.45)]">
          My Journey
        </h1>

        {/* Description */}
        <p className="text-gray-600 text-sm max-w-2xl mx-auto">
          To be filled out on an annual basis as Eagle Eyes reviews{" "}
          <span className="font-semibold text-gray-800">
            customer savings, efficiency gains, and productivity data
          </span>{" "}
          — tracking your building's evolution toward smarter, leaner operations.
        </p>
      </div>

      {/* Organization Activity Log */}
      <div className="bg-white rounded-xl shadow border p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <Clock className="w-6 h-6 text-green-600" />
          <h2 className="text-xl font-semibold">Organization Activity</h2>
        </div>

        {loading ? (
          <p className="text-gray-500 text-sm">Loading activity log...</p>
        ) : records.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No organization activity recorded yet.</p>
            <p className="text-sm mt-1">Events will appear here as your team uses the platform.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {records.map((record, idx) => {
              const config = getEventConfig(record.event_type);
              const Icon = config.icon;
              const isNewDay =
                idx === 0 ||
                formatDate(record.created_at) !== formatDate(records[idx - 1].created_at);

              return (
                <div key={record.id}>
                  {/* Date separator */}
                  {isNewDay && (
                    <div className="flex items-center gap-3 py-2 mt-2 first:mt-0">
                      <div className="h-px flex-1 bg-gray-200" />
                      <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                        {formatDate(record.created_at)}
                      </span>
                      <div className="h-px flex-1 bg-gray-200" />
                    </div>
                  )}

                  {/* Record row */}
                  <div className="flex items-start gap-3 py-2 px-2 rounded-lg hover:bg-gray-50 transition">
                    <div className={`p-2 rounded-lg ${config.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800">{record.message}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-400">
                          {formatTime(record.created_at)}
                        </span>
                        {record.created_by && (
                          <>
                            <span className="text-gray-300">•</span>
                            <span className="text-xs text-gray-400">{record.created_by}</span>
                          </>
                        )}
                        <span className="text-gray-300">•</span>
                        <span className="text-xs text-gray-400 capitalize">
                          {record.source.replace(/_/g, " ")}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Future: Annual Insights placeholder */}
      <div className="mt-8 text-center text-gray-400 italic">
        (Coming soon — annual insights, progress dashboards, and sustainability benchmarks.)
      </div>
    </div>
  );
}
