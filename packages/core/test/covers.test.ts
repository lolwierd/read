import { describe, expect, it } from "vitest";
import { SPINE_PALETTE, coverSearchUrl, coverUrlForIsbn, spineColor } from "../src/covers.js";

describe("spineColor", () => {
  it("is deterministic and always from the palette", () => {
    const c1 = spineColor("abc123");
    expect(spineColor("abc123")).toBe(c1);
    expect(SPINE_PALETTE).toContain(c1 as (typeof SPINE_PALETTE)[number]);
  });
  it("handles the empty key", () => {
    expect(SPINE_PALETTE).toContain(spineColor("") as (typeof SPINE_PALETTE)[number]);
  });
  it("spreads different keys across the palette", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(spineColor(`book-${i}`));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("coverUrlForIsbn", () => {
  it("returns null for null/empty", () => {
    expect(coverUrlForIsbn(null)).toBeNull();
    expect(coverUrlForIsbn("")).toBeNull();
  });
  it("builds an Open Library URL with the requested size and ?default=false", () => {
    expect(coverUrlForIsbn("9780756404741")).toBe(
      "https://covers.openlibrary.org/b/isbn/9780756404741-L.jpg?default=false",
    );
    expect(coverUrlForIsbn("9780756404741", "M")).toContain("-M.jpg");
  });
});

describe("coverSearchUrl", () => {
  it("includes author when present", () => {
    const u = coverSearchUrl("The Name of the Wind", "Rothfuss");
    expect(u).toContain("title=The%20Name%20of%20the%20Wind");
    expect(u).toContain("author=Rothfuss");
    expect(u).toContain("fields=cover_i");
  });
  it("omits author when absent", () => {
    expect(coverSearchUrl("Piranesi", null)).not.toContain("author=");
  });
});
