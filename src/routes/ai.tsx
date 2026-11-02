import { createFileRoute } from "@tanstack/react-router";

import { ChrisAiChat } from "@/components/chris-ai";
import { CodeAgent } from "@/components/code-agent";
import { PageShell } from "@/components/layout/page-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/ai")({
  head: () => ({
    meta: [
      { title: "ExpertsAgent — full builder workspace" },
      {
        name: "description",
        content:
          "ExpertsAgent is a full-stack app-building workspace with project files, preview, console, publishing, and GitHub sync.",
      },
      { property: "og:title", content: "ExpertsAgent — full builder workspace" },
      {
        property: "og:description",
        content:
          "Build, preview, edit, and publish apps from a full builder workspace inside Experts Team.",
      },
    ],
  }),
  component: AiPage,
});

function AiPage() {
  return (
    <PageShell>
      <section className="mx-auto max-w-5xl px-4 py-10">
        <div className="animate-rise">
          <h1 className="font-display text-3xl font-semibold tracking-tight">Expert AI</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Build apps, discuss architecture, analyze pasted or uploaded files, and generate image ideas.
          </p>
        </div>

        <Tabs defaultValue="agent" className="mt-6">
          <TabsList>
            <TabsTrigger value="agent">Expert Agent</TabsTrigger>
            <TabsTrigger value="chat">Expert Chat</TabsTrigger>
          </TabsList>
          <TabsContent value="agent" className="pt-4">
            <CodeAgent />
          </TabsContent>
          <TabsContent value="chat" className="pt-4">
            <ChrisAiChat />
          </TabsContent>
        </Tabs>
      </section>
    </PageShell>
  );
}
