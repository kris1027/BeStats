import { v1LibraryQuerySchema } from "@bestats/core/api/v1/library";
import { libraryPageAt } from "@bestats/core/catalog/library-list";

import { readLibraryPage } from "@/lib/api/v1/library";
import { v1Fail, withV1 } from "@/lib/api/v1/with-v1";

/**
 * `GET /api/v1/me/library?type=&path=&page=` (spec 0035): one page of one of
 * the caller's library pages, placed per request by the web's own loaders
 * (`readLibraryPage`). Only a type and route pair `libraryPageAt` resolves
 * is a page; any other pair, such as `/playing` with `type=tv`, is 404
 * (lib/catalog/AGENTS.md). `private, no-store`, as every `me` route
 * (AGENTS.md section 11).
 */
export const GET = withV1({
  name: "me.library.get",
  auth: "bearer",
  input: { query: v1LibraryQuerySchema },
  handler: async ({ input, user }) => {
    const pageKey = libraryPageAt(input.query.path, input.query.type);
    if (pageKey === null) return v1Fail("not_found");
    return readLibraryPage(user, input.query, pageKey);
  },
});
