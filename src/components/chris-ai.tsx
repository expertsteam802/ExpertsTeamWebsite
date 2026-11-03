import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Copy, ImagePlus, Loader2, Minimize2, Paperclip, Send, Sparkles, Trash2, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { askChrisAi, generateExpertImage } from "@/lib/ai.functions";

type ChatRow = { id: string; role: string; content: string; created_at: string; thread_id?: string };
type UploadedFile = { name: string; mimeType: string; dataUrl?: string; text?: string; size?: number };

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

function loadFileForAi(file: File): Promise<UploadedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result ?? "");
      const text = file.type.startsWith("text/") || /\.(txt|md|json|csv|js|ts|tsx|jsx|html|css|sql|yaml|yml|xml)$/i.test(file.name)
        ? await fileToText(file).catch(() => "")
        : "";

      resolve({
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        dataUrl,
        text: text || undefined,
        size: file.size,
      });
    };
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

export function ChrisAiChat({
  onMinimize,
}: {
  onMinimize?: () => void;
} = {}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const ask = useServerFn(askChrisAi);
  const generateImage = useServerFn(generateExpertImage);
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [generatedImage, setGeneratedImage] = useState<{ mimeType: string; data: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!user) return;
    if (!threadId) setThreadId(crypto.randomUUID());
  }, [user, threadId]);

  const { data: messages = [], isError: messagesError } = useQuery({
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

  const send = useMutation({
    mutationFn: async (prompt: string) => {
      const activeThreadId = threadId ?? crypto.randomUUID();
      if (!threadId) setThreadId(activeThreadId);

      const { error: userMessageError } = await supabase
        .from("ai_chats")
        .insert({
          user_id: user!.id,
          thread_id: activeThreadId,
          role: "user",
          content: prompt,
        });
      if (userMessageError) throw userMessageError;

      const history = messages.slice(-10).map((message) => ({
        role: message.role,
        content: message.content,
      }));

      const result = await ask({
        data: {
          prompt,
          mode: "chat",
          history,
          attachments,
        },
      });
      const reply = result.reply.trim();
      if (!reply) {
        throw new Error("Expert AI returned an empty answer. Please try again.");
      }

      const { error: aiMessageError } = await supabase
        .from("ai_chats")
        .insert({ user_id: user!.id, thread_id: activeThreadId, role: "ai", content: reply });
      if (aiMessageError) {
        throw new Error("Expert AI replied, but the reply could not be saved. Please try again.");
      }

      setAttachments([]);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["ai-chats", user?.id] }),
    onError: (error: Error) => {
      toast.error(error.message);
      void queryClient.invalidateQueries({ queryKey: ["ai-chats", user?.id] });
    },
  });

  const clear = useMutation({
    mutationFn: async () => {
      const activeThreadId = threadId ?? crypto.randomUUID();
      if (!threadId) setThreadId(activeThreadId);

      const { error } = await supabase
        .from("ai_chats")
        .delete()
        .eq("user_id", user!.id)
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

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const next = await Promise.all(Array.from(files).slice(0, 5).map(loadFileForAi));
    setAttachments((current) => [...current, ...next].slice(0, 5));
  };

  const generateImageMutation = useMutation({
    mutationFn: async () => {
      const promptText = input.trim() || "Create a clean premium hero image for an AI startup";
      const result = await generateImage({ data: { prompt: promptText } });
      setGeneratedImage(result);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!user) {
    return (
      <Card className="p-8 text-center">
        <Bot className="mx-auto h-8 w-8 text-primary" />
        <h2 className="mt-3 font-display text-xl font-semibold">Sign in to chat with Expert AI</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your conversations, uploads, and generated images stay attached to your account.
        </p>
      </Card>
    );
  }

  function submit() {
    const prompt = input.trim();
    if (!prompt && attachments.length === 0) return;
    if (send.isPending) return;
    setInput("");
    send.mutate(prompt || "Review the uploaded files and analyze them.");
  }

  function newChat() {
    setThreadId(crypto.randomUUID());
    setAttachments([]);
    void queryClient.invalidateQueries({ queryKey: ["ai-chats", user?.id] });
  }

  return (
    <Card className="glow-panel flex h-full min-h-0 w-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/15">
            <Sparkles className="h-4 w-4 text-primary" />
          </span>
          <div>
            <p className="text-sm font-semibold">Expert AI</p>
            <p className="text-xs text-muted-foreground">File analysis · image ideas · app building</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {onMinimize && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Minimize Expert AI"
              title="Minimize Expert AI"
              onClick={onMinimize}
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
          )}
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
          <p role="alert" className="text-sm text-destructive">
            Could not load your saved messages. Please refresh and try again.
          </p>
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
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Expert AI is thinking…
          </p>
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
            alt="Generated by Expert AI"
            className="max-h-64 w-full rounded-lg border border-border object-contain"
          />
        </div>
      )}

      <div className="border-t border-border/70 p-3">
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
                  onClick={() => setAttachments((current) => current.filter((item) => item.name !== attachment.name))}
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
            placeholder="Ask Expert AI anything…"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            className="min-h-10 resize-none"
          />
          <Button
            variant="secondary"
            size="icon"
            aria-label="Generate image"
            onClick={() => void generateImageMutation.mutateAsync()}
            disabled={generateImageMutation.isPending}
          >
            {generateImageMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          </Button>
          <Button onClick={submit} disabled={send.isPending} aria-label="Send message">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

export const ExpertAiChat = ChrisAiChat;
