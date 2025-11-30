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
        console.error("Error fetching site:", error);
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

  const handleIndustryChange = (value: string) =>
    setForm((prev) => ({ ...prev, industry: value }));

  const handleStatusChange = (value: string) =>
    setForm((prev) => ({ ...prev, status: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

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

    setTimeout(() => router.push(`/sites/${siteid}`), 700);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">Loading…</p>
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
              {/* Top row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Site Name</Label>
                  <Input
                    value={form.site_name}
                    onChange={handleChange("site_name")}
                  />
                </div>

                <div>
                  <Label>Brand</Label>
                  <Input
                    value={form.brand}
                    onChange={handleChange("brand")}
                  />
                </div>

                <div>
                  <Label>Industry</Label>
                  <Select value={form.industry} onValueChange={handleIndustryChange}>
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

              {/* Second row */}
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
                  <Select value={form.status} onValueChange={handleStatusChange}>
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
                  />
                </div>
              </div>

              {/* Email + Phone */}
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

              {/* Address fields */}
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
