import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Lightbulb, Link2, MessageSquare, Send, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/community")({
  head: () => ({
    meta: [
      { title: "Community — ideas, quests & links | ExpertsTeam" },
      {
        name: "description",
        content:
          "Share ideas, post public quests, drop useful links and discuss with the ExpertsTeam community.",
      },
      { property: "og:title", content: "Community — ideas, quests & links | ExpertsTeam" },
      {
        property: "og:description",
        content: "Post ideas, ask public quests and share links with the ExpertsTeam community.",
      },
    ],
  }),
  component: CommunityPage,
});

const KINDS = [
  { id: "post", label: "Post", icon: Users },
  { id: "idea", label: "Idea", icon: Lightbulb },
  { id: "quest", label: "Public quest", icon: MessageSquare },
  { id: "link", label: "Link", icon: Link2 },
] as const;

type Post = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string | null;
  link_url: string | null;
  created_at: string;
  profiles: { username: string; display_name: string | null } | null;
};

function CommunityPage() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<string>("post");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [filter, setFilter] = useState<string>("all");

  const {
    data: posts = [],
    isLoading,
    error,
    refetch: refetchPosts,
  } = useQuery({
    queryKey: ["community-posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_posts")
        .select(
          "id, user_id, kind, title, body, link_url, created_at, profiles:profiles!community_posts_profile_fk(username, display_name)",
        )
        .order("created_at", { ascending: false });
      if (error) throw new Error(`Community feed: ${error.message}`);
      return (data ?? []) as Post[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in to post.");
      if (title.trim().length < 3) throw new Error("Give your post a title.");
      if (!body.trim() && !linkUrl.trim()) throw new Error("Add a post body or a link.");
      const { error } = await supabase.from("community_posts").insert({
        user_id: user.id,
        kind,
        title: title.trim(),
        body: body.trim() || null,
        link_url: linkUrl.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setTitle("");
      setBody("");
      setLinkUrl("");
      toast.success("Shared with the community");
      void queryClient.invalidateQueries({ queryKey: ["community-posts"] });
      void queryClient.refetchQueries({ queryKey: ["community-posts"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("community_posts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Post deleted");
      void queryClient.invalidateQueries({ queryKey: ["community-posts"] });
      void queryClient.refetchQueries({ queryKey: ["community-posts"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const visible = filter === "all" ? posts : posts.filter((post) => post.kind === filter);

  return (
    <PageShell>
      <section className="mx-auto max-w-5xl px-4 py-10">
        <div className="animate-rise">
          <h1 className="font-display text-3xl font-semibold tracking-tight">Community</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Ideas, public quests and shared links from the ExpertsTeam community.
          </p>
        </div>

        {user ? (
          <Card className="glow-panel animate-rise mt-6 space-y-3 p-4">
            <div className="flex flex-wrap gap-2">
              {KINDS.map((option) => (
                <Button
                  key={option.id}
                  size="sm"
                  variant={kind === option.id ? "default" : "secondary"}
                  onClick={() => setKind(option.id)}
                >
                  <option.icon className="mr-2 h-3.5 w-3.5" />
                  {option.label}
                </Button>
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor="post-title">Title</Label>
              <Input
                id="post-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="post-body">Details</Label>
              <Textarea
                id="post-body"
                rows={3}
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="post-link">Link (optional)</Label>
              <Input
                id="post-link"
                placeholder="https://"
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
              />
            </div>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              <Send className="mr-2 h-4 w-4" /> Share
            </Button>
          </Card>
        ) : (
          <Card className="mt-6 flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm text-muted-foreground">
              Sign in to post ideas, quests and links.
            </p>
            <Link to="/auth">
              <Button>Sign in</Button>
            </Link>
          </Card>
        )}

        <Tabs value={filter} onValueChange={setFilter} className="mt-8">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            {KINDS.map((option) => (
              <TabsTrigger key={option.id} value={option.id}>
                {option.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value={filter} className="space-y-4 pt-4">
            {isLoading && <p className="text-sm text-muted-foreground">Loading posts…</p>}
            {error && (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3"
              >
                <p className="text-sm text-destructive">
                  We couldn't load the community feed. Please check the database migration and
                  retry.
                </p>
                <Button size="sm" variant="outline" onClick={() => void refetchPosts()}>
                  Retry
                </Button>
              </div>
            )}
            {!isLoading && !error && visible.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nothing here yet — be the first to post.
              </p>
            )}
            {visible.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                canDelete={!!user && (user.id === post.user_id || isAdmin)}
                onDelete={() => remove.mutate(post.id)}
              />
            ))}
          </TabsContent>
        </Tabs>
      </section>
    </PageShell>
  );
}

type Comment = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  profiles: { username: string; display_name: string | null } | null;
};

function PostCard({
  post,
  canDelete,
  onDelete,
}: {
  post: Post;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");

  const {
    data: comments = [],
    isLoading: commentsLoading,
    isError: commentsError,
    refetch: refetchComments,
  } = useQuery({
    queryKey: ["community-comments", post.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_comments")
        .select(
          "id, user_id, body, created_at, profiles:profiles!community_comments_profile_fk(username, display_name)",
        )
        .eq("post_id", post.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Comment[];
    },
  });

  const addComment = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in to comment.");
      if (!comment.trim()) throw new Error("Write something first.");
      const { error } = await supabase
        .from("community_comments")
        .insert({ post_id: post.id, user_id: user.id, body: comment.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      setComment("");
      void queryClient.invalidateQueries({ queryKey: ["community-comments", post.id] });
      void queryClient.refetchQueries({ queryKey: ["community-comments", post.id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const author = post.profiles?.display_name || post.profiles?.username || "Member";

  return (
    <Card className="animate-rise space-y-3 p-4 transition-transform hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
            {KINDS.find((k) => k.id === post.kind)?.label ?? post.kind}
          </span>
          <h2 className="mt-2 font-display text-lg font-semibold">{post.title}</h2>
          <p className="text-xs text-muted-foreground">
            by {author} · {new Date(post.created_at).toLocaleDateString()}
          </p>
        </div>
        {canDelete && (
          <Button variant="ghost" size="icon" aria-label="Delete post" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
      {post.body && (
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{post.body}</p>
      )}
      {post.link_url && (
        <a
          href={post.link_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <Link2 className="h-3.5 w-3.5" /> {post.link_url}
        </a>
      )}

      <Button variant="secondary" size="sm" onClick={() => setOpen((value) => !value)}>
        <MessageSquare className="mr-2 h-3.5 w-3.5" />
        {open ? "Hide discussion" : "Discussion"}
      </Button>

      {open && (
        <div className="space-y-3 border-t border-border/70 pt-3">
          {commentsLoading && <p className="text-xs text-muted-foreground">Loading replies…</p>}
          {commentsError && (
            <div
              role="alert"
              className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 p-3"
            >
              <p className="text-xs text-destructive">Could not load replies.</p>
              <Button size="sm" variant="outline" onClick={() => void refetchComments()}>
                Retry
              </Button>
            </div>
          )}
          {!commentsLoading &&
            !commentsError &&
            comments.map((item) => (
              <div key={item.id} className="rounded-lg bg-secondary/60 p-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  {item.profiles?.display_name || item.profiles?.username || "Member"}
                </p>
                <p className="whitespace-pre-wrap">{item.body}</p>
              </div>
            ))}
          {!commentsLoading && !commentsError && comments.length === 0 && (
            <p className="text-xs text-muted-foreground">No replies yet.</p>
          )}
          {user && (
            <div className="flex items-end gap-2">
              <Textarea
                rows={1}
                value={comment}
                placeholder="Write a reply…"
                className="min-h-10 resize-none"
                onChange={(event) => setComment(event.target.value)}
              />
              <Button
                size="icon"
                aria-label="Send reply"
                onClick={() => addComment.mutate()}
                disabled={addComment.isPending || !comment.trim()}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
