"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, User, Mail, Shield, Calendar, Trash2, Save } from "lucide-react";
import {supabase } from "@/lib/supabaseClient";

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

    if (error) {
      console.error("Error fetching user:", error);
    } else {
      setUser(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUser();
  }, [id]);

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

    if (error) {
      console.error("Error saving user:", error);
      alert("Failed to save changes.");
    } else {
      setEditMode(false);
    }

    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to deactivate this user?")) return;
    const { error } = await supabase.from("a_users").delete().eq("id", id);

    if (error) {
      console.error("Error deleting user:", error);
      alert("Failed to deactivate user.");
    } else {
      router.push("/users");
    }
  };

  if (loading)
    return (
      <div className="p-6 text-gray-500 text-sm">Loading user details...</div>
    );

  if (!user)
    return (
      <div className="p-6 text-red-600 text-sm">
        User not found or has been deleted.
      </div>
    );

  return (
    <div className="p-6">
      {/* ===== Header ===== */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/users")}
            className="flex items-center text-sm text-gray-600 hover:text-gray-800"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </button>
          <h1 className="text-2xl font-bold text-gray-800">
            {user.first_name} {user.last_name}
          </h1>
        </div>

        {!editMode ? (
          <button
            onClick={() => setEditMode(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-green-600 to-yellow-400 rounded-lg shadow-sm hover:from-green-700 hover:to-yellow-500"
          >
            Edit User
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-green-600 to-yellow-400 rounded-lg hover:from-green-700 hover:to-yellow-500"
            >
              <Save className="w-4 h-4" />
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={() => setEditMode(false)}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* ===== User Info Card ===== */}
      <div className="bg-white shadow rounded-xl p-6 border border-gray-100 max-w-2xl">
        <div className="flex flex-col gap-4">
          {/* Email */}
          <div className="flex items-center gap-3">
            <Mail className="w-5 h-5 text-gray-500" />
            <div>
              <p className="text-xs text-gray-400">Email</p>
              <p className="text-sm font-medium text-gray-800">{user.email}</p>
            </div>
          </div>

          {/* Role */}
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-gray-500" />
            <div className="flex-1">
              <p className="text-xs text-gray-400">Role</p>
              {editMode ? (
                <select
                  value={user.role}
                  onChange={(e) =>
                    setUser({ ...user, role: e.target.value })
                  }
                  className="mt-1 border rounded-md p-2 w-full text-sm"
                >
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                  <option value="viewer">Viewer</option>
                </select>
              ) : (
                <p className="text-sm font-medium text-gray-800 capitalize">
                  {user.role}
                </p>
              )}
            </div>
          </div>

          {/* Name fields */}
          <div className="flex items-center gap-3">
            <User className="w-5 h-5 text-gray-500" />
            <div className="flex gap-2 w-full">
              <div className="flex-1">
                <p className="text-xs text-gray-400">First Name</p>
                {editMode ? (
                  <input
                    type="text"
                    value={user.first_name || ""}
                    onChange={(e) =>
                      setUser({ ...user, first_name: e.target.value })
                    }
                    className="mt-1 border rounded-md p-2 w-full text-sm"
                  />
                ) : (
                  <p className="text-sm font-medium text-gray-800">
                    {user.first_name}
                  </p>
                )}
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-400">Last Name</p>
                {editMode ? (
                  <input
                    type="text"
                    value={user.last_name || ""}
                    onChange={(e) =>
                      setUser({ ...user, last_name: e.target.value })
                    }
                    className="mt-1 border rounded-md p-2 w-full text-sm"
                  />
                ) : (
                  <p className="text-sm font-medium text-gray-800">
                    {user.last_name}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Created At */}
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-gray-500" />
            <div>
              <p className="text-xs text-gray-400">Created At</p>
              <p className="text-sm text-gray-800">
                {new Date(user.created_at).toLocaleString("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            </div>
          </div>

          {/* Delete / Deactivate */}
          <div className="pt-4 mt-4 border-t border-gray-200">
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 text-sm text-red-600 hover:text-red-800"
            >
              <Trash2 className="w-4 h-4" />
              Deactivate User
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
