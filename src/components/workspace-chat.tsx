import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Hash, Loader2, Lock, Plus, Send, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type WorkspaceGroup = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  created_at: string;
};

type WorkspaceMessage = {
  id: string;
  body: string;
  user_id: string;
  created_at: string;
  profiles: { username: string; display_name: string | null; avatar_url: string | null } | null;
};

export const GROUP_CATEGORIES = [
  "general",
  "map editors",
  "sound editors",
  "game dev",
  "web dev",
  "design",
  "testing",
  "releases",
] as const;

export function WorkspaceChat() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("general");
  const [description, setDescription] = useState("");

  const {
    data: groups = [],
    isLoading: groupsLoading,
    isError: groupsError,
    refetch: refetchGroups,
  } = useQuery({
    queryKey: ["workspace-groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_groups")
        .select("id, name, description, category, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as WorkspaceGroup[];
    },
  });

  const activeGroup = groups.find((group) => group.id === activeId) ?? groups[0] ?? null;

  useEffect(() => {
    if (!activeGroup?.id) return;
    const channel = supabase
      .channel("workspace-live-" + activeGroup.id)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "workspace_messages",
          filter: "group_id=eq." + activeGroup.id,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: ["workspace-messages", activeGroup.id],
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeGroup?.id, queryClient]);

  const {
    data: messages = [],
    isLoading: messagesLoading,
    isError: messagesError,
    refetch: refetchMessages,
  } = useQuery({
    queryKey: ["workspace-messages", activeGroup?.id],
    enabled: Boolean(activeGroup),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_messages")
        .select("id, body, user_id, created_at, profiles(username, display_name, avatar_url)")
        .eq("group_id", activeGroup!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as unknown as WorkspaceMessage[];
    },
  });

  const createGroup = useMutation({
    mutationFn: async () => {
      if (name.trim().length < 2) throw new Error("Give the group a name.");
      const { error } = await supabase.from("workspace_groups").insert({
        name: name.trim().slice(0, 80),
        category,
        description: description.trim() ? description.trim().slice(0, 400) : null,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Group created");
      setName("");
      setDescription("");
      setCreating(false);
      void queryClient.invalidateQueries({ queryKey: ["workspace-groups"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeGroup = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("workspace_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setActiveId(null);
      void queryClient.invalidateQueries({ queryKey: ["workspace-groups"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const send = useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase
        .from("workspace_messages")
        .insert({ group_id: activeGroup!.id, user_id: user!.id, body: body.slice(0, 4000) });
      if (error) throw error;
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["workspace-messages", activeGroup?.id] }),
    onError: (error: Error, body: string) => {
      setDraft(body);
      toast.error(error.message);
    },
  });

  const removeMessage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("workspace_messages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["workspace-messages", activeGroup?.id] }),
    onError: (error: Error) => toast.error(error.message),
  });

  function submit() {
    const body = draft.trim();
    if (!body || !activeGroup || send.isPending) return;
    setDraft("");
    send.mutate(body);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <Card className="glow-panel gap-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Groups</h2>
          {isAdmin && (
            <Button
              size="icon"
              variant="ghost"
              aria-label="New group"
              onClick={() => setCreating((v) => !v)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>

        {creating && isAdmin && (
          <div className="animate-rise space-y-2 rounded-lg border border-border bg-secondary/40 p-3">
            <div className="space-y-1">
              <Label htmlFor="group-name" className="text-xs">
                Name
              </Label>
              <Input
                id="group-name"
                value={name}
                placeholder="Map editors"
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="group-category" className="text-xs">
                Category
              </Label>
              <select
                id="group-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm capitalize"
              >
                {GROUP_CATEGORIES.map((option) => (
                  <option key={option} value={option} className="capitalize">
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="group-desc" className="text-xs">
                Purpose
              </Label>
              <Textarea
                id="group-desc"
                rows={2}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <Button
              size="sm"
              className="w-full"
              onClick={() => createGroup.mutate()}
              disabled={createGroup.isPending}
            >
              Create group
            </Button>
          </div>
        )}

        <div className="space-y-1">
          {groupsLoading && <p className="text-sm text-muted-foreground">Loading groups…</p>}
          {groupsError && (
            <div role="alert" className="space-y-2 rounded-lg border border-destructive/30 p-3">
              <p className="text-xs text-destructive">Could not load workspace groups.</p>
              <Button size="sm" variant="outline" onClick={() => void refetchGroups()}>
                Retry
              </Button>
            </div>
          )}
          {!groupsLoading && !groupsError && !groups.length && (
            <p className="text-sm text-muted-foreground">
              {isAdmin ? "Create your first group — e.g. Map editors." : "No groups yet."}
            </p>
          )}
          {groups.map((group) => (
            <div key={group.id} className="group flex items-center gap-1">
              <button
                onClick={() => setActiveId(group.id)}
                className={cn(
                  "flex-1 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-secondary",
                  activeGroup?.id === group.id && "bg-secondary text-foreground",
                )}
              >
                <span className="flex items-center gap-2">
                  <Hash className="h-3.5 w-3.5 text-primary" />
                  <span className="truncate">{group.name}</span>
                </span>
                <span className="mt-0.5 block truncate pl-5 text-xs capitalize text-muted-foreground">
                  {group.category}
                </span>
              </button>
              {isAdmin && (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Delete ${group.name}`}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => removeGroup.mutate(group.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card className="glow-panel flex h-[70vh] flex-col overflow-hidden p-0">
        {activeGroup ? (
          <>
            <div className="border-b border-border/70 px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Hash className="h-4 w-4 text-primary" /> {activeGroup.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {activeGroup.description || `${activeGroup.category} workspace channel`}
              </p>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messagesLoading && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading messages…
                </p>
              )}
              {messagesError && (
                <div
                  role="alert"
                  className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 p-3"
                >
                  <p className="text-xs text-destructive">Could not load messages.</p>
                  <Button size="sm" variant="outline" onClick={() => void refetchMessages()}>
                    Retry
                  </Button>
                </div>
              )}
              {!messagesLoading && !messagesError && !messages.length && (
                <p className="text-sm text-muted-foreground">
                  No messages yet — start the discussion.
                </p>
              )}
              {messages.map((message) => {
                const mine = message.user_id === user?.id;
                return (
                  <div
                    key={message.id}
                    className={cn("flex", mine ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[78%] rounded-2xl px-4 py-2",
                        mine
                          ? "bg-primary text-primary-foreground"
                          : "border border-border bg-secondary",
                      )}
                    >
                      {!mine && (
                        <p className="text-xs font-semibold text-primary">
                          {message.profiles?.display_name || message.profiles?.username || "Member"}
                        </p>
                      )}
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>
                      <div className="mt-1 flex items-center gap-2 text-[10px] opacity-70">
                        <span>{formatDate(message.created_at)}</span>
                        {(mine || isAdmin) && (
                          <button
                            onClick={() => removeMessage.mutate(message.id)}
                            className="underline"
                          >
                            delete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-end gap-2 border-t border-border/70 p-3">
              <Textarea
                rows={1}
                value={draft}
                placeholder={`Message #${activeGroup.name}`}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submit();
                  }
                }}
                className="min-h-10 resize-none"
              />
              <Button onClick={submit} disabled={send.isPending} aria-label="Send message">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </>
        ) : (
          <div className="grid flex-1 place-items-center p-8 text-center">
            <div>
              <Lock className="mx-auto h-7 w-7 text-primary" />
              <p className="mt-2 text-sm text-muted-foreground">Pick a group to open its chat.</p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
