"use client";

import { useEffect, useState, useCallback } from "react";

export interface StoreHoursComment {
  id: number;
  message: string;
  event_date: string;
  created_at: string;
  created_by: string;
}

export function useStoreHoursComments(siteId: string) {
  const [comments, setComments] = useState<StoreHoursComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Map of date -> comments for that date
  const commentsByDate = new Map<string, StoreHoursComment[]>();
  for (const c of comments) {
    const existing = commentsByDate.get(c.event_date) || [];
    existing.push(c);
    commentsByDate.set(c.event_date, existing);
  }

  const fetchComments = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/store-hours/comments?site_id=${siteId}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setComments(json.comments ?? []);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  const addComment = async (
    date: string,
    message: string,
    createdBy: string
  ) => {
    const res = await fetch("/api/store-hours/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        site_id: siteId,
        date,
        message,
        created_by: createdBy,
      }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.error || "Failed to add comment");
    }
    // Refresh comments after adding
    await fetchComments();
  };

  useEffect(() => {
    if (siteId) fetchComments();
  }, [siteId, fetchComments]);

  return {
    comments,
    commentsByDate,
    loading,
    error,
    refetch: fetchComments,
    addComment,
  };
}
