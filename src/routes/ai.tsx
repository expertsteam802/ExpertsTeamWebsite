import { createFileRoute } from "@tanstack/react-router";

import { ChrisAiChat, ChrisAiWorkspace } from "@/components/chris-ai";
import { CodeAgent } from "@/components/code-agent";
import { PageShell } from "@/components/layout/page-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/ai")({
  head: () => ({
    meta: [
      { title: "Experts Team 802 AI — app builder, plans & code assistant" },
      {
        name: "description",
        content:
          "Experts Team 802 AI helps you plan products, build apps, and generate working code inside a serious workspace.",
      },
      { property: "og:title", content: "Experts Team 802 AI — app builder, plans & code assistant" },
      {
        property: "og:description",
        content:
          "Ask Experts Team 802 AI to plan your product, design a database, or generate real app code.",
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
          <h1 className="font-display text-3xl font-semibold tracking-tight">Experts Team 802 AI</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Plan products, discuss architecture, build apps, and generate working code in a serious workspace.
          </p>
        </div>

        <Tabs defaultValue="agent" className="mt-6">
          <TabsList>
            <TabsTrigger value="agent">App builder agent</TabsTrigger>
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="workspace">Snippets</TabsTrigger>
          </TabsList>
          <TabsContent value="agent" className="pt-4">
            <CodeAgent />
          </TabsContent>
          <TabsContent value="chat" className="pt-4">
            <ChrisAiChat />
          </TabsContent>
          <TabsContent value="workspace" className="pt-4">
            <ChrisAiWorkspace />
          </TabsContent>
        </Tabs>
      </section>
    </PageShell>
  );
}
