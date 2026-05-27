# tt-b 深度讲解系列

## 第一篇：项目总览 — 为什么需要 Agent 记忆系统？

> 介绍：tt-b 是一个模型感知的 Agent 工作流工具包，为 AI 编程助手提供持久化记忆、知识图谱、MCP/REST 接口和多平台插件支持。

### tt-b 项目概览

这是一个模型感知的 Agent 工作流工具包，核心用途是为 AI 编程助手提供持久化记忆系统。

### 核心功能

| 功能 | 说明 |
|------|------|
| 记忆系统 | knowledge-graph.md (长期) + session-state.md (短期) |
| SQLite 知识图谱 | graph_memory.db 存储节点、边、提交记录 |
| 模型检测 | 自动识别 host、model、能力等级 |
| 增量图更新 | git hook → 队列 → 异步同步知识图谱 |
| MCP 服务器 | 12 个工具，支持任何 MCP 客户端 |
| REST API | HTTP 接口，端口 3742 |
| 插件系统 | 支持 Claude Code、Codex、OpenCode |

### 支持的平台

- Claude Code — 插件或 npx 一键导入
- Codex CLI — 插件安装
- OpenCode — 生成 AGENTS.md + opencode.json
- OpenClaw — MCP 服务器集成
- 通用 MCP — Cursor、Windsurf、Continue、Cline 等

### 使用方式

```bash
# 一键导入到目标项目
node bin/import-agent-workflow.js /path/to/target

# 或从 GitHub 直接安装
npx --yes github:wsq3172298228-cpu/tt-b .

# 清理
node bin/tt-b-cleanup.js /path/to/target

# 验证图谱
node .claude/bin/graph-updater.js --verify

# 启动 MCP 服务器
node .claude/bin/tt-b-mcp-server.js

# 启动 REST + 可视化面板
node .claude/bin/tt-b-lifecycle.js
```

### 当前 SQLite 状态

- 102 个节点 (Symbol 32, Module 16, API 20, File 13, Test 10, ...)
- 112 条边
- 通过 git post-commit hook 自动更新

> 下一篇将深入讲解：**它解决了什么问题，架构如何设计，以及各组件如何协作。**

---

## 第二篇：核心问题 — Agent 的"失忆症"

### 2.1 痛点

当你使用 Claude Code、Codex 或其他 AI 编程助手时，会遇到一个根本性问题：

**每次新会话，Agent 都是从零开始的。**

它不知道：
- 上次会话做了什么决策
- 项目中哪些模块有已知风险
- 哪些架构选型已经讨论并否决过
- 当前任务的进度和阻塞点

这导致：
- 重复讨论相同的问题
- 做出与之前矛盾的决策
- 无法追踪跨会话的复杂任务
- 每次都要重新解释项目背景

### 2.2 tt-b 的解法

tt-b 通过**文件优先的记忆系统**解决这个问题：

```
.claude/memory/
├── knowledge-graph.md    # 长期记忆：稳定的项目事实
├── session-state.md      # 短期记忆：当前任务状态
└── graph_memory.db       # SQLite 结构化存储：节点、边、关系
```

**关键设计原则：**

1. **文件优先** — 记忆存储为普通文件，不依赖外部数据库服务
2. **图谱思维** — 不是日记，而是实体+关系的知识图谱
3. **代码为真** — 记忆是地图，代码才是真相；矛盾时以代码为准
4. **增量更新** — 通过 git hook 自动同步，无需手动维护

---

## 第三篇：架构解析 — 四层设计

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────┐
│                   用户 / Agent                        │
├─────────────────────────────────────────────────────┤
│  Skills 层 (14 个用户命令)                            │
│  /remember  /recall  /forget  /verify  /graph ...    │
├─────────────────────────────────────────────────────┤
│  接入层 (多平台适配)                                   │
│  Claude Code │ Codex │ OpenCode │ MCP │ REST API     │
├─────────────────────────────────────────────────────┤
│  核心层 (16 个功能模块)                                │
│  provider │ CRUD │ search │ snapshot │ graph-store   │
├─────────────────────────────────────────────────────┤
│  存储层                                               │
│  knowledge-graph.md │ session-state.md │ SQLite DB   │
└─────────────────────────────────────────────────────┘
```

### 3.2 各层职责

**存储层** — 数据持久化
- `knowledge-graph.md`：人类可读的长期记忆，Markdown 格式
- `session-state.md`：当前会话的执行光标（任务进度、已检查文件、下一步操作）
- `graph_memory.db`：SQLite 结构化存储，支持高效查询

**核心层** — 16 个功能模块

| 模块 | 职责 |
|------|------|
| `provider.js` | 文件系统 I/O 抽象 |
| `config.js` | 配置加载 |
| `read-memory.js` | 按 key 或路径读取记忆 |
| `write-memory.js` | 写入记忆 |
| `list-memory.js` | 列出记忆文件及元数据 |
| `search-memory.js` | 正则搜索记忆内容 |
| `build-index.js` | 构建全文搜索索引 |
| `search-index.js` | 查询预建索引 |
| `snapshot-memory.js` | 创建时间点快照 |
| `restore-memory.js` | 从快照恢复 |
| `diff-memory.js` | 与旧快照对比差异 |
| `verify-memory.js` | 检查过期/占位符 |
| `health-check.js` | 健康检查 |
| `extract-nodes.js` | 提取知识图谱节点 |
| `extract-edges.js` | 提取知识图谱边 |
| `graph-store.js` | SQLite 知识图谱存储层 |
| `subgraph-query.js` | BFS 子图查询 |

**接入层** — 多平台适配
- Claude Code：hooks + 插件系统
- Codex：hooks + MCP
- OpenCode：`AGENTS.md` + `opencode.json`
- 通用：MCP 服务器 + REST API

**Skills 层** — 用户可调用的命令
- `/remember` — 保存洞察到记忆
- `/recall` — 搜索记忆
- `/forget` — 删除记忆（需确认）
- `/verify` — 检查记忆健康
- `/graph` — 查看知识图谱
- 等等...

---

## 第四篇：SQLite 知识图谱 — 结构化记忆

### 4.1 数据模型

```sql
-- 节点：代表项目中的实体
CREATE TABLE nodes (
    id TEXT PRIMARY KEY,          -- 唯一标识 (如 "Module:AuthService")
    name TEXT NOT NULL,           -- 名称
    type TEXT NOT NULL,           -- 类型 (Domain/Module/File/Symbol/API/Test/...)
    file_path TEXT,               -- 关联文件路径
    metadata TEXT,                -- JSON 元数据
    stale_since TEXT,             -- 标记为过期的时间
    stale_reason TEXT,            -- 过期原因
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 边：代表实体间的关系
CREATE TABLE edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id TEXT NOT NULL REFERENCES nodes(id),
    to_id TEXT NOT NULL REFERENCES nodes(id),
    relation TEXT NOT NULL,       -- 关系类型 (owns/imports/calls/depends_on/...)
    metadata TEXT
);

-- 提交：记录 git 提交历史
CREATE TABLE commits (
    hash TEXT PRIMARY KEY,
    message TEXT,
    timestamp TEXT NOT NULL,
    added INTEGER DEFAULT 0,
    modified INTEGER DEFAULT 0,
    removed INTEGER DEFAULT 0
);
```

### 4.2 节点类型

| 类型 | 含义 | 示例 |
|------|------|------|
| `Domain` | 业务领域 | "认证"、"支付" |
| `Feature` | 功能特性 | "用户注册"、"订单管理" |
| `Module` | 代码模块 | "auth-service"、"db-layer" |
| `File` | 源文件 | "src/auth.js" |
| `Symbol` | 函数/类 | "validateToken"、"UserModel" |
| `API` | 接口端点 | "POST /api/login" |
| `DataModel` | 数据模型 | "User"、"Order" |
| `DatabaseTable` | 数据库表 | "users"、"orders" |
| `ExternalService` | 外部服务 | "Stripe"、"SendGrid" |
| `Test` | 测试用例 | "test-auth-flow" |
| `Risk` | 已知风险 | "并发锁竞争" |
| `Decision` | 架构决策 | "选用 JWT 而非 Session" |
| `TODO` | 待办事项 | "优化查询性能" |

### 4.3 关系类型

| 关系 | 含义 | 示例 |
|------|------|------|
| `owns` | 拥有 | Domain → Feature |
| `imports` | 导入 | File → Module |
| `calls` | 调用 | Symbol → API |
| `reads` | 读取 | API → DatabaseTable |
| `writes` | 写入 | API → DatabaseTable |
| `validates` | 验证 | Symbol → DataModel |
| `depends_on` | 依赖 | Module → ExternalService |
| `tested_by` | 被测试 | Feature → Test |
| `mitigates` | 缓解 | Decision → Risk |

### 4.4 当前数据

```
节点分布:
  Symbol:        32
  API:           20
  Module:        16
  File:          13
  Test:          10
  ExternalService: 4
  Feature:        4
  Domain:         3
  ─────────────────
  总计:         102 节点, 112 条边
```

---

## 第五篇：增量更新 — Git Hook 自动同步

### 5.1 工作流

```
git commit
    │
    ▼
post-commit hook (post-commit-hook.js)
    │  写入 commit hash 到队列文件
    │  耗时 < 1ms，不阻塞 git
    ▼
.git/graph_update_queue
    │
    ▼
graph-updater daemon (graph-updater.js)
    │  读取队列
    │  执行 git diff 解析
    │  提取变更的实体和关系
    │  应用补丁到 knowledge-graph.md
    │  双写到 SQLite
    │  运行 GC 清理过期节点
    ▼
knowledge-graph.md + graph_memory.db 更新完成
```

### 5.2 使用方式

```bash
# 安装 git hook（一次性）
cp .claude/bin/post-commit-hook.js .git/hooks/post-commit
chmod +x .git/hooks/post-commit

# 处理队列（一次性）
node .claude/bin/graph-updater.js --once

# 守护进程模式（每 5 秒轮询）
node .claude/bin/graph-updater.js --watch

# 预览变更（不写入）
node .claude/bin/graph-updater.js --dry-run

# 验证图谱一致性
node .claude/bin/graph-updater.js --verify

# 清理过期节点
node .claude/bin/graph-updater.js --gc
```

### 5.3 提取逻辑

`graph-updater.js` 使用**本地启发式规则**（不依赖 LLM）从 git diff 中提取变更：

1. **文件级变更** — 通过 `git diff --stat` 解析新增/修改/删除的文件
2. **符号级变更** — 从代码 diff 中提取函数声明、类定义、模块导出
3. **生成补丁** — 将变更转换为 `{ added, modified, removed }` 结构
4. **应用补丁** — 更新 `knowledge-graph.md` 和 SQLite

---

## 第六篇：MCP 服务器 — 标准化接口

### 6.1 什么是 MCP？

MCP（Model Context Protocol）是一个标准化协议，让 AI 工具能够调用外部能力。tt-b 通过 MCP 暴露其记忆系统，支持任何 MCP 兼容客户端。

### 6.2 启动

```bash
node .claude/bin/tt-b-mcp-server.js
```

### 6.3 暴露的资源

| URI | 描述 |
|-----|------|
| `tt-b://memory/knowledge-graph` | 长期项目记忆 |
| `tt-b://memory/session-state` | 短期执行光标 |
| `tt-b://contract/claude-md` | CLAUDE.md 启动合约 |
| `tt-b://contract/agents-md` | AGENTS.md 指令 |

### 6.4 暴露的工具

| 工具 | 描述 |
|------|------|
| `tt-b_preflight` | 检测 host、model、能力等级 |
| `tt-b_memory_list` | 列出所有记忆文件 |
| `tt-b_memory_read` | 读取记忆文件 |
| `tt-b_memory_write` | 写入记忆文件 |
| `tt-b_memory_search` | 正则搜索记忆 |
| `tt-b_memory_snapshot` | 创建快照 |
| `tt-b_memory_diff` | 对比差异 |
| `tt-b_memory_restore` | 从快照恢复 |
| `tt-b_memory_verify` | 验证记忆健康 |
| `tt-b_memory_nodes` | 提取知识图谱节点 |
| `tt-b_memory_edges` | 提取知识图谱边 |
| `tt-b_memory_subgraph` | BFS 子图查询（多跳依赖分析） |

### 6.5 子图查询示例

```json
{
  "name": "tt-b_memory_subgraph",
  "arguments": {
    "entity": "AuthService",
    "depth": 3,
    "direction": "both"
  }
}
```

返回格式化的依赖树，展示 3 跳范围内的上下游依赖关系。

---

## 第七篇：REST API — HTTP 接口

### 7.1 启动

```bash
node .claude/bin/tt-b-rest-server.js
# 默认端口 3742
```

### 7.2 端点列表

| 方法 | 路径 | 描述 |
|------|------|------|
| `GET` | `/health` | 健康检查 |
| `GET` | `/preflight` | 模型预检 |
| `POST` | `/memory/reminder` | 记忆提醒 |
| `POST` | `/workflow/import` | 导入工作流 |
| `GET` | `/memory/list` | 列出记忆文件 |
| `GET` | `/memory/read` | 读取记忆 |
| `POST` | `/memory/search` | 搜索记忆 |
| `GET` | `/memory/snapshot` | 创建快照 |
| `POST` | `/memory/restore` | 恢复快照 |
| `GET` | `/memory/verify` | 验证记忆 |
| `GET` | `/memory/nodes` | 知识图谱节点 |
| `GET` | `/memory/edges` | 知识图谱边 |
| `POST` | `/memory/diff` | 对比差异 |
| `POST` | `/memory/write` | 写入记忆 |
| `POST` | `/memory/observe` | Hook 事件采集 |

### 7.3 使用示例

```bash
# 健康检查
curl http://localhost:3742/health

# 模型预检
curl "http://localhost:3742/preflight?host=codex&model=gpt-5.5"

# 触发记忆提醒
curl -X POST http://localhost:3742/memory/reminder \
  -H "Content-Type: application/json" \
  -d '{"source":"startup"}'

# 搜索记忆
curl -X POST http://localhost:3742/memory/search \
  -H "Content-Type: application/json" \
  -d '{"pattern":"AuthService"}'

# 获取知识图谱节点
curl http://localhost:3742/memory/nodes
```

---

## 第八篇：插件系统 — 一键集成

### 8.1 Claude Code 插件

```bash
# 从 marketplace 安装
/plugin marketplace add wsq3172298228-cpu/tt-b
/plugin install tt-b
```

安装后自动获得：
- 8 个 hooks（SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PreCompact, SubagentStart, SubagentStop, Stop）
- 10 个 skills（/remember, /recall, /forget, /verify, /preflight, /graph, /memories, /session-history, /snapshot, /grill-me）
- MCP 服务器自动配置

### 8.2 Codex CLI 插件

```bash
node bin/tt-b-codex-install.js
```

### 8.3 一键导入（任意项目）

```bash
# 从本仓库导入
node bin/import-agent-workflow.js /path/to/target

# 从 GitHub 导入
npx --yes github:wsq3172298228-cpu/tt-b /path/to/target

# 预览（不写入）
node bin/import-agent-workflow.js /path/to/target --dry-run

# 强制覆盖
node bin/import-agent-workflow.js /path/to/target --force
```

### 8.4 一键清理

```bash
node bin/tt-b-cleanup.js /path/to/target
```

---

## 第九篇：生命周期引导 — 完整启动流程

### 9.1 启动

```bash
node .claude/bin/tt-b-lifecycle.js
```

### 9.2 八个阶段

| 阶段 | 名称 | 描述 |
|------|------|------|
| 1 | 加载配置 | 读取环境变量、CLI 参数、默认值 |
| 2 | 初始化 Provider | 创建文件系统 I/O 抽象 |
| 3 | 注册记忆函数 | read, write, search, diff, snapshot, restore, verify, nodes, edges |
| 4 | 注册 REST 端点 | 所有记忆 + preflight + import + lifecycle 端点 |
| 5 | 注册 MCP 端点 | MCP 工具（默认关闭，用 `--mcp` 启用） |
| 6 | 启动 Viewer | HTML 面板，端口 3743 |
| 7 | 初始化健康检查 | 4 项内置检查 |
| 8 | 初始化搜索索引 | 全文索引（标题、节点、路径、单词） |

### 9.3 选项

```bash
--port PORT          REST API 端口（默认 3742）
--viewer-port PORT   Viewer 面板端口（默认 3743）
--no-viewer          禁用 Viewer
--no-rest            禁用 REST API
--mcp                启用 MCP 服务器
```

### 9.4 Viewer 面板

访问 `http://localhost:3743` 可以看到：
- 健康状态
- 记忆文件元数据
- 知识图谱节点/边统计
- 验证、快照、搜索按钮

---

## 第十篇：模型检测 — 智能执行模式

### 10.1 能力等级

| 等级 | 适用场景 | 行为模式 |
|------|----------|----------|
| `architect_orchestrator` | 高级规划、风险审查、知识图谱更新 | 读取记忆 → 验证 → 规划 → 委派 → 审查 → 更新记忆 |
| `engineering_executor` | 代码阅读、编辑、测试、重构 | 读取任务 → 编辑 → 测试 → 报告 |
| `reader_or_tester` | 有界只读调查或定向验证 | 只读检查 → 报告 |
| `unknown` | 安全探测 | 只读，不做假设 |

### 10.2 检测优先级

1. CLI 参数（`--model`, `-m`, `-c model="..."`）
2. 环境变量（`AI_MODEL`, `MODEL`, `CLAUDE_MODEL`, `CODEX_MODEL`）
3. Host 特定配置文件
4. 回退到 `unknown`

### 10.3 使用

```bash
node .claude/bin/model-preflight.js --host codex --model gpt-5.5 --text

# 输出:
# Host: codex
# Model: gpt-5.5
# Source: cli-arg
# Capability: architect_orchestrator
# Startup mode: restore-plan-delegate-verify-update-memory
```

---

## 第十一篇：Hooks 系统 — 自动化行为

### 11.1 Claude Code Hooks（8 种）

| Hook | 触发时机 | 脚本 | 作用 |
|------|----------|------|------|
| `SessionStart` | 会话开始 | `session-start.mjs` | 注册会话，注入记忆上下文 |
| `UserPromptSubmit` | 用户提交 prompt | `prompt-submit.mjs` | 捕获用户输入作为观察 |
| `PreToolUse` | 工具调用前 | `pre-tool-use.mjs` | 为 Edit/Write/Read 丰富上下文 |
| `PostToolUse` | 工具调用后 | `post-tool-use.mjs` | 捕获工具输出作为观察 |
| `PreCompact` | 上下文压缩前 | `pre-compact.mjs` | 压缩前注入上下文 |
| `SubagentStart` | 子 Agent 启动 | `subagent-start.mjs` | 记录子 Agent 启动事件 |
| `SubagentStop` | 子 Agent 结束 | `subagent-stop.mjs` | 记录子 Agent 完成 |
| `Stop` | 会话结束 | `stop.mjs` | 触发会话光标更新 |

### 11.2 Hook 脚本特点

- **瘦客户端** — 只读 stdin JSON，POST 到 REST 服务器
- **递归保护** — `isSdkChildContext` 防止 SDK 子会话中的 hook 循环
- **非阻塞** — 不影响正常工作流

### 11.3 环境变量

| 变量 | 描述 |
|------|------|
| `TTB_REST_URL` | REST 服务器 URL（默认 `http://localhost:3742`） |
| `TTB_INJECT_CONTEXT` | 设为 `true` 在会话启动和压缩前注入记忆上下文 |
| `TTB_SDK_CHILD` | 设为 `1` 跳过 hooks（递归保护） |

---

## 第十二篇：Skills — 用户命令

### 12.1 可用 Skills

| Skill | 描述 | 使用场景 |
|-------|------|----------|
| `/remember` | 保存洞察到记忆 | 发现重要决策、风险、模式时 |
| `/recall` | 搜索记忆 | 需要查找过去的决策或上下文时 |
| `/forget` | 删除记忆（需确认） | 记忆过期或错误时 |
| `/session-history` | 显示执行光标 | 了解当前任务进度时 |
| `/snapshot` | 创建快照 | 重大变更前备份记忆 |
| `/verify` | 验证记忆健康 | 检查过期、占位符、不一致 |
| `/preflight` | 检测 host/model/能力 | 了解当前运行环境 |
| `/graph` | 查看知识图谱 | 可视化项目结构和关系 |
| `/memories` | 列出记忆文件 | 查看所有记忆文件及元数据 |
| `/grill-me` | 访谈式目标澄清 | 与 Agent 深入讨论目标和计划 |

### 12.2 使用示例

```
# 保存一个架构决策
/remember 我们决定使用 JWT 而非 Session，因为需要支持移动端无状态认证

# 搜索过去的决策
/recall JWT

# 检查记忆健康
/verify

# 查看知识图谱
/graph

# 澄清目标
/grill-me 我想重构认证模块
```

---

## 第十三篇：最佳实践

### 13.1 记忆管理

1. **定期验证** — 使用 `/verify` 检查记忆是否过期
2. **快照备份** — 重大变更前使用 `/snapshot`
3. **清理过期** — 使用 `/forget` 或 `graph-updater.js --gc` 清理过期节点
4. **以代码为准** — 记忆与代码矛盾时，更新记忆而非代码

### 13.2 知识图谱维护

1. **安装 git hook** — 让图谱自动同步
2. **定期 GC** — 运行 `graph-updater.js --gc` 清理过期节点
3. **验证一致性** — 运行 `graph-updater.js --verify` 检查悬挂边和缺失文件
4. **子图查询** — 使用 `tt-b_memory_subgraph` 进行多跳依赖分析

### 13.3 多平台集成

1. **统一入口** — 使用 MCP 服务器作为统一接口
2. **REST 备选** — 不支持 MCP 的工具可用 REST API
3. **文件兜底** — 直接读写 `.claude/memory/` 文件

### 13.4 团队协作

1. **提交记忆文件** — `knowledge-graph.md` 和 `session-state.md` 应纳入版本控制
2. **合并冲突** — 记忆文件的冲突通常可以自动合并（追加式结构）
3. **共享知识图谱** — SQLite 数据库也可以提交，但要注意二进制文件冲突

---

## 第十四篇：常见问题

### Q: 记忆文件会无限增长吗？

A: 不会。`graph-updater.js --gc` 会清理过期节点，`memory-compress.js` 会在上下文压缩时自动清理重复边和空段落。

### Q: SQLite 和 Markdown 记忆的关系是什么？

A: 双写机制。变更同时写入 `knowledge-graph.md`（人类可读）和 `graph_memory.db`（结构化查询）。Markdown 是主要存储，SQLite 是查询优化层。

### Q: 如何在多个项目间共享记忆？

A: 每个项目有独立的记忆目录。跨项目共享需要手动复制或使用全局部署（`node bin/claude-global-deploy.js`）。

### Q: 安全性如何保障？

A: 记忆文件存储在本地，不上传到外部服务。MCP 服务器和 REST API 只监听 localhost。Hook 脚本有递归保护防止无限循环。

### Q: 性能影响大吗？

A: 很小。git hook 耗时 < 1ms，graph-updater 是异步运行的。SQLite 查询是本地操作，无网络开销。

---

## 附录：快速参考

### 命令速查

```bash
# 导入
node bin/import-agent-workflow.js /path/to/target

# 清理
node bin/tt-b-cleanup.js /path/to/target

# 图谱管理
node .claude/bin/graph-updater.js --once      # 处理队列
node .claude/bin/graph-updater.js --watch     # 守护进程
node .claude/bin/graph-updater.js --verify    # 验证一致性
node .claude/bin/graph-updater.js --gc        # 清理过期
node .claude/bin/graph-updater.js --dry-run   # 预览变更

# 服务器
node .claude/bin/tt-b-mcp-server.js           # MCP 服务器
node .claude/bin/tt-b-rest-server.js          # REST API
node .claude/bin/tt-b-lifecycle.js            # 完整生命周期

# 检测
node .claude/bin/model-preflight.js --text    # 模型预检

# Skills
/remember  /recall  /forget  /verify  /graph
/memories  /session-history  /snapshot  /preflight  /grill-me
```

### 文件结构速查

```
.claude/
├── bin/
│   ├── model-preflight.js      # 模型检测
│   ├── memory-reminder.js      # 记忆提醒
│   ├── memory-compress.js      # 记忆压缩
│   ├── graph-updater.js        # 图谱更新
│   └── post-commit-hook.js     # git hook
├── memory/
│   ├── knowledge-graph.md      # 长期记忆
│   ├── session-state.md        # 短期记忆
│   └── graph_memory.db         # SQLite 数据库
├── settings.json               # Claude Code 配置
└── functions/
    ├── graph-store.js          # SQLite 存储层
    └── subgraph-query.js       # 子图查询
```

---

*本文档由 tt-b 项目自动生成，最后更新：2026-05-27*
