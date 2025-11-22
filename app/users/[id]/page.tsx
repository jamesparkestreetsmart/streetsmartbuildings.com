"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";


export default function UserDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);

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

  useEffect(() => { fetchUser(); }, [id]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const { error } = await supabase
      .from("a_users")
      .update({
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
      })
      .eq("id", id);

    if (error) alert("Failed to save");
    else setEditMode(false);

    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure?")) return;
    const { error } = await supabase.from("a_users").delete().eq("id", id);

    if (error) alert("Failed");
    else router.push("/users");
  };

  if (loading) return <div className="p-6 text-gray-500">Loading…</div>;
  if (!user) return <div className="p-6 text-red-600">User not found.</div>;

  return (
    <div className="p-6">
      {/* …the rest of your JSX (unchanged)… */}
    </div>
  );
}


