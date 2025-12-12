"use client";

interface Organization {
  org_id: string;
  org_name: string;
  industry: string | null;
  program_lead_email: string | null;
  billing_address: string | null;
  created_at: string;
  updated_at: string | null;
  org_identifier: string | null;
  dummy_site_id: string | null;
  dummy_equipment_id: string | null;
}

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

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Plus, Users, Building2, Pencil, Save, X } from "lucide-react";

// Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function SettingsPage() {
  const router = useRouter();

  const [org, setOrg] = useState<Organization | null>(null);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingOrg, setEditingOrg] = useState(false);
  const [orgDraft, setOrgDraft] = useState<Partial<Organization>>({});

  const [showAddUser, setShowAddUser] = useState(false);
  const [shakeForm, setShakeForm] = useState(false);

  // ✨ NEW — Email-only invitation
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Search & Sort
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // =================== FETCH DATA ===================
  const fetchData = async () => {
    setLoading(true);

    const { data: orgData } = await supabase
      .from("a_organizations")
      .select("*")
      .limit(1)
      .single();

    const { data: userData } = await supabase
      .from("a_users")
      .select("*")
      .order("created_at", { ascending: false });

    if (orgData) {
      setOrg(orgData);
      setOrgDraft(orgData);
    }
    if (userData) setUsers(userData);

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // =================== SAVE ORG EDIT ===================
  const saveOrg = async () => {
    if (!org) return;

    const { error } = await supabase
      .from("a_organizations")
      .update({
        org_name: orgDraft.org_name,
        industry: orgDraft.industry,
        program_lead_email: orgDraft.program_lead_email,
        billing_address: orgDraft.billing_address,
      })
      .eq("org_id", org.org_id);

    if (error) {
      alert("Failed to update organization info.");
      console.error(error);
    } else {
      setOrg({ ...org, ...orgDraft } as Organization);
      setEditingOrg(false);
    }
  };

  // =================== ADD USER — NEW INVITE FLOW ===================
  const addUser = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    setInviteError(null);
    setInviteMessage(null);

    const email = inviteEmail.trim();
    if (!email) {
      setShakeForm(true);
      setTimeout(() => setShakeForm(false), 400);
      return;
    }

    if (!org) {
      setInviteError("Organization not loaded.");
      return;
    }

    setInviteLoading(true);

    try {
      const res = await fetch("/api/org-users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          orgId: org.org_id,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setInviteError(data.error || "Failed to add user.");
      } else {
        setInviteMessage(data.message || "User processed successfully.");
        setInviteEmail("");

        // Refresh user list for existing users added immediately
        await fetchData();
      }
    } catch (err) {
      console.error(err);
      setInviteError("Unexpected server error.");
    } finally {
      setInviteLoading(false);
    }
  };

  // =================== SORTING ===================
  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  };

  const filteredAndSortedUsers = users
    .filter((u) => {
      const s = searchTerm.toLowerCase();
      return (
        u.first_name.toLowerCase().includes(s) ||
        u.last_name.toLowerCase().includes(s) ||
        u.email.toLowerCase().includes(s) ||
        (u.role ?? "").toLowerCase().includes(s)
      );
    })
    .sort((a, b) => {
      const aVal = a[sortKey as keyof UserRecord] ?? "";
      const bVal = b[sortKey as keyof UserRecord] ?? "";
      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

  if (loading)
    return <div className="p-6 text-gray-500 text-sm">Loading settings...</div>;

  // =================== MAIN RENDER ===================
  return (
    <div className="p-6 space-y-8">
      {/* ===== ORGANIZATION INFO ===== */}
      <div className="bg-white shadow rounded-xl border p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Building2 className="w-6 h-6 text-green-600" />
            <h2 className="text-xl font-semibold">Organization Info</h2>
          </div>

          <div className="flex items-center gap-2">
            {!editingOrg ? (
              <>
                <button
                  onClick={() => setEditingOrg(true)}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-white rounded-md bg-gradient-to-r from-green-600 to-yellow-400"
                >
                  <Pencil className="w-4 h-4" /> Edit
                </button>

                <button
                  onClick={() => router.push("/settings/devices")}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border border-emerald-500 text-emerald-700 hover:bg-emerald-50"
                >
                  📟 My Devices
                </button>
              </>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={saveOrg}
                  className="px-3 py-1.5 text-sm text-white rounded-md bg-emerald-600"
                >
                  <Save className="w-4 h-4" /> Save
                </button>
                <button
                  onClick={() => {
                    setOrgDraft(org as Organization);
                    setEditingOrg(false);
                  }}
                  className="px-3 py-1.5 text-sm rounded-md text-gray-600 border hover:bg-gray-100"
                >
                  <X className="w-4 h-4" /> Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ORG FIELDS */}
        {org ? (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Organization Name</p>
              {editingOrg ? (
                <input
                  type="text"
                  value={orgDraft.org_name ?? ""}
                  onChange={(e) =>
                    setOrgDraft({ ...orgDraft, org_name: e.target.value })
                  }
                  className="w-full border rounded-md px-2 py-1 text-sm"
                />
              ) : (
                <p className="font-medium">{org.org_name}</p>
              )}
            </div>

            <div>
              <p className="text-gray-500">Industry</p>
              {editingOrg ? (
                <input
                  type="text"
                  value={orgDraft.industry ?? ""}
                  onChange={(e) =>
                    setOrgDraft({ ...orgDraft, industry: e.target.value })
                  }
                  className="w-full border rounded-md px-2 py-1 text-sm"
                />
              ) : (
                <p className="font-medium">{org.industry}</p>
              )}
            </div>

            <div>
              <p className="text-gray-500">Program Lead Email</p>
              {editingOrg ? (
                <input
                  type="email"
                  value={orgDraft.program_lead_email ?? ""}
                  onChange={(e) =>
                    setOrgDraft({
                      ...orgDraft,
                      program_lead_email: e.target.value,
                    })
                  }
                  className="w-full border rounded-md px-2 py-1 text-sm"
                />
              ) : (
                <p className="font-medium">{org.program_lead_email}</p>
              )}
            </div>

            <div>
              <p className="text-gray-500">Billing Address</p>
              {editingOrg ? (
                <input
                  type="text"
                  value={orgDraft.billing_address ?? ""}
                  onChange={(e) =>
                    setOrgDraft({
                      ...orgDraft,
                      billing_address: e.target.value,
                    })
                  }
                  className="w-full border rounded-md px-2 py-1 text-sm"
                />
              ) : (
                <p className="font-medium">{org.billing_address}</p>
              )}
            </div>

            <div>
              <p className="text-gray-500">Created</p>
              <p className="font-medium">
                {new Date(org.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-gray-500">No organization record found.</p>
        )}
      </div>

      {/* ================= USER MANAGEMENT ================= */}
      <div className="bg-white shadow rounded-xl border p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-green-600" />
            <h2 className="text-xl font-semibold">User Management</h2>
          </div>

          <div className="flex gap-3 items-center">
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-56 focus:ring-2 focus:ring-green-500"
            />

            <button
              onClick={() => setShowAddUser(true)}
              className="px-3 py-1.5 text-sm text-white rounded-lg bg-gradient-to-r from-green-600 to-yellow-400 hover:from-green-700 hover:to-yellow-500 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add User
            </button>
          </div>
        </div>

        {/* USER TABLE */}
        <table className="w-full text-sm border-t border-gray-200">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              {[
                { key: "first_name", label: "Name" },
                { key: "email", label: "Email" },
                { key: "phone_number", label: "Phone" },
                { key: "role", label: "Role" },
                { key: "permissions", label: "Permissions" },
                { key: "status", label: "Status" },
                { key: "last_activity_at", label: "Last Activity" },
                { key: "created_at", label: "Created" },
              ].map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className="text-left p-3 font-medium cursor-pointer hover:text-green-700 select-none"
                >
                  {col.label}
                  {sortKey === col.key ? (sortOrder === "asc" ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filteredAndSortedUsers.length ? (
              filteredAndSortedUsers.map((u) => (
                <tr
                  key={u.user_id}
                  className="border-b hover:bg-gray-50 transition"
                >
                  <td className="p-3">
                    {u.first_name} {u.last_name}
                  </td>
                  <td className="p-3">{u.email}</td>
                  <td className="p-3">{u.phone_number || "-"}</td>
                  <td className="p-3 capitalize">{u.role || "-"}</td>
                  <td className="p-3 capitalize">{u.permissions}</td>
                  <td
                    className={`p-3 capitalize ${
                      u.status === "active"
                        ? "text-green-600"
                        : "text-gray-500"
                    }`}
                  >
                    {u.status}
                  </td>
                  <td className="p-3">
                    {u.last_activity_at
                      ? new Date(u.last_activity_at).toLocaleDateString()
                      : "-"}
                  </td>
                  <td className="p-3">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="text-center text-gray-500 p-4">
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ================= INVITE USER MODAL ================= */}
      {showAddUser && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50">
          <div
            className={`bg-white rounded-xl shadow-xl w-96 p-6 ${
              shakeForm ? "animate-shake" : ""
            }`}
          >
            <h3 className="text-lg font-semibold mb-4">
              Invite / Add User
            </h3>

            <form onSubmit={addUser} className="space-y-4 text-sm">
              <div>
                <label className="block text-gray-600 mb-1">
                  User Email<span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full border rounded-md p-2 text-sm"
                />

                <p className="text-xs text-gray-500 mt-1">
                  • Existing users get added to the organization immediately. <br />
                  • New users receive an invite and must sign up with the org code.
                </p>
              </div>

              {inviteError && (
                <div className="bg-red-100 text-red-700 text-xs rounded-md px-3 py-2">
                  {inviteError}
                </div>
              )}

              {inviteMessage && (
                <div className="bg-emerald-50 text-emerald-700 text-xs rounded-md px-3 py-2">
                  {inviteMessage}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddUser(false);
                    setInviteEmail("");
                    setInviteMessage(null);
                    setInviteError(null);
                  }}
                  className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={inviteLoading}
                  className="px-4 py-1.5 text-sm text-white rounded-md bg-gradient-to-r from-green-600 to-yellow-400 disabled:opacity-60"
                >
                  {inviteLoading ? "Processing..." : "Send Invite / Add"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Shake Animation */}
      <style jsx>{`
        @keyframes shake {
          0% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          50% { transform: translateX(5px); }
          75% { transform: translateX(-5px); }
          100% { transform: translateX(0); }
        }
        .animate-shake {
          animation: shake 0.3s ease;
        }
      `}</style>
    </div>
  );
}
