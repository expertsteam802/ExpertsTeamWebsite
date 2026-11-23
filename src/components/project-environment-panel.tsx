import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteProjectEnvironmentVariable,
  listProjectEnvironmentKeys,
  saveProjectEnvironmentVariable,
} from "@/lib/project-secrets.functions";

export function ProjectEnvironmentPanel({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const listKeys = useServerFn(listProjectEnvironmentKeys);
  const saveVariable = useServerFn(saveProjectEnvironmentVariable);
  const deleteVariable = useServerFn(deleteProjectEnvironmentVariable);
  const [key, setKey] = useState("SUPABASE_URL");
  const [value, setValue] = useState("");

  const variables = useQuery({
    queryKey: ["project-environment-keys", projectId],
    enabled: open && Boolean(projectId),
    queryFn: () => listKeys({ data: { projectId: projectId! } }),
  });

  const save = useMutation({
    mutationFn: () => {
      if (!projectId) throw new Error("Save this project before adding environment variables.");
      return saveVariable({ data: { projectId, key: key.trim().toUpperCase(), value } });
    },
    onSuccess: async () => {
      setValue("");
      await queryClient.invalidateQueries({ queryKey: ["project-environment-keys", projectId] });
      toast.success("Encrypted environment variable saved.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (name: string) => {
      if (!projectId) throw new Error("No project is selected.");
      return deleteVariable({ data: { projectId, key: name } });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["project-environment-keys", projectId] });
      toast.success("Environment variable deleted.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary" /> Project environment & connections</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Add credentials belonging to this project. Values are encrypted before storage and are never shown again after saving.
            Only the public Supabase URL and publishable/anon key may use VITE_ names.
          </p>
          <div className="rounded-xl border bg-muted/30 p-3 text-sm">
            <p className="font-medium">Connect your own Supabase project</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY) for your own browser app. These three public values are passed to the Builder preview and static production build. Private keys are encrypted and stored, but are not exposed to browser builds.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div className="space-y-1.5">
              <Label htmlFor="project-env-key">Variable name</Label>
              <Input id="project-env-key" value={key} onChange={(event) => setKey(event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))} placeholder="SUPABASE_URL" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-env-value">Value</Label>
              <Input id="project-env-value" type="password" autoComplete="new-password" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Paste credential or value" />
            </div>
          </div>
          <Button className="w-full" onClick={() => save.mutate()} disabled={!projectId || !key.trim() || !value || save.isPending}>
            <Plus className="mr-2 h-4 w-4" /> {save.isPending ? "Encrypting and saving…" : "Save encrypted variable"}
          </Button>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Saved variables</h3>
              <Button type="button" size="sm" variant="ghost" onClick={() => void variables.refetch()} disabled={variables.isFetching}>Refresh</Button>
            </div>
            {variables.isLoading ? <p className="text-sm text-muted-foreground">Loading saved variable names…</p>
              : variables.isError ? <p className="text-sm text-destructive">Could not load variables. Check the project migration and encryption configuration.</p>
              : variables.data?.variables.length ? variables.data.variables.map((item) => (
                <div key={item.key} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                  <div className="min-w-0"><p className="truncate font-mono text-xs font-semibold">{item.key}</p><p className="text-[11px] text-muted-foreground">Encrypted · value hidden</p></div>
                  <Button type="button" size="icon" variant="ghost" aria-label={"Delete " + item.key} onClick={() => remove.mutate(item.key)} disabled={remove.isPending}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              )) : <p className="text-sm text-muted-foreground">No project variables saved yet.</p>}
          </div>
          <p className="text-[11px] leading-5 text-muted-foreground">
            Security requirement: configure PROJECT_SECRET_ENCRYPTION_KEY as a 32-byte server-only deployment variable and apply the project-secrets migration. Service-role keys must never use VITE_ names.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
