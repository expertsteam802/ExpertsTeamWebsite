import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  ArrowLeft,
  Check,
  ImagePlus,
  MessageCircle,
  Search,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/layout/page-shell";
import { SiteHeader } from "@/components/layout/site-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/messages")({
  head: () => ({
    meta: [
      { title: "Messages — ExpertsTeam" },
      {
        name: "description",
        content: "Private, real-time conversations with the ExpertsTeam community.",
      },
    ],
  }),
  component: MessagesPage,
});

type Person = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};
type Member = {
  user_id: string;
  last_read_at: string;
  profiles: Person | null;
};
type Conversation = {
  id: string;
  pair_key: string;
  last_message_at: string;
  direct_conversation_members: Member[];
};
type DirectMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  media_path: string | null;
  media_url: string | null;
  created_at: string;
};
type DirectMessagePreview = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  media_path: string | null;
  created_at: string;
};

function personName(person?: Person | null) {
  return person?.display_name || person?.username || "Community member";
}
function initials(value: string) {
  return value.trim().slice(0, 1).toUpperCase() || "E";
}
function shortTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  const now = new Date();
  return date.toDateString() === now.toDateString()
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function MessagesPage() {
  const { user, profile } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState("");
  const [typing, setTyping] = useState(false);
  const [onlineIds, setOnlineIds] = useState<string[]>([]);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["direct-conversations", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("direct_conversations")
        .select(
          "id,pair_key,last_message_at,direct_conversation_members(user_id,last_read_at,profiles:profiles!direct_conversation_members_user_id_fkey(id,username,display_name,avatar_url))",
        )
        .order("last_message_at", { ascending: false });
      if (error) throw error;
      const { data: hiddenRows, error: hiddenError } = await supabase
        .from("direct_conversation_hidden")
        .select("conversation_id")
        .eq("user_id", user!.id);
      if (hiddenError) throw hiddenError;
      const hiddenIds = new Set((hiddenRows ?? []).map((row) => row.conversation_id));
      return ((data ?? []) as Conversation[]).filter((conversation) => !hiddenIds.has(conversation.id));
    },
  });

  const activeConversation =
    conversations.find((item) => item.id === activeId) ?? conversations[0] ?? null;
  const otherMember = activeConversation?.direct_conversation_members.find(
    (item) => item.user_id !== user?.id,
  );
  const recipient = otherMember?.profiles ?? null;
  const activeConversationId = activeConversation?.id ?? null;

  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ["direct-messages", activeConversation?.id],
    enabled: Boolean(activeConversation?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("direct_messages")
        .select("id,conversation_id,sender_id,body,media_path,created_at")
        .eq("conversation_id", activeConversation!.id)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      const newestFirst = (data ?? []) as Omit<DirectMessage, "media_url">[];
      const withSignedMedia = await Promise.all(
        newestFirst.map(async (message) => {
          if (!message.media_path) return { ...message, media_url: null };
          const { data: signed, error: signedError } = await supabase.storage
            .from("direct-messages")
            .createSignedUrl(message.media_path, 60 * 60);
          return { ...message, media_url: signedError ? null : (signed?.signedUrl ?? null) };
        }),
      );
      return withSignedMedia.reverse() as DirectMessage[];
    },
  });

  const { data: people = [], isFetching: peopleLoading } = useQuery({
    queryKey: ["message-people", search],
    enabled: Boolean(user && peopleOpen && search.trim().length >= 2),
    queryFn: async () => {
      const term = search
        .trim()
        .replace(/[%,()]/g, " ")
        .slice(0, 50);
      const { data, error } = await supabase
        .from("profiles")
        .select("id,username,display_name,avatar_url")
        .neq("id", user!.id)
        .or("username.ilike.%" + term + "%,display_name.ilike.%" + term + "%")
        .limit(10);
      if (error) throw error;
      return (data ?? []) as Person[];
    },
  });

  useEffect(() => {
    if (!userId) return;
    const inboxChannel = supabase
      .channel("direct-inbox-" + userId)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "direct_messages" },
        (payload) => {
          const row = (payload.new ?? payload.old) as { conversation_id?: string } | undefined;
          void queryClient.invalidateQueries({ queryKey: ["direct-conversations", userId] });
          void queryClient.invalidateQueries({ queryKey: ["direct-message-previews", userId] });
          if (row?.conversation_id) {
            void queryClient.invalidateQueries({
              queryKey: ["direct-messages", row.conversation_id],
            });
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(inboxChannel);
    };
  }, [userId, queryClient]);

  const conversationIds = conversations.map((conversation) => conversation.id);
  const { data: previews = [] } = useQuery({
    queryKey: ["direct-message-previews", user?.id, conversationIds.join(",")],
    enabled: conversationIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("direct_messages")
        .select("id,conversation_id,sender_id,body,media_path,created_at")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: false })
        .limit(Math.min(500, conversationIds.length * 20));
      if (error) throw error;
      return (data ?? []) as DirectMessagePreview[];
    },
  });
  const previewByConversation = useMemo(() => {
    const map = new Map<string, DirectMessagePreview>();
    for (const message of previews)
      if (!map.has(message.conversation_id)) map.set(message.conversation_id, message);
    return map;
  }, [previews]);

  useEffect(() => {
    if (!userId) return;
    const presenceChannel = supabase.channel("expertsteam-live-presence", {
      config: { presence: { key: userId } },
    });
    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState() as Record<string, { user_id?: string }[]>;
        setOnlineIds(
          Object.values(state)
            .flat()
            .map((entry) => entry.user_id ?? "")
            .filter((id) => id && id !== userId),
        );
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({ user_id: userId, online_at: new Date().toISOString() });
        }
      });
    return () => {
      setOnlineIds([]);
      void supabase.removeChannel(presenceChannel);
    };
  }, [userId]);

  useEffect(() => {
    if (!activeConversation?.id || !userId) return;
    const channel = supabase.channel("direct-chat-" + activeConversation.id, {
      config: { broadcast: { self: false } },
    });
    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "direct_messages",
          filter: "conversation_id=eq." + activeConversation.id,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: ["direct-messages", activeConversation.id],
          });
          void queryClient.invalidateQueries({ queryKey: ["direct-conversations", userId] });
        },
      )
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload?.user_id !== userId) setTyping(Boolean(payload?.typing));
      })
      .subscribe();
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      setTyping(false);
      void supabase.removeChannel(channel);
    };
  }, [activeConversation?.id, userId, queryClient]);

  useEffect(() => {
    if (!activeConversationId || !userId) return;
    void supabase
      .from("direct_conversation_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", activeConversationId)
      .eq("user_id", userId);
  }, [activeConversationId, userId, messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, typing]);

  useEffect(() => {
    return () => {
      if (attachmentPreview) URL.revokeObjectURL(attachmentPreview);
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, [attachmentPreview]);

  const sendMessage = useMutation({
    mutationFn: async () => {
      if (!user || !activeConversation) throw new Error("Choose a conversation first.");
      let media_path: string | null = null;
      if (attachment) {
        const path =
          activeConversation.id +
          "/" +
          user.id +
          "/" +
          crypto.randomUUID() +
          "-" +
          attachment.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-70);
        const { error: uploadError } = await supabase.storage
          .from("direct-messages")
          .upload(path, attachment, {
            cacheControl: "3600",
            upsert: false,
            contentType: attachment.type,
          });
        if (uploadError) throw uploadError;
        media_path = path;
      }
      const body = draft.trim();
      if (!body && !media_path) throw new Error("Write a message or attach a photo.");
      const { error } = await supabase.from("direct_messages").insert({
        conversation_id: activeConversation.id,
        sender_id: user.id,
        body,
        media_path,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDraft("");
      setAttachment(null);
      setAttachmentPreview("");
      void queryClient.invalidateQueries({ queryKey: ["direct-messages", activeConversation?.id] });
      void queryClient.invalidateQueries({ queryKey: ["direct-conversations", user?.id] });
      void queryClient.invalidateQueries({ queryKey: ["direct-message-previews", user?.id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const unsendMessage = useMutation({
    mutationFn: async (message: DirectMessage) => {
      if (!user || message.sender_id !== user.id) throw new Error("You can only unsend your own messages.");
      const { error } = await supabase
        .from("direct_messages")
        .delete()
        .eq("id", message.id)
        .eq("sender_id", user.id);
      if (error) throw error;
      if (message.media_path) {
        await supabase.storage.from("direct-messages").remove([message.media_path]);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["direct-messages", activeConversation?.id] });
      void queryClient.invalidateQueries({ queryKey: ["direct-conversations", user?.id] });
      void queryClient.invalidateQueries({ queryKey: ["direct-message-previews", user?.id] });
      toast.success("Message unsent");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteConversation = useMutation({
    mutationFn: async (conversationId: string) => {
      if (!user) throw new Error("Sign in to delete a conversation.");
      const { error } = await supabase.from("direct_conversation_hidden").insert({
        conversation_id: conversationId,
        user_id: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setActiveId(null);
      setMobileChatOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["direct-conversations", user?.id] });
      void queryClient.invalidateQueries({ queryKey: ["direct-message-previews", user?.id] });
      toast.success("Chat removed from your inbox");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function startConversation(person: Person) {
    if (!user) return;
    const pairKey = [user.id, person.id].sort().join(":");
    try {
      const { data: existingConversation, error } = await supabase
        .from("direct_conversations")
        .select("id")
        .eq("pair_key", pairKey)
        .maybeSingle();
      if (error) throw error;
      let conversation = existingConversation;
      if (!conversation) {
        const created = await supabase
          .from("direct_conversations")
          .insert({ pair_key: pairKey, created_by: user.id })
          .select("id")
          .single();
        if (created.error) {
          if (created.error.code !== "23505") throw created.error;
          const retry = await supabase
            .from("direct_conversations")
            .select("id")
            .eq("pair_key", pairKey)
            .single();
          if (retry.error) throw retry.error;
          conversation = retry.data;
        } else conversation = created.data;
        const { error: memberError } = await supabase.from("direct_conversation_members").insert([
          { conversation_id: conversation.id, user_id: user.id },
          { conversation_id: conversation.id, user_id: person.id },
        ]);
        if (memberError && memberError.code !== "23505") throw memberError;
      }
      await queryClient.invalidateQueries({ queryKey: ["direct-conversations", user.id] });
      setActiveId(conversation.id);
      setMobileChatOpen(true);
      setPeopleOpen(false);
      setSearch("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start this conversation.");
    }
  }

  function updateDraft(value: string) {
    setDraft(value);
    if (!activeConversation || !user) return;
    void channelRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { user_id: user.id, typing: Boolean(value.trim()) },
    });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      void channelRef.current?.send({
        type: "broadcast",
        event: "typing",
        payload: { user_id: user.id, typing: false },
      });
    }, 1800);
  }

  function chooseAttachment(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) {
      toast.error("Choose an image up to 8 MB.");
      return;
    }
    if (attachmentPreview) URL.revokeObjectURL(attachmentPreview);
    setAttachment(file);
    setAttachmentPreview(URL.createObjectURL(file));
  }

  const visibleConversations = conversations.filter((conversation) => {
    const person = conversation.direct_conversation_members.find(
      (member) => member.user_id !== user?.id,
    )?.profiles;
    return (
      personName(person).toLowerCase().includes(search.toLowerCase()) ||
      (person?.username ?? "").toLowerCase().includes(search.toLowerCase())
    );
  });

  if (!user) {
    return (
      <PageShell>
        <div className="mx-auto max-w-lg px-4 py-24 text-center">
          <MessageCircle className="mx-auto h-12 w-12 text-primary" />
          <h1 className="mt-4 text-2xl font-bold">Your messages</h1>
          <p className="mt-2 text-muted-foreground">
            Sign in to start private conversations with the ExpertsTeam community.
          </p>
          <a
            href="/auth"
            className="mt-5 inline-flex rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground"
          >
            Sign in
          </a>
        </div>
      </PageShell>
    );
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
      <SiteHeader />
      <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col overflow-hidden px-3 py-3 sm:px-5 lg:px-8">
        <div className="mb-3 flex shrink-0 items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
              Stay connected
            </p>
            <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Messages</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Private conversations, live presence and instant replies.
            </p>
            <p className="mt-2 inline-flex items-center gap-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {onlineIds.length} {onlineIds.length === 1 ? "developer" : "developers"} active now
            </p>
          </div>
          <Button
            onClick={() => {
              setPeopleOpen((open) => !open);
              setSearch("");
            }}
            className="rounded-xl"
          >
            <MessageCircle className="mr-2 h-4 w-4" /> New message
          </Button>
        </div>

        <section className="grid min-h-0 flex-1 overflow-hidden rounded-3xl border border-border/70 bg-card shadow-2xl shadow-black/5 md:grid-cols-[320px_minmax(0,1fr)]">
          <aside
            className={`flex min-h-0 flex-col overflow-hidden border-r border-border/70 bg-background/70 ${mobileChatOpen ? "hidden md:flex" : "flex"}`}
          >
            <div className="border-b border-border/70 p-4">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Avatar className="h-9 w-9 ring-2 ring-primary/20">
                    <AvatarImage src={profile?.avatar_url ?? undefined} />
                    <AvatarFallback>
                      {initials(profile?.display_name || profile?.username || "E")}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold">
                      {profile?.display_name || profile?.username || "Your inbox"}
                    </p>
                    <p className="text-xs text-muted-foreground">Your inbox</p>
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="New message"
                  onClick={() => {
                    setPeopleOpen((open) => !open);
                    setSearch("");
                  }}
                >
                  <Sparkles className="h-4 w-4" />
                </Button>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={peopleOpen ? "Find people by name…" : "Search messages"}
                  className="h-10 rounded-xl pl-9"
                />
              </div>
              {peopleOpen && (
                <div className="mt-3 space-y-1">
                  <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Start a conversation
                  </p>
                  {peopleLoading && (
                    <p className="p-3 text-xs text-muted-foreground">Searching people…</p>
                  )}
                  {!peopleLoading && search.trim().length >= 2 && people.length === 0 && (
                    <p className="p-3 text-xs text-muted-foreground">No matching members found.</p>
                  )}
                  {people.map((person) => (
                    <button
                      key={person.id}
                      onClick={() => void startConversation(person)}
                      className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-secondary"
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={person.avatar_url ?? undefined} />
                        <AvatarFallback>{initials(personName(person))}</AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {personName(person)}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          @{person.username || "member"}
                        </span>
                      </span>
                      <MessageCircle className="h-4 w-4 text-primary" />
                    </button>
                  ))}
                  {search.trim().length < 2 && (
                    <p className="p-2 text-xs text-muted-foreground">
                      Type at least two characters to find a member.
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between px-4 pb-2 pt-4">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Recent chats
              </span>
              <span className="text-xs text-muted-foreground">{conversations.length}</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
              {isLoading && (
                <div className="space-y-3 p-3">
                  <div className="h-12 animate-pulse rounded-xl bg-secondary" />
                  <div className="h-12 animate-pulse rounded-xl bg-secondary" />
                </div>
              )}
              {!isLoading && visibleConversations.length === 0 && (
                <div className="px-5 py-10 text-center">
                  <MessageCircle className="mx-auto h-8 w-8 text-muted-foreground/50" />
                  <p className="mt-3 text-sm font-semibold">No conversations yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Start a chat with someone in the community.
                  </p>
                </div>
              )}
              {visibleConversations.map((conversation) => {
                const member = conversation.direct_conversation_members.find(
                  (item) => item.user_id !== user.id,
                );
                const selfMember = conversation.direct_conversation_members.find(
                  (item) => item.user_id === user.id,
                );
                const person = member?.profiles;
                const latest = previewByConversation.get(conversation.id);
                const unread =
                  latest &&
                  latest.sender_id !== user.id &&
                  new Date(latest.created_at) > new Date(selfMember?.last_read_at ?? 0);
                return (
                  <button
                    key={conversation.id}
                    onClick={() => {
                      setActiveId(conversation.id);
                      setMobileChatOpen(true);
                    }}
                    className={`mb-1 flex w-full items-center gap-3 rounded-2xl p-3 text-left transition ${conversation.id === activeConversation?.id ? "bg-primary/10 ring-1 ring-primary/20" : "hover:bg-secondary/70"}`}
                  >
                    <div className="relative shrink-0">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={person?.avatar_url ?? undefined} />
                        <AvatarFallback>{initials(personName(person))}</AvatarFallback>
                      </Avatar>
                      {onlineIds.includes(person?.id ?? "") && (
                        <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-background bg-emerald-500" />
                      )}
                    </div>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{personName(person)}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {shortTime(conversation.last_message_at)}
                        </span>
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        {latest ? latest.body || "Photo" : "Start a conversation"}
                      </span>
                    </span>
                    {unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />}
                  </button>
                );
              })}
            </div>
          </aside>

          <div
            className={`flex min-h-0 min-w-0 flex-col overflow-hidden bg-gradient-to-b from-background to-secondary/20 ${mobileChatOpen ? "flex" : "hidden md:flex"}`}
          >
            {activeConversation && recipient ? (
              <>
                <header className="flex h-[76px] shrink-0 items-center justify-between border-b border-border/70 bg-background/70 px-4 backdrop-blur">
                  <div className="flex min-w-0 items-center gap-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="md:hidden"
                      aria-label="Back to inbox"
                      onClick={() => setMobileChatOpen(false)}
                    >
                      <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <Avatar className="h-11 w-11">
                      <AvatarImage src={recipient.avatar_url ?? undefined} />
                      <AvatarFallback>{initials(personName(recipient))}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{personName(recipient)}</p>
                      <p className="text-xs text-muted-foreground">
                        {onlineIds.includes(recipient.id)
                          ? "Active now"
                          : typing
                            ? "Typing…"
                            : "ExpertsTeam member"}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete chat"
                    title="Remove chat from your inbox"
                    onClick={() => deleteConversation.mutate(activeConversation.id)}
                    disabled={deleteConversation.isPending}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </header>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-5 sm:px-7">
                  <div className="mb-7 text-center">
                    <Avatar className="mx-auto h-16 w-16">
                      <AvatarImage src={recipient.avatar_url ?? undefined} />
                      <AvatarFallback>{initials(personName(recipient))}</AvatarFallback>
                    </Avatar>
                    <p className="mt-3 font-semibold">{personName(recipient)}</p>
                    <p className="text-xs text-muted-foreground">
                      @{recipient.username || "member"} · ExpertsTeam
                    </p>
                  </div>
                  {messagesLoading && (
                    <p className="text-center text-xs text-muted-foreground">
                      Loading conversation…
                    </p>
                  )}
                  {!messagesLoading && messages.length === 0 && (
                    <div className="mx-auto max-w-xs rounded-2xl border border-border/70 bg-card p-5 text-center">
                      <Sparkles className="mx-auto h-6 w-6 text-primary" />
                      <p className="mt-2 text-sm font-semibold">Say hello</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        This is the beginning of your conversation. Send a message or share a photo.
                      </p>
                    </div>
                  )}
                  {messages.map((message) => {
                    const mine = message.sender_id === user.id;
                    return (
                      <div
                        key={message.id}
                        className={`flex ${mine ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[min(82%,520px)] rounded-3xl px-4 py-3 shadow-sm ${mine ? "rounded-br-md bg-gradient-to-br from-primary to-primary/80 text-primary-foreground" : "rounded-bl-md border border-border/70 bg-card"}`}
                        >
                          {message.media_url && (
                            <a href={message.media_url} target="_blank" rel="noreferrer">
                              <img
                                src={message.media_url}
                                alt="Shared attachment"
                                className="mb-2 max-h-80 rounded-2xl object-cover"
                              />
                            </a>
                          )}
                          {message.body && (
                            <p className="whitespace-pre-wrap break-words text-sm leading-6">
                              {message.body}
                            </p>
                          )}
                          <div className="mt-1 flex items-center justify-end gap-2">
                            <span className={`flex items-center gap-1 text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                              {shortTime(message.created_at)} {mine && <Check className="h-3 w-3" />}
                            </span>
                            {mine && (
                              <button
                                type="button"
                                aria-label="Unsend message"
                                title="Unsend message"
                                onClick={() => unsendMessage.mutate(message)}
                                disabled={unsendMessage.isPending}
                                className="rounded p-1 opacity-70 transition hover:bg-black/10 hover:opacity-100"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {typing && (
                    <div className="flex">
                      <div className="rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
                        Typing…
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!sendMessage.isPending) sendMessage.mutate();
                  }}
                  className="border-t border-border/70 bg-background/80 p-3 sm:p-4"
                >
                  {attachmentPreview && (
                    <div className="mb-3 flex items-center gap-3 rounded-xl border border-border bg-card p-2">
                      <img
                        src={attachmentPreview}
                        alt="Attachment preview"
                        className="h-14 w-14 rounded-lg object-cover"
                      />
                      <span className="min-w-0 flex-1 truncate text-xs">{attachment?.name}</span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setAttachment(null);
                          setAttachmentPreview("");
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  <div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-inner">
                    <label
                      className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-xl text-muted-foreground transition hover:bg-secondary hover:text-primary"
                      title="Attach photo"
                    >
                      <ImagePlus className="h-5 w-5" />
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="sr-only"
                        onChange={(event) => chooseAttachment(event.target.files?.[0])}
                      />
                    </label>
                    <textarea
                      value={draft}
                      onChange={(event) => updateDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          if (!sendMessage.isPending) sendMessage.mutate();
                        }
                      }}
                      rows={1}
                      maxLength={5000}
                      placeholder="Message…"
                      className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
                    />
                    <Button
                      type="submit"
                      size="icon"
                      disabled={sendMessage.isPending || (!draft.trim() && !attachment)}
                      className="h-10 w-10 shrink-0 rounded-xl"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="mt-2 px-2 text-[10px] text-muted-foreground">
                    Enter to send · Shift + Enter for a new line
                  </p>
                </form>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                <div className="grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-primary/20 to-violet-500/10 text-primary ring-1 ring-primary/15">
                  <MessageCircle className="h-9 w-9" />
                </div>
                <h2 className="mt-5 text-xl font-bold">Your conversations, together</h2>
                <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                  Choose a conversation or start a new one with a creator, learner or builder from
                  the community.
                </p>
                <Button
                  className="mt-5 rounded-xl"
                  onClick={() => {
                    setPeopleOpen(true);
                    setSearch("");
                  }}
                >
                  <Sparkles className="mr-2 h-4 w-4" /> Start a conversation
                </Button>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
