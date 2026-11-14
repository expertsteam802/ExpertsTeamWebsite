import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Hash, Loader2, Lock, Mic, Plus, Search, Send, Square, Trash2, Video, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
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
  media_path: string | null;
  media_mime_type: string | null;
  media_size_bytes: number;
  media_url: string | null;
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
  const [groupSearch, setGroupSearch] = useState("");
  const [recording, setRecording] = useState(false);
  const [voiceNote, setVoiceNote] = useState<File | null>(null);
  const [voiceNotePreview, setVoiceNotePreview] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);

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
  const visibleGroups = groups.filter((group) =>
    `${group.name} ${group.category} ${group.description ?? ""}`
      .toLowerCase()
      .includes(groupSearch.toLowerCase()),
  );

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
        .select("id, body, user_id, created_at, media_path, media_mime_type, media_size_bytes, profiles(username, display_name, avatar_url)")
        .eq("group_id", activeGroup!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return Promise.all((data ?? []).map(async (row) => {
        if (!row.media_path) return { ...row, media_url: null };
        const { data: signed, error: signedError } = await supabase.storage
          .from("workspace-media")
          .createSignedUrl(row.media_path, 60 * 60);
        return { ...row, media_url: signedError ? null : (signed?.signedUrl ?? null) };
      })) as unknown as WorkspaceMessage[];
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
    mutationFn: async ({ body, audio }: { body: string; audio: File | null }) => {
      if (!user || !activeGroup) throw new Error("Choose a developer workspace first.");
      let mediaPath: string | null = null;
      const audioMimeType = audio?.type.split(";")[0] || "audio/webm";
      if (audio) {
        mediaPath = user.id + "/" + activeGroup.id + "/" + crypto.randomUUID() + "-" + audio.name.replace(/[^a-zA-Z0-9._-]/g, "-");
        const { error: uploadError } = await supabase.storage.from("workspace-media").upload(mediaPath, audio, {
          cacheControl: "60",
          upsert: false,
          contentType: audioMimeType,
        });
        if (uploadError) throw uploadError;
        const { data: signed, error: verifyError } = await supabase.storage.from("workspace-media").createSignedUrl(mediaPath, 60);
        if (verifyError || !signed?.signedUrl) {
          await supabase.storage.from("workspace-media").remove([mediaPath]);
          throw new Error("The voice note could not be verified in private workspace storage.");
        }
      }
      const { error } = await supabase.from("workspace_messages").insert({
        group_id: activeGroup.id,
        user_id: user.id,
        body: body.slice(0, 4000),
        media_path: mediaPath,
        media_mime_type: audio ? audioMimeType : null,
        media_size_bytes: audio?.size ?? 0,
      });
      if (error) {
        if (mediaPath) await supabase.storage.from("workspace-media").remove([mediaPath]);
        throw error;
      }
    },
    onSuccess: () => {
      setVoiceNote(null);
      if (voiceNotePreview) URL.revokeObjectURL(voiceNotePreview);
      setVoiceNotePreview("");
      void queryClient.invalidateQueries({ queryKey: ["workspace-messages", activeGroup?.id] });
    },
    onError: (error: Error, variables) => {
      setDraft(variables.body);
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
    if ((!body && !voiceNote) || !activeGroup || send.isPending || recording) return;
    setDraft("");
    send.mutate({ body, audio: voiceNote });
  }

  async function startVoiceRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Voice recording is not supported by this browser.");
      return;
    }
    if (voiceNote) {
      toast.error("Send or remove the current voice note first.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const options = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? { mimeType: "audio/webm;codecs=opus" }
        : undefined;
      const recorder = new MediaRecorder(stream, options);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (blob.size > 8 * 1024 * 1024) {
          toast.error("Voice notes must be 8 MB or smaller.");
          stream.getTracks().forEach((track) => track.stop());
          recordingStreamRef.current = null;
          recorderRef.current = null;
          setRecording(false);
          return;
        }
        const extension = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "m4a" : "webm";
        const file = new File([blob], "workspace-voice-" + Date.now() + "." + extension, {
          type: blob.type || "audio/webm",
        });
        if (voiceNotePreview) URL.revokeObjectURL(voiceNotePreview);
        setVoiceNote(file);
        setVoiceNotePreview(URL.createObjectURL(blob));
        stream.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
      };
      recordingStreamRef.current = stream;
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Allow microphone access to record a voice note.");
    }
  }

  function stopVoiceRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  useEffect(() => () => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    if (voiceNotePreview) URL.revokeObjectURL(voiceNotePreview);
  }, [voiceNotePreview]);

  return (
    <div className="grid min-h-[72vh] overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-0">
      <Card className="flex flex-col gap-3 rounded-none border-0 border-r border-border/70 bg-background/80 p-4 shadow-none">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">Messages</h2>
            <p className="text-xs text-muted-foreground">Your live workspaces</p>
          </div>
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

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={groupSearch}
            onChange={(event) => setGroupSearch(event.target.value)}
            placeholder="Search conversations"
            className="h-10 rounded-xl pl-9"
          />
        </div>

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
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
          {visibleGroups.map((group) => (
            <div key={group.id} className="group flex items-center gap-1">
              <button
                onClick={() => setActiveId(group.id)}
                className={cn(
                  "flex-1 rounded-xl px-3 py-3 text-left text-sm transition-colors hover:bg-secondary/80",
                  activeGroup?.id === group.id && "bg-secondary text-foreground",
                )}
              >
                <span className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20 text-primary">
                    <Hash className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{group.name}</span>
                    <span className="mt-1 block truncate text-xs capitalize text-muted-foreground">
                      {group.category}
                    </span>
                  </span>
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

      <Card className="flex min-h-[72vh] flex-col overflow-hidden rounded-none border-0 bg-background p-0 shadow-none">
        {activeGroup ? (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  <Hash className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{activeGroup.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {activeGroup.description || `${activeGroup.category} workspace channel`}
                  </p>
                </div>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                LIVE
              </span>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto bg-secondary/20 px-4 py-5 sm:px-6">
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
                const displayName =
                  message.profiles?.display_name || message.profiles?.username || "Member";
                return (
                  <div
                    key={message.id}
                    className={cn("flex items-end gap-2", mine ? "justify-end" : "justify-start")}
                  >
                    {!mine && (
                      <div className="mb-1 grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-xs font-semibold text-muted-foreground">
                        {message.profiles?.avatar_url ? (
                          <img
                            src={message.profiles.avatar_url}
                            alt={displayName}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          displayName.slice(0, 1).toUpperCase()
                        )}
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[82%] rounded-2xl px-4 py-3 shadow-sm",
                        mine
                          ? "rounded-br-md bg-gradient-to-br from-primary to-primary/85 text-primary-foreground"
                          : "rounded-bl-md border border-border/70 bg-card",
                      )}
                    >
                      {!mine && (
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <p className="text-[11px] font-semibold text-primary">{displayName}</p>
                          {message.profiles?.username && (
                            <a
                              href={"/messages?to=" + encodeURIComponent(message.profiles.username)}
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary/80 hover:underline"
                              title={"Open a private conversation and video call " + displayName}
                            >
                              <Video className="h-3 w-3" /> Message / call
                            </a>
                          )}
                        </div>
                      )}
                      {message.media_url && (
                        <audio controls preload="metadata" src={message.media_url} className="mb-2 max-w-full" />
                      )}
                      {message.body && (
                        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                          {message.body}
                        </p>
                      )}
                      <div className="mt-1 flex items-center justify-end gap-2 text-[10px] opacity-65">
                        <span>
                          {new Date(message.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {(mine || isAdmin) && (
                          <button
                            onClick={() => removeMessage.mutate(message.id)}
                            className="underline underline-offset-2"
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

            <div className="border-t border-border/70 bg-card p-4 sm:px-5">
              {voiceNotePreview && (
                <div className="mb-3 flex items-center gap-3 rounded-xl border border-border bg-secondary/40 p-2">
                  <audio controls src={voiceNotePreview} className="min-w-0 flex-1" />
                  <span className="max-w-32 truncate text-xs text-muted-foreground">{voiceNote?.name}</span>
                  <Button type="button" size="icon" variant="ghost" onClick={() => {
                    setVoiceNote(null);
                    URL.revokeObjectURL(voiceNotePreview);
                    setVoiceNotePreview("");
                  }} aria-label="Remove voice note"><X className="h-4 w-4" /></Button>
                </div>
              )}
              <div className="flex items-end gap-2">
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
                className="min-h-11 resize-none rounded-2xl bg-secondary/50 px-4 py-3"
              />
              <Button
                type="button"
                variant={recording ? "destructive" : "outline"}
                onClick={() => recording ? stopVoiceRecording() : void startVoiceRecording()}
                disabled={send.isPending || Boolean(voiceNote && !recording)}
                aria-label={recording ? "Stop voice note" : "Record voice note"}
                title={recording ? "Stop recording" : "Record voice note"}
                className="h-11 w-11 shrink-0 rounded-full"
              >
                {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
              <Button
                onClick={submit}
                disabled={send.isPending || recording || (!draft.trim() && !voiceNote)}
                aria-label="Send message"
                className="h-11 w-11 shrink-0 rounded-full"
              >
                <Send className="h-4 w-4" />
              </Button>
              </div>
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
