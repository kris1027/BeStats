import { titleIdsParamSchema } from "@bestats/core/api/v1/titles";
import { z } from "zod";

import { bearerDeps } from "@/lib/api/v1/tracking";
import { v1Fail, v1Ok, withV1 } from "@/lib/api/v1/with-v1";
import { readTitles } from "@/lib/tracking/commands/read-titles";

/**
 * `GET /api/v1/me/titles?ids=movie:603,tv:1399,game:1942` (spec 0033, child
 * 0035): the caller's own state for up to 40 titles at once, movies, shows
 * (tracking, progress and calculated ratings) and games alike, read by
 * `readTitles`. `private, no-store`, as every `me` route (AGENTS.md
 * section 11).
 */
export const GET = withV1({
  name: "me.titles.get",
  auth: "bearer",
  input: { query: z.object({ ids: titleIdsParamSchema }) },
  handler: async ({ input, user }) => {
    const titles = await readTitles(bearerDeps(user), input.query.ids);
    return titles ? v1Ok(titles) : v1Fail("internal");
  },
});
