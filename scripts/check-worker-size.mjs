import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MIB_BYTES = 1024 * 1024;
const DEFAULT_GZIP_BUDGET_BYTES = 3 * MIB_BYTES;
const MAX_COMMAND_OUTPUT_BYTES = 10 * MIB_BYTES;
const SIZE_MULTIPLIERS = {
  B: 1,
  KIB: 1024,
  MIB: MIB_BYTES,
  GIB: 1024 * MIB_BYTES,
};

function getGzipBudgetBytes() {
  const configured = process.env.WORKER_GZIP_BUDGET_BYTES;
  if (!configured) return DEFAULT_GZIP_BUDGET_BYTES;

  const parsed = Number(configured);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("WORKER_GZIP_BUDGET_BYTES must be a positive integer");
  }
  return parsed;
}

function sizeToBytes(value, unit) {
  return Number.parseFloat(value.replaceAll(",", "")) * SIZE_MULTIPLIERS[unit];
}

function parseWranglerDryRunOutput(output) {
  const match = output.match(
    /Total Upload:\s*([\d,.]+)\s*(B|KiB|MiB|GiB)\s*\/\s*gzip:\s*([\d,.]+)\s*(B|KiB|MiB|GiB)/i,
  );
  if (!match) throw new Error("Could not parse Wrangler dry-run output");

  return sizeToBytes(match[3], match[4].toUpperCase());
}

function formatBytes(bytes) {
  return `${(bytes / MIB_BYTES).toFixed(2)} MiB`;
}

async function readWorkerGzipBytes() {
  const wranglerArgs = ["deploy", "--dry-run", "--config", "wrangler.jsonc"];
  const command =
    process.platform === "win32" ? process.env.ComSpec : "wrangler";
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "wrangler.cmd", ...wranglerArgs]
      : wranglerArgs;
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd: process.cwd(),
    maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
  });
  return parseWranglerDryRunOutput(`${stdout}\n${stderr}`);
}

try {
  const budgetBytes = getGzipBudgetBytes();
  const gzipBytes = await readWorkerGzipBytes();
  if (gzipBytes > budgetBytes) {
    throw new Error(
      `Wrangler gzip size ${formatBytes(gzipBytes)} exceeds budget ${formatBytes(budgetBytes)}`,
    );
  }
  console.log(
    `Wrangler gzip size ${formatBytes(gzipBytes)} within budget ${formatBytes(budgetBytes)}.`,
  );
} catch (error) {
  console.error(
    `Could not check Worker size: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
