import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { runHook, evaluate, parseDecision } from "../src/runner.js";

const cmd = (body) => `node -e ${JSON.stringify(body)}`;

test("runHook: payload arrives as JSON on stdin", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "htk-run-"));
  const outFile = path.join(dir, "out.json");
  // the helper script lives in a file — no nested shell quoting
  const helper = path.join(dir, "echo-payload.js");
  fs.writeFileSync(
    helper,
    `const fs = require("node:fs");
     let s = "";
     process.stdin.on("data", (d) => (s += d));
     process.stdin.on("end", () => { fs.writeFileSync(${JSON.stringify(outFile)}, s); process.exit(0); });`,
  );
  const r = await runHook(`node ${JSON.stringify(helper)}`, { tool_name: "Bash", tool_input: { command: "ls" } });
  assert.equal(r.ok, true);
  assert.equal(r.exitCode, 0);
  const payload = JSON.parse(fs.readFileSync(outFile, "utf8"));
  assert.equal(payload.tool_name, "Bash");
  assert.deepEqual(payload.tool_input, { command: "ls" });
});

import fs from "node:fs";
import os from "node:os";

test("runHook: exit code 2 and stderr are captured (blocking error)", async () => {
  const r = await runHook(cmd('process.stderr.write("not allowed"); process.exit(2)'), {}, { timeout: 10 });
  assert.equal(r.exitCode, 2);
  assert.ok(r.stderr.includes("not allowed"));
});

test("runHook: JSON decision on stdout is parsed", async () => {
  const r = await runHook(
    cmd('process.stdout.write(JSON.stringify({ decision: "block", reason: "no prod deploys on Friday" })); process.exit(0);'),
    {},
    { timeout: 10 },
  );
  assert.equal(r.exitCode, 0);
  assert.deepEqual(r.decision, { decision: "block", reason: "no prod deploys on Friday", raw: { decision: "block", reason: "no prod deploys on Friday" } });
});

test("runHook: timeout kills the hook and reports", async () => {
  const r = await runHook(cmd("setInterval(() => {}, 1000)"), {}, { timeout: 1 });
  assert.equal(r.error, "timeout（1s）");
  assert.equal(r.exitCode, null);
  assert.ok(r.ms >= 900, "the timeout actually waited");
});

test("evaluate: exit/decision/contains assertions", () => {
  const result = { exitCode: 2, stdout: "blocked!", decision: { decision: "block" } };
  assert.equal(evaluate(result, { expectExit: 2 }).pass, true);
  assert.equal(evaluate(result, { expectExit: 0 }).pass, false);
  assert.equal(evaluate(result, { expectDecision: "block" }).pass, true);
  assert.equal(evaluate(result, { expectContains: "block" }).pass, true);
  const multi = evaluate(result, { expectExit: 0, expectDecision: "block" });
  assert.equal(multi.pass, false);
  assert.equal(multi.failed.length, 1);
});

test("parseDecision: non-JSON stdout is null, plain text ignored", () => {
  assert.equal(parseDecision("hello"), null);
  assert.equal(parseDecision('{"no_decision_here": 1}'), null);
  assert.equal(parseDecision('{"decision":"approve"}').decision, "approve");
});
