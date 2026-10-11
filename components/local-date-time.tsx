"use client";

import { useEffect, useState } from "react";

/** Month, day and time: enough to say when a lock ends, no year or seconds. */
const FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

/**
 * A moment shown in the viewer's own time zone (prompts/account-username.md,
 * Q13).
 *
 * The server does not know the viewer's zone, and a date alone can be hours
 * off for a lock that ends mid day. So the server renders the moment in UTC,
 * labelled as such, and the browser replaces it with local time after mount.
 * The `<time>` element carries the exact instant either way.
 */
function LocalDateTime({ iso }: { iso: string }) {
  const [local, setLocal] = useState<string | null>(null);

  useEffect(() => {
    setLocal(new Intl.DateTimeFormat("en", FORMAT).format(new Date(iso)));
  }, [iso]);

  return (
    <time dateTime={iso}>
      {local ??
        `${new Intl.DateTimeFormat("en", { ...FORMAT, timeZone: "UTC" }).format(new Date(iso))} UTC`}
    </time>
  );
}

export { LocalDateTime };
