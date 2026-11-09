// The runner: one hook command + one payload → { exitCode, stdout, stderr,
// decision, ms }. The payload goes to the hook's stdin as JSON, exactly like
// Claude Code delivers it; stdout JSON with a `decision` field is parsed into
// the structured outcome the docs describe.

import { spawn } from "node:child_process";

export function runHook(command, payload, { timeout = 60, cwd = process.cwd(), env } = {}) {
  return new Promise((resolve) => {
    const start = performance.now();
    let child;
    try {
      child = spawn("sh", ["-c", command], { cwd, stdio: ["pipe", "pipe", "pipe"], env: env ? { ...process.env, ...env } : process.env });
    } catch (e) {
      return resolve({ ok: false, exitCode: null, stdout: "", stderr: String(e), decision: null, ms: 0, error: "spawn failed" });
    }
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (r) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // kill the hook tree on settle — hooks that exit may leave grandchildren
      // (sleep, servers) alive, and nothing here may outlive the harness
      try { child.kill("SIGKILL"); } catch {}
      try { child.stdout.destroy(); child.stderr.destroy(); child.stdin.destroy(); } catch {}
      resolve({ ok: true, ms: Math.round(performance.now() - start), ...r });
    };
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
      finish({ exitCode: null, stdout, stderr, decision: null, error: `timeout（${timeout}s）` });
    }, timeout * 1000);

    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => finish({ exitCode: null, stdout, stderr, decision: null, error: e.code || e.message }));
    child.on("close", (code) => {
      const decision = parseDecision(stdout);
      finish({ exitCode: code, stdout, stderr, decision });
    });
    try {
      child.stdin.write(JSON.stringify(payload));
      child.stdin.end();
    } catch {
      /* EPIPE after early exit — close handles it */
    }
  });
}

// stdout may carry a JSON decision object ({"decision":"block","reason":…})
// — Claude Code reads it; so do we.
export function parseDecision(stdout) {
  const text = String(stdout || "").trim();
  if (!text.startsWith("{")) return null;
  try {
    const json = JSON.parse(text);
    if (json && (json.decision || json.continue !== undefined)) {
      return { decision: json.decision ?? null, reason: json.reason ?? null, raw: json };
    }
    return null;
  } catch {
    return null;
  }
}

// Assertions for the TDD workflow: every expectation that holds/costs.
export function evaluate(result, { expectExit, expectDecision, expectContains } = {}) {
  const checks = [];
  if (expectExit !== undefined) {
    checks.push({ name: `exit code = ${expectExit}`, pass: result.exitCode === Number(expectExit) });
  }
  if (expectDecision) {
    const got = result.decision?.decision ?? null;
    checks.push({ name: `decision = ${expectDecision}`, pass: got === expectDecision });
  }
  if (expectContains) {
    checks.push({ name: `stdout 含 "${expectContains}"`, pass: result.stdout.includes(expectContains) });
  }
  const failed = checks.filter((c) => !c.pass);
  return { pass: failed.length === 0, checks, failed };
}
