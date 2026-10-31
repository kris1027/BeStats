import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";

import { signOutAction } from "@/app/(auth)/actions";
import { Avatar } from "@/components/layout/avatar";
import { Button, ButtonLink } from "@/components/ui/button";

/**
 * The menu's account block, signed in: the Account row and a full width
 * Sign out in the destructive red. Exported for `/showcase`.
 */
function MobileAccountBlock({
  letter,
  name,
}: {
  letter: string;
  name: string;
}) {
  return (
    <>
      <Link
        href="/account"
        className="glass glass-rim flex h-15 items-center gap-3 rounded-[18px] px-3"
      >
        <Avatar letter={letter} className="size-9 text-[15px]" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-base font-semibold text-foreground">
            Account
          </span>{" "}
          <span className="truncate text-[13px] text-muted-foreground">
            {name}
          </span>
        </span>
        <ChevronRightIcon
          className="size-4 text-muted-foreground"
          aria-hidden="true"
        />
      </Link>

      <form action={signOutAction}>
        <Button
          type="submit"
          size="touch"
          variant="destructive"
          className="h-13 w-full text-base"
        >
          Sign out
        </Button>
      </form>
    </>
  );
}

/** The menu's account block, signed out. Exported for `/showcase`. */
function MobileSignIn() {
  return (
    <ButtonLink size="touch" href="/sign-in" className="h-13 w-full">
      Sign in
    </ButtonLink>
  );
}

export { MobileAccountBlock, MobileSignIn };
