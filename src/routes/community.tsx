import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Compass,
  Flame,
  Heart,
  ImagePlus,
  Lightbulb,
  Link2,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AdSlot } from "@/components/ads/ad-slot";
import { PageShell } from "@/components/layout/page-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/community")({
  head: () => ({
    meta: [
      { title: "ExpertsTeam Community — Creators, builders & ideas" },
      {
        name: "description",
        content:
          "Join the ExpertsTeam live community feed. Share projects, coding ideas, questions, photos and useful links.",
      },
    ],
  }),
  component: CommunityPage,
});

const FILTERS = [
  { id: "all", label: "For you", icon: Compass },
  { id: "post", label: "Posts", icon: Users },
  { id: "idea", label: "Ideas", icon: Lightbulb },
  { id: "quest", label: "Questions", icon: MessageCircle },
  { id: "link", label: "Links", icon: Link2 },
] as const;

type Post = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string | null;
  link_url: string | null;
  media_url: string | null;
  created_at: string;
  profiles: { username: string; display_name: string | null; avatar_url: string | null } | null;
};

function CommunityPage() {
  const { user, profile, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [composerOpen, setComposerOpen] = useState(false);
  const [kind, setKind] = useState("post");
  const [body, setBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [search, setSearch] = useState("");

  const {
    data: posts = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["community-posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_posts")
        .select(
          "id,user_id,kind,title,body,link_url,media_url,created_at,profiles:profiles!community_posts_profile_fk(username,display_name,avatar_url)",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Post[];
    },
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("community-live-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_posts" },
        () => void queryClient.invalidateQueries({ queryKey: ["community-posts"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_likes" },
        () => void queryClient.invalidateQueries({ queryKey: ["community-likes"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_comments" },
        () => void queryClient.invalidateQueries({ queryKey: ["community-comments"] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  function chooseImage(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Images must be 8 MB or smaller.");
      return;
    }
    setImage(file);
    setImagePreview(URL.createObjectURL(file));
  }

  const createPost = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in to share with the community.");
      if (!body.trim() && !linkUrl.trim() && !image)
        throw new Error("Add a caption, link or photo.");
      let media_url: string | null = null;
      if (image) {
        const safeName = image.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-80);
        const path = `${user.id}/community/${Date.now()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from("uploads")
          .upload(path, image, { cacheControl: "3600", upsert: false, contentType: image.type });
        if (uploadError) throw uploadError;
        media_url = supabase.storage.from("uploads").getPublicUrl(path).data.publicUrl;
      }
      const caption = body.trim();
      const title = (
        caption.split("\n")[0] ||
        (kind === "idea"
          ? "Shared idea"
          : kind === "quest"
            ? "Community question"
            : "Community update")
      ).slice(0, 120);
      const { error } = await supabase
        .from("community_posts")
        .insert({
          user_id: user.id,
          kind,
          title,
          body: caption || null,
          link_url: linkUrl.trim() || null,
          media_url,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody("");
      setLinkUrl("");
      setImage(null);
      setImagePreview("");
      setComposerOpen(false);
      toast.success("Your post is live");
      void queryClient.invalidateQueries({ queryKey: ["community-posts"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const visible = posts.filter((post) => {
    const matchesKind = filter === "all" || post.kind === filter;
    const terms = [post.title, post.body, post.profiles?.display_name, post.profiles?.username];
    return (
      matchesKind &&
      (!search.trim() || terms.some((value) => value?.toLowerCase().includes(search.toLowerCase())))
    );
  });

  return (
    <PageShell>
      <AdSlot slot="community-top" />
      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-7 lg:grid-cols-[220px_minmax(0,1fr)_260px] lg:py-10">
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-5">
            <div>
              <p className="px-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Explore
              </p>
              <nav className="mt-3 space-y-1">
                {FILTERS.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setFilter(item.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition ${filter === item.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </button>
                ))}
              </nav>
            </div>
            <Card className="gap-2 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-primary" />
                Build together
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Share what you're creating, ask for help and discover other builders.
              </p>
              <Link to="/projects" className="text-xs font-semibold text-primary hover:underline">
                Explore projects →
              </Link>
            </Card>
          </div>
        </aside>

        <main className="min-w-0">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                ExpertsTeam social
              </p>
              <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Community</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                What builders are sharing right now.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 lg:hidden">
              {FILTERS.slice(0, 4).map((item) => (
                <Button
                  key={item.id}
                  size="sm"
                  variant={filter === item.id ? "default" : "secondary"}
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="mb-4 flex items-center gap-3">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search community posts…"
              className="h-11 rounded-xl"
            />
            {user && (
              <Button
                className="h-11 shrink-0 rounded-xl lg:hidden"
                onClick={() => setComposerOpen(true)}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Post
              </Button>
            )}
          </div>
          <div className="space-y-4">
            {isLoading && (
              <Card className="p-8 text-center text-sm text-muted-foreground">
                Loading the community feed…
              </Card>
            )}
            {isError && (
              <Card className="flex items-center justify-between gap-3 p-4">
                <p className="text-sm text-destructive">The feed could not be loaded.</p>
                <Button size="sm" variant="outline" onClick={() => void refetch()}>
                  Retry
                </Button>
              </Card>
            )}
            {!isLoading && !isError && visible.length === 0 && (
              <Card className="p-10 text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <Flame className="h-6 w-6" />
                </div>
                <h2 className="mt-4 font-semibold">
                  {posts.length ? "No matching posts" : "The community is ready for you"}
                </h2>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                  {posts.length
                    ? "Try another filter or search."
                    : "New discussions and projects will appear here. Be the first to share something when you're ready."}
                </p>
              </Card>
            )}
            {visible.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                userId={user?.id ?? null}
                canDelete={!!user && (user.id === post.user_id || isAdmin)}
                onChanged={() =>
                  void queryClient.invalidateQueries({ queryKey: ["community-posts"] })
                }
              />
            ))}
          </div>
        </main>

        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-4">
            <Card className="gap-3 p-4">
              <div className="flex items-center gap-2">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={profile?.avatar_url ?? undefined} />
                  <AvatarFallback>
                    {(profile?.display_name || profile?.username || "E").slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {profile?.display_name || profile?.username || "Join ExpertsTeam"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {user ? "Share with the community" : "Explore public posts"}
                  </p>
                </div>
              </div>
              {user ? (
                <Button className="w-full rounded-xl" onClick={() => setComposerOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create a post
                </Button>
              ) : (
                <Link to="/auth">
                  <Button className="w-full">Sign in to post</Button>
                </Link>
              )}
              <p className="text-xs leading-5 text-muted-foreground">
                Photos, questions, ideas and useful links belong here. Your feed stays front and
                centre.
              </p>
            </Card>
            <Card className="gap-2 p-4">
              <p className="text-sm font-semibold">Community guidelines</p>
              <p className="text-xs leading-5 text-muted-foreground">
                Be respectful, share useful work, credit creators and keep discussions constructive.
              </p>
            </Card>
          </div>
        </aside>
      </section>

      <Dialog open={composerOpen} onOpenChange={setComposerOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Create a community post</DialogTitle>
          </DialogHeader>
          {!user ? (
            <p className="text-sm text-muted-foreground">Sign in to share with the community.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {FILTERS.slice(1).map((item) => (
                  <Button
                    key={item.id}
                    size="sm"
                    variant={kind === item.id ? "default" : "secondary"}
                    onClick={() => setKind(item.id)}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
              <Textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={5}
                maxLength={5000}
                placeholder="Share an update, show what you're building, or ask the community…"
              />
              <Input
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
                placeholder="Add a link (optional)"
              />
              {imagePreview && (
                <div className="relative overflow-hidden rounded-xl border">
                  <img
                    src={imagePreview}
                    alt="Post preview"
                    className="max-h-72 w-full object-contain"
                  />
                  <Button
                    size="icon"
                    variant="secondary"
                    className="absolute right-2 top-2"
                    onClick={() => {
                      setImage(null);
                      setImagePreview("");
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm hover:bg-secondary">
                  <ImagePlus className="h-4 w-4" />
                  Add photo
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="sr-only"
                    onChange={(event) => chooseImage(event.target.files?.[0])}
                  />
                </label>
                <Button
                  onClick={() => createPost.mutate()}
                  disabled={createPost.isPending || (!body.trim() && !linkUrl.trim() && !image)}
                >
                  {createPost.isPending ? "Publishing…" : "Share post"}
                  <Send className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <AdSlot slot="community-bottom" />
    </PageShell>
  );
}

function PostCard({
  post,
  userId,
  canDelete,
  onChanged,
}: {
  post: Post;
  userId: string | null;
  canDelete: boolean;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [comment, setComment] = useState("");
  const [showComments, setShowComments] = useState(false);
  const author = post.profiles?.display_name || post.profiles?.username || "Community member";
  const { data: likes = [] } = useQuery({
    queryKey: ["community-likes", post.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_likes")
        .select("user_id")
        .eq("post_id", post.id);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: comments = [] } = useQuery({
    queryKey: ["community-comments", post.id],
    enabled: showComments,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_comments")
        .select(
          "id,user_id,body,created_at,profiles:profiles!community_comments_profile_fk(username,display_name,avatar_url)",
        )
        .eq("post_id", post.id)
        .order("created_at", { ascending: true })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
  const liked = likes.some((item) => item.user_id === userId);
  const like = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Sign in to like posts.");
      const result = liked
        ? await supabase
            .from("community_likes")
            .delete()
            .eq("post_id", post.id)
            .eq("user_id", userId)
        : await supabase.from("community_likes").insert({ post_id: post.id, user_id: userId });
      if (result.error) throw result.error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["community-likes", post.id] }),
    onError: (error: Error) => toast.error(error.message),
  });
  const reply = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Sign in to reply.");
      if (!comment.trim()) return;
      const { error } = await supabase
        .from("community_comments")
        .insert({ post_id: post.id, user_id: userId, body: comment.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      setComment("");
      void queryClient.invalidateQueries({ queryKey: ["community-comments", post.id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("community_posts").delete().eq("id", post.id);
      if (error) throw error;
    },
    onSuccess: onChanged,
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card className="overflow-hidden rounded-2xl border-border/70 p-0 shadow-sm">
      <div className="flex items-center justify-between gap-3 px-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={post.profiles?.avatar_url ?? undefined} />
            <AvatarFallback>{author.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{author}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(post.created_at).toLocaleString()} ·{" "}
              <span className="capitalize">{post.kind}</span>
            </p>
          </div>
        </div>
        {canDelete && (
          <Button
            size="icon"
            variant="ghost"
            aria-label="Delete post"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
          >
            <MoreHorizontal className="h-4 w-4" />
            <Trash2 className="sr-only" />
          </Button>
        )}
      </div>
      {post.media_url && (
        <img
          src={post.media_url}
          alt={post.title}
          loading="lazy"
          className="max-h-[620px] w-full bg-secondary/40 object-contain"
        />
      )}
      <div className="space-y-3 px-4 py-4">
        {post.body && (
          <p className="whitespace-pre-wrap break-words text-sm leading-6">{post.body}</p>
        )}
        {post.link_url && (
          <a
            href={post.link_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 break-all text-sm text-primary hover:underline"
          >
            <Link2 className="h-4 w-4 shrink-0" />
            {post.link_url}
          </a>
        )}
        <div className="flex items-center gap-4 border-t border-border/60 pt-3">
          <button
            onClick={() => like.mutate()}
            disabled={!userId || like.isPending}
            className={`inline-flex items-center gap-2 text-sm transition hover:text-primary ${liked ? "font-semibold text-rose-500" : "text-muted-foreground"}`}
          >
            <Heart className={`h-5 w-5 ${liked ? "fill-current" : ""}`} />
            {likes.length} likes
          </button>
          <button
            onClick={() => setShowComments((value) => !value)}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"
          >
            <MessageCircle className="h-5 w-5" />
            {showComments ? "Hide comments" : "Comments"}
          </button>
        </div>
        {showComments && (
          <div className="space-y-3 border-t border-border/60 pt-3">
            {comments.map((item) => (
              <div key={item.id} className="flex gap-2 text-sm">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={item.profiles?.avatar_url ?? undefined} />
                  <AvatarFallback>
                    {(item.profiles?.display_name || item.profiles?.username || "M")
                      .slice(0, 1)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 rounded-xl bg-secondary/60 px-3 py-2">
                  <p className="text-xs font-semibold">
                    {item.profiles?.display_name || item.profiles?.username || "Member"}
                  </p>
                  <p className="whitespace-pre-wrap break-words">{item.body}</p>
                </div>
              </div>
            ))}
            {userId && (
              <div className="flex gap-2">
                <Input
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") reply.mutate();
                  }}
                  placeholder="Add a comment…"
                />
                <Button
                  size="icon"
                  onClick={() => reply.mutate()}
                  disabled={reply.isPending || !comment.trim()}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
