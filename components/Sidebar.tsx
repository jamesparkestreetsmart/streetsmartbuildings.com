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

      {/* Org Dropdown */}
      {isAdmin && (
        <div className="px-3 pt-3 pb-1" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md border bg-gray-50 hover:bg-gray-100 text-sm"
          >
            <div className="flex items-center gap-2 truncate">
              <Building2 className="w-4 h-4 text-green-600 flex-shrink-0" />
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
            <div className="mt-1 border rounded-md bg-white shadow-lg max-h-60 overflow-y-auto z-50 relative">
              {/* Clear selection option for admins */}
              <button
                onClick={() => {
                  setSelectedOrgId(null);
                  setDropdownOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                  !selectedOrgId ? "bg-green-50 text-green-700 font-medium" : "text-gray-500"
                }`}
              >
                — Platform Admin View —
              </button>
              <div className="border-t" />
              {orgs.map((org) => (
                <button
                  key={org.org_id}
                  onClick={() => {
                    setSelectedOrgId(org.org_id);
                    setDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                    selectedOrgId === org.org_id
                      ? "bg-green-50 text-green-700 font-medium"
                      : "text-gray-700"
                  }`}
                >
                  <div className="font-medium">{org.org_name}</div>
                  <div className="text-xs text-gray-400">{org.org_identifier}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Nav Links */}
      <nav className="flex-1 mt-1">
        {links.map(({ href, label, icon, activeMatch }) => {
          const active = activeMatch
            ? activeMatch.some((path) => pathname.startsWith(path))
            : pathname.startsWith(href);

          const disabled = isAdmin && !hasOrgSelected;

          if (disabled) {
            return (
              <span
                key={href}
                className="block px-4 py-2 text-sm font-medium text-gray-300 cursor-not-allowed"
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
    </aside>
  );
}
