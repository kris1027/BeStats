"use client";

import { CardRoundButton } from "@/components/tracking/card-round-button";
import { WatchedIcon } from "@/components/tracking/tracking-icons";

/**
 * `CardRoundButton` at rest and busy (spec 0014, AC-8), for `/showcase`. A
 * client module only because the button takes an `onClick`, which a Server
 * Component cannot hand to a DOM element; the demo does nothing on a tap.
 */
export function CardRoundButtonDemo() {
  return (
    <>
      <CardRoundButton label="Mark watched, at rest" onClick={() => {}}>
        <WatchedIcon filled={false} className="size-4" />
      </CardRoundButton>
      <CardRoundButton label="Mark watched, busy" disabled onClick={() => {}}>
        <WatchedIcon filled={false} className="size-4" />
      </CardRoundButton>
    </>
  );
}
