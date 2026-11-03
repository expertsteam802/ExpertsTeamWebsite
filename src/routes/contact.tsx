import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Instagram, Mail, Youtube } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact ExpertsTeam" },
      {
        name: "description",
        content:
          "Reach Chris Expert by email, YouTube or Instagram for collaborations, questions and project ideas.",
      },
      { property: "og:title", content: "Contact ExpertsTeam" },
      { property: "og:description", content: "Get in touch with Chris Expert." },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const settings = useSiteSettings();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const sendMessage = useMutation({
    mutationFn: async () => {
      const cleanName = name.trim();
      const cleanEmail = email.trim();
      const cleanSubject = subject.trim() || "Website enquiry";
      const cleanMessage = message.trim();
      if (!cleanName || !cleanEmail || !cleanMessage) {
        throw new Error("Please enter your name, email and message.");
      }
      const { error } = await supabase.from("contact_messages").insert({
        user_id: user?.id ?? null,
        sender_name: cleanName.slice(0, 80),
        sender_email: cleanEmail.slice(0, 254),
        subject: cleanSubject.slice(0, 120),
        message: cleanMessage.slice(0, 4000),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
      toast.success("Your message has been sent to ExpertsTeam.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <PageShell>
      <section className="hero-surface border-b border-border/60 px-4 py-14">
        <div className="mx-auto max-w-7xl">
          <h1 className="font-display text-3xl font-bold sm:text-5xl">
            Let's <span className="brand-text">talk</span>
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Collaborations, questions, bug reports or project ideas — send them over.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-12 lg:grid-cols-[1.2fr_1fr]">
        <Card className="animate-rise gap-4 p-6">
          <div className="space-y-2">
            <Label htmlFor="contact-name">Your name</Label>
            <Input
              id="contact-name"
              maxLength={80}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact-email">Your email</Label>
            <Input
              id="contact-email"
              type="email"
              maxLength={254}
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact-subject">Subject</Label>
            <Input
              id="contact-subject"
              maxLength={120}
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="What is this about?"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact-message">Message</Label>
            <Textarea
              id="contact-message"
              rows={6}
              maxLength={4000}
              required
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Write your message…"
            />
          </div>
          <Button
            type="button"
            disabled={sendMessage.isPending || !name.trim() || !email.trim() || !message.trim()}
            onClick={() => sendMessage.mutate()}
          >
            {sendMessage.isPending ? "Sending…" : "Send message"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Your message will be delivered to the site admin inbox.
          </p>
        </Card>

        <Card className="animate-rise gap-4 p-6">
          <h2 className="font-display text-lg font-semibold">Direct channels</h2>
          <a
            href={`mailto:${settings.owner_email}`}
            className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm hover:bg-secondary"
          >
            <Mail className="h-4 w-4 text-primary" /> {settings.owner_email}
          </a>
          <a
            href={settings.youtube_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm hover:bg-secondary"
          >
            <Youtube className="h-4 w-4 text-primary" /> @expertchris
          </a>
          <a
            href={settings.instagram_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm hover:bg-secondary"
          >
            <Instagram className="h-4 w-4 text-primary" /> @m.chris_t2011
          </a>
        </Card>
      </section>
    </PageShell>
  );
}
