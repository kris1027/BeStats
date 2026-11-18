import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CONTACT_EMAIL, LEGAL_LAST_UPDATED } from "@/lib/legal/operator";
import {
  ContactEmail,
  ExternalLink,
  LegalDocument,
  LegalSection,
  sectionId,
} from "./legal-document";

/**
 * covers: spec 0017, AC-7, AC-10
 *
 * Both legal pages are built from these pieces, so the anchor ids, the date
 * and the link attributes are pinned once here rather than per page. The page
 * tests check the section order; this file checks the rules behind it.
 */
describe("sectionId", () => {
  it.each([
    ["Cookies", "cookies"],
    ["Who runs BeStats", "who-runs-bestats"],
    ["Your rights", "your-rights"],
    ["Transfers outside the EEA", "transfers-outside-the-eea"],
    [
      "Availability and changes to the service",
      "availability-and-changes-to-the-service",
    ],
  ])("turns %s into the anchor %s", (title, id) => {
    expect(sectionId(title)).toBe(id);
  });

  it("collapses punctuation and runs of spaces into one hyphen", () => {
    expect(sectionId("Why we use it (purposes and legal bases)")).toBe(
      "why-we-use-it-purposes-and-legal-bases",
    );
    expect(sectionId("Catalog  data,  and TMDB")).toBe("catalog-data-and-tmdb");
  });

  it("never starts or ends an anchor with a hyphen", () => {
    expect(sectionId("  Contact!  ")).toBe("contact");
  });
});

describe("LegalDocument", () => {
  it("shows the title as the page's only h1 and the fixed date (AC-7)", () => {
    render(
      <LegalDocument title="Privacy Policy">
        <p>Body</p>
      </LegalDocument>,
    );

    expect(
      screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent),
    ).toEqual(["Privacy Policy"]);
    const time = document.querySelector("time");
    expect(time).toHaveAttribute("datetime", LEGAL_LAST_UPDATED);
    expect(time?.closest("p")).toHaveTextContent(/^Last updated \d/);
  });

  it("formats the constant day, not the clock (AC-7)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2031-07-15T12:00:00Z"));
    try {
      render(<LegalDocument title="Terms of Service">{null}</LegalDocument>);
      expect(document.querySelector("time")?.textContent).not.toContain("2031");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the Last updated date across timezones (AC-7)", () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    process.env.TZ = originalTz;
    vi.doUnmock("@/lib/legal/operator");
    vi.resetModules();
  });

  it("reads 1 January 2026 on a server west of UTC, never 31 December 2025", async () => {
    process.env.TZ = "America/Los_Angeles";
    vi.resetModules();
    vi.doMock("@/lib/legal/operator", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/legal/operator")>()),
      LEGAL_LAST_UPDATED: "2026-01-01",
    }));
    const { LegalDocument: Shifted } = await import("./legal-document");

    render(<Shifted title="Privacy Policy">{null}</Shifted>);

    const time = document.querySelector("time");
    expect(time).toHaveAttribute("datetime", "2026-01-01");
    expect(time).toHaveTextContent("1 January 2026");
  });
});

describe("LegalSection", () => {
  it("is a region named by its own h2, so the anchor and the name agree", () => {
    render(
      <LegalSection title="Your rights">
        <p>Text</p>
      </LegalSection>,
    );

    const heading = screen.getByRole("heading", {
      level: 2,
      name: "Your rights",
    });
    expect(heading).toHaveAttribute("id", "your-rights");
    expect(
      screen.getByRole("region", { name: "Your rights" }),
    ).toContainElement(heading);
  });
});

describe("ExternalLink", () => {
  it("opens off site links in a new tab without leaking the opener (AC-7)", () => {
    render(<ExternalLink href="https://uodo.gov.pl">UODO</ExternalLink>);

    const link = screen.getByRole("link", { name: "UODO" });
    expect(link).toHaveAttribute("href", "https://uodo.gov.pl");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});

describe("ContactEmail", () => {
  it("is a mailto link to the one contact address (AC-10)", () => {
    render(<ContactEmail />);

    const link = screen.getByRole("link", { name: CONTACT_EMAIL });
    expect(link).toHaveAttribute("href", `mailto:${CONTACT_EMAIL}`);
    expect(link).not.toHaveAttribute("target");
  });
});
