import { useEffect } from "react";

/**
 * Advertising has been removed from the site. Keep this compatibility
 * component so existing screens immediately continue without sponsor gates.
 */
export function BannerUnlockAd({ onUnlocked }: { onUnlocked: () => void; seconds?: number; compact?: boolean }) {
  useEffect(() => {
    onUnlocked();
  }, [onUnlocked]);

  return null;
}
