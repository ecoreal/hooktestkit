<div align="center">

# 🪝 hooktestkit

**Claude Code hooks 没有测试器。现在有了。**

[![CI](https://github.com/ecoreal/hooktestkit/actions/workflows/ci.yml/badge.svg)](https://github.com/ecoreal/hooktestkit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-3fb96f.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A518.17-339933)](package.json)
[![dependencies](https://img.shields.io/badge/dependencies-0-339933)](package.json)
[![tests](https://img.shields.io/badge/tests-15-5ba1f0)](#开发)

[English](README.md)

```console
$ hooktestkit run-config --event SessionStart

🪝 SessionStart · 1 个 hook 将被触发（样本「startup」）
  ok  bash '/home/ec/.claude/hooks/herdr-agent-state.sh' session  ← user · 10s

  1/1 通过
```

hook 作者只能开真实 Claude Code 会话来试 hook —— 而"hook 不触发"是官方
FAQ 的头号问题。hooktestkit 用 fixture payload 回放任意 hook：真实的 stdin
JSON、真实的退出码、真实的 JSON decision、pass/fail 断言 —— 本地或 CI 都能跑。

- **`run`** —— 一条 hook 命令 + 一份 fixture payload → 退出码、stdout、
  stderr、解析后的 `{"decision":...}` 结果、耗时，支持 TDD 断言
- **`run-config`** —— 回放 settings 里某事件配置的全部 hook（尊重 matcher），
  一眼看出哪些通过
- **`list-hooks` / `list-events`** —— 四层 settings 拍平展示 + 事件注册表
- **零依赖** · 离线 · 永不改你的配置

## 安装

```bash
npm install -g hooktestkit
# 或者不装，直接跑一次：
npx hooktestkit list-events
```

## 用法

```bash
# TDD 一个 hook：fixture 进，断言出（不符 → 退出码 1）
hooktestkit run "bash ./hooks/guard.sh" \
  --event PreToolUse --tool Bash \
  --input '{"tool_input":{"command":"rm -rf /"}}' \
  --expect-exit 2 --expect-decision block

# 我配置的 hooks 会触发吗？都能跑通吗？
hooktestkit run-config --event SessionStart
hooktestkit run-config --event PreToolUse --matcher-sample "Bash"

# 盘点
hooktestkit list-hooks            # 四层 settings 里的全部 hook
hooktestkit list-events           # 事件注册表 + payload 字段
```

## 只读保证

hooktestkit 会启动**你的 hook 命令** —— 这就是它的本职 —— 但仅此而已。
从不写 Claude Code 的目录、从不改 settings、从不联网。它唯一会写的文件是
你指定要写的。

## 开发

```bash
git clone https://github.com/ecoreal/hooktestkit && cd hooktestkit
npm test          # 15 个测试，真实子进程回放，离线
```

CI：Ubuntu/macOS/Windows × Node 18/20/22/24。

## 路线图

- [ ] `hooktestkit snapshot` —— 从真实会话捕获 hook payload 存为 fixture
- [ ] `--update-snapshots` hook 回归套件工作流
- [ ] prompt 型与 MCP 工具型 hook 支持

## 许可

MIT © 2026 [Jerry Lee (ecoreal)](https://github.com/ecoreal)
