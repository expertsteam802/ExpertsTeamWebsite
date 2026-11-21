export const MONETAG_DIRECT_LINK = "https://uplcm.com/4/12313763";

export function openMonetagPopup(): boolean {
  const popupWidth = 520;
  const popupHeight = 720;
  const popupLeft = Math.max(0, Math.round((window.screen.width - popupWidth) / 2));
  const popupTop = Math.max(0, Math.round((window.screen.height - popupHeight) / 2));
  const popup = window.open(
    MONETAG_DIRECT_LINK,
    "expertsteam-monetag-unlock",
    `popup=yes,width=${popupWidth},height=${popupHeight},left=${popupLeft},top=${popupTop},resizable=yes,scrollbars=yes`,
  );
  if (!popup) return false;
  popup.opener = null;
  return true;
}
