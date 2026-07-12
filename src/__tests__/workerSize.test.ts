import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const MIB_BYTES = 1024 * 1024;

function writeFakeWrangler(directory: string): void {
  const scriptPath = join(directory, "fake-wrangler.cjs");
  writeFileSync(
    scriptPath,
    `require("node:fs").writeFileSync(process.env.WRANGLER_ARGS_FILE, process.argv.slice(2).join(" "));
process.stdout.write(process.env.WRANGLER_TEST_OUTPUT || "");`,
  );
  if (process.platform === "win32") {
    writeFileSync(
      join(directory, "wrangler.cmd"),
      `@echo off\r\n"%NODE_EXE%" "%~dp0fake-wrangler.cjs" %*\r\n`,
    );
    return;
  }
  const executable = join(directory, "wrangler");
  writeFileSync(executable, `#!/bin/sh\n"$NODE_EXE" "${scriptPath}" "$@"\n`);
  chmodSync(executable, 0o755);
}

function runWorkerSizeCheck(output: string, budget?: string) {
  const directory = mkdtempSync(join(tmpdir(), "neo-worker-size-"));
  const argsPath = join(directory, "args.txt");
  writeFakeWrangler(directory);

  try {
    const result = spawnSync(
      process.execPath,
      [resolve(process.cwd(), "scripts/check-worker-size.mjs")],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${directory}${delimiter}${process.env.PATH || ""}`,
          NODE_EXE: process.execPath,
          WRANGLER_ARGS_FILE: argsPath,
          WRANGLER_TEST_OUTPUT: output,
          ...(budget === undefined ? {} : { WORKER_GZIP_BUDGET_BYTES: budget }),
        },
      },
    );
    return {
      status: result.status,
      output: `${result.stdout}${result.stderr}`,
      args: existsSync(argsPath) ? readFileSync(argsPath, "utf8") : "",
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("Worker upload size gate", () => {
  it("uses Wrangler gzip output and an environment budget", () => {
    const output = "Total Upload: 4.00 MiB / gzip: 2.00 MiB\n";
    const oneMiB = runWorkerSizeCheck(output, String(MIB_BYTES));
    const threeMiB = runWorkerSizeCheck(output, String(3 * MIB_BYTES));

    expect(oneMiB.status).toBe(1);
    expect(oneMiB.output).toContain("exceeds budget 1.00 MiB");
    expect(threeMiB.status).toBe(0);
    expect(threeMiB.args).toBe("deploy --dry-run --config wrangler.jsonc");
  });

  it("fails explicitly for invalid budget and unparseable output", () => {
    const output = "Total Upload: 4.00 MiB / gzip: 2.00 MiB\n";
    const invalidBudget = runWorkerSizeCheck(output, "invalid");
    const invalidOutput = runWorkerSizeCheck("Dry run completed\n");

    expect(invalidBudget.status).toBe(1);
    expect(invalidBudget.output).toContain("must be a positive integer");
    expect(invalidOutput.status).toBe(1);
    expect(invalidOutput.output).toContain(
      "Could not parse Wrangler dry-run output",
    );
  });
});
