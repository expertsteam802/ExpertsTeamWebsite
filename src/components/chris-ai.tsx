import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Copy,
  Home,
  ImagePlus,
  Loader2,
  Minimize2,
  MessageSquare,
  PanelLeftClose,
  Plus,
  Paperclip,
  Send,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { generateExpertImage } from "@/lib/ai.functions";

type ChatRow = {
  id: string;
  role: string;
  content: string;
  created_at: string;
  thread_id?: string;
};
type UploadedFile = {
  name: string;
  mimeType: string;
  dataUrl?: string;
  text?: string;
  size?: number;
};

function MessageBody({ content }: { content: string }) {
  const parts = content.split(/```/);
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <pre
            key={index}
            className="overflow-x-auto rounded-lg border border-border bg-background/80 p-3 text-xs"
          >
            <code>{part.replace(/^[a-zA-Z0-9+#-]*\n/, "")}</code>
          </pre>
        ) : (
          part.trim() && (
            <p key={index} className="whitespace-pre-wrap">
              {part.trim()}
            </p>
          )
        ),
      )}
    </div>
  );
}

function fileToText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const isTextLike =
      file.type.startsWith("text/") ||
      file.name.endsWith(".txt") ||
      file.name.endsWith(".md") ||
      file.name.endsWith(".json") ||
      file.name.endsWith(".csv") ||
      file.name.endsWith(".js") ||
      file.name.endsWith(".ts") ||
      file.name.endsWith(".tsx") ||
      file.name.endsWith(".jsx") ||
      file.name.endsWith(".html") ||
      file.name.endsWith(".css") ||
      file.name.endsWith(".sql") ||
      file.name.endsWith(".yaml") ||
      file.name.endsWith(".yml") ||
      file.name.endsWith(".xml");

    if (!isTextLike) {
      resolve("");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsText(file);
  });
}

async function compressImageForAi(file: File): Promise<UploadedFile> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(`Could not decode ${file.name}.`));
      element.src = objectUrl;
    });
    const scale = Math.min(1, 1280 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image compression is unavailable in this browser.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let quality = 0.76;
    let blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not compress image.")), "image/jpeg", quality),
    );
    while (blob.size > 420_000 && quality > 0.48) {
      quality -= 0.08;
      blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not compress image.")), "image/jpeg", quality),
      );
    }
    if (blob.size > 520_000) throw new Error(`${file.name} is too large after compression.`);
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error(`Could not read compressed ${file.name}.`));
      reader.readAsDataURL(blob);
    });
    return { name: file.name.replace(/\.[^.]+$/, "") + ".jpg", mimeType: "image/jpeg", dataUrl, size: blob.size };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadFileForAi(file: File): Promise<UploadedFile> {
  const textLike =
    file.type.startsWith("text/") ||
    /\.(txt|md|json|csv|js|ts|tsx|jsx|html|css|sql|yaml|yml|xml)$/i.test(file.name);
  if (file.size > (textLike ? 200_000 : 12_000_000)) {
    return Promise.reject(
      new Error(
        `${file.name} is too large. Text files must be under 200 KB and images under 12 MB before compression.`,
      ),
    );
  }
  if (!textLike && !file.type.startsWith("image/")) {
    return Promise.reject(new Error(`${file.name} is not supported. Upload text files or images.`));
  }
  if (textLike) {
    return fileToText(file).then((text) => ({
      name: file.name,
      mimeType: file.type || "text/plain",
      text: text.slice(0, 24_000),
      size: file.size,
    }));
  }
  return compressImageForAi(file);
}

export function ChrisAiChat({
  onMinimize,
}: {
  onMinimize?: () => void;
} = {}) {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const generateImage = useServerFn(generateExpertImage);
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [generatedImage, setGeneratedImage] = useState<{ mimeType: string; data: string } | null>(
    null,
  );
  const [streamingReply, setStreamingReply] = useState("");
  const [guestMessages, setGuestMessages] = useState<ChatRow[]>([]);
  const [guestSessionId] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      const existing = window.localStorage.getItem("experts-team:guest-session");
      if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
      const created = crypto.randomUUID();
      window.localStorage.setItem("experts-team:guest-session", created);
      return created;
    } catch {
      return crypto.randomUUID();
    }
  });
  const [guestCredits, setGuestCredits] = useState(() => {
    if (typeof window === "undefined") return 15;
    try {
      const saved = window.localStorage.getItem(`experts-team:guest-ai-credits:${guestSessionId}`);
      return saved === null ? 15 : Math.max(0, Math.min(15, Number(saved) || 0));
    } catch { return 15; }
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const storageKey = `experts-team:ai-thread:${user.id}`;

    const restoreThread = async () => {
      let savedThreadId: string | null = null;
      try {
        savedThreadId = window.localStorage.getItem(storageKey);
      } catch {
        // Continue with the database's latest conversation when browser storage is unavailable.
      }

      if (savedThreadId) {
        if (!cancelled) setThreadId(savedThreadId);
        return;
      }

      const { data, error } = await supabase
        .from("ai_chats")
        .select("thread_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const restoredId = !error && data?.thread_id ? data.thread_id : crypto.randomUUID();
      if (cancelled) return;
      try {
        window.localStorage.setItem(storageKey, restoredId);
      } catch {
        // The conversation still works for this session without local storage.
      }
      setThreadId(restoredId);
    };

    void restoreThread();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user || !threadId) return;
    try {
      window.localStorage.setItem(`experts-team:ai-thread:${user.id}`, threadId);
    } catch {
      // Keep the active thread in component state if browser storage is unavailable.
    }
  }, [user?.id, threadId]);

  const {
    data: savedMessages = [],
    isError: messagesError,
    refetch: refetchMessages,
  } = useQuery({
    queryKey: ["ai-chats", user?.id, threadId],
    enabled: !!user && !!threadId,
    queryFn: async () => {
      if (!threadId) return [] as ChatRow[];
      const { data, error } = await supabase
        .from("ai_chats")
        .select("id, role, content, created_at, thread_id")
        .eq("user_id", user!.id)
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ChatRow[];
    },
  });
  const { data: chatThreads = [] } = useQuery({
    queryKey: ["ai-chat-threads", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_chats")
        .select("thread_id, role, content, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const grouped = new Map<string, { threadId: string; title: string; updatedAt: string }>();
      for (const row of data ?? []) {
        if (!row.thread_id) continue;
        const current = grouped.get(row.thread_id);
        if (!current) {
          grouped.set(row.thread_id, {
            threadId: row.thread_id,
            title: row.role === "user" ? String(row.content).replace(/\\s+/g, " ").slice(0, 52) : "New conversation",
            updatedAt: row.created_at,
          });
        } else if (row.role === "user") {
          current.title = String(row.content).replace(/\\s+/g, " ").slice(0, 52) || current.title;
        }
      }
      return [...grouped.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
  });
  const visibleThreads = useMemo(() => chatThreads, [chatThreads]);
  const messages = user ? savedMessages : guestMessages;

  const send = useMutation({
    mutationFn: async (prompt: string) => {
      const activeThreadId = threadId ?? crypto.randomUUID();
      if (user && !threadId) setThreadId(activeThreadId);

      const history = messages.slice(-6).map((message) => ({
        role: message.role,
        content: message.content,
      }));
      const userMessage: ChatRow = {
        id: crypto.randomUUID(),
        role: "user",
        content: prompt,
        created_at: new Date().toISOString(),
        thread_id: activeThreadId,
      };
      if (user) {
        const { error: userMessageError } = await supabase.from("ai_chats").insert({
          user_id: user.id,
          thread_id: activeThreadId,
          role: "user",
          content: prompt,
        });
        if (userMessageError) throw userMessageError;
      } else {
        setGuestMessages((current) => [...current, userMessage]);
      }

      setStreamingReply("");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (user) {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !sessionData.session?.access_token) {
          throw new Error("Your session expired. Please sign in again.");
        }
        headers.Authorization = `Bearer ${sessionData.session.access_token}`;
      } else {
        headers["X-Guest-Session"] = guestSessionId;
      }

      const response = await fetch("/api/ai/stream", {
        method: "POST",
        headers,
        body: JSON.stringify({ prompt, history, attachments }),
      });
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errorBody.error || `ExpertAI request failed (${response.status}).`);
      }
      if (!response.body) throw new Error("The AI response stream was unavailable.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamedText = "";
      const consumeEvent = async (event: string) => {
        const payload = event
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .filter(Boolean)
          .join("\n");
        if (!payload || payload === "[DONE]") return;
        const chunk = JSON.parse(payload) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
          error?: string;
        };
        if (chunk.error) throw new Error(chunk.error);
        const text =
          chunk.candidates?.[0]?.content?.parts
            ?.filter((part) => !part.thought)
            .map((part) => part.text ?? "")
            .join("") ?? "";
        if (text) {
          for (const character of text) {
            streamedText += character;
            setStreamingReply(streamedText);
            await new Promise((resolve) => setTimeout(resolve, 6));
          }
        }
      };
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() ?? "";
        for (const event of events) await consumeEvent(event);
      }
      buffer += decoder.decode();
      if (buffer.trim()) await consumeEvent(buffer);
      const reply = streamedText.trim();
      if (!reply) {
        throw new Error("ExpertAI returned an empty answer. Please try again.");
      }

      if (user) {
        const { error: aiMessageError } = await supabase
          .from("ai_chats")
          .insert({ user_id: user.id, thread_id: activeThreadId, role: "ai", content: reply });
        if (aiMessageError) {
          throw new Error("ExpertAI replied, but the reply could not be saved. Please try again.");
        }
      } else {
        setGuestMessages((current) => [...current, {
          id: crypto.randomUUID(),
          role: "ai",
          content: reply,
          created_at: new Date().toISOString(),
          thread_id: activeThreadId,
        }]);
        setGuestCredits((current) => {
          const next = Math.max(0, current - 1);
          try { window.localStorage.setItem(`experts-team:guest-ai-credits:${guestSessionId}`, String(next)); } catch { /* Server also enforces the guest limit. */ }
          return next;
        });
      }

      setAttachments([]);
      setStreamingReply("");
    },
    onSuccess: () => {
      if (user) void queryClient.invalidateQueries({ queryKey: ["ai-chats", user.id] });
      if (user) void queryClient.invalidateQueries({ queryKey: ["ai-chat-threads", user.id] });
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (error: Error) => {
      setStreamingReply("");
      toast.error(error.message);
      void queryClient.invalidateQueries({ queryKey: ["ai-chats", user?.id] });
    },
  });

  const clear = useMutation({
    mutationFn: async () => {
      if (!user) {
        setGuestMessages([]);
        return;
      }
      const activeThreadId = threadId ?? crypto.randomUUID();
      if (!threadId) setThreadId(activeThreadId);
      const { error } = await supabase
        .from("ai_chats")
        .delete()
        .eq("user_id", user.id)
        .eq("thread_id", activeThreadId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Chat cleared");
      setGeneratedImage(null);
      void queryClient.invalidateQueries({ queryKey: ["ai-chats", user?.id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteThread = useMutation({
    mutationFn: async (targetThreadId: string) => {
      if (!user) return;
      const { error } = await supabase
        .from("ai_chats")
        .delete()
        .eq("user_id", user.id)
        .eq("thread_id", targetThreadId);
      if (error) throw error;
      return targetThreadId;
    },
    onSuccess: (deletedThreadId) => {
      if (deletedThreadId === threadId) newChat();
      void queryClient.invalidateQueries({ queryKey: ["ai-chat-threads", user?.id] });
      void queryClient.invalidateQueries({ queryKey: ["ai-chats", user?.id] });
      toast.success("Conversation deleted");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    try {
      const next = await Promise.all(Array.from(files).slice(0, 3).map(loadFileForAi));
      setAttachments((current) => {
        const combined = [...current, ...next].slice(0, 3);
        if (combined.reduce((total, item) => total + (item.dataUrl?.length ?? item.text?.length ?? 0), 0) > 1_350_000) {
          toast.error("Compressed attachments must stay under 1 MB in total.");
          return current;
        }
        return combined;
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load that attachment.");
    }
  };

  const generateImageMutation = useMutation({
    mutationFn: async () => {
      const promptText = input.trim() || "Create a clean premium hero image for an AI startup";
      const result = await generateImage({ data: { prompt: promptText } });
      setGeneratedImage(result);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const chatIsFull = messages.length >= 50;
  const guestCreditsExhausted = !user && guestCredits <= 0;

  function submit() {
    if (guestCreditsExhausted) {
      toast.error("You have used your 15 free guest credits. Create an account to keep chatting.");
      return;
    }
    if (chatIsFull) {
      toast.error("This chat is full. Start a new chat to continue; this conversation remains saved.");
      return;
    }
    const prompt = input.trim();
    if (!prompt && attachments.length === 0) return;
    if (send.isPending) return;
    setInput("");
    send.mutate(prompt || "Review the uploaded files and analyze them.");
  }

  function newChat() {
    setAttachments([]);
    if (user) {
      setThreadId(crypto.randomUUID());
      void queryClient.invalidateQueries({ queryKey: ["ai-chats", user.id] });
    } else {
      setGuestMessages([]);
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-background">
      {user && (
        <aside className="hidden w-60 shrink-0 flex-col border-r border-border/70 bg-card/70 md:flex">
          <div className="flex items-center justify-between border-b border-border/70 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <MessageSquare className="h-4 w-4 text-primary" /> Your chats
            </div>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => newChat()} aria-label="New chat">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
            {visibleThreads.length === 0 && (
              <p className="px-2 py-5 text-xs leading-relaxed text-muted-foreground">Your conversations will appear here when you start chatting.</p>
            )}
            {visibleThreads.map((thread) => (
              <div key={thread.threadId} className={`group flex items-center gap-1 rounded-lg ${threadId === thread.threadId ? "bg-primary/10 text-foreground" : "hover:bg-secondary/70"}`}>
                <button
                  type="button"
                  onClick={() => { setThreadId(thread.threadId); setAttachments([]); setGeneratedImage(null); }}
                  className="min-w-0 flex-1 px-3 py-2.5 text-left"
                  title={thread.title}
                >
                  <span className="block truncate text-xs font-medium">{thread.title || "New conversation"}</span>
                  <span className="mt-1 block text-[10px] text-muted-foreground">{new Date(thread.updatedAt).toLocaleDateString()}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Delete conversation ${thread.title}`}
                  title="Delete conversation"
                  onClick={() => deleteThread.mutate(thread.threadId)}
                  disabled={deleteThread.isPending}
                  className="mr-1 rounded-md p-2 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="border-t border-border/70 p-3 text-[11px] text-muted-foreground">
            Private conversations · saved to your account
          </div>
        </aside>
      )}
      <Card className="glow-panel flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/15">
            <img src="/expertai-mark.svg" alt="" className="h-7 w-7" />
          </span>
          <div>
            <p className="text-sm font-semibold">ExpertAI Chat</p>
            <p className="text-xs text-muted-foreground">
              File analysis · app building · {user ? `${profile?.ai_credits ?? 0} AI credits` : `${guestCredits} of 15 free guest credits`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onMinimize && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Minimize ExpertAI"
              title="Minimize ExpertAI"
              onClick={onMinimize}
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.location.assign("/")}
            title="Back to ExpertsTeam home"
          >
            <Home className="mr-1.5 h-4 w-4" /> Home
          </Button>
          <Button variant="secondary" size="sm" onClick={newChat} disabled={send.isPending}>
            New chat
          </Button>

          <Button
            variant="ghost"
            size="icon"
            aria-label="Clear chat"
            onClick={() => clear.mutate()}
            disabled={clear.isPending || send.isPending}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {messagesError && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3"
          >
            <p className="text-sm text-destructive">
              Could not load your saved messages. Check the database migration, then try again.
            </p>
            <Button size="sm" variant="outline" onClick={() => void refetchMessages()}>
              Retry
            </Button>
          </div>
        )}
        {messages.length === 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              "Review this product brief and propose an MVP",
              "Explain this uploaded code and suggest fixes",
              "Generate a premium landing-page hero image prompt",
              "Audit this design spec and propose a UI structure",
            ].map((idea) => (
              <button
                key={idea}
                onClick={() => setInput(idea)}
                className="animate-rise rounded-lg border border-border bg-secondary/60 p-3 text-left text-sm transition-colors hover:border-primary/60"
              >
                {idea}
              </button>
            ))}
          </div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-2 ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {message.role !== "user" && (
              <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/15">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </span>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                message.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-secondary"
              }`}
            >
              <MessageBody content={message.content} />
            </div>
            {message.role === "user" && (
              <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary">
                <User className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
        ))}
        {send.isPending && (
          <div className="flex justify-start gap-2">
            <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/15">
              <Bot className="h-3.5 w-3.5 text-primary" />
            </span>
            <div className="max-w-[80%] rounded-2xl border border-border bg-secondary px-4 py-2">
              {streamingReply ? (
                <MessageBody content={streamingReply} />
              ) : (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> ExpertAI is thinking…
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {generatedImage && (
        <div className="border-t border-border/70 bg-secondary/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Generated image
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setGeneratedImage(null)}
              className="h-7 px-2"
            >
              Clear
            </Button>
          </div>
          <img
            src={`data:${generatedImage.mimeType};base64,${generatedImage.data}`}
            alt="Generated by ExpertAI"
            className="max-h-64 w-full rounded-lg border border-border object-contain"
          />
        </div>
      )}

      <div className="border-t border-border/70 p-3">
        {guestCreditsExhausted && (
          <div role="status" className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">Your 15 free guest credits are used. Create an account to continue chatting with ExpertAI. <button type="button" className="ml-2 font-semibold text-primary underline" onClick={() => window.location.assign("/auth")}>Create account</button></div>
        )}
        {chatIsFull && (
          <div role="status" className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <span>This chat is full. Your conversation is saved. Start a new chat to continue.</span>
            <Button size="sm" onClick={newChat}>New chat</Button>
          </div>
        )}
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((attachment) => (
              <span
                key={`${attachment.name}-${attachment.size ?? 0}`}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/70 px-2 py-1 text-xs"
              >
                {attachment.name}
                <button
                  type="button"
                  aria-label={`Remove ${attachment.name}`}
                  onClick={() =>
                    setAttachments((current) =>
                      current.filter((item) => item.name !== attachment.name),
                    )
                  }
                  className="ml-1 text-muted-foreground hover:text-foreground"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              void handleFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Upload files"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Textarea
            value={input}
            rows={1}
            placeholder="Ask ExpertAI anything…"
            onChange={(event) => setInput(event.target.value)}
            disabled={chatIsFull || guestCreditsExhausted}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            className="min-h-10 resize-none"
          />
          {user && (
            <Button
              variant="secondary"
              size="icon"
              aria-label="Generate image"
              onClick={() => void generateImageMutation.mutateAsync()}
              disabled={generateImageMutation.isPending}
            >
              {generateImageMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="h-4 w-4" />
              )}
            </Button>
          )}
          <Button onClick={submit} disabled={send.isPending || chatIsFull || guestCreditsExhausted} aria-label="Send message">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
      </Card>
    </div>
  );
}

export const ExpertAiChat = ChrisAiChat;
