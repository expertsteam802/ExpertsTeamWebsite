import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Check, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Template = Tables<"agent_prompt_templates">;

export function AgentPromptLibrary({
  currentPrompt,
  onUse,
}: {
  currentPrompt: string;
  onUse: (prompt: string) => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");

  const templates = useQuery({
    queryKey: ["agent-prompt-templates", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_prompt_templates")
        .select("*")
        .order("is_favorite", { ascending: false })
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Template[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in to save prompts.");
      if (title.trim().length < 2) throw new Error("Give this prompt a name.");
      if (!currentPrompt.trim()) throw new Error("Write a prompt before saving it.");
      const { error } = await supabase.from("agent_prompt_templates").insert({
        user_id: user.id,
        title: title.trim().slice(0, 100),
        prompt: currentPrompt.trim().slice(0, 20_000),
        category: "custom",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setTitle("");
      toast.success("Prompt saved to your library.");
      void queryClient.invalidateQueries({ queryKey: ["agent-prompt-templates", user?.id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("agent_prompt_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved prompt deleted.");
      void queryClient.invalidateQueries({ queryKey: ["agent-prompt-templates", user?.id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleFavorite = useMutation({
    mutationFn: async (template: Template) => {
      const { error } = await supabase
        .from("agent_prompt_templates")
        .update({ is_favorite: !template.is_favorite, updated_at: new Date().toISOString() })
        .eq("id", template.id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["agent-prompt-templates", user?.id] }),
    onError: (error: Error) => toast.error(error.message),
  });

  if (!user) return null;

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((value) => !value)} disabled={save.isPending} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-2 text-[10px] text-slate-400 transition hover:bg-white/5 hover:text-white">
        <Bookmark className="h-3.5 w-3.5" /> Saved prompts {templates.data?.length ? `(${templates.data.length})` : ""}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-[min(340px,calc(100vw-48px))] rounded-2xl border border-white/10 bg-[#0b1727] p-3 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <div><p className="text-xs font-semibold text-white">Prompt library</p><p className="mt-0.5 text-[10px] text-slate-500">Your reusable agent instructions</p></div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 text-slate-500 hover:bg-white/5 hover:text-white" aria-label="Close prompt library"><X className="h-4 w-4" /></button>
          </div>
          <div className="mb-3 flex gap-2">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Name this prompt…" className="h-8 min-w-0 border-white/10 bg-white/5 text-xs text-white placeholder:text-slate-600" />
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || !currentPrompt.trim() || title.trim().length < 2} className="h-8 shrink-0 px-2"><Plus className="h-3.5 w-3.5" /> Save</Button>
          </div>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {templates.isLoading ? <p className="py-3 text-center text-[10px] text-slate-500">Loading saved prompts…</p> :
              templates.data?.length ? templates.data.map((template) => (
                <div key={template.id} className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><p className="truncate text-[11px] font-semibold text-slate-200">{template.title}</p><p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[10px] leading-4 text-slate-500">{template.prompt}</p></div>
                    <button type="button" onClick={() => toggleFavorite.mutate(template)} className={template.is_favorite ? "rounded-md p-1 text-amber-300" : "rounded-md p-1 text-slate-600 hover:text-amber-300"} title={template.is_favorite ? "Remove favorite" : "Add favorite"}><Check className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <button type="button" onClick={() => { onUse(template.prompt); setOpen(false); }} className="rounded-lg bg-cyan-400/10 px-2.5 py-1.5 text-[10px] font-semibold text-cyan-200 hover:bg-cyan-400/20">Use prompt</button>
                    <button type="button" onClick={() => { if (window.confirm("Delete this saved prompt?")) remove.mutate(template.id); }} className="rounded-md p-1.5 text-slate-600 hover:bg-red-400/10 hover:text-red-300" aria-label={`Delete ${template.title}`}><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              )) : <p className="py-4 text-center text-[10px] text-slate-500">No saved prompts yet. Save a useful instruction above.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
