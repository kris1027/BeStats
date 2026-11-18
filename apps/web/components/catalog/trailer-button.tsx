"use client";

import { PlayIcon, XIcon } from "lucide-react";
import { useRef } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * The hero's Trailer button and its player dialog (spec 0022, AC-11).
 *
 * The trigger is base-ui's `Dialog.Trigger`, so focus returns to it when the
 * dialog closes. The YouTube iframe exists only while the dialog is open: the
 * popup unmounts when closed, so no request reaches YouTube until the visitor
 * presses Trailer, and closing it stops playback. The privacy enhanced
 * `youtube-nocookie.com` host is the one YouTube joined `PROCESSORS` with
 * (AC-19). Full screen below `md`, a 16:9 panel from it.
 *
 * Focus opens on the Close button rather than the player: once focus is
 * inside the cross origin iframe, Escape goes to YouTube and never reaches
 * the dialog, so a keyboard user could not close it.
 *
 * @param videoKey Already checked against `[A-Za-z0-9_-]{6,20}` by the
 * normalizer, so it is safe in the embed path.
 * @param videoName TMDB's name for the video, used in the iframe's title.
 * @param title The movie or show title, so the dialog names what it plays.
 */
function TrailerButton({
  videoKey,
  videoName,
  title,
}: {
  videoKey: string;
  videoName: string;
  title: string;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog>
      <DialogTrigger
        className={buttonVariants({ size: "touch", className: "self-start" })}
      >
        <PlayIcon className="size-4" aria-hidden="true" />
        Trailer
      </DialogTrigger>
      <DialogContent
        className="top-0 left-0 h-dvh w-full max-w-none translate-x-0 translate-y-0 justify-center p-4 max-md:rounded-none md:top-1/2 md:left-1/2 md:h-auto md:w-[min(90vw,1100px)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-panel md:p-6"
        showCloseButton={false}
        initialFocus={closeRef}
      >
        <DialogTitle className="min-h-11 content-center pr-14">
          {title} trailer
        </DialogTitle>
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-background">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoKey}?autoplay=1&rel=0&playsinline=1`}
            title={`${title}: ${videoName} (YouTube video player)`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 size-full border-0"
          />
        </div>
        <DialogClose
          ref={closeRef}
          render={
            <Button size="icon-touch" className="absolute top-4 right-4" />
          }
        >
          <XIcon className="size-5" aria-hidden="true" />
          <span className="sr-only">Close</span>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

export { TrailerButton };
