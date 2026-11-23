# MyLead Content Locker Setup

## Current locker

- Locker ID: `8ac69fe4-e777-11f1-a5e7-8a5fb7be40ea`
- Locker code domain currently selected in MyLead: `clickanlook.space`
- Loader: `https://clickanlook.space/iframeLoader/8ac69fe4-e777-11f1-a5e7-8a5fb7be40ea?allow_translate=1`
- Iframe fallback: `https://clickanlook.space/iframe/8ac69fe4-e777-11f1-a5e7-8a5fb7be40ea?allow_translate=1`

## ExpertsTeam integration

The reusable component is `src/components/mylead-content-locker.tsx`. It loads the official JavaScript loader only after a visitor explicitly presses **Unlock content**. The component is placed in the learning library, learning-video section, coding lesson pages, and individual video lesson pages.

The `allow_translate=1` parameter is preserved. The locker is not injected into the global app shell and does not automatically cover ordinary pages. Existing learning content remains accessible; the current database/content model does not yet mark individual resources as premium.

## Required MyLead domain approval

The MyLead Website Codes screen currently identifies `clickanlook.space` as the selected embedding domain. Before expecting the locker to work on `expertsteam.giize.com`, add/authorize that domain in MyLead. The UI says custom domains require contacting `support@mylead.global` from the email address associated with the MyLead account and approval is not guaranteed.

Suggested support request: “Please authorize https://expertsteam.giize.com as an embedding domain for our content locker ID 8ac69fe4-e777-11f1-a5e7-8a5fb7be40ea. We currently see clickanlook.space in Website Codes and want to embed the locker on our own website.”

## Validation checklist

- Confirm MyLead has authorized `expertsteam.giize.com`.
- Deploy the latest `main` branch.
- Open `/learn`, `/learn/lesson/1`, and an individual `/learn/video/<videoId>` page.
- Press **Unlock content** and confirm the locker appears and its text translation setting is active.
- Test on desktop and Android in Rwanda; campaign availability is controlled by MyLead and can differ by country/device.

This integration does not award ExpertsTeam Credits. Any future credit award must be based on a separately verified MyLead postback and transaction mapping.
