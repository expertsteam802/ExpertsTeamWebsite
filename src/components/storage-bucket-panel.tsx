import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Database, RefreshCw, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { manageSupabaseDatabase } from "@/lib/supabase-database.functions";

type Bucket = { id: string; name: string; public: boolean; file_size_limit: number | null; allowed_mime_types: string[] | null };

export function StorageBucketPanel({ projectRef }: { projectRef: string | null }) {
  const runDatabase = useServerFn(manageSupabaseDatabase);
  const [open, setOpen] = useState(false);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [name, setName] = useState("");
  const [publicBucket, setPublicBucket] = useState(false);
  const [sizeMb, setSizeMb] = useState("5");
  const [mimeTypes, setMimeTypes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadBuckets = useCallback(async () => {
    if (!projectRef) return;
    setBusy(true);
    setError("");
    try {
      const result = await runDatabase({ data: { operation: "buckets", projectRef } });
      setBuckets((result as unknown as { rows: Bucket[] }).rows ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load storage buckets.");
    } finally {
      setBusy(false);
    }
  }, [projectRef, runDatabase]);

  useEffect(() => {
    if (open) void loadBuckets();
  }, [open, loadBuckets]);

  async function createBucket() {
    if (!projectRef) return;
    const limit = Number(sizeMb);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      setError("File size limit must be between 1 and 50 MB.");
      return;
    }
    const types = mimeTypes.split(",").map((value) => value.trim()).filter(Boolean);
    setBusy(true);
    setError("");
    try {
      await runDatabase({
        data: {
          operation: "create_bucket",
          projectRef,
          bucketName: name.trim(),
          bucketPublic: publicBucket,
          bucketFileSizeLimit: limit * 1024 * 1024,
          bucketMimeTypes: types,
        },
      });
      setName("");
      await loadBuckets();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this storage bucket.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="h-7 border-slate-700 px-2 text-[9px]" disabled={!projectRef}>
          <Database className="mr-1 h-3 w-3" /> Storage buckets
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-slate-700 bg-[#0b1320] text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Database className="h-4 w-4 text-cyan-300" /> Supabase Storage buckets</DialogTitle>
          <p className="text-xs text-slate-400">Create and review buckets in the connected Supabase project. Private buckets are recommended for user uploads.</p>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs text-slate-300">Bucket name
              <Input value={name} onChange={(event) => setName(event.target.value.toLowerCase().replace(/\s+/g, "-"))} maxLength={63} placeholder="user-uploads" className="border-slate-700 bg-slate-900 text-white" />
            </label>
            <label className="space-y-1 text-xs text-slate-300">Maximum file size (MB)
              <Input type="number" min="1" max="50" step="1" value={sizeMb} onChange={(event) => setSizeMb(event.target.value)} className="border-slate-700 bg-slate-900 text-white" />
            </label>
            <label className="space-y-1 text-xs text-slate-300 sm:col-span-2">Allowed MIME types (comma separated, optional)
              <Input value={mimeTypes} onChange={(event) => setMimeTypes(event.target.value)} placeholder="image/png, image/jpeg, application/pdf" className="border-slate-700 bg-slate-900 text-white" />
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-300 sm:col-span-2">
              <input type="checkbox" checked={publicBucket} onChange={(event) => setPublicBucket(event.target.checked)} className="accent-cyan-400" />
              Make bucket public (anyone with a file URL can read it)
            </label>
            <div className="sm:col-span-2"><Button type="button" size="sm" onClick={() => void createBucket()} disabled={busy || name.trim().length < 3}><Database className="mr-1 h-3 w-3" /> {busy ? "Saving…" : "Create / update bucket"}</Button></div>
          </div>
          {publicBucket && <p className="text-[10px] text-amber-200">Public buckets bypass read access policies for file downloads. Use this only for assets intended to be public.</p>}
          {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">{error}</p>}
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-200">Existing buckets · {buckets.length}</p>
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-slate-400" onClick={() => void loadBuckets()} disabled={busy}><RefreshCw className={busy ? "mr-1 h-3 w-3 animate-spin" : "mr-1 h-3 w-3"} /> Refresh</Button>
          </div>
          <div className="space-y-2">
            {buckets.map((bucket) => (
              <div key={bucket.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 p-3">
                <div className="min-w-0"><p className="truncate text-xs font-semibold text-white">{bucket.name}</p><p className="mt-1 text-[10px] text-slate-500">{bucket.file_size_limit ? (bucket.file_size_limit / 1048576).toFixed(1) + " MB max" : "Default size limit"} · {bucket.allowed_mime_types?.length ? bucket.allowed_mime_types.join(", ") : "Any file type"}</p></div>
                <span className={bucket.public ? "rounded-full bg-amber-400/10 px-2 py-1 text-[9px] text-amber-200" : "rounded-full bg-emerald-400/10 px-2 py-1 text-[9px] text-emerald-200"}>{bucket.public ? "Public" : <><ShieldCheck className="mr-1 inline h-3 w-3" />Private</>}</span>
              </div>
            ))}
            {!buckets.length && !busy && <p className="rounded-lg border border-dashed border-slate-800 p-4 text-center text-xs text-slate-500">No storage buckets found yet.</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
