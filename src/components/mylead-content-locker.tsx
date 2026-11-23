import { useState } from "react";
import { LockKeyhole, X } from "lucide-react";

import { Button } from "@/components/ui/button";

const MYLEAD_LOCKER_IFRAME_URL =
  "https://clickanlook.space/iframe/8ac69fe4-e777-11f1-a5e7-8a5fb7be40ea?allow_translate=1";

/**
 * Opens MyLead's documented iframe version on demand.
 * Unlike dynamically injecting the loader, this does not depend on the
 * loader being initialized after the page has already rendered.
 */
export function MyLeadContentLocker() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold">Premium content unlocker</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Complete an available MyLead task to unlock the sponsored content.
            </p>
          </div>
          <Button type="button" onClick={() => setOpen(true)} size="sm">
            <LockKeyhole className="mr-2 h-4 w-4" />
            Unlock content
          </Button>
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-2 backdrop-blur-sm sm:p-5"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="MyLead content locker"
            className="relative flex h-[min(90dvh,850px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <p className="font-semibold">Unlock sponsored content</p>
                <p className="text-xs text-muted-foreground">Complete a task in the MyLead locker</p>
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label="Close content locker" onClick={() => setOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <iframe
              title="MyLead content locker"
              src={MYLEAD_LOCKER_IFRAME_URL}
              className="min-h-0 w-full flex-1 border-0 bg-white"
              loading="eager"
              referrerPolicy="strict-origin-when-cross-origin"
              allow="clipboard-read; clipboard-write"
            />
          </section>
        </div>
      )}
    </>
  );
}
