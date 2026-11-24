import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Globe2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { addProjectCustomDomain, removeProjectCustomDomain, verifyProjectCustomDomain } from "@/lib/deployment.functions";

export function CustomDomainPanel({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [domain, setDomain] = useState("");
  const addDomain = useServerFn(addProjectCustomDomain);
  const verifyDomain = useServerFn(verifyProjectCustomDomain);
  const removeDomain = useServerFn(removeProjectCustomDomain);
  const domains = useQuery({
    queryKey: ["agent-project-domains", projectId],
    enabled: Boolean(projectId && user),
    queryFn: async () => {
      const { data, error } = await supabase.from("agent_project_domains").select("*")
        .eq("project_id", projectId).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["agent-project-domains", projectId] });
  const add = useMutation({
    mutationFn: () => addDomain({ data: { projectId, domain: domain.trim() } }),
    onSuccess: (result) => {
      toast.success("Domain verification record created.");
      setDomain("");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const verify = useMutation({
    mutationFn: (domainId: string) => verifyDomain({ data: { domainId } }),
    onSuccess: (result) => {
      toast.success(result.status === "active" ? "Custom domain is active with SSL." : "Domain is still pending. Check the DNS instructions and verify again.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (domainId: string) => removeDomain({ data: { domainId } }),
    onSuccess: () => { toast.success("Custom domain removed."); refresh(); },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!projectId || !user) return null;
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-md border border-slate-700 bg-slate-800/70 px-3 py-1.5 text-[11px] font-medium text-slate-200 hover:border-cyan-500/40">
        Custom domains
      </summary>
      <div className="absolute right-0 top-full z-[100] mt-2 max-h-[520px] w-[min(440px,92vw)] overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-4 shadow-2xl">
        <div className="mb-3 flex items-center gap-2"><Globe2 className="h-4 w-4 text-cyan-300" /><p className="text-sm font-semibold text-white">Connect a custom domain</p></div>
        <p className="mb-3 text-xs leading-5 text-slate-400">Add the domain you own. ExpertsTeam verifies a DNS TXT record before registering the alias with Netlify and checking HTTPS.</p>
        <div className="flex gap-2">
          <Input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="www.yourdomain.com" className="border-slate-700 bg-slate-900 text-white" />
          <Button type="button" size="sm" disabled={add.isPending || domain.trim().length < 4} onClick={() => add.mutate()}><Plus className="h-4 w-4" /> Add</Button>
        </div>
        <div className="mt-3 space-y-3">
          {domains.data?.map((item) => (
            <Card key={item.id} className="space-y-2 border-slate-800 bg-slate-900 p-3 text-slate-100">
              <div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-semibold">{item.domain}</p><span className={item.status === "active" ? "rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-300" : "rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-200"}>{item.status}{item.ssl_ready ? " · SSL" : ""}</span></div>
              <div className="space-y-1 rounded-lg bg-slate-950 p-2 text-[10px]">
                <p className="font-semibold text-slate-300">1. Add this TXT record</p>
                <p className="break-all text-slate-400">Host: {item.verification_host}</p>
                <p className="break-all text-cyan-200">Value: {item.verification_token}</p>
                <p className="mt-2 font-semibold text-slate-300">2. Point the domain to Netlify</p>
                <p className="break-all text-slate-400">CNAME target: {item.dns_target}</p>
                <p className="text-slate-500">For an apex/root domain, use your DNS provider's ALIAS/ANAME to apex-loadbalancer.netlify.com or the A record 75.2.60.5.</p>
              </div>
              <div className="flex justify-end gap-2">
                {item.status !== "active" && <Button type="button" size="sm" variant="outline" className="h-7 text-[10px]" disabled={verify.isPending} onClick={() => verify.mutate(item.id)}><RefreshCw className="mr-1 h-3 w-3" /> Verify DNS / SSL</Button>}
                <Button type="button" size="sm" variant="ghost" className="h-7 text-[10px] text-rose-300 hover:text-rose-200" disabled={remove.isPending} onClick={() => { if (window.confirm("Remove this custom domain from the project?")) remove.mutate(item.id); }}><Trash2 className="mr-1 h-3 w-3" /> Remove</Button>
              </div>
            </Card>
          ))}
          {!domains.data?.length && <p className="py-3 text-xs text-slate-500">No custom domains connected yet.</p>}
        </div>
      </div>
    </details>
  );
}
