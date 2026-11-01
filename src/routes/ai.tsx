import { createFileRoute } from "@tanstack/react-router";

import { ChrisAiChat, ChrisAiWorkspace } from "@/components/chris-ai";
import { CodeAgent } from "@/components/code-agent";
import { PageShell } from "@/components/layout/page-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/ai")({
  head: () => ({
    meta: [
      { title: "Chris AI — PC, games & code assistant" },
      {
        name: "description",
        content:
          "Chris AI answers PC and hardware questions, helps with games and writes code inside a live workspace on Chris Programs.",
      },
      { property: "og:title", content: "Chris AI — PC, games & code assistant" },
      {
        property: "og:description",
        content:
          "Ask Chris AI about PC builds, games and programming, then generate code in the workspace.",
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
          <h1 className="font-display text-3xl font-semibold tracking-tight">Chris AI</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Your assistant for PC information, games and programming. Chat for answers, or switch to
            the workspace to generate and edit code.
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
