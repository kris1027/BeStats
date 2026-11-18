import { afterEach, describe, expect, it } from "vitest";

import { shownElementById } from "./card-focus";

/** covers: spec 0008, AC-16; prompts/library-page-urls.md */
describe("shownElementById", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("skips the copy a page left behind keeps hidden", () => {
    document.body.innerHTML = `
      <div style="display: none !important"><h1 id="library-heading">Playing</h1></div>
      <div><h1 id="library-heading">Upcoming</h1></div>
    `;
    expect(shownElementById("library-heading")).toHaveTextContent("Upcoming");
  });

  it("returns the only copy as getElementById would", () => {
    document.body.innerHTML = `<h1 id="library-heading">Up next</h1>`;
    expect(shownElementById("library-heading")).toBe(
      document.getElementById("library-heading"),
    );
  });

  it("returns null when every copy is hidden or none exists", () => {
    document.body.innerHTML = `
      <div style="display: none"><a id="library-show-1" href="/shows/1">A</a></div>
    `;
    expect(shownElementById("library-show-1")).toBeNull();
    expect(shownElementById("library-heading")).toBeNull();
  });
});
