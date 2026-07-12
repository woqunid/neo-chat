import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const MARKET_ENTRY = "src/components/plugin/PluginMarket.tsx";
const MARKET_DIRECTORY = "src/components/plugin/market";
const SOURCE_FILE_PATTERN = /\.tsx?$/;

export function readProjectSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

export function readPluginMarketModule(fileName: string): string {
  return readProjectSource(`${MARKET_DIRECTORY}/${fileName}`);
}

export function readPluginMarketComposition(): string {
  const directory = resolve(process.cwd(), MARKET_DIRECTORY);
  const moduleSources = readdirSync(directory)
    .filter((fileName) => SOURCE_FILE_PATTERN.test(fileName))
    .sort()
    .map((fileName) => readFileSync(resolve(directory, fileName), "utf8"));
  return [readProjectSource(MARKET_ENTRY), ...moduleSources].join("\n");
}
