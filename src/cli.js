#!/usr/bin/env node
// hooktestkit — a replay test harness for Claude Code hooks.

import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

import { EVENTS, eventNames, buildPayload } from "./events.js";
import { collectHooks, matcherMatches } from "./hooksconfig.js";
import { runHook, evaluate } from "./runner.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;

function usage(code = 0) {
  console.log(`🪝 hooktestkit v${pkg.version} — Claude Code hooks 的回放测试台

用法:
  hooktestkit run "<hook 命令>" [选项]     把 payload 从 stdin 喂给 hook，报告结果
  hooktestkit run-config --event <名>     实跑 settings 里该事件的全部 hook（respect matchers）
  hooktestkit list-hooks [--event <名>]   列出各层 settings 配置的 hooks
  hooktestkit list-events                 事件注册表与 payload 字段

run 选项:
  --event <名>         事件名（默认 PreToolUse；完整清单见 list-events）
  --input <json|文件>   payload 覆盖（内联 JSON 或 @文件）
  --tool <名>          PreToolUse/PostToolUse 的 tool_name（默认 Bash）
  --cwd <dir>          payload 的 cwd 与子进程工作目录
  --timeout <秒>       hook 超时（默认 60，配置的 per-hook timeout 优先）
  --expect-exit <n>    断言退出码（不符 → 退出码 1，TDD 工作流）
  --expect-decision <d> 断言 JSON decision（如 block）
  --expect-contains <s> 断言 stdout 包含该文本
  --home <dir> / --json / --no-color

只读保证：除你指定的 hook 子进程本身外，不执行、不修改任何东西。`);
  process.exit(code);
}

function parseArgv(argv) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") usage(0);
    if (a === "-v" || a === "--version") {
      console.log(pkg.version);
      process.exit(0);
    }
    if (a === "--json") flags.json = true;
    else if (a === "--no-color") flags.color = false;
    else if (a === "--event") flags.event = argv[++i];
    else if (a === "--input") flags.input = argv[++i];
    else if (a === "--tool") flags.tool = argv[++i];
    else if (a === "--cwd") flags.cwd = argv[++i];
    else if (a === "--timeout") flags.timeout = Number(argv[++i]);
    else if (a === "--expect-exit") flags.expectExit = argv[++i];
    else if (a === "--expect-decision") flags.expectDecision = argv[++i];
    else if (a === "--expect-contains") flags.expectContains = argv[++i];
    else if (a === "--home") flags.home = argv[++i];
    else if (a === "--matcher-sample") flags.matcherSample = argv[++i];
    else if (a === "--force") flags.force = true;
    else flags._.push(a);
  }
  return flags;
}

function resolvePayload(flags) {
  const overrides = {};
  if (flags.input) {
    let text = flags.input;
    if (text.startsWith("@")) {
      text = fs.readFileSync(text.slice(1), "utf8");
    }
    Object.assign(overrides, JSON.parse(text));
  }
  const event = flags.event || "PreToolUse";
  if (flags.tool && (event === "PreToolUse" || event === "PostToolUse")) {
    overrides.tool_name = flags.tool;
  }
  const payload = buildPayload(event, overrides, { cwd: path.resolve(flags.cwd || process.cwd()) });
  return { event, payload };
}

// ---------- run ----------
async function cmdRun(flags) {
  const command = flags._[1];
  if (!command) {
    console.error('hooktestkit run: 需要 hook 命令 —— hooktestkit run "bash ./hooks/x.sh" --event PreToolUse');
    process.exitCode = 1;
    return;
  }
  const { event, payload } = resolvePayload(flags);
  const timeout = Number.isFinite(flags.timeout) && flags.timeout > 0 ? flags.timeout : 60;
  const result = await runHook(command, payload, {
    timeout,
    cwd: flags.cwd ? path.resolve(flags.cwd) : process.cwd(),
  });

  if (flags.json) {
    console.log(JSON.stringify({ event, payload, result }, null, 2));
  } else {
    console.log(bold(`🪝 ${event} → ${command.slice(0, 70)}`));
    console.log(dim(`   payload: ${Object.keys(payload).join(", ")}`));
    const exit = result.exitCode === null ? dim("null") : result.exitCode;
    const exitPainted = result.exitCode === 0 ? green(`0`) : result.exitCode === 2 ? red(`2 (blocking)`) : exit;
    console.log(`   exitCode: ${exitPainted}  ·  ${result.ms}ms${result.error ? red(`  ·  ${result.error}`) : ""}`);
    if (result.decision) {
      console.log(`   decision: ${bold(result.decision.decision ?? "—")}${result.decision.reason ? dim(` · ${result.decision.reason}`) : ""}`);
    }
    if (result.stdout.trim()) console.log(dim(`   stdout: ${result.stdout.trim().slice(0, 200)}`));
    if (result.stderr.trim()) console.log(red(`   stderr: ${result.stderr.trim().slice(0, 200)}`));
  }

  const expectations = {
    expectExit: flags.expectExit,
    expectDecision: flags.expectDecision,
    expectContains: flags.expectContains,
  };
  if (Object.values(expectations).some((v) => v !== undefined)) {
    const r = evaluate(result, expectations);
    if (!r.pass) {
      console.error(`✗ 断言未满足:`);
      for (const f of r.failed) console.error(`   ✗ ${f.name}`);
      process.exitCode = 1;
    } else {
      console.log(green("✓ 全部断言通过"));
    }
  }
}

// ---------- run-config ----------
// The matcher subject depends on the event: SessionStart matches against the
// source (startup/resume/…), PreToolUse/PostToolUse against the tool name.
function matcherSubjectFor(event, flags) {
  if (flags.matcherSample !== undefined) return flags.matcherSample;
  if (event === "SessionStart") return "startup";
  if (event === "PreToolUse" || event === "PostToolUse") return flags.tool || "Bash";
  return "";
}

async function cmdRunConfig(flags) {
  const event = flags.event || "SessionStart";
  const hooks = collectHooks({ event, projectDir: flags.cwd ? path.resolve(flags.cwd) : process.cwd(), home: flags.home });
  if (!hooks.length) {
    console.log(`🪝 ${event} 没有配置任何 hook（检查的层见 list-hooks）`);
    return;
  }
  const subject = matcherSubjectFor(event, flags);
  const mine = hooks.filter((h) => !h.error && matcherMatches(h.matcher, subject));
  const skipped = hooks.filter((h) => !h.error && !matcherMatches(h.matcher, subject));
  if (!mine.length) {
    console.log(`🪝 ${event} 配置了 ${hooks.length} 个 hook，但没有一个的 matcher 命中样本「${subject}」（用 --matcher-sample 换样本）`);
    for (const h of skipped) console.log(dim(`  ⊘ ${clip(h.command, 60)} · matcher: ${h.matcher}`));
    return;
  }
  console.log(bold(`🪝 ${event} · ${mine.length} 个 hook 将被触发`) + dim(`（样本「${subject}」）`));
  const results = [];
  for (const h of mine) {
    const payload = buildPayload(event, {}, { cwd: process.cwd() });
    const r = await runHook(h.command, payload, { timeout: (h.timeout || 60) });
    results.push(r);
    const paint = r.exitCode === 0 ? green("ok") : r.exitCode === 2 ? red("blocking") : red(`exit ${r.exitCode ?? "?"}`);
    console.log(`  ${paint}  ${h.command.slice(0, 66)}  ${dim(`← ${h.source.label} · ${h.timeout}s`)}`);
    if (r.stderr.trim()) console.log(red(`      stderr: ${r.stderr.trim().slice(0, 160)}`));
  }
  for (const h of skipped) console.log(dim(`  ⊑ matcher 不命中: ${clip(h.command, 56)}`));
  const ok = results.filter((r) => r.exitCode === 0).length;
  console.log(dim(`\n  ${ok}/${results.length} 通过 · 断言用法见 hooktestkit run --help`));
}

// ---------- list-hooks / list-events ----------
function cmdListHooks(flags) {
  const hooks = collectHooks({
    event: flags.event,
    projectDir: flags.cwd ? path.resolve(flags.cwd) : process.cwd(),
    home: flags.home,
  });
  if (flags.json) {
    console.log(JSON.stringify(hooks, null, 2));
    return;
  }
  if (!hooks.length) {
    console.log("🪝 未发现任何 hook 配置（四个 settings 层都查过了）。");
    return;
  }
  for (const h of hooks) {
    if (h.error) {
      console.log(red(`  ⚠ ${h.source.label}: ${h.error}`));
      continue;
    }
    console.log(`  ${pad(h.event, 18)} ${pad(clip(h.matcher || "(all)", 24), 26)} ${clip(h.command, 60)}  ${dim(h.source.label)}`);
  }
}

function cmdListEvents() {
  console.log(bold("🪝 事件注册表（payload 默认字段）"));
  for (const [name, spec] of Object.entries(EVENTS)) {
    console.log(`\n  ${bold(name)}${spec.matcher ? dim(`  matcher: ${spec.matcher}`) : ""}`);
    console.log(dim(`    ${Object.keys(spec.fields).join(", ")}`));
  }
  console.log(dim(`\n  未注册的事件名也能跑 —— payload 由 --input 提供。`));
}

function clip(s, n) {
  s = String(s ?? "").replace(/\n/g, " ");
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
function pad(s, n) {
  s = String(s ?? "");
  return s + " ".repeat(Math.max(0, n - s.length));
}

const flags = parseArgv(process.argv.slice(2));
const cmd = flags._[0] || "run";
try {
  if (cmd === "run") await cmdRun(flags);
  else if (cmd === "run-config") await cmdRunConfig(flags);
  else if (cmd === "list-hooks") cmdListHooks(flags);
  else if (cmd === "list-events") cmdListEvents();
  else usage(1);
} catch (e) {
  console.error(`hooktestkit: ${e.message}`);
  process.exitCode = 1;
}
