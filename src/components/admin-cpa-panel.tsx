import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, ExternalLink, Gift, Pause, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Offer = Tables<"cpa_offers">;
type Conversion = Tables<"cpa_conversions">;

const emptyOffer = { title: "", description: "", provider: "custom", category: "general", destination_url: "", reward_credits: "10", instructions: "" };

export function AdminCpaPanel() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyOffer);
  const offers = useQuery({
    queryKey: ["admin-cpa-offers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cpa_offers").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Offer[];
    },
  });
  const conversions = useQuery({
    queryKey: ["admin-cpa-conversions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cpa_conversions").select("*, profiles(username, display_name)").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as Array<Conversion & { profiles: { username: string; display_name: string | null } | null }>;
    },
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-cpa-offers"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-cpa-conversions"] });
  };
  const saveOffer = useMutation({
    mutationFn: async () => {
      const reward = Number(form.reward_credits);
      const destination = form.destination_url.trim();
      if (form.title.trim().length < 2) throw new Error("Enter an offer title.");
      if (!/^https:\/\//i.test(destination)) throw new Error("Partner destination must use HTTPS.");
      if (!Number.isSafeInteger(reward) || reward < 1) throw new Error("Reward must be a positive whole number.");
      const { error } = await supabase.from("cpa_offers").insert({
        title: form.title.trim(), description: form.description.trim(), provider: form.provider.trim() || "custom",
        category: form.category.trim() || "general", destination_url: destination, reward_credits: reward,
        instructions: form.instructions.trim(), is_active: false, is_featured: false,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Offer saved as inactive. Activate it after configuring its partner tracking."); setForm(emptyOffer); refresh(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const toggleOffer = useMutation({
    mutationFn: async (offer: Offer) => {
      const { error } = await supabase.from("cpa_offers").update({ is_active: !offer.is_active, updated_at: new Date().toISOString() }).eq("id", offer.id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteOffer = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cpa_offers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Offer deleted."); refresh(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const review = useMutation({
    mutationFn: async ({ item, approve }: { item: Conversion; approve: boolean }) => {
      const { error } = await supabase.rpc("admin_review_cpa_conversion", { p_conversion_id: item.id, p_approve: approve, p_note: approve ? "Completion verified by administrator." : "Completion rejected after review." });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => { toast.success(vars.approve ? "Credits awarded." : "Conversion rejected."); refresh(); void queryClient.invalidateQueries({ queryKey: ["admin"] }); },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3 flex items-center gap-2"><Gift className="h-5 w-5 text-primary" /><h2 className="font-display text-xl font-semibold">CPA credit offers</h2></div>
        <p className="mb-4 text-sm text-muted-foreground">Create partner offers and choose the credit reward. New offers are inactive until you verify the tracking URL and provider setup.</p>
        <Card className="grid gap-4 p-5 md:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="cpa-title">Offer title</Label><Input id="cpa-title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Complete a partner survey" /></div>
          <div className="space-y-2"><Label htmlFor="cpa-provider">CPA network / provider</Label><Input id="cpa-provider" value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })} placeholder="Your CPA network" /></div>
          <div className="space-y-2"><Label htmlFor="cpa-category">Category</Label><Input id="cpa-category" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Survey, app install, signup…" /></div>
          <div className="space-y-2"><Label htmlFor="cpa-reward">Credits awarded</Label><Input id="cpa-reward" type="number" min="1" step="1" value={form.reward_credits} onChange={e => setForm({ ...form, reward_credits: e.target.value })} /></div>
          <div className="space-y-2 md:col-span-2"><Label htmlFor="cpa-url">Partner offer URL (HTTPS)</Label><Input id="cpa-url" value={form.destination_url} onChange={e => setForm({ ...form, destination_url: e.target.value })} placeholder="https://partner.example/offer?subid={subid}" /></div>
          <div className="space-y-2 md:col-span-2"><Label htmlFor="cpa-description">Description</Label><Textarea id="cpa-description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} /></div>
          <div className="space-y-2 md:col-span-2"><Label htmlFor="cpa-instructions">Completion instructions</Label><Textarea id="cpa-instructions" value={form.instructions} onChange={e => setForm({ ...form, instructions: e.target.value })} rows={2} /></div>
          <div className="md:col-span-2"><Button onClick={() => saveOffer.mutate()} disabled={saveOffer.isPending}><Plus className="h-4 w-4" /> {saveOffer.isPending ? "Saving…" : "Save inactive offer"}</Button></div>
        </Card>
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold">Offer inventory</h3>
        {offers.data?.length ? offers.data.map(offer => (
          <Card key={offer.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0"><p className="font-medium">{offer.title} <span className="ml-2 text-xs text-primary">+{offer.reward_credits} credits</span></p><p className="truncate text-xs text-muted-foreground">{offer.provider} · {offer.category} · {offer.destination_url}</p></div>
            <div className="flex items-center gap-2">
              <span className={offer.is_active ? "rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-600" : "rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground"}>{offer.is_active ? "Active" : "Inactive"}</span>
              <Button size="sm" variant="outline" disabled={toggleOffer.isPending} onClick={() => toggleOffer.mutate(offer)}>{offer.is_active ? <Pause className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}{offer.is_active ? "Pause" : "Activate"}</Button>
              <Button size="icon" variant="destructive" disabled={deleteOffer.isPending} onClick={() => { if (window.confirm("Delete this offer? Existing conversion records will be retained.")) deleteOffer.mutate(offer.id); }}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </Card>
        )) : <Card className="p-5 text-sm text-muted-foreground">No offers created yet.</Card>}
      </section>

      <section className="space-y-3">
        <div><h3 className="font-semibold">Conversion verification</h3><p className="text-sm text-muted-foreground">Review pending completions. Credits are awarded atomically and cannot be awarded twice.</p></div>
        {conversions.data?.filter(item => item.status === "pending").length ? conversions.data.filter(item => item.status === "pending").map(item => (
          <Card key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div><p className="font-medium">{item.profiles?.display_name || item.profiles?.username || "Member"} · +{item.reward_credits} credits</p><p className="mt-1 text-xs text-muted-foreground">{item.provider} · tracking {item.tracking_id} · {new Date(item.created_at).toLocaleString()}</p></div>
            <div className="flex gap-2"><Button size="sm" disabled={review.isPending} onClick={() => review.mutate({ item, approve: true })}><Check className="h-4 w-4" /> Approve</Button><Button size="sm" variant="outline" disabled={review.isPending} onClick={() => review.mutate({ item, approve: false })}><X className="h-4 w-4" /> Reject</Button></div>
          </Card>
        )) : <Card className="p-5 text-sm text-muted-foreground">No pending conversions.</Card>}
      </section>
      <p className="text-xs leading-5 text-muted-foreground">Provider postback verification is not connected yet. Until your CPA network credentials and callback format are configured, manually verify conversions in this panel. Do not activate offers until the partner accepts the subid tracking parameter.</p>
    </div>
  );
}
