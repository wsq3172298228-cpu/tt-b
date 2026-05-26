<div align="right">

[English](README.md) | [中文](README-zh-CN.md)

</div>

# tt-b

`tt-b` 是一个模型感知的智能体工作流工具包，用于基于记忆的工程任务。

它定义了一个可导入的启动契约，可与 Claude Code CLI、Codex、OpenCode 以及任何能够消费指令文件、钩子、MCP 工具或 REST API 的编码智能体配合使用。

安装后，智能体可以：

- 检测当前宿主和模型
- 在编辑前恢复项目记忆
- 根据模型能力选择执行模式
- 将长期知识与临时会话状态分离
- 一条命令将工作流安装到其他本地项目

当前提供 Claude Code、Codex 风格 `AGENTS.md` 和 OpenCode 的模板。其他智能体可以通过读取生成的指令文件、从钩子调用辅助脚本、通过 MCP 暴露或包装为 REST API 来集成相同契约。

## 快速开始

**前提条件：** Node.js >= 18（`node --version` 确认）+ 任一支持的智能体 CLI。

### Claude Code（插件方式，推荐）

```bash
# 1. 注册插件市场
/plugin marketplace add wsq3172298228-cpu/tt-b

# 2. 安装插件（自动注册 8 hooks + MCP + 10 skills）
/plugin install tt-b

# 3. 验证
/preflight
```

### Claude Code（npx 一键导入）

```bash
# 1. 导入到当前项目
npx --yes github:wsq3172298228-cpu/tt-b .

# 2. 验证
ls .claude/bin/       # model-preflight.js, memory-reminder.js, ...
ls .claude/memory/    # knowledge-graph.md, session-state.md

# 3. 启动
claude
```

### Claude Code（全局部署）

```bash
# 1. 部署到 ~/.claude/，所有项目生效
npx tt-b install --global

# 2. 验证
ls ~/.claude/bin/
npx tt-b health
```

### Codex CLI

```bash
# 1. 安装
node bin/tt-b-codex-install.js

# 2. 验证
node bin/tt-b-codex-install.js --status
```

<details>
<summary><b>OpenCode</b></summary>

```bash
node bin/import-agent-workflow.js .
cat AGENTS.md        # 应包含智能体指令
cat opencode.json    # 应包含指令文件注册
```

</details>

<details>
<summary><b>OpenClaw</b></summary>

```bash
node bin/tt-b-openclaw-install.js
node bin/tt-b-openclaw-install.js --status
```

</details>

### 第一次使用

安装后在 Claude Code 中尝试：

| 输入 | 效果 |
|------|------|
| `/preflight` | 检测宿主、模型、能力层级 |
| `/remember 项目使用 ESM 模块` | 保存洞察到长期记忆 |
| `/recall 认证方案` | 搜索记忆 |
| `/memories` | 列出所有记忆文件 |
| `/verify` | 检查记忆是否过时 |
| `/graph` | 显示知识图谱 |

### 卸载

| 平台 | 命令 |
|------|------|
| Claude Code（插件） | `/plugin uninstall tt-b` |
| Claude Code（npx 导入） | `node bin/tt-b-cleanup.js .` |
| Claude Code（全局） | `npx tt-b uninstall` |
| Codex CLI | `node bin/tt-b-codex-install.js --remove` |
| OpenClaw | `node bin/tt-b-openclaw-install.js --remove` |

---

## 一键导入

从本仓库：

```bash
node bin/import-agent-workflow.js /path/to/target-project
```

此命令将工作流安装到目标项目，适用于 Claude Code、Codex 风格智能体、OpenCode 和基于适配器的智能体。

它会创建或更新：

- `CLAUDE.md` - Claude Code / 共享智能体启动契约
- `AGENTS.md` - OpenCode 兼容智能体指令
- `opencode.json` - OpenCode 指令文件注册
- `.claude/bin/model-preflight.js` - 宿主/模型/能力检测器
- `.claude/bin/memory-reminder.js` - 非阻塞记忆提醒钩子辅助脚本
- `.claude/bin/memory-compress.js` - 上下文压缩时自动压缩记忆
- `.claude/bin/tt-b-mcp-server.js` - MCP 服务器，暴露记忆资源和工具
- `.claude/bin/tt-b-rest-server.js` - REST API 服务器，用于 HTTP 集成
- `.claude/bin/tt-b-lifecycle.js` - 完整生命周期引导，包含 8 个阶段（配置、提供者、记忆函数、REST、MCP、查看器、健康检查、搜索索引）
- `.claude/bin/graph-updater.js` - Diff 驱动的增量知识图谱守护进程（`--once`、`--watch`、`--gc`、`--verify`）
- `.claude/bin/post-commit-hook.js` - 轻量级 git post-commit 钩子，将提交排队用于异步图谱更新
- `.claude/functions/` - 16 个细粒度记忆能力模块（含 `graph-store.js` SQLite 存储层和 `subgraph-query.js` 子图查询）
- `.claude/settings.json` - Claude Code 钩子注册，用于记忆提醒
- `.claude/memory/knowledge-graph.md` - 干净的长期记忆模板
- `.claude/memory/session-state.md` - 干净的当前任务状态模板
- `.claude/knowledge-graph.md` - 兼容性指针文件
- `.claude/session-state.md` - 兼容性指针文件

已有的 `CLAUDE.md` 和 `AGENTS.md` 内容会被保留。导入器仅追加或替换受管理的 `tt-b` 区块。已有的记忆文件会被保留，除非使用 `--force`。

如果目标项目有 `package.json`，导入器会自动安装 `better-sqlite3` 依赖。图谱增量更新需要手动安装 git 钩子：

```bash
cp .claude/bin/post-commit-hook.js .git/hooks/post-commit && chmod +x .git/hooks/post-commit
```

常用选项：

```bash
node bin/import-agent-workflow.js /path/to/target-project --dry-run
node bin/import-agent-workflow.js /path/to/target-project --force
```

## 一键清理

从目标项目中移除所有 tt-b 产物：

```bash
node bin/tt-b-cleanup.js /path/to/target-project
```

移除内容：

- `CLAUDE.md` 和 `AGENTS.md` 中的受管理区块（保留已有内容）
- `.claude/bin/` 中的辅助脚本（含 graph-updater、post-commit-hook 等）
- `.claude/memory/` 中的记忆模板和图谱数据库（graph_memory.db）
- `.claude/` 中的兼容性指针文件
- `.claude/settings.json` 中的钩子条目（保留其他设置）
- `opencode.json` 中的指令条目（保留其他配置）
- 留下的空目录

常用选项：

```bash
node bin/tt-b-cleanup.js /path/to/target-project --dry-run
node bin/tt-b-cleanup.js /path/to/target-project --force
```

不使用 `--force` 时，包含真实项目数据的记忆文件和非指针兼容性文件会被保留。使用 `--force` 时，所有 tt-b 相关内容都会被移除。

## 从 GitHub 安装

可以一键导入工作流：

```bash
npx --yes github:YOUR_GITHUB_USERNAME/tt-b /path/to/target-project
```

在目标项目内部，最简形式为：

```bash
npx --yes github:YOUR_GITHUB_USERNAME/tt-b .
```

## 按平台快速开始

### Claude Code（插件，推荐）

```
安装 tt-b Claude Code 插件：运行 `/plugin marketplace add wsq3172298228-cpu/tt-b` 然后 `/plugin install tt-b` — 插件自动注册 8 个钩子，通过 `.mcp.json` 接入 MCP 服务器，暴露 10 个技能（/remember、/recall、/forget、/verify、/preflight、/graph、/memories、/session-history、/snapshot、/grill-me）。无需额外配置。
```

### Claude Code（npx 一键导入）

```bash
# 在目标项目内执行
npx --yes github:wsq3172298228-cpu/tt-b .
```

生成 `CLAUDE.md`、`.claude/settings.json`、记忆模板及所有辅助脚本。已有文件会被保留。

### Claude Code（全局部署）

```bash
# 将 tt-b 配置部署到 ~/.claude/（所有项目生效）
npx --yes github:wsq3172298228-cpu/tt-b-deploy
# 或从本仓库：
node bin/claude-global-deploy.js
```

选项：`--dry-run`、`--restore`、`--delete`、`--verify`、`--list-backups`。

### Codex CLI

```bash
# 为 Codex 安装 tt-b 插件（6 钩子、12 MCP 工具、10 技能）
node bin/tt-b-codex-install.js
```

注册 tt-b 市场、安装插件、并将 MCP 服务器添加到 `~/.codex/config.toml`。

选项：`--remove`、`--status`。

### OpenCode

```bash
# 导入工作流到当前项目（生成 AGENTS.md + opencode.json）
node bin/import-agent-workflow.js .
```

导入器创建 `AGENTS.md`（OpenCode 兼容指令）并在 `opencode.json` 中注册。

### OpenClaw

```bash
# 为 OpenClaw 安装 tt-b MCP 服务器
node bin/tt-b-openclaw-install.js
```

将 tt-b MCP 服务器添加到 `~/.openclaw/openclaw.json`，并复制集成文件到 `~/.openclaw/extensions/tt-b`。

选项：`--remove`、`--status`。

### 通用 MCP（任何支持 MCP 的工具）

在工具的 MCP 服务器配置中添加：

```json
{
  "mcpServers": {
    "tt-b": {
      "command": "node",
      "args": ["/path/to/tt-b/bin/tt-b-mcp-server.js"]
    }
  }
}
```

暴露 4 个资源（记忆文件、契约）和 12 个工具（CRUD、搜索、快照、验证、图谱提取、子图查询）。适用于 Cursor、Windsurf、Continue、Cline 及任何 MCP 兼容客户端。

### 验证安装

安装后验证：

```bash
# 检查生成的文件是否存在
ls .claude/memory/knowledge-graph.md .claude/memory/session-state.md

# 验证辅助脚本
node .claude/bin/model-preflight.js --help
node .claude/bin/tt-b-mcp-server.js --help

# 运行健康检查（如 lifecycle 可用）
node .claude/bin/tt-b-lifecycle.js --help
```

## 架构

```
tt-b/
├── bin/                          # CLI 入口（薄包装器）
│   ├── import-agent-workflow.js  # 一键导入器
│   ├── tt-b-cleanup.js           # 一键清理
│   ├── tt-b-lifecycle.js         # 8 阶段引导编排器
│   ├── tt-b-mcp-server.js        # MCP 服务器（stdio）
│   └── tt-b-rest-server.js       # REST API 服务器
├── functions/                    # 细粒度记忆能力模块
│   ├── index.js                  # 桶导出
│   ├── provider.js               # 文件系统 I/O 抽象
│   ├── config.js                 # 配置加载器
│   ├── read-memory.js            # 按键或路径读取记忆
│   ├── write-memory.js           # 写入记忆
│   ├── list-memory.js            # 列出记忆文件及元数据
│   ├── search-memory.js          # 正则搜索记忆
│   ├── build-index.js            # 构建全文搜索索引
│   ├── search-index.js           # 查询预构建索引
│   ├── snapshot-memory.js        # 时间点快照
│   ├── restore-memory.js         # 从快照恢复
│   ├── diff-memory.js            # 与旧快照对比
│   ├── verify-memory.js          # 过时/占位符检查
│   ├── health-check.js           # 内置健康检查
│   ├── extract-nodes.js          # 知识图谱节点提取
│   ├── extract-edges.js          # 知识图谱边提取
│   ├── graph-store.js            # SQLite 知识图谱存储层
│   └── subgraph-query.js         # 宏观聚合子图查询（BFS）
├── packages/
│   ├── plugin/                   # Claude/Codex 用户体验层
│   │   ├── index.js
│   │   ├── hooks.js              # Claude Code 钩子定义与合并
│   │   ├── preflight.js          # 模型检测（独立）
│   │   └── managed-block.js      # 指令区块合并/移除
│   └── integrations/             # 水平扩展适配器
│       ├── index.js
│       ├── opencode.js           # OpenCode 配置合并/清理
│       ├── mcp.js                # MCP JSON-RPC 2.0 协议处理器
│       ├── rest.js               # REST API 路由定义
│       └── viewer.js             # HTML 仪表盘
├── plugin/                       # 插件分发（钩子、脚本、技能）
│   ├── .claude-plugin/plugin.json
│   ├── .codex-plugin/plugin.json
│   ├── .mcp.json                 # MCP 服务器配置
│   ├── hooks/
│   │   ├── hooks.json            # Claude 钩子（8 种）
│   │   └── hooks.codex.json      # Codex 钩子（6 种）
│   ├── scripts/                  # 薄客户端钩子脚本（.mjs）
│   └── skills/                   # 用户可调用技能（SKILL.md）
├── .claude/bin/
│   ├── model-preflight.js
│   ├── memory-reminder.js
│   ├── memory-compress.js
│   ├── graph-updater.js          # Diff 驱动的增量图谱守护进程
│   └── post-commit-hook.js       # 轻量级 git post-commit 钩子
├── .claude-plugin/marketplace.json
├── .codex-plugin/marketplace.json
└── templates/                    # 干净的导入模板
    ├── claude/
    │   ├── settings.json
    │   └── memory/
    └── opencode/
```

**主包**（`bin/`）— 长期服务生命周期。
**`functions/`** — 细粒度、可独立测试的记忆模块。
**`packages/plugin/`** — Claude/Codex 用户体验（钩子、预检、受管理区块）。
**`packages/integrations/`** — 水平适配器（REST、MCP、OpenCode、查看器）。

## 本仓库包含

- `CLAUDE.md` - 项目级启动和推理契约
- `.claude/bin/model-preflight.js` - 最佳努力宿主/模型/能力检测辅助脚本
- `.claude/bin/memory-reminder.js` - 非阻塞钩子辅助脚本，提醒智能体查阅和更新记忆
- `.claude/bin/memory-compress.js` - 上下文压缩时自动压缩 knowledge-graph.md
- `.claude/bin/graph-updater.js` - Diff 驱动的增量知识图谱守护进程（`--once`、`--watch`、`--dry-run`）
- `.claude/bin/post-commit-hook.js` - 轻量级 git post-commit 钩子，将提交排队用于异步图谱更新
- `.claude/settings.json` - Claude Code 钩子注册，用于启动、恢复、压缩和重要提示提醒
- `functions/` - 16 个细粒度记忆能力模块（提供者、CRUD、搜索、快照、差异、验证、健康检查、图谱提取、子图查询）
- `packages/plugin/` - Claude/Codex 用户体验（钩子、预检、受管理区块）
- `packages/integrations/` - 水平适配器（REST、MCP、OpenCode、查看器）
- `bin/tt-b-lifecycle.js` - 8 阶段引导编排器，使用 functions/ 和 packages/
- `bin/tt-b-mcp-server.js` - MCP 服务器，使用 packages/integrations/mcp
- `bin/tt-b-rest-server.js` - REST API，使用 packages/integrations/rest
- `bin/tt-b-cleanup.js` - 一键清理
- `bin/import-agent-workflow.js` - 一键导入
- `plugin/` - 插件分发（8 个钩子、10 个技能、薄客户端脚本）
- `.claude-plugin/` - Claude Code 市场清单
- `.codex-plugin/` - Codex 市场清单
- `templates/` - 新目标项目的干净导入模板

## 图谱优化

通过两个机制保持知识图谱的实时性和可查询性，且不阻塞开发流程：

### 增量更新（Diff 驱动）

图谱通过轻量级异步管道与代码保持同步：

1. **post-commit 钩子**（`.claude/bin/post-commit-hook.js`）— 每次 `git commit` 时，将 commit hash 写入 `.git/graph_update_queue` 后立即退出（不阻塞）。
2. **图谱更新守护进程**（`.claude/bin/graph-updater.js`）— 消费队列，解析 `git diff`，通过本地启发式提取变更的实体/关系，增量修补 `knowledge-graph.md`。

```bash
# 安装 post-commit 钩子（一次性）
cp .claude/bin/post-commit-hook.js .git/hooks/post-commit && chmod +x .git/hooks/post-commit

# 运行守护进程（三选一）
node .claude/bin/graph-updater.js --once      # 处理队列一次后退出
node .claude/bin/graph-updater.js --watch     # 每 30 秒轮询
node .claude/bin/graph-updater.js --dry-run   # 预览变更但不写入
```

### 宏观聚合查询（子图）

`tt-b_memory_subgraph` MCP 工具在单次调用中完成多跳 BFS 遍历，返回 LLM 友好的结构化文本，避免逐节点遍历导致的工具调用死循环：

```
entity: AuthService
depth: 3
direction: both
```

返回格式化的树状结构，展示 3 跳内的上下游依赖，已过滤为业务相关节点。

## 通用智能体集成

`tt-b` 有意采用文件优先策略。稳定契约是生成的指令和记忆布局，而非某个特定供应商运行时：

- 指令文件：直接读取 `CLAUDE.md`、`AGENTS.md` 和记忆文件
- 钩子：在启动、恢复或用户提示事件期间调用 `.claude/bin/memory-reminder.js`
- MCP：`.claude/bin/tt-b-mcp-server.js` 将记忆文件暴露为 MCP 资源，将辅助脚本暴露为 MCP 工具
- REST API：`.claude/bin/tt-b-rest-server.js` 在 `/preflight`、`/memory/reminder` 和 `/workflow/import` 暴露端点

集成模式：

1. 将工作流安装到目标项目。
2. 让智能体加载 `CLAUDE.md` 或 `AGENTS.md` 作为指令源。
3. 让智能体在执行非简单任务前读取 `.claude/memory/knowledge-graph.md` 和 `.claude/memory/session-state.md`。
4. 调用 `.claude/bin/model-preflight.js` 分类宿主、模型和执行模式。
5. 从钩子、MCP 或 REST 调用 `.claude/bin/memory-reminder.js` 注入非阻塞记忆提醒。
6. 在有意义的验证工作后，更新记忆文件中的稳定事实和当前执行游标。

这意味着项目可以教授一个可移植的智能体工作流，同时让每个运行时选择自己的集成表面。

### 插件系统

`tt-b` 可作为 Claude Code / Codex 插件安装，用于市场发现和自动钩子注册。

**插件结构：**

```
.claude-plugin/marketplace.json   # Claude 市场条目
.codex-plugin/marketplace.json    # Codex 市场条目
plugin/
  .claude-plugin/plugin.json      # Claude 插件清单
  .codex-plugin/plugin.json       # Codex 插件清单
  .mcp.json                       # MCP 服务器配置
  hooks/
    hooks.json                    # Claude 钩子（8 种）
    hooks.codex.json              # Codex 钩子（6 种）
  scripts/
    session-start.mjs             # 薄客户端：注册会话 + 注入上下文
    prompt-submit.mjs             # 薄客户端：捕获用户提示
    pre-tool-use.mjs              # 薄客户端：为文件操作丰富上下文
    post-tool-use.mjs             # 薄客户端：捕获工具输出
    pre-compact.mjs               # 薄客户端：压缩前注入上下文
    stop.mjs                      # 薄客户端：更新会话游标
    subagent-start.mjs            # 薄客户端：记录子智能体启动
    subagent-stop.mjs             # 薄客户端：记录子智能体完成
  skills/
    remember/SKILL.md             # 保存洞察到记忆
    recall/SKILL.md               # 搜索记忆
    forget/SKILL.md               # 从记忆中删除（需确认）
    session-history/SKILL.md      # 显示执行游标
    snapshot/SKILL.md             # 快照所有记忆文件
    verify/SKILL.md               # 检查记忆健康和过时情况
    preflight/SKILL.md            # 检测宿主、模型、能力层级
    graph/SKILL.md                # 显示知识图谱节点和边
    memories/SKILL.md             # 列出记忆文件及元数据
```

**钩子类型（Claude: 8 种, Codex: 6 种）：**

| 钩子 | 脚本 | 描述 |
|------|------|------|
| `SessionStart` | `session-start.mjs` | 注册会话，可选注入记忆上下文 |
| `UserPromptSubmit` | `prompt-submit.mjs` | 捕获用户提示作为观察 |
| `PreToolUse` | `pre-tool-use.mjs` | 为 Edit/Write/Read 工具丰富上下文 |
| `PostToolUse` | `post-tool-use.mjs` | 捕获工具输出作为观察 |
| `PreCompact` | `pre-compact.mjs` | 压缩前注入上下文 |
| `SubagentStart` | `subagent-start.mjs` | 记录子智能体启动事件 |
| `SubagentStop` | `subagent-stop.mjs` | 记录子智能体完成 |
| `Stop` | `stop.mjs` | 触发会话游标更新 |

所有钩子脚本都是薄客户端：读取 stdin JSON 并 POST 到 tt-b REST 服务器。包含递归保护（`isSdkChildContext`）以防止 SDK 子会话中的钩子循环。

**技能（10 个用户可调用命令）：**

| 技能 | 描述 |
|------|------|
| `/remember` | 保存洞察、决策或事实到知识图谱记忆 |
| `/recall` | 搜索项目记忆中的过往决策和上下文 |
| `/forget` | 移除特定记忆条目（需确认） |
| `/session-history` | 显示当前执行游标和会话状态 |
| `/snapshot` | 对所有记忆文件创建时间点快照 |
| `/verify` | 检查记忆中的过时、占位符和不一致 |
| `/preflight` | 检测当前宿主 CLI、模型和能力层级 |
| `/graph` | 显示知识图谱——所有节点和边 |
| `/memories` | 列出所有记忆文件及元数据（大小、修改时间、条目数） |

**钩子脚本环境变量：**

- `TTB_REST_URL` — REST 服务器 URL（默认：`http://localhost:3742`）
- `TTB_INJECT_CONTEXT` — 设为 `true` 在会话启动和压缩前注入记忆上下文
- `TTB_SDK_CHILD` — 设为 `1` 跳过钩子（递归保护）

### MCP 服务器

MCP 服务器使用 MCP JSON-RPC 2.0 协议通过 stdio 通信。

资源：

| URI | 描述 |
|-----|------|
| `tt-b://memory/knowledge-graph` | 长期项目记忆 |
| `tt-b://memory/session-state` | 短期执行游标 |
| `tt-b://contract/claude-md` | CLAUDE.md 启动契约 |
| `tt-b://contract/agents-md` | AGENTS.md 指令 |

工具：

| 工具 | 描述 |
|------|------|
| `tt-b_preflight` | 检测宿主、模型、能力层级和启动模式 |
| `tt-b_memory_list` | 列出所有记忆文件及元数据 |
| `tt-b_memory_read` | 按名称或路径读取记忆文件 |
| `tt-b_memory_write` | 写入或更新记忆文件 |
| `tt-b_memory_search` | 正则搜索记忆文件 |
| `tt-b_memory_snapshot` | 对所有记忆文件创建时间点快照 |
| `tt-b_memory_diff` | 对比记忆文件与旧内容 |
| `tt-b_memory_restore` | 从快照恢复记忆 |
| `tt-b_memory_verify` | 验证记忆文件的过时和占位符 |
| `tt-b_memory_nodes` | 提取所有知识图谱节点 |
| `tt-b_memory_edges` | 提取所有知识图谱边 |
| `tt-b_memory_subgraph` | 获取依赖子图（上下游 N 跳，LLM 友好文本格式） |

与 Claude Code 或任何 MCP 客户端一起使用：

```bash
node .claude/bin/tt-b-mcp-server.js
```

设置 `TTB_PROJECT_ROOT` 可覆盖项目根目录。

### REST API 服务器

REST API 服务器使用 Node.js 内置 `http` 模块，无外部依赖。

```bash
node .claude/bin/tt-b-rest-server.js
```

端点：

| 方法 | 路径 | 描述 |
|------|------|------|
| `GET` | `/health` | 健康检查 |
| `GET` | `/preflight` | 模型预检（查询：`host`、`model`） |
| `POST` | `/memory/reminder` | 记忆提醒（请求体：`{event?, prompt?, source?}`） |
| `POST` | `/workflow/import` | 导入工作流（请求体：`{targetDir, force?, dryRun?}`） |
| `GET` | `/memory/list` | 列出记忆文件 |
| `GET` | `/memory/read` | 读取记忆（查询：`name`） |
| `POST` | `/memory/search` | 搜索记忆（请求体：`{pattern}`） |
| `GET` | `/memory/snapshot` | 快照所有记忆 |
| `POST` | `/memory/restore` | 从快照恢复 |
| `GET` | `/memory/verify` | 验证过时情况 |
| `GET` | `/memory/nodes` | 知识图谱节点 |
| `GET` | `/memory/edges` | 知识图谱边 |
| `POST` | `/memory/diff` | 对比记忆（请求体：`{name, oldContent}`） |
| `POST` | `/memory/write` | 写入记忆（请求体：`{name, content}`） |
| `POST` | `/memory/observe` | 钩子事件摄入 |

配置：

- `TTB_REST_PORT` — 监听端口（默认：`3742`）
- `TTB_PROJECT_ROOT` — 项目根目录（默认：当前目录）
- `TTB_REST_URL` — 钩子脚本的 REST 服务器 URL（默认：`http://localhost:{port}`）

示例：

```bash
curl http://localhost:3742/preflight?host=codex&model=gpt-5.5
curl -X POST http://localhost:3742/memory/reminder -H "Content-Type: application/json" -d '{"source":"startup"}'
```

### 生命周期引导

生命周期钩子是一个完整的应用引导编排器，运行 8 个顺序阶段：

```bash
node .claude/bin/tt-b-lifecycle.js
```

阶段：

| # | 阶段 | 描述 |
|---|------|------|
| 1 | 加载配置 | 读取环境变量、CLI 参数、默认值 |
| 2 | 初始化提供者 | 创建记忆文件读/写/搜索抽象 |
| 3 | 注册记忆函数 | 读、写、搜索、差异、快照、恢复、验证、节点、边 |
| 4 | 注册 REST 端点 | 所有记忆 + 预检 + 导入 + 生命周期端点 |
| 5 | 注册 MCP 端点 | 记忆函数的 MCP 工具（默认关闭，使用 `--mcp`） |
| 6 | 启动查看器 | HTML 仪表盘在 `:3743`，提供实时健康、记忆和图谱统计 |
| 7 | 初始化健康检查 | 4 个内置检查：记忆文件、辅助脚本、过时、语法 |
| 8 | 初始化搜索索引 | 标题、节点、路径和词的全文索引 |

选项：

```bash
--port PORT          REST API 端口（默认：3742）
--viewer-port PORT   查看器仪表盘端口（默认：3743）
--no-viewer          禁用查看器仪表盘
--no-rest            禁用 REST API
--mcp                启用 MCP 服务器（stdio）
```

附加端点（独立 REST 服务器之外）：

| 方法 | 路径 | 描述 |
|------|------|------|
| `GET` | `/lifecycle/status` | 所有 8 个阶段结果及耗时 |
| `GET` | `/health/detailed` | 4 个内置健康检查（按需执行，无后台工作线程） |
| `POST` | `/search` | 全文搜索（请求体：`{query}`） |
| `GET` | `/search/stats` | 搜索索引统计（文件、词项、按类型） |

查看器仪表盘在 `http://localhost:3743` 提供实时 HTML 界面，显示健康状态、记忆文件元数据、知识图谱节点/边计数，以及验证、快照和搜索的按钮。

## 启动流程

1. 检测当前 CLI 宿主。
2. 检测有效模型。
3. 将模型分类到能力层级。
4. 读取 `CLAUDE.md`。
5. 恢复 `.claude/memory/knowledge-graph.md` 和 `.claude/memory/session-state.md`。
6. 对照真实文件验证重要记忆声明。
7. 规划、执行、测试，并在有意义的工作后更新记忆。

## 记忆提醒钩子

导入的项目包含非阻塞 Claude Code 钩子提醒。钩子在 `SessionStart` 和重要 `UserPromptSubmit` 事件上运行，然后注入咨询上下文，提醒智能体：

- 浏览 `.claude/memory/knowledge-graph.md` 和 `.claude/memory/session-state.md`
- 将记忆视为地图而非事实来源
- 在编辑前对照真实文件验证重要声明
- 在有意义的工作后更新稳定事实和当前执行游标

提醒是有意设计为软性的。不会阻塞提示，简单提示可以忽略它。

## 记忆自动压缩

导入的项目包含自动压缩钩子，当 Claude Code 触发上下文压缩事件时运行。该钩子：

1. 检查 `knowledge-graph.md` 是否超过 600 行。
2. 创建带时间戳的备份（如 `knowledge-graph.backup.2026-05-26.md`）。
3. 去除重复边、折叠空段落、归档冷区边块进行压缩。
4. 注入压缩报告作为咨询上下文。

备份确保压缩丢失重要细节时可以回滚。

配置：钩子注册在 `.claude/settings.json` 的 `SessionStart` 中，使用 `compact` 匹配器。压缩脚本位于 `.claude/bin/memory-compress.js`。

## 图谱增量更新（Git 钩子）

项目包含一个基于 diff 的图谱更新器，保持知识图谱与代码变更同步。采用两部分架构：

1. **post-commit 钩子**（`.claude/bin/post-commit-hook.js`）— 轻量级，运行时间 <1ms。将 commit hash 写入 `.git/graph_update_queue` 后立即退出。不阻塞 git 操作。

2. **图谱更新守护进程**（`.claude/bin/graph-updater.js`）— 读取队列，使用本地启发式从 `git diff` 中提取变更实体，并带时间戳备份地修补 `knowledge-graph.md`。

用法：

```bash
# 安装 git 钩子
echo 'node .claude/bin/post-commit-hook.js' > .git/hooks/post-commit
chmod +x .git/hooks/post-commit

# 处理队列中的提交（单次执行）
node .claude/bin/graph-updater.js --once

# 作为后台守护进程运行（每 5 秒轮询）
node .claude/bin/graph-updater.js --watch

# 预览变更但不写入
node .claude/bin/graph-updater.js --dry-run
```

## 子图查询（MCP 工具）

`tt-b_memory_subgraph` MCP 工具在单次调用中提供宏观级依赖分析，避免逐节点遍历的"死循环"。

```json
{
  "name": "tt-b_memory_subgraph",
  "arguments": {
    "entity": "importer",
    "depth": 3,
    "direction": "both"
  }
}
```

返回 LLM 友好的结构化文本，显示指定跳数内的上下游依赖。深度上限为 5，防止上下文爆炸。

## 模型检测

辅助脚本遵循以下优先级：

1. CLI 参数如 `--model`、`-m` 或 `-c model="..."`
2. 环境变量如 `AI_MODEL`、`MODEL`、`CLAUDE_MODEL`、`CODEX_MODEL`、`OPENCODE_MODEL`
3. 宿主特定配置文件
4. `unknown`

示例：

```bash
node .claude/bin/model-preflight.js --host codex --model gpt-5.5
```

文本输出：

```bash
宿主: codex
模型: gpt-5.5
来源: cli-arg
能力: architect_orchestrator
启动模式: restore-plan-delegate-verify-update-memory
```

## 能力层级

- `architect_orchestrator` - 高层规划、风险审查、知识图谱更新、任务分解
- `engineering_executor` - 代码读取、编辑、测试、重构、失败修复
- `reader_or_tester` - 有界只读调查或定向验证
- `unknown` - 仅安全探测

## 项目记忆

本仓库将记忆视为图谱，而非日记。

- 稳定事实属于 `.claude/memory/knowledge-graph.md`
- 当前任务状态属于 `.claude/memory/session-state.md`
- 代码证据优先于记忆
- 当代码与记忆矛盾时必须纠正过时假设

## 验证

本工作区文档密集，不附带应用测试套件。导入器和辅助脚本仍可本地检查：

```bash
node --check bin/import-agent-workflow.js
node --check .claude/bin/model-preflight.js
node --check .claude/bin/memory-reminder.js
node --check .claude/bin/memory-compress.js
./.claude/bin/model-preflight.js --host codex --model gpt-5.5 --text
```

## 仓库状态

本项目有意保持小型且专注。主要目标是为智能体工作提供可复用的启动模式，而非面向用户的应用。

## 备注

- 规范记忆位于 `.claude/memory/` 下。
- 兼容性镜像文件仅为兼容性保留。
- 如果本工作区后续嵌入到更大的项目中，请保持启动契约和记忆布局不变。
