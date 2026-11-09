<div align="center">

# 🪝 hooktestkit

**Claude Code hooks have no test runner. Now they do.**

[![CI](https://github.com/ecoreal/hooktestkit/actions/workflows/ci.yml/badge.svg)](https://github.com/ecoreal/hooktestkit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-3fb96f.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A518.17-339933)](package.json)
[![dependencies](https://img.shields.io/badge/dependencies-0-339933)](package.json)
[![tests](https://img.shields.io/badge/tests-15-5ba1f0)](#development)

[中文说明](README.zh-CN.md)

```console
$ hooktestkit run-config --event SessionStart

🪝 SessionStart · 1 个 hook 将被触发（样本「startup」）
  ok  bash '/home/ec/.claude/hooks/herdr-agent-state.sh' session  ← user · 10s

  1/1 通过
```

Hook authors can only test by opening a real Claude Code session — and "my
hook doesn't fire" is the #1 troubleshooting FAQ. hooktestkit replays any hook
against fixture payloads: real stdin JSON, real exit codes, real JSON
decisions, pass/fail assertions — locally or in CI.

- **`run`** — one hook command + one fixture payload → exit code, stdout,
  stderr, parsed `{"decision":...}` outcome, timing, with TDD assertions
- **`run-config`** — replay every hook configured in your settings for an
  event, respecting matchers, and see which pass
- **`list-hooks` / `list-events`** — the four settings layers flattened, and
  the event registry with documented payload fields
- **Zero dependencies** · offline · nothing is ever modified

## Install

```bash
npm install -g hooktestkit
# or run once, install nothing:
npx hooktestkit list-events
```

## Usage

```bash
# TDD a hook: fixture in, assertions out (exit code 1 on mismatch)
hooktestkit run "bash ./hooks/guard.sh" \
  --event PreToolUse --tool Bash \
  --input '{"tool_input":{"command":"rm -rf /"}}' \
  --expect-exit 2 --expect-decision block

# Will my configured hooks fire, and do they pass?
hooktestkit run-config --event SessionStart
hooktestkit run-config --event PreToolUse --matcher-sample "Bash"

# Inventory
hooktestkit list-hooks            # every hook across the four settings layers
hooktestkit list-events           # event registry + payload fields
```

## The read-only guarantees

hooktestkit spawns **your hook command** — that's the point — and nothing
else. It never writes to Claude Code's directories, never edits settings, and
never touches the network. The only file it writes is one you asked for.

## Development

```bash
git clone https://github.com/ecoreal/hooktestkit && cd hooktestkit
npm test          # 15 tests with real subprocess replays, offline
```

CI: Ubuntu/macOS/Windows × Node 18/20/22/24.

## Roadmap

- [ ] `hooktestkit snapshot` — capture a real session's hook payloads as fixtures
- [ ] `--update-snapshots` workflow for hook regression suites
- [ ] Prompt-type and MCP-tool hook support

## License

MIT © 2026 [Jerry Lee (ecoreal)](https://github.com/ecoreal)
