import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { resolve4, resolveCname, resolveTxt } from "node:dns/promises";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const setStagingPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({
    projectId: z.string().uuid(),
    password: z.string().min(8).max(128),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: project, error: projectError } = await context.supabase
      .from("agent_projects").select("id").eq("id", data.projectId).eq("user_id", context.userId).maybeSingle();
    if (projectError || !project) throw new Error("Project not found or access denied.");
    const salt = randomBytes(16).toString("hex");
    const passwordHash = scryptSync(data.password, salt, 64).toString("hex");
    const { error } = await supabaseAdmin.from("agent_project_staging_access").upsert({
      project_id: data.projectId,
      user_id: context.userId,
      password_salt: salt,
      password_hash: passwordHash,
      updated_at: new Date().toISOString(),
    }, { onConflict: "project_id" });
    if (error) throw new Error("Could not save the staging password.");
    return { saved: true };
  });

export const getStagingDeployment = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/),
    password: z.string().min(1).max(128),
  }).parse(input))
  .handler(async ({ data }) => {
    const { data: deployment, error: deploymentError } = await supabaseAdmin
      .from("agent_project_deployments")
      .select("project_id,deployment_url")
      .eq("slug", data.slug)
      .eq("environment", "staging")
      .eq("status", "success")
      .eq("is_current", true)
      .maybeSingle();
    if (deploymentError || !deployment) throw new Error("The staging app is unavailable or the password is incorrect.");
    const { data: access, error: accessError } = await supabaseAdmin
      .from("agent_project_staging_access")
      .select("password_salt,password_hash")
      .eq("project_id", deployment.project_id)
      .maybeSingle();
    if (accessError || !access) throw new Error("The staging app is unavailable or the password is incorrect.");
    const provided = scryptSync(data.password, access.password_salt, 64);
    const expected = Buffer.from(access.password_hash, "hex");
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      throw new Error("The staging app is unavailable or the password is incorrect.");
    }
    const { data: project } = await supabaseAdmin.from("agent_projects").select("name").eq("id", deployment.project_id).maybeSingle();
    return { deploymentUrl: deployment.deployment_url, name: project?.name ?? "Staging app" };
  });

function normalizeCustomDomain(input: string): string {
  const domain = input.trim().toLowerCase().replace(/\.$/, "");
  if (!domain || domain.length > 253 || domain.includes("*")) throw new Error("Enter a valid custom domain.");
  let parsed: URL;
  try { parsed = new URL("https://" + domain); } catch { throw new Error("Enter a valid custom domain."); }
  if (parsed.hostname !== domain || parsed.pathname !== "/" || parsed.search || parsed.hash ||
      !domain.includes(".") || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
    throw new Error("Enter a valid fully qualified domain name without a path.");
  }
  if (domain === "expertsteam.giize.com" || domain.endsWith(".expertsteam.giize.com")) {
    throw new Error("Use a different domain; ExpertsTeam subdomains are managed automatically.");
  }
  return domain;
}

async function netlifyRequest(path: string, method: "GET" | "PATCH" | "POST", body?: unknown) {
  const token = process.env["NETLIFY_AUTH_TOKEN"]?.trim();
  const siteId = process.env["NETLIFY_SITE_ID"]?.trim();
  if (!token || !siteId) throw new Error("Custom domains require NETLIFY_AUTH_TOKEN and NETLIFY_SITE_ID on the server.");
  const response = await fetch("https://api.netlify.com/api/v1/sites/" + encodeURIComponent(siteId) + path, {
    method,
    headers: { Authorization: "Bearer " + token, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => ({})) as { domain_aliases?: string[]; ssl?: boolean; message?: string; error?: string };
  if (!response.ok) throw new Error(payload.message || payload.error || "Netlify could not update the custom domain.");
  return payload;
}

export const addProjectCustomDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ projectId: z.string().uuid(), domain: z.string().min(3).max(253) }).parse(input))
  .handler(async ({ data, context }) => {
    const domain = normalizeCustomDomain(data.domain);
    const { data: project, error: projectError } = await context.supabase
      .from("agent_projects").select("id,slug,published").eq("id", data.projectId).eq("user_id", context.userId).maybeSingle();
    if (projectError || !project || !project.published || !project.slug) throw new Error("Publish this project to production before adding a custom domain.");
    const dnsTarget = process.env["NETLIFY_SITE_HOSTNAME"]?.trim().toLowerCase();
    if (!dnsTarget || !dnsTarget.endsWith(".netlify.app")) throw new Error("Set NETLIFY_SITE_HOSTNAME to this site's assigned .netlify.app hostname.");
    const verificationToken = randomBytes(24).toString("hex");
    const verificationHost = "_expertsteam-verification." + domain;
    const { data: row, error } = await supabaseAdmin.from("agent_project_domains").insert({
      project_id: data.projectId,
      user_id: context.userId,
      slug: project.slug,
      domain,
      verification_host: verificationHost,
      verification_token: verificationToken,
      dns_target: dnsTarget,
      status: "pending",
    }).select("id,domain,verification_host,verification_token,dns_target,status").single();
    if (error || !row) {
      if (error?.code === "23505") throw new Error("That domain is already registered to an ExpertsTeam project.");
      throw new Error("Could not create the custom-domain verification request.");
    }
    return {
      id: row.id,
      domain: row.domain,
      verificationHost: row.verification_host,
      verificationToken: row.verification_token,
      dnsTarget: row.dns_target,
      status: row.status,
    };
  });

export const verifyProjectCustomDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ domainId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("agent_project_domains")
      .select("id,domain,verification_host,verification_token,dns_target,status")
      .eq("id", data.domainId).eq("user_id", context.userId).maybeSingle();
    if (error || !row) throw new Error("Custom-domain request not found.");
    if (row.status === "active") return { status: "active", sslReady: true, domain: row.domain };
    let txt: string[] = [];
    try { txt = (await resolveTxt(row.verification_host)).flat(); } catch { /* DNS has not propagated yet. */ }
    if (!txt.includes(row.verification_token)) {
      return { status: "pending", step: "txt", domain: row.domain, verificationHost: row.verification_host, verificationToken: row.verification_token, dnsTarget: row.dns_target };
    }

    const site = await netlifyRequest("", "GET");
    const aliases = site.domain_aliases ?? [];
    if (!aliases.includes(row.domain)) {
      await netlifyRequest("", "PATCH", { domain_aliases: [...aliases, row.domain] });
    }

    let dnsReady = false;
    try {
      const cname = (await resolveCname(row.domain)).map((value) => value.toLowerCase().replace(/\.$/, ""));
      dnsReady = cname.some((value) => value === row.dns_target || value.endsWith(".netlify.app") || value === "apex-loadbalancer.netlify.com");
    } catch { /* Check A records below for apex domains. */ }
    if (!dnsReady) {
      try {
        const addresses = await resolve4(row.domain);
        const allowedIps = (process.env["NETLIFY_LOAD_BALANCER_IPS"] ?? "75.2.60.5").split(",").map((value) => value.trim());
        dnsReady = addresses.some((address) => allowedIps.includes(address));
      } catch { /* DNS has not propagated yet. */ }
    }
    if (!dnsReady) {
      const { error: pendingUpdateError } = await supabaseAdmin.from("agent_project_domains")
        .update({ netlify_added: true, updated_at: new Date().toISOString() }).eq("id", row.id);
      if (pendingUpdateError) throw new Error("DNS is not ready, and the domain status could not be saved.");
      return { status: "pending", step: "dns", domain: row.domain, verificationHost: row.verification_host, verificationToken: row.verification_token, dnsTarget: row.dns_target };
    }

    await netlifyRequest("/ssl", "POST");
    const refreshed = await netlifyRequest("", "GET");
    const sslReady = Boolean(refreshed.ssl);
    const nextStatus = sslReady ? "active" : "pending";
    const { error: statusUpdateError } = await supabaseAdmin.from("agent_project_domains").update({
      netlify_added: true,
      ssl_ready: sslReady,
      status: nextStatus,
      verified_at: sslReady ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq("id", row.id);
    if (statusUpdateError) throw new Error("The domain passed DNS checks, but its verification status could not be saved.");
    return { status: nextStatus, step: sslReady ? "complete" : "ssl", sslReady, domain: row.domain, dnsTarget: row.dns_target };
  });

export const removeProjectCustomDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ domainId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("agent_project_domains")
      .select("id,domain").eq("id", data.domainId).eq("user_id", context.userId).maybeSingle();
    if (error || !row) throw new Error("Custom-domain request not found.");
    const site = await netlifyRequest("", "GET");
    const aliases = site.domain_aliases ?? [];
    if (aliases.includes(row.domain)) {
      await netlifyRequest("", "PATCH", { domain_aliases: aliases.filter((alias) => alias !== row.domain) });
    }
    const { error: deleteError } = await supabaseAdmin.from("agent_project_domains").delete().eq("id", row.id);
    if (deleteError) throw new Error("Netlify removed the alias, but the ExpertsTeam record could not be deleted.");
    return { removed: true };
  });
