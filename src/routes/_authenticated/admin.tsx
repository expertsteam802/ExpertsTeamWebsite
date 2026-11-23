import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  Check,
  Code2,
  CreditCard,
  Database,
  HardDrive,
  Inbox,
  ImagePlus,
  LayoutDashboard,
  Mail,
  RefreshCw,
  Settings,
  ShieldAlert,
  Trash2,
  Terminal,
  Users,
  Video,
  Eye,
  FileDown,
  Flag,
  Gift,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { PageShell } from "@/components/layout/page-shell";
import { AdminApiUsagePanel } from "@/components/admin-platform-panels";
import { AdminCpaPanel } from "@/components/admin-cpa-panel";
import { FileGrid, type CommunityFile } from "@/components/file-grid";
import { UploadDialog } from "@/components/upload-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { deleteUserAccount } from "@/lib/accounts.functions";
import { formatBytes, formatDate } from "@/lib/format";
import { paymentMethodLabel, type UpgradeRequest } from "@/lib/subscription";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Admin panel — ExpertsTeam" },
      {
        name: "description",
        content: "ExpertsTeam administration: community moderation, members, content, payments and platform settings.",
      },
      { property: "og:title", content: "Admin panel — ExpertsTeam" },
      { property: "og:description", content: "Creator controls for ExpertsTeam." },
    ],
  }),
  component: AdminPage,
});

type SettingsForm = {
  site_name: string;
  logo_url: string;
  logo_scale: string;
  background_image_url: string;
  banner_image_url: string;
  youtube_url: string;
  instagram_url: string;
  owner_email: string;
  subscription_price: string;
  subscription_quota_bytes: string;
  ai_subscription_price: string;
  ai_subscription_credits: string;
  ai_free_credits: string;
  payout_account: string;
  terminal_idle_timeout_minutes: string;
  terminal_cli_enabled: string[];
  terminal_cli_default: string;
  builder_max_project_mb: string;
  builder_max_file_mb: string;
  builder_max_files: string;
  builder_max_prompt_chars: string;
  navigation_labels_json: string;
};

function AdminPage() {
  const { isAdmin, isCreator, user } = useAuth();
  const queryClient = useQueryClient();
  const removeAccount = useServerFn(deleteUserAccount);
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const legacyBrandingCleanupStarted = useRef(false);
  useEffect(() => {
    if (!isAdmin || legacyBrandingCleanupStarted.current) return;
    legacyBrandingCleanupStarted.current = true;
    const legacyPaths = [
      "site-branding/background-1794057832589.png",
      "site-branding/background-1794940410648.png",
      "site-branding/logo-1795102812239.png",
      "site-branding/logo-1795110115520.png",
    ];
    void supabase.storage.from("site-assets").remove(legacyPaths).then(({ error }) => {
      if (error) {
        legacyBrandingCleanupStarted.current = false;
        toast.error("Old branding files could not be removed from Supabase Storage: " + error.message);
      } else {
        toast.success("Old logo and background uploads cleared from Supabase Storage.");
      }
    });
  }, [isAdmin]);

  const [backgroundUploadPending, setBackgroundUploadPending] = useState(false);
  const [logoUploadPending, setLogoUploadPending] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ["site-settings"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("site_settings").select("*").eq("id", 1).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: videoStats = [], isLoading: videoStatsLoading } = useQuery({
    queryKey: ["admin", "video-analytics"],
    enabled: isAdmin,
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("videos")
        .select("id, title, views, category, created_at")
        .order("views", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });
  const totalVideoViews = videoStats.reduce((total, video) => total + Number(video.views ?? 0), 0);

  const { data: members } = useQuery({
    queryKey: ["admin", "members"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, username, display_name, is_subscribed, storage_quota_bytes, ai_subscribed, ai_credits, ai_subscription_expires_at, created_at",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: memberRoles = [] } = useQuery({
    queryKey: ["admin", "roles"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      return data as Array<{ user_id: string; role: string }>;
    },
  });

  const { data: memberFileUsage = [] } = useQuery({
    queryKey: ["admin", "file-usage"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("files").select("user_id, size_bytes");
      if (error) throw error;
      return data as Array<{ user_id: string; size_bytes: number }>;
    },
  });

  const {
    data: adminFiles = [],
    isLoading: adminFilesLoading,
    isError: adminFilesError,
    refetch: refetchAdminFiles,
  } = useQuery({
    queryKey: ["admin", "all-files"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("files")
        .select("*, profiles(username, display_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CommunityFile[];
    },
  });

  const {
    data: systemStatus,
    isError: systemStatusError,
    isLoading: systemStatusLoading,
  } = useQuery({
    queryKey: ["admin", "system-status"],
    enabled: isAdmin,
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const profileResult = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true });
      if (profileResult.error) throw profileResult.error;
      const filesResult = await supabase.from("files").select("size_bytes");
      if (filesResult.error) throw filesResult.error;
      return {
        memberCount: profileResult.count ?? 0,
        trackedUploadBytes: (filesResult.data ?? []).reduce(
          (total, file) => total + Number(file.size_bytes),
          0,
        ),
        checkedAt: new Date().toISOString(),
      };
    },
  });
  const {
    data: contactMessages = [],
    isLoading: contactMessagesLoading,
    isError: contactMessagesError,
  } = useQuery({
    queryKey: ["admin", "contact-messages"],
    enabled: isAdmin,
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_messages")
        .select("id, sender_name, sender_email, subject, message, read_at, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const {
    data: softwareRequests = [],
    isLoading: softwareRequestsLoading,
    isError: softwareRequestsError,
  } = useQuery({
    queryKey: ["admin", "software-requests"],
    enabled: isAdmin,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("software_requests")
        .select("id,full_name,email,business_name,project_type,description,budget,contact_method,status,admin_note,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const updateSoftwareRequest = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("software_requests")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Software request status updated");
      void queryClient.invalidateQueries({ queryKey: ["admin", "software-requests"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateContactMessage = useMutation({
    mutationFn: async ({ id, read }: { id: string; read: boolean }) => {
      const { error } = await supabase
        .from("contact_messages")
        .update({ read_at: read ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["admin", "contact-messages"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteContactMessage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contact_messages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contact message deleted");
      void queryClient.invalidateQueries({ queryKey: ["admin", "contact-messages"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const markAllContactsRead = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("contact_messages")
        .update({ read_at: new Date().toISOString() })
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("All contact messages marked as read");
      void queryClient.invalidateQueries({ queryKey: ["admin", "contact-messages"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const { data: contentReports = [], isLoading: reportsLoading } = useQuery({
    queryKey: ["admin", "content-reports"],
    enabled: isAdmin,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const reviewContentReport = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "reviewing" | "resolved" | "dismissed" }) => {
      const { error } = await supabase
        .from("content_reports")
        .update({
          status,
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Content report updated");
      void queryClient.invalidateQueries({ queryKey: ["admin", "content-reports"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const { data: sessions } = useQuery({
    queryKey: ["admin", "auth-events"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auth_events")
        .select("id, event, created_at, user_id, profiles(username, display_name)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as unknown as Array<{
        id: string;
        event: string;
        created_at: string;
        user_id: string;
        profiles: { username: string; display_name: string | null } | null;
      }>;
    },
  });

  useEffect(() => {
    if (settings && !form) {
      setForm({
        site_name: settings.site_name,
        logo_url: settings.logo_url ?? "",
        logo_scale: (() => {
          const root = settings.site_branding_settings && typeof settings.site_branding_settings === "object" && !Array.isArray(settings.site_branding_settings)
            ? settings.site_branding_settings as Record<string, unknown> : {};
          const brand = root.siteBranding && typeof root.siteBranding === "object" && !Array.isArray(root.siteBranding)
            ? root.siteBranding as Record<string, unknown> : {};
          const scale = Number(brand.logo_scale ?? 100);
          return String(Number.isFinite(scale) ? Math.min(150, Math.max(50, scale)) : 100);
        })(),
        background_image_url: (() => {
          const branding =
            settings.site_branding_settings &&
            typeof settings.site_branding_settings === "object" &&
            !Array.isArray(settings.site_branding_settings)
              ? ((settings.site_branding_settings as Record<string, unknown>).siteBranding as
                  Record<string, unknown> | undefined)
              : undefined;
          return typeof branding?.background_image_url === "string"
            ? branding.background_image_url
            : "";
        })(),
        banner_image_url: (() => {
          const branding =
            settings.site_branding_settings &&
            typeof settings.site_branding_settings === "object" &&
            !Array.isArray(settings.site_branding_settings)
              ? ((settings.site_branding_settings as Record<string, unknown>).siteBranding as
                  Record<string, unknown> | undefined)
              : undefined;
          return typeof branding?.banner_image_url === "string" ? branding.banner_image_url : "";
        })(),
        youtube_url: settings.youtube_url,
        instagram_url: settings.instagram_url,
        owner_email: settings.owner_email,
        subscription_price: String(settings.subscription_price),
        subscription_quota_bytes: String(settings.subscription_quota_bytes),
        ai_subscription_price: String(settings.ai_subscription_price ?? 1),
        ai_subscription_credits: String(settings.ai_subscription_credits ?? 500),
        ai_free_credits: String(settings.ai_free_credits ?? 25),
        payout_account: settings.payout_account ?? "",
        terminal_cli_enabled: (() => {
          const root = settings.site_branding_settings && typeof settings.site_branding_settings === "object" && !Array.isArray(settings.site_branding_settings)
            ? settings.site_branding_settings as Record<string, unknown> : {};
          const terminal = root.terminalSettings && typeof root.terminalSettings === "object" && !Array.isArray(root.terminalSettings)
            ? root.terminalSettings as Record<string, unknown> : {};
          const saved = Array.isArray(terminal.enabledClis) ? terminal.enabledClis.filter((v): v is string => typeof v === "string") : ["kilo"];
          const allowed = saved.filter((v) => ["kilo", "opencode", "aider"].includes(v));
          return allowed.length ? allowed : ["kilo"];
        })(),
        terminal_cli_default: (() => {
          const root = settings.site_branding_settings && typeof settings.site_branding_settings === "object" && !Array.isArray(settings.site_branding_settings)
            ? settings.site_branding_settings as Record<string, unknown> : {};
          const terminal = root.terminalSettings && typeof root.terminalSettings === "object" && !Array.isArray(root.terminalSettings)
            ? root.terminalSettings as Record<string, unknown> : {};
          const preferred = typeof terminal.defaultCli === "string" ? terminal.defaultCli : "kilo";
          return ["kilo", "opencode", "aider"].includes(preferred) ? preferred : "kilo";
        })(),
        builder_max_project_mb: (() => {
          const root = settings.site_branding_settings && typeof settings.site_branding_settings === "object" && !Array.isArray(settings.site_branding_settings)
            ? settings.site_branding_settings as Record<string, unknown> : {};
          const limits = root.builderLimits && typeof root.builderLimits === "object" && !Array.isArray(root.builderLimits)
            ? root.builderLimits as Record<string, unknown> : {};
          return String(Number(limits.maxProjectMb ?? 0) || 0);
        })(),
        builder_max_file_mb: (() => {
          const root = settings.site_branding_settings && typeof settings.site_branding_settings === "object" && !Array.isArray(settings.site_branding_settings)
            ? settings.site_branding_settings as Record<string, unknown> : {};
          const limits = root.builderLimits && typeof root.builderLimits === "object" && !Array.isArray(root.builderLimits)
            ? root.builderLimits as Record<string, unknown> : {};
          return String(Number(limits.maxFileMb ?? 0) || 0);
        })(),
        builder_max_files: (() => {
          const root = settings.site_branding_settings && typeof settings.site_branding_settings === "object" && !Array.isArray(settings.site_branding_settings)
            ? settings.site_branding_settings as Record<string, unknown> : {};
          const limits = root.builderLimits && typeof root.builderLimits === "object" && !Array.isArray(root.builderLimits)
            ? root.builderLimits as Record<string, unknown> : {};
          return String(Number(limits.maxFiles ?? 0) || 0);
        })(),
        builder_max_prompt_chars: (() => {
          const root = settings.site_branding_settings && typeof settings.site_branding_settings === "object" && !Array.isArray(settings.site_branding_settings)
            ? settings.site_branding_settings as Record<string, unknown> : {};
          const limits = root.builderLimits && typeof root.builderLimits === "object" && !Array.isArray(root.builderLimits)
            ? root.builderLimits as Record<string, unknown> : {};
          return String(Number(limits.maxPromptChars ?? 0) || 0);
        })(),
        terminal_idle_timeout_minutes: (() => {
          const root =
            settings.site_branding_settings &&
            typeof settings.site_branding_settings === "object" &&
            !Array.isArray(settings.site_branding_settings)
              ? (settings.site_branding_settings as Record<string, unknown>)
              : {};
          const terminal =
            root.terminalSettings && typeof root.terminalSettings === "object" &&
            !Array.isArray(root.terminalSettings)
              ? (root.terminalSettings as Record<string, unknown>)
              : {};
          const minutes = Number(terminal.idleTimeoutMinutes ?? 0);
          return String(Number.isInteger(minutes) && minutes >= 0 && minutes <= 1440 ? minutes : 0);
        })(),
        navigation_labels_json: (() => {
          const root =
            settings.site_branding_settings &&
            typeof settings.site_branding_settings === "object" &&
            !Array.isArray(settings.site_branding_settings)
              ? (settings.site_branding_settings as Record<string, unknown>)
              : {};
          const saved = root.siteNavigation;
          return JSON.stringify(
            saved && typeof saved === "object" && !Array.isArray(saved)
              ? saved
              : {
                  home: "Home",
                  learn: "Learn",
                  community: "Community",
                  expertai: "ExpertAI",
                  messages: "Messages",
                  discover: "Discover",
                  explore: "Explore all spaces",
                  workspace: "Workspace & projects",
                  videos: "Creator videos",
                  showcase: "Project showcase",
                  about: "About",
                  contact: "Contact",
                  plans: "Plans",
                  vault: "Personal Vault",
                  admin: "Admin",
                },
            null,
            2,
          );
        })(),
      });
    }
  }, [settings, form]);

  const saveSettings = useMutation({
    mutationFn: async () => {
      if (!form || !settings) return;
      const studioPrice = Number(form.ai_subscription_price);
      const studioCredits = Number(form.ai_subscription_credits);
      const freeCredits = Number(form.ai_free_credits);
      let navigationLabels: Record<string, string>;
      try {
        const parsed = JSON.parse(form.navigation_labels_json || "{}") as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Navigation labels must be a JSON object.");
        }
        const entries = Object.entries(parsed as Record<string, unknown>);
        if (
          entries.some(
            ([key, value]) =>
              !/^[a-z_]+$/.test(key) || typeof value !== "string" || value.trim().length > 32,
          )
        ) {
          throw new Error("Each navigation label must be text (maximum 32 characters).");
        }
        navigationLabels = Object.fromEntries(
          entries.map(([key, value]) => [key, (value as string).trim()]),
        );
      } catch (error) {
        throw error instanceof Error ? error : new Error("Navigation labels JSON is invalid.");
      }
      const existingBranding =
        settings.site_branding_settings &&
        typeof settings.site_branding_settings === "object" &&
        !Array.isArray(settings.site_branding_settings)
          ? (settings.site_branding_settings as Record<string, unknown>)
          : {};
      const existingSiteBranding =
        existingBranding.siteBranding &&
        typeof existingBranding.siteBranding === "object" &&
        !Array.isArray(existingBranding.siteBranding)
          ? (existingBranding.siteBranding as Record<string, unknown>)
          : {};
      const logoScale = Number(form.logo_scale);
      if (!Number.isInteger(logoScale) || logoScale < 50 || logoScale > 150) {
        throw new Error("Logo display size must be between 50% and 150%.");
      }
      const existingTerminalSettings =
        existingBranding.terminalSettings &&
        typeof existingBranding.terminalSettings === "object" &&
        !Array.isArray(existingBranding.terminalSettings)
          ? (existingBranding.terminalSettings as Record<string, unknown>)
          : {};
      const terminalIdleTimeout = Number(form.terminal_idle_timeout_minutes);
      const builderLimits = {
        maxProjectMb: Number(form.builder_max_project_mb),
        maxFileMb: Number(form.builder_max_file_mb),
        maxFiles: Number(form.builder_max_files),
        maxPromptChars: Number(form.builder_max_prompt_chars),
      };
      if (Object.values(builderLimits).some((value) => !Number.isSafeInteger(value) || value < 0))
        throw new Error("Builder resource limits must be whole numbers greater than or equal to zero. Use 0 for unlimited.");
      const supportedClis = ["kilo", "opencode", "aider"];
      const enabledClis = form.terminal_cli_enabled.filter((cli) => supportedClis.includes(cli));
      if (!enabledClis.length) throw new Error("Enable at least one terminal CLI.");
      if (!enabledClis.includes(form.terminal_cli_default)) throw new Error("The default CLI must be enabled.");
      if (!Number.isInteger(terminalIdleTimeout) || terminalIdleTimeout < 0 || terminalIdleTimeout > 1440)
        throw new Error("Terminal inactivity timeout must be between 0 and 1,440 minutes.");
      if (!Number.isInteger(freeCredits) || freeCredits < 0 || freeCredits > 100000)
        throw new Error("Free AI credits must be between 0 and 100,000.");
      if (!Number.isFinite(studioPrice) || studioPrice < 0.01 || studioPrice > 1000)
        throw new Error("Studio subscription price must be between $0.01 and $1,000.");
      if (!Number.isInteger(studioCredits) || studioCredits < 1 || studioCredits > 100000)
        throw new Error("Studio AI credits must be between 1 and 100,000.");
      const { error } = await supabase
        .from("site_settings")
        .update({
          site_name: form.site_name.trim().slice(0, 60),
          logo_url: form.logo_url.trim() || null,
          site_branding_settings: {
            ...existingBranding,
            siteBranding: {
              ...existingSiteBranding,
              logo_scale: logoScale,
              background_image_url: form.background_image_url.trim(),
              banner_image_url: form.banner_image_url.trim(),
            },
            terminalSettings: {
              ...existingTerminalSettings,
              idleTimeoutMinutes: terminalIdleTimeout,
              enabledClis,
              defaultCli: form.terminal_cli_default,
            },
            builderLimits,
            siteNavigation: navigationLabels,
          } as Json,
          youtube_url: form.youtube_url.trim(),
          instagram_url: form.instagram_url.trim(),
          owner_email: form.owner_email.trim(),
          subscription_price: Number(form.subscription_price) || 0,
          subscription_quota_bytes: Number(form.subscription_quota_bytes) || 209715200,
          ai_subscription_price: studioPrice,
          ai_subscription_credits: studioCredits,
          ai_free_credits: freeCredits,
          payout_account: form.payout_account.trim() || null,
        })
        .eq("id", settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Site settings saved");
      void queryClient.invalidateQueries({ queryKey: ["site-settings"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const { data: upgrades } = useQuery({
    queryKey: ["admin", "upgrades"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_requests")
        .select("*, profiles(username, display_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Array<
        UpgradeRequest & { profiles: { username: string; display_name: string | null } | null }
      >;
    },
  });

  const reviewUpgrade = useMutation({
    mutationFn: async ({ request, approve }: { request: UpgradeRequest; approve: boolean }) => {
      const { error } = await supabase.rpc("admin_review_subscription_request", {
        p_request_id: request.id,
        p_approve: approve,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      toast.success(
        variables.approve
          ? variables.request.kind === "ai"
            ? "Payment confirmed — Studio access unlocked"
            : "Payment confirmed — space unlocked"
          : "Payment declined",
      );
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteUpgradeRequest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("subscription_requests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payment request deleted");
      void queryClient.invalidateQueries({ queryKey: ["admin", "upgrades"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const { data: projectRequests } = useQuery({
    queryKey: ["admin", "project-requests"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_requests")
        .select("*, profiles(username, display_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Array<{
        id: string;
        title: string;
        summary: string;
        skills: string | null;
        contact: string | null;
        status: string;
        created_at: string;
        profiles: { username: string; display_name: string | null } | null;
      }>;
    },
  });

  const reviewProject = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const { error } = await supabase
        .from("project_requests")
        .update({
          status: approve ? "approved" : "declined",
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      toast.success(variables.approve ? "Developer accepted" : "Application declined");
      void queryClient.invalidateQueries({ queryKey: ["admin", "project-requests"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteProjectRequest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("project_requests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Developer request deleted");
      void queryClient.invalidateQueries({ queryKey: ["admin", "project-requests"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMember = useMutation({
    mutationFn: async (userId: string) => {
      await removeAccount({ data: { userId } });
    },
    onSuccess: () => {
      toast.success("User account permanently deleted");
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (error: Error) => toast.error("Could not delete user: " + error.message),
  });

  const changeMemberRole = useMutation({
    mutationFn: async ({
      userId,
      role,
    }: {
      userId: string;
      role: "admin" | "developer" | "member";
    }) => {
      if (userId === user?.id) throw new Error("You cannot change your own role.");
      const { error: deleteError } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId);
      if (deleteError) throw deleteError;
      if (role !== "member") {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Member role updated");
      void queryClient.invalidateQueries({ queryKey: ["admin", "roles"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!isAdmin) {
    return (
      <PageShell>
        <section className="mx-auto flex max-w-xl flex-col items-center gap-3 px-4 py-24 text-center">
          <ShieldAlert className="h-10 w-10 text-destructive" />
          <h1 className="font-display text-2xl font-semibold">Admin access only</h1>
          <p className="text-sm text-muted-foreground">
            This panel is reserved for authorized site administrators. Sign in with an admin
            account to continue.
          </p>
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <section className="hero-surface border-b border-border/60 px-4 py-8 sm:py-10">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              <ShieldAlert className="h-4 w-4" /> Owner workspace
            </div>
            <h1 className="font-display text-3xl font-bold sm:text-4xl">
              <span className="brand-text">Admin</span> control center
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              One place to manage your community, members, requests, payments and platform settings.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => void queryClient.invalidateQueries({ queryKey: ["admin"] })}
          >
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh overview
          </Button>
        </div>
      </section>

      <section className="mx-auto w-full max-w-none px-4 py-6 sm:px-6 sm:py-8 xl:px-8">
        <Tabs defaultValue="overview">
          <div className="grid gap-6 lg:grid-cols-[248px_minmax(0,1fr)]">
            <aside className="h-fit rounded-2xl border border-border/70 bg-card/70 p-3 shadow-sm lg:sticky lg:top-24">
              <p className="px-3 pb-3 pt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Workspace menu
              </p>
              <TabsList className="flex h-auto w-full flex-col items-stretch justify-start gap-1 rounded-xl bg-transparent p-0">
                <TabsTrigger
                  value="overview"
                  className="w-full justify-start gap-3 rounded-xl px-3 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                >
                  <LayoutDashboard className="h-4 w-4" /> Overview
                </TabsTrigger>
                <TabsTrigger
                  value="moderation"
                  className="w-full justify-start gap-3 rounded-xl px-3 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                >
                  <Flag className="h-4 w-4" /> Content reports
                  {contentReports.filter((item) => item.status === "open").length > 0 && (
                    <span className="ml-auto rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold text-destructive-foreground">
                      {contentReports.filter((item) => item.status === "open").length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="uploads"
                  className="w-full justify-start gap-3 rounded-xl px-3 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                >
                  <FileDown className="h-4 w-4" /> Upload library
                </TabsTrigger>
                <TabsTrigger
                  value="members"
                  className="w-full justify-start gap-3 rounded-xl px-3 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                >
                  <Users className="h-4 w-4" /> Members & roles
                </TabsTrigger>
                <TabsTrigger
                  value="payments"
                  className="w-full justify-start gap-3 rounded-xl px-3 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                >
                  <CreditCard className="h-4 w-4" /> Payments
                </TabsTrigger>
                <TabsTrigger
                  value="cpa-rewards"
                  className="w-full justify-start gap-3 rounded-xl px-3 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                >
                  <Gift className="h-4 w-4" /> CPA credits
                </TabsTrigger>
                <TabsTrigger
                  value="developers"
                  className="w-full justify-start gap-3 rounded-xl px-3 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                >
                  <Code2 className="h-4 w-4" /> Developer requests
                </TabsTrigger>
                <TabsTrigger
                  value="software-requests"
                  className="w-full justify-start gap-3 rounded-xl px-3 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                >
                  <Code2 className="h-4 w-4" /> Software requests
                  {softwareRequests.filter((item) => item.status === "pending").length > 0 && (
                    <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                      {softwareRequests.filter((item) => item.status === "pending").length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="contact"
                  className="w-full justify-start gap-3 rounded-xl px-3 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                >
                  <Inbox className="h-4 w-4" /> Contact inbox
                  {contactMessages.filter((item) => !item.read_at).length > 0 && (
                    <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                      {contactMessages.filter((item) => !item.read_at).length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="video-analytics"
                  className="w-full justify-start gap-3 rounded-xl px-3 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                >
                  <Video className="h-4 w-4" /> Video analytics
                </TabsTrigger>
                <TabsTrigger
                  value="api-usage"
                  className="w-full justify-start gap-3 rounded-xl px-3 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                >
                  <Database className="h-4 w-4" /> Supabase API usage
                </TabsTrigger>
                <TabsTrigger
                  value="sessions"
                  className="w-full justify-start gap-3 rounded-xl px-3 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                >
                  <Activity className="h-4 w-4" /> Activity log
                </TabsTrigger>
                <TabsTrigger
                  value="terminal-settings"
                  className="w-full justify-start gap-3 rounded-xl px-3 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                >
                  <Terminal className="h-4 w-4" /> Terminal settings
                </TabsTrigger>
                <TabsTrigger
                  value="branding"
                  className="w-full justify-start gap-3 rounded-xl px-3 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                >
                  <Settings className="h-4 w-4" /> Site settings
                </TabsTrigger>
                <TabsTrigger
                  value="navigation"
                  className="w-full justify-start gap-3 rounded-xl px-3 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                >
                  <Settings className="h-4 w-4" /> Navigation & text
                </TabsTrigger>
                <TabsTrigger
                  value="system"
                  className="w-full justify-start gap-3 rounded-xl px-3 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                >
                  <Database className="h-4 w-4" /> System health
                </TabsTrigger>
              </TabsList>
              <div className="mt-4 rounded-xl bg-secondary/60 p-3">
                <div className="flex items-center gap-2 text-xs font-medium">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Admin access active
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Sensitive controls are protected by your account role and database policies.
                </p>
              </div>
            </aside>
            <div className="min-w-0">
              <TabsContent value="overview" className="mt-0 space-y-6">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Card className="gap-3 p-5">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="text-sm">Total members</span>
                      <Users className="h-4 w-4" />
                    </div>
                    <p className="font-display text-3xl font-bold tabular-nums">
                      {members?.length ?? "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">Registered community accounts</p>
                  </Card>
                  <Card className="gap-3 p-5">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="text-sm">Unread messages</span>
                      <Inbox className="h-4 w-4" />
                    </div>
                    <p className="font-display text-3xl font-bold tabular-nums">
                      {contactMessages.filter((item) => !item.read_at).length}
                    </p>
                    <p className="text-xs text-muted-foreground">People waiting for a response</p>
                  </Card>
                  <Card className="gap-3 p-5">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="text-sm">Pending payments</span>
                      <CreditCard className="h-4 w-4" />
                    </div>
                    <p className="font-display text-3xl font-bold tabular-nums">
                      {(upgrades ?? []).filter((item) => item.status === "pending").length}
                    </p>
                    <p className="text-xs text-muted-foreground">Subscription requests to review</p>
                  </Card>
                  <Card className="gap-3 p-5">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="text-sm">Developer applications</span>
                      <Code2 className="h-4 w-4" />
                    </div>
                    <p className="font-display text-3xl font-bold tabular-nums">
                      {(projectRequests ?? []).filter((item) => item.status === "pending").length}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Applications awaiting a decision
                    </p>
                  </Card>
                </div>
                <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                  <Card className="gap-4 p-5">
                    <div>
                      <h2 className="font-display text-lg font-semibold">
                        Administration at a glance
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Your key platform queues and account totals.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-border/70 p-4">
                        <p className="text-xs text-muted-foreground">Members with accounts</p>
                        <p className="mt-1 text-xl font-semibold">
                          {members?.length ?? "Loading…"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/70 p-4">
                        <p className="text-xs text-muted-foreground">Files tracked</p>
                        <p className="mt-1 text-xl font-semibold">{memberFileUsage.length}</p>
                      </div>
                      <div className="rounded-xl border border-border/70 p-4">
                        <p className="text-xs text-muted-foreground">Unread enquiries</p>
                        <p className="mt-1 text-xl font-semibold">
                          {contactMessages.filter((item) => !item.read_at).length}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/70 p-4">
                        <p className="text-xs text-muted-foreground">Pending reviews</p>
                        <p className="mt-1 text-xl font-semibold">
                          {(upgrades ?? []).filter((item) => item.status === "pending").length +
                            (projectRequests ?? []).filter((item) => item.status === "pending")
                              .length}
                        </p>
                      </div>
                    </div>
                  </Card>
                  <Card className="gap-3 p-5">
                    <h2 className="font-display text-lg font-semibold">Quick actions</h2>
                    <Button
                      variant="outline"
                      className="justify-start"
                      onClick={() =>
                        void queryClient.invalidateQueries({ queryKey: ["admin", "members"] })
                      }
                    >
                      <Users className="mr-2 h-4 w-4" /> Refresh member list
                    </Button>
                    <Button
                      variant="outline"
                      className="justify-start"
                      onClick={() =>
                        void queryClient.invalidateQueries({
                          queryKey: ["admin", "contact-messages"],
                        })
                      }
                    >
                      <Mail className="mr-2 h-4 w-4" /> Check contact inbox
                    </Button>
                    <Button
                      variant="outline"
                      className="justify-start"
                      onClick={() =>
                        void queryClient.invalidateQueries({ queryKey: ["admin", "system-status"] })
                      }
                    >
                      <HardDrive className="mr-2 h-4 w-4" /> Check system health
                    </Button>
                  </Card>
                </div>
              </TabsContent>
              <TabsContent value="uploads" className="mt-0 space-y-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="font-display text-2xl font-semibold">
                      Community upload library
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Review, edit or remove uploaded files and shared external download links. Add
                      resources directly from the admin workspace.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-secondary px-3 py-1.5 text-xs text-muted-foreground">
                      {adminFiles.length} resources
                    </span>
                    <UploadDialog />
                  </div>
                </div>
                {adminFilesLoading ? (
                  <Card className="p-8 text-sm text-muted-foreground">
                    Loading community resources…
                  </Card>
                ) : adminFilesError ? (
                  <Card className="flex flex-col items-start gap-3 p-6">
                    <p className="text-sm text-destructive">
                      The upload library could not be loaded. Check your connection and access
                      permissions, then try again.
                    </p>
                    <Button variant="outline" onClick={() => void refetchAdminFiles()}>
                      <RefreshCw className="mr-2 h-4 w-4" /> Retry loading uploads
                    </Button>
                  </Card>
                ) : (
                  <FileGrid files={adminFiles} />
                )}
              </TabsContent>

              <TabsContent value="moderation" className="mt-0 space-y-4">
                <div>
                  <h2 className="font-display text-xl font-semibold">Content moderation</h2>
                  <p className="text-sm text-muted-foreground">
                    Review member reports about copyright, pirated material, adult content, harassment,
                    illegal activity, malware and misleading links. Open the reported item by its ID
                    in the matching content area before deciding.
                  </p>
                </div>
                {reportsLoading ? (
                  <p className="text-sm text-muted-foreground">Loading reports…</p>
                ) : contentReports.length === 0 ? (
                  <Card className="p-8 text-center">
                    <Flag className="mx-auto h-7 w-7 text-muted-foreground" />
                    <p className="mt-2 font-medium">No content reports</p>
                    <p className="mt-1 text-sm text-muted-foreground">New member reports will appear here.</p>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {contentReports.map((report) => (
                      <Card key={report.id} className="gap-3 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold uppercase">{report.content_type}</span>
                            <span className="text-sm font-semibold">{report.reason.replaceAll("_", " ")}</span>
                            <span className="text-xs text-muted-foreground">{new Date(report.created_at).toLocaleString()}</span>
                          </div>
                          <span className="rounded-full border px-2.5 py-1 text-xs capitalize">{report.status}</span>
                        </div>
                        <p className="break-all text-xs text-muted-foreground">Content ID: {report.content_id}</p>
                        {report.details && <p className="whitespace-pre-wrap text-sm">{report.details}</p>}
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" disabled={reviewContentReport.isPending || report.status === "reviewing"} onClick={() => reviewContentReport.mutate({ id: report.id, status: "reviewing" })}>Mark reviewing</Button>
                          <Button size="sm" disabled={reviewContentReport.isPending || report.status === "resolved"} onClick={() => reviewContentReport.mutate({ id: report.id, status: "resolved" })}>Resolve</Button>
                          <Button size="sm" variant="ghost" disabled={reviewContentReport.isPending || report.status === "dismissed"} onClick={() => reviewContentReport.mutate({ id: report.id, status: "dismissed" })}>Dismiss</Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="video-analytics" className="mt-0 space-y-6">
                <div>
                  <h2 className="font-display text-2xl font-semibold">Video performance</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Real playback starts recorded by the video player. Ad impressions are not
                    included.
                  </p>
                </div>
                <Card className="min-h-[300px] gap-4 p-8 sm:p-10">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Total video views</p>
                      <p className="mt-3 font-display text-6xl font-bold tracking-tight tabular-nums sm:text-7xl">
                        {videoStatsLoading ? "…" : totalVideoViews.toLocaleString()}
                      </p>
                    </div>
                    <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary sm:h-24 sm:w-24">
                      <Eye className="h-10 w-10 sm:h-12 sm:w-12" />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-6 border-t border-border/70 pt-5 text-sm">
                    <div>
                      <p className="text-2xl font-semibold tabular-nums">{videoStats.length}</p>
                      <p className="text-muted-foreground">Videos tracked</p>
                    </div>
                    <div>
                      <p className="text-2xl font-semibold tabular-nums">
                        {videoStats
                          .reduce((best, video) => Math.max(best, Number(video.views ?? 0)), 0)
                          .toLocaleString()}
                      </p>
                      <p className="text-muted-foreground">Most views on one video</p>
                    </div>
                  </div>
                </Card>
                <Card className="gap-4 p-5 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-display text-lg font-semibold">Most-watched videos</h3>
                      <p className="text-sm text-muted-foreground">
                        Automatically refreshes every 5 minutes.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void queryClient.invalidateQueries({
                          queryKey: ["admin", "video-analytics"],
                        })
                      }
                    >
                      <RefreshCw className="mr-2 h-4 w-4" /> Refresh views
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {videoStats.map((video, index) => (
                      <div
                        key={video.id}
                        className="flex items-center justify-between gap-4 rounded-xl border border-border/70 p-4"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {index + 1}. {video.title}
                          </p>
                          <p className="mt-1 text-xs capitalize text-muted-foreground">
                            {video.category}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2 text-lg font-semibold tabular-nums">
                          <Eye className="h-4 w-4 text-primary" />
                          {Number(video.views ?? 0).toLocaleString()}
                        </div>
                      </div>
                    ))}
                    {!videoStatsLoading && videoStats.length === 0 && (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        No videos have been added yet.
                      </p>
                    )}
                  </div>
                </Card>
              </TabsContent>

              <TabsContent value="terminal-settings" className="mt-0">
                <Card className="max-w-3xl gap-4 p-6">
                  <div>
                    <h2 className="font-display text-lg font-semibold">Linux terminal inactivity</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Choose how long a Linux terminal can remain without user activity before it
                      closes automatically. This setting applies to everyone using ExpertAI Studio.
                    </p>
                  </div>
                  {form ? (
                    <>
                      <div className="space-y-3">
                        <p className="text-sm font-medium">Available coding CLIs</p>
                        <p className="text-xs text-muted-foreground">Choose which terminal agents members may launch. If several are enabled, members can choose one when opening the workspace terminal.</p>
                        {([
                          ["kilo", "Kilo Code", "Existing default agent; Kilo account or provider authentication may be required."],
                          ["opencode", "OpenCode", "Open-source terminal agent; connect a model provider or use a local model endpoint."],
                          ["aider", "Aider", "Open-source coding assistant; requires a model provider key or compatible local model."],
                        ] as const).map(([id, title, detail]) => (
                          <label key={id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 p-3">
                            <input
                              type="checkbox"
                              checked={form.terminal_cli_enabled.includes(id)}
                              disabled={form.terminal_cli_enabled.length === 1 && form.terminal_cli_enabled.includes(id)}
                              onChange={(event) => {
                                const nextEnabled = event.target.checked
                                  ? [...form.terminal_cli_enabled, id]
                                  : form.terminal_cli_enabled.filter((item) => item !== id);
                                setForm({
                                  ...form,
                                  terminal_cli_enabled: nextEnabled,
                                  terminal_cli_default: nextEnabled.includes(form.terminal_cli_default)
                                    ? form.terminal_cli_default
                                    : nextEnabled[0] ?? "kilo",
                                });
                              }}
                              className="mt-1"
                            />
                            <span className="min-w-0">
                              <span className="block text-sm font-medium">{title}</span>
                              <span className="block text-xs text-muted-foreground">{detail}</span>
                            </span>
                          </label>
                        ))}
                        <div className="max-w-sm space-y-2">
                          <Label htmlFor="terminal_cli_default">Default CLI</Label>
                          <select
                            id="terminal_cli_default"
                            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                            value={form.terminal_cli_default}
                            onChange={(event) => setForm({ ...form, terminal_cli_default: event.target.value })}
                          >
                            {form.terminal_cli_enabled.map((cli) => (
                              <option key={cli} value={cli}>{cli === "kilo" ? "Kilo Code" : cli === "opencode" ? "OpenCode" : "Aider"}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="max-w-sm space-y-2">
                        <Label htmlFor="terminal_idle_timeout_minutes">Idle timeout (minutes)</Label>
                        <Input
                          id="terminal_idle_timeout_minutes"
                          type="number"
                          min="0"
                          max="1440"
                          step="1"
                          value={form.terminal_idle_timeout_minutes}
                          onChange={(event) =>
                            setForm({ ...form, terminal_idle_timeout_minutes: event.target.value })
                          }
                        />
                        <p className="text-xs leading-5 text-muted-foreground">
                          Enter 0 to disable automatic inactivity closure, 30 for half an hour, or
                          60 for one hour. The cloud runtime may still enforce its own maximum
                          session lifetime.
                        </p>
                      </div>
                      <Button
                        onClick={() => saveSettings.mutate()}
                        disabled={saveSettings.isPending}
                      >
                        {saveSettings.isPending ? "Saving…" : "Save terminal settings and CLI access"}
                      </Button>
                      <div className="space-y-4 rounded-xl border border-border/70 bg-background/50 p-4">
                        <div>
                          <h3 className="font-semibold">Builder resource policy</h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Control member quotas. Set a value to 0 to remove your admin-defined cap. A temporary transport safety ceiling still applies while project files are stored in a single JSON document: 25 MB total, 10 MB per file and 2,000 files. Moving to per-file storage is required before those technical ceilings can be lifted safely.
                          </p>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="builder_max_project_mb">Maximum project size (MB)</Label>
                            <Input id="builder_max_project_mb" type="number" min="0" step="1" value={form.builder_max_project_mb} onChange={(event) => setForm({ ...form, builder_max_project_mb: event.target.value })} />
                            <p className="text-xs text-muted-foreground">0 = no admin-defined cap; temporary 10 MB file / 25 MB project ceiling still applies</p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="builder_max_file_mb">Maximum individual file (MB)</Label>
                            <Input id="builder_max_file_mb" type="number" min="0" step="1" value={form.builder_max_file_mb} onChange={(event) => setForm({ ...form, builder_max_file_mb: event.target.value })} />
                            <p className="text-xs text-muted-foreground">0 = no admin-defined cap; temporary 10 MB per-file ceiling still applies</p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="builder_max_files">Maximum project files</Label>
                            <Input id="builder_max_files" type="number" min="0" step="1" value={form.builder_max_files} onChange={(event) => setForm({ ...form, builder_max_files: event.target.value })} />
                            <p className="text-xs text-muted-foreground">0 = no admin-defined cap; temporary 2,000-file ceiling still applies</p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="builder_max_prompt_chars">Maximum agent prompt characters</Label>
                            <Input id="builder_max_prompt_chars" type="number" min="0" step="1000" value={form.builder_max_prompt_chars} onChange={(event) => setForm({ ...form, builder_max_prompt_chars: event.target.value })} />
                            <p className="text-xs text-muted-foreground">0 = no admin-defined prompt cap; agent transport safety limit still applies</p>
                          </div>
                        </div>
                        <Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>
                          {saveSettings.isPending ? "Saving…" : "Save Builder resource policy"}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Loading settings…</p>
                  )}
                </Card>
              </TabsContent>

              <TabsContent value="branding" className="mt-0">
                <Card className="max-w-3xl gap-4 p-6">
                  <div>
                    <h2 className="font-display text-lg font-semibold">
                      Website branding and appearance
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Upload a background image from your device or paste an image URL. Uploaded
                      images are stored in Supabase and remain available after refreshes and
                      deployments.
                    </p>
                  </div>
                  {form ? (
                    <>
                      <div className="space-y-3 rounded-xl border border-border/70 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <Label htmlFor="site-logo-upload">Website logo</Label>
                            <p className="mt-1 text-xs text-muted-foreground">PNG, JPG, WebP or GIF · maximum 5 MB. Transparent PNG recommended.</p>
                          </div>
                          <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                            <ImagePlus className="mr-2 h-4 w-4" />
                            {logoUploadPending ? "Uploading…" : "Upload logo"}
                            <input id="site-logo-upload" type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" disabled={logoUploadPending}
                              onChange={async (event) => {
                                const file = event.target.files?.[0];
                                if (!file) return;
                                try {
                                  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) throw new Error("Choose a PNG, JPG, WebP or GIF image.");
                                  if (file.size > 5 * 1024 * 1024) throw new Error("Logo must be 5 MB or smaller.");
                                  setLogoUploadPending(true);
                                  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
                                  const filePath = "site-branding/logo-" + Date.now() + "." + extension;
                                  const { error: uploadError } = await supabase.storage.from("site-assets").upload(filePath, file, { cacheControl: "31536000", contentType: file.type, upsert: true });
                                  if (uploadError) throw uploadError;
                                  const { data } = supabase.storage.from("site-assets").getPublicUrl(filePath);
                                  setForm((current) => current ? { ...current, logo_url: data.publicUrl } : current);
                                  toast.success("Logo uploaded. Click Save settings to apply it across the website.");
                                } catch (error) {
                                  toast.error(error instanceof Error ? error.message : "Logo upload failed.");
                                } finally {
                                  setLogoUploadPending(false);
                                  event.target.value = "";
                                }
                              }}
                            />
                          </label>
                        </div>
                        {form.logo_url ? (
                          <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border/70 bg-muted/20 p-4">
                            <div className="flex h-24 w-40 items-center justify-center rounded-lg bg-background p-3">
                              <img src={form.logo_url} alt="Website logo preview" className="max-h-full max-w-full object-contain" />
                            </div>
                            <Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, logo_url: "" })}>Remove logo</Button>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No custom logo selected. Upload an image to preview it here.</div>
                        )}
                        <div className="space-y-3 rounded-lg border border-border/70 bg-background/50 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <Label htmlFor="logo-display-size">Logo display size</Label>
                            <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold tabular-nums text-primary">{form.logo_scale}%</span>
                          </div>
                          <input
                            id="logo-display-size"
                            type="range"
                            min="50"
                            max="150"
                            step="5"
                            value={form.logo_scale}
                            onChange={(event) => setForm({ ...form, logo_scale: event.target.value })}
                            className="w-full cursor-pointer accent-primary"
                          />
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>50% · Compact</span>
                            <span>100% · Default</span>
                            <span>150% · Large</span>
                          </div>
                          <div className="flex min-h-24 items-center gap-4 rounded-lg bg-muted/40 p-3">
                            <img
                              src={form.logo_url || "/logo.svg?v=20261121-3"}
                              alt="Logo size preview"
                              className="shrink-0 rounded-full object-contain"
                              style={{ width: `${72 * Number(form.logo_scale) / 100}px`, height: `${72 * Number(form.logo_scale) / 100}px` }}
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-semibold">Experts<span className="text-primary">Team</span></p>
                              <p className="text-xs text-muted-foreground">Live header-size preview</p>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground">This controls the logo size in the website header on desktop and mobile. Save settings to publish the size everywhere.</p>
                        </div>
                      </div>
                      <div className="space-y-3 rounded-xl border border-border/70 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <Label htmlFor="background-image-upload">
                              Website background image
                            </Label>
                            <p className="mt-1 text-xs text-muted-foreground">
                              JPG, PNG, WebP or GIF · maximum 10 MB
                            </p>
                          </div>
                          <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                            <ImagePlus className="mr-2 h-4 w-4" />
                            {backgroundUploadPending ? "Uploading…" : "Choose image"}
                            <input
                              id="background-image-upload"
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/gif"
                              className="sr-only"
                              disabled={backgroundUploadPending}
                              onChange={async (event) => {
                                const file = event.target.files?.[0];
                                if (!file) return;
                                try {
                                  if (!file.type.startsWith("image/"))
                                    throw new Error("Choose a valid image file.");
                                  if (file.size > 10 * 1024 * 1024)
                                    throw new Error("Image must be 10 MB or smaller.");
                                  setBackgroundUploadPending(true);
                                  const extension =
                                    file.name
                                      .split(".")
                                      .pop()
                                      ?.toLowerCase()
                                      .replace(/[^a-z0-9]/g, "") || "jpg";
                                  const filePath =
                                    "site-branding/background-" + Date.now() + "." + extension;
                                  const { error: uploadError } = await supabase.storage
                                    .from("site-assets")
                                    .upload(filePath, file, {
                                      cacheControl: "31536000",
                                      contentType: file.type,
                                      upsert: true,
                                    });
                                  if (uploadError) throw uploadError;
                                  const { data } = supabase.storage
                                    .from("site-assets")
                                    .getPublicUrl(filePath);
                                  setForm((current) =>
                                    current
                                      ? { ...current, background_image_url: data.publicUrl }
                                      : current,
                                  );
                                  toast.success(
                                    "Background uploaded. Click Save settings to publish it.",
                                  );
                                } catch (error) {
                                  toast.error(
                                    error instanceof Error ? error.message : "Image upload failed.",
                                  );
                                } finally {
                                  setBackgroundUploadPending(false);
                                  event.target.value = "";
                                }
                              }}
                            />
                          </label>
                        </div>
                        {form.background_image_url ? (
                          <div className="space-y-2">
                            <img
                              src={form.background_image_url}
                              alt="Website background preview"
                              className="max-h-64 w-full rounded-lg border border-border/70 object-cover"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setForm({ ...form, background_image_url: "" })}
                            >
                              Remove background
                            </Button>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                            No background image selected. Choose an image to see its preview here.
                          </div>
                        )}
                      </div>
                      {(
                        [
                          ["site_name", "Website name"],
                          ["logo_url", "Logo image URL"],
                          ["background_image_url", "Website background image URL"],
                          ["banner_image_url", "Top banner image URL"],
                          ["youtube_url", "YouTube channel URL"],
                          ["instagram_url", "Instagram URL"],
                          ["owner_email", "Owner email"],
                          ["subscription_price", "Subscription price (USD)"],
                          ["subscription_quota_bytes", "Subscriber storage (bytes)"],
                          ["ai_subscription_price", "Studio subscription price (USD per 30 days)"],
                          ["ai_subscription_credits", "Studio AI credits per 30-day plan"],
                          ["ai_free_credits", "Free AI credits for new accounts"],
                          ["payout_account", "Payout account (PayPal email / card account)"],
                        ] as Array<[keyof SettingsForm, string]>
                      ).map(([key, label]) => (
                        <div key={key} className="space-y-2">
                          <Label htmlFor={key}>{label}</Label>
                          <Input
                            id={key}
                            value={form[key]}
                            disabled={key === "owner_email" && !isCreator}
                            placeholder={
                              key === "owner_email"
                                ? "hello@yourwebsite.com"
                                : key === "instagram_url"
                                  ? "https://instagram.com/yourhandle"
                                  : key === "youtube_url"
                                    ? "https://youtube.com/@yourchannel"
                                    : key === "logo_url"
                                      ? "https://example.com/logo.png"
                                      : key === "background_image_url"
                                        ? "https://example.com/background.jpg"
                                        : key === "banner_image_url"
                                          ? "https://example.com/banner.jpg"
                                          : ""
                            }
                            onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                          />
                        </div>
                      ))}
                      <Button
                        onClick={() => saveSettings.mutate()}
                        disabled={saveSettings.isPending}
                      >
                        {saveSettings.isPending ? "Saving…" : "Save settings"}
                      </Button>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Loading settings…</p>
                  )}
                </Card>
                <Card className="mt-4 max-w-3xl gap-4 p-6">
                  <div>
                    <h2 className="font-display text-lg font-semibold">
                      ExpertAI service connections
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Create API keys with the providers below, then add them in Vercel → Project →
                      Settings → Environment Variables. Keep every key server-side; never use a
                      VITE_ prefix.
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      ["Google AI Studio", "https://aistudio.google.com/api-keys"],
                      ["Groq", "https://console.groq.com/keys"],
                      ["Mistral Studio", "https://console.mistral.ai/api-keys/"],
                      ["OpenRouter", "https://openrouter.ai/settings/keys"],
                      ["Cloudflare Workers AI", "https://dash.cloudflare.com/"],
                    ].map(([label, url]) => (
                      <a
                        key={label}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-border p-3 text-sm font-medium transition-colors hover:border-primary/50 hover:bg-secondary/50"
                      >
                        {label} <span className="ml-1 text-primary">↗</span>
                      </a>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Recommended order is managed automatically. Keep service keys in Vercel
                    server-side environment variables. ExpertAI hides provider details from regular
                    users.
                  </p>
                  <a
                    href="https://github.com/expertsteam802/ExpertsTeamWebsite/blob/main/docs/AI_PROVIDER_SETUP.md"
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-primary underline underline-offset-4"
                  >
                    Read AI provider setup guide
                  </a>
                </Card>
              </TabsContent>

              <TabsContent value="navigation" className="mt-0 space-y-5">
                <Card className="max-w-3xl gap-4 p-6">
                  <div>
                    <h2 className="font-display text-lg font-semibold">Navigation labels</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Rename the main tabs and the links shown beneath them in the bottom
                      navigation. Keep the JSON keys unchanged; edit only the text values.
                    </p>
                  </div>
                  {form ? (
                    <>
                      <Textarea
                        rows={14}
                        value={form.navigation_labels_json}
                        onChange={(event) =>
                          setForm({ ...form, navigation_labels_json: event.target.value })
                        }
                        className="font-mono text-xs"
                        aria-label="Navigation label settings"
                      />
                      <Button
                        onClick={() => saveSettings.mutate()}
                        disabled={saveSettings.isPending}
                      >
                        {saveSettings.isPending ? "Saving…" : "Save navigation labels"}
                      </Button>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Loading settings…</p>
                  )}
                </Card>
                <Card className="max-w-3xl gap-3 p-6">
                  <h2 className="font-display text-lg font-semibold">Edit website text</h2>
                  <p className="text-sm leading-6 text-muted-foreground">
                    On any website page, use the blue “Edit site text” control to turn on editing,
                    then select a heading, paragraph, or label to change it. Your changes are saved
                    in the site settings and reused wherever that same website text appears.
                  </p>
                </Card>
              </TabsContent>

              <TabsContent value="members" className="mt-0 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-xl font-semibold">Member directory</h2>
                    <p className="text-sm text-muted-foreground">
                      Find accounts, review storage and update access roles.
                    </p>
                  </div>
                  <div className="w-full sm:max-w-xs">
                    <Input
                      value={memberSearch}
                      onChange={(event) => setMemberSearch(event.target.value)}
                      placeholder="Search members or usernames…"
                      aria-label="Search members"
                    />
                  </div>
                </div>
                <div className="grid gap-3">
                  {(members ?? [])
                    .filter((member) =>
                      `${member.display_name ?? ""} ${member.username}`
                        .toLowerCase()
                        .includes(memberSearch.toLowerCase()),
                    )
                    .map((member) => (
                      <Card
                        key={member.id}
                        className="flex-row flex-wrap items-center justify-between gap-3 p-4"
                      >
                        <div>
                          <p className="font-medium">{member.display_name || member.username}</p>
                          <p className="text-xs text-muted-foreground">
                            @{member.username} · joined {formatDate(member.created_at)} ·{" "}
                            {formatBytes(
                              memberFileUsage
                                .filter((file) => file.user_id === member.id)
                                .reduce((total, file) => total + Number(file.size_bytes), 0),
                            )}{" "}
                            used / {formatBytes(member.storage_quota_bytes)} quota
                            {member.is_subscribed ? " · storage subscriber" : ""}
                            {member.ai_subscribed &&
                            (!member.ai_subscription_expires_at ||
                              new Date(member.ai_subscription_expires_at) > new Date())
                              ? ` · Studio subscriber (${member.ai_credits} credits)`
                              : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            aria-label={`Role for ${member.username}`}
                            value={
                              memberRoles.find((item) => item.user_id === member.id)?.role ??
                              "member"
                            }
                            disabled={member.id === user?.id || memberRoles.some((item) => item.user_id === member.id && item.role === "creator") || changeMemberRole.isPending}
                            onChange={(event) =>
                              changeMemberRole.mutate({
                                userId: member.id,
                                role: event.target.value as "admin" | "developer" | "member",
                              })
                            }
                            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                          >
                            <option value="member">Member</option>
                            <option value="developer">Developer</option>
                            <option value="admin">Admin</option>
                          </select>
                          {member.id !== user?.id && !memberRoles.some((item) => item.user_id === member.id && item.role === "creator") && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                const confirmed = window.confirm(
                                  "Permanently delete this user and their uploaded files? This cannot be undone.",
                                );
                                if (confirmed) deleteMember.mutate(member.id);
                              }}
                              disabled={deleteMember.isPending}
                            >
                              {deleteMember.isPending ? "Deleting…" : "Delete user"}
                            </Button>
                          )}
                        </div>
                      </Card>
                    ))}
                </div>
              </TabsContent>

              <TabsContent value="sessions" className="mt-0">
                <Card className="divide-y divide-border p-0">
                  {(sessions ?? []).map((event) => (
                    <div
                      key={event.id}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <span className="text-sm">
                        {event.profiles?.display_name ||
                          event.profiles?.username ||
                          "Unknown member"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {event.event === "signed_in" ? "logged in" : "logged out"} ·{" "}
                        {formatDate(event.created_at)}
                      </span>
                    </div>
                  ))}
                  {!sessions?.length && (
                    <p className="px-4 py-6 text-sm text-muted-foreground">
                      No sign-in activity yet.
                    </p>
                  )}
                </Card>
              </TabsContent>

              <TabsContent value="cpa-rewards" className="mt-0 space-y-4">
                <AdminCpaPanel />
              </TabsContent>

              <TabsContent value="payments" className="mt-0 space-y-4">
                <div>
                  <h2 className="font-display text-xl font-semibold">Payment review</h2>
                  <p className="text-sm text-muted-foreground">
                    Verify subscription requests before unlocking member benefits.
                  </p>
                </div>
                <div className="space-y-3">
                  {(upgrades ?? []).map((request) => (
                    <Card key={request.id} className="gap-3 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">
                            {request.profiles?.display_name ||
                              request.profiles?.username ||
                              "Member"}{" "}
                            · ${Number(request.amount).toFixed(2)} ·{" "}
                            {request.kind === "ai" ? "Studio plan" : "Storage"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {paymentMethodLabel(request.method)} · ref {request.reference} ·{" "}
                            {formatDate(request.created_at)} · {request.status}
                          </p>
                          {request.note && (
                            <p className="mt-1 text-xs text-muted-foreground">“{request.note}”</p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {request.status === "pending" && (
                            <>
                              <Button
                                size="sm"
                                disabled={reviewUpgrade.isPending}
                                onClick={() => reviewUpgrade.mutate({ request, approve: true })}
                              >
                                Confirm payment
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={reviewUpgrade.isPending}
                                onClick={() => reviewUpgrade.mutate({ request, approve: false })}
                              >
                                Decline
                              </Button>
                            </>
                          )}
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={deleteUpgradeRequest.isPending}
                            onClick={() => {
                              if (window.confirm("Delete this payment request permanently?")) {
                                deleteUpgradeRequest.mutate(request.id);
                              }
                            }}
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                  {!upgrades?.length && (
                    <p className="text-sm text-muted-foreground">
                      No subscription payments submitted yet.
                    </p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="developers" className="mt-0 space-y-4">
                <div>
                  <h2 className="font-display text-xl font-semibold">Developer applications</h2>
                  <p className="text-sm text-muted-foreground">
                    Review project proposals and decide who can join the developer team.
                  </p>
                </div>
                <div className="space-y-3">
                  {(projectRequests ?? []).map((request) => (
                    <Card key={request.id} className="gap-2 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">
                            {request.title} ·{" "}
                            {request.profiles?.display_name ||
                              request.profiles?.username ||
                              "Member"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(request.created_at)} · {request.status}
                            {request.skills ? ` · ${request.skills}` : ""}
                            {request.contact ? ` · ${request.contact}` : ""}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">{request.summary}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {request.status === "pending" && (
                            <>
                              <Button
                                size="sm"
                                disabled={reviewProject.isPending}
                                onClick={() =>
                                  reviewProject.mutate({ id: request.id, approve: true })
                                }
                              >
                                Accept
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={reviewProject.isPending}
                                onClick={() =>
                                  reviewProject.mutate({ id: request.id, approve: false })
                                }
                              >
                                Decline
                              </Button>
                            </>
                          )}
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={deleteProjectRequest.isPending}
                            onClick={() => {
                              if (window.confirm("Delete this developer request permanently?")) {
                                deleteProjectRequest.mutate(request.id);
                              }
                            }}
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                  {!projectRequests?.length && (
                    <p className="text-sm text-muted-foreground">No developer applications yet.</p>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="software-requests" className="mt-0 space-y-4">
                <div>
                  <h2 className="font-display text-xl font-semibold">Custom software requests</h2>
                  <p className="text-sm text-muted-foreground">
                    Review business and individual enquiries, contact the requester and track delivery progress.
                  </p>
                </div>
                {softwareRequestsLoading && <p className="text-sm text-muted-foreground">Loading software requests…</p>}
                {softwareRequestsError && (
                  <Card className="p-4 text-sm text-destructive">
                    Could not load software requests. Check the software request migration and admin permissions.
                  </Card>
                )}
                {!softwareRequestsLoading && !softwareRequestsError && softwareRequests.length === 0 && (
                  <Card className="p-6 text-center text-sm text-muted-foreground">No software requests have been submitted yet.</Card>
                )}
                <div className="space-y-3">
                  {softwareRequests.map((request) => (
                    <Card key={request.id} className="gap-3 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold">{request.project_type}</h3>
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold capitalize text-primary">{request.status.replace("_", " ")}</span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {request.full_name}{request.business_name ? " · " + request.business_name : ""} · {formatDate(request.created_at)}
                          </p>
                          <p className="mt-1 text-xs">
                            <a className="text-primary hover:underline" href={`mailto:${request.email}?subject=${encodeURIComponent("Re: " + request.project_type)}`}>{request.email}</a>
                            {request.contact_method ? " · Preferred contact: " + request.contact_method : ""}
                            {request.budget ? " · Budget: " + request.budget : ""}
                          </p>
                        </div>
                        <select
                          aria-label={"Update status for " + request.full_name}
                          className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                          value={request.status}
                          disabled={updateSoftwareRequest.isPending}
                          onChange={(event) => updateSoftwareRequest.mutate({ id: request.id, status: event.target.value })}
                        >
                          <option value="pending">Pending</option>
                          <option value="reviewing">Reviewing</option>
                          <option value="in_progress">In progress</option>
                          <option value="delivered">Delivered</option>
                          <option value="declined">Declined</option>
                        </select>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{request.description}</p>
                      {request.admin_note && <p className="rounded-lg bg-secondary p-3 text-xs">Team note: {request.admin_note}</p>}
                    </Card>
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="contact" className="mt-0 space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="font-display text-xl font-semibold">Contact inbox</h2>
                    <p className="text-sm text-muted-foreground">
                      Read enquiries from visitors and follow up directly by email.
                    </p>
                  </div>
                  <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                    <Input
                      className="w-full sm:w-64"
                      value={contactSearch}
                      onChange={(event) => setContactSearch(event.target.value)}
                      placeholder="Search sender, email or subject…"
                      aria-label="Search contact messages"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        markAllContactsRead.isPending ||
                        !contactMessages.some((item) => !item.read_at)
                      }
                      onClick={() => markAllContactsRead.mutate()}
                    >
                      <Check className="mr-2 h-4 w-4" /> Mark all read
                    </Button>
                  </div>
                </div>
                <div className="space-y-3">
                  {contactMessagesLoading && (
                    <p className="text-sm text-muted-foreground">Loading contact messages…</p>
                  )}
                  {contactMessagesError && (
                    <Card className="p-4">
                      <p className="text-sm text-destructive">
                        Could not load contact messages. Check that the latest database migration
                        has been applied.
                      </p>
                    </Card>
                  )}
                  {!contactMessagesLoading &&
                    !contactMessagesError &&
                    contactMessages.length === 0 && (
                      <Card className="p-6 text-center">
                        <Mail className="mx-auto h-7 w-7 text-muted-foreground" />
                        <p className="mt-2 text-sm text-muted-foreground">
                          No contact messages yet.
                        </p>
                      </Card>
                    )}
                  {contactMessages
                    .filter((item) =>
                      `${item.sender_name} ${item.sender_email} ${item.subject} ${item.message}`
                        .toLowerCase()
                        .includes(contactSearch.toLowerCase()),
                    )
                    .map((item) => (
                      <Card
                        key={item.id}
                        className={`gap-3 p-4 ${item.read_at ? "opacity-80" : "border-primary/40"}`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold">{item.subject}</p>
                              {!item.read_at && (
                                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                                  New
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {item.sender_name} ·{" "}
                              <a
                                className="text-primary hover:underline"
                                href={`mailto:${item.sender_email}`}
                              >
                                {item.sender_email}
                              </a>{" "}
                              · {formatDate(item.created_at)}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={updateContactMessage.isPending}
                              onClick={() =>
                                updateContactMessage.mutate({ id: item.id, read: !item.read_at })
                              }
                            >
                              <Check className="mr-1.5 h-3.5 w-3.5" />{" "}
                              {item.read_at ? "Mark unread" : "Mark read"}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Delete contact message"
                              disabled={deleteContactMessage.isPending}
                              onClick={() => deleteContactMessage.mutate(item.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                          {item.message}
                        </p>
                      </Card>
                    ))}
                </div>
              </TabsContent>

              <TabsContent value="api-usage" className="mt-0 space-y-4">
                <AdminApiUsagePanel />
              </TabsContent>

              <TabsContent value="system" className="mt-0 space-y-4">
                <div>
                  <h2 className="font-display text-xl font-semibold">System health</h2>
                  <p className="text-sm text-muted-foreground">
                    Live checks for database access and tracked platform usage.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <Card className="gap-2 p-5">
                    <p className="text-sm text-muted-foreground">Supabase connection</p>
                    <p className="text-xl font-semibold">
                      {systemStatusLoading
                        ? "Checking…"
                        : systemStatusError
                          ? "Connection issue"
                          : "Connected"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Live database query, refreshed every 30 seconds
                    </p>
                  </Card>
                  <Card className="gap-2 p-5">
                    <p className="text-sm text-muted-foreground">Registered members</p>
                    <p className="text-2xl font-semibold tabular-nums">
                      {systemStatus?.memberCount ?? "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Profiles visible to this admin account
                    </p>
                  </Card>
                  <Card className="gap-2 p-5">
                    <p className="text-sm text-muted-foreground">Tracked uploaded files</p>
                    <p className="text-2xl font-semibold tabular-nums">
                      {systemStatus ? formatBytes(systemStatus.trackedUploadBytes) : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Recorded file sizes, not the Supabase project storage quota
                    </p>
                  </Card>
                </div>
                {systemStatus?.checkedAt && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Last checked {formatDate(systemStatus.checkedAt)}
                  </p>
                )}
              </TabsContent>
            </div>
          </div>
        </Tabs>
      </section>
    </PageShell>
  );
}
