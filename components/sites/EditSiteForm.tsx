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

import { TIMEZONE_OPTIONS } from "@/lib/timezones"; // ✅ FIXED — correct import location

interface EditSiteFormProps {
  site: any; // From server-side
}

export default function EditSiteForm({ site }: EditSiteFormProps) {
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // HA Connection state
  const [haUrl, setHaUrl] = useState(site.ha_url ?? "");
  const [haToken, setHaToken] = useState("");
  const [haTokenSet, setHaTokenSet] = useState(!!site.ha_token_set);
  const [haTestStatus, setHaTestStatus] = useState<"idle" | "testing" | "connected" | "failed">("idle");
  const [haSaving, setHaSaving] = useState(false);
  const [haError, setHaError] = useState<string | null>(null);
  const [haSuccess, setHaSuccess] = useState<string | null>(null);

  const [form, setForm] = useState({
    site_name: site.site_name ?? "",
    brand: site.brand ?? "",
    industry: site.industry ?? "",
    customer_identifier_number: site.customer_identifier_number ?? "",
    site_email: site.site_email ?? "",
    phone_number: site.phone_number ?? "",
    status: site.status ?? "",
    timezone: site.timezone ?? "America/Chicago", // ✅ Default CST
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

  const handleTestHA = async () => {
    setHaTestStatus("testing");
    try {
      const res = await fetch(`/api/ha/test-connection?siteId=${site.site_id}`);
      const data = await res.json();
      setHaTestStatus(data.connected ? "connected" : "failed");
    } catch {
      setHaTestStatus("failed");
    }
  };

  const handleSaveHA = async () => {
    setHaSaving(true);
    setHaError(null);
    setHaSuccess(null);
    try {
      const res = await fetch(`/api/site/${site.site_id}/ha-credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ha_url: haUrl,
          ...(haToken ? { ha_token: haToken } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setHaError(data.error || "Failed to save HA credentials");
      } else {
        setHaSuccess("HA credentials saved.");
        if (haToken) setHaTokenSet(true);
        setHaToken("");
        setHaTestStatus("idle");
      }
    } catch {
      setHaError("Network error saving HA credentials");
    }
    setHaSaving(false);
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
        timezone: form.timezone || null, // ✅ Correct
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

            {/* ✅ REPLACED TIMEZONE FIELD */}
            <div>
              <Label htmlFor="timezone">Timezone</Label>
              <Select
                value={form.timezone || "America/Chicago"}
                onValueChange={handleSelectChange("timezone")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

          {/* HA Connection Section */}
          <div className="border border-blue-200 bg-blue-50/30 rounded-lg p-4 space-y-4">
            <h3 className="text-sm font-semibold text-blue-800">Home Assistant Connection</h3>

            {haError && (
              <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {haError}
              </div>
            )}
            {haSuccess && (
              <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
                {haSuccess}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="ha_url">HA URL</Label>
                <Input
                  id="ha_url"
                  value={haUrl}
                  onChange={(e) => setHaUrl(e.target.value)}
                  placeholder="http://homeassistant.local:8123"
                />
              </div>

              <div>
                <Label htmlFor="ha_token">
                  Long-Lived Access Token
                  {haTokenSet && <span className="text-green-600 ml-2 text-xs font-normal">(set)</span>}
                </Label>
                <Input
                  id="ha_token"
                  type="password"
                  value={haToken}
                  onChange={(e) => setHaToken(e.target.value)}
                  placeholder={haTokenSet ? "••••••••" : "Paste token here"}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSaveHA}
                disabled={haSaving || !haUrl}
              >
                {haSaving ? "Saving..." : "Save HA Credentials"}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestHA}
                disabled={haTestStatus === "testing"}
              >
                {haTestStatus === "testing" ? "Testing..." : "Test Connection"}
              </Button>

              {haTestStatus === "connected" && (
                <span className="text-sm text-green-600 font-medium">Connected</span>
              )}
              {haTestStatus === "failed" && (
                <span className="text-sm text-red-600 font-medium">Connection failed</span>
              )}
            </div>
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
