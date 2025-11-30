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
  total_area_sqft: string; // keep as string in the UI
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

  // Fetch existing site to prefill the form
  useEffect(() => {
    const fetchSite = async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("a_sites")
        .select("*")
        .eq("site_id", siteid)
        .single<SiteRow>();

      if (error || !data) {
        console.error("Error fetching site for edit:", error);
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

  // Fetch Home Assistant gateway registry rows for this site
  useEffect(() => {
    const fetchGatewayRows = async () => {
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
        .order("gr_device_name", { ascending: true });

      if (error) {
        console.error("Error fetching gateway registry rows:", error);
        // don't surface as a blocking error, just log
        setGatewayRows([]);
        setLoadingGatewayRows(false);
        return;
      }

      setGatewayRows((data as GatewayRegistryRow[]) ?? []);
      setLoadingGatewayRows(false);
    };

    fetchGatewayRows();
  }, [siteid]);

  const handleChange =
    (field: keyof SiteFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const handleIndustryChange = (value: string) => {
    setForm((prev) => ({ ...prev, industry: value }));
  };

  const handleStatusChange = (value: string) => {
    setForm((prev) => ({ ...prev, status: value }));
  };

  const handleCopyWebhook = async () => {
    if (!form.ha_webhook_url) return;

    try {
      await navigator.clipboard.writeText(form.ha_webhook_url);
      setSuccess("Webhook URL copied to clipboard.");
      setTimeout(() => setSuccess(null), 1500);
    } catch (err) {
      console.error("Failed to copy webhook:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    // Convert numeric-ish fields
    const totalArea =
      form.total_area_sqft.trim() === "" ? null : Number(form.total_area_sqft);

    const { error: updateError } = await supabase
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

    if (updateError) {
      console.error("Error updating site:", updateError);
      setError("Failed to save changes. Please try again.");
      setSaving(false);
      return;
    }

    setSuccess("Site updated successfully.");
    setSaving(false);

    // small delay then go back to site page
    setTimeout(() => {
      router.push(`/sites/${siteid}`);
    }, 800);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">Loading site…</p>
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
              {form.site_name || "Site details"}
            </CardTitle>
          </CardHeader>

          <CardContent>
            {error && (
              <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
            {success && (
              <div className="mb-4 rounded-md bg-green-50 border border-green-200 px-4 py-2 text-sm text-green-700">
                {success}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Top row: Name + Brand + Industry */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="site_name">Site Name</Label>
                  <Input
                    id="site_name"
                    value={form.site_name}
                    onChange={handleChange("site_name")}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="brand">Brand</Label>
                  <Input
                    id="brand"
                    value={form.brand}
                    onChange={handleChange("brand")}
                    placeholder="Wendy's, Burger King, etc."
                  />
                </div>

                <div>
                  <Label>Industry</Label>
                  <Select
                    value={form.industry || ""}
                    onValueChange={handleIndustryChange}
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

              {/* Identifier + Status + Timezone */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="customer_identifier_number">
                    Store / Customer ID
                  </Label>
                  <Input
                    id="customer_identifier_number"
                    value={form.customer_identifier_number}
                    onChange={handleChange("customer_identifier_number")}
                    placeholder="e.g., 3301"
                  />
                </div>

                <div>
                  <Label>Status</Label>
                  <Select
                    value={form.status || ""}
                    onValueChange={handleStatusChange}
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
                  <Label htmlFor="timezone">Timezone</Label>
                  <Input
                    id="timezone"
                    value={form.timezone}
                    onChange={handleChange("timezone")}
                    placeholder="America/Chicago"
                  />
                </div>
              </div>

              {/* Contact */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="site_email">Site Email</Label>
                  <Input
                    id="site_email"
                    type="email"
                    value={form.site_email}
                    onChange={handleChange("site_email")}
                    placeholder="manager@example.com"
                  />
                </div>

                <div>
                  <Label htmlFor="phone_number">Phone Number</Label>
                  <Input
                    id="phone_number"
                    value={form.phone_number}
                    onChange={handleChange("phone_number")}
                    placeholder="517-555-1234"
                  />
                </div>
              </div>

              {/* Address block */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="address_line1">Address Line 1</Label>
                    <Input
                      id="address_line1"
                      value={form.address_line1}
                      onChange={handleChange("address_line1")}
                    />
                  </div>
                  <div>
                    <Label htmlFor="address_line2">Address Line 2</Label>
                    <Input
                      id="address_line2"
                      value={form.address_line2}
                      onChange={handleChange("address_line2")}
                      placeholder="Suite, Unit, etc. (optional)"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={form.city}
                      onChange={handleChange("city")}
                    />
                  </div>
                  <div>
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      value={form.state}
                      onChange={handleChange("state")}
                    />
                  </div>
                  <div>
                    <Label htmlFor="postal_code">Postal Code</Label>
                    <Input
                      id="postal_code"
                      value={form.postal_code}
                      onChange={handleChange("postal_code")}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="country">Country</Label>
                    <Input
                      id="country"
                      value={form.country}
                      onChange={handleChange("country")}
                      placeholder="US"
                    />
                  </div>

                  <div>
                    <Label htmlFor="total_area_sqft">Total Area (sq ft)</Label>
                    <Input
                      id="total_area_sqft"
                      value={form.total_area_sqft}
                      onChange={handleChange("total_area_sqft")}
                      inputMode="numeric"
                    />
                  </div>
                </div>
              </div>

              {/* Webhook (part of site model) */}
              <div>
                <Label htmlFor="ha_webhook_url">Home Assistant Webhook URL</Label>
                <Textarea
                  id="ha_webhook_url"
                  value={form.ha_webhook_url}
                  onChange={handleChange("ha_webhook_url")}
                  rows={2}
                />
              </div>

              {/* ─────────────────────────────────────────────
                  Home Assistant & Gateway Devices section (Option B)
                ───────────────────────────────────────────── */}
              <div className="mt-8 pt-6 border-t border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold">
                      Home Assistant & Gateway Devices
                    </h2>
                    <p className="text-sm text-gray-600">
                      This section shows devices that Home Assistant has reported
                      for this site via the sync endpoint. Use this for mapping
                      HA devices to equipment and to verify your integration.
                    </p>
                  </div>
                </div>

                {/* Webhook + hint for HA automation */}
                <div className="mb-4 space-y-2">
                  <Label>Webhook / Sync Endpoint</Label>
                  <p className="text-xs text-gray-500 mb-1">
                    Your Home Assistant automation should POST its device/entity
                    payload to this URL (or a Cloudflare tunnel URL that
                    forwards to it).
                  </p>
                  <div className="flex flex-col md:flex-row gap-2">
                    <Input
                      value={
                        form.ha_webhook_url ||
                        `https://streetsmartbuildings.com/api/sites/${siteid}/sync-ha`
                      }
                      readOnly
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCopyWebhook}
                    >
                      Copy
                    </Button>
                  </div>
                </div>

                {/* Registry table */}
                <div className="mt-4">
                  {loadingGatewayRows ? (
                    <p className="text-sm text-gray-500">
                      Loading gateway registry…
                    </p>
                  ) : gatewayRows.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      No devices have been received from Home Assistant yet. Once
                      your HA automation calls{" "}
                      <code className="bg-gray-100 px-1 rounded text-xs">
                        /api/sites/{siteid}/sync-ha
                      </code>
                      , devices will appear here.
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
                            <th className="px-3 py-2 text-left font-semibold">
                              Area
                            </th>
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
                            <tr
                              key={row.gr_id}
                              className="border-t hover:bg-gray-50"
                            >
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
                              <td className="px-3 py-2">
                                {row.gr_area || "—"}
                              </td>
                              <td className="px-3 py-2">
                                {row.source_gateway || "ha"}
                              </td>
                              <td className="px-3 py-2 text-xs text-gray-500">
                                {row.last_updated_at
                                  ? new Date(
                                      row.last_updated_at
                                    ).toLocaleString()
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              <CardFooter className="px-0 pt-4 flex justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push(`/sites/${siteid}`)}
                  disabled={saving}
                >
                  Cancel
                </Button>

                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save Changes"}
                </Button>
              </CardFooter>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
