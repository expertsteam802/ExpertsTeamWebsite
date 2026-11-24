import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Database, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { manageSupabaseDatabase } from "@/lib/supabase-database.functions";
import { runCodingAgent } from "@/lib/agent.functions";
import { runCodingAgent } from "@/lib/agent.functions";

type TableInfo = { table_schema: string; table_name: string };
type ColumnInfo = { column_name: string; data_type: string; is_nullable: string; is_primary_key: boolean };
type RowData = Record<string, unknown>;

export function SupabaseDatabasePanel({
  projectRef,
  open,
  onOpenChange,
  projectId,
  projectFiles,
  onMigrationApplied,
}: {
  projectRef: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
  projectFiles: Record<string, string>;
  onMigrationApplied: (sql: string) => Promise<void>;
}) {
  const runDatabase = useServerFn(manageSupabaseDatabase);
  const runAgent = useServerFn(runCodingAgent);
  const runAgent = useServerFn(runCodingAgent);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [activeTable, setActiveTable] = useState<TableInfo | null>(null);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [primaryKey, setPrimaryKey] = useState<string | null>(null);
  const [rows, setRows] = useState<RowData[]>([]);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [editorMode, setEditorMode] = useState<"insert" | "update" | null>(null);
  const [editorDraft, setEditorDraft] = useState("{}");
  const [editingPrimaryKey, setEditingPrimaryKey] = useState<unknown>(null);
  const [migrationOpen, setMigrationOpen] = useState(false);
  const [migrationPrompt, setMigrationPrompt] = useState("");
  const [migrationSql, setMigrationSql] = useState("");
  const [migrationGenerating, setMigrationGenerating] = useState(false);
  const [migrationApplying, setMigrationApplying] = useState(false);
  const [seedOpen, setSeedOpen] = useState(false);
  const [seedDraft, setSeedDraft] = useState("[]");
  const [seedGenerating, setSeedGenerating] = useState(false);
  const [migrationOpen, setMigrationOpen] = useState(false);
  const [migrationPrompt, setMigrationPrompt] = useState("");
  const [migrationSql, setMigrationSql] = useState("");
  const [migrationGenerating, setMigrationGenerating] = useState(false);
  const [migrationApplying, setMigrationApplying] = useState(false);
  const [seedOpen, setSeedOpen] = useState(false);
  const [seedDraft, setSeedDraft] = useState("[]");
  const [seedGenerating, setSeedGenerating] = useState(false);

  const loadRows = useCallback(async (table: TableInfo, search = "") => {
    if (!projectRef) return;
    setBusy(true);
    try {
      const result = await runDatabase({
        data: { operation: "rows", projectRef, schema: table.table_schema, table: table.table_name, filter: search },
      });
      setColumns(result.columns as unknown as ColumnInfo[]);
      setPrimaryKey(result.primaryKey);
      setRows(result.rows as unknown as RowData[]);
      setActiveTable(table);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load table rows.");
    } finally {
      setBusy(false);
    }
  }, [projectRef, runDatabase]);

  const loadTables = useCallback(async () => {
    if (!projectRef) return;
    setBusy(true);
    try {
      const result = await runDatabase({ data: { operation: "tables", projectRef } });
      const found = result.tables as unknown as TableInfo[];
      setTables(found);
      if (found.length) {
        const selected = found[0]!;
        setActiveTable(selected);
        await loadRows(selected, "");
      } else {
        setActiveTable(null);
        setRows([]);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load Supabase tables.");
    } finally {
      setBusy(false);
    }
  }, [projectRef, runDatabase, loadRows]);

  useEffect(() => {
    if (open && projectRef) void loadTables();
    if (!open) {
      setEditorMode(null);
      setFilter("");
    }
  }, [open, projectRef, loadTables]);

  function beginInsert() {
    const initial: RowData = {};
    for (const column of columns) {
      if (column.is_primary_key && column.data_type.toLowerCase().includes("int")) continue;
      initial[column.column_name] = null;
    }
    setEditingPrimaryKey(null);
    setEditorDraft(JSON.stringify(initial, null, 2));
    setEditorMode("insert");
  }

  function beginUpdate(row: RowData) {
    if (!primaryKey || !activeTable) return;
    setEditingPrimaryKey(row[primaryKey]);
    const editable = { ...row };
    delete editable[primaryKey];
    setEditorDraft(JSON.stringify(editable, null, 2));
    setEditorMode("update");
  }

  async function generateMigration() {
    if (!projectId || !migrationPrompt.trim()) return;
    setMigrationGenerating(true);
    try {
      const schemaSummary = tables.map((item) => item.table_schema + "." + item.table_name).join(", ");
      const result = await runAgent({
        data: {
          projectId,
          mode: "chat",
          modelTier: "fast",
          files: projectFiles,
          prompt: [
            "Generate a production-safe PostgreSQL schema migration for this request: " + migrationPrompt.trim(),
            "Existing database tables: " + (schemaSummary || "not yet discovered"),
            "Return exactly one fenced sql block and no prose.",
            "Prefer CREATE TABLE IF NOT EXISTS, explicit foreign keys, indexes, ENABLE ROW LEVEL SECURITY, and least-privilege policies.",
            "Never DROP, TRUNCATE, DELETE, or modify existing rows. Do not create permissive USING (true) policies.",
          ].join("\n"),
        },
      });
      const message = result.message || "";
      const fence = String.fromCharCode(96).repeat(3);
      const match = message.match(new RegExp(fence + "(?:sql|postgres|postgresql)?\\s*([\\s\\S]*?)" + fence, "i"));
      setMigrationSql((match && match[1] ? match[1] : message).trim());
      setMigrationOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate the SQL migration.");
    } finally {
      setMigrationGenerating(false);
    }
  }

  async function applyMigration() {
    if (!projectRef || !migrationSql.trim()) return;
    if (!window.confirm("Apply this SQL migration to your connected Supabase database? Review the SQL carefully before continuing.")) return;
    setMigrationApplying(true);
    try {
      await runDatabase({ data: { operation: "migration", projectRef, sql: migrationSql } });
      try {
        await onMigrationApplied(migrationSql);
      } catch {
        toast.error("The database migration ran, but its SQL file could not be saved to the project. Copy the SQL so it can be tracked.");
      }
      setMigrationOpen(false);
      await loadTables();
      toast.success("Supabase migration applied.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The migration could not be applied.");
    } finally {
      setMigrationApplying(false);
    }
  }

  async function generateSeedData() {
    if (!projectId || !activeTable) return;
    setSeedGenerating(true);
    try {
      const columnSummary = columns.map((column) => ({
        name: column.column_name,
        type: column.data_type,
        nullable: column.is_nullable === "YES",
        primaryKey: column.is_primary_key,
      }));
      const result = await runAgent({
        data: {
          projectId,
          mode: "chat",
          modelTier: "fast",
          files: projectFiles,
          prompt: [
            "Generate 5 realistic, internally consistent test rows for PostgreSQL table " + activeTable.table_schema + "." + activeTable.table_name + ".",
            "Columns: " + JSON.stringify(columnSummary),
            "Return only a JSON array of objects. Do not include generated integer primary keys or unknown columns.",
            "Respect data types, nullable fields, and plausible foreign key values. Use no real personal data.",
          ].join("\n"),
        },
      });
      const message = result.message || "";
      const fence = String.fromCharCode(96).repeat(3);
      const match = message.match(new RegExp(fence + "(?:json)?\\s*([\\s\\S]*?)" + fence, "i"));
      const parsed: unknown = JSON.parse((match && match[1] ? match[1] : message).trim());
      if (!Array.isArray(parsed)) throw new Error("ExpertAI did not return a JSON array.");
      setSeedDraft(JSON.stringify(parsed, null, 2));
      setSeedOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate seed data.");
    } finally {
      setSeedGenerating(false);
    }
  }

  async function applySeedData() {
    if (!projectRef || !activeTable) return;
    let seedRows: Record<string, unknown>[];
    try {
      const parsed: unknown = JSON.parse(seedDraft);
      if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 50 || parsed.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
        throw new Error("Provide a JSON array with 1–50 row objects.");
      }
      seedRows = parsed as Record<string, unknown>[];
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid seed JSON.");
      return;
    }
    if (!window.confirm("Insert " + seedRows.length + " generated test rows into " + activeTable.table_name + "?")) return;
    setBusy(true);
    try {
      await runDatabase({ data: { operation: "seed", projectRef, schema: activeTable.table_schema, table: activeTable.table_name, seedRows } });
      setSeedOpen(false);
      await loadRows(activeTable, filter);
      toast.success("Inserted " + seedRows.length + " test rows.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not insert seed data.");
    } finally {
      setBusy(false);
    }
  }

  async function generateMigration() {
    if (!projectId || !migrationPrompt.trim()) return;
    setMigrationGenerating(true);
    try {
      const schemaSummary = tables.map((item) => item.table_schema + "." + item.table_name).join(", ");
      const result = await runAgent({
        data: {
          projectId,
          mode: "chat",
          modelTier: "fast",
          files: projectFiles,
          prompt: [
            "Generate a production-safe PostgreSQL schema migration for this request: " + migrationPrompt.trim(),
            "Existing database tables: " + (schemaSummary || "not yet discovered"),
            "Return exactly one fenced sql block and no prose.",
            "Prefer CREATE TABLE IF NOT EXISTS, explicit foreign keys, indexes, ENABLE ROW LEVEL SECURITY, and least-privilege policies.",
            "Never DROP, TRUNCATE, DELETE, or modify existing rows. Do not create permissive USING (true) policies.",
          ].join("\n"),
        },
      });
      const message = result.message || "";
      const fence = String.fromCharCode(96).repeat(3);
      const match = message.match(new RegExp(fence + "(?:sql|postgres|postgresql)?\\s*([\\s\\S]*?)" + fence, "i"));
      setMigrationSql((match && match[1] ? match[1] : message).trim());
      setMigrationOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate the SQL migration.");
    } finally {
      setMigrationGenerating(false);
    }
  }

  async function applyMigration() {
    if (!projectRef || !migrationSql.trim()) return;
    if (!window.confirm("Apply this SQL migration to your connected Supabase database? Review the SQL carefully before continuing.")) return;
    setMigrationApplying(true);
    try {
      await runDatabase({ data: { operation: "migration", projectRef, sql: migrationSql } });
      try {
        await onMigrationApplied(migrationSql);
      } catch {
        toast.error("The database migration ran, but its SQL file could not be saved to the project. Copy the SQL so it can be tracked.");
      }
      setMigrationOpen(false);
      await loadTables();
      toast.success("Supabase migration applied.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The migration could not be applied.");
    } finally {
      setMigrationApplying(false);
    }
  }

  async function generateSeedData() {
    if (!projectId || !activeTable) return;
    setSeedGenerating(true);
    try {
      const columnSummary = columns.map((column) => ({
        name: column.column_name,
        type: column.data_type,
        nullable: column.is_nullable === "YES",
        primaryKey: column.is_primary_key,
      }));
      const result = await runAgent({
        data: {
          projectId,
          mode: "chat",
          modelTier: "fast",
          files: projectFiles,
          prompt: [
            "Generate 5 realistic, internally consistent test rows for PostgreSQL table " + activeTable.table_schema + "." + activeTable.table_name + ".",
            "Columns: " + JSON.stringify(columnSummary),
            "Return only a JSON array of objects. Do not include generated integer primary keys or unknown columns.",
            "Respect data types, nullable fields, and plausible foreign key values. Use no real personal data.",
          ].join("\n"),
        },
      });
      const message = result.message || "";
      const fence = String.fromCharCode(96).repeat(3);
      const match = message.match(new RegExp(fence + "(?:json)?\\s*([\\s\\S]*?)" + fence, "i"));
      const parsed: unknown = JSON.parse((match && match[1] ? match[1] : message).trim());
      if (!Array.isArray(parsed)) throw new Error("ExpertAI did not return a JSON array.");
      setSeedDraft(JSON.stringify(parsed, null, 2));
      setSeedOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate seed data.");
    } finally {
      setSeedGenerating(false);
    }
  }

  async function applySeedData() {
    if (!projectRef || !activeTable) return;
    let seedRows: Record<string, unknown>[];
    try {
      const parsed: unknown = JSON.parse(seedDraft);
      if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 50 || parsed.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
        throw new Error("Provide a JSON array with 1–50 row objects.");
      }
      seedRows = parsed as Record<string, unknown>[];
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid seed JSON.");
      return;
    }
    if (!window.confirm("Insert " + seedRows.length + " generated test rows into " + activeTable.table_name + "?")) return;
    setBusy(true);
    try {
      await runDatabase({ data: { operation: "seed", projectRef, schema: activeTable.table_schema, table: activeTable.table_name, seedRows } });
      setSeedOpen(false);
      await loadRows(activeTable, filter);
      toast.success("Inserted " + seedRows.length + " test rows.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not insert seed data.");
    } finally {
      setBusy(false);
    }
  }

  async function saveRow() {
    if (!projectRef || !activeTable || !editorMode) return;
    let values: RowData;
    try {
      const parsed: unknown = JSON.parse(editorDraft);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Enter a JSON object of column values.");
      values = parsed as RowData;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid JSON row.");
      return;
    }
    setBusy(true);
    try {
      await runDatabase({
        data: {
          operation: editorMode,
          projectRef,
          schema: activeTable.table_schema,
          table: activeTable.table_name,
          values,
          primaryKeyValue: editingPrimaryKey,
        },
      });
      setEditorMode(null);
      await loadRows(activeTable, filter);
      toast.success(editorMode === "insert" ? "Database row inserted." : "Database row updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save database row.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteRow(row: RowData) {
    if (!projectRef || !activeTable || !primaryKey) return;
    if (!window.confirm("Delete this row from " + activeTable.table_name + "? This cannot be undone.")) return;
    setBusy(true);
    try {
      await runDatabase({
        data: {
          operation: "delete",
          projectRef,
          schema: activeTable.table_schema,
          table: activeTable.table_name,
          values: {},
          primaryKeyValue: row[primaryKey],
        },
      });
      await loadRows(activeTable);
      toast.success("Database row deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete database row.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
    <Dialog open={migrationOpen} onOpenChange={setMigrationOpen}>
      <DialogContent className="max-w-3xl border-slate-700 bg-[#0b1320] text-white">
        <DialogHeader><DialogTitle>AI SQL Migration</DialogTitle></DialogHeader>
        <Input value={migrationPrompt} onChange={(event) => setMigrationPrompt(event.target.value)} placeholder="Describe tables, relationships, and access policies to create…" className="border-slate-700 bg-[#080e19] text-white" />
        <div className="flex justify-end"><Button size="sm" onClick={() => void generateMigration()} disabled={!migrationPrompt.trim() || migrationGenerating || !projectId}>{migrationGenerating ? "Generating…" : "Generate SQL"}</Button></div>
        <Textarea value={migrationSql} onChange={(event) => setMigrationSql(event.target.value)} rows={14} placeholder="Generated PostgreSQL migration appears here for review…" className="border-slate-700 bg-[#080e19] font-mono text-[10px] text-white" />
        <p className="text-[9px] leading-4 text-slate-500">Only CREATE TABLE, CREATE INDEX, CREATE POLICY, CREATE TYPE, safe ALTER TABLE, and COMMENT statements are accepted. Destructive SQL is blocked. You must confirm before applying.</p>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setMigrationOpen(false)}>Cancel</Button><Button onClick={() => void applyMigration()} disabled={!migrationSql.trim() || migrationApplying}>{migrationApplying ? "Applying…" : "Apply migration"}</Button></div>
      </DialogContent>
    </Dialog>
    <Dialog open={seedOpen} onOpenChange={setSeedOpen}>
      <DialogContent className="max-w-2xl border-slate-700 bg-[#0b1320] text-white">
        <DialogHeader><DialogTitle>AI-generated seed data</DialogTitle></DialogHeader>
        <p className="text-[10px] text-slate-500">Review and edit the JSON rows before inserting them into the selected table.</p>
        <Textarea value={seedDraft} onChange={(event) => setSeedDraft(event.target.value)} rows={12} className="border-slate-700 bg-[#080e19] font-mono text-[10px] text-white" />
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setSeedOpen(false)}>Cancel</Button><Button onClick={() => void applySeedData()} disabled={busy}>Insert seed rows</Button></div>
      </DialogContent>
    </Dialog>
    <Dialog open={migrationOpen} onOpenChange={setMigrationOpen}>
      <DialogContent className="max-w-3xl border-slate-700 bg-[#0b1320] text-white">
        <DialogHeader><DialogTitle>AI SQL Migration</DialogTitle></DialogHeader>
        <Input value={migrationPrompt} onChange={(event) => setMigrationPrompt(event.target.value)} placeholder="Describe tables, relationships, and access policies to create…" className="border-slate-700 bg-[#080e19] text-white" />
        <div className="flex justify-end"><Button size="sm" onClick={() => void generateMigration()} disabled={!migrationPrompt.trim() || migrationGenerating || !projectId}>{migrationGenerating ? "Generating…" : "Generate SQL"}</Button></div>
        <Textarea value={migrationSql} onChange={(event) => setMigrationSql(event.target.value)} rows={14} placeholder="Generated PostgreSQL migration appears here for review…" className="border-slate-700 bg-[#080e19] font-mono text-[10px] text-white" />
        <p className="text-[9px] leading-4 text-slate-500">Only CREATE TABLE, CREATE INDEX, CREATE POLICY, CREATE TYPE, safe ALTER TABLE, and COMMENT statements are accepted. Destructive SQL is blocked. You must confirm before applying.</p>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setMigrationOpen(false)}>Cancel</Button><Button onClick={() => void applyMigration()} disabled={!migrationSql.trim() || migrationApplying}>{migrationApplying ? "Applying…" : "Apply migration"}</Button></div>
      </DialogContent>
    </Dialog>
    <Dialog open={seedOpen} onOpenChange={setSeedOpen}>
      <DialogContent className="max-w-2xl border-slate-700 bg-[#0b1320] text-white">
        <DialogHeader><DialogTitle>AI-generated seed data</DialogTitle></DialogHeader>
        <p className="text-[10px] text-slate-500">Review and edit the JSON rows before inserting them into the selected table.</p>
        <Textarea value={seedDraft} onChange={(event) => setSeedDraft(event.target.value)} rows={12} className="border-slate-700 bg-[#080e19] font-mono text-[10px] text-white" />
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setSeedOpen(false)}>Cancel</Button><Button onClick={() => void applySeedData()} disabled={busy}>Insert seed rows</Button></div>
      </DialogContent>
    </Dialog>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-hidden border-slate-700 bg-[#0b1320] p-0 text-white">
        <DialogHeader className="border-b border-slate-800 px-5 py-4">
          <DialogTitle className="flex items-center gap-2"><Database className="h-4 w-4 text-cyan-300" /> Supabase Database</DialogTitle>
          <p className="text-[10px] text-slate-500">{projectRef ? "Connected project · " + projectRef : "Select a connected Supabase project in the Builder first."}</p>
        </DialogHeader>
        {!projectRef ? (
          <div className="p-8 text-center text-xs text-slate-400">Connect a Supabase project under Connections &amp; Integrations, then select it in the Builder.</div>
        ) : (
          <div className="grid min-h-0 grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)]">
            <aside className="max-h-48 overflow-auto border-b border-slate-800 p-3 md:max-h-[70vh] md:border-b-0 md:border-r">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Tables · {tables.length}</span>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" className="h-7 border-slate-700 px-2 text-[9px]" onClick={() => { setMigrationPrompt(""); setMigrationSql(""); setMigrationOpen(true); }}>SQL Migration</Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => void loadTables()} disabled={busy}><RefreshCw className="h-3 w-3" /></Button>
                </div>
              </div>
              <div className="space-y-1">
                {tables.map((table) => (
                  <button key={table.table_schema + "." + table.table_name} type="button" onClick={() => { setFilter(""); void loadRows(table, ""); }} className={activeTable?.table_schema === table.table_schema && activeTable.table_name === table.table_name ? "w-full rounded-md bg-cyan-400/10 px-2 py-2 text-left text-[10px] text-cyan-200" : "w-full rounded-md px-2 py-2 text-left text-[10px] text-slate-400 hover:bg-white/5"}>
                    <span className="block truncate">{table.table_name}</span><span className="text-[9px] text-slate-600">{table.table_schema}</span>
                  </button>
                ))}
                {!tables.length && <p className="py-4 text-[10px] text-slate-600">No tables returned. Enable Database Read and Database Write scopes on the ExpertsTeam OAuth app, then reconnect Supabase.</p>}
              </div>
            </aside>
            <section className="flex min-h-0 flex-col">
              {activeTable ? (
                <>
                  <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 p-3">
                    <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{activeTable.table_schema}.{activeTable.table_name}</p><p className="text-[9px] text-slate-500">{rows.length} rows loaded · max 100</p></div>
                    <div className="flex min-w-0 items-center gap-1">
                      <Input value={filter} onChange={(event) => setFilter(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loadRows(activeTable, filter); }} placeholder="Filter rows…" className="h-8 w-36 border-slate-700 bg-[#080e19] text-[10px] text-white" />
                      <Button size="icon" variant="outline" className="h-8 w-8 border-slate-700" onClick={() => void loadRows(activeTable, filter)} disabled={busy}><Search className="h-3 w-3" /></Button>
                    </div>
                    <Button size="sm" onClick={beginInsert} disabled={busy} className="h-8 text-[10px]"><Plus className="mr-1 h-3 w-3" /> Add row</Button>
                    <Button size="sm" variant="outline" onClick={() => void generateSeedData()} disabled={busy || seedGenerating || !projectId} className="h-8 border-slate-700 text-[10px]">{seedGenerating ? "Generating…" : "AI Seed"}</Button>
                    <Button size="sm" variant="outline" onClick={() => { setMigrationPrompt(""); setMigrationSql(""); setMigrationOpen(true); }} className="h-8 border-slate-700 text-[10px]">SQL Migration</Button>
                    <Button size="sm" variant="outline" onClick={() => void generateSeedData()} disabled={busy || seedGenerating || !projectId} className="h-8 border-slate-700 text-[10px]">{seedGenerating ? "Generating…" : "AI Seed"}</Button>
                  </div>
                  <div className="border-b border-slate-800 px-3 py-2 text-[9px] text-slate-500">{columns.map((column) => column.column_name + (column.is_primary_key ? " · PK" : "")).join("  ·  ")}</div>
                  {editorMode && (
                    <div className="border-b border-cyan-400/20 bg-cyan-400/[0.04] p-3">
                      <div className="mb-2 flex items-center justify-between"><span className="text-[10px] font-semibold text-cyan-200">{editorMode === "insert" ? "Insert row" : "Update row"} · JSON values</span><button type="button" onClick={() => setEditorMode(null)} aria-label="Close row editor"><X className="h-3.5 w-3.5 text-slate-400" /></button></div>
                      <Textarea value={editorDraft} onChange={(event) => setEditorDraft(event.target.value)} rows={5} className="border-slate-700 bg-[#080e19] font-mono text-[10px] text-white" />
                      <div className="mt-2 flex justify-end"><Button size="sm" onClick={() => void saveRow()} disabled={busy} className="h-7 text-[10px]">{busy ? "Saving…" : "Save row"}</Button></div>
                    </div>
                  )}
                  <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
                    {rows.map((row, index) => (
                      <details key={String(row[primaryKey ?? "id"] ?? index)} className="rounded-lg border border-slate-800 bg-[#080e19]">
                        <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[10px] text-slate-300"><span className="min-w-0 flex-1 truncate">{primaryKey ? String(row[primaryKey]) : "Row " + (index + 1)}</span><span className="text-slate-600">{Object.keys(row).length} columns</span></summary>
                        <pre className="max-h-48 overflow-auto border-t border-slate-800 p-3 text-[9px] text-slate-400">{JSON.stringify(row, null, 2)}</pre>
                        <div className="flex justify-end gap-2 border-t border-slate-800 px-3 py-2">
                          <Button size="sm" variant="outline" className="h-7 border-slate-700 px-2 text-[9px]" onClick={() => beginUpdate(row)} disabled={!primaryKey}>Edit</Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-[9px] text-rose-300" onClick={() => void deleteRow(row)} disabled={!primaryKey || busy}><Trash2 className="mr-1 h-3 w-3" /> Delete</Button>
                        </div>
                      </details>
                    ))}
                    {!rows.length && <p className="py-8 text-center text-[10px] text-slate-600">{busy ? "Loading rows…" : "No rows found."}</p>}
                  </div>
                </>
              ) : <div className="p-8 text-center text-xs text-slate-500">{busy ? "Loading tables…" : "Choose a table to inspect its rows."}</div>}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
