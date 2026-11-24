import { useEffect } from "react";
import { useSiteSettings } from "@/hooks/use-site-settings";

const originalText = new WeakMap<Text, string>();

function textKey(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function applySiteCopy(copy: Record<string, string>) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode() as Text | null;
  while (current) {
    const parent = current.parentElement;
    const excluded = parent?.closest(
      "script,style,textarea,input,select,option,code,pre,svg,[contenteditable=true],[data-site-copy-ignore]",
    );
    if (!excluded && current.nodeValue?.trim()) {
      const source = originalText.get(current) ?? current.nodeValue;
      originalText.set(current, source);
      const key = textKey(source);
      const replacement = copy[key];
      const leading = source.match(/^\s*/)?.[0] ?? "";
      const trailing = source.match(/\s*$/)?.[0] ?? "";
      const next = replacement === undefined ? source : leading + replacement + trailing;
      if (current.nodeValue !== next) current.nodeValue = next;
    }
    current = walker.nextNode() as Text | null;
  }
}

export function SiteTextEditor() {
  const settings = useSiteSettings();

  useEffect(() => {
    applySiteCopy(settings.site_copy);
    const observer = new MutationObserver(() => applySiteCopy(settings.site_copy));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [settings.site_copy]);

  return null;
}
