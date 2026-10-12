import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
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
  }));
try {
  const version = (await execute(compiler, ["-iV"])).stdout.trim();
  const architecture = (await execute(compiler, ["-iTP"])).stdout.trim();
  await execute(compiler, [
    "-dDEBUG",
    "-gw3",
    "-O-",
    "-Xs-",
    `-FE${directory}`,
    `-FU${directory}`,
    source,
  ]);
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
