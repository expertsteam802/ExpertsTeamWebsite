import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, Check, Copy, Heart, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

type DailyStreak = { current_streak: number; longest_streak: number; last_claim_date: string | null };
type Referral = { id: string; rewarded_at: string | null; created_at: string; reward_credits: number };

export function CreditRewardsPanel() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [creatorUsername, setCreatorUsername] = useState("");
  const [tipAmount, setTipAmount] = useState("5");
  const [tipMessage, setTipMessage] = useState("");

  const streak = useQuery({
    queryKey: ["credit-daily-streak", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase.from("credit_daily_streaks")
        .select("current_streak,longest_streak,last_claim_date")
        .eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return data as DailyStreak | null;
    },
  });

  const referralCode = useQuery({
    queryKey: ["credit-referral-code", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_credit_referral_code");
      if (error) throw error;
      return String(data);
    },
  });

  const referrals = useQuery({
    queryKey: ["credit-referrals", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase.from("credit_referrals")
        .select("id,rewarded_at,created_at,reward_credits")
        .eq("referrer_id", user!.id).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as Referral[];
    },
  });

  const refreshRewards = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["credit-daily-streak", user?.id] });
    void queryClient.invalidateQueries({ queryKey: ["credit-referrals", user?.id] });
    void queryClient.invalidateQueries({ queryKey: ["ai-credit-ledger", user?.id] });
    void queryClient.invalidateQueries({ queryKey: ["auth-user"] });
    void queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
  }, [queryClient, user?.id]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void supabase.rpc("claim_eligible_referral_bonus").then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.warn("Referral reward check failed:", error.message);
        return;
      }
      const result = data as { awarded?: number } | null;
      if ((result?.awarded ?? 0) > 0) {
        toast.success("Your referral reward was credited.");
        refreshRewards();
      }
    });
    return () => { cancelled = true; };
  }, [user?.id, refreshRewards]);

  const dailyClaim = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("claim_daily_credit_streak");
      if (error) throw error;
      return data as unknown as { claimed: boolean; streak: number; reward: number; bonus: number; balance: number };
    },
    onSuccess: (result) => {
      if (result.claimed) toast.success(`+${result.reward} credits added · ${result.streak}-day streak`);
      else toast.info("Today's daily reward is already claimed.");
      refreshRewards();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const tipCreator = useMutation({
    mutationFn: async () => {
      const amount = Number(tipAmount);
      if (!creatorUsername.trim()) throw new Error("Enter the creator's username.");
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000) throw new Error("Tip must be 1–1,000 credits.");
      const { data, error } = await supabase.rpc("tip_creator_by_username", {
        p_username: creatorUsername.trim().replace(/^@/, ""),
        p_amount: amount,
        p_message: tipMessage.trim(),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Your creator tip was sent.");
      setCreatorUsername("");
      setTipMessage("");
      refreshRewards();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const referralUrl = typeof window !== "undefined" && referralCode.data
    ? `${window.location.origin}/auth?ref=${encodeURIComponent(referralCode.data)}`
    : "";

  const copyReferral = async () => {
    if (!referralUrl) return;
    try {
      await navigator.clipboard.writeText(referralUrl);
      toast.success("Referral link copied.");
    } catch {
      toast.error("Could not copy the referral link.");
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const claimedToday = streak.data?.last_claim_date === today;

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <CalendarCheck className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg font-semibold">Daily credit streak</h2>
        </div>
        <p className="text-sm text-muted-foreground">Check in once a day to earn 5 credits. Keep a 7-day streak to unlock a 20% daily bonus.</p>
        <div className="flex items-end gap-5">
          <div><p className="text-xs text-muted-foreground">Current streak</p><p className="font-display text-3xl font-bold tabular-nums">{streak.data?.current_streak ?? 0} days</p></div>
          <div><p className="text-xs text-muted-foreground">Best streak</p><p className="text-xl font-semibold tabular-nums">{streak.data?.longest_streak ?? 0} days</p></div>
        </div>
        <div className="flex items-center gap-1.5" aria-label="Seven-day streak progress">
          {Array.from({ length: 7 }, (_, index) => (
            <span key={index} className={`h-2 flex-1 rounded-full ${(streak.data?.current_streak ?? 0) % 7 > index || (streak.data?.current_streak ?? 0) >= 7 ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>
        <Button onClick={() => dailyClaim.mutate()} disabled={dailyClaim.isPending || claimedToday}>
          {claimedToday ? <><Check className="h-4 w-4" /> Claimed today</> : dailyClaim.isPending ? "Claiming…" : "Claim +5 daily credits"}
        </Button>
      </Card>

      <Card className="space-y-4 p-5">
        <div className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" /><h2 className="font-display text-lg font-semibold">Invite friends</h2></div>
        <p className="text-sm text-muted-foreground">Share your link. When a new member stays active for at least 7 days, you receive 15 credits.</p>
        <div className="flex gap-2">
          <Input readOnly value={referralUrl || "Preparing your referral link…"} aria-label="Your referral link" />
          <Button type="button" variant="outline" onClick={() => void copyReferral()} disabled={!referralUrl}><Copy className="h-4 w-4" /> Copy</Button>
        </div>
        <div className="flex gap-5 text-sm">
          <span><strong>{referrals.data?.length ?? 0}</strong> invited</span>
          <span><strong>{referrals.data?.filter((item) => item.rewarded_at).length ?? 0}</strong> rewarded</span>
        </div>
        <p className="text-xs text-muted-foreground">Referral rewards are checked automatically when you visit this page after the invited member qualifies.</p>
      </Card>

      <Card className="space-y-4 p-5 lg:col-span-2">
        <div className="flex items-center gap-2"><Heart className="h-5 w-5 text-primary" /><h2 className="font-display text-lg font-semibold">Tip an ExpertsTeam creator</h2></div>
        <p className="text-sm text-muted-foreground">Send credits to a creator account as a thank-you. Tips are transferred immediately and recorded in both credit ledgers.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2"><Label htmlFor="tip-creator-username">Creator username</Label><Input id="tip-creator-username" value={creatorUsername} onChange={(event) => setCreatorUsername(event.target.value)} placeholder="@username" /></div>
          <div className="space-y-2"><Label htmlFor="tip-creator-amount">Credits</Label><Input id="tip-creator-amount" type="number" min="1" max="1000" step="1" value={tipAmount} onChange={(event) => setTipAmount(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="tip-creator-message">Message (optional)</Label><Textarea id="tip-creator-message" rows={1} maxLength={240} value={tipMessage} onChange={(event) => setTipMessage(event.target.value)} placeholder="Thanks for your work!" /></div>
        </div>
        <div><Button onClick={() => tipCreator.mutate()} disabled={tipCreator.isPending}><Heart className="h-4 w-4" /> {tipCreator.isPending ? "Sending…" : "Send creator tip"}</Button></div>
      </Card>
    </section>
  );
}
