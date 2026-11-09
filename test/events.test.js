import { test } from "node:test";
import assert from "node:assert/strict";
import { EVENTS, eventNames, buildPayload } from "../src/events.js";

test("event registry: the documented core events exist", () => {
  for (const name of ["PreToolUse", "PostToolUse", "UserPromptSubmit", "Notification", "SessionStart", "Stop", "PreCompact"]) {
    assert.ok(EVENTS[name], `${name} registered`);
  }
  assert.ok(eventNames().length >= 10);
});

test("buildPayload: PreToolUse carries the documented fields", () => {
  const p = buildPayload("PreToolUse");
  assert.equal(p.tool_name, "Bash");
  assert.deepEqual(p.tool_input, { command: "ls" });
  assert.ok(p.session_id);
  assert.ok(p.transcript_path.endsWith("transcript.jsonl"));
});

test("buildPayload: overrides deep-merge over defaults", () => {
  const p = buildPayload("PreToolUse", { tool_name: "Write", tool_input: { file_path: "/x/y" } });
  assert.equal(p.tool_name, "Write");
  assert.equal(p.tool_input.file_path, "/x/y"); // merged in
  assert.ok(p.session_id, "untouched sibling survives");
});

test("buildPayload: cwd follows the caller", () => {
  const p = buildPayload("SessionStart", {}, { cwd: "/elsewhere" });
  assert.equal(p.cwd, "/elsewhere");
});

test("buildPayload: unknown events still get a pass-through payload", () => {
  const p = buildPayload("TeammateIdle", { team: "alpha" });
  assert.equal(p.team, "alpha");
});
