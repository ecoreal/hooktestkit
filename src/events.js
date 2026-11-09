// Claude Code hook events, with the payload fields each one documents.
// The runner assembles a full payload from these defaults, then deep-merges
// whatever the caller supplies (--input fixture). Event list mirrors the
// official hooks reference (~36 events; the ones with documented payloads
// are registered here — unknown names still run with pass-through payloads).

export const EVENTS = {
  PreToolUse: {
    fields: { session_id: "abc123", transcript_path: "/tmp/transcript.jsonl", cwd: process.cwd(), tool_name: "Bash", tool_input: { command: "ls" } },
    matcher: "tool name regex",
  },
  PostToolUse: {
    fields: { session_id: "abc123", transcript_path: "/tmp/transcript.jsonl", cwd: process.cwd(), tool_name: "Bash", tool_input: { command: "ls" }, tool_response: { ok: true } },
    matcher: "tool name regex",
  },
  UserPromptSubmit: {
    fields: { session_id: "abc123", transcript_path: "/tmp/transcript.jsonl", cwd: process.cwd(), prompt: "fix the login race" },
    matcher: null,
  },
  Notification: {
    fields: { session_id: "abc123", message: "Claude needs your permission to use Bash", title: "Claude Code" },
    matcher: null,
  },
  SessionStart: {
    fields: { session_id: "abc123", transcript_path: "/tmp/transcript.jsonl", cwd: process.cwd(), source: "startup" },
    matcher: "startup|resume|clear|compact",
  },
  SessionEnd: {
    fields: { session_id: "abc123", transcript_path: "/tmp/transcript.jsonl", cwd: process.cwd(), reason: "clear" },
    matcher: null,
  },
  Stop: {
    fields: { session_id: "abc123", transcript_path: "/tmp/transcript.jsonl", cwd: process.cwd(), stop_hook_active: false },
    matcher: null,
  },
  SubagentStop: {
    fields: { session_id: "abc123", transcript_path: "/tmp/transcript.jsonl", cwd: process.cwd(), stop_hook_active: false },
    matcher: null,
  },
  PreCompact: {
    fields: { session_id: "abc123", transcript_path: "/tmp/transcript.jsonl", cwd: process.cwd(), trigger: "manual", custom_instructions: null },
    matcher: null,
  },
  PostCompact: {
    fields: { session_id: "abc123", transcript_path: "/tmp/transcript.jsonl", cwd: process.cwd(), trigger: "manual", custom_instructions: null },
    matcher: null,
  },
};

export function eventNames() {
  return Object.keys(EVENTS);
}

// Build a full payload for an event, deep-merging caller overrides.
export function buildPayload(eventName, overrides = {}, { cwd = process.cwd() } = {}) {
  const known = EVENTS[eventName];
  const fields = known
    ? { ...known.fields }
    : { session_id: "abc123", cwd };
  if ("cwd" in fields) fields.cwd = cwd;
  return deepMerge(fields, overrides);
}

function deepMerge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    if (v && typeof v === "object" && !Array.isArray(v) && typeof out[k] === "object" && out[k] !== null && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}
