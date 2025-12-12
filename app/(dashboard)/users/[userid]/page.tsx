"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// Define the user data shape
interface UserRecord {
  user_id: string;
  org_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string | null;
  role: string | null;
  permissions: string;
  status: string;
  last_activity_at: string | null;
  created_at: string;
}

export default function UserDetailsPage() {
  const { userid } = useParams<{ userid: string }>();

  const [user, setUser] = useState<UserRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("a_users")
      .select("*")
      .eq("user_id", userid)
      .single();

    if (error) console.error(error);
    else setUser(data as UserRecord);

    setLoading(false);
  };

  useEffect(() => {
  let isMounted = true;

  (async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("a_users")
      .select("*")
      .eq("user_id", userid)
      .single();

    if (isMounted) {
      if (error) console.error(error);
      else setUser(data as UserRecord);
      setLoading(false);
    }
  })();

  return () => {
    isMounted = false;
  };
}, [userid]);


  if (loading) return <div className="p-6 text-gray-500">Loading…</div>;
  if (!user) return <div className="p-6 text-red-600">User not found.</div>;

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">
        {user.first_name} {user.last_name}
      </h1>

      <p>Email: {user.email}</p>
      <p>Phone: {user.phone_number || "-"}</p>
      <p>Role: {user.role || "—"}</p>
      <p>Status: {user.status}</p>
      <p>Permissions: {user.permissions}</p>
      <p>Created: {new Date(user.created_at).toLocaleString()}</p>
    </div>
  );
}
