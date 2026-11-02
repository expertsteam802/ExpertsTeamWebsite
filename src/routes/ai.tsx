import { createFileRoute } from "@tanstack/react-router";

import { CodeAgent } from "@/components/code-agent";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/ai")({
  head: () => ({
    meta: [
      { title: "ExpertsAgent — full builder workspace" },
      {
        name: "description",
        content:
          "ExpertsAgent is a Bolt-style full-stack app building workspace with terminal, project navigation, and live app generation.",
      },
      { property: "og:title", content: "ExpertsAgent — full builder workspace" },
      {
        property: "og:description",
        content:
          "Build, edit, preview, deploy, and push full-stack web apps inside a serious Bolt-inspired agent workspace.",
      },
    ],
  }),
  component: AiPage,
});

function AiPage() {
  return (
    <PageShell>
      <section className="mx-auto w-full max-w-[1800px] px-3 py-4 lg:px-6">
        <div className="overflow-hidden rounded-[28px] border border-border/80 bg-background/80 shadow-[0_20px_80px_rgba(15,23,42,0.18)] backdrop-blur-sm">
          <header className="flex flex-col gap-4 border-b border-border/70 bg-[#0d1220] px-4 py-3 text-white lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 via-blue-500 to-violet-500 text-sm font-black text-slate-950 shadow-lg shadow-cyan-500/25">
                E
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-300/80">
                  ExpertsAgent
                </p>
                <h1 className="text-base font-semibold tracking-tight">Full builder workspace</h1>
              </div>
            </div>

            <nav className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
              {[
                "Builder",
                "Files",
                "Terminal",
                "Preview",
                "GitHub",
                "Deploy",
              ].map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`rounded-full border px-3 py-1.5 transition ${
                    item === "Builder"
                      ? "border-cyan-400/50 bg-cyan-500/10 text-cyan-200"
                      : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:text-white"
                  }`}
                >
                  {item}
                </button>
              ))}
            </nav>

            <div className="flex items-center gap-2">
              <Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10">
                Save
              </Button>
              <Button className="bg-cyan-400 text-slate-950 hover:bg-cyan-300">Publish</Button>
            </div>
          </header>

          <div className="grid gap-4 bg-slate-950/80 p-3 lg:grid-cols-[220px_minmax(0,1fr)]">
            <aside className="rounded-2xl border border-white/10 bg-slate-900/80 p-3 text-slate-200">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                  Project
                </p>
                <button type="button" className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-slate-300">
                  + Add
                </button>
              </div>

              <div className="space-y-2">
                {[
                  "app/page.tsx",
                  "app/layout.tsx",
                  "app/globals.css",
                  "components/header.tsx",
                  "components/hero.tsx",
                  "lib/data.ts",
                  "README.md",
                ].map((file, index) => (
                  <button
                    key={file}
                    type="button"
                    className={`flex w-full items-center justify-between rounded-xl border px-2.5 py-2 text-left text-xs transition ${
                      index === 0
                        ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-100"
                        : "border-transparent bg-white/[0.02] text-slate-300 hover:border-white/10 hover:bg-white/[0.04]"
                    }`}
                  >
                    <span className="truncate">{file}</span>
                    <span className="text-[10px] text-slate-500">{index + 1}</span>
                  </button>
                ))}
              </div>

              <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                  Live status
                </p>
                <div className="space-y-2 text-xs text-slate-300">
                  <div className="flex items-center justify-between">
                    <span>Build</span>
                    <span className="text-emerald-400">Ready</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Deploy</span>
                    <span className="text-cyan-300">Online</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>GitHub</span>
                    <span className="text-violet-300">Synced</span>
                  </div>
                </div>
              </div>
            </aside>

            <main className="min-h-[780px] rounded-2xl border border-border/70 bg-background/90">
              <CodeAgent />
            </main>
          </div>

          <div className="border-t border-border/70 bg-[#0b1120] p-3 text-slate-200">
            <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-2xl border border-white/10 bg-[#020817] p-3">
                <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                  <span>Terminal</span>
                  <span className="text-emerald-400">Live</span>
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-6 text-cyan-200">
{`$ npm install
added 214 packages in 2.1s

$ npm run build
✓ compiled successfully

$ git status
On branch main
Your branch is up to date with 'origin/main'

$ npx experts-agent deploy
Deploying to example.expertagent.app...
✓ production build published`}
                </pre>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#020817] p-3">
                <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                  <span>Agent log</span>
                  <span className="text-violet-300">Active</span>
                </div>
                <div className="space-y-2 text-xs text-slate-300">
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2">
                    Parsing request and scaffolding app structure.
                  </div>
                  <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-2">
                    Connecting to GitHub and checking repo sync status.
                  </div>
                  <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-2">
                    Generating production-ready front-end and deployment assets.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
