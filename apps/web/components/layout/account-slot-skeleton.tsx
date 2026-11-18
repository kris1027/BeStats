import { Skeleton } from "@/components/skeleton";

/**
 * What `AccountSlot` shows while the session is read, drawn per width at
 * the footprint of the controls that arrive there (prompts/
 * mobile-navigation.md, decision 11): the 40px menu button on a phone and
 * between `md` and `xl`, and from `xl` the avatar button and Sign out, the
 * avatar widening at `2xl` where it gains the account name.
 *
 * A skeleton rather than a Sign in button, because painting Sign in and then
 * swapping it for an avatar is exactly the wrong-state-first flash spec 0005,
 * AC-13 rules out. It cannot know whether the visitor is signed in, nor the
 * library links' width, which depends on the page's tab, so it draws the
 * signed in controls whose size is fixed; the slot is right aligned and the
 * search beside it has a width of its own, so whatever arrives moves nothing
 * else in the bar.
 */
function AccountSlotSkeleton({ variant }: { variant: "desktop" | "mobile" }) {
  if (variant === "mobile")
    return <Skeleton shape="pill" className="size-10" />;

  return (
    <>
      <Skeleton shape="pill" className="size-10 xl:hidden" />
      <div className="hidden items-center gap-2 xl:flex">
        <Skeleton shape="pill" className="h-10 w-[2.625rem] 2xl:w-28" />
        <Skeleton shape="pill" className="h-10 w-[5.375rem]" />
      </div>
    </>
  );
}

export { AccountSlotSkeleton };
