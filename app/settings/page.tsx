"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Plus, Users, Building2, Pencil, Save, X } from "lucide-react";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function SettingsPage() {
  const router = useRouter();

  const [org, setOrg] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingOrg, setEditingOrg] = useState(false);
  const [orgDraft, setOrgDraft] = useState<any>({});
  const [showAddUser, setShowAddUser] = useState(false);
  const [shakeForm, setShakeForm] = useState(false);
  const [newUser, setNewUser] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone_number: "",
    role: "",
    permissions: "viewer",
    status: "active",
  });

  // 🔍 Search + Sort
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // =================== FETCH DATA ===================
  useEffect(() => {
    fetchData();
  }, []);

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

  // =================== SAVE ORG ===================
  const saveOrg = async () => {
    const { error } = await supabase
      .from("a_organizations")
      .update({
        org_name: orgDraft.org_name,
        industry: orgDraft.industry,
        program_lead_email: orgDraft.program_lead_email,
        billing_address: orgDraft.billing_address,
      })
      .eq("id", org.id);

    if (error) {
      alert("Failed to update organization info.");
      console.error(error);
    } else {
      setOrg(orgDraft);
      setEditingOrg(false);
    }
  };

  // =================== ADD USER ===================
  const addUser = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    // Validation check
    if (!newUser.email || !newUser.first_name || !newUser.last_name) {
      setShakeForm(true);
      setTimeout(() => setShakeForm(false), 500);
      return;
    }

    const { error } = await supabase.from("a_users").insert([
      {
        org_id: org?.id,
        first_name: newUser.first_name,
        last_name: newUser.last_name,
        email: newUser.email,
        phone_number: newUser.phone_number || null,
        role: newUser.role || null,
        permissions: newUser.permissions,
        status: newUser.status,
      },
    ]);

    if (error) {
      console.error("Add user error:", error);
      alert("Failed to add user.");
    } else {
      // Reset and close
      setShowAddUser(false);
      setNewUser({
        first_name: "",
        last_name: "",
        email: "",
        phone_number: "",
        role: "",
        permissions: "viewer",
        status: "active",
      });
      fetchData();
    }
  };

  // =================== SORT + FILTER HELPERS ===================
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
      const search = searchTerm.toLowerCase();
      return (
        u.first_name?.toLowerCase().includes(search) ||
        u.last_name?.toLowerCase().includes(search) ||
        u.email?.toLowerCase().includes(search) ||
        u.role?.toLowerCase().includes(search)
      );
    })
    .sort((a, b) => {
      const aVal = a[sortKey] || "";
      const bVal = b[sortKey] || "";
      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

  // =================== LOADING STATE ===================
  if (loading)
    return <div className="p-6 text-gray-500 text-sm">Loading settings...</div>;

  // =================== MAIN RENDER ===================
  return (
    <div className="p-6 space-y-8">
      {/* ================= ORGANIZATION INFO ================= */}
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
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-white rounded-md bg-gradient-to-r from-[#00a859] to-[#d4af37] hover:from-[#15b864] hover:to-[#e1bf4b]"
                >
                  <Pencil className="w-4 h-4" />
                  Edit
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
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-white rounded-md bg-emerald-600 hover:bg-emerald-700"
                >
                  <Save className="w-4 h-4" />
                  Save
                </button>
                <button
                  onClick={() => {
                    setOrgDraft(org);
                    setEditingOrg(false);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md text-gray-600 border hover:bg-gray-100"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {org ? (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Organization Name</p>
              {editingOrg ? (
                <input
                  type="text"
                  value={orgDraft.org_name || ""}
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
                  value={orgDraft.industry || ""}
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
                  value={orgDraft.program_lead_email || ""}
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
                  value={orgDraft.billing_address || ""}
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
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-green-500"
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
                  className="border-b hover:bg-gray-50 transition cursor-pointer"
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

      {/* ================= ADD USER MODAL ================= */}
      {showAddUser && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50">
          <div
            className={`bg-white rounded-xl shadow-xl w-96 p-6 ${
              shakeForm ? "animate-shake" : ""
            }`}
          >
            <h3 className="text-lg font-semibold mb-4">Add New User</h3>

            <form onSubmit={addUser}>
              <div className="space-y-3 text-sm">
                {[
                  { label: "First Name", key: "first_name" },
                  { label: "Last Name", key: "last_name" },
                  { label: "Email", key: "email" },
                  { label: "Phone Number", key: "phone_number" },
                  { label: "Role (Job Title)", key: "role" },
                ].map((f) => (
                  <div key={f.key}>
                    <label className="block text-gray-600 mb-1">
                      {f.label}
                    </label>
                    <input
                      type="text"
                      value={(newUser as any)[f.key]}
                      onChange={(e) =>
                        setNewUser({ ...newUser, [f.key]: e.target.value })
                      }
                      className="w-full border rounded-md p-2 text-sm"
                    />
                  </div>
                ))}

                <div>
                  <label className="block text-gray-600 mb-1">Permissions</label>
                  <select
                    value={newUser.permissions}
                    onChange={(e) =>
                      setNewUser({ ...newUser, permissions: e.target.value })
                    }
                    className="w-full border rounded-md p-2 text-sm"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div>
                  <label className="block text-gray-600 mb-1">Status</label>
                  <select
                    value={newUser.status}
                    onChange={(e) =>
                      setNewUser({ ...newUser, status: e.target.value })
                    }
                    className="w-full border rounded-md p-2 text-sm"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowAddUser(false)}
                  className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-sm text-white rounded-md bg-gradient-to-r from-green-600 to-yellow-400 hover:from-green-700 hover:to-yellow-500"
                >
                  Save User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====== Animation Style ====== */}
      <style jsx>{`
        @keyframes shake {
          0% {
            transform: translateX(0);
          }
          25% {
            transform: translateX(-5px);
          }
          50% {
            transform: translateX(5px);
          }
          75% {
            transform: translateX(-5px);
          }
          100% {
            transform: translateX(0);
          }
        }
        .animate-shake {
          animation: shake 0.3s ease;
        }
      `}</style>
    </div>
  );
}
