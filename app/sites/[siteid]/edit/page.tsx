// app/sites/[siteid]/edit/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface EditSitePageProps {
  params: { siteid: string };
}

interface SiteRow {
  site_id: string;
  org_id: string | null;
  site_name: string;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  timezone: string | null;
  brand: string | null;
  customer_identifier_number: string | null;
  site_email: string | null;
  total_area_sqft: number | null;
  address_line1: string | null;
  address_line2: string | null;
  country: string | null;
  status: string | null;
  phone_number: string | null;
  ha_webhook_url: string | null;
  industry: string | null;
}

interface SiteFormState {
  site_name: string;
  brand: string;
  industry: string;
  customer_identifier_number: string;
  site_email: string;
  phone_number: string;
  status: string;
  timezone: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  total_area_sqft: string;
  ha_webhook_url: string;
}

interface GatewayRegistryRow {
  gr_id: string;
  ha_device_id: string;
  source_gateway: string;
  gr_device_name: string | null;
  gr_device_manufacturer: string | null;
  gr_device_model: string | null;
  gr_area: string | null;
  gr_device_sw_version: string | null;
  gr_device_hw_version: string | null;
  last_updated_at: string | null;
}

export default function EditSitePage({ params }: EditSitePageProps) {
  const { siteid } = params;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [form, setForm] = useState<SiteFormState>({
    site_name: "",
    brand: "",
    industry: "",
    customer_identifier_number: "",
    site_email: "",
    phone_number: "",
    status: "",
    timezone: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    postal_code: "",
    country: "",
    total_area_sqft: "",
    ha_webhook_url: "",
  });

  const [gatewayRows, setGatewayRows] = useState<GatewayRegistryRow[]>([]);
  const [loadingGatewayRows, setLoadingGatewayRows] = useState(true);

  // Fetch site
  useEffect(() => {
    const fetchSite = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("a_sites")
        .select("*")
        .eq("site_id", siteid)
        .single<SiteRow>();

      if (error || !data) {
        setError("Couldn't load site details. Please try again.");
        setLoading(false);
        return;
      }

      setForm({
        site_name: data.site_name ?? "",
        brand: data.brand ?? "",
        industry: data.industry ?? "",
        customer_identifier_number: data.customer_identifier_number ?? "",
        site_email: data.site_email ?? "",
        phone_number: data.phone_number ?? "",
        status: data.status ?? "",
        timezone: data.timezone ?? "",
        address_line1: data.address_line1 ?? "",
        address_line2: data.address_line2 ?? "",
        city: data.city ?? "",
        state: data.state ?? "",
        postal_code: data.postal_code ?? "",
        country: data.country ?? "",
        total_area_sqft: data.total_area_sqft?.toString() ?? "",
        ha_webhook_url: data.ha_webhook_url ?? "",
      });

      setLoading(false);
    };

    fetchSite();
  }, [siteid]);

  // Fetch gateway registry
  useEffect(() => {
    const fetchGateway = async () => {
      setLoadingGatewayRows(true);

      const { data, error } = await supabase
        .from("a_devices_gateway_registry")
        .select(
          `
          gr_id,
          ha_device_id,
          source_gateway,
          gr_device_name,
          gr_device_manufacturer,
          gr_device_model,
          gr_area,
          gr_device_sw_version,
          gr_device_hw_version,
          last_updated_at
        `
        )
        .eq("site_id", siteid)
        .order("gr_device_name");

      if (error) {
        console.error(error);
        setGatewayRows([]);
      } else {
        setGatewayRows((data as GatewayRegistryRow[]) ?? []);
      }

      setLoadingGatewayRows(false);
    };

    fetchGateway();
  }, [siteid]);

  const handleChange =
    (field: keyof SiteFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const handleCopyWebhook = async () => {
    if (!form.ha_webhook_url) return;
    await navigator.clipboard.writeText(form.ha_webhook_url);
    setSuccess("Webhook copied!");
    setTimeout(() => setSuccess(null), 1200);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const totalArea =
      form.total_area_sqft.trim() === "" ? null : Number(form.total_area_sqft);

    const { error } = await supabase
      .from("a_sites")
      .update({
        site_name: form.site_name,
        brand: form.brand || null,
        industry: form.industry || null,
        customer_identifier_number:
          form.customer_identifier_number.trim() || null,
        site_email: form.site_email.trim() || null,
        phone_number: form.phone_number.trim() || null,
        status: form.status || null,
        timezone: form.timezone || null,
        address_line1: form.address_line1 || null,
        address_line2: form.address_line2 || null,
        city: form.city || null,
        state: form.state || null,
        postal_code: form.postal_code || null,
        country: form.country || null,
        total_area_sqft: totalArea,
        ha_webhook_url: form.ha_webhook_url.trim() || null,
      })
      .eq("site_id", siteid);

    if (error) {
      setError("Failed to save changes.");
      setSaving(false);
      return;
    }

    setSuccess("Site updated!");
    setSaving(false);

    setTimeout(() => router.push(`/sites/${siteid}`), 600);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-600">
        Loading site…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Edit Site</h1>

        <Card className="shadow-md border border-gray-200">
          <CardHeader>
            <CardTitle className="text-xl">
              {form.site_name || "Site Details"}
            </CardTitle>
          </CardHeader>

          <CardContent>
            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700 rounded">
                {error}
              </div>
            )}

            {success && (
              <div className="mb-4 bg-green-50 border border-green-200 px-4 py-2 text-sm text-green-700 rounded">
                {success}
              </div>
            )}

            {/* FORM START */}
            <form onSubmit={handleSubmit} className="space-y-8">
              {/* --- Site fields section --- */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Site Name</Label>
                  <Input value={form.site_name} onChange={handleChange("site_name")} />
                </div>

                <div>
                  <Label>Brand</Label>
                  <Input value={form.brand} onChange={handleChange("brand")} />
                </div>

                <div>
                  <Label>Industry</Label>
                  <Select
                    value={form.industry}
                    onValueChange={(value) =>
                      setForm((prev) => ({ ...prev, industry: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select industry" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="QSR">QSR</SelectItem>
                      <SelectItem value="Retail">Retail</SelectItem>
                      <SelectItem value="Hospitality">Hospitality</SelectItem>
                      <SelectItem value="General Commercial">
                        General Commercial
                      </SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Row 2 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Store / Customer ID</Label>
                  <Input
                    value={form.customer_identifier_number}
                    onChange={handleChange("customer_identifier_number")}
                  />
                </div>

                <div>
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(value) =>
                      setForm((prev) => ({ ...prev, status: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Suspended">Suspended</SelectItem>
                      <SelectItem value="Closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Timezone</Label>
                  <Input
                    value={form.timezone}
                    onChange={handleChange("timezone")}
                    placeholder="America/Chicago"
                  />
                </div>
              </div>

              {/* Contact */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Site Email</Label>
                  <Input
                    type="email"
                    value={form.site_email}
                    onChange={handleChange("site_email")}
                  />
                </div>

                <div>
                  <Label>Phone Number</Label>
                  <Input
                    value={form.phone_number}
                    onChange={handleChange("phone_number")}
                  />
                </div>
              </div>

              {/* Address */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Address Line 1</Label>
                    <Input
                      value={form.address_line1}
                      onChange={handleChange("address_line1")}
                    />
                  </div>
                  <div>
                    <Label>Address Line 2</Label>
                    <Input
                      value={form.address_line2}
                      onChange={handleChange("address_line2")}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>City</Label>
                    <Input value={form.city} onChange={handleChange("city")} />
                  </div>

                  <div>
                    <Label>State</Label>
                    <Input value={form.state} onChange={handleChange("state")} />
                  </div>

                  <div>
                    <Label>Postal Code</Label>
                    <Input
                      value={form.postal_code}
                      onChange={handleChange("postal_code")}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Country</Label>
                    <Input
                      value={form.country}
                      onChange={handleChange("country")}
                    />
                  </div>

                  <div>
                    <Label>Total Area (sq ft)</Label>
                    <Input
                      value={form.total_area_sqft}
                      onChange={handleChange("total_area_sqft")}
                    />
                  </div>
                </div>
              </div>

              {/* Webhook */}
              <div>
                <Label>Home Assistant Webhook URL</Label>
                <Textarea
                  value={form.ha_webhook_url}
                  rows={2}
                  onChange={handleChange("ha_webhook_url")}
                />
              </div>

              {/* FORM FOOTER */}
              <CardFooter className="px-0 pt-4 flex justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push(`/sites/${siteid}`)}
                >
                  Cancel
                </Button>

                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save Changes"}
                </Button>
              </CardFooter>
            </form>
            {/* FORM END */}

            {/* ─────────────────────────────────────────────
                HOME ASSISTANT DEVICES SECTION (NOW OUTSIDE FORM)
              ───────────────────────────────────────────── */}
            <div className="mt-10 pt-6 border-t border-gray-300">
              <h2 className="text-lg font-semibold mb-2">
                Home Assistant & Gateway Devices
              </h2>

              <p className="text-sm text-gray-600 mb-4">
                Devices reported by Home Assistant via your sync endpoint.
              </p>

              <div className="mb-4 space-y-2">
                <Label>Webhook / Sync Endpoint</Label>
                <div className="flex flex-col md:flex-row gap-2">
                  <Input
                    readOnly
                    value={
                      form.ha_webhook_url ||
                      `https://streetsmartbuildings.com/api/sites/${siteid}/sync-ha`
                    }
                  />
                  <Button variant="outline" onClick={handleCopyWebhook}>
                    Copy
                  </Button>
                </div>
              </div>

              {/* Table */}
              {loadingGatewayRows ? (
                <p className="text-sm text-gray-500">Loading…</p>
              ) : gatewayRows.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No devices have been received from Home Assistant yet.
                </p>
              ) : (
                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">
                          Device Name
                        </th>
                        <th className="px-3 py-2 text-left font-semibold">
                          HA Device ID
                        </th>
                        <th className="px-3 py-2 text-left font-semibold">
                          Manufacturer
                        </th>
                        <th className="px-3 py-2 text-left font-semibold">
                          Model
                        </th>
                        <th className="px-3 py-2 text-left font-semibold">Area</th>
                        <th className="px-3 py-2 text-left font-semibold">
                          Source Gateway
                        </th>
                        <th className="px-3 py-2 text-left font-semibold">
                          Last Updated
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {gatewayRows.map((row) => (
                        <tr key={row.gr_id} className="border-t hover:bg-gray-50">
                          <td className="px-3 py-2">
                            {row.gr_device_name || "—"}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {row.ha_device_id}
                          </td>
                          <td className="px-3 py-2">
                            {row.gr_device_manufacturer || "—"}
                          </td>
                          <td className="px-3 py-2">
                            {row.gr_device_model || "—"}
                          </td>
                          <td className="px-3 py-2">{row.gr_area || "—"}</td>
                          <td className="px-3 py-2">
                            {row.source_gateway || "ha"}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500">
                            {row.last_updated_at
                              ? new Date(row.last_updated_at).toLocaleString()
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
