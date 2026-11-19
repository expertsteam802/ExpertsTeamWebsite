import { useMutation } from "@tanstack/react-query";
import { Flag } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

type ReportableContent = "post" | "comment" | "story" | "video" | "file";

const REASONS = [
  ["copyright", "Copyright infringement"],
  ["piracy", "Pirated software or media"],
  ["adult", "Adult or sexually explicit content"],
  ["hate_or_harassment", "Hate, harassment or threats"],
  ["violence", "Graphic or gratuitous violence"],
  ["illegal_activity", "Illegal activity"],
  ["malware_or_scam", "Malware, scam or deceptive link"],
  ["misleading", "False or misleading information"],
  ["other", "Other policy concern"],
] as const;

export function ReportContentButton({
  contentType,
  contentId,
}: {
  contentType: ReportableContent;
  contentId: string;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number][0]>("copyright");
  const [details, setDetails] = useState("");

  const report = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in to report content.");
      const { error } = await supabase.from("content_reports").insert({
        reporter_id: user.id,
        content_type: contentType,
        content_id: contentId,
        reason,
        details: details.trim().slice(0, 1000),
      });
      if (error?.code === "23505") {
        throw new Error("You have already reported this item.");
      }
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Report sent to the ExpertsTeam moderation queue.");
      setOpen(false);
      setDetails("");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-muted-foreground">
          <Flag className="mr-1.5 h-4 w-4" /> Report
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report this {contentType}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1.5 text-sm font-medium">
            Reason
            <select
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              value={reason}
              onChange={(event) => setReason(event.target.value as (typeof REASONS)[number][0])}
            >
              {REASONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5 text-sm font-medium">
            Additional details (optional)
            <Textarea
              rows={4}
              maxLength={1000}
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              placeholder="Tell the moderation team what is wrong with this content…"
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => report.mutate()} disabled={report.isPending}>
            {report.isPending ? "Sending…" : "Submit report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
