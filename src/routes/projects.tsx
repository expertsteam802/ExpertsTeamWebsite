import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WorkspaceChat } from "@/components/workspace-chat";
import { DeveloperVault } from "@/components/developer-vault";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/projects")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Apply to ExpertsTeam | Contributor Community" },
      {
        name: "description",
        content:
          "Apply to join the ExpertsTeam contributor workspace for web, game, map or sound development.",
      },
      { property: "og:title", content: "Apply to ExpertsTeam" },
      {
        property: "og:description",
        content:
          "Apply to contribute to ExpertsTeam projects and collaborate with the approved development team.",
      },
      { property: "og:url", content: "https://expertsteam.giize.com/projects" },
      { property: "og:image", content: "https://expertsteam.giize.com/social-preview.png" },
      { name: "twitter:image", content: "https://expertsteam.giize.com/social-preview.png" },
    ],
    links: [{ rel: "canonical", href: "https://expertsteam.giize.com/projects" }],
  }),
  component: ProjectsPage,
});

type ProjectRequest = {
  id: string;
  title: string;
  summary: string;
  skills: string | null;
  contact: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
};

const STATUS_ICON: Record<string, typeof Clock> = {
  pending: Clock,
  approved: CheckCircle2,
  declined: XCircle,
};

function ApplicationPanel() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [skills, setSkills] = useState("");
  const [contact, setContact] = useState("");

  const { data: requests = [] } = useQuery({
    queryKey: ["project-requests", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_requests")
        .select("id, title, summary, skills, contact, status, admin_note, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ProjectRequest[];
    },
  });

  const apply = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in to apply.");
      if (title.trim().length < 3) throw new Error("Give your application a title.");
      if (summary.trim().length < 20)
        throw new Error(
          "Tell the team a bit more about your experience or the work you want to contribute (20+ characters).",
        );
      const { error } = await supabase.from("project_requests").insert({
        user_id: user.id,
        title: title.trim().slice(0, 120),
        summary: summary.trim().slice(0, 4000),
        skills: skills.trim() ? skills.trim().slice(0, 300) : null,
        contact: contact.trim() ? contact.trim().slice(0, 200) : null,
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Application sent — the ExpertsTeam leads will review it in the dashboard.");
      setTitle("");
      setSummary("");
      setSkills("");
      setContact("");
      void queryClient.invalidateQueries({ queryKey: ["project-requests"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section
      id="developer-application"
      className="mx-auto grid max-w-5xl gap-6 px-4 py-10 lg:grid-cols-[1.1fr_1fr]"
    >
      <Card className="animate-rise gap-4 p-6 glow-panel">
        <h2 className="font-display text-xl font-semibold">Apply to join the developer team</h2>
        <p className="text-sm text-muted-foreground">
          Join the people building ExpertsTeam. Send your skills and interests; the team reviews
          every application before granting workspace access.
        </p>
        {user ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="pr-title">Title</Label>
              <Input
                id="pr-title"
                placeholder="Unity map editor"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pr-summary">What can you build?</Label>
              <Textarea
                id="pr-summary"
                rows={5}
                placeholder="Describe the work you want to join or the tools you build."
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pr-skills">Skills</Label>
              <Input
                id="pr-skills"
                placeholder="React, Python, C#, design…"
                value={skills}
                onChange={(event) => setSkills(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pr-contact">Contact (email, WhatsApp, Instagram)</Label>
              <Input
                id="pr-contact"
                value={contact}
                onChange={(event) => setContact(event.target.value)}
              />
            </div>
            <Button onClick={() => apply.mutate()} disabled={apply.isPending}>
              Send application
            </Button>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Sign in to request workspace access.</p>
            <Link to="/auth">
              <Button>Sign in</Button>
            </Link>
          </div>
        )}
      </Card>

      <div className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Your requests</h2>
        {requests.map((request) => {
          const Icon = STATUS_ICON[request.status] ?? Clock;
          return (
            <Card key={request.id} className="gap-2 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{request.title}</p>
                <span className="flex items-center gap-1 text-xs capitalize text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" /> {request.status}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{request.summary}</p>
              <p className="text-xs text-muted-foreground">Sent {formatDate(request.created_at)}</p>
              {request.admin_note && (
                <p className="rounded-md bg-secondary p-2 text-xs">
                  Team review: {request.admin_note}
                </p>
              )}
            </Card>
          );
        })}
        {user && !requests.length && (
          <p className="text-sm text-muted-foreground">
            No applications yet — send your first one.
          </p>
        )}
      </div>
    </section>
  );
}

function ProjectsPage() {
  const { user, isAdmin, isDeveloper } = useAuth();
  const [workspaceTab, setWorkspaceTab] = useState<"workspace" | "vault">("workspace");

  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "vault") {
      setWorkspaceTab("vault");
    }
  }, []);

  const { data: approvedCount = 0, isLoading } = useQuery({
    queryKey: ["workspace-access", user?.id],
    enabled: Boolean(user) && !isAdmin,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("project_requests")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("status", "approved");
      if (error) throw error;
      return count ?? 0;
    },
  });

  const isMember = isAdmin || isDeveloper || approvedCount > 0;

  return (
    <PageShell>
      <section className="hero-surface border-b border-border/60 px-4 py-14">
        <div className="mx-auto max-w-6xl">
          <h1 className="animate-rise font-display text-3xl font-bold sm:text-4xl">
            <span className="brand-text">ExpertsTeam</span> workspace
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            The company hub: group channels for map editors, sound editors, game and web development
            — every chat saved to the team database.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {["Chris Expert", "Angelo Codes", "Dismas"].map((member) => (
              <span
                key={member}
                className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-semibold"
              >
                {member}
              </span>
            ))}
          </div>
          <a
            href="#developer-application"
            className="mt-5 inline-flex items-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            Apply to become a developer
          </a>
        </div>
      </section>
      {user && isMember ? (
        <section className="mx-auto max-w-6xl space-y-5 px-4 py-10">
          <div className="flex flex-wrap items-center gap-2 border-b border-border/60 pb-3">
            <Button
              size="sm"
              variant={workspaceTab === "workspace" ? "default" : "outline"}
              onClick={() => setWorkspaceTab("workspace")}
            >
              Team workspace
            </Button>
            {(isDeveloper || isAdmin) && (
              <Button
                size="sm"
                variant={workspaceTab === "vault" ? "default" : "outline"}
                onClick={() => setWorkspaceTab("vault")}
              >
                Developer Vault
              </Button>
            )}
          </div>
          {workspaceTab === "vault" && (isDeveloper || isAdmin) ? <DeveloperVault /> : <WorkspaceChat />}
        </section>
      ) : isLoading && user ? (
        <p className="mx-auto max-w-6xl px-4 py-10 text-sm text-muted-foreground">
          Checking your access…
        </p>
      ) : (
        <ApplicationPanel />
      )}
    </PageShell>
  );
}
