"use client";

import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";

import { CarouselScroller } from "@/components/catalog/carousel-scroller";
import { SECTION_HEADING_CLASS } from "@/components/catalog/title-section";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

/** A thumbnail's width, mirrored by `THUMB_SIZES` (spec 0031, AC-6). */
const THUMB_CLASS = "relative aspect-video w-64 shrink-0 snap-start sm:w-72";
const THUMB_SIZES = "(min-width: 640px) 288px, 256px";

/** The dialog image's width at each breakpoint, the trailer panel's (AC-7). */
const DIALOG_IMAGE_SIZES = "(min-width: 768px) min(90vw, 1100px), 100vw";

/**
 * A game's Screenshots row and the dialog that opens one larger (spec 0031,
 * AC-6, AC-7).
 *
 * One controlled dialog serves every thumbnail, so it is not a
 * `Dialog.Trigger`: focus return is `finalFocus`, pointed at the thumbnail of
 * the image showing when the dialog closes, which is scrolled into view
 * first. Only the image on screen is mounted (`key={index}`), so nothing
 * beside it is requested. Focus opens on Close, as in the trailer dialog.
 * Every image loads from IGDB through the image loader (AC-13).
 */
function ScreenshotGallery({
  name,
  screenshotUrls,
}: {
  name: string;
  screenshotUrls: string[];
}) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const thumbRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const total = screenshotUrls.length;
  if (total === 0) return null;

  const isFirst = index === 0;
  const isLast = index === total - 1;

  /**
   * Moves by one image, never wrapping. When the move disables the button
   * that made it, focus goes to the other one rather than being lost.
   */
  function move(step: -1 | 1) {
    const target = index + step;
    if (target < 0 || target >= total) return;
    setIndex(target);
    if (step === 1 && target === total - 1 && total > 1) {
      if (document.activeElement === nextRef.current) {
        previousRef.current?.focus();
      }
    }
    if (step === -1 && target === 0 && total > 1) {
      if (document.activeElement === previousRef.current) {
        nextRef.current?.focus();
      }
    }
  }

  function returnFocus() {
    const thumb = thumbRefs.current[index];
    if (!thumb) return true;
    thumb.scrollIntoView?.({ inline: "nearest", block: "nearest" });
    return thumb;
  }

  return (
    <section
      aria-labelledby="screenshots-heading"
      className="flex flex-col gap-4"
    >
      <CarouselScroller
        label="Screenshots"
        heading={
          <h2 id="screenshots-heading" className={SECTION_HEADING_CLASS}>
            Screenshots
          </h2>
        }
        seeAll={null}
      >
        <ul className="flex gap-3 md:gap-4">
          {screenshotUrls.map((url, position) => (
            <li key={url} className={THUMB_CLASS}>
              <button
                ref={(element) => {
                  thumbRefs.current[position] = element;
                }}
                type="button"
                aria-label={`Open screenshot ${position + 1} of ${total}`}
                className="absolute inset-0 overflow-hidden rounded-lg bg-muted"
                onClick={() => {
                  setIndex(position);
                  setOpen(true);
                }}
              >
                <Image
                  src={url}
                  alt=""
                  fill
                  sizes={THUMB_SIZES}
                  className="object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      </CarouselScroller>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="top-0 left-0 h-dvh w-full max-w-none translate-x-0 translate-y-0 justify-center p-4 max-md:rounded-none md:top-1/2 md:left-1/2 md:h-auto md:w-[min(90vw,1100px)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-panel md:p-6"
          showCloseButton={false}
          initialFocus={closeRef}
          finalFocus={returnFocus}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              move(-1);
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              move(1);
            }
          }}
        >
          <DialogTitle className="min-h-11 content-center pr-14">
            {name} screenshots
          </DialogTitle>
          <div className="relative aspect-video max-h-[calc(100dvh-8rem)] w-full overflow-hidden rounded-lg bg-background">
            <Image
              key={index}
              src={screenshotUrls[index]}
              alt={`Screenshot ${index + 1} of ${total}`}
              fill
              sizes={DIALOG_IMAGE_SIZES}
              className="object-contain"
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <Button
              ref={previousRef}
              size="icon-touch"
              disabled={isFirst}
              onClick={() => move(-1)}
            >
              <ChevronLeftIcon className="size-5" aria-hidden="true" />
              <span className="sr-only">Previous screenshot</span>
            </Button>
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {index + 1} of {total}
            </p>
            <Button
              ref={nextRef}
              size="icon-touch"
              disabled={isLast}
              onClick={() => move(1)}
            >
              <ChevronRightIcon className="size-5" aria-hidden="true" />
              <span className="sr-only">Next screenshot</span>
            </Button>
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
    </section>
  );
}

export { ScreenshotGallery };
