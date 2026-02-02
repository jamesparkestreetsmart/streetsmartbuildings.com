"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users } from "lucide-react";

const links = [
  { href: "/live", label: "Alerts (Live & History)", activeMatch: ["/live", "/history"] },
  { href: "/sites", label: "Sites" },
  { href: "/benchmark", label: "Equipment Benchmarking" },
  { href: "/journey", label: "My Journey" },
  { href: "/settings", label: "Settings", icon: <Users className="w-4 h-4 inline-block mr-2" /> },
];

export default function Sidebar() {
  const pathname = usePathname();

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
      </nav>
    </aside>
  );
}
