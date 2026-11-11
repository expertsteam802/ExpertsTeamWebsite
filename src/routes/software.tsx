import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Clock3, Mail, MessageCircle, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/software")({
  head: () => ({
    meta: [
      { title: "Request Custom Software Development | ExpertsTeam" },
      {
        name: "description",
        content:
          "Request a custom website, business system, mobile app or software solution from ExpertsTeam. Share your requirements and get a project review.",
      },
      { property: "og:title", content: "Get Your Software Built — ExpertsTeam" },
      {
        property: "og:description",
        content: "Tell ExpertsTeam what your business needs. Request a custom software project and receive a clear delivery plan.",
      },
    ],
    links: [{ rel: "canonical", href: "https://expertsteam.giize.com/software" }],
  }),
  component: SoftwareRequestPage,
});

function SoftwareRequestPage() {
  const { user } = useAuth();
  const settings = useSiteSettings();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");
  const [businessName, setBusinessName] = useState("");
  const [projectType, setProjectType] = useState("Business management system");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [contactMethod, setContactMethod] = useState("Email");
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (website.trim()) return;
    if (description.trim().length < 30) {
      toast.error("Please describe what you need in at least 30 characters.");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("software_requests").insert({
        user_id: user?.id ?? null,
        full_name: fullName.trim(),
        email: email.trim(),
        business_name: businessName.trim() || null,
        project_type: projectType,
        description: description.trim(),
        budget: budget.trim() || null,
        contact_method: contactMethod,
      });
      if (error) throw error;
      setSubmitted(true);
      setFullName("");
      setBusinessName("");
      setDescription("");
      setBudget("");
      toast.success("Your software request has been submitted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "We could not submit your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageShell>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:py-16">
        <section className="grid items-center gap-10 lg:grid-cols-[1fr_.9fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
              <CheckCircle2 className="h-3.5 w-3.5" /> Custom software, built around your work
            </span>
            <h1 className="mt-5 max-w-2xl font-display text-4xl font-bold tracking-tight sm:text-6xl">
              Your idea. <span className="brand-text">A software that works.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-8 text-muted-foreground">
              We work with businesses, teams and individuals to plan and build practical websites,
              dashboards, management systems and custom applications.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#request-form">
                <Button size="lg">Request software <ArrowRight className="ml-2 h-4 w-4" /></Button>
              </a>
              <a href={`mailto:${settings.owner_email}?subject=Custom%20software%20request`}>
                <Button size="lg" variant="outline"><Mail className="mr-2 h-4 w-4" /> Email our team</Button>
              </a>
              <Link to="/messages" search={{ to: "xpert" } as never}>
                <Button size="lg" variant="ghost"><MessageCircle className="mr-2 h-4 w-4" /> DM Chris Expert</Button>
              </Link>
            </div>
          </div>
          <Card className="overflow-hidden p-6 sm:p-8">
            <div className="mb-5 rounded-2xl border border-primary/25 bg-primary/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Starting price</p>
              <p className="mt-1 font-display text-3xl font-bold">$5</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Final pricing is confirmed after we review the features and project scope.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary">
                <Clock3 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Delivery target</p>
                <p className="font-display text-2xl font-bold">About 1 week</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Our target is to deliver a ready-to-use first version within seven days after the
              requirements, scope and content are confirmed. Larger or more complex projects may
              need a different timeline, which we will agree with you before work begins.
            </p>
            <div className="mt-6 space-y-4">
              {[
                ["01", "Share your idea", "Tell us the problem and the features you need."],
                ["02", "Confirm the plan", "We review scope, timeline and any costs before starting."],
                ["03", "Build and review", "We develop the software and share progress for feedback."],
                ["04", "Ready to use", "We hand over the working project and usage guidance."],
              ].map(([number, title, detail]) => (
                <div key={number} className="flex gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary text-xs font-bold">{number}</span>
                  <div>
                    <p className="text-sm font-semibold">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </section>

        <section id="request-form" className="mt-12 grid scroll-mt-8 gap-6 lg:grid-cols-[1fr_.55fr]">
          <Card className="p-6 sm:p-8">
            <h2 className="font-display text-2xl font-bold">Tell us what to build</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Submit your project details. You do not need an account to send a request.
            </p>
            {submitted ? (
              <div className="mt-7 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-5">
                <CheckCircle2 className="h-7 w-7 text-emerald-500" />
                <h3 className="mt-3 font-semibold">Request received</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Thanks. Our team will review your requirements and contact you using the email or
                  contact method you supplied.
                </p>
                <Button className="mt-4" variant="outline" onClick={() => setSubmitted(false)}>Send another request</Button>
              </div>
            ) : (
              <form className="mt-6 space-y-4" onSubmit={submitRequest}>
                <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
                  <Label htmlFor="software-website">Leave this field empty</Label>
                  <Input id="software-website" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="software-name">Your name</Label>
                    <Input id="software-name" required minLength={2} maxLength={120} value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Full name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="software-email">Email address</Label>
                    <Input id="software-email" type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="software-business">Business or organisation (optional)</Label>
                    <Input id="software-business" maxLength={160} value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder="Business name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="software-type">What do you need?</Label>
                    <select id="software-type" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={projectType} onChange={(event) => setProjectType(event.target.value)}>
                      <option>Business management system</option>
                      <option>POS or inventory system</option>
                      <option>Website or online store</option>
                      <option>Mobile application</option>
                      <option>Booking or customer portal</option>
                      <option>School or organisation platform</option>
                      <option>Other custom software</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="software-description">Describe the software you need</Label>
                  <Textarea id="software-description" required minLength={30} maxLength={5000} rows={6} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What problem should it solve? Who will use it? Which features should it include?" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="software-budget">Budget (optional)</Label>
                    <Input id="software-budget" maxLength={120} value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="Share a range or leave blank" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="software-contact">Preferred contact</Label>
                    <select id="software-contact" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={contactMethod} onChange={(event) => setContactMethod(event.target.value)}>
                      <option>Email</option>
                      <option>Phone / WhatsApp</option>
                      <option>ExpertsTeam direct message</option>
                    </select>
                  </div>
                </div>
                <Button type="submit" className="w-full sm:w-auto" disabled={submitting}>
                  <Send className="mr-2 h-4 w-4" /> {submitting ? "Sending request…" : "Submit software request"}
                </Button>
                <p className="text-xs leading-5 text-muted-foreground">
                  Your details are used to review and respond to this request. Do not include passwords,
                  payment card details or other sensitive information.
                </p>
              </form>
            )}
          </Card>

          <aside className="space-y-4">
            <Card className="p-6">
              <ShieldCheck className="h-6 w-6 text-primary" />
              <h3 className="mt-3 font-display text-lg font-semibold">Clear communication</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                We discuss the scope, delivery plan and any price before development starts. Submitting
                this form does not commit you to a purchase.
              </p>
            </Card>
            <Card className="p-6">
              <Mail className="h-6 w-6 text-primary" />
              <h3 className="mt-3 font-display text-lg font-semibold">Prefer email?</h3>
              <a className="mt-2 block break-all text-sm font-semibold text-primary hover:underline" href={`mailto:${settings.owner_email}?subject=Custom%20software%20request`}>{settings.owner_email}</a>
            </Card>
            <Card className="p-6">
              <MessageCircle className="h-6 w-6 text-primary" />
              <h3 className="mt-3 font-display text-lg font-semibold">Talk to the team</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Use ExpertsTeam Messages to discuss an idea directly.</p>
              <Link to="/messages" className="mt-3 inline-flex items-center text-sm font-semibold text-primary hover:underline">Open Messages <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Card>
          </aside>
        </section>
      </main>
    </PageShell>
  );
}
