"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/live", label: "Live Alerts" },
  { href: "/history", label: "Alert History" },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-64 bg-white shadow-md border-r h-full flex flex-col">
      <div className="p-4 font-bold text-xl">Eagle Eyes</div>
      <nav className="flex-1">
        {links.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`block px-4 py-2 text-sm font-medium hover:bg-gray-100 ${
              pathname === href ? "bg-gray-200 text-black" : "text-gray-700"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  )
}
