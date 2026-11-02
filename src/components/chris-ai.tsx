import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Code2, Copy, Eye, Loader2, Save, Send, Sparkles, Trash2, User } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { askChrisAi } from "@/lib/ai.functions";

type ChatRow = { id: string; role: string; content: string; created_at: string; thread_id?: string };

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

export function ChrisAiChat() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const ask = useServerFn(askChrisAi);
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);

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
        .insert({ user_id: user!.id, thread_id: activeThreadId, role: "user", content: prompt });
      if (userMessageError) throw userMessageError;

      const history = messages.slice(-10).map((message) => ({
        role: message.role,
        content: message.content,
      }));

      const result = await ask({ data: { prompt, mode: "chat", history } });
      const reply = result.reply.trim();
      if (!reply) {
        throw new Error("Gemini returned an empty answer. Please try again.");
      }

      const { error: aiMessageError } = await supabase
        .from("ai_chats")
        .insert({ user_id: user!.id, thread_id: activeThreadId, role: "ai", content: reply });
      if (aiMessageError) {
        throw new Error("Chris AI replied, but the reply could not be saved. Please try again.");
      }
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
      void queryClient.invalidateQueries({ queryKey: ["ai-chats", user?.id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!user) {
    return (
      <Card className="p-8 text-center">
        <Bot className="mx-auto h-8 w-8 text-primary" />
        <h2 className="mt-3 font-display text-xl font-semibold">
          Sign in to chat with Experts Team 802 AI
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your conversations are private and saved to your account.
        </p>
      </Card>
    );
  }

  function submit() {
    const prompt = input.trim();
    if (!prompt || send.isPending) return;
    setInput("");
    send.mutate(prompt);
  }

  function newChat() {
    setThreadId(crypto.randomUUID());
    void queryClient.invalidateQueries({ queryKey: ["ai-chats", user?.id] });
  }

  return (
    <Card className="glow-panel flex h-[70vh] flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/15">
            <Sparkles className="h-4 w-4 text-primary" />
          </span>
          <div>
            <p className="text-sm font-semibold">Experts Team 802 AI</p>
            <p className="text-xs text-muted-foreground">Gemini · product plans · apps · code</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messagesError && (
          <p role="alert" className="text-sm text-destructive">
            Could not load your saved messages. Please refresh and try again.
          </p>
        )}
        {messages.length === 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              "Build a SaaS dashboard for project planning",
              "Plan my app architecture with Supabase and auth",
              "Create a landing page for a product team",
              "Design a database schema for a bookings app",
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
            <Loader2 className="h-3 w-3 animate-spin" /> Experts Team 802 AI is thinking…
          </p>
        )}
      </div>

      <div className="flex items-end gap-2 border-t border-border/70 p-3">
        <Textarea
          value={input}
          rows={1}
          placeholder="Ask Experts Team 802 AI anything…"
          onChange={(event) => setInput(event.target.value)}
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
    </Card>
  );
}

export function ChrisAiWorkspace() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const ask = useServerFn(askChrisAi);
  const [brief, setBrief] = useState("");
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [snippetId, setSnippetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [language, setLanguage] = useState<
    "html" | "css" | "javascript" | "typescript" | "python" | "json" | "sql" | "text"
  >("javascript");
  const [showPreview, setShowPreview] = useState(false);

  const { data: snippets = [], isError: snippetsError } = useQuery({
    queryKey: ["ai-snippets", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_snippets")
        .select("id, title, language, prompt, code, updated_at")
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        title: string;
        language: string;
        prompt: string | null;
        code: string;
        updated_at: string;
      }>;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!code.trim()) throw new Error("Nothing to save yet.");
      const payload = {
        user_id: user!.id,
        title: (title.trim() || brief.trim().slice(0, 60) || "Untitled snippet").slice(0, 120),
        language,
        prompt: brief.trim() ? brief.trim().slice(0, 2000) : null,
        code: code.slice(0, 40000),
      };
      if (snippetId) {
        const { error } = await supabase.from("ai_snippets").update(payload).eq("id", snippetId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("ai_snippets")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        setSnippetId(data.id);
      }
    },
    onSuccess: () => {
      toast.success("Progress saved");
      void queryClient.invalidateQueries({ queryKey: ["ai-snippets", user?.id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeSnippet = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ai_snippets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      if (snippetId === id) setSnippetId(null);
      void queryClient.invalidateQueries({ queryKey: ["ai-snippets", user?.id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function load(snippet: {
    id: string;
    title: string;
    language: string;
    prompt: string | null;
    code: string;
    updated_at: string;
  }) {
    setSnippetId(snippet.id);
    setTitle(snippet.title);
    setBrief(snippet.prompt ?? "");
    setCode(snippet.code);
    setLanguage(
      snippet.language === "html" ||
        snippet.language === "css" ||
        snippet.language === "javascript" ||
        snippet.language === "typescript" ||
        snippet.language === "python" ||
        snippet.language === "json" ||
        snippet.language === "sql" ||
        snippet.language === "text"
        ? (snippet.language as typeof language)
        : "text",
    );
    setShowPreview(false);
  }

  async function generate() {
    if (!brief.trim() || busy) return;
    setBusy(true);
    try {
      const request = `${brief.trim()}\n\nWrite the complete solution in ${language}.`;
      const result = await ask({ data: { prompt: request, mode: "workspace" } });
      const codeBlock = result.reply.match(/```[^\r\n]*\r?\n([\s\S]*?)```/);
      const generatedCode = (codeBlock?.[1] ?? result.reply).trim();
      if (!generatedCode) throw new Error("Gemini returned no code. Please try again.");
      setCode(generatedCode);
      setShowPreview(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return (
      <Card className="p-8 text-center">
        <Code2 className="mx-auto h-8 w-8 text-primary" />
        <h2 className="mt-3 font-display text-xl font-semibold">Sign in to use the workspace</h2>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="glow-panel space-y-3 p-4">
          <h2 className="font-display text-lg font-semibold">Build brief</h2>
          <Input
            value={title}
            placeholder="Snippet name (e.g. dashboard selector)"
            onChange={(event) => setTitle(event.target.value)}
          />
          <div className="space-y-1">
            <label htmlFor="snippet-language" className="text-sm font-medium">
              Language
            </label>
            <select
              id="snippet-language"
              value={language}
              onChange={(event) => {
                const next = event.target.value as typeof language;
                if (["html", "css", "javascript", "typescript", "python", "json", "sql", "text"].includes(next)) {
                  setLanguage(next);
                }
              }}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {[
                ["html", "HTML"],
                ["css", "CSS"],
                ["javascript", "JavaScript"],
                ["typescript", "TypeScript"],
                ["python", "Python"],
                ["json", "JSON"],
                ["sql", "SQL"],
                ["text", "Text"],
              ].map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <Textarea
            rows={7}
            value={brief}
            placeholder="Describe what to build: a dashboard, API layer, app shell, database schema, landing page…"
            onChange={(event) => setBrief(event.target.value)}
          />
          <Button onClick={() => void generate()} disabled={busy} className="w-full">
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Generate code
          </Button>
        </Card>
        <Card className="glow-panel space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">Workspace</h2>
            <div className="flex gap-2">
              {["html", "css", "javascript"].includes(language) && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!code}
                  onClick={() => setShowPreview((visible) => !visible)}
                >
                  <Eye className="mr-2 h-3.5 w-3.5" /> {showPreview ? "Hide preview" : "Preview"}
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                disabled={!code || save.isPending}
                onClick={() => save.mutate()}
              >
                <Save className="mr-2 h-3.5 w-3.5" /> {snippetId ? "Update" : "Save"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!code}
                onClick={() => {
                  void navigator.clipboard
                    .writeText(code)
                    .then(() => toast.success("Copied to clipboard"))
                    .catch((error: unknown) =>
                      toast.error(error instanceof Error ? error.message : "Could not copy code."),
                    );
                }}
              >
                <Copy className="mr-2 h-3.5 w-3.5" /> Copy
              </Button>
            </div>
          </div>
          <Textarea
            rows={16}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Generated code appears here and stays editable."
            className="font-mono text-xs"
          />
          {showPreview && (
            <iframe
              title={`${language} snippet preview`}
              sandbox="allow-scripts"
              srcDoc={`<!doctype html><html><head><meta charset="utf-8" /><style>${code}</style></head><body><div id="app"></div></body></html>`}
              className="h-64 w-full rounded-lg border border-border bg-white"
            />
          )}
          {["html", "css", "javascript"].includes(language) && (
            <p className="text-xs text-muted-foreground">
              Preview runs HTML, CSS, or JavaScript in an isolated frame. Other languages can be
              edited, copied, and saved here, but are not executed.
            </p>
          )}
        </Card>
      </div>

      <Card className="space-y-2 p-4">
        <h2 className="font-display text-lg font-semibold">Saved progress</h2>
        {snippetsError && (
          <p role="alert" className="text-sm text-destructive">
            Could not load your saved snippets. Please refresh and try again.
          </p>
        )}
        {!snippets.length && (
          <p className="text-sm text-muted-foreground">
            Nothing saved yet — generate code and hit Save to keep your progress in your account.
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {snippets.map((snippet) => (
            <div
              key={snippet.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border bg-secondary/50 p-3"
            >
              <button onClick={() => load(snippet)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-medium">{snippet.title}</p>
                <p className="text-xs text-muted-foreground">
                  Updated {snippet.updated_at.slice(0, 10)}
                </p>
              </button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${snippet.title}`}
                onClick={() => removeSnippet.mutate(snippet.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
