"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";


export default function UserDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [user, setUser] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("a_users")
      .select("*")
      .eq("id", id)
      .single();

    if (error) console.error(error);
    else setUser(data);

    setLoading(false);
  };

  useEffect(() => {
    (async () => {
      await fetchUser();
    })();
  }, [id]);

  if (loading) return <div className="p-6 text-gray-500">Loading…</div>;
  if (!user) return <div className="p-6 text-red-600">User not found.</div>;

  return (
    <div className="p-6">
      {/* …the rest of your JSX (unchanged)… */}
    </div>
  );
}

export {};