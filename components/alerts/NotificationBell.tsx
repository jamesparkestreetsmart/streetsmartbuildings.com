"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface Notification {
  id: number;
  title: string;
  message: string;
  severity: string;
  status: string;
  notification_type: string;
  instance_id: number | null;
  created_at: string;
}

export default function NotificationBell({ orgId }: { orgId: string }) {
  const [count, setCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch(`/api/alerts/count?org_id=${orgId}`);
      const data = await res.json();
      setCount(data.count || 0);
    } catch {}
  }, [orgId]);

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, [fetchCount]);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/alerts/notifications?org_id=${orgId}&limit=15`);
      const data = await res.json();
      setNotifications(data.notifications || []);
    } catch {} finally {
      setLoading(false);
    }
  };

  const toggleDropdown = () => {
    if (!open) fetchNotifications();
    setOpen(!open);
  };

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const markRead = async (id: number) => {
    await fetch("/api/alerts/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "read" }),
    });
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setCount((prev) => Math.max(0, prev - 1));
  };

  const acknowledgeInstance = async (notif: Notification) => {
    // Mark notification as read
    await markRead(notif.id);

    // Also acknowledge the instance if there is one
    if (notif.instance_id) {
      await fetch("/api/alerts/instances", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: notif.instance_id, action: "acknowledge" }),
      });
    }
  };

  const dismiss = async (id: number) => {
    await fetch("/api/alerts/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "dismiss" }),
    });
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setCount((prev) => Math.max(0, prev - 1));
  };

  const severityColor = (s: string) => {
    if (s === "critical") return "bg-red-500";
    if (s === "warning") return "bg-amber-500";
    return "bg-blue-500";
  };

  const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return "just now";
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={toggleDropdown}
        className="relative p-2 text-gray-600 hover:text-gray-900 transition-colors"
        aria-label="Notifications"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-0.5">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-full ml-2 bottom-0 w-96 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <span className="font-semibold text-gray-900 text-sm">Notifications</span>
            <span className="text-xs text-gray-500">{count} unread</span>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400">No notifications</div>
            ) : (
              notifications.map((notif) => (
                <div key={notif.id} className="px-4 py-3 border-b border-gray-100 hover:bg-gray-50">
                  <div className="flex items-start gap-2">
                    <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${severityColor(notif.severity)}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900">{notif.title}</div>
                      <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notif.message}</div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-xs text-gray-400">{timeAgo(notif.created_at)}</span>
                        {notif.notification_type === "repeat" && (
                          <span className="text-xs text-amber-500 font-medium">Repeat</span>
                        )}
                        {notif.notification_type === "resolved" && (
                          <span className="text-xs text-green-500 font-medium">Resolved</span>
                        )}
                        {notif.instance_id && notif.notification_type !== "resolved" && (
                          <button
                            onClick={() => acknowledgeInstance(notif)}
                            className="text-xs text-indigo-600 hover:text-indigo-800"
                          >
                            Acknowledge
                          </button>
                        )}
                        <button
                          onClick={() => dismiss(notif.id)}
                          className="text-xs text-gray-400 hover:text-gray-600"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="px-4 py-2 bg-gray-50 border-t border-gray-200">
            <a href="/live" className="text-xs text-indigo-600 hover:text-indigo-800">
              View all alerts →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
