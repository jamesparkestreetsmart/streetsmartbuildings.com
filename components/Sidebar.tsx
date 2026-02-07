"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Shield } from "lucide-react";

const links = [
  { href: "/live", label: "Alerts (Live & History)", activeMatch: ["/live", "/history"] },
  { href: "/sites", label: "Sites" },
  { href: "/benchmark", label: "Equipment Benchmarking" },
  { href: "/journey", label: "My Journey" },
  { href: "/settings", label: "Settings", icon: <Users className="w-4 h-4 inline-block mr-2" /> },
];

export default function Sidebar({ userEmail }: { userEmail?: string | null }) {
  const pathname = usePathname();
  const isAdmin = userEmail?.endsWith("@streetsmartbuildings.com") ?? false;

  return (
    <aside className="w-64 bg-white shadow-md border-r h-full flex flex-col">
      <div className="p-4 font-bold text-xl bg-gradient-to-r from-green-600 to-yellow-400 text-white rounded-br-lg">
        Eagle Eyes
      </div>
      <nav className="flex-1">
        {links.map(({ href, label, icon, activeMatch }) => {
          const active = activeMatch
            ? activeMatch.some((path) => pathname.startsWith(path))
            : pathname.startsWith(href);
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