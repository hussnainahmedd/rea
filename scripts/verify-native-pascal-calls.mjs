import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  artifactCli,
  artifactMcpResult,
  withArtifactMcp,
} from "./lib/artifact-e2e.mjs";

const execute = promisify(execFile);
const compiler = process.env.REA_VERIFY_FPC_COMMAND;
if (process.platform !== "darwin" || !isAbsolute(compiler ?? ""))
  throw new Error(
    "Requires macOS and an absolute caller-selected REA_VERIFY_FPC_COMMAND; build the runtime first.",
  );
const source = fileURLToPath(
  new URL("../tests/conformance/native/calls.pas", import.meta.url),
);
const fixtureLines = (await readFile(source, "utf8")).split(/\r?\n/u);
const callerLines = new Set(
  ["REA_VERIFY_CALLER_LOOP", "REA_VERIFY_CALLER_CALL"].map((marker) => {
    const matches = fixtureLines.flatMap((line, index) =>
      line.includes(marker) ? [index + 1] : [],
    );
    assert.equal(matches.length, 1, `fixture has one ${marker} marker`);
    return matches[0];
  }),
);
const directory = await mkdtemp(join(tmpdir(), "rea-pascal-calls-"));
const input = {
  breakpoints: [{ kind: "function", name: "rea_pascal_call" }],
  argument_registers: 1,
  backtrace_frames: 1,
  duration_ms: 30_000,
};
const inspect = (result) => {
  assert.equal(result.process.outcome, "exited");
  assert.equal(result.process.exit_status, 0);
  assert.equal(result.process.terminated, true);
  assert.equal(result.process.stdout.text, "pascal 0\npascal 1\npascal 2\n");
  assert.equal(result.events.length, 3);
  assert.deepEqual(
    result.events.map((event) => event.registers[0].value),
    ["0x0", "0x1", "0x2"],
  );
  assert.equal(result.breakpoints[0].location_count, 1);
  for (const event of result.events) {
    assert.equal(event.backtrace.length, 1);
    assert.equal(event.backtrace[0].source_location?.file_path, source);
    assert.equal(event.backtrace[0].module_path, join(directory, "calls"));
    assert.ok(
      callerLines.has(event.backtrace[0].source_location.line),
      "caller is the Pascal loop/call site",
    );
  }
  for (const location of [
    ...result.events,
    ...result.breakpoints[0].locations,
  ]) {
    assert.equal(location.source_location?.file_path, source);
    assert.ok(location.source_location.line > 0);
  }
};
const stable = (result) =>
  result.events.map((event) => ({
    file_address: event.file_address,
    source_location: event.source_location,
    registers: event.registers,
    callers: event.backtrace.map((frame) => ({
      file_address: frame.file_address,
      symbol: frame.symbol,
      source_location: frame.source_location,
    })),
  }));
try {
  const version = (
    await execute(compiler, ["-iV"], { timeout: 30_000, killSignal: "SIGKILL" })
  ).stdout.trim();
  const architecture = (
    await execute(compiler, ["-iTP"], {
      timeout: 30_000,
      killSignal: "SIGKILL",
    })
  ).stdout.trim();
  await execute(
    compiler,
    [
      "-dDEBUG",
      "-gw3",
      "-O-",
      "-Xs-",
      `-FE${directory}`,
      `-FU${directory}`,
      source,
    ],
    { timeout: 120_000, killSignal: "SIGKILL" },
  );
  const binary = join(directory, "calls");
  const cli = await artifactCli(
    "observe-native-calls",
    binary,
    [JSON.stringify(input)],
    { timeoutMs: 180_000 },
  );
  inspect(cli);
  await withArtifactMcp(binary, async (client) => {
    const mcp = await artifactMcpResult(client, "observe_native_calls", input);
    inspect(mcp);
    assert.deepEqual(stable(mcp), stable(cli));
  });
  console.log(
    JSON.stringify({
      ok: true,
      mocked: false,
      compiler,
      version,
      architecture,
      debugger: cli.debugger,
      cli: true,
      stdio_mcp: true,
      scope:
        "bounded native call entries and compiler-provided source coordinates; no typed Pascal locals or interactive stepping",
    }),
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
