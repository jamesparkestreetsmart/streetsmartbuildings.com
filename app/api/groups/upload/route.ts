import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminRole } from "@/lib/auth/requireAdminRole";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_ROW_COUNT = 10_000;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ParseError {
  row: number;
  reason: string;
  email?: string;
  site_code?: string;
  group?: string;
}

interface ParseResult {
  rows_processed: number;
  groups_created: number;
  groups_updated: number;
  users_assigned: number;
  sites_assigned: number;
  unmatched_users: { email: string; row: number; group: string }[];
  unmatched_sites: { site_code: string; site_name: string; row: number; group: string }[];
  errors: ParseError[];
}

// POST: Upload and process Excel/CSV file
export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const orgId = formData.get("org_id") as string | null;
  const mappingStr = formData.get("mapping") as string | null;

  if (!file || !orgId) {
    return NextResponse.json({ error: "file and org_id required" }, { status: 400 });
  }

  // File size check
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.` },
      { status: 400 }
    );
  }

  // Admin check (owner or admin only)
  const auth = await requireAdminRole(orgId);
  if (auth instanceof NextResponse) return auth;

  let mapping: Record<string, string>;
  try {
    mapping = mappingStr ? JSON.parse(mappingStr) : {};
  } catch {
    return NextResponse.json({ error: "Invalid mapping JSON" }, { status: 400 });
  }

  // Parse file server-side
  let rows: Record<string, string>[];
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);
  } catch (err) {
    console.error("[upload] File parse error:", err);
    return NextResponse.json(
      { error: "Could not parse file. Ensure it is a valid .xlsx, .xls, or .csv file." },
      { status: 400 }
    );
  }

  // Row count check
  if (rows.length > MAX_ROW_COUNT) {
    return NextResponse.json(
      { error: `File has ${rows.length} rows. Maximum is ${MAX_ROW_COUNT}.` },
      { status: 400 }
    );
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "File contains no data rows." },
      { status: 400 }
    );
  }

  // Pre-fetch org users and sites for matching
  const { data: membershipData } = await supabase
    .from("a_orgs_users_memberships")
    .select("user_id")
    .eq("org_id", orgId);

  const memberUserIds = (membershipData || []).map((m: any) => m.user_id);

  const [{ data: orgUsers }, { data: orgSites }] = await Promise.all([
    memberUserIds.length > 0
      ? supabase.from("a_users").select("user_id, email").in("user_id", memberUserIds)
      : Promise.resolve({ data: [] }),
    supabase.from("a_sites").select("site_id, site_name, customer_identifier").eq("org_id", orgId),
  ]);

  const userByEmail = new Map<string, string>();
  (orgUsers || []).forEach((u: any) => {
    if (u.email) userByEmail.set(u.email.trim().toLowerCase(), u.user_id);
  });

  const siteByCode = new Map<string, string>();
  const siteByName = new Map<string, string>();
  (orgSites || []).forEach((s: any) => {
    if (s.customer_identifier) siteByCode.set(String(s.customer_identifier).trim().toUpperCase(), s.site_id);
    if (s.site_name) siteByName.set(s.site_name.trim().toLowerCase(), s.site_id);
  });

  // Process rows
  const result: ParseResult = {
    rows_processed: rows.length,
    groups_created: 0,
    groups_updated: 0,
    users_assigned: 0,
    sites_assigned: 0,
    unmatched_users: [],
    unmatched_sites: [],
    errors: [],
  };

  const groupCache = new Map<string, string>(); // name -> group_id

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // 1-indexed + header row

    // Extract values using mapping
    const regionName = mapping.region_name ? String(row[mapping.region_name] || "").trim() : "";
    const dmEmail = mapping.dm_email ? String(row[mapping.dm_email] || "").trim().toLowerCase() : "";
    const siteName = mapping.site_name ? String(row[mapping.site_name] || "").trim() : "";
    const siteCode = mapping.site_code ? String(row[mapping.site_code] || "").trim().toUpperCase() : "";

    if (!regionName) {
      result.errors.push({ row: rowNum, reason: "Missing region name" });
      continue;
    }

    // 1. Upsert group by (org_id, region_name)
    let groupId = groupCache.get(regionName);
    if (!groupId) {
      const { data: existing } = await supabase
        .from("b_user_groups")
        .select("group_id")
        .eq("org_id", orgId)
        .eq("name", regionName)
        .single();

      if (existing) {
        groupId = existing.group_id;
        result.groups_updated++;
      } else {
        const { data: created, error: createErr } = await supabase
          .from("b_user_groups")
          .insert({ org_id: orgId, name: regionName })
          .select("group_id")
          .single();

        if (createErr) {
          result.errors.push({
            row: rowNum,
            reason: `Failed to create group "${regionName}": ${createErr.message}`,
            group: regionName,
          });
          continue;
        }
        groupId = created!.group_id;
        result.groups_created++;
      }
      groupCache.set(regionName, groupId!);
    }

    // 2. Match user by normalized email (trim, lowercase, exact)
    if (dmEmail) {
      const userId = userByEmail.get(dmEmail);
      if (userId) {
        const { error: memErr } = await supabase
          .from("b_user_group_members")
          .upsert(
            { group_id: groupId, user_id: userId },
            { onConflict: "group_id,user_id" }
          );
        if (!memErr) {
          result.users_assigned++;
        } else {
          result.errors.push({
            row: rowNum,
            reason: `Failed to assign member: ${memErr.message}`,
            email: dmEmail,
            group: regionName,
          });
        }
      } else {
        result.unmatched_users.push({ email: dmEmail, row: rowNum, group: regionName });
      }
    }

    // 3. Match site by code (trim+uppercase, exact) → fallback name (case-insensitive exact)
    const siteIdByCode = siteCode ? siteByCode.get(siteCode) : undefined;
    const siteIdByName = siteName ? siteByName.get(siteName.toLowerCase()) : undefined;
    const siteId = siteIdByCode || siteIdByName;

    if (siteId) {
      const { error: siteErr } = await supabase
        .from("b_user_group_sites")
        .upsert(
          { group_id: groupId, site_id: siteId },
          { onConflict: "group_id,site_id" }
        );
      if (!siteErr) {
        result.sites_assigned++;
      } else {
        result.errors.push({
          row: rowNum,
          reason: `Failed to assign site: ${siteErr.message}`,
          site_code: siteCode || siteName,
          group: regionName,
        });
      }
    } else if (siteCode || siteName) {
      result.unmatched_sites.push({
        site_code: siteCode,
        site_name: siteName,
        row: rowNum,
        group: regionName,
      });
    }
  }

  // Store file in Supabase storage
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const storagePath = `org-excel-uploads/${orgId}/${timestamp}-${file.name}`;
  const buffer = await file.arrayBuffer();

  await supabase.storage
    .from("uploads")
    .upload(storagePath, buffer, { contentType: file.type });

  // Log upload
  await supabase.from("b_org_excel_uploads").insert({
    org_id: orgId,
    filename: file.name,
    storage_path: storagePath,
    uploaded_by: auth.userId,
    row_count: rows.length,
    parse_result: result,
  });

  console.log(
    `[upload] org=${orgId} file=${file.name} rows=${rows.length} ` +
    `groups_created=${result.groups_created} groups_updated=${result.groups_updated} ` +
    `users=${result.users_assigned} sites=${result.sites_assigned} ` +
    `unmatched_users=${result.unmatched_users.length} unmatched_sites=${result.unmatched_sites.length} ` +
    `errors=${result.errors.length}`
  );

  return NextResponse.json(result);
}
