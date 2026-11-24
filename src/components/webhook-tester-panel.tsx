import { useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, Globe, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type TestResult = { ok: boolean; status: number; statusText: string; duration: number; body: string };

const blockedHeaders = new Set(["host", "cookie", "origin", "content-length", "connection", "transfer-encoding"]);

export function WebhookTesterPanel() {
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState<"POST" | "PUT" | "PATCH">("POST");
  const [headersText, setHeadersText] = useState('{\n  "Content-Type": "application/json"\n}');
  const [bodyText, setBodyText] = useState('{\n  "event": "test",\n  "source": "expertsteam-studio"\n}');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState("");

  async function sendTest() {
    setError("");
    setResult(null);
    let target: URL;
    let headers: Record<string, string>;
    let payload: unknown;
    try {
      target = new URL(url.trim());
      if (target.protocol !== "https:") throw new Error("Use an HTTPS endpoint.");
      if (target.username || target.password) throw new Error("Do not embed credentials in the endpoint URL.");
      headers = JSON.parse(headersText) as Record<string, string>;
      if (!headers || Array.isArray(headers) || typeof headers !== "object") throw new Error("Headers must be a JSON object.");
      for (const [key, value] of Object.entries(headers)) {
        if (blockedHeaders.has(key.toLowerCase())) throw new Error("The " + key + " header is controlled by the browser and cannot be set.");
        if (typeof value !== "string") throw new Error("Header values must be strings.");
      }
      payload = JSON.parse(bodyText);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Check the endpoint, headers and JSON body.");
      return;
    }
    setBusy(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    const started = performance.now();
    try {
      const response = await fetch(target.toString(), {
        method,
        headers,
        body: JSON.stringify(payload),
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        signal: controller.signal,
      });
      const body = (await response.text()).slice(0, 10_000);
      setResult({
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        duration: Math.round(performance.now() - started),
        body,
      });
    } catch (cause) {
      setError(cause instanceof Error && cause.name === "AbortError"
        ? "Request timed out after 15 seconds."
        : "The browser could not reach this endpoint. Check the URL, CORS policy and network.");
    } finally {
      window.clearTimeout(timeout);
      setBusy(false);
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="h-7 border-slate-700 px-2 text-[9px]">
          <Globe className="mr-1 h-3 w-3" /> Webhook tester
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-slate-700 bg-[#0b1320] text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Send className="h-4 w-4 text-cyan-300" /> Webhook tester</DialogTitle>
          <p className="text-xs text-slate-400">Send a test JSON event directly from this browser to an HTTPS endpoint. Headers and payload are used only for this request and are not saved.</p>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_110px] gap-2">
            <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://your-domain.com/api/webhooks/test" className="border-slate-700 bg-slate-900 text-white" />
            <select value={method} onChange={(event) => setMethod(event.target.value as typeof method)} className="h-10 rounded-md border border-slate-700 bg-slate-900 px-2 text-sm text-white">
              <option>POST</option><option>PUT</option><option>PATCH</option>
            </select>
          </div>
          <label className="block space-y-1 text-xs text-slate-300">Request headers (JSON)
            <Textarea value={headersText} onChange={(event) => setHeadersText(event.target.value)} rows={4} className="border-slate-700 bg-slate-950 font-mono text-[11px] text-slate-100" />
          </label>
          <label className="block space-y-1 text-xs text-slate-300">JSON payload
            <Textarea value={bodyText} onChange={(event) => setBodyText(event.target.value)} rows={7} className="border-slate-700 bg-slate-950 font-mono text-[11px] text-slate-100" />
          </label>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] text-slate-500">Browser CORS rules apply · 15-second timeout · redirects blocked</p>
            <Button type="button" onClick={() => void sendTest()} disabled={busy || !url.trim()}>
              <Send className="mr-1 h-3.5 w-3.5" /> {busy ? "Sending…" : "Send test"}
            </Button>
          </div>
          {error && <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200"><AlertCircle className="mr-1 inline h-3.5 w-3.5" />{error}</div>}
          {result && (
            <div className="rounded-lg border border-slate-700 bg-slate-950 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className={result.ok ? "text-xs font-semibold text-emerald-300" : "text-xs font-semibold text-rose-300"}>
                  {result.ok ? <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" /> : <AlertCircle className="mr-1 inline h-3.5 w-3.5" />}
                  HTTP {result.status} {result.statusText}
                </span>
                <span className="text-[10px] text-slate-500"><Clock3 className="mr-1 inline h-3 w-3" />{result.duration} ms</span>
              </div>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-[10px] text-slate-300">{result.body || "(empty response)"}{result.body.length >= 10_000 ? "\n… response truncated at 10 KB" : ""}</pre>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
