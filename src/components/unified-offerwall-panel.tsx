import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { createToroxWallSession, getCpxWallConfig } from "@/lib/offerwall.functions";

const publicEnv = import.meta.env as unknown as Record<string, string | undefined>;

export function UnifiedOfferwallPanel() {
  const { user } = useAuth();
  const [toroxWallUrl, setToroxWallUrl] = useState("");
  const createToroxSession = useServerFn(createToroxWallSession);
  const loadCpxConfig = useServerFn(getCpxWallConfig);
  const cpx = useQuery({
    queryKey: ["cpx-wall-config", user?.id],
    enabled: Boolean(user),
    retry: false,
    queryFn: () => loadCpxConfig({ data: {} }),
  });
  const torox = useMutation({
    mutationFn: () => createToroxSession({ data: {} }),
    onSuccess: ({ wallUrl }) => setToroxWallUrl(wallUrl),
    onError: (error: Error) => toast.error(error.message),
  });
  if (!user) return null;

  const adGateWallId = publicEnv["VITE_ADGATE_WALL_ID"]?.trim() ?? "";
  const lootablyTemplate = publicEnv["VITE_LOOTABLY_IFRAME_TEMPLATE"]?.trim() ?? "";
  let lootablyUrl = "";
  if (lootablyTemplate.includes("{USER_ID}")) {
    try {
      const candidate = new URL(lootablyTemplate.replaceAll("{USER_ID}", encodeURIComponent(user.id)));
      if (candidate.protocol === "https:" && candidate.hostname.endsWith("lootably.com")) lootablyUrl = candidate.toString();
    } catch {
      lootablyUrl = "";
    }
  }
  const cpxUrl = cpx.data
    ? "https://offers.cpx-research.com/index.php?app_id=" + encodeURIComponent(cpx.data.appId) +
      "&ext_user_id=" + encodeURIComponent(user.id) + "&secure_hash=" + encodeURIComponent(cpx.data.secureHash)
    : "";

  return (
    <section className="space-y-4">
      <div>
        <div className="flex items-center gap-2"><Wallet className="h-5 w-5 text-primary" /><h2 className="font-display text-xl font-semibold">Partner offerwalls</h2></div>
        <p className="mt-1 text-sm text-muted-foreground">Complete eligible surveys, app installs and partner tasks. Rewards arrive only after a verified server callback.</p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">Torox</h3><p className="text-xs text-muted-foreground">Secure per-user session</p></div><ShieldCheck className="h-4 w-4 text-primary" /></div>
          {toroxWallUrl ? (
            <iframe title="Torox offerwall" src={toroxWallUrl} className="h-[620px] w-full rounded-xl border" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
          ) : (
            <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-4 text-center">
              <p className="max-w-sm text-xs text-muted-foreground">Torox creates a short-lived session for your account when you open the wall.</p>
              <Button onClick={() => torox.mutate()} disabled={torox.isPending}>
                {torox.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                {torox.isPending ? "Opening Torox…" : "Open Torox offers"}
              </Button>
            </div>
          )}
        </Card>
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">AdGate Rewards</h3><p className="text-xs text-muted-foreground">Surveys, apps and tasks</p></div><ShieldCheck className="h-4 w-4 text-primary" /></div>
          {adGateWallId ? (
            <iframe title="AdGate Rewards offerwall" src={"https://wall.adgaterewards.com/" + encodeURIComponent(adGateWallId) + "/" + encodeURIComponent(user.id)} className="h-[620px] w-full rounded-xl border bg-white" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
          ) : <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Waiting for the AdGate wall ID in VITE_ADGATE_WALL_ID.</p>}
        </Card>
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">CPX Research</h3><p className="text-xs text-muted-foreground">Survey inventory</p></div><ShieldCheck className="h-4 w-4 text-primary" /></div>
          {cpxUrl ? (
            <iframe title="CPX Research surveys" src={cpxUrl} className="h-[620px] w-full rounded-xl border bg-white" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
          ) : <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">{cpx.isLoading ? "Checking CPX configuration…" : "Waiting for CPX_APP_ID and CPX_APP_SECRET in the server environment."}</p>}
        </Card>
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">Lootably</h3><p className="text-xs text-muted-foreground">Games, surveys and offers</p></div><ShieldCheck className="h-4 w-4 text-primary" /></div>
          {lootablyUrl ? (
            <iframe title="Lootably offerwall" src={lootablyUrl} className="h-[620px] w-full rounded-xl border bg-white" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
          ) : <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Waiting for a Lootably iframe template with a USER_ID placeholder in VITE_LOOTABLY_IFRAME_TEMPLATE.</p>}
        </Card>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">Each provider must be approved and configured in its publisher dashboard. Postbacks are signature-checked or IP-restricted, deduplicated by provider transaction ID, and chargebacks are reconciled before additional AI credits can be spent.</p>
    </section>
  );
}
