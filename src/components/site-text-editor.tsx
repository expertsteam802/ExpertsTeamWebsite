import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, X } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/use-auth";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

const originalText = new WeakMap<Text, string>();

function textKey(value: string) {
  return value.replace(/\\s+/g, " ").trim();
}

function applySiteCopy(copy: Record<string, string>) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode() as Text | null;
  while (current) {
    const parent = current.parentElement;
    const excluded = parent?.closest("script,style,textarea,input,select,option,code,pre,svg,[contenteditable=true],[data-site-copy-ignore]");
    if (!excluded && current.nodeValue?.trim()) {
      const source = originalText.get(current) ?? current.nodeValue;
      originalText.set(current, source);
      const key = textKey(source);
      const replacement = copy[key];
      const leading = source.match(/^\\s*/)?.[0] ?? "";
      const trailing = source.match(/\\s*$/)?.[0] ?? "";
      const next = replacement === undefined ? source : leading + replacement + trailing;
      if (current.nodeValue !== next) current.nodeValue = next;
    }
    current = walker.nextNode() as Text | null;
  }
}

export function SiteTextEditor() {
  const { isAdmin } = useAuth();
  const settings = useSiteSettings();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const editingRef = useRef(false);

  useEffect(() => {
    applySiteCopy(settings.site_copy);
    const observer = new MutationObserver(() => applySiteCopy(settings.site_copy));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [settings.site_copy]);

  useEffect(() => {
    editingRef.current = editing;
    document.body.classList.toggle("et-site-copy-editing", editing);
    return () => document.body.classList.remove("et-site-copy-editing");
  }, [editing]);

  useEffect(() => {
    if (!isAdmin) return;
    const onClick = async (event: MouseEvent) => {
      if (!editingRef.current || saving) return;
      const target = document.elementFromPoint(event.clientX, event.clientY);
      let element = target instanceof HTMLElement ? target : target?.parentElement;
      let textNode: Text | null = null;
      while (element && !textNode) {
        const excluded = element.closest("script,style,textarea,input,select,option,code,pre,svg,[contenteditable=true],[data-site-copy-ignore]");
        if (excluded) return;
        textNode = Array.from(element.childNodes).find(
          (node): node is Text => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()),
        ) ?? null;
        element = element.parentElement;
      }
      if (!textNode) return;
      const source = originalText.get(textNode) ?? textNode.nodeValue ?? "";
      const key = textKey(source);
      if (!key) return;
      event.preventDefault();
      event.stopPropagation();
      const replacement = window.prompt("Edit this website text", settings.site_copy[key] ?? key);
      if (replacement === null || replacement.trim() === (settings.site_copy[key] ?? key)) return;
      if (replacement.length > 2000) {
        toast.error("Website text must be 2,000 characters or fewer.");
        return;
      }
      setSaving(true);
      try {
        const current = settings.site_branding_settings && typeof settings.site_branding_settings === "object" && !Array.isArray(settings.site_branding_settings)
          ? settings.site_branding_settings as Record<string, Json>
          : {};
        const next = { ...current, siteCopy: { ...settings.site_copy, [key]: replacement.trim() } } as Json;
        const { error } = await supabase.from("site_settings").update({ site_branding_settings: next }).eq("id", settings.id);
        if (error) throw error;
        await queryClient.invalidateQueries({ queryKey: ["site-settings"] });
        toast.success("Website text saved.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save website text.");
      } finally {
        setSaving(false);
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [isAdmin, queryClient, saving, settings]);

  if (!isAdmin) return null;

  return (
    <button
      type="button"
      onClick={() => setEditing((value) => !value)}
      aria-pressed={editing}
      className="fixed bottom-28 left-4 z-[120] inline-flex items-center gap-2 rounded-full border border-blue-300/30 bg-[#0b1730]/95 px-4 py-2.5 text-xs font-semibold text-blue-100 shadow-xl backdrop-blur-xl transition hover:bg-[#12264a]"
    >
      {editing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
      {saving ? "Saving…" : editing ? "Exit text editing" : "Edit site text"}
    </button>
  );
}
