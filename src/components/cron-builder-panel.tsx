import { useMemo, useState } from "react";
import { ClipboardCopy, Clock3 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type SchedulePreset = "every5" | "hourly" | "daily" | "weekly" | "monthly" | "custom";
type ActionType = "sql" | "http";

const schedules: Record<Exclude<SchedulePreset, "custom">, string> = {
  every5: "*/5 * * * *",
  hourly: "0 * * * *",
  daily: "0 0 * * *",
  weekly: "0 0 * * 0",
  monthly: "0 0 1 * *",
};

function quoteSql(value: string) {
  return "'" + value.replace(/'/g, "''") + "'";
}

function dollarQuote(value: string) {
  let tag = "$experts_cron_job$";
  let index = 1;
  while (value.includes(tag)) tag = "$experts_cron_job_" + index++ + "$";
  return tag + "\n" + value + "\n" + tag;
}

export function CronBuilderPanel() {
  const [jobName, setJobName] = useState("daily-maintenance");
  const [preset, setPreset] = useState<SchedulePreset>("daily");
  const [customSchedule, setCustomSchedule] = useState("0 0 * * *");
  const [actionType, setActionType] = useState<ActionType>("sql");
  const [sqlCommand, setSqlCommand] = useState("select public.my_maintenance_function();");
  const [httpUrl, setHttpUrl] = useState("https://PROJECT_REF.supabase.co/functions/v1/YOUR_FUNCTION");
  const [httpBody, setHttpBody] = useState('{\n  "source": "scheduled-job"\n}');

  const schedule = preset === "custom" ? customSchedule.trim() : schedules[preset];
  const safeJobName =
    jobName.toLowerCase().trim().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) ||
    "experts-scheduled-job";
  const validSchedule = /^([*0-9/,?-]+\s+){4}[*0-9/,?-]+$/.test(schedule);
  const validHttp = (() => {
    try {
      return new URL(httpUrl).protocol === "https:";
    } catch {
      return false;
    }
  })();
  const validBody = (() => {
    try {
      JSON.parse(httpBody);
      return true;
    } catch {
      return false;
    }
  })();
  const validCommand = actionType === "sql" ? sqlCommand.trim().length > 0 : validHttp && validBody;

  const snippet = useMemo(() => {
    const command =
      actionType === "sql"
        ? sqlCommand.trim()
        : `select net.http_post(
  url := ${quoteSql(httpUrl.trim())},
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'project-cron-secret' limit 1)
  ),
  body := ${quoteSql(httpBody)}::jsonb
);`;
    return `-- Run this in your own Supabase SQL Editor.
create extension if not exists pg_cron with schema pg_catalog;
${actionType === "http" ? "create extension if not exists pg_net with schema extensions;\ncreate extension if not exists supabase_vault with schema vault;\nselect vault.create_secret('REPLACE_WITH_A_LONG_RANDOM_SECRET', 'project-cron-secret');\n" : ""}
select cron.schedule(
  ${quoteSql(safeJobName)},
  ${quoteSql(schedule)},
  ${dollarQuote(command)}
);
`;
  }, [actionType, httpBody, httpUrl, safeJobName, schedule, sqlCommand]);

  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-md border border-slate-700 bg-slate-800/70 px-3 py-1.5 text-[11px] font-medium text-slate-200 hover:border-cyan-500/40">
        <Clock3 className="mr-1 inline h-3.5 w-3.5" /> Cron builder
      </summary>
      <div className="absolute right-0 top-full z-[100] mt-2 max-h-[620px] w-[min(560px,94vw)] overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-4 shadow-2xl">
        <div className="mb-3">
          <p className="text-sm font-semibold text-white">Scheduled job builder</p>
          <p className="mt-1 text-xs text-slate-400">
            Generate a pg_cron SQL migration for your own Supabase project. This SQL is not executed against the shared ExpertsTeam database.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs text-slate-300">
            Job name
            <Input value={jobName} onChange={(event) => setJobName(event.target.value)} maxLength={80} className="border-slate-700 bg-slate-900 text-white" />
          </label>
          <label className="space-y-1 text-xs text-slate-300">
            Frequency
            <select value={preset} onChange={(event) => setPreset(event.target.value as SchedulePreset)} className="h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-white">
              <option value="every5">Every 5 minutes</option>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="custom">Custom cron</option>
            </select>
          </label>
          {preset === "custom" && (
            <label className="space-y-1 text-xs text-slate-300 sm:col-span-2">
              Cron expression (minute hour day month weekday)
              <Input value={customSchedule} onChange={(event) => setCustomSchedule(event.target.value)} className="border-slate-700 bg-slate-900 font-mono text-white" />
            </label>
          )}
          <label className="space-y-1 text-xs text-slate-300 sm:col-span-2">
            Action type
            <select value={actionType} onChange={(event) => setActionType(event.target.value as ActionType)} className="h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-white">
              <option value="sql">Run SQL function / command</option>
              <option value="http">Call Supabase Edge Function over HTTPS</option>
            </select>
          </label>
          {actionType === "sql" ? (
            <label className="space-y-1 text-xs text-slate-300 sm:col-span-2">
              SQL command
              <Textarea rows={5} value={sqlCommand} onChange={(event) => setSqlCommand(event.target.value)} className="border-slate-700 bg-slate-900 font-mono text-xs text-white" />
            </label>
          ) : (
            <>
              <label className="space-y-1 text-xs text-slate-300 sm:col-span-2">
                HTTPS endpoint
                <Input value={httpUrl} onChange={(event) => setHttpUrl(event.target.value)} className="border-slate-700 bg-slate-900 font-mono text-white" />
              </label>
              <label className="space-y-1 text-xs text-slate-300 sm:col-span-2">
                JSON body
                <Textarea rows={4} value={httpBody} onChange={(event) => setHttpBody(event.target.value)} className="border-slate-700 bg-slate-900 font-mono text-xs text-white" />
              </label>
            </>
          )}
        </div>
        {!validSchedule && <p className="mt-2 text-xs text-rose-300">Enter a five-field cron expression.</p>}
        {actionType === "http" && !validHttp && <p className="mt-2 text-xs text-rose-300">The endpoint must use HTTPS.</p>}
        {actionType === "http" && !validBody && <p className="mt-2 text-xs text-rose-300">The request body must be valid JSON.</p>}
        {actionType === "sql" && !sqlCommand.trim() && <p className="mt-2 text-xs text-rose-300">Enter a SQL command or function call.</p>}
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-[10px] text-slate-500">Schedule: <code>{schedule}</code></p>
          <Button type="button" size="sm" disabled={!validSchedule || !validCommand || !snippet.trim()} onClick={() => {
            void navigator.clipboard.writeText(snippet).then(
              () => toast.success("Cron SQL copied."),
              () => toast.error("Could not copy the SQL."),
            );
          }}>
            <ClipboardCopy className="mr-1 h-3.5 w-3.5" /> Copy SQL
          </Button>
        </div>
        <pre className="mt-3 max-h-52 overflow-auto rounded-lg border border-slate-800 bg-black/40 p-3 text-[10px] leading-5 text-cyan-100"><code>{snippet}</code></pre>
      </div>
    </details>
  );
}
