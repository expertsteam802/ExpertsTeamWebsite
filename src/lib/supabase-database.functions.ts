import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const identifier = z.string().min(1).max(63).regex(/^[A-Za-z_][A-Za-z0-9_]*$/);
const databaseInput = z.object({
  operation: z.enum(["tables", "rows", "insert", "update", "delete"]),
  projectRef: z.string().regex(/^[a-z0-9]{20}$/i),
  schema: identifier.optional().default("public"),
  table: identifier.optional(),
  filter: z.string().max(200).optional().default(""),
  values: z.record(z.string(), z.unknown()).optional(),
  primaryKeyValue: z.unknown().optional(),
});

type ManagementToken = { accessToken: string; scopes: string[] };
type QueryResult = unknown;

function quoteIdentifier(value: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(value)) throw new Error("Invalid database identifier.");
  return '"' + value + '"';
}

async function getSupabaseManagementToken(userId: string, needsWrite: boolean): Promise<ManagementToken> {
  const { data: connection, error: connectionError } = await supabaseAdmin
    .from("user_plugin_connections")
    .select("display_name,provider_account_id,provider_username,scopes")
    .eq("user_id", userId)
    .eq("provider", "supabase")
    .eq("status", "connected")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (connectionError) throw new Error("Could not read the Supabase OAuth connection: " + connectionError.message);
  if (!connection) throw new Error("Connect Supabase Management under Connections & Integrations first.");

  const readSecret = supabaseAdmin.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  const { data: secretData, error: secretError } = await readSecret("get_user_plugin_oauth_secret", {
    p_user_id: userId,
    p_provider: "supabase",
  });
  if (secretError || !secretData || typeof secretData !== "object" || Array.isArray(secretData)) {
    throw new Error("Could not decrypt the connected Supabase OAuth token. Reconnect Supabase and try again.");
  }
  let token = secretData as { access_token?: string; refresh_token?: string | null; expires_at?: number | null; token_type?: string; scope?: string };
  if (!token.access_token) throw new Error("The Supabase OAuth token is incomplete. Reconnect Supabase.");

  if (token.expires_at && token.expires_at < Date.now() + 60_000) {
    if (!token.refresh_token) throw new Error("Your Supabase Management session expired. Reconnect Supabase.");
    const clientId = process.env["SUPABASE_OAUTH_CLIENT_ID"];
    const clientSecret = process.env["SUPABASE_OAUTH_CLIENT_SECRET"];
    if (!clientId || !clientSecret) throw new Error("Supabase OAuth server credentials are not configured.");
    const refreshResponse = await fetch("https://api.supabase.com/v1/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        Authorization: "Basic " + Buffer.from(clientId + ":" + clientSecret).toString("base64"),
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: token.refresh_token }),
      signal: AbortSignal.timeout(15000),
    });
    const refreshed = await refreshResponse.json() as {
      access_token?: string; refresh_token?: string; expires_in?: number; token_type?: string; scope?: string; error?: string; message?: string;
    };
    if (!refreshResponse.ok || !refreshed.access_token) {
      throw new Error(refreshed.message || refreshed.error || "Supabase OAuth refresh failed. Reconnect Supabase.");
    }
    token = {
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token ?? token.refresh_token,
      expires_at: refreshed.expires_in ? Date.now() + refreshed.expires_in * 1000 : null,
      token_type: refreshed.token_type ?? "Bearer",
      scope: refreshed.scope ?? token.scope,
    };
    const scopes = token.scope?.split(/\s+/).filter(Boolean) ?? connection.scopes ?? [];
    const storeSecret = supabaseAdmin.rpc as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>;
    const { error } = await storeSecret("store_plugin_oauth_connection", {
      p_user_id: userId,
      p_provider: "supabase",
      p_display_name: connection.display_name,
      p_provider_account_id: connection.provider_account_id,
      p_provider_username: connection.provider_username,
      p_scopes: scopes,
      p_token_payload: token,
    });
    if (error) throw new Error("The refreshed Supabase token could not be stored securely: " + error.message);
  }

  const scopes = token.scope?.split(/\s+/).filter(Boolean) ?? connection.scopes ?? [];
  const normalized = new Set(scopes.map((scope) => scope.toLowerCase()));
  const hasRead = normalized.has("database:read") || normalized.has("database:write") || normalized.has("database_read") || normalized.has("database_write");
  const hasWrite = normalized.has("database:write") || normalized.has("database_write");
  if (!hasRead || (needsWrite && !hasWrite)) {
    throw new Error(
      needsWrite
        ? "Supabase Management OAuth needs Database Read and Database Write permissions. Enable both on the ExpertsTeam OAuth app, then reconnect Supabase."
        : "Supabase Management OAuth needs Database Read permission. Enable it on the ExpertsTeam OAuth app, then reconnect Supabase.",
    );
  }
  return { accessToken: token.access_token, scopes };
}

async function assertSupabaseProjectAccess(accessToken: string, projectRef: string) {
  const response = await fetch("https://api.supabase.com/v1/projects", {
    headers: { Authorization: "Bearer " + accessToken, Accept: "application/json" },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error("Could not verify your Supabase project access (HTTP " + response.status + ").");
  const projects = await response.json() as Array<{ id?: string; ref?: string }>;
  if (!projects.some((project) => project.id === projectRef || project.ref === projectRef)) {
    throw new Error("This Supabase project is not available to the connected account.");
  }
}

async function runManagementQuery(
  accessToken: string,
  projectRef: string,
  query: string,
  parameters: unknown[] = [],
  write = false,
): Promise<QueryResult> {
  const endpoint = write ? "query" : "query/read-only";
  const response = await fetch(
    "https://api.supabase.com/v1/projects/" + encodeURIComponent(projectRef) + "/database/" + endpoint,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + accessToken,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query, parameters }),
      signal: AbortSignal.timeout(20000),
    },
  );
  const body = await response.text();
  if (!response.ok) throw new Error("Supabase database query failed (HTTP " + response.status + "): " + body.slice(0, 1200));
  if (!body) return [];
  try {
    return JSON.parse(body) as QueryResult;
  } catch {
    return body;
  }
}

function rowsFrom(result: QueryResult): Record<string, unknown>[] {
  if (Array.isArray(result)) return result.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object");
  if (result && typeof result === "object" && !Array.isArray(result)) {
    const object = result as Record<string, unknown>;
    if (Array.isArray(object.rows)) return object.rows.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object");
    if (Array.isArray(object.data)) return object.data.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object");
    if (Array.isArray(object.result)) return object.result.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object");
  }
  return [];
}

export const manageSupabaseDatabase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => databaseInput.parse(input))
  .handler(async ({ data, context }) => {
    const write = ["insert", "update", "delete"].includes(data.operation);
    const { accessToken } = await getSupabaseManagementToken(context.userId, write);
    await assertSupabaseProjectAccess(accessToken, data.projectRef);

    if (data.operation === "tables") {
      const result = await runManagementQuery(
        accessToken,
        data.projectRef,
        "select table_schema, table_name from information_schema.tables where table_type = 'BASE TABLE' and table_schema not in ('pg_catalog','information_schema','auth','storage','vault','extensions','realtime','supabase_functions','graphql') order by table_schema, table_name",
      );
      return { tables: rowsFrom(result), columns: [], rows: [], primaryKey: null, result };
    }

    if (!data.table) throw new Error("Choose a database table first.");
    const schema = data.schema;
    const table = data.table;
    const qualified = quoteIdentifier(schema) + "." + quoteIdentifier(table);
    const columnResult = await runManagementQuery(
      accessToken,
      data.projectRef,
      "select c.column_name, c.data_type, c.is_nullable, exists (select 1 from information_schema.table_constraints tc join information_schema.key_column_usage ku on ku.constraint_name = tc.constraint_name and ku.constraint_schema = tc.constraint_schema where tc.constraint_type = 'PRIMARY KEY' and tc.table_schema = c.table_schema and tc.table_name = c.table_name and ku.column_name = c.column_name) as is_primary_key from information_schema.columns c where c.table_schema = $1 and c.table_name = $2 order by c.ordinal_position",
      [schema, table],
    );
    const columns = rowsFrom(columnResult);
    if (!columns.length) throw new Error("The selected table could not be found or has no visible columns.");
    const primaryKeys = columns.filter((column) => column.is_primary_key === true).map((column) => String(column.column_name));
    const primaryKey = primaryKeys.length === 1 ? primaryKeys[0] : null;

    if (data.operation === "rows") {
      const filter = data.filter.trim();
      const result = await runManagementQuery(
        accessToken,
        data.projectRef,
        "select * from " + qualified + " as t" + (filter ? " where to_jsonb(t)::text ilike $1" : "") + " limit 100",
        filter ? ["%" + filter + "%"] : [],
      );
      return { tables: [], columns, rows: rowsFrom(result), primaryKey, result };
    }

    const values = data.values ?? {};
    if (data.operation !== "delete" && (!values || typeof values !== "object" || Array.isArray(values) || !Object.keys(values).length)) {
      throw new Error("Enter at least one column value.");
    }
    if (JSON.stringify(values).length > 100_000) throw new Error("The row payload is too large.");
    const allowedColumns = new Set(columns.map((column) => String(column.column_name)));
    const keys = Object.keys(values);
    if (keys.some((key) => !allowedColumns.has(key))) throw new Error("One or more column names are not part of this table.");

    if (data.operation === "insert") {
      const result = await runManagementQuery(
        accessToken,
        data.projectRef,
        "insert into " + qualified + " (" + keys.map(quoteIdentifier).join(", ") + ") values (" + keys.map((_, index) => "$" + (index + 1)).join(", ") + ") returning *",
        keys.map((key) => values[key]),
        true,
      );
      return { tables: [], columns, rows: rowsFrom(result), primaryKey, result };
    }

    if (!primaryKey) throw new Error("This table needs exactly one primary-key column before rows can be edited or deleted.");
    if (data.primaryKeyValue === undefined || data.primaryKeyValue === null) throw new Error("The selected row's primary-key value is missing.");

    if (data.operation === "update") {
      if (keys.includes(primaryKey)) throw new Error("The primary key cannot be changed in the row editor.");
      const parameters = keys.map((key) => values[key]);
      parameters.push(data.primaryKeyValue);
      const result = await runManagementQuery(
        accessToken,
        data.projectRef,
        "update " + qualified + " set " + keys.map((key, index) => quoteIdentifier(key) + " = $" + (index + 1)).join(", ") + " where " + quoteIdentifier(primaryKey) + " = $" + (keys.length + 1) + " returning *",
        parameters,
        true,
      );
      return { tables: [], columns, rows: rowsFrom(result), primaryKey, result };
    }

    const result = await runManagementQuery(
      accessToken,
      data.projectRef,
      "delete from " + qualified + " where " + quoteIdentifier(primaryKey) + " = $1 returning *",
      [data.primaryKeyValue],
      true,
    );
    return { tables: [], columns, rows: rowsFrom(result), primaryKey, result };
  });
