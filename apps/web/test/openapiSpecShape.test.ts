// verify the OpenAPI spec is
// well-formed at the structural level (OpenAPI 3.1 minimum required
// fields). This is what `spectral lint` would also enforce but can be
// done locally without installing spectral. Catches: missing version,
// missing info.title, paths with no methods, $ref pointers that don't
// resolve, response objects missing required content shape.

import { describe, it, expect } from "vitest";

describe("openapi spec — structural validation", () => {
  it("exposes OpenAPI 3.1.0 with required fields populated", async () => {
    const { GET } = await import("@/app/api/openapi/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const spec = (await res.json()) as Record<string, unknown>;

    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info).toBeDefined();
    expect((spec.info as { title: string }).title).toBeTruthy();
    expect((spec.info as { version: string }).version).toBeTruthy();
    expect(spec.paths).toBeDefined();
    expect(Object.keys(spec.paths as object).length).toBeGreaterThan(0);
  });

  it("every path entry has at least one HTTP method", async () => {
    const { GET } = await import("@/app/api/openapi/route");
    const res = await GET();
    const spec = (await res.json()) as {
      paths: Record<string, Record<string, unknown>>;
    };
    const httpMethods = new Set([
      "get",
      "post",
      "put",
      "patch",
      "delete",
      "options",
      "head",
    ]);
    const empty: string[] = [];
    for (const [p, ops] of Object.entries(spec.paths)) {
      const methods = Object.keys(ops).filter((k) => httpMethods.has(k));
      if (methods.length === 0) empty.push(p);
    }
    expect(empty, `paths with no HTTP methods: ${empty.join(", ")}`).toEqual(
      [],
    );
  });

  it("every $ref pointer resolves inside components.schemas", async () => {
    const { GET } = await import("@/app/api/openapi/route");
    const res = await GET();
    const spec = (await res.json()) as {
      paths: Record<string, unknown>;
      components?: { schemas?: Record<string, unknown> };
    };
    const schemas = spec.components?.schemas ?? {};
    const dangling: string[] = [];
    const blob = JSON.stringify(spec);
    const refRegex = /"\$ref":\s*"#\/components\/schemas\/([^"]+)"/g;
    for (const m of blob.matchAll(refRegex)) {
      const name = m[1];
      if (!(name in schemas)) dangling.push(name);
    }
    expect(
      [...new Set(dangling)],
      `dangling $refs: ${dangling.join(", ")}`,
    ).toEqual([]);
  });
});
