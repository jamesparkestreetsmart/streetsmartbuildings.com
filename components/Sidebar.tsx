"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Shield, ChevronDown, Building2 } from "lucide-react";
import { useOrg } from "@/context/OrgContext";
import { useState, useRef, useEffect } from "react";

const links = [
  { href: "/live", label: "Alerts (Live & History)", activeMatch: ["/live", "/history"] },
  { href: "/sites", label: "Sites" },
  { href: "/benchmark", label: "Equipment Benchmarking" },
  { href: "/journey", label: "My Journey" },
  { href: "/settings", label: "Settings", icon: <Users className="w-4 h-4 inline-block mr-2" /> },
];

export default function Sidebar({ userEmail }: { userEmail?: string | null }) {
  const pathname = usePathname();
  const { orgs, selectedOrg, selectedOrgId, setSelectedOrgId, isAdmin, loading } = useOrg();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const hasOrgSelected = !!selectedOrgId;

  // Sort orgs: SSB Internal first, then alphabetical
  const sortedOrgs = [...orgs].sort((a, b) => {
    const aIsSSB = a.org_identifier === "SSB1";
    const bIsSSB = b.org_identifier === "SSB1";
    if (aIsSSB && !bIsSSB) return -1;
    if (!aIsSSB && bIsSSB) return 1;
    return a.org_name.localeCompare(b.org_name);
  });

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <aside className="w-64 bg-white shadow-md border-r h-full flex flex-col">
      {/* Logo */}
      <div className="p-4 font-bold text-xl bg-gradient-to-r from-green-600 to-yellow-400 text-white rounded-br-lg">
        Eagle Eyes
      </div>

      {/* Nav Links */}
      <nav className="flex-1 mt-1">
        {links.map(({ href, label, icon, activeMatch }) => {
          const active = activeMatch
            ? activeMatch.some((path) => pathname.startsWith(path))
            : pathname.startsWith(href);

          // Sites is always available for admins; others need org selected
          const alwaysEnabled = isAdmin && href === "/sites";
          const disabled = !hasOrgSelected && !alwaysEnabled;

          if (disabled) {
            return (
              <span
                key={href}
                className="block px-4 py-2 text-sm font-medium text-gray-300 cursor-not-allowed select-none"
                title="Select an organization first"
              >
                {icon} {label}
              </span>
            );
          }

          return (
            <Link
              key={href}
              href={href}
              className={`block px-4 py-2 text-sm font-medium hover:bg-gray-100 ${
                active ? "bg-gray-200 text-black" : "text-gray-700"
              }`}
            >
              {icon} {label}
            </Link>
          );
        })}

        {isAdmin && (
          <>
            <div className="border-t my-2 mx-4" />
            <Link
              href="/admin"
              className={`block px-4 py-2 text-sm font-medium hover:bg-gray-100 ${
                pathname.startsWith("/admin") ? "bg-gray-200 text-black" : "text-gray-700"
              }`}
            >
              <Shield className="w-4 h-4 inline-block mr-2" />
              Admin
            </Link>
          </>
        )}
      </nav>

      {/* Org Dropdown — below nav */}
      {isAdmin && (
        <div className="px-3 pb-3 pt-1 border-t" ref={dropdownRef}>
          <label className="block text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1 px-1">
            Organization
          </label>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md border text-sm transition-colors ${
              selectedOrg
                ? "bg-green-50 border-green-200 hover:bg-green-100"
                : "bg-gray-50 border-gray-200 hover:bg-gray-100"
            }`}
          >
            <div className="flex items-center gap-2 truncate">
              <Building2 className={`w-4 h-4 flex-shrink-0 ${selectedOrg ? "text-green-600" : "text-gray-400"}`} />
              <span className="truncate font-medium">
                {loading
                  ? "Loading…"
                  : selectedOrg
                  ? selectedOrg.org_name
                  : "Select Organization"}
              </span>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-gray-400 transition-transform ${
                dropdownOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {dropdownOpen && (
            <div className="mt-1 border rounded-md bg-white shadow-lg max-h-60 overflow-y-auto z-50 absolute left-3 right-3 bottom-16">
              {/* Platform Admin View option */}
              <button
                onClick={() => {
                  setSelectedOrgId(null);
                  setDropdownOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                  !selectedOrgId ? "bg-green-50 text-green-700 font-semibold" : "text-gray-500"
                }`}
              >
                — Platform Admin View —
              </button>
              <div className="border-t" />

              {sortedOrgs.map((org) => {
                const isSSB = org.org_identifier === "SSB1";
                const isSelected = selectedOrgId === org.org_id;

                return (
                  <button
                    key={org.org_id}
                    onClick={() => {
                      setSelectedOrgId(org.org_id);
                      setDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                      isSelected
                        ? "bg-green-50 text-green-700 font-semibold"
                        : isSSB
                        ? "bg-gradient-to-r from-green-50 to-yellow-50 hover:from-green-100 hover:to-yellow-100 text-green-800"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isSSB && <span className="text-yellow-500 text-xs">★</span>}
                      <div>
                        <div className={`font-medium ${isSSB && !isSelected ? "text-green-700" : ""}`}>
                          {org.org_name}
                        </div>
                        <div className={`text-xs ${isSSB ? "text-green-500" : "text-gray-400"}`}>
                          {org.org_identifier}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
