import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const MARKET_ENTRY = "src/components/plugin/PluginMarket.tsx";
const MARKET_DIRECTORY = "src/components/plugin/market";
const MESSAGE_INPUT_ENTRY = "src/components/chat/MessageInput.tsx";
const MESSAGE_INPUT_DIRECTORY = "src/components/chat/message-input";
const SOURCE_FILE_PATTERN = /\.tsx?$/;

export function readProjectSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

export function readPluginMarketModule(fileName: string): string {
  return readProjectSource(`${MARKET_DIRECTORY}/${fileName}`);
}

function readComponentComposition(
  entryPath: string,
  directoryPath: string,
): string {
  const directory = resolve(process.cwd(), directoryPath);
  const moduleSources = readdirSync(directory)
    .filter((fileName) => SOURCE_FILE_PATTERN.test(fileName))
    .sort()
    .map((fileName) => readFileSync(resolve(directory, fileName), "utf8"));
  return [readProjectSource(entryPath), ...moduleSources].join("\n");
}

export function readPluginMarketComposition(): string {
  return readComponentComposition(MARKET_ENTRY, MARKET_DIRECTORY);
}

export function readMessageInputComposition(): string {
  return readComponentComposition(MESSAGE_INPUT_ENTRY, MESSAGE_INPUT_DIRECTORY);
}
