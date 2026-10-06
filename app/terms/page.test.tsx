import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { sectionId } from "@/components/legal/legal-document";
import {
  COMPLAINT_RESPONSE_DAYS,
  CONTACT_EMAIL,
  DELETION_DAYS,
  LEGAL_LAST_UPDATED,
  MINIMUM_AGE,
  OPERATOR_COUNTRY,
  OPERATOR_GITHUB_URL,
  OPERATOR_HANDLE,
} from "@/lib/legal/operator";
import { TMDB_ATTRIBUTION } from "@/lib/tmdb/constants";

// The entry point pulls `server-only` and the cached reads into jsdom; only
// the real constant crosses it here.
vi.mock("@/lib/tmdb", async () => {
  const constants = await import("@/lib/tmdb/constants");
  return { TMDB_ATTRIBUTION: constants.TMDB_ATTRIBUTION };
});

const { default: TermsPage, metadata } = await import("./page");

/**
 * covers: spec 0017, AC-3, AC-7, AC-9, AC-10, AC-12
 */
const SECTIONS = [
  "About BeStats",
  "Your account",
  "Technical requirements",
  "Acceptable use",
  "Catalog data and TMDB",
  "Availability and changes to the service",
  "Ending your account",
  "Liability",
  "Complaints",
  "Governing law",
  "Changes to these terms",
  "Contact",
];

describe("/terms", () => {
  it("has the title and the fixed Last updated date (AC-7)", () => {
    render(<TermsPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Terms of Service" }),
    ).toBeInTheDocument();
    expect(document.querySelector("time")).toHaveAttribute(
      "datetime",
      LEGAL_LAST_UPDATED,
    );
  });

  it("lists every section in order, each with a kebab-case id (AC-9)", () => {
    render(<TermsPage />);

    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(SECTIONS);
    expect(headings.map((h) => h.id)).toEqual(SECTIONS.map(sectionId));
  });

  it("links the Privacy Policy from Your account (AC-9)", () => {
    render(<TermsPage />);

    const section = document.getElementById("your-account")?.closest("section");
    const link = section?.querySelector('a[href="/privacy"]');
    expect(link?.textContent).toBe("Privacy Policy");
  });

  it("repeats TMDB's notice from the one constant (AC-3)", () => {
    render(<TermsPage />);
    expect(screen.getByText(TMDB_ATTRIBUTION)).toBeInTheDocument();
  });

  it("states the operator facts from the one module (AC-10)", () => {
    const { container } = render(<TermsPage />);
    const text = container.textContent ?? "";

    for (const fact of [
      OPERATOR_HANDLE,
      OPERATOR_COUNTRY,
      CONTACT_EMAIL,
      `at least ${MINIMUM_AGE}`,
      `within ${DELETION_DAYS} days`,
      `within ${COMPLAINT_RESPONSE_DAYS} days`,
    ]) {
      expect(text).toContain(fact);
    }
    expect(
      container.querySelector(`a[href="mailto:${CONTACT_EMAIL}"]`),
    ).not.toBeNull();
    const operatorLinks = container.querySelectorAll(
      `a[href="${OPERATOR_GITHUB_URL}"]`,
    );
    expect(operatorLinks.length).toBeGreaterThan(0);
    for (const link of operatorLinks) {
      expect(link).toHaveTextContent(OPERATOR_HANDLE);
    }
  });

  it("builds its metadata through catalogMetadata (AC-12)", () => {
    expect(metadata.title).toBe("Terms of Service");
    expect(metadata.description).toBe(
      "The rules for using BeStats, a free movie and TV tracking website.",
    );
    expect(metadata.robots).toBeUndefined();
    expect(metadata.openGraph).toMatchObject({ type: "website" });
  });
});
