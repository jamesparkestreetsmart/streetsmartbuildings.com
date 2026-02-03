"use client";

interface Organization {
  org_id: string;
  org_name: string;
  owner_email: string | null;
  owner_first_name: string | null;
  owner_last_name: string | null;
  billing_street: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_postal_code: string | null;
  billing_country: string | null;
  created_at: string;
  updated_at: string | null;
  org_identifier: string | null;
}

interface MemberRecord {
  membership_id: string;
  org_id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string | null;
  role: string;
  role_label: string | null;
  job_title: string | null;
  job_title_label: string | null;
  capability_preset: string | null;
  capability_preset_label: string | null;
  status: string;
  joined_at: string;
  last_updated_at: string;
}

interface SiteRecord {
  site_id: string;
  industry: string | null;
  brand: string | null;
}

interface SiteCount {
  industry: string;
  brand: string;
  count: number;
}

interface JobTitle {
  job_title_key: string;
  label: string;
}

interface Role {
  role: string;
  label: string;
}

interface CapabilityPreset {
  preset_key: string;
  label: string;
}

interface UserProfile {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  time_format: string;
  units: string;
  preferences: string;
  created_at: string;
}

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Plus, Users, Building2, Pencil, Save, X, MapPin, User, Settings2 } from "lucide-react";

// Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Helper to format billing address for display
const formatBillingAddress = (org: Organization): string => {
  const parts = [
    org.billing_street,
    org.billing_city,
    org.billing_state && org.billing_postal_code
      ? `${org.billing_state} ${org.billing_postal_code}`
      : org.billing_state || org.billing_postal_code,
    org.billing_country,
  ].filter(Boolean);
  return parts.join(", ") || "-";
};

export default function SettingsPage() {
  const router = useRouter();

  const [org, setOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [siteCounts, setSiteCounts] = useState<SiteCount[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingOrg, setEditingOrg] = useState(false);
  const [orgDraft, setOrgDraft] = useState<Partial<Organization>>({});

  const [showAddUser, setShowAddUser] = useState(false);
  const [shakeForm, setShakeForm] = useState(false);

  // Email-only invitation
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteJobTitle, setInviteJobTitle] = useState("");
  const [inviteRole, setInviteRole] = useState("");
  const [inviteCapabilityPreset, setInviteCapabilityPreset] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Search & Sort
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState("joined_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Lookup tables
  const [jobTitles, setJobTitles] = useState<JobTitle[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [capabilityPresets, setCapabilityPresets] = useState<CapabilityPreset[]>([]);

  // Current user profile
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState<Partial<UserProfile>>({});

  // Edit member modal
  const [editingMember, setEditingMember] = useState<MemberRecord | null>(null);
  const [memberDraft, setMemberDraft] = useState<{
    job_title: string | null;
    role: string;
    capability_preset: string | null;
    status: string;
  }>({ job_title: null, role: "", capability_preset: null, status: "active" });

  // =================== FETCH DATA ===================
  const fetchData = async () => {
    setLoading(true);

    const { data: orgData } = await supabase
      .from("a_organizations")
      .select("*")
      .limit(1)
      .single();

    // Fetch members for this org using the new view
    const { data: memberData } = await supabase
      .from("view_settings_users")
      .select("*")
      .eq("org_id", orgData?.org_id)
      .order("joined_at", { ascending: false });

    const { data: sitesData } = await supabase
      .from("a_sites")
      .select("site_id, industry, brand");

    // Fetch lookup tables
    const { data: jobTitleData } = await supabase
      .from("library_job_titles")
      .select("job_title_key, label")
      .order("sort_order");

    const { data: roleData } = await supabase
      .from("library_roles")
      .select("role, label")
      .order("sort_order");

    const { data: presetData } = await supabase
      .from("library_capability_presets")
      .select("preset_key, label")
      .order("sort_order");

    // Fetch current user profile (for now, get first user - later use auth)
    const { data: profileData } = await supabase
      .from("a_users")
      .select("*")
      .limit(1)
      .single();

    if (orgData) {
      setOrg(orgData);
      setOrgDraft(orgData);
    }
    if (memberData) setMembers(memberData);
    if (jobTitleData) setJobTitles(jobTitleData);
    if (roleData) setRoles(roleData);
    if (presetData) setCapabilityPresets(presetData);
    if (profileData) {
      setProfile(profileData);
      setProfileDraft(profileData);
    }

    // Compute site counts by industry + brand
    if (sitesData) {
      const countMap = new Map<string, SiteCount>();
      
      sitesData.forEach((site: SiteRecord) => {
        const industry = site.industry || "Unassigned";
        const brand = site.brand || "Unassigned";
        const key = `${industry}|${brand}`;
        
        if (countMap.has(key)) {
          countMap.get(key)!.count++;
        } else {
          countMap.set(key, { industry, brand, count: 1 });
        }
      });

      // Sort by industry then brand
      const counts = Array.from(countMap.values()).sort((a, b) => {
        if (a.industry !== b.industry) return a.industry.localeCompare(b.industry);
        return a.brand.localeCompare(b.brand);
      });

      setSiteCounts(counts);
    }

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
        owner_email: orgDraft.owner_email,
        owner_first_name: orgDraft.owner_first_name,
        owner_last_name: orgDraft.owner_last_name,
        billing_street: orgDraft.billing_street,
        billing_city: orgDraft.billing_city,
        billing_state: orgDraft.billing_state,
        billing_postal_code: orgDraft.billing_postal_code,
        billing_country: orgDraft.billing_country,
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

  // =================== SAVE PROFILE EDIT ===================
  const saveProfile = async () => {
    if (!profile) return;

    const { error } = await supabase
      .from("a_users")
      .update({
        first_name: profileDraft.first_name,
        last_name: profileDraft.last_name,
        phone_number: profileDraft.phone_number,
        time_format: profileDraft.time_format,
        units: profileDraft.units,
      })
      .eq("user_id", profile.user_id);

    if (error) {
      alert("Failed to update profile.");
      console.error(error);
    } else {
      setProfile({ ...profile, ...profileDraft } as UserProfile);
      setEditingProfile(false);
      // Refresh to update member list with new name
      await fetchData();
    }
  };

  // =================== SAVE MEMBER EDIT ===================
  const saveMember = async () => {
    if (!editingMember) return;

    const { error } = await supabase
      .from("a_orgs_users_memberships")
      .update({
        job_title: memberDraft.job_title,
        role: memberDraft.role,
        capability_preset: memberDraft.capability_preset,
        status: memberDraft.status,
        last_updated_at: new Date().toISOString(),
      })
      .eq("membership_id", editingMember.membership_id);

    if (error) {
      alert("Failed to update member.");
      console.error(error);
    } else {
      setEditingMember(null);
      await fetchData();
    }
  };

  // =================== OPEN EDIT MEMBER MODAL ===================
  const openEditMember = (member: MemberRecord) => {
    setEditingMember(member);
    setMemberDraft({
      job_title: member.job_title,
      role: member.role,
      capability_preset: member.capability_preset,
      status: member.status,
    });
  };

  // =================== ADD USER — INVITE FLOW ===================
  const addUser = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    setInviteError(null);
    setInviteMessage(null);

    const email = inviteEmail.trim().toLowerCase();
    
    // Validate required fields
    if (!email) {
      setInviteError("Email is required.");
      setShakeForm(true);
      setTimeout(() => setShakeForm(false), 400);
      return;
    }
    if (!inviteJobTitle) {
      setInviteError("Job Title is required.");
      return;
    }
    if (!inviteRole) {
      setInviteError("Role is required.");
      return;
    }
    if (!inviteCapabilityPreset) {
      setInviteError("Access Level is required.");
      return;
    }

    if (!org) {
      setInviteError("Organization not loaded.");
      return;
    }

    setInviteLoading(true);

    try {
      // Check if user already exists in a_users
      const { data: existingUser } = await supabase
        .from("a_users")
        .select("user_id")
        .eq("email", email)
        .maybeSingle();

      if (existingUser) {
        // User exists - check if they already have a membership in this org
        const { data: existingMembership } = await supabase
          .from("a_orgs_users_memberships")
          .select("membership_id")
          .eq("user_id", existingUser.user_id)
          .eq("org_id", org.org_id)
          .maybeSingle();

        if (existingMembership) {
          setInviteError("This user is already a member of this organization.");
          setInviteLoading(false);
          return;
        }

        // Create membership directly
        const { error: membershipError } = await supabase
          .from("a_orgs_users_memberships")
          .insert({
            user_id: existingUser.user_id,
            org_id: org.org_id,
            job_title: inviteJobTitle,
            role: inviteRole,
            capability_preset: inviteCapabilityPreset,
            status: "active",
          });

        if (membershipError) {
          setInviteError("Failed to add user: " + membershipError.message);
        } else {
          setInviteMessage("User added to organization successfully!");
          await fetchData();
        }
      } else {
        // User doesn't exist - check if invite already exists for this email + org
        const { data: existingInvite } = await supabase
          .from("a_org_invites")
          .select("invite_id")
          .eq("invite_email", email)
          .eq("org_id", org.org_id)
          .maybeSingle();

        if (existingInvite) {
          // Send reminder email
          try {
            const res = await fetch("/api/send-invite-email", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email,
                orgId: org.org_id,
                isReminder: true,
              }),
            });
            if (res.ok) {
              setInviteMessage("A reminder email has been sent to this user.");
            } else {
              setInviteMessage("An invite already exists. Reminder email could not be sent.");
            }
          } catch {
            setInviteMessage("An invite already exists. Reminder email could not be sent.");
          }
        } else {
          // Create new invite
          const { error: inviteDbError } = await supabase
            .from("a_org_invites")
            .insert({
              org_id: org.org_id,
              invite_email: email,
              default_job_title: inviteJobTitle,
              default_role: inviteRole,
              default_capability_preset: inviteCapabilityPreset,
              status: "active",
              created_by_user: profile?.user_id,
            });

          if (inviteDbError) {
            setInviteError("Failed to create invite: " + inviteDbError.message);
          } else {
            // Send invite email
            try {
              const res = await fetch("/api/send-invite-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  email,
                  orgId: org.org_id,
                  isReminder: false,
                  invitedByUserId: profile?.user_id,
                }),
              });
              if (res.ok) {
                setInviteMessage("Invite created and email sent! User will be added when they sign up.");
              } else {
                const errData = await res.json();
                console.error("Email send error:", errData);
                setInviteMessage("Invite created but email could not be sent. User can still sign up with the org code.");
              }
            } catch (emailErr) {
              console.error("Email fetch error:", emailErr);
              setInviteMessage("Invite created but email could not be sent. User can still sign up with the org code.");
            }
          }
        }
      }
    } catch (err) {
      console.error(err);
      setInviteError("Unexpected server error.");
    } finally {
      setInviteLoading(false);
    }
  };

  // Reset invite form
  const resetInviteForm = () => {
    setInviteEmail("");
    setInviteJobTitle("");
    setInviteRole("");
    setInviteCapabilityPreset("");
    setInviteMessage(null);
    setInviteError(null);
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

  const filteredAndSortedMembers = members
    .filter((m) => {
      const s = searchTerm.toLowerCase();
      return (
        m.first_name.toLowerCase().includes(s) ||
        m.last_name.toLowerCase().includes(s) ||
        m.email.toLowerCase().includes(s) ||
        (m.job_title_label ?? "").toLowerCase().includes(s) ||
        (m.role_label ?? "").toLowerCase().includes(s)
      );
    })
    .sort((a, b) => {
      const aVal = a[sortKey as keyof MemberRecord] ?? "";
      const bVal = b[sortKey as keyof MemberRecord] ?? "";
      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

  if (loading)
    return <div className="p-6 text-gray-500 text-sm">Loading settings...</div>;

  // =================== MAIN RENDER ===================
  return (
    <div className="p-6 space-y-8">
      {/* ===== ORG INFO + SITES OVERVIEW ROW ===== */}
      <div className="flex gap-6">
        {/* ===== ORGANIZATION INFO ===== */}
        <div className="bg-white shadow rounded-xl border p-6 flex-1">
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
                  className="px-3 py-1.5 text-sm text-white rounded-md bg-emerald-600 flex items-center gap-1"
                >
                  <Save className="w-4 h-4" /> Save
                </button>
                <button
                  onClick={() => {
                    setOrgDraft(org as Organization);
                    setEditingOrg(false);
                  }}
                  className="px-3 py-1.5 text-sm rounded-md text-gray-600 border hover:bg-gray-100 flex items-center gap-1"
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
            {/* Organization Name */}
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

            {/* Org Identifier */}
            <div>
              <p className="text-gray-500">Organization Code</p>
              <p className="font-medium">{org.org_identifier || "-"}</p>
            </div>

            {/* Owner Name */}
            <div>
              <p className="text-gray-500">Owner Name</p>
              {editingOrg ? (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="First Name"
                    value={orgDraft.owner_first_name ?? ""}
                    onChange={(e) =>
                      setOrgDraft({ ...orgDraft, owner_first_name: e.target.value })
                    }
                    className="w-full border rounded-md px-2 py-1 text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Last Name"
                    value={orgDraft.owner_last_name ?? ""}
                    onChange={(e) =>
                      setOrgDraft({ ...orgDraft, owner_last_name: e.target.value })
                    }
                    className="w-full border rounded-md px-2 py-1 text-sm"
                  />
                </div>
              ) : (
                <p className="font-medium">
                  {[org.owner_first_name, org.owner_last_name].filter(Boolean).join(" ") || "-"}
                </p>
              )}
            </div>

            {/* Owner Email */}
            <div>
              <p className="text-gray-500">Owner Email</p>
              {editingOrg ? (
                <input
                  type="email"
                  value={orgDraft.owner_email ?? ""}
                  onChange={(e) =>
                    setOrgDraft({ ...orgDraft, owner_email: e.target.value })
                  }
                  className="w-full border rounded-md px-2 py-1 text-sm"
                />
              ) : (
                <p className="font-medium">{org.owner_email || "-"}</p>
              )}
            </div>

            {/* Billing Address */}
            <div className="col-span-2">
              <p className="text-gray-500">Billing Address</p>
              {editingOrg ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Street"
                    value={orgDraft.billing_street ?? ""}
                    onChange={(e) =>
                      setOrgDraft({ ...orgDraft, billing_street: e.target.value })
                    }
                    className="w-full border rounded-md px-2 py-1 text-sm"
                  />
                  <div className="grid grid-cols-4 gap-2">
                    <input
                      type="text"
                      placeholder="City"
                      value={orgDraft.billing_city ?? ""}
                      onChange={(e) =>
                        setOrgDraft({ ...orgDraft, billing_city: e.target.value })
                      }
                      className="w-full border rounded-md px-2 py-1 text-sm"
                    />
                    <input
                      type="text"
                      placeholder="State"
                      value={orgDraft.billing_state ?? ""}
                      onChange={(e) =>
                        setOrgDraft({ ...orgDraft, billing_state: e.target.value })
                      }
                      className="w-full border rounded-md px-2 py-1 text-sm"
                    />
                    <input
                      type="text"
                      placeholder="Postal Code"
                      value={orgDraft.billing_postal_code ?? ""}
                      onChange={(e) =>
                        setOrgDraft({
                          ...orgDraft,
                          billing_postal_code: e.target.value,
                        })
                      }
                      className="w-full border rounded-md px-2 py-1 text-sm"
                    />
                    <input
                      type="text"
                      placeholder="Country"
                      value={orgDraft.billing_country ?? ""}
                      onChange={(e) =>
                        setOrgDraft({
                          ...orgDraft,
                          billing_country: e.target.value,
                        })
                      }
                      className="w-full border rounded-md px-2 py-1 text-sm"
                    />
                  </div>
                </div>
              ) : (
                <p className="font-medium">{formatBillingAddress(org)}</p>
              )}
            </div>

            {/* Created */}
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

        {/* ===== SITES OVERVIEW ===== */}
        <div className="bg-white shadow rounded-xl border p-6 w-80">
          <div className="flex items-center gap-3 mb-4">
            <MapPin className="w-6 h-6 text-green-600" />
            <h2 className="text-xl font-semibold">Sites Overview</h2>
          </div>

          <table className="w-full text-sm border-t border-gray-200">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="text-left p-3 font-medium">Industry</th>
                <th className="text-left p-3 font-medium">Brand</th>
                <th className="text-right p-3 font-medium">Count</th>
              </tr>
            </thead>
            <tbody>
              {siteCounts.length ? (
                <>
                  {siteCounts.map((row, idx) => (
                    <tr key={idx} className="border-b hover:bg-gray-50 transition">
                      <td className="p-3">{row.industry}</td>
                      <td className="p-3">{row.brand}</td>
                      <td className="p-3 text-right font-medium">{row.count}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold">
                    <td className="p-3" colSpan={2}>Total</td>
                    <td className="p-3 text-right">
                      {siteCounts.reduce((sum, row) => sum + row.count, 0)}
                    </td>
                  </tr>
                </>
              ) : (
                <tr>
                  <td colSpan={3} className="text-center text-gray-500 p-4">
                    No sites found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== MY PROFILE ===== */}
      <div className="bg-white shadow rounded-xl border p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <User className="w-6 h-6 text-green-600" />
            <h2 className="text-xl font-semibold">My Profile</h2>
          </div>

          {!editingProfile ? (
            <button
              onClick={() => setEditingProfile(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-white rounded-md bg-gradient-to-r from-green-600 to-yellow-400"
            >
              <Pencil className="w-4 h-4" /> Edit
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={saveProfile}
                className="px-3 py-1.5 text-sm text-white rounded-md bg-emerald-600 flex items-center gap-1"
              >
                <Save className="w-4 h-4" /> Save
              </button>
              <button
                onClick={() => {
                  setProfileDraft(profile as UserProfile);
                  setEditingProfile(false);
                }}
                className="px-3 py-1.5 text-sm rounded-md text-gray-600 border hover:bg-gray-100 flex items-center gap-1"
              >
                <X className="w-4 h-4" /> Cancel
              </button>
            </div>
          )}
        </div>

        {profile ? (
          <div className="grid grid-cols-3 gap-4 text-sm">
            {/* First Name */}
            <div>
              <p className="text-gray-500">First Name</p>
              {editingProfile ? (
                <input
                  type="text"
                  value={profileDraft.first_name ?? ""}
                  onChange={(e) =>
                    setProfileDraft({ ...profileDraft, first_name: e.target.value })
                  }
                  className="w-full border rounded-md px-2 py-1 text-sm"
                />
              ) : (
                <p className="font-medium">{profile.first_name}</p>
              )}
            </div>

            {/* Last Name */}
            <div>
              <p className="text-gray-500">Last Name</p>
              {editingProfile ? (
                <input
                  type="text"
                  value={profileDraft.last_name ?? ""}
                  onChange={(e) =>
                    setProfileDraft({ ...profileDraft, last_name: e.target.value })
                  }
                  className="w-full border rounded-md px-2 py-1 text-sm"
                />
              ) : (
                <p className="font-medium">{profile.last_name}</p>
              )}
            </div>

            {/* Email (read-only) */}
            <div>
              <p className="text-gray-500">Email</p>
              <p className="font-medium">{profile.email}</p>
            </div>

            {/* Phone */}
            <div>
              <p className="text-gray-500">Phone Number</p>
              {editingProfile ? (
                <input
                  type="tel"
                  value={profileDraft.phone_number ?? ""}
                  onChange={(e) =>
                    setProfileDraft({ ...profileDraft, phone_number: e.target.value })
                  }
                  className="w-full border rounded-md px-2 py-1 text-sm"
                />
              ) : (
                <p className="font-medium">{profile.phone_number || "-"}</p>
              )}
            </div>

            {/* Time Format */}
            <div>
              <p className="text-gray-500">Time Format</p>
              {editingProfile ? (
                <select
                  value={profileDraft.time_format ?? "12h"}
                  onChange={(e) =>
                    setProfileDraft({ ...profileDraft, time_format: e.target.value })
                  }
                  className="w-full border rounded-md px-2 py-1 text-sm"
                >
                  <option value="12h">12-hour</option>
                  <option value="24h">24-hour</option>
                </select>
              ) : (
                <p className="font-medium">{profile.time_format === "24h" ? "24-hour" : "12-hour"}</p>
              )}
            </div>

            {/* Units */}
            <div>
              <p className="text-gray-500">Units</p>
              {editingProfile ? (
                <select
                  value={profileDraft.units ?? "imperial"}
                  onChange={(e) =>
                    setProfileDraft({ ...profileDraft, units: e.target.value })
                  }
                  className="w-full border rounded-md px-2 py-1 text-sm"
                >
                  <option value="imperial">Imperial (°F)</option>
                  <option value="metric">Metric (°C)</option>
                </select>
              ) : (
                <p className="font-medium">{profile.units === "metric" ? "Metric (°C)" : "Imperial (°F)"}</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-gray-500">Profile not loaded.</p>
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
                { key: "job_title_label", label: "Job Title" },
                { key: "role_label", label: "Role" },
                { key: "capability_preset_label", label: "Access Level" },
                { key: "status", label: "Status" },
                { key: "joined_at", label: "Joined" },
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
            {filteredAndSortedMembers.length ? (
              filteredAndSortedMembers.map((m) => (
                <tr
                  key={m.membership_id}
                  onClick={() => openEditMember(m)}
                  className="border-b hover:bg-gray-50 transition cursor-pointer"
                >
                  <td className="p-3">
                    {m.first_name} {m.last_name}
                  </td>
                  <td className="p-3">{m.email}</td>
                  <td className="p-3">{m.phone_number || "-"}</td>
                  <td className="p-3">{m.job_title_label || "-"}</td>
                  <td className="p-3">{m.role_label || "-"}</td>
                  <td className="p-3">{m.capability_preset_label || "-"}</td>
                  <td
                    className={`p-3 capitalize ${
                      m.status === "active"
                        ? "text-green-600"
                        : "text-gray-500"
                    }`}
                  >
                    {m.status}
                  </td>
                  <td className="p-3">
                    {new Date(m.joined_at).toLocaleDateString()}
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
            className={`bg-white rounded-xl shadow-xl w-[450px] p-6 ${
              shakeForm ? "animate-shake" : ""
            }`}
          >
            <h3 className="text-lg font-semibold mb-4">Add User</h3>

            {inviteMessage ? (
              // Success state
              <div className="space-y-4">
                <div className="bg-emerald-50 text-emerald-700 text-sm rounded-md px-4 py-3 border border-emerald-200">
                  {inviteMessage}
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddUser(false);
                      resetInviteForm();
                    }}
                    className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                  >
                    Close
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      resetInviteForm();
                    }}
                    className="px-4 py-1.5 text-sm text-white rounded-md bg-gradient-to-r from-green-600 to-yellow-400"
                  >
                    Add Another
                  </button>
                </div>
              </div>
            ) : (
              // Form state
              <form onSubmit={addUser} className="space-y-4 text-sm">
                {/* Email */}
                <div>
                  <label className="block text-gray-600 mb-1">
                    Email<span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full border rounded-md p-2 text-sm"
                  />
                </div>

                {/* Job Title */}
                <div>
                  <label className="block text-gray-600 mb-1">
                    Job Title<span className="text-red-500">*</span>
                  </label>
                  <select
                    value={inviteJobTitle}
                    onChange={(e) => setInviteJobTitle(e.target.value)}
                    className="w-full border rounded-md px-2 py-2 text-sm"
                  >
                    <option value="">— Select Job Title —</option>
                    {jobTitles.map((jt) => (
                      <option key={jt.job_title_key} value={jt.job_title_key}>
                        {jt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Role */}
                <div>
                  <label className="block text-gray-600 mb-1">
                    Role<span className="text-red-500">*</span>
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="w-full border rounded-md px-2 py-2 text-sm"
                  >
                    <option value="">— Select Role —</option>
                    {roles.map((r) => (
                      <option key={r.role} value={r.role}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Access Level */}
                <div>
                  <label className="block text-gray-600 mb-1">
                    Access Level<span className="text-red-500">*</span>
                  </label>
                  <select
                    value={inviteCapabilityPreset}
                    onChange={(e) => setInviteCapabilityPreset(e.target.value)}
                    className="w-full border rounded-md px-2 py-2 text-sm"
                  >
                    <option value="">— Select Access Level —</option>
                    {capabilityPresets.map((cp) => (
                      <option key={cp.preset_key} value={cp.preset_key}>
                        {cp.label}
                      </option>
                    ))}
                  </select>
                </div>

                <p className="text-xs text-gray-500 mt-2">
                  • If the user already has an account, they'll be added immediately.<br />
                  • If not, an invite will be created and they'll be added when they sign up.
                </p>

                {inviteError && (
                  <div className="bg-red-100 text-red-700 text-xs rounded-md px-3 py-2">
                    {inviteError}
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddUser(false);
                      resetInviteForm();
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
                    {inviteLoading ? "Processing..." : "Add User"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ================= EDIT MEMBER MODAL ================= */}
      {editingMember && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50">
          <div className="bg-white rounded-xl shadow-xl w-[450px] p-6">
            <h3 className="text-lg font-semibold mb-4">Edit Member</h3>

            <div className="space-y-4 text-sm">
              {/* Read-only info */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-gray-500 text-xs mb-1">Member</p>
                <p className="font-medium">{editingMember.first_name} {editingMember.last_name}</p>
                <p className="text-gray-600">{editingMember.email}</p>
              </div>

              {/* Job Title */}
              <div>
                <label className="block text-gray-600 mb-1">Job Title</label>
                <select
                  value={memberDraft.job_title ?? ""}
                  onChange={(e) =>
                    setMemberDraft({ ...memberDraft, job_title: e.target.value || null })
                  }
                  className="w-full border rounded-md px-2 py-1.5 text-sm"
                >
                  <option value="">— Select Job Title —</option>
                  {jobTitles.map((jt) => (
                    <option key={jt.job_title_key} value={jt.job_title_key}>
                      {jt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Role */}
              <div>
                <label className="block text-gray-600 mb-1">Role</label>
                <select
                  value={memberDraft.role}
                  onChange={(e) =>
                    setMemberDraft({ ...memberDraft, role: e.target.value })
                  }
                  className="w-full border rounded-md px-2 py-1.5 text-sm"
                >
                  {roles.map((r) => (
                    <option key={r.role} value={r.role}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Access Level */}
              <div>
                <label className="block text-gray-600 mb-1">Access Level</label>
                <select
                  value={memberDraft.capability_preset ?? ""}
                  onChange={(e) =>
                    setMemberDraft({ ...memberDraft, capability_preset: e.target.value || null })
                  }
                  className="w-full border rounded-md px-2 py-1.5 text-sm"
                >
                  <option value="">— Select Access Level —</option>
                  {capabilityPresets.map((cp) => (
                    <option key={cp.preset_key} value={cp.preset_key}>
                      {cp.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="block text-gray-600 mb-1">Status</label>
                <select
                  value={memberDraft.status}
                  onChange={(e) =>
                    setMemberDraft({ ...memberDraft, status: e.target.value })
                  }
                  className="w-full border rounded-md px-2 py-1.5 text-sm"
                >
                  <option value="active">Active</option>
                  <option value="retired">Retired</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>

                <button
                  onClick={saveMember}
                  className="px-4 py-1.5 text-sm text-white rounded-md bg-gradient-to-r from-green-600 to-yellow-400"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Shake Animation */}
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
