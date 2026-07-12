import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("deployment hygiene", () => {
  it("keeps Worker build gates and Node version hints in automation", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
    );
    const ci = readFileSync(
      resolve(process.cwd(), ".github/workflows/ci.yml"),
      "utf8",
    );
    const nodeVersion = readFileSync(
      resolve(process.cwd(), ".node-version"),
      "utf8",
    ).trim();

    expect(nodeVersion).toBe("22");
    expect(packageJson.scripts["worker:size"]).toBe(
      "node scripts/check-worker-size.mjs",
    );
    expect(packageJson.scripts["worker:dry-run"]).toBe(
      "wrangler deploy --dry-run --config wrangler.jsonc",
    );
    expect(packageJson.scripts["hygiene:artifacts"]).toBe(
      "node scripts/check-artifacts.mjs",
    );
    expect(ci).toContain("pnpm build:worker");
    expect(ci).toContain("pnpm worker:size");
    expect(ci).not.toContain("pnpm worker:dry-run");
    expect(ci).toContain("pnpm hygiene:artifacts");
    expect(ci).toContain("pnpm audit --prod --audit-level moderate");
  });

  it("uses a Windows-safe filesystem URL conversion", () => {
    const source = readFileSync(
      resolve(process.cwd(), "scripts/check-artifacts.mjs"),
      "utf8",
    );

    expect(source).toContain("fileURLToPath");
    expect(source).not.toContain(".pathname");
  });
});
