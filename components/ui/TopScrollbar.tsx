"use client";

import { useRef, useEffect, useState, useCallback, ReactNode } from "react";

interface Props {
  children: ReactNode;
  className?: string;
}

/**
 * Wraps a wide table (or any overflowing content) and adds a synced
 * horizontal scrollbar above it so users don't have to scroll to the
 * bottom first.
 */
export default function TopScrollbar({ children, className }: Props) {
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [innerWidth, setInnerWidth] = useState(0);
  const syncing = useRef(false);

  const measure = useCallback(() => {
    if (bottomRef.current) {
      setInnerWidth(bottomRef.current.scrollWidth);
    }
  }, []);

  useEffect(() => {
    measure();
    const obs = new ResizeObserver(measure);
    if (bottomRef.current) obs.observe(bottomRef.current);
    return () => obs.disconnect();
  }, [measure]);

  const syncScroll = (source: "top" | "bottom") => {
    if (syncing.current) return;
    syncing.current = true;
    if (source === "top" && topRef.current && bottomRef.current) {
      bottomRef.current.scrollLeft = topRef.current.scrollLeft;
    } else if (source === "bottom" && topRef.current && bottomRef.current) {
      topRef.current.scrollLeft = bottomRef.current.scrollLeft;
    }
    syncing.current = false;
  };

  return (
    <div className={className}>
      {/* Top scrollbar — only visible when content overflows */}
      {innerWidth > 0 && (
        <div
          ref={topRef}
          onScroll={() => syncScroll("top")}
          className="overflow-x-auto overflow-y-hidden"
          style={{ height: 12 }}
        >
          <div style={{ width: innerWidth, height: 1 }} />
        </div>
      )}
      {/* Actual scrollable content */}
      <div
        ref={bottomRef}
        onScroll={() => syncScroll("bottom")}
        className="overflow-x-auto"
      >
        {children}
      </div>
    </div>
  );
}
