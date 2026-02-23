"use client";

import { useState } from "react";

/* ─── Tab: Customer-Facing Overview ─── */
function CustomerOverview() {
  return (
    <div style={{ padding: "28px 32px" }}>
      {/* Value Proposition */}
      <h3
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: "#111827",
          margin: "0 0 8px",
        }}
      >
        Why Integration Matters
      </h3>
      <p
        style={{
          fontSize: 14,
          color: "#4B5563",
          lineHeight: 1.7,
          margin: "0 0 28px",
          maxWidth: 720,
        }}
      >
        Eagle Eyes is designed to fit into your existing operations — not replace them.
        Your work order system, hotel reservations, and scheduling tools already hold
        the data we need. We connect to them so your buildings respond automatically,
        without manual input or duplicate effort.
      </p>

      {/* Three Pillars */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 32 }}>
        {[
          {
            icon: "🔌",
            title: "No Rip-and-Replace",
            description:
              "Eagle Eyes plugs into your existing CMMS, PMS, POS, and scheduling tools via standard APIs and calendar feeds. Your team keeps their current workflow.",
          },
          {
            icon: "🏢",
            title: "Enterprise-Ready",
            description:
              "Secure API keys, bulk operations for hundreds of sites, and full audit logging. Built for the procurement and IT standards your organization requires.",
          },
          {
            icon: "⚡",
            title: "Real-Time Response",
            description:
              "When a work order is created or a guest checks in, equipment adjusts immediately. No waiting, no manual override, no missed events.",
          },
        ].map((item) => (
          <div
            key={item.title}
            style={{
              flex: "1 1 250px",
              minWidth: 250,
              background: "#F9FAFB",
              border: "1px solid #E5E7EB",
              borderRadius: 10,
              padding: "20px 20px",
            }}
          >
            <div style={{ fontSize: 24, marginBottom: 8 }}>{item.icon}</div>
            <div
              style={{
                fontWeight: 600,
                fontSize: 15,
                color: "#111827",
                marginBottom: 6,
              }}
            >
              {item.title}
            </div>
            <div style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.6 }}>
              {item.description}
            </div>
          </div>
        ))}
      </div>

      {/* Integration Interfaces */}
      <h3
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: "#111827",
          margin: "0 0 12px",
        }}
      >
        Integration & Automation Interfaces
      </h3>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 32 }}>
        {[
          {
            label: "API Ingestion",
            desc: "REST endpoints for creating, updating, and canceling events programmatically from any system.",
            systems: "ServiceChannel, Corrigo, FacilityDude, Custom CMMS",
            icon: "📡",
          },
          {
            label: "Calendar Sync",
            desc: "Automatic polling of iCal/ICS feeds from hotel and reservation platforms. Set it once — stays in sync forever.",
            systems: "Cloudbeds, Opera PMS, Guesty, Lodgify, Airbnb, VRBO",
            icon: "📅",
          },
          {
            label: "Occupancy Integration",
            desc: "Multi-day reservation mapping with check-in/check-out time windows. Rooms pre-condition before arrival and setback after departure.",
            systems: "Any hotel PMS with calendar export",
            icon: "🏨",
          },
          {
            label: "CMMS / Work-Order Hooks",
            desc: "Maintenance work orders automatically create alert-mute windows. Technicians arrive to a quiet system, not a flood of false alarms.",
            systems: "ServiceChannel, Corrigo, ServiceNow, custom platforms",
            icon: "🔧",
          },
          {
            label: "Outbound Notifications",
            desc: "Eagle Eyes pushes real-time alerts and equipment status changes to your existing monitoring and communication tools.",
            systems: "Slack, PagerDuty, ServiceNow, email, custom dashboards",
            icon: "📤",
          },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              display: "flex",
              gap: 16,
              alignItems: "flex-start",
              padding: "16px 18px",
              border: "1px solid #E5E7EB",
              borderRadius: 8,
              background: "white",
            }}
          >
            <div
              style={{
                fontSize: 22,
                flexShrink: 0,
                width: 40,
                textAlign: "center",
                paddingTop: 2,
              }}
            >
              {item.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 14,
                  color: "#111827",
                  marginBottom: 4,
                }}
              >
                {item.label}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "#4B5563",
                  lineHeight: 1.6,
                  marginBottom: 6,
                }}
              >
                {item.desc}
              </div>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>
                <span style={{ fontWeight: 600, color: "#6B7280" }}>Works with:</span>{" "}
                {item.systems}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* What This Means For You */}
      <div
        style={{
          background: "linear-gradient(135deg, #065F46 0%, #047857 50%, #0D9488 100%)",
          borderRadius: 10,
          padding: "24px 28px",
          color: "white",
        }}
      >
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 10px" }}>
          What This Means For Your Team
        </h3>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          {[
            {
              who: "Operations",
              what: "Equipment responds to your schedule automatically — no manual overrides, no missed events.",
            },
            {
              who: "IT / Procurement",
              what: "Standard REST APIs, secure key management, and bulk operations that meet enterprise requirements.",
            },
            {
              who: "Maintenance",
              what: "Work orders automatically mute alerts during service windows. No more noise, just signal.",
            },
            {
              who: "Leadership",
              what: "Full audit trail and integration logging. Every automated action is tracked and reportable.",
            },
          ].map((item) => (
            <div key={item.who} style={{ flex: "1 1 200px", minWidth: 200 }}>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 13,
                  marginBottom: 4,
                  opacity: 0.9,
                }}
              >
                {item.who}
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.6, opacity: 0.82 }}>
                {item.what}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Tab: Full Technical Specification ─── */
function TechnicalSpec() {
  return (
    <div style={{ padding: "28px 32px" }}>
      <div
        style={{
          fontSize: 12,
          color: "#6B7280",
          marginBottom: 20,
          padding: "10px 14px",
          background: "#F9FAFB",
          border: "1px solid #E5E7EB",
          borderRadius: 8,
        }}
      >
        <strong>For IT & Development Teams</strong> — This specification covers
        authentication, endpoints, payloads, and data models for integrating
        external systems with Eagle Eyes.
      </div>

      <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.8 }}>

        {/* Section 1 */}
        <Section title="1. Authentication & API Keys">
          <p>
            Each organization receives one or more API keys for secure access.
            Keys follow the format <Code>ee_live_&lt;random-32-chars&gt;</Code> (production)
            or <Code>ee_test_&lt;random-32-chars&gt;</Code> (sandbox).
          </p>
          <p>Only the SHA-256 hash is stored. The full key is shown once at creation.</p>
          <CodeBlock>{`Authorization: Bearer ee_live_abc123...`}</CodeBlock>
          <p>
            Keys are scoped to organizations and optionally restricted to specific sites.
            Default rate limit: 100 requests/minute per key.
          </p>
        </Section>

        {/* Section 2 */}
        <Section title="2. Webhook API Endpoints">
          <SpecTable
            headers={["Method", "Path", "Description"]}
            rows={[
              ["POST", "/api/integrations/events", "Create a new event"],
              ["PUT", "/api/integrations/events/:external_id", "Update existing event"],
              ["DELETE", "/api/integrations/events/:external_id", "Cancel/remove an event"],
              ["GET", "/api/integrations/events", "List events (filtered)"],
              ["POST", "/api/integrations/events/bulk", "Batch create/update"],
            ]}
          />
        </Section>

        {/* Section 3 */}
        <Section title="3. Create Event — POST /api/integrations/events">
          <p><strong>Maintenance Example:</strong></p>
          <CodeBlock>{`{
  "external_id": "WO-2026-4521",
  "site_id": "aebd4fdf-...",
  "event_type": "planned_maintenance",
  "name": "HVAC Quarterly Filter Replacement",
  "date": "2026-03-15",
  "start_time": "09:00",
  "end_time": "12:00",
  "all_day": false,
  "metadata": {
    "vendor": "CoolAir HVAC Services",
    "work_order_id": "WO-2026-4521",
    "technician": "John Smith"
  }
}`}</CodeBlock>

          <p><strong>Hotel Occupancy Example:</strong></p>
          <CodeBlock>{`{
  "external_id": "RES-20260315-201",
  "site_id": "hotel-site-uuid",
  "event_type": "hotel_occupancy",
  "name": "Room 201 - Smith",
  "start_date": "2026-03-15",
  "end_date": "2026-03-18",
  "check_in_time": "15:00",
  "check_out_time": "11:00"
}`}</CodeBlock>

          <p>
            <strong>Idempotency:</strong> If <Code>external_id</Code> already exists for the same org,
            the existing event is updated rather than duplicated. Retries are safe.
          </p>
        </Section>

        {/* Section 4 */}
        <Section title="4. Bulk Operations">
          <CodeBlock>{`{
  "site_id": "aebd4fdf-...",
  "sync_mode": "full_replace",
  "source": "servicechannel",
  "events": [
    {
      "external_id": "WO-001",
      "event_type": "planned_maintenance",
      "name": "Filter Change",
      "date": "2026-03-15",
      "start_time": "09:00",
      "end_time": "12:00"
    }
  ]
}`}</CodeBlock>

          <SpecTable
            headers={["Mode", "Behavior"]}
            rows={[
              ["upsert", "Create or update each event. Don't touch others. (Default)"],
              ["full_replace", "Delete all events from this source, then create new ones."],
            ]}
          />
        </Section>

        {/* Section 5 */}
        <Section title="5. iCal / Calendar Sync">
          <p>
            Many hotel PMS systems export reservations as iCal (.ics) feeds.
            Eagle Eyes polls these feeds on a configurable interval and syncs
            reservations into occupancy events automatically.
          </p>
          <p><strong>Supported flow:</strong></p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "12px 0" }}>
            {["PMS exports iCal", "→", "Eagle Eyes polls feed", "→", "Parses reservations", "→", "Creates/updates events", "→", "Equipment adjusts"].map((item, i) => (
              item === "→" ? (
                <span key={i} style={{ color: "#9CA3AF", fontSize: 16 }}>→</span>
              ) : (
                <span
                  key={i}
                  style={{
                    background: "#F3F4F6",
                    padding: "4px 10px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 500,
                    color: "#374151",
                  }}
                >
                  {item}
                </span>
              )
            ))}
          </div>
          <p>
            Change detection via content hashing — feeds are only processed when content
            changes, minimizing unnecessary database operations.
          </p>
        </Section>

        {/* Section 6 */}
        <Section title="6. Outbound Webhooks">
          <p>
            Register webhook URLs to receive real-time notifications from Eagle Eyes.
            All payloads are signed with HMAC-SHA256 for verification.
          </p>
          <SpecTable
            headers={["Event", "Trigger"]}
            rows={[
              ["alert.created", "New alert generated"],
              ["alert.resolved", "Alert resolved (auto or manual)"],
              ["equipment.offline", "Equipment goes offline"],
              ["equipment.online", "Equipment comes back online"],
              ["schedule.changed", "Store hours or maintenance updated"],
              ["manifest.pushed", "New manifest pushed to HA"],
            ]}
          />
        </Section>

        {/* Section 7 */}
        <Section title="7. Error Codes">
          <SpecTable
            headers={["Code", "HTTP", "Description"]}
            rows={[
              ["AUTH_REQUIRED", "401", "Missing or invalid API key"],
              ["FORBIDDEN", "403", "Key doesn't have site access"],
              ["RATE_LIMITED", "429", "Too many requests"],
              ["VALIDATION_ERROR", "400", "Invalid request body"],
              ["SITE_NOT_FOUND", "404", "Site ID or code not found"],
              ["EVENT_NOT_FOUND", "404", "External ID not found"],
              ["INTERNAL_ERROR", "500", "Server error"],
            ]}
          />
        </Section>

        {/* Section 8 */}
        <Section title="8. Security">
          <ul style={{ margin: "8px 0", paddingLeft: 20 }}>
            <li>API keys are SHA-256 hashed before storage</li>
            <li>Keys are scoped to organizations with optional site restriction</li>
            <li>HTTPS required for all API traffic</li>
            <li>Outbound webhooks use HMAC-SHA256 signatures</li>
            <li>Rate limiting prevents abuse (configurable per key)</li>
            <li>Full audit logging of all API actions</li>
            <li>Key rotation without downtime</li>
          </ul>
        </Section>
      </div>
    </div>
  );
}

/* ─── Shared Components ─── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h4
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: "#111827",
          margin: "0 0 10px",
          paddingBottom: 6,
          borderBottom: "1px solid #E5E7EB",
        }}
      >
        {title}
      </h4>
      {children}
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code
      style={{
        background: "#F3F4F6",
        padding: "2px 6px",
        borderRadius: 4,
        fontSize: 12,
        fontFamily: "'Fira Code', 'Consolas', monospace",
        color: "#B91C1C",
      }}
    >
      {children}
    </code>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre
      style={{
        background: "#1F2937",
        color: "#E5E7EB",
        padding: "14px 18px",
        borderRadius: 8,
        fontSize: 12,
        lineHeight: 1.6,
        fontFamily: "'Fira Code', 'Consolas', monospace",
        overflowX: "auto",
        margin: "10px 0 14px",
      }}
    >
      {children}
    </pre>
  );
}

function SpecTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <div style={{ overflowX: "auto", margin: "10px 0 14px" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 12,
        }}
      >
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
                  padding: "8px 12px",
                  background: "#F9FAFB",
                  borderBottom: "2px solid #E5E7EB",
                  fontWeight: 600,
                  color: "#374151",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td
                  key={j}
                  style={{
                    padding: "8px 12px",
                    borderBottom: "1px solid #F3F4F6",
                    color: "#4B5563",
                    fontFamily: j === 0 ? "'Fira Code', 'Consolas', monospace" : "inherit",
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Main Component ─── */

export default function IntegrationSpec() {
  const [activeTab, setActiveTab] = useState<"overview" | "spec">("overview");

  return (
    <div
      style={{
        border: "1px solid #E5E7EB",
        borderRadius: 12,
        overflow: "hidden",
        background: "white",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "20px 32px 0",
          background: "#FAFAFA",
          borderBottom: "1px solid #E5E7EB",
        }}
      >
        <h2
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "#111827",
            margin: "0 0 4px",
          }}
        >
          Integration & Automation Interfaces
        </h2>
        <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 16px" }}>
          Eagle Eyes connects to your existing operational systems — no rip-and-replace required.
        </p>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0 }}>
          {[
            { key: "overview" as const, label: "Overview" },
            { key: "spec" as const, label: "Technical Specification" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: "10px 20px",
                fontSize: 13,
                fontWeight: 600,
                color: activeTab === tab.key ? "#059669" : "#6B7280",
                background: activeTab === tab.key ? "white" : "transparent",
                border: activeTab === tab.key ? "1px solid #E5E7EB" : "1px solid transparent",
                borderBottom: activeTab === tab.key ? "1px solid white" : "1px solid #E5E7EB",
                borderRadius: "8px 8px 0 0",
                cursor: "pointer",
                marginBottom: -1,
                transition: "color 0.15s",
              }}
            >
              {tab.label}
            </button>
          ))}
          <div style={{ flex: 1, borderBottom: "1px solid #E5E7EB", marginBottom: -1 }} />
        </div>
      </div>

      {/* Tab Content */}
      <div style={{ maxHeight: 700, overflowY: "auto" }}>
        {activeTab === "overview" ? <CustomerOverview /> : <TechnicalSpec />}
      </div>
    </div>
  );
}
