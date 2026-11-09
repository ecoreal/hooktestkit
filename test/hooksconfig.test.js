import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectHooks, matcherMatches } from "../src/hooksconfig.js";

function fixtureHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "htk-home-"));
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), "htk-proj-"));
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.mkdirSync(path.join(proj, ".claude"), { recursive: true });
  fs.writeFileSync(
    path.join(home, ".claude", "settings.json"),
    JSON.stringify({
      hooks: {
        SessionStart: [
          { matcher: "^(startup|resume)$", hooks: [{ type: "command", command: "bash session-start.sh", timeout: 10 }] },
        ],
        PreToolUse: [
          { matcher: "^Bash$", hooks: [{ type: "command", command: "bash guard.sh" }] },
        ],
      },
    }),
  );
  fs.writeFileSync(
    path.join(proj, ".claude", "settings.local.json"),
    JSON.stringify({
      hooks: {
        PreToolUse: [
          { matcher: "^Write$", hooks: [{ type: "command", command: "node audit.js" }] },
        ],
        PostToolUse: [
          { matcher: "", hooks: [{ type: "command", command: "node log.js" }] },
        ],
      },
    }),
  );
  // broken JSON layer must surface as an error entry, not a crash
  fs.writeFileSync(path.join(proj, ".claude", "settings.json"), "{ broken");
  return { home, proj };
}

test("collectHooks: flattens events × groups × hooks across layers", () => {
  const { home, proj } = fixtureHome();
  const hooks = collectHooks({ home, projectDir: proj });
  const real = hooks.filter((h) => !h.error);
  // 2 (user SessionStart+PreToolUse) + 2 (proj PreToolUse + PostToolUse) = 4 hook entries
  assert.equal(real.length, 4);
  const pre = real.filter((h) => h.event === "PreToolUse");
  // cross-layer execution order is not a contract — assert as a set
  assert.deepEqual(pre.map((h) => h.command).sort(), ["bash guard.sh", "node audit.js"]);
  // plus one error entry for the broken settings layer
  assert.equal(hooks.length, 5);
});

test("collectHooks: broken settings layer becomes an error entry", () => {
  const { home, proj } = fixtureHome();
  const hooks = collectHooks({ home, projectDir: proj });
  assert.ok(hooks.some((h) => h.error && h.source.label === "project"));
});

test("matcherMatches: empty matches all, invalid regex never throws", () => {
  assert.equal(matcherMatches(null, "Bash"), true);
  assert.equal(matcherMatches("", "Bash"), true);
  assert.equal(matcherMatches("^Bash$", "Bash"), true);
  assert.equal(matcherMatches("^Bash$", "Write"), false);
  assert.equal(matcherMatches("([invalid", "Bash"), false);
});

test("collectHooks: single-event filter", () => {
  const { home, proj } = fixtureHome();
  const hooks = collectHooks({ home, projectDir: proj, event: "PostToolUse" }).filter((h) => !h.error);
  assert.equal(hooks.length, 1);
  assert.equal(hooks[0].command, "node log.js");
});
