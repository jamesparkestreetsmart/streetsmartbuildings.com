"use client";

import { useState } from "react";

const EVENT_TYPES = [
  {
    type: "Planned Maintenance",
    icon: "🔧",
    description: "Mute alerts during scheduled service visits",
    color: "#F59E0B",
  },
  {
    type: "Hotel Occupancy",
    icon: "🏨",
    description: "Auto-adjust climate for guest check-in/out",
    color: "#8B5CF6",
  },
  {
    type: "Store Hours",
    icon: "🕐",
    description: "Schedule closures, holidays, and special hours",
    color: "#10B981",
  },
];

export default function IntegrationRoadmap() {
  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      {/* ─── Customer-Facing Summary ─── */}
      <div
        style={{
          background: "linear-gradient(135deg, #065F46 0%, #047857 40%, #0D9488 100%)",
          borderRadius: 12,
          padding: "40px 36px",
          color: "white",
          marginBottom: 24,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -60,
            right: -60,
            width: 200,
            height: 200,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.06)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -40,
            right: 80,
            width: 120,
            height: 120,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.04)",
          }}
        />

        <div style={{ position: "relative", zIndex: 1 }}>
          <div
            style={{
              display: "inline-block",
              background: "rgba(255,255,255,0.15)",
              padding: "4px 12px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: 1,
              textTransform: "uppercase",
              marginBottom: 16,
            }}
          >
            Integration Roadmap
          </div>

          <h1
            style={{
              fontSize: 28,
              fontWeight: 700,
              margin: "0 0 12px",
              lineHeight: 1.2,
            }}
          >
            Your Systems. Our Intelligence.
            <br />
            Connected Automatically.
          </h1>

          <p
            style={{
              fontSize: 15,
              lineHeight: 1.7,
              opacity: 0.92,
              maxWidth: 700,
              margin: "0 0 24px",
            }}
          >
            Eagle Eyes integrates with your existing work order, hotel reservation,
            and scheduling systems — so equipment adjusts automatically without
            manual input. When a technician is dispatched, alerts mute. When a
            guest checks in, the room is already comfortable.
          </p>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {EVENT_TYPES.map((et) => (
              <div
                key={et.type}
                style={{
                  background: "rgba(255,255,255,0.12)",
                  backdropFilter: "blur(8px)",
                  borderRadius: 8,
                  padding: "12px 16px",
                  flex: "1 1 200px",
                  minWidth: 200,
                }}
              >
                <div style={{ fontSize: 20, marginBottom: 4 }}>{et.icon}</div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                  {et.type}
                </div>
                <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.5 }}>
                  {et.description}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── How It Works ─── */}
      <div
        style={{
          background: "#F9FAFB",
          border: "1px solid #E5E7EB",
          borderRadius: 10,
          padding: "24px 28px",
        }}
      >
        <h2
          style={{
            fontSize: 18,
            fontWeight: 700,
            margin: "0 0 16px",
            color: "#111827",
          }}
        >
          How Integration Works
        </h2>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 0,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {[
            { step: "1", label: "Your System", sub: "sends an event" },
            null,
            { step: "2", label: "Eagle Eyes API", sub: "validates & stores" },
            null,
            { step: "3", label: "Rules Engine", sub: "generates schedule" },
            null,
            { step: "4", label: "Building Intelligence", sub: "adjusts equipment" },
          ].map((item, i) =>
            item === null ? (
              <div
                key={`arrow-${i}`}
                style={{
                  fontSize: 20,
                  color: "#9CA3AF",
                  padding: "0 8px",
                }}
              >
                →
              </div>
            ) : (
              <div
                key={item.step}
                style={{
                  textAlign: "center",
                  padding: "12px 16px",
                  background: "white",
                  borderRadius: 8,
                  border: "1px solid #E5E7EB",
                  minWidth: 130,
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "#059669",
                    color: "white",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    fontWeight: 700,
                    marginBottom: 6,
                  }}
                >
                  {item.step}
                </div>
                <div
                  style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}
                >
                  {item.label}
                </div>
                <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>
                  {item.sub}
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
