"use client";

import { Fragment, useEffect, useState, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = "issues" | "work_items" | "learnings";

interface PlatformIssue {
  issue_id: string;
  title: string;
  issue_type: string;
  severity: string;
  status: string;
  source: string;
  reported_by: string | null;
  owner: string | null;
  target_sprint: string | null;
  description: string | null;
  latest_note: string | null;
  lessons_learned: string | null;
  linked_work_item_id: string | null;
  created_at: string;
  updated_at: string;
}

interface WorkItem {
  work_item_id: string;
  title: string;
  work_type: string;
  status: string;
  priority: string;
  area: string | null;
  sprint_label: string | null;
  quarter_label: string | null;
  owner: string | null;
  requested_by: string | null;
  related_issue_id: string | null;
  acceptance_criteria: string | null;
  description: string | null;
  latest_note: string | null;
  lessons_learned: string | null;
  target_date: string | null;
  created_at: string;
  updated_at: string;
}

interface Learning {
  learning_id: string;
  title: string;
  category: string;
  summary: string;
  related_issue_id: string | null;
  related_work_item_id: string | null;
  created_at: string;
  updated_at: string;
}

interface Comment {
  comment_id: string;
  issue_id: string | null;
  work_item_id: string | null;
  learning_id: string | null;
  author_user_id: string;
  author_name: string;
  comment_text: string;
  created_at: string;
}

type AnyItem = PlatformIssue | WorkItem | Learning;

function getItemId(item: AnyItem): string {
  if ("issue_id" in item) return item.issue_id;
  if ("work_item_id" in item) return item.work_item_id;
  return item.learning_id;
}

function getIdFieldName(tab: Tab): string {
  if (tab === "issues") return "issue_id";
  if (tab === "work_items") return "work_item_id";
  return "learning_id";
}

interface Props {
  userEmail: string;
  userId: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TABS: { key: Tab; label: string }[] = [
  { key: "issues", label: "Platform Issues" },
  { key: "work_items", label: "Work Items" },
  { key: "learnings", label: "Learnings" },
];

const ISSUE_STATUSES = ["open", "investigating", "planned", "in_progress", "blocked", "resolved", "closed"];
const ISSUE_SEVERITIES = ["low", "medium", "high", "critical"];
const ISSUE_TYPES = ["bug", "ux", "data", "permissions", "performance", "ops", "other"];
const ISSUE_SOURCES = ["records_log", "manual", "feedback", "testing"];

const WORK_STATUSES = ["backlog", "planned", "in_progress", "blocked", "done", "deferred"];
const WORK_PRIORITIES = ["low", "medium", "high", "critical"];
const WORK_TYPES = ["feature", "task", "roadmap", "design_feedback", "tech_debt", "research"];
const WORK_AREAS = ["dashboard", "alerts", "sites", "journey", "hvac", "users", "settings", "admin", "devops", "auth", "billing"];

const LEARNING_CATEGORIES = ["backend", "frontend", "devops", "architecture", "process", "security", "database", "ux", "integrations"];

const ISSUE_DEFAULT_STATUSES = ["open", "investigating", "planned", "in_progress", "blocked"];
const WORK_DEFAULT_STATUSES = ["backlog", "planned", "in_progress"];

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-800",
  investigating: "bg-purple-100 text-purple-800",
  in_progress: "bg-purple-100 text-purple-800",
  planned: "bg-blue-100 text-blue-700",
  blocked: "bg-red-100 text-red-800",
  resolved: "bg-green-100 text-green-800",
  done: "bg-green-100 text-green-800",
  closed: "bg-gray-100 text-gray-600",
  deferred: "bg-gray-100 text-gray-600",
  backlog: "bg-gray-100 text-gray-700",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-gray-100 text-gray-600",
};

const WORK_TYPE_COLORS: Record<string, string> = {
  feature: "bg-blue-100 text-blue-800",
  task: "bg-gray-100 text-gray-700",
  roadmap: "bg-indigo-100 text-indigo-800",
  design_feedback: "bg-pink-100 text-pink-800",
  tech_debt: "bg-amber-100 text-amber-800",
  research: "bg-cyan-100 text-cyan-800",
};

const CATEGORY_COLORS = [
  "bg-blue-100 text-blue-800",
  "bg-green-100 text-green-800",
  "bg-purple-100 text-purple-800",
  "bg-orange-100 text-orange-800",
  "bg-pink-100 text-pink-800",
  "bg-cyan-100 text-cyan-800",
  "bg-indigo-100 text-indigo-800",
  "bg-amber-100 text-amber-800",
  "bg-red-100 text-red-700",
];

function categoryColor(cat: string): string {
  if (!cat) return CATEGORY_COLORS[0];
  const idx = LEARNING_CATEGORIES.indexOf(cat);
  return CATEGORY_COLORS[idx >= 0 ? idx : Math.abs(hashCode(cat)) % CATEGORY_COLORS.length];
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

function Badge({ label, colorMap, value }: { label?: string; colorMap?: Record<string, string>; value: string }) {
  const cls = colorMap?.[value] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap ${cls}`}>
      {label ?? value.replace(/_/g, " ")}
    </span>
  );
}

function formatDate(d: string | null): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTimestamp(d: string | null): string {
  if (!d) return "-";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function truncate(s: string | null, n: number): string {
  if (!s) return "-";
  return s.length > n ? s.slice(0, n) + "..." : s;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function InternalTrackingPanel({ userEmail, userId }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("issues");
  const [items, setItems] = useState<AnyItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters — "__default__" = initial load (apply default active statuses), "" = user chose "All"
  const [filterStatus, setFilterStatus] = useState<string>("__default__");
  const [filterSeverity, setFilterSeverity] = useState<string>("");
  const [filterIssueType, setFilterIssueType] = useState<string>("");
  const [filterWorkType, setFilterWorkType] = useState<string>("");
  const [filterArea, setFilterArea] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("");

  // Expanded row + comments
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newCommentText, setNewCommentText] = useState("");
  const [addingComment, setAddingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState("");
  const [savingComment, setSavingComment] = useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalItem, setModalItem] = useState<Record<string, any> | null>(null);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Related item dropdowns
  const [allIssues, setAllIssues] = useState<{ id: string; title: string }[]>([]);
  const [allWorkItems, setAllWorkItems] = useState<{ id: string; title: string }[]>([]);

  // ---------------------------------------------------------------------------
  // Fetch data
  // ---------------------------------------------------------------------------

  const fetchItems = useCallback(async (tab: Tab, filters: Record<string, string>) => {
    setLoading(true);
    try {
      const base =
        tab === "issues"
          ? "/api/admin/platform-issues"
          : tab === "work_items"
            ? "/api/admin/work-items"
            : "/api/admin/learnings";

      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => {
        if (v && k !== "_default") params.set(k, v);
      });

      const res = await fetch(`${base}?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();

      // Client-side default filter — only on initial load ("__default__")
      if (tab === "issues" && filters._default) {
        setItems(data.filter((i: PlatformIssue) => ISSUE_DEFAULT_STATUSES.includes(i.status)));
      } else if (tab === "work_items" && filters._default) {
        setItems(data.filter((i: WorkItem) => WORK_DEFAULT_STATUSES.includes(i.status)));
      } else {
        setItems(data);
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchComments = useCallback(async (itemId: string, tab: Tab) => {
    setCommentsLoading(true);
    try {
      const paramKey =
        tab === "issues" ? "issue_id" : tab === "work_items" ? "work_item_id" : "learning_id";
      const res = await fetch(`/api/admin/comments?${paramKey}=${itemId}`);
      if (!res.ok) throw new Error("Failed to fetch comments");
      const data: Comment[] = await res.json();
      // oldest first
      setComments(data.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
    } catch {
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  }, []);

  const fetchRelatedDropdowns = useCallback(async () => {
    try {
      const [issuesRes, workRes] = await Promise.all([
        fetch("/api/admin/platform-issues"),
        fetch("/api/admin/work-items"),
      ]);
      if (issuesRes.ok) {
        const data = await issuesRes.json();
        setAllIssues(data.map((i: any) => ({ id: i.issue_id, title: i.title })));
      }
      if (workRes.ok) {
        const data = await workRes.json();
        setAllWorkItems(data.map((i: any) => ({ id: i.work_item_id, title: i.title })));
      }
    } catch {
      // ignore
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  useEffect(() => {
    setExpandedRowId(null);
    setComments([]);
    setNewCommentText("");
    const filters = buildFilters(activeTab);
    fetchItems(activeTab, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Refetch when filter values change
  useEffect(() => {
    const filters = buildFilters(activeTab);
    fetchItems(activeTab, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, filterSeverity, filterIssueType, filterWorkType, filterArea, filterCategory]);

  // Load comments when a row is expanded
  useEffect(() => {
    if (expandedRowId) {
      fetchComments(expandedRowId, activeTab);
    }
  }, [expandedRowId, activeTab, fetchComments]);

  function buildFilters(tab: Tab): Record<string, string> {
    const isDefault = filterStatus === "__default__";
    const statusVal = isDefault ? "" : filterStatus; // "" = no server filter, specific value = server filter
    if (tab === "issues") {
      return {
        ...(isDefault ? { _default: "1" } : {}),
        ...(statusVal ? { status: statusVal } : {}),
        ...(filterSeverity ? { severity: filterSeverity } : {}),
        ...(filterIssueType ? { issue_type: filterIssueType } : {}),
      };
    }
    if (tab === "work_items") {
      return {
        ...(isDefault ? { _default: "1" } : {}),
        ...(statusVal ? { status: statusVal } : {}),
        ...(filterWorkType ? { work_type: filterWorkType } : {}),
        ...(filterArea ? { area: filterArea } : {}),
      };
    }
    return {
      ...(filterCategory ? { category: filterCategory } : {}),
    };
  }

  // ---------------------------------------------------------------------------
  // Tab change
  // ---------------------------------------------------------------------------

  function handleTabChange(tab: Tab) {
    setItems([]); // clear stale data before switching tab to prevent type mismatch renders
    setActiveTab(tab);
    setFilterStatus("__default__");
    setFilterSeverity("");
    setFilterIssueType("");
    setFilterWorkType("");
    setFilterArea("");
    setFilterCategory("");
  }

  // ---------------------------------------------------------------------------
  // Row expand
  // ---------------------------------------------------------------------------

  function toggleRow(id: string) {
    if (expandedRowId === id) {
      setExpandedRowId(null);
      setComments([]);
      setNewCommentText("");
      setEditingCommentId(null);
    } else {
      setExpandedRowId(id);
      setNewCommentText("");
      setEditingCommentId(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Comments CRUD
  // ---------------------------------------------------------------------------

  async function handleAddComment() {
    if (!newCommentText.trim() || !expandedRowId) return;
    setAddingComment(true);
    try {
      const paramKey =
        activeTab === "issues" ? "issue_id" : activeTab === "work_items" ? "work_item_id" : "learning_id";
      const res = await fetch("/api/admin/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [paramKey]: expandedRowId,
          author_name: userEmail.split("@")[0],
          comment_text: newCommentText.trim(),
        }),
      });
      if (res.ok) {
        setNewCommentText("");
        fetchComments(expandedRowId, activeTab);
      }
    } finally {
      setAddingComment(false);
    }
  }

  async function handleSaveCommentEdit(commentId: string) {
    if (!editingCommentText.trim()) return;
    setSavingComment(true);
    try {
      const res = await fetch(`/api/admin/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment_text: editingCommentText.trim() }),
      });
      if (res.ok && expandedRowId) {
        setEditingCommentId(null);
        setEditingCommentText("");
        fetchComments(expandedRowId, activeTab);
      }
    } finally {
      setSavingComment(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Modal open/close
  // ---------------------------------------------------------------------------

  function openAddModal() {
    setModalItem({});
    setModalError(null);
    setModalOpen(true);
    fetchRelatedDropdowns();
  }

  function openEditModal(item: AnyItem) {
    setModalItem({ ...item });
    setModalError(null);
    setModalOpen(true);
    fetchRelatedDropdowns();
  }

  function closeModal() {
    setModalOpen(false);
    setModalItem(null);
  }

  // ---------------------------------------------------------------------------
  // Modal save
  // ---------------------------------------------------------------------------

  async function handleModalSave() {
    if (!modalItem) return;
    setModalSaving(true);

    const idField = getIdFieldName(activeTab);
    const itemId = modalItem[idField];
    const isEdit = !!itemId;
    const base =
      activeTab === "issues"
        ? "/api/admin/platform-issues"
        : activeTab === "work_items"
          ? "/api/admin/work-items"
          : "/api/admin/learnings";

    const url = isEdit ? `${base}/${itemId}` : base;
    const method = isEdit ? "PATCH" : "POST";

    // Strip pk, timestamps, and org_id from the payload
    const { issue_id, work_item_id, learning_id, created_at, updated_at, org_id, opened_at, resolved_at, completed_at, ...rawPayload } = modalItem;

    // Convert empty strings to null so Postgres doesn't choke on e.g. uuid fields
    // For new items, omit null values entirely so DB defaults apply
    const payload: Record<string, any> = {};
    for (const [k, v] of Object.entries(rawPayload)) {
      const val = v === "" ? null : v;
      if (!isEdit && val === null) continue; // omit so DB default kicks in
      payload[k] = val;
    }

    console.log("[TrackingPanel] Save →", { method, url, payload, rawModalItem: modalItem, isEdit });

    try {
      setModalError(null);
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const resBody = await res.json().catch(() => ({}));
      console.log("[TrackingPanel] Response →", { status: res.status, ok: res.ok, body: resBody });
      if (res.ok) {
        closeModal();
        const filters = buildFilters(activeTab);
        fetchItems(activeTab, filters);
      } else {
        const msg = resBody.error || resBody.message || `Save failed (${res.status})`;
        setModalError(msg);
        console.error("[InternalTrackingPanel] Save error:", res.status, resBody);
      }
    } catch (err: any) {
      setModalError(err.message || "Network error");
      console.error("[InternalTrackingPanel] Save exception:", err);
    } finally {
      setModalSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render helpers: Filter bar
  // ---------------------------------------------------------------------------

  function renderFilterBar() {
    return (
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-gray-50 border-b">
        {activeTab === "issues" && (
          <>
            <StatusFilterSelect
              value={filterStatus}
              onChange={setFilterStatus}
              options={ISSUE_STATUSES}
            />
            <FilterSelect
              label="Severity"
              value={filterSeverity}
              onChange={setFilterSeverity}
              options={ISSUE_SEVERITIES}
            />
            <FilterSelect
              label="Type"
              value={filterIssueType}
              onChange={setFilterIssueType}
              options={ISSUE_TYPES}
            />
          </>
        )}
        {activeTab === "work_items" && (
          <>
            <StatusFilterSelect
              value={filterStatus}
              onChange={setFilterStatus}
              options={WORK_STATUSES}
            />
            <FilterSelect
              label="Work Type"
              value={filterWorkType}
              onChange={setFilterWorkType}
              options={WORK_TYPES}
            />
            <FilterSelect
              label="Area"
              value={filterArea}
              onChange={setFilterArea}
              options={WORK_AREAS}
            />
          </>
        )}
        {activeTab === "learnings" && (
          <FilterSelect
            label="Category"
            value={filterCategory}
            onChange={setFilterCategory}
            options={LEARNING_CATEGORIES}
          />
        )}
        <div className="ml-auto">
          <button
            onClick={openAddModal}
            className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            + Add
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render helpers: Tables
  // ---------------------------------------------------------------------------

  function renderIssuesTable() {
    const data = items as PlatformIssue[];
    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2">Severity</th>
            <th className="px-4 py-2">Title</th>
            <th className="px-4 py-2">Type</th>
            <th className="px-4 py-2">Owner</th>
            <th className="px-4 py-2">Target Sprint</th>
            <th className="px-4 py-2">Updated</th>
            <th className="px-4 py-2 w-10"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.map((item) => (
            <Fragment key={item.issue_id}>
              <tr
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => toggleRow(item.issue_id)}
              >
                <td className="px-4 py-2"><Badge value={item.status} colorMap={STATUS_COLORS} /></td>
                <td className="px-4 py-2"><Badge value={item.severity} colorMap={SEVERITY_COLORS} /></td>
                <td className="px-4 py-2 font-medium text-gray-900 max-w-xs truncate">{item.title}</td>
                <td className="px-4 py-2 text-gray-600">{item.issue_type?.replace(/_/g, " ")}</td>
                <td className="px-4 py-2 text-gray-600">{item.owner ?? "-"}</td>
                <td className="px-4 py-2 text-gray-600">{item.target_sprint ?? "-"}</td>
                <td className="px-4 py-2 text-gray-500 text-xs">{formatDate(item.updated_at)}</td>
                <td className="px-4 py-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); openEditModal(item); }}
                    className="text-gray-400 hover:text-blue-600"
                    title="Edit"
                  >
                    <PencilIcon />
                  </button>
                </td>
              </tr>
              {expandedRowId === item.issue_id && (
                <tr>
                  <td colSpan={8} className="px-4 py-3 bg-gray-50">
                    {renderCommentsSection()}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    );
  }

  function renderWorkItemsTable() {
    const data = items as WorkItem[];
    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2">Priority</th>
            <th className="px-4 py-2">Title</th>
            <th className="px-4 py-2">Work Type</th>
            <th className="px-4 py-2">Area</th>
            <th className="px-4 py-2">Sprint</th>
            <th className="px-4 py-2">Quarter</th>
            <th className="px-4 py-2">Owner</th>
            <th className="px-4 py-2">Related Issue</th>
            <th className="px-4 py-2">Updated</th>
            <th className="px-4 py-2 w-10"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.map((item) => (
            <Fragment key={item.work_item_id}>
              <tr
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => toggleRow(item.work_item_id)}
              >
                <td className="px-4 py-2"><Badge value={item.status} colorMap={STATUS_COLORS} /></td>
                <td className="px-4 py-2"><Badge value={item.priority} colorMap={SEVERITY_COLORS} /></td>
                <td className="px-4 py-2 font-medium text-gray-900 max-w-xs truncate">{item.title}</td>
                <td className="px-4 py-2"><Badge value={item.work_type} colorMap={WORK_TYPE_COLORS} /></td>
                <td className="px-4 py-2 text-gray-600">{item.area ?? "-"}</td>
                <td className="px-4 py-2 text-gray-600">{item.sprint_label ?? "-"}</td>
                <td className="px-4 py-2 text-gray-600">{item.quarter_label ?? "-"}</td>
                <td className="px-4 py-2 text-gray-600">{item.owner ?? "-"}</td>
                <td className="px-4 py-2 text-gray-500 text-xs">
                  {item.related_issue_id
                    ? truncate(allIssues.find((i) => i.id === item.related_issue_id)?.title ?? item.related_issue_id, 30)
                    : "-"}
                </td>
                <td className="px-4 py-2 text-gray-500 text-xs">{formatDate(item.updated_at)}</td>
                <td className="px-4 py-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); openEditModal(item); }}
                    className="text-gray-400 hover:text-blue-600"
                    title="Edit"
                  >
                    <PencilIcon />
                  </button>
                </td>
              </tr>
              {expandedRowId === item.work_item_id && (
                <tr>
                  <td colSpan={11} className="px-4 py-3 bg-gray-50">
                    {renderCommentsSection()}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    );
  }

  function renderLearningsTable() {
    const data = items as Learning[];
    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            <th className="px-4 py-2">Category</th>
            <th className="px-4 py-2">Title</th>
            <th className="px-4 py-2">Summary</th>
            <th className="px-4 py-2">Related Issue</th>
            <th className="px-4 py-2">Related Work Item</th>
            <th className="px-4 py-2">Created</th>
            <th className="px-4 py-2 w-10"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.map((item) => (
            <Fragment key={item.learning_id}>
              <tr
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => toggleRow(item.learning_id)}
              >
                <td className="px-4 py-2">
                  <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${categoryColor(item.category)}`}>
                    {item.category}
                  </span>
                </td>
                <td className="px-4 py-2 font-medium text-gray-900 max-w-xs truncate">{item.title}</td>
                <td className="px-4 py-2 text-gray-600 max-w-sm truncate">{truncate(item.summary, 80)}</td>
                <td className="px-4 py-2 text-gray-500 text-xs">
                  {item.related_issue_id
                    ? truncate(allIssues.find((i) => i.id === item.related_issue_id)?.title ?? item.related_issue_id, 30)
                    : "-"}
                </td>
                <td className="px-4 py-2 text-gray-500 text-xs">
                  {item.related_work_item_id
                    ? truncate(allWorkItems.find((w) => w.id === item.related_work_item_id)?.title ?? item.related_work_item_id, 30)
                    : "-"}
                </td>
                <td className="px-4 py-2 text-gray-500 text-xs">{formatDate(item.created_at)}</td>
                <td className="px-4 py-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); openEditModal(item); }}
                    className="text-gray-400 hover:text-blue-600"
                    title="Edit"
                  >
                    <PencilIcon />
                  </button>
                </td>
              </tr>
              {expandedRowId === item.learning_id && (
                <tr>
                  <td colSpan={7} className="px-4 py-3 bg-gray-50">
                    {renderCommentsSection()}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    );
  }

  // ---------------------------------------------------------------------------
  // Render helpers: Comments
  // ---------------------------------------------------------------------------

  function renderCommentsSection() {
    return (
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Comments</h4>
        {commentsLoading ? (
          <p className="text-sm text-gray-400">Loading comments...</p>
        ) : comments.length === 0 ? (
          <p className="text-sm text-gray-400">No comments yet.</p>
        ) : (
          <div className="space-y-2">
            {comments.map((c) => (
              <div key={c.comment_id} className="bg-white rounded border px-3 py-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-700">{c.author_name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{formatTimestamp(c.created_at)}</span>
                    {c.author_user_id === userId && editingCommentId !== c.comment_id && (
                      <button
                        onClick={() => { setEditingCommentId(c.comment_id); setEditingCommentText(c.comment_text); }}
                        className="text-gray-400 hover:text-blue-600"
                        title="Edit comment"
                      >
                        <PencilIcon size={14} />
                      </button>
                    )}
                  </div>
                </div>
                {editingCommentId === c.comment_id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editingCommentText}
                      onChange={(e) => setEditingCommentText(e.target.value)}
                      className="w-full border rounded px-2 py-1 text-sm"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSaveCommentEdit(c.comment_id)}
                        disabled={savingComment}
                        className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        {savingComment ? "Saving..." : "Save"}
                      </button>
                      <button
                        onClick={() => { setEditingCommentId(null); setEditingCommentText(""); }}
                        className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{c.comment_text}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add comment */}
        <div className="flex gap-2 pt-1">
          <textarea
            value={newCommentText}
            onChange={(e) => setNewCommentText(e.target.value)}
            placeholder="Add a comment..."
            className="flex-1 border rounded px-2 py-1 text-sm"
            rows={2}
          />
          <button
            onClick={handleAddComment}
            disabled={addingComment || !newCommentText.trim()}
            className="self-end px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {addingComment ? "Adding..." : "Add Comment"}
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render helpers: Modal
  // ---------------------------------------------------------------------------

  function renderModal() {
    if (!modalOpen || !modalItem) return null;
    const isEdit = !!modalItem[getIdFieldName(activeTab)];
    const title = isEdit ? "Edit Item" : "Add Item";

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
          </div>
          <div className="px-6 py-4 space-y-4">
            {activeTab === "issues" && renderIssueFields()}
            {activeTab === "work_items" && renderWorkItemFields()}
            {activeTab === "learnings" && renderLearningFields()}
          </div>
          {modalError && (
            <div className="mx-6 mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {modalError}
            </div>
          )}
          <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
            <button
              onClick={closeModal}
              className="px-4 py-2 text-sm text-gray-700 bg-white border rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleModalSave}
              disabled={modalSaving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {modalSaving ? "Saving..." : (modalItem && modalItem[getIdFieldName(activeTab)]) ? "Update" : "Create"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  function setField(key: string, value: any) {
    setModalItem((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function renderIssueFields() {
    return (
      <>
        <FieldInput label="Title *" value={modalItem?.title ?? ""} onChange={(v) => setField("title", v)} />
        <div className="grid grid-cols-2 gap-4">
          <FieldSelect label="Type" value={modalItem?.issue_type ?? ""} onChange={(v) => setField("issue_type", v)} options={ISSUE_TYPES} />
          <FieldSelect label="Severity" value={modalItem?.severity ?? ""} onChange={(v) => setField("severity", v)} options={ISSUE_SEVERITIES} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FieldSelect label="Status" value={modalItem?.status ?? "open"} onChange={(v) => setField("status", v)} options={ISSUE_STATUSES} placeholder={false} />
          <FieldSelect label="Source" value={modalItem?.source ?? ""} onChange={(v) => setField("source", v)} options={ISSUE_SOURCES} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FieldInput label="Reported By" value={modalItem?.reported_by ?? ""} onChange={(v) => setField("reported_by", v)} />
          <FieldInput label="Owner" value={modalItem?.owner ?? ""} onChange={(v) => setField("owner", v)} />
        </div>
        <FieldInput label="Target Sprint" value={modalItem?.target_sprint ?? ""} onChange={(v) => setField("target_sprint", v)} />
        <FieldTextarea label="Description" value={modalItem?.description ?? ""} onChange={(v) => setField("description", v)} />
        <FieldTextarea label="Latest Note" value={modalItem?.latest_note ?? ""} onChange={(v) => setField("latest_note", v)} />
        <FieldTextarea label="Lessons Learned" value={modalItem?.lessons_learned ?? ""} onChange={(v) => setField("lessons_learned", v)} />
        <FieldRelatedSelect
          label="Linked Work Item"
          value={modalItem?.linked_work_item_id ?? ""}
          onChange={(v) => setField("linked_work_item_id", v || null)}
          options={allWorkItems}
        />
      </>
    );
  }

  function renderWorkItemFields() {
    return (
      <>
        <FieldInput label="Title *" value={modalItem?.title ?? ""} onChange={(v) => setField("title", v)} />
        <div className="grid grid-cols-2 gap-4">
          <FieldSelect label="Work Type *" value={modalItem?.work_type ?? ""} onChange={(v) => setField("work_type", v)} options={WORK_TYPES} />
          <FieldSelect label="Status" value={modalItem?.status ?? "backlog"} onChange={(v) => setField("status", v)} options={WORK_STATUSES} placeholder={false} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FieldSelect label="Priority" value={modalItem?.priority ?? ""} onChange={(v) => setField("priority", v)} options={WORK_PRIORITIES} />
          <FieldSelect label="Area" value={modalItem?.area ?? ""} onChange={(v) => setField("area", v)} options={WORK_AREAS} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FieldInput label="Sprint Label" value={modalItem?.sprint_label ?? ""} onChange={(v) => setField("sprint_label", v)} />
          <FieldInput label="Quarter Label" value={modalItem?.quarter_label ?? ""} onChange={(v) => setField("quarter_label", v)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FieldInput label="Owner" value={modalItem?.owner ?? ""} onChange={(v) => setField("owner", v)} />
          <FieldInput label="Requested By" value={modalItem?.requested_by ?? ""} onChange={(v) => setField("requested_by", v)} />
        </div>
        <FieldRelatedSelect
          label="Related Issue"
          value={modalItem?.related_issue_id ?? ""}
          onChange={(v) => setField("related_issue_id", v || null)}
          options={allIssues}
        />
        <FieldTextarea label="Acceptance Criteria" value={modalItem?.acceptance_criteria ?? ""} onChange={(v) => setField("acceptance_criteria", v)} />
        <FieldTextarea label="Description" value={modalItem?.description ?? ""} onChange={(v) => setField("description", v)} />
        <FieldTextarea label="Latest Note" value={modalItem?.latest_note ?? ""} onChange={(v) => setField("latest_note", v)} />
        <FieldTextarea label="Lessons Learned" value={modalItem?.lessons_learned ?? ""} onChange={(v) => setField("lessons_learned", v)} />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Target Date</label>
          <input
            type="date"
            value={modalItem?.target_date ?? ""}
            onChange={(e) => setField("target_date", e.target.value || null)}
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </>
    );
  }

  function renderLearningFields() {
    return (
      <>
        <FieldInput label="Title *" value={modalItem?.title ?? ""} onChange={(v) => setField("title", v)} />
        <FieldSelect
          label="Category"
          value={modalItem?.category ?? ""}
          onChange={(v) => setField("category", v)}
          options={LEARNING_CATEGORIES}
        />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Summary *</label>
          <textarea
            value={modalItem?.summary ?? ""}
            onChange={(e) => setField("summary", e.target.value)}
            rows={4}
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            Learnings are distilled reusable patterns worth referencing across multiple future items. For single-task notes, use lessons_learned on the issue or work item instead.
          </p>
        </div>
        <FieldRelatedSelect
          label="Related Issue"
          value={modalItem?.related_issue_id ?? ""}
          onChange={(v) => setField("related_issue_id", v || null)}
          options={allIssues}
        />
        <FieldRelatedSelect
          label="Related Work Item"
          value={modalItem?.related_work_item_id ?? ""}
          onChange={(v) => setField("related_work_item_id", v || null)}
          options={allWorkItems}
        />
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // Fetch related items for learnings table (issue/work item titles)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    fetchRelatedDropdowns();
  }, [fetchRelatedDropdowns]);

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <div className="bg-white border rounded-lg shadow-sm">
      {/* Tab bar */}
      <div className="flex border-b">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`px-5 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filter bar */}
      {renderFilterBar()}

      {/* Table */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="px-4 py-8 text-center text-gray-400">Loading...</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-400">No items found.</div>
        ) : activeTab === "issues" ? (
          renderIssuesTable()
        ) : activeTab === "work_items" ? (
          renderWorkItemsTable()
        ) : (
          renderLearningsTable()
        )}
      </div>

      {/* Modal */}
      {renderModal()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared field components (inline)
// ---------------------------------------------------------------------------

function StatusFilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="flex items-center gap-1.5">
      <label className="text-xs font-medium text-gray-500">Status:</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border rounded px-2 py-1 text-xs bg-white"
      >
        <option value="__default__">Active</option>
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="flex items-center gap-1.5">
      <label className="text-xs font-medium text-gray-500">{label}:</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border rounded px-2 py-1 text-xs bg-white"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    </div>
  );
}

function FieldInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

function FieldSelect({
  label,
  value,
  onChange,
  options,
  placeholder = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {placeholder && <option value="">Select...</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    </div>
  );
}

function FieldTextarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

function FieldRelatedSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; title: string }[];
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">None</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.title}
          </option>
        ))}
      </select>
    </div>
  );
}

function PencilIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}
