# tt-b 快速开始

模型感知的智能体工作流工具包。一条命令，为你的项目加上记忆系统、8 个钩子、12 个 MCP 工具和 10 个技能。

> 完整架构和 API 参考请查阅 [README-zh-CN.md](README-zh-CN.md)。

## 前提条件

- **Node.js >= 18** — `node --version` 确认
- 任一支持的智能体 CLI（见下方各平台章节）

---

## Claude Code（插件方式，推荐）

3 步完成：注册市场源 → 安装插件 → 验证。

```bash
# 1. 注册插件市场
/plugin marketplace add wsq3172298228-cpu/tt-b

# 2. 安装插件（自动注册 8 hooks + MCP + 10 skills）
/plugin install tt-b
```

```bash
# 3. 验证——检查钩子和技能是否加载
/preflight
```

预期输出：显示当前宿主、模型和能力层级。

---

## Claude Code（npx 一键导入）

适用于不想走插件系统的场景。导入到当前项目：

```bash
# 1. 一键导入
npx --yes github:wsq3172298228-cpu/tt-b .
```

```bash
# 2. 验证生成的文件
ls .claude/bin/       # model-preflight.js, memory-reminder.js, ...
ls .claude/memory/    # knowledge-graph.md, session-state.md
```

```bash
# 3. 启动 Claude Code 测试
claude
```

Claude Code 会自动加载 `CLAUDE.md` 中的启动契约。

---

## Claude Code（全局部署）

部署到 `~/.claude/`，对所有项目生效：

```bash
# 1. 全局部署
npx tt-b install --global
```

```bash
# 2. 验证
ls ~/.claude/bin/            # 应包含 model-preflight.js, memory-reminder.js
cat ~/.claude/settings.json  # 应包含 tt-b 钩子配置
```

```bash
# 3. 健康检查
npx tt-b health
```

预期输出：所有检查项显示绿色 ✓。

---

## Codex CLI

```bash
# 1. 安装 Codex 插件
node bin/tt-b-codex-install.js
```

```bash
# 2. 验证安装状态
node bin/tt-b-codex-install.js --status
```

预期输出：显示已安装的钩子和配置文件状态。

---

<details>
<summary><b>OpenCode</b></summary>

```bash
# 1. 导入工作流
node bin/import-agent-workflow.js .
```

```bash
# 2. 验证生成的文件
cat AGENTS.md        # 应包含智能体指令
cat opencode.json    # 应包含指令文件注册
```

</details>

---

<details>
<summary><b>OpenClaw</b></summary>

```bash
# 1. 安装 MCP 服务器
node bin/tt-b-openclaw-install.js
```

```bash
# 2. 验证安装状态
node bin/tt-b-openclaw-install.js --status
```

预期输出：显示 MCP 服务器配置路径和状态。

</details>

---

## 通用验证

不管哪种安装方式，都可以用以下命令验证核心功能：

```bash
# 模型预检
node .claude/bin/model-preflight.js --host claude --model claude-opus-4-7 --text
# 预期: 宿主: claude / 模型: claude-opus-4-7 / 能力: architect_orchestrator

# 语法检查（无输出 = 通过）
node --check .claude/bin/model-preflight.js
node --check .claude/bin/memory-reminder.js

# REST 服务器健康检查（如果已启动）
curl http://localhost:3742/health
```

---

## 第一次使用

安装完成后，在 Claude Code 中尝试这些技能：

| 输入 | 效果 |
|------|------|
| `/preflight` | 检测宿主、模型、能力层级 |
| `/remember 项目使用 ESM 模块` | 保存一条洞察到长期记忆 |
| `/recall 认证方案` | 搜索记忆中的相关内容 |
| `/memories` | 列出所有记忆文件及大小 |
| `/verify` | 检查记忆是否过时或有占位符 |
| `/graph` | 显示知识图谱节点和边 |

也可以直接对话：

```
请检查当前项目记忆状态并告诉我有哪些已知事实
```

---

## 启动服务（可选）

```bash
# MCP 服务器——让 MCP 客户端访问记忆资源
node .claude/bin/tt-b-mcp-server.js

# REST API 服务器——HTTP 接口，适合脚本集成
node .claude/bin/tt-b-rest-server.js

# 完整生命周期——8 阶段引导（REST + 查看器 + 健康检查 + 搜索索引）
node .claude/bin/tt-b-lifecycle.js
```

查看器仪表盘：`http://localhost:3743`

---

## 卸载

| 平台 | 卸载命令 |
|------|---------|
| Claude Code（插件） | `/plugin uninstall tt-b` |
| Claude Code（npx 导入） | `node bin/tt-b-cleanup.js .` |
| Claude Code（全局） | `npx tt-b uninstall` |
| Codex CLI | `node bin/tt-b-codex-install.js --remove` |
| OpenClaw | `node bin/tt-b-openclaw-install.js --remove` |

```bash
# 预览卸载内容（不实际删除）
node bin/tt-b-cleanup.js . --dry-run
```

---

## 下一步

- [README-zh-CN.md](README-zh-CN.md) — 完整架构和 API 参考
- [CLAUDE.md](CLAUDE.md) — 启动契约详细说明
- `plugin/skills/` — 所有技能的源码和说明
