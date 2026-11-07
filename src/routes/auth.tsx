import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { PageShell } from "@/components/layout/page-shell";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in or join — ExpertsTeam" },
      {
        name: "description",
        content:
          "Create your ExpertsTeam account with email or Google to upload files, watch videos and join the community.",
      },
      { property: "og:title", content: "Sign in or join — ExpertsTeam" },
      { property: "og:description", content: "Join the ExpertsTeam creator community." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const signupFlow = useRef(false);
  const [signupResult, setSignupResult] = useState<{ email: string; needsConfirmation: boolean } | null>(null);

  useEffect(() => {
    if (user && !signupFlow.current) void navigate({ to: "/dashboard", replace: true });
  }, [user, navigate]);

  async function signIn(): Promise<void> {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      toast.success("Welcome back!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function signUp(): Promise<void> {
    if (password.length < 6) {
      toast.error("Use at least 6 characters for your password.");
      return;
    }
    if (username.trim().length < 3) {
      toast.error("Pick a username with at least 3 characters.");
      return;
    }
    setBusy(true);
    signupFlow.current = true;
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { username: username.trim(), display_name: username.trim() },
        },
      });
      if (error) throw error;
      if (!data.user) throw new Error("Supabase did not return a new account.");
      if (avatarFile && data.session) {
        try {
          const extension = avatarFile.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
          const path = `${data.user.id}/avatar-${Date.now()}.${extension}`;
          const { error: uploadError } = await supabase.storage.from("uploads").upload(path, avatarFile, {
            cacheControl: "3600",
            upsert: true,
            contentType: avatarFile.type || "image/jpeg",
          });
          if (uploadError) throw uploadError;
          const avatarUrl = supabase.storage.from("uploads").getPublicUrl(path).data.publicUrl;
          const { error: profileError } = await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", data.user.id);
          if (profileError) throw profileError;
        } catch (avatarError) {
          toast.error(avatarError instanceof Error ? "Account created. Add your profile photo later from your profile settings." : "Account created. You can add your photo later.");
        }
      }
      setSignupAdFinished(false);
      setSignupResult({ email: email.trim(), needsConfirmation: !data.session });
    } catch (error) {
      signupFlow.current = false;
      toast.error(
        error instanceof Error ? error.message : "Could not create your account. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function google(): Promise<void> {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Google sign-in failed. Please try again.",
      );
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <div className="hero-surface min-h-[80vh] px-4 py-16">
        <Card className="animate-rise mx-auto w-full max-w-md p-8 glow-panel">
          <h1 className="font-display text-2xl font-semibold">Welcome to ExpertsTeam</h1>
          <p className="text-sm text-muted-foreground">
            The very first account created becomes the creator/admin of this site.
          </p>

          <Button
            variant="secondary"
            className="mt-4 w-full"
            onClick={() => void google()}
            disabled={busy}
          >
            Continue with Google
          </Button>

          <div className="my-2 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or use email{" "}
            <span className="h-px flex-1 bg-border" />
          </div>

          <Tabs defaultValue="signin">
            <TabsList className="w-full">
              <TabsTrigger value="signin" className="flex-1">
                Sign in
              </TabsTrigger>
              <TabsTrigger value="signup" className="flex-1">
                Sign up
              </TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="signin-email">Email</Label>
                <Input
                  id="signin-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signin-password">Password</Label>
                <Input
                  id="signin-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <Button className="w-full" onClick={() => void signIn()} disabled={busy}>
                Sign in
              </Button>
            </TabsContent>

            <TabsContent value="signup" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="signup-username">Username</Label>
                <Input
                  id="signup-username"
                  maxLength={24}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-email">Email</Label>
                <Input
                  id="signup-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password">Password</Label>
                <Input
                  id="signup-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <div className="space-y-2 rounded-xl border border-border/70 bg-secondary/30 p-3">
                <Label htmlFor="signup-avatar">Profile photo <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <input
                  id="signup-avatar"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => {
                    const selected = event.target.files?.[0] ?? null;
                    if (selected && selected.size > 5 * 1024 * 1024) {
                      toast.error("Choose a profile photo smaller than 5 MB.");
                      event.target.value = "";
                      return;
                    }
                    setAvatarFile(selected);
                  }}
                  className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-xs file:font-semibold file:text-primary-foreground"
                />
                <p className="text-xs text-muted-foreground">{avatarFile ? avatarFile.name : "Add a photo now, or skip and add one later from your profile."}</p>
              </div>
              <Button className="w-full" onClick={() => void signUp()} disabled={busy}>
                Create account
              </Button>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
      <Dialog open={!!signupResult} onOpenChange={(open) => {
        if (!open) {
          const shouldGoToDashboard = !signupResult?.needsConfirmation;
          setSignupResult(null);
          signupFlow.current = false;
          if (shouldGoToDashboard) void navigate({ to: "/dashboard", replace: true });
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{signupResult?.needsConfirmation ? "Check your email" : "Your account is ready!"}</DialogTitle>
            <DialogDescription>
              {signupResult?.needsConfirmation
                ? `We created your account. Follow the confirmation link sent to ${signupResult.email} to finish signing in.`
                : "Your ExpertsTeam account was created successfully. You can now explore your dashboard."}
            </DialogDescription>
          </DialogHeader>
          <Button className="w-full sm:w-auto" onClick={() => {
            const shouldGoToDashboard = !signupResult?.needsConfirmation;
            setSignupResult(null);
            signupFlow.current = false;
            if (shouldGoToDashboard) void navigate({ to: "/dashboard", replace: true });
          }}>
            {signupResult?.needsConfirmation ? "Back to sign in" : "Open my dashboard"}
          </Button>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
