"use client";

import { useState, useMemo } from "react";

// Static product catalog — Part # format: CC-FF-VV (Category-Family-Vendor)
//   01 = Hub & Infrastructure
//   02 = Equipment Controls
//   03 = Component Monitoring

type Product = {
  partNumber: string;
  name: string;
  vendor: string;
  unitPrice: number | null;
  purchaseUrl?: string | null;
  status: "confirmed" | "price_tbd" | "not_sourced" | "obsolete" | "do_not_use";
  category: string;
  categoryCode: string;
};

const PRODUCTS: Product[] = [
  // 01 — Hub & Infrastructure
  { partNumber: "01-01-01", name: "Home Assistant Connect ZWA-2", vendor: "Amazon", unitPrice: 79.00,
    purchaseUrl: "https://www.amazon.com/dp/B0FL858V4Q?ref=ppx_yo2ov_dt_b_fed_asin_title",
    status: "confirmed", category: "Hub & Infrastructure", categoryCode: "01" },

  { partNumber: "01-02-01", name: "Home Assistant Green (Cloudflare Shop)", vendor: "Cloudflare", unitPrice: 128.95,
    purchaseUrl: "https://cloudfree.shop/product/home-assistant-green/",
    status: "confirmed", category: "Hub & Infrastructure", categoryCode: "01" },
  { partNumber: "01-02-02", name: "Home Assistant Green (Amazon)", vendor: "Amazon", unitPrice: 159.00,
    purchaseUrl: "https://www.amazon.com/dp/B0CXVKSG19",
    status: "confirmed", category: "Hub & Infrastructure", categoryCode: "01" },
  { partNumber: "01-02-03", name: "Home Assistant Green (Seedstudio)", vendor: "Seedstudio", unitPrice: 129.00,
    purchaseUrl: "https://www.seeedstudio.com/Home-Assistant-Green-p-5792.html",
    status: "confirmed", category: "Hub & Infrastructure", categoryCode: "01" },
  { partNumber: "01-02-04", name: "Home Assistant Green (AmeriDroid)", vendor: "AmeriDroid", unitPrice: 129.00,
    purchaseUrl: "https://ameridroid.com/products/home-assistant-green",
    status: "confirmed", category: "Hub & Infrastructure", categoryCode: "01" },

  { partNumber: "01-04-01", name: "Waveshare USB to RS485 Converter", vendor: "Amazon", unitPrice: 15.99,
    purchaseUrl: "https://www.amazon.com/dp/B081NBCJRS?ref=ppx_yo2ov_dt_b_fed_asin_title",
    status: "confirmed", category: "Hub & Infrastructure", categoryCode: "01" },

  { partNumber: "01-06-01", name: "Zooz ZSE70 800LR Outdoor Motion/Temp/Lux Sensor", vendor: "thesmartesthouse.com", unitPrice: 40.45,
    purchaseUrl: null,
    status: "confirmed", category: "Hub & Infrastructure", categoryCode: "01" },

  { partNumber: "01-07-01", name: "HDR 30-24 DIN Rail PSU (30W)", vendor: "TRC Electronics", unitPrice: 28.68,
    purchaseUrl: "https://www.trcelectronics.com/products/mean-well-hdr-30-24",
    status: "confirmed", category: "Hub & Infrastructure", categoryCode: "01" },
  { partNumber: "01-07-02", name: "Meanwell HDR-15-24 PSU (15W)", vendor: "Amazon", unitPrice: 9.95,
    purchaseUrl: null,
    status: "confirmed", category: "Hub & Infrastructure", categoryCode: "01" },

  { partNumber: "01-09-01", name: "Cudy 8-Port Network Switch", vendor: "Amazon", unitPrice: 79.99,
    purchaseUrl: null,
    status: "confirmed", category: "Hub & Infrastructure", categoryCode: "01" },

  // 02 — Equipment Controls
  { partNumber: "02-01-01", name: "Honeywell T6 Pro Z-Wave Thermostat", vendor: "Amazon", unitPrice: 117.80,
    purchaseUrl: "https://www.amazon.com/dp/B0BHTQF8NL?ref=ppx_yo2ov_dt_b_fed_asin_title",
    status: "confirmed", category: "Equipment Controls", categoryCode: "02" },

  { partNumber: "02-03-01", name: "Auto Recloser 15A", vendor: "Amazon", unitPrice: 174.00,
    purchaseUrl: null, status: "confirmed", category: "Equipment Controls", categoryCode: "02" },
  { partNumber: "02-03-02", name: "Auto Recloser 25A", vendor: "Amazon", unitPrice: 174.28,
    purchaseUrl: null, status: "confirmed", category: "Equipment Controls", categoryCode: "02" },
  { partNumber: "02-03-03", name: "Auto Recloser 40A", vendor: "Amazon", unitPrice: 178.28,
    purchaseUrl: null, status: "confirmed", category: "Equipment Controls", categoryCode: "02" },
  { partNumber: "02-03-04", name: "Auto Recloser 60A", vendor: "Amazon", unitPrice: 182.28,
    purchaseUrl: null, status: "confirmed", category: "Equipment Controls", categoryCode: "02" },

  { partNumber: "02-06-01", name: "Zooz ZEN78 800LR High Power Relay 40A", vendor: "thesmartesthouse.com", unitPrice: 80.17,
    purchaseUrl: null, status: "confirmed", category: "Equipment Controls", categoryCode: "02" },

  // 03 — Component Monitoring
  { partNumber: "03-03-01", name: "Split-Core CT 100A/100mA", vendor: "Amazon", unitPrice: 13.24,
    purchaseUrl: null, status: "do_not_use", category: "Component Monitoring", categoryCode: "03" },
  { partNumber: "03-03-02", name: "Split-Core CT 50A/.333A", vendor: "onsetcomp.com", unitPrice: 55.00,
    purchaseUrl: null, status: "do_not_use", category: "Component Monitoring", categoryCode: "03" },
  { partNumber: "03-03-03", name: "Split-Core CT 100/5 (AccuEnergy)", vendor: "AccuEnergy", unitPrice: 53.60,
    purchaseUrl: "https://shop.accuenergy.com/product/acuct-0812-100a-5a/",
    status: "confirmed", category: "Component Monitoring", categoryCode: "03" },

  { partNumber: "03-04-01", name: "Zooz ZSE44 Z-Wave LR Temp/Humidity Sensor", vendor: "Amazon", unitPrice: 44.95,
    purchaseUrl: null, status: "confirmed", category: "Component Monitoring", categoryCode: "03" },

  { partNumber: "03-05-01", name: "Zooz ZSE11 800LR Q Sensor", vendor: "thesmartesthouse.com", unitPrice: 36.95,
    purchaseUrl: null, status: "confirmed", category: "Component Monitoring", categoryCode: "03" },

  { partNumber: "03-09-01", name: "Z-Wave LR Leak Detection Sensor (Discontinued)", vendor: "Amazon", unitPrice: 53.11,
    purchaseUrl: null, status: "obsolete", category: "Component Monitoring", categoryCode: "03" },
  { partNumber: "03-09-02", name: "Z-Wave LR Leak Detection Sensor", vendor: "Amazon", unitPrice: 41.65,
    purchaseUrl: "https://www.amazon.com/dp/B0D7MZK7N6?ref=ppx_yo2ov_dt_b_fed_asin_title",
    status: "confirmed", category: "Component Monitoring", categoryCode: "03" },

  { partNumber: "03-10-01", name: "Schneider METSEPM3200", vendor: "wiautomation", unitPrice: 403.09,
    purchaseUrl: null, status: "do_not_use", category: "Component Monitoring", categoryCode: "03" },
  { partNumber: "03-10-02", name: "Schneider Electric PM3250 Smart Meter", vendor: "wiautomation", unitPrice: 463.51,
    purchaseUrl: null, status: "confirmed", category: "Component Monitoring", categoryCode: "03" },
  { partNumber: "03-10-03", name: "Schneider IEM3255 Smart Meter", vendor: "rs-online.com", unitPrice: null,
    purchaseUrl: "https://us.rs-online.com/product/schneider-electric/a9mem3255/70815234/",
    status: "price_tbd", category: "Component Monitoring", categoryCode: "03" },

  { partNumber: "03-11-01", name: "Zooz ZEN04 Z-Wave LR Smart Plug", vendor: "thesmartesthouse.com", unitPrice: 26.95,
    purchaseUrl: null, status: "confirmed", category: "Component Monitoring", categoryCode: "03" },

  { partNumber: "03-12-01", name: "Zooz ZEN15 800LR Heavy Duty Power Switch", vendor: "thesmartesthouse.com", unitPrice: 36.95,
    purchaseUrl: null, status: "confirmed", category: "Component Monitoring", categoryCode: "03" },

  { partNumber: "03-13-01", name: "Z-Wave LR Door Sensor + Weatherproof Case", vendor: "thesmartesthouse.com", unitPrice: 19.45,
    purchaseUrl: "https://www.thesmartesthouse.com/products/zooz-z-wave-plus-700-series-xs-open-close-sensor-zse41",
    status: "confirmed", category: "Component Monitoring", categoryCode: "03" },

  { partNumber: "03-14-01", name: "Zooz ZEN58 800LR Low Voltage XS Relay", vendor: "thesmartesthouse.com", unitPrice: 24.95,
    purchaseUrl: null, status: "confirmed", category: "Component Monitoring", categoryCode: "03" },

  { partNumber: "03-15-01", name: "Zooz ZEN16 800LR Multirelay", vendor: "thesmartesthouse.com", unitPrice: 33.95,
    purchaseUrl: null, status: "confirmed", category: "Component Monitoring", categoryCode: "03" },
  { partNumber: "03-15-02", name: "Zooz ZEN17 800LR Advanced Multirelay", vendor: "thesmartesthouse.com", unitPrice: 36.95,
    purchaseUrl: null, status: "confirmed", category: "Component Monitoring", categoryCode: "03" },
];

const STATUS_STYLES: Record<string, { label: string; bg: string; text: string; strike?: boolean }> = {
  confirmed:   { label: "Confirmed",   bg: "bg-[#D4EDDA]", text: "text-green-800" },
  price_tbd:   { label: "Price TBD",   bg: "bg-[#FFF3CD]", text: "text-yellow-800" },
  not_sourced: { label: "Not Sourced", bg: "bg-[#FDECEA]", text: "text-red-800" },
  obsolete:    { label: "Obsolete",    bg: "bg-[#E8E8E8]", text: "text-gray-600" },
  do_not_use:  { label: "Do Not Use",  bg: "bg-[#FDECEA]", text: "text-red-800", strike: true },
};

const CATEGORIES = [
  { code: "01", name: "Hub & Infrastructure" },
  { code: "02", name: "Equipment Controls" },
  { code: "03", name: "Component Monitoring" },
];

export default function ProductCatalogueTab() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const filtered = useMemo(() => {
    return PRODUCTS.filter((p) => {
      if (search) {
        const q = search.toLowerCase().trim();
        if (!p.name.toLowerCase().includes(q) &&
            !p.partNumber.toLowerCase().includes(q) &&
            !p.vendor.toLowerCase().includes(q)) return false;
      }
      if (statusFilter && p.status !== statusFilter) return false;
      return true;
    });
  }, [search, statusFilter]);

  const urlCount = PRODUCTS.filter((p) => p.purchaseUrl).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search by name, part #, or vendor..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded-md px-2 py-1.5 text-sm"
        >
          <option value="">All Statuses</option>
          {Object.entries(STATUS_STYLES).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <span className="text-xs text-gray-400">{filtered.length} products · {urlCount} with links</span>
      </div>

      {CATEGORIES.map((cat) => {
        const catProducts = filtered.filter((p) => p.categoryCode === cat.code);
        if (catProducts.length === 0) return null;
        return (
          <div key={cat.code} className="border rounded-lg bg-white overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b">
              <h3 className="text-sm font-semibold text-gray-700">{cat.code} — {cat.name}</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-24">Part #</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Product Name</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Vendor</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 w-24">Unit Price</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-gray-500 w-28">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {catProducts.map((p) => {
                  const st = STATUS_STYLES[p.status];
                  return (
                    <tr key={p.partNumber} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-xs text-gray-600">{p.partNumber}</td>
                      <td className={`px-3 py-2 ${st.strike ? "line-through text-red-600" : "text-gray-900"}`}>
                        {p.purchaseUrl ? (
                          <a
                            href={p.purchaseUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            {p.name}
                          </a>
                        ) : p.name}
                      </td>
                      <td className="px-3 py-2 text-gray-600">{p.vendor}</td>
                      <td className="px-3 py-2 text-right font-mono">
                        {p.unitPrice != null ? `$${p.unitPrice.toFixed(2)}` : "—"}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${st.bg} ${st.text}`}>
                          {st.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
