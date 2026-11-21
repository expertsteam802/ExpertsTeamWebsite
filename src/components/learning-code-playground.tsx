import { useMemo, useState } from "react";
import { Code2, Eye, Play, X } from "lucide-react";
import CodeMirror from "@uiw/react-codemirror";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const STARTER_HTML = `<main class="card">
  <h1>Hello, learner!</h1>
  <p>Change the code and preview your result.</p>
  <button id="try">Try it</button>
  <p id="result"></p>
</main>`;
const STARTER_CSS = `body {
  margin: 0;
  padding: 2rem;
  font-family: system-ui, sans-serif;
  background: #f1f5f9;
  color: #0f172a;
}
.card {
  max-width: 520px;
  margin: auto;
  padding: 2rem;
  border-radius: 1rem;
  background: white;
  box-shadow: 0 12px 40px #0f172a18;
}
button {
  padding: .7rem 1rem;
  border: 0;
  border-radius: .6rem;
  background: #2563eb;
  color: white;
  cursor: pointer;
}`;
const STARTER_JS = `document.querySelector("#try").addEventListener("click", () => {
  document.querySelector("#result").textContent = "Great work — your JavaScript runs!";
});`;

export function LearningCodePlayground({ floating = true }: { floating?: boolean }) {
  const [open, setOpen] = useState(false);
  const [htmlCode, setHtmlCode] = useState(STARTER_HTML);
  const [cssCode, setCssCode] = useState(STARTER_CSS);
  const [jsCode, setJsCode] = useState(STARTER_JS);
  const [activeTab, setActiveTab] = useState<"html" | "css" | "js">("html");
  const [previewVersion, setPreviewVersion] = useState(0);

  const previewDocument = useMemo(() => {
    const safeJs = jsCode.replace(/<\/script/gi, "<\\/script");
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${cssCode.replace(/<\/style/gi, "")}</style></head><body>${htmlCode}<script>try { ${safeJs} } catch (error) { document.body.insertAdjacentHTML("beforeend", '<pre style="color:#b91c1c"></pre>'); document.querySelector('body > pre:last-child').textContent = error.message; }</script></body></html>`;
  }, [htmlCode, cssCode, jsCode, previewVersion]);

  const currentCode = activeTab === "html" ? htmlCode : activeTab === "css" ? cssCode : jsCode;
  const setCurrentCode = activeTab === "html" ? setHtmlCode : activeTab === "css" ? setCssCode : setJsCode;
  const extensions = activeTab === "html" ? [html()] : activeTab === "css" ? [css()] : [javascript()];

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className={floating ? "fixed bottom-5 right-5 z-[100] h-12 rounded-full px-5 shadow-xl" : "h-10 shrink-0 rounded-full px-4"}
      >
        <Code2 className="mr-2 h-4 w-4" /> Open code editor
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[min(88dvh,850px)] w-[min(96vw,1440px)] max-w-[96vw] flex-col gap-3 overflow-hidden border-border bg-background p-3 sm:p-5">
          <DialogHeader className="shrink-0">
            <div className="flex items-center justify-between gap-3 pr-8">
              <div>
                <DialogTitle className="flex items-center gap-2"><Code2 className="h-5 w-5 text-primary" /> Learning code workspace</DialogTitle>
                <p className="mt-1 text-xs text-muted-foreground">Experiment with HTML, CSS and JavaScript while your lesson stays open.</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setPreviewVersion((v) => v + 1)}><Play className="mr-2 h-4 w-4" /> Run preview</Button>
            </div>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
            <section className="flex min-h-[260px] min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-[#111827]">
              <div className="flex shrink-0 items-center gap-1 border-b border-white/10 bg-[#0b1220] p-2">
                {(["html", "css", "js"] as const).map((tab) => (
                  <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`rounded-md px-3 py-1.5 text-xs font-semibold uppercase ${activeTab === tab ? "bg-primary text-primary-foreground" : "text-slate-400 hover:bg-white/10"}`}>{tab}</button>
                ))}
                <span className="ml-auto text-[11px] text-slate-500">Code editor</span>
              </div>
              <div className="min-h-[260px] flex-1 overflow-auto text-sm">
                <CodeMirror value={currentCode} height="100%" minHeight="260px" theme={oneDark} extensions={extensions} onChange={setCurrentCode} basicSetup={{ lineNumbers: true, foldGutter: true, autocompletion: true }} />
              </div>
            </section>
            <section className="flex min-h-[260px] min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
                <Eye className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold">Live preview</span>
                <span className="ml-auto text-[11px] text-muted-foreground">Sandboxed</span>
              </div>
              <iframe key={previewVersion} title="Learning code live preview" srcDoc={previewDocument} sandbox="allow-scripts" className="min-h-[260px] flex-1 bg-white" />
            </section>
          </div>
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border pt-2">
            <p className="text-[11px] text-muted-foreground">Your code runs locally in this preview. It is not published or saved.</p>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}><X className="mr-1 h-4 w-4" /> Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
