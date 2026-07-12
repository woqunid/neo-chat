import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const publicDirectory = fileURLToPath(new URL("../public", import.meta.url));
const blockedNames = new Set([".DS_Store"]);

async function findBlockedArtifacts(directory) {
  const findings = [];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (blockedNames.has(entry.name))
      findings.push(relative(process.cwd(), path));
    if (entry.isDirectory())
      findings.push(...(await findBlockedArtifacts(path)));
  }

  return findings;
}

const findings = await findBlockedArtifacts(publicDirectory);
if (findings.length > 0) {
  console.error(
    `Blocked generated artifacts found in public assets:\n${findings
      .map((item) => `- ${item}`)
      .join("\n")}`,
  );
  process.exitCode = 1;
} else {
  console.log("No blocked generated artifacts found in public assets.");
}
