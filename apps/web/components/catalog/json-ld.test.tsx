import { render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { JsonLd } from "./json-ld";

/**
 * covers: spec 0016, AC-21, AC-23
 *
 * The structured data reaches crawlers as one script tag whose body is TMDB
 * text, so the tag type, the round trip and the escape that keeps a hostile
 * overview inside the tag are what this component promises.
 */
const HOSTILE = {
  "@type": "Movie",
  name: "Evil",
  description: "</script><script>alert(1)</script> end",
};

describe("JsonLd", () => {
  it("renders one ld+json script whose body parses back to the data", () => {
    const data = {
      "@context": "https://schema.org",
      "@type": "Movie",
      name: "Fight Club",
    };

    const { container } = render(<JsonLd data={data} />);

    const scripts = container.querySelectorAll("script");
    expect(scripts).toHaveLength(1);
    expect(scripts[0].getAttribute("type")).toBe("application/ld+json");
    expect(JSON.parse(scripts[0].textContent ?? "")).toEqual(data);
  });

  it("keeps a closing script tag in TMDB text from ending the tag (AC-23)", () => {
    const html = renderToStaticMarkup(<JsonLd data={HOSTILE} />);

    expect(html.match(/<script/g)).toHaveLength(1);
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(html.endsWith("</script>")).toBe(true);
  });

  it("still carries the hostile text unchanged once parsed", () => {
    const { container } = render(<JsonLd data={HOSTILE} />);

    const body = container.querySelector("script")?.textContent ?? "";
    expect(JSON.parse(body)).toEqual(HOSTILE);
  });
});
