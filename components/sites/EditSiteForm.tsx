"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface EditSiteFormProps {
  site: any; // From server-side
}

export default function EditSiteForm({ site }: EditSiteFormProps) {
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [form, setForm] = useState({
    site_name: site.site_name ?? "",
    brand: site.brand ?? "",
    industry: site.industry ?? "",
    customer_identifier_number: site.customer_identifier_number ?? "",
    site_email: site.site_email ?? "",
    phone_number: site.phone_number ?? "",
    status: site.status ?? "",
    timezone: site.timezone ?? "",
    address_line1: site.address_line1 ?? "",
    address_line2: site.address_line2 ?? "",
    city: site.city ?? "",
    state: site.state ?? "",
    postal_code: site.postal_code ?? "",
    country: site.country ?? "",
    total_area_sqft: site.total_area_sqft?.toString() ?? "",
    ha_webhook_url: site.ha_webhook_url ?? "",
  });

  const handleChange =
    (field: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const handleSelectChange =
    (field: string) => (value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    };

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
      .eq("site_id", site.site_id);

    if (updateError) {
      console.error("Update error:", updateError);
      setError("Failed to save changes. Please try again.");
      setSaving(false);
      return;
    }

    setSuccess("Site updated successfully.");

    setTimeout(() => {
      router.push(`/sites/${site.site_id}`);
    }, 800);

    setSaving(false);
  };

  return (
    <Card className="shadow-md border border-gray-200">
      <CardHeader>
        <CardTitle className="text-xl">Edit Site</CardTitle>
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
                onValueChange={handleSelectChange("industry")}
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
              <Label htmlFor="customer_identifier_number">Store / Customer ID</Label>
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
                onValueChange={handleSelectChange("status")}
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

          {/* Address */}
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
              onClick={() => router.push(`/sites/${site.site_id}`)}
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
  );
}
