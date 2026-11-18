import { expect } from "vitest";

import { OPERATOR_GITHUB_URL, OPERATOR_HANDLE } from "@/lib/legal/operator";

/**
 * Asserts the page names its operator by handle, linked to the GitHub profile
 * that carries the full name, at every mention. Both legal pages make this
 * promise (plan `prompts/navbar-footer-slim-and-drop-design-refs.md`,
 * decisions 7 and 9), so one helper keeps the two checks from drifting. The
 * values are imported, never pasted, because spec 0017 AC-10 gives them one
 * home in `lib/legal/operator.ts`.
 */
export function expectOperatorLinks(container: ParentNode): void {
  const operatorLinks = container.querySelectorAll(
    `a[href="${OPERATOR_GITHUB_URL}"]`,
  );
  expect(operatorLinks.length).toBeGreaterThan(0);
  for (const link of operatorLinks) {
    expect(link).toHaveTextContent(OPERATOR_HANDLE);
  }
}
