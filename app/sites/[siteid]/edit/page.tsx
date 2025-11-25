"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function EditSitePage({
  params,
}: {
  params: { siteid: string };
}) {
  const router = useRouter();
  const { siteid: id } = params;


  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [site, setSite] = useState<any>(null);
  const [registry, setRegistry] = useState<any>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const { data: siteData } = await supabase
        .from("a_sites")
        .select("*")
        .eq("site_id", id)
        .single();

      const { data: regData } = await supabase
        .from("a_devices_gateway_registry")
        .select("*")
        .eq("site_id", id)
        .single();

      setSite(siteData);
      setRegistry(regData);

      setLoading(false);
    }

    load();
  }, [id]);

  async function save() {
    if (!site) return;
    setSaving(true);

    const { error } = await supabase
      .from("a_sites")
      .update({
        site_name: site.site_name,
        address_line1: site.address_line1,
        address_line2: site.address_line2,
        city: site.city,
        state: site.state,
        postal_code: site.postal_code,
        phone_number: site.phone_number,
      })
      .eq("site_id", id);

    setSaving(false);

    if (error) {
      alert("Save failed: " + error.message);
    } else {
      router.push(`/sites/${id}`);
    }
  }

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto">

      {/* HEADER */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Edit Site</h1>
        <Link
          href={`/sites/${id}`}
          className="px-3 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
        >
          Back
        </Link>
      </div>

      {/* FORM */}
      <div className="bg-white shadow p-6 rounded-xl space-y-4 mb-10">
        <input
          className="border rounded p-2 w-full"
          placeholder="Site Name"
          value={site.site_name}
          onChange={(e) => setSite({ ...site, site_name: e.target.value })}
        />
        <input
          className="border rounded p-2 w-full"
          placeholder="Address Line 1"
          value={site.address_line1}
          onChange={(e) =>
            setSite({ ...site, address_line1: e.target.value })
          }
        />
        <input
          className="border rounded p-2 w-full"
          placeholder="Address Line 2"
          value={site.address_line2 || ""}
          onChange={(e) =>
            setSite({ ...site, address_line2: e.target.value })
          }
        />

        <div className="flex gap-3">
          <input
            className="border rounded p-2 w-full"
            placeholder="City"
            value={site.city}
            onChange={(e) => setSite({ ...site, city: e.target.value })}
          />
          <input
            className="border rounded p-2 w-full"
            placeholder="State"
            value={site.state}
            onChange={(e) => setSite({ ...site, state: e.target.value })}
          />
        </div>

        <input
          className="border rounded p-2 w-full"
          placeholder="Postal Code"
          value={site.postal_code}
          onChange={(e) =>
            setSite({ ...site, postal_code: e.target.value })
          }
        />

        <input
          className="border rounded p-2 w-full"
          placeholder="Phone Number"
          value={site.phone_number || ""}
          onChange={(e) =>
            setSite({ ...site, phone_number: e.target.value })
          }
        />
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="px-4 py-2 bg-green-600 text-white rounded-lg shadow hover:bg-green-700"
      >
        {saving ? "Saving..." : "Save Changes"}
      </button>

      {/* DEVICE REGISTRY */}
      <div className="mt-12 bg-white shadow p-6 rounded-xl">
        <h2 className="text-xl font-bold mb-4">Device Registry</h2>

        {!registry && <p>No registry data received yet.</p>}

        {registry && (
          <div>
            <p className="font-semibold mb-3">
              Last Updated: {registry.gr_last_updated}
            </p>
            <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
              {JSON.stringify(registry.gr_devices, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
