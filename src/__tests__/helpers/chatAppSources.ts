import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

function readSourceTree(relativeDirectory: string): string[] {
  const directory = resolve(process.cwd(), relativeDirectory);
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory()) return readSourceTree(relativePath);
    if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) return [];
    return [readFileSync(resolve(process.cwd(), relativePath), "utf8")];
  });
}

export function readChatAppSources(): string {
  const facade = readFileSync(
    resolve(process.cwd(), "src/components/app/ChatApp.tsx"),
    "utf8",
  );
  return [
    facade,
    ...readSourceTree("src/components/app/chat"),
    ...readSourceTree("src/features/chat"),
  ].join("\n");
}
