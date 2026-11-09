// Read Claude Code hook configuration from the documented settings layers,
// same precedence family as perm-dryrun: managed > project-local > project >
// user. Hooks live under the top-level `hooks` key:
//   hooks: { EventName: [ { matcher, hooks: [ { type:"command", command, timeout } ] } ] }

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export function settingsSources({ projectDir = process.cwd(), home = os.homedir() } = {}) {
  const proj = path.resolve(projectDir);
  return [
    { label: "managed", level: 5, file: process.platform === "darwin"
        ? "/Library/Application Support/ClaudeCode/managed-settings.json"
        : process.platform === "win32"
          ? "C:\\ProgramData\\ClaudeCode\\managed-settings.json"
          : "/etc/claude-code/managed-settings.json" },
    { label: "project-local", level: 3, file: path.join(proj, ".claude", "settings.local.json") },
    { label: "project", level: 2, file: path.join(proj, ".claude", "settings.json") },
    { label: "user", level: 1, file: path.join(home, ".claude", "settings.json") },
  ];
}

function readHooks(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
  try {
    const json = JSON.parse(text);
    const hooks = json.hooks;
    if (!hooks || typeof hooks !== "object") return { hooks: {} };
    return { hooks };
  } catch (e) {
    return { hooks: {}, error: `JSON 解析失败: ${e.message}` };
  }
}

// Flatten every configured hook entry for one event (or all events).
// Output: [{ event, matcher, command, timeout, source: {label, file}, raw }]
export function collectHooks({ event, projectDir, home } = {}) {
  const out = [];
  for (const src of settingsSources({ projectDir, home })) {
    const r = readHooks(src.file);
    if (!r) continue;
    if (r.error) {
      out.push({ event, matcher: null, command: null, timeout: null, source: src, error: r.error });
      continue;
    }
    const events = event ? { [event]: r.hooks[event] } : r.hooks;
    for (const [evName, groups] of Object.entries(events)) {
      if (!Array.isArray(groups)) continue;
      for (const group of groups) {
        for (const h of group.hooks || []) {
          out.push({
            event: evName,
            matcher: group.matcher || null,
            command: h.command,
            type: h.type || "command",
            timeout: typeof h.timeout === "number" ? h.timeout : 60,
            source: { label: src.label, file: src.file },
            raw: h,
          });
        }
      }
    }
  }
  return out.filter((h) => h.command !== null || h.error);
}

// Does a matcher regex match the subject? Empty/absent matcher = match all.
export function matcherMatches(matcher, subject) {
  if (!matcher) return true;
  try {
    return new RegExp(matcher).test(subject ?? "");
  } catch {
    return false; // invalid regex — never crash a run over it
  }
}
