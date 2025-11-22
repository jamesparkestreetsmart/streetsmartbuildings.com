"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface OrgInfo {
  id: string;
  name: string;
  description: string | null;
  industry: string | null;
  created_at: string;
}

interface UserRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  created_at: string;
}

export default function UsersPage() {
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOrgAndUsers() {
      setLoading(true);
      const { data: orgData } = await supabase
        .from("a_orgs")
        .select("*")
        .limit(1)
        .single();

      const { data: userData } = await supabase
        .from("a_users")
        .select("*")
        .order("created_at", { ascending: false });

      setOrg(orgData);
      setUsers(userData || []);
      setLoading(false);
    }
    fetchOrgAndUsers();
  }, []);

  const handleAddUser = async () => {
    const email = prompt("Enter the new user's email:");
    const firstName = prompt("First name:");
    const lastName = prompt("Last name:");
    const role = prompt("Role (admin, manager, viewer):", "viewer");

    if (!email || !firstName || !lastName) return;

    const { error } = await supabase.from("a_users").insert({
      org_id: org?.id,
      email,
      first_name: firstName,
      last_name: lastName,
      role,
    });

    if (error) alert(`Error adding user: ${error.message}`);
    else {
      alert("User added!");
      location.reload();
    }
  };

  return (
    <div className="p-6 space-y-6">
      <Card className="shadow-sm">
        <CardContent className="p-5">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">
            Organization Info
          </h2>
          {org ? (
            <div className="text-sm text-gray-700 space-y-1">
              <p><strong>Name:</strong> {org.name}</p>
              <p><strong>Industry:</strong> {org.industry || "—"}</p>
              <p><strong>Description:</strong> {org.description || "—"}</p>
              <p><strong>Created:</strong> {new Date(org.created_at).toLocaleString()}</p>
            </div>
          ) : (
            <p>No organization found.</p>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-800">Users</h2>
        <Button
          className="bg-gradient-to-r from-green-600 to-yellow-400 text-white hover:opacity-90"
          onClick={handleAddUser}
        >
          + Add User
        </Button>
      </div>

      <div className="overflow-x-auto border rounded-lg bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-3 py-2 text-left">First Name</th>
              <th className="px-3 py-2 text-left">Last Name</th>
              <th className="px-3 py-2 text-left">Email</th>
              <th className="px-3 py-2 text-left">Role</th>
              <th className="px-3 py-2 text-left">Created</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t hover:bg-gray-50">
                <td className="px-3 py-2">{u.first_name}</td>
                <td className="px-3 py-2">{u.last_name}</td>
                <td className="px-3 py-2">{u.email}</td>
                <td className="px-3 py-2 capitalize">{u.role}</td>
                <td className="px-3 py-2">
                  {new Date(u.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
