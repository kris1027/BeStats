import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { sectionId } from "@/components/legal/legal-document";
import {
  CONTACT_EMAIL,
  DELETION_DAYS,
  LEGAL_LAST_UPDATED,
  MINIMUM_AGE,
  OPERATOR_COUNTRY,
  OPERATOR_GITHUB_URL,
  OPERATOR_HANDLE,
  PROCESSORS,
  RIGHTS_RESPONSE,
  SUPABASE_REGION,
  SUPERVISORY_AUTHORITY,
} from "@/lib/legal/operator";
import PrivacyPage, { metadata } from "./page";

/**
 * covers: spec 0017, AC-7, AC-8, AC-10, AC-11, AC-12
 *
 * The section order is the contract with AC-8, and the ids are what a link to
 * `/privacy#cookies` depends on. Operator facts are checked against the module
 * they come from, so a page that hardcoded a stale copy would fail here.
 */
const SECTIONS = [
  "Who runs BeStats",
  "What we collect",
  "Why we use it",
  "Cookies",
  "Who processes your data",
  "Transfers outside the EEA",
  "How long we keep it",
  "Your rights",
  "Complaints",
  "Children",
  "Security",
  "Changes to this policy",
  "Contact",
];

describe("/privacy", () => {
  it("has the title and the fixed Last updated date (AC-7)", () => {
    render(<PrivacyPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Privacy Policy" }),
    ).toBeInTheDocument();
    const time = document.querySelector("time");
    expect(time).toHaveAttribute("datetime", LEGAL_LAST_UPDATED);
    expect(time?.textContent).toMatch(/^\d{1,2} [A-Z][a-z]+ \d{4}$/);
  });

  it("lists every section in order, each with a kebab-case id (AC-7, AC-8)", () => {
    render(<PrivacyPage />);

    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(SECTIONS);
    expect(headings.map((h) => h.id)).toEqual(SECTIONS.map(sectionId));
    expect(sectionId("Transfers outside the EEA")).toBe(
      "transfers-outside-the-eea",
    );
  });

  it("states the operator facts from the one module (AC-10)", () => {
    const { container } = render(<PrivacyPage />);
    const text = container.textContent ?? "";

    for (const fact of [
      OPERATOR_HANDLE,
      OPERATOR_COUNTRY,
      CONTACT_EMAIL,
      SUPERVISORY_AUTHORITY.name,
      SUPERVISORY_AUTHORITY.address,
      `under ${MINIMUM_AGE}`,
      `within ${DELETION_DAYS} days`,
      `within ${RIGHTS_RESPONSE}`,
      ...PROCESSORS.map((processor) => processor.name),
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

  it("opens external links in a new tab, safely (AC-7)", () => {
    const { container } = render(<PrivacyPage />);

    const external = container.querySelectorAll('a[href^="http"]');
    expect(external.length).toBeGreaterThan(0);
    for (const link of external) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
    expect(
      container.querySelector(`a[href="${SUPERVISORY_AUTHORITY.url}"]`),
    ).not.toBeNull();
  });

  it("mentions analytics, ads or selling data only to deny them (AC-11)", () => {
    const { container } = render(<PrivacyPage />);
    const sentences = (container.textContent ?? "").split(/(?<=\.)\s*/);

    for (const sentence of sentences) {
      if (
        /analytics|advertis|\bads\b|sell|profiling|newsletter/i.test(sentence)
      ) {
        expect(sentence).toMatch(/\bno\b|\bnever\b|n't|\bnot\b/i);
      }
    }
    expect(container.textContent).not.toMatch(
      /delete (my|your) account button|download my data/i,
    );
  });

  it("places the data in the EU region the constant names (spec 0018, AC-23)", () => {
    const { container } = render(<PrivacyPage />);
    const text = container.textContent ?? "";

    expect(text).toContain(`the database in ${SUPABASE_REGION.name}`);
    expect(text).toContain("EU Standard Contractual Clauses");
  });

  it("promises no account email production can't send (spec 0018, AC-23)", () => {
    const { container } = render(<PrivacyPage />);

    expect(container.textContent).not.toMatch(
      /address confirmation|password recovery|send the emails/i,
    );
  });

  it("builds its metadata through catalogMetadata (AC-12)", () => {
    expect(metadata.title).toBe("Privacy Policy");
    expect(metadata.description).toBe(
      "How BeStats collects, uses and protects your data, and the rights you have over it.",
    );
    expect(metadata.robots).toBeUndefined();
    expect(metadata.openGraph).toMatchObject({ type: "website" });
  });
});
