// app/sites/[siteid]/edit/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
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

              {/* Webhook */}
              <div>
                <Label htmlFor="ha_webhook_url">Home Assistant Webhook URL</Label>
                <Textarea
                  id="ha_webhook_url"
                  value={form.ha_webhook_url}
                  onChange={handleChange("ha_webhook_url")}
                  rows={2}
                />
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
