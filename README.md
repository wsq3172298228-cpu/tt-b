<div align="center">

[English](README.md) | [中文](README-zh-CN.md)

</div>

<div align="center">
[快速开始：中文](QUICKSTART-zh-CN.md) 
</div>
# tt-b

`tt-b` is a model-aware agent workflow kit for memory-backed engineering tasks.

It defines an importable startup contract that can work with Claude Code CLI,
Codex, OpenCode, and any other coding agent that can consume instruction files,
hooks, MCP tools, or REST APIs.

After installation, an agent can:

- detect the active host and model
- recover project memory before editing
- choose an execution mode from model capability
- keep long-term knowledge separate from transient session state
- install the workflow into another local project with one command

Current templates are provided for Claude Code, Codex-style `AGENTS.md`, and
OpenCode. Other agents can integrate through the same contract by reading the
generated instruction files, calling the helper scripts from hooks, exposing
them through MCP, or wrapping them behind a REST API.

## One-command import

From this repository:

```bash
node bin/import-agent-workflow.js /path/to/target-project
```

This installs the workflow into the target project for Claude Code,
Codex-style agents, OpenCode, and adapter-based agents.

It creates or updates:

- `CLAUDE.md` - Claude Code / shared agent startup contract
- `AGENTS.md` - OpenCode-compatible agent instructions
- `opencode.json` - OpenCode instruction file registration
- `.claude/bin/model-preflight.js` - host/model/capability detector
- `.claude/bin/memory-reminder.js` - non-blocking memory reminder hook helper
- `.claude/bin/memory-compress.js` - auto-compress memory on context compaction
- `.claude/bin/tt-b-mcp-server.js` - MCP server exposing memory resources and tools
- `.claude/bin/tt-b-rest-server.js` - REST API server for HTTP-based integration
- `.claude/bin/tt-b-lifecycle.js` - Full lifecycle bootstrap with 8 phases (config, provider, memory functions, REST, MCP, viewer, health, search index)
- `.claude/bin/graph-updater.js` - diff-driven incremental knowledge graph daemon (`--once`, `--watch`, `--gc`, `--verify`)
- `.claude/bin/post-commit-hook.js` - lightweight git post-commit hook that queues commits for async graph updates
- `.claude/functions/` - 16 fine-grained memory modules (including `graph-store.js` SQLite storage and `subgraph-query.js` BFS query)
- `.claude/settings.json` - Claude Code hook registration for memory reminders
- `.claude/memory/knowledge-graph.md` - clean long-term memory template
- `.claude/memory/session-state.md` - clean current-task state template
- `.claude/knowledge-graph.md` - legacy compatibility pointer
- `.claude/session-state.md` - legacy compatibility pointer

Existing `CLAUDE.md` and `AGENTS.md` content is preserved. The importer appends
or replaces only the managed `tt-b` block. Existing memory files are preserved
unless `--force` is used.

If the target project has a `package.json`, the importer auto-installs `better-sqlite3`.
For incremental graph updates, install the git hook manually:

```bash
cp .claude/bin/post-commit-hook.js .git/hooks/post-commit && chmod +x .git/hooks/post-commit
```

Useful options:

```bash
node bin/import-agent-workflow.js /path/to/target-project --dry-run
node bin/import-agent-workflow.js /path/to/target-project --force
```

## SQLite Graph Database

After import, the target project automatically gets SQLite knowledge graph storage. `graph-store.js` provides a unified storage abstraction with dual-write to both markdown and SQLite.

### How it works

```
knowledge-graph.md  ←→  graph_memory.db (SQLite)
     (human-readable)       (programmatic queries)
```

- **Read**: loads from `graph_memory.db` first, falls back to markdown parsing
- **Write**: writes to both SQLite and markdown simultaneously
- **Query**: use `graph-store.js` API — `load()`, `save()`, `stats()`

### Setup by scenario

**Scenario 1: Target project has `package.json`**

The importer handles everything:

```bash
node bin/import-agent-workflow.js /path/to/target-project
# Auto: installs better-sqlite3 + deploys graph-store.js + creates graph_memory.db
```

**Scenario 2: Target project has no `package.json`**

Manual initialization needed:

```bash
cd /path/to/target-project
npm init -y                              # create package.json
npm install better-sqlite3               # install SQLite dependency
```

**Scenario 3: Git repo is in a parent directory**

If `.git/` is not inside the target project (monorepo structure), mount the hook at the repo root:

```bash
# find where .git lives
git rev-parse --git-dir

# mount at repo root (affects all projects under this repo)
cp .claude/bin/post-commit-hook.js $(git rev-parse --git-dir)/hooks/post-commit
chmod +x $(git rev-parse --git-dir)/hooks/post-commit
```

### Verify

```bash
# check SQLite database was created
ls .claude/memory/graph_memory.db

# test graph-store availability
node -e "
const createGraphStore = require('./.claude/functions/graph-store');
const store = createGraphStore({ projectRoot: '.' });
console.log(store.stats());
store.close();
"
```

Expected output: `{ nodeCount: 0, edgeCount: 0, commitCount: 0, staleCount: 0, source: 'sqlite' }`

### Build tools

`better-sqlite3` is a native C++ module requiring build tools:

| Platform | Install command |
|----------|----------------|
| macOS | `xcode-select --install` |
| Linux | `apt install build-essential python3` |
| Windows | `npm install --global windows-build-tools` |

Permission issues? Try `sudo npm install better-sqlite3` or `npx tt-b doctor`.

## One-command cleanup

Remove all tt-b artifacts from a target project:

```bash
node bin/tt-b-cleanup.js /path/to/target-project
```

This removes:

- Managed blocks from `CLAUDE.md` and `AGENTS.md` (preserves existing content)
- Helper scripts in `.claude/bin/` (including graph-updater, post-commit-hook)
- Memory templates and graph database in `.claude/memory/` (graph_memory.db)
- Legacy pointer files in `.claude/`
- Hook entries from `.claude/settings.json` (preserves other settings)
- Instruction entries from `opencode.json` (preserves other config)
- Empty directories left behind

Useful options:

```bash
node bin/tt-b-cleanup.js /path/to/target-project --dry-run
node bin/tt-b-cleanup.js /path/to/target-project --force
```

Without `--force`, memory files containing real project data and non-pointer
legacy files are kept. With `--force`, everything tt-b related is removed.

## TTB-TODO Comment Convention

When modifying code, write comments first as "thinking anchors":

```javascript
//TTB-TODO: 步骤 1: 验证用户输入
//TTB-TODO: 步骤 2: 检查权限
//TTB-TODO: 步骤 3: 处理业务逻辑

// Actual code follows...
```

**Benefits:**
- Provides a "buffer zone" for AI to organize logic before coding
- Creates strong context anchors that constrain subsequent code generation
- Reduces risk of accidentally modifying unrelated code

TTB-TODO comments are automatically tracked and queryable via `ttb_todos_list` MCP tool.

## Diff Guard

Monitors code changes and notifies the USER (not blocks the AI):

| Change | Notification |
|--------|--------------|
| Edit > 50 lines | User notification |
| Edit > 100 lines | User alert |
| Write replaces > 50% | User notification |
| Write replaces > 80% | User alert |

**Philosophy:** AI should focus on execution, user handles oversight.

## AST File Pointer

Surgical code navigation using AST-based parsing:

```javascript
// MCP tool usage
ttb_file_pointer({
  filePath: "src/index.js",
  focus: "handleRequest",  // Focus on specific function
  contextLines: 5          // Lines of context
})
```

Supports: JavaScript, TypeScript, Python, Markdown.

### Stream Monitor

`tt-b-stream` provides real-time stream health monitoring and circuit breaker for Claude Code.

```bash
# Basic usage: monitor Claude Code and interrupt after 60s of no output
tt-b-stream --prompt "Your prompt here"

# Custom timeout and retries
tt-b-stream --timeout 120 --max-retries 5 -- --prompt "Your prompt here"

# Enable verbose logging
tt-b-stream --verbose --log /tmp/claude-monitor.log -- --prompt "Your prompt here"
```

**Default Configuration:**

After installing tt-b, a default config file `.claude/stream-monitor.json` is created with:
- Timeout: 60 seconds
- Max retries: 3
- Retry delay: 2000 ms

Just run `tt-b-stream` to use the default configuration without specifying parameters.

**Features:**
- **Real-time stream monitoring**: Capture Claude Code's stdout/stderr output
- **Idle timeout detection**: Default 60s timeout triggers circuit breaker
- **Auto-retry**: Configurable max retry attempts (default: 3)
- **Detailed logging**: Optional log file and verbose mode

**Configuration Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `--timeout <seconds>` | Idle timeout threshold (seconds) | 60 |
| `--max-retries <n>` | Maximum retry attempts | 3 |
| `--retry-delay <ms>` | Delay between retries (ms) | 2000 |
| `--log <file>` | Log file path | none |
| `--verbose, -v` | Enable verbose logging | off |

**Config File (`.claude/stream-monitor.json`):**

```json
{
  "timeout": 60,
  "maxRetries": 3,
  "retryDelay": 2000,
  "verbose": false,
  "logFile": null
}
```

**Priority**: Command-line args > Environment vars > Config file > Defaults

**Environment Variables:**

| Variable | Description |
|----------|-------------|
| `STREAM_TIMEOUT` | Override timeout (seconds) |
| `MAX_RETRIES` | Override max retries |
| `RETRY_DELAY` | Override retry delay (ms) |
| `LOG_FILE` | Override log file path |
| `VERBOSE` | Set to "1" for verbose output |

**Use Cases:**
- Prevent AI reasoning loops
- Detect network hangs
- Avoid wasted token consumption
- Auto-recover from abnormal sessions

## Install from GitHub

You can import the workflow with the click of a command:

```bash
npx --yes github:YOUR_GITHUB_USERNAME/tt-b /path/to/target-project
```

From inside the target project, the shortest form is:

```bash
npx --yes github:YOUR_GITHUB_USERNAME/tt-b .
```

## Quick Start by Platform

### Claude Code (plugin, recommended)

```
Install tt-b as a Claude Code plugin: run `/plugin marketplace add wsq3172298228-cpu/tt-b` then `/plugin install tt-b` — the plugin registers 8 hooks, auto-wires the MCP server via `.mcp.json`, and exposes 15 skills (/remember, /recall, /forget, /verify, /preflight, /graph, /memories, /session-history, /snapshot, /grill-me, /goal-ttb, /loop, /schedule, /change-me, /skill-health). No extra config needed.
```

### Claude Code (npx one-click import)

```bash
# from inside your target project
npx --yes github:wsq3172298228-cpu/tt-b .
```

This generates `CLAUDE.md`, `.claude/settings.json`, memory templates, and all helper scripts. Existing files are preserved.

### Claude Code (global deploy)

```bash
# deploy tt-b configs to ~/.claude/ (all projects)
npx --yes github:wsq3172298228-cpu/tt-b-deploy
# or from this repo:
node bin/claude-global-deploy.js
```

Options: `--dry-run`, `--restore`, `--delete`, `--verify`, `--list-backups`.

### Health check and auto-fix

```bash
# check installation health
npx tt-b health

# diagnose and auto-fix issues (installs missing dependencies)
npx tt-b doctor

# verbose output (shows build tools status)
npx tt-b health --verbose
```

The `doctor` command automatically:
- Installs missing `better-sqlite3` dependency
- Redeploys missing configuration files
- Fixes corrupted `settings.json`

If you encounter permission errors during global install:

```bash
# macOS/Linux - may need sudo for global npm directory
sudo npx tt-b doctor

# Or install better-sqlite3 manually
npm install better-sqlite3
```

Build tools required for `better-sqlite3` (native module):
- **macOS**: `xcode-select --install`
- **Linux**: `apt install build-essential python3`
- **Windows**: `npm install --global windows-build-tools`

### Codex CLI

```bash
# install tt-b plugin for Codex (6 hooks, 12 MCP tools, 15 skills)
node bin/tt-b-codex-install.js
```

This registers the tt-b marketplace, installs the plugin, and adds the MCP server to `~/.codex/config.toml`.

Options: `--remove`, `--status`.

### OpenCode

```bash
# import workflow into current project (generates AGENTS.md + opencode.json)
node bin/import-agent-workflow.js .
```

The importer creates `AGENTS.md` (OpenCode-compatible instructions) and registers it in `opencode.json`.

### OpenClaw

```bash
# install tt-b MCP server for OpenClaw
node bin/tt-b-openclaw-install.js
```

This adds the tt-b MCP server to `~/.openclaw/openclaw.json` and copies integration files to `~/.openclaw/extensions/tt-b`.

Options: `--remove`, `--status`.

### Universal MCP (any tool that supports MCP)

Add this to your tool's MCP server config:

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

Exposes 4 resources (memory files, contracts) and 12 tools (CRUD, search, snapshot, verify, graph extraction, subgraph query). Works with Cursor, Windsurf, Continue, Cline, and any MCP-compatible client.

### Verify installation

After installing for any platform, verify with:

```bash
# comprehensive health check (recommended)
npx tt-b health

# auto-fix any issues
npx tt-b doctor

# check generated files exist
ls .claude/memory/knowledge-graph.md .claude/memory/session-state.md

# verify helper scripts
node .claude/bin/model-preflight.js --help
node .claude/bin/tt-b-mcp-server.js --help

# run health check (if lifecycle is available)
node .claude/bin/tt-b-lifecycle.js --help
```

## Architecture

```
tt-b/
├── bin/                          # CLI entry points (thin wrappers)
│   ├── import-agent-workflow.js  # one-command importer
│   ├── tt-b-cleanup.js           # one-command cleanup
│   ├── tt-b-lifecycle.js         # 8-phase bootstrap orchestrator
│   ├── tt-b-mcp-server.js        # MCP server (stdio)
│   └── tt-b-rest-server.js       # REST API server
├── functions/                    # Fine-grained memory capability modules
│   ├── index.js                  # barrel export
│   ├── provider.js               # file system I/O abstraction
│   ├── config.js                 # configuration loader
│   ├── read-memory.js            # read memory by key or path
│   ├── write-memory.js           # write memory
│   ├── list-memory.js            # list memory files with metadata
│   ├── search-memory.js          # regex search across memory
│   ├── build-index.js            # build full-text search index
│   ├── search-index.js           # query pre-built index
│   ├── snapshot-memory.js        # point-in-time snapshot
│   ├── restore-memory.js         # restore from snapshot
│   ├── diff-memory.js            # diff against old snapshot
│   ├── verify-memory.js          # staleness/placeholder checks
│   ├── health-check.js           # built-in health checks
│   ├── extract-nodes.js          # knowledge graph node extraction
│   ├── extract-edges.js          # knowledge graph edge extraction
│   ├── graph-store.js            # SQLite knowledge graph storage layer
│   └── subgraph-query.js         # macro aggregation subgraph query (BFS)
├── packages/
│   ├── plugin/                   # Claude/Codex UX layer
│   │   ├── index.js
│   │   ├── hooks.js              # Claude Code hook definitions & merge
│   │   ├── preflight.js          # model detection (standalone)
│   │   └── managed-block.js      # instruction block merge/remove
│   └── integrations/             # Horizontal extension adapters
│       ├── index.js
│       ├── opencode.js           # OpenCode config merge/clean
│       ├── mcp.js                # MCP JSON-RPC 2.0 protocol handler
│       ├── rest.js               # REST API route definitions
│       └── viewer.js             # HTML dashboard
├── plugin/                       # Plugin distribution (hooks, scripts, skills)
│   ├── .claude-plugin/plugin.json
│   ├── .codex-plugin/plugin.json
│   ├── .mcp.json                 # MCP server config
│   ├── hooks/
│   │   ├── hooks.json            # Claude hooks (8 types)
│   │   └── hooks.codex.json      # Codex hooks (6 types)
│   ├── scripts/                  # Thin-client hook scripts (.mjs)
│   └── skills/                   # User-invocable skills (SKILL.md)
├── .claude/bin/
│   ├── model-preflight.js
│   ├── memory-reminder.js
│   ├── memory-compress.js
│   ├── graph-updater.js          # diff-driven incremental graph daemon
│   └── post-commit-hook.js       # lightweight git post-commit hook
├── .claude-plugin/marketplace.json
├── .codex-plugin/marketplace.json
└── templates/                    # Clean import templates
    ├── claude/
    │   ├── settings.json
    │   └── memory/
    └── opencode/
```

**Main package** (`bin/`) — long-term service lifecycle.
**`functions/`** — fine-grained, independently testable memory modules.
**`packages/plugin/`** — Claude/Codex user experience (hooks, preflight, managed blocks).
**`packages/integrations/`** — horizontal adapters (REST, MCP, OpenCode, viewer).

## What this repo contains

- `CLAUDE.md` - project-level startup and reasoning contract
- `.claude/bin/model-preflight.js` - best-effort host/model/capability detection helper
- `.claude/bin/memory-reminder.js` - non-blocking hook helper that reminds agents to consult and update memory
- `.claude/bin/memory-compress.js` - auto-compress knowledge-graph.md when context compaction triggers
- `.claude/bin/graph-updater.js` - diff-driven incremental knowledge graph daemon (`--once`, `--watch`, `--dry-run`)
- `.claude/bin/post-commit-hook.js` - lightweight git post-commit hook that queues commits for async graph updates
- `.claude/settings.json` - Claude Code hook registration for startup, resume, compaction, and substantial prompt reminders
- `functions/` - 16 fine-grained memory capability modules (provider, CRUD, search, snapshot, diff, verify, health, graph extraction, subgraph query)
- `packages/plugin/` - Claude/Codex UX (hooks, preflight, managed blocks)
- `packages/integrations/` - horizontal adapters (REST, MCP, OpenCode, viewer)
- `bin/tt-b-lifecycle.js` - 8-phase bootstrap orchestrator using functions/ and packages/
- `bin/tt-b-mcp-server.js` - MCP server using packages/integrations/mcp
- `bin/tt-b-rest-server.js` - REST API using packages/integrations/rest
- `bin/tt-b-cleanup.js` - one-command cleanup
- `bin/import-agent-workflow.js` - one-command importer
- `plugin/` - plugin distribution (8 hooks, 15 skills, thin-client scripts)
- `.claude-plugin/` - Claude Code marketplace manifest
- `.codex-plugin/` - Codex marketplace manifest
- `templates/` - clean import templates for new target projects

## Graph Optimization

Two mechanisms keep the knowledge graph fresh and queryable without blocking development:

### Incremental Updates (Diff-Driven)

The graph stays in sync with code through a lightweight async pipeline:

1. **post-commit hook** (`.claude/bin/post-commit-hook.js`) — on every `git commit`, writes the commit hash to `.git/graph_update_queue` and exits immediately (no blocking).
2. **graph updater daemon** (`.claude/bin/graph-updater.js`) — consumes the queue, parses `git diff`, extracts changed entities/relations via local heuristics, and patches `knowledge-graph.md` incrementally.

```bash
# install the post-commit hook (one-time)
cp .claude/bin/post-commit-hook.js .git/hooks/post-commit && chmod +x .git/hooks/post-commit

# run the daemon (pick one)
node .claude/bin/graph-updater.js --once      # process queue once and exit
node .claude/bin/graph-updater.js --watch     # poll every 30s
node .claude/bin/graph-updater.js --dry-run   # preview changes without writing
```

### Macro Aggregation Query (Subgraph)

Instead of forcing the LLM to traverse nodes one-by-one (causing tool-call loops), the `tt-b_memory_subgraph` MCP tool does multi-hop BFS in a single call and returns LLM-friendly structured text:

```
entity: AuthService
depth: 3
direction: both
```

Returns a formatted tree showing upstream/downstream dependencies across 3 hops, filtered to business-relevant nodes.

## Universal Agent Integration

`tt-b` is intentionally file-first. The stable contract is the generated
instruction and memory layout, not one specific vendor runtime:

- instruction files: read `CLAUDE.md`, `AGENTS.md`, and memory files directly
- hooks: call `.claude/bin/memory-reminder.js` during startup, resume, or user prompt events
- MCP: `.claude/bin/tt-b-mcp-server.js` exposes memory files as MCP resources and helper scripts as MCP tools
- REST API: `.claude/bin/tt-b-rest-server.js` exposes endpoints at `/preflight`,
  `/memory/reminder`, and `/workflow/import`

Integration pattern:

1. Install the workflow into a target project.
2. Make the agent load `CLAUDE.md` or `AGENTS.md` as its instruction source.
3. Make the agent read `.claude/memory/knowledge-graph.md` and
   `.claude/memory/session-state.md` before non-trivial work.
4. Optionally call `.claude/bin/model-preflight.js` to classify host, model, and
   execution mode.
5. Optionally call `.claude/bin/memory-reminder.js` from hooks, MCP, or REST to
   inject a non-blocking memory reminder.
6. After meaningful verified work, update the memory files with stable facts and
   the current execution cursor.

This means the project can teach one portable agent workflow while still letting
each runtime choose its own integration surface.

### Plugin System

`tt-b` can be installed as a Claude Code or Codex plugin for marketplace
discovery and automatic hook registration.

**Plugin structure:**

```
.claude-plugin/marketplace.json   # Claude marketplace entry
.codex-plugin/marketplace.json    # Codex marketplace entry
plugin/
  .claude-plugin/plugin.json      # Claude plugin manifest
  .codex-plugin/plugin.json       # Codex plugin manifest
  .mcp.json                       # MCP server config
  hooks/
    hooks.json                    # Claude hooks (8 types)
    hooks.codex.json              # Codex hooks (6 types)
  scripts/
    session-start.mjs             # Thin client: register session + inject context
    prompt-submit.mjs             # Thin client: capture user prompt
    pre-tool-use.mjs              # Thin client: enrich context for file ops
    post-tool-use.mjs             # Thin client: capture tool output
    pre-compact.mjs               # Thin client: inject before compaction
    stop.mjs                      # Thin client: update session cursor
    subagent-start.mjs            # Thin client: record subagent start
    subagent-stop.mjs             # Thin client: record subagent stop
  skills/
    remember/SKILL.md             # Save insight to memory
    recall/SKILL.md               # Search memory
    forget/SKILL.md               # Delete from memory (with confirmation)
    session-history/SKILL.md      # Show execution cursor
    snapshot/SKILL.md             # Snapshot all memory files
    verify/SKILL.md               # Check memory health and staleness
    preflight/SKILL.md            # Detect host, model, capability tier
    graph/SKILL.md                # Show knowledge graph nodes and edges
    memories/SKILL.md             # List memory files with metadata
    grill-me/SKILL.md             # Interview user to clarify goals, update memory
```

**Hook types (Claude: 8, Codex: 6):**

| Hook               | Script               | Description                                        |
| ------------------ | -------------------- | -------------------------------------------------- |
| `SessionStart`     | `session-start.mjs`  | Register session, optionally inject memory context |
| `UserPromptSubmit` | `prompt-submit.mjs`  | Capture user prompt as observation                 |
| `PreToolUse`       | `pre-tool-use.mjs`   | Enrich context for Edit/Write/Read tools           |
| `PostToolUse`      | `post-tool-use.mjs`  | Capture tool output as observation                 |
| `PreCompact`       | `pre-compact.mjs`    | Inject context before compaction                   |
| `SubagentStart`    | `subagent-start.mjs` | Record subagent start event                        |
| `SubagentStop`     | `subagent-stop.mjs`  | Record subagent completion                         |
| `Stop`             | `stop.mjs`           | Trigger session cursor update                      |

All hook scripts are thin clients: they read stdin JSON and POST to the tt-b
REST server. They include a recursion guard (`isSdkChildContext`) to prevent
hook loops in SDK child sessions.

**Skills (10 user-invocable commands):**

| Skill              | Description                                                                  |
| ------------------ | ---------------------------------------------------------------------------- |
| `/remember`        | Save an insight, decision, or fact to knowledge-graph memory                 |
| `/recall`          | Search project memory for past decisions and context                         |
| `/forget`          | Remove specific memory entries (requires confirmation)                       |
| `/session-history` | Show the current execution cursor and session state                          |
| `/snapshot`        | Create a point-in-time snapshot of all memory files                          |
| `/verify`          | Check memory for staleness, placeholders, and inconsistencies                |
| `/preflight`       | Detect the current host CLI, model, and capability tier                      |
| `/graph`           | Show the knowledge graph — all nodes and edges from memory                   |
| `/memories`        | List all memory files with metadata (size, modified, entries)                |
| `/grill-me-ttb`    | Interview user to clarify goals, informed by memory, updates knowledge graph |
| `/goal-ttb`        | Autonomous goal-pursuit loop: plan, execute, verify, repeat until done       |
| `/browser-mcp`     | Browser automation and web data fetching using Browser MCP                   |
| `/file-index`      | Project file indexing and categorization for smart file discovery             |
| `/mysql-query`     | MySQL database query tool with auto-connection and schema inspection          |
| `/ui-ux-pro-max`   | UI/UX design system with design tokens, typography, and platform templates   |

**Environment variables for hook scripts:**

- `TTB_REST_URL` — REST server URL (default: `http://localhost:3742`)
- `TTB_INJECT_CONTEXT` — Set to `true` to inject memory context on session start and pre-compact
- `TTB_SDK_CHILD` — Set to `1` to skip hooks (recursion guard)

### MCP Server

The MCP server communicates over stdio using the MCP JSON-RPC 2.0 protocol.

Resources:

| URI                             | Description                 |
| ------------------------------- | --------------------------- |
| `tt-b://memory/knowledge-graph` | Long-term project memory    |
| `tt-b://memory/session-state`   | Short-term execution cursor |
| `tt-b://contract/claude-md`     | CLAUDE.md startup contract  |
| `tt-b://contract/agents-md`     | AGENTS.md instructions      |

Tools:

| Tool                   | Description                                                             |
| ---------------------- | ----------------------------------------------------------------------- |
| `tt-b_preflight`       | Detect host, model, capability tier, and startup mode                   |
| `tt-b_memory_list`     | List all memory files with metadata                                     |
| `tt-b_memory_read`     | Read a memory file by name or path                                      |
| `tt-b_memory_write`    | Write or update a memory file                                           |
| `tt-b_memory_search`   | Search memory files for a regex pattern                                 |
| `tt-b_memory_snapshot` | Create a point-in-time snapshot of all memory files                     |
| `tt-b_memory_diff`     | Diff a memory file against old content                                  |
| `tt-b_memory_restore`  | Restore memory from a snapshot                                          |
| `tt-b_memory_verify`   | Verify memory files for staleness and placeholders                      |
| `tt-b_memory_nodes`    | Extract all knowledge graph nodes                                       |
| `tt-b_memory_edges`    | Extract all knowledge graph edges                                       |
| `tt-b_memory_subgraph` | Get dependency subgraph (upstream/downstream N hops, LLM-friendly text) |

Usage with Claude Code or any MCP client:

```bash
node .claude/bin/tt-b-mcp-server.js
```

Set `TTB_PROJECT_ROOT` to override the project root directory.

### REST API Server

The REST API server uses Node.js built-in `http` module. No external dependencies.

```bash
node .claude/bin/tt-b-rest-server.js
```

Endpoints:

| Method | Path               | Description                                            |
| ------ | ------------------ | ------------------------------------------------------ |
| `GET`  | `/health`          | Health check                                           |
| `GET`  | `/preflight`       | Model preflight (query: `host`, `model`)               |
| `POST` | `/memory/reminder` | Memory reminder (body: `{event?, prompt?, source?}`)   |
| `POST` | `/workflow/import` | Import workflow (body: `{targetDir, force?, dryRun?}`) |
| `GET`  | `/memory/list`     | List memory files                                      |
| `GET`  | `/memory/read`     | Read memory (query: `name`)                            |
| `POST` | `/memory/search`   | Search memory (body: `{pattern}`)                      |
| `GET`  | `/memory/snapshot` | Snapshot all memory                                    |
| `POST` | `/memory/restore`  | Restore from snapshot                                  |
| `GET`  | `/memory/verify`   | Verify staleness                                       |
| `GET`  | `/memory/nodes`    | Knowledge graph nodes                                  |
| `GET`  | `/memory/edges`    | Knowledge graph edges                                  |
| `POST` | `/memory/diff`     | Diff memory (body: `{name, oldContent}`)               |
| `POST` | `/memory/write`    | Write memory (body: `{name, content}`)                 |
| `POST` | `/memory/observe`  | Hook event ingestion                                   |

Configuration:

- `TTB_REST_PORT` — listen port (default: `3742`)
- `TTB_PROJECT_ROOT` — project root directory (default: cwd)
- `TTB_REST_URL` — REST server URL for hook scripts (default: `http://localhost:{port}`)

Example:

```bash
curl http://localhost:3742/preflight?host=codex&model=gpt-5.5
curl -X POST http://localhost:3742/memory/reminder -H "Content-Type: application/json" -d '{"source":"startup"}'
```

### Lifecycle Bootstrap

The lifecycle hook is a full application bootstrap orchestrator that runs 9
sequential phases:

```bash
node .claude/bin/tt-b-lifecycle.js
```

Phases:

| #   | Phase                     | Description                                                         |
| --- | ------------------------- | ------------------------------------------------------------------- |
| 1   | Load config               | Read env vars, CLI args, defaults                                   |
| 2   | Initialize provider       | Create memory file read/write/search abstraction                    |
| 3   | Register memory functions | read, write, search, diff, snapshot, restore, verify, nodes, edges  |
| 4   | Register REST endpoints   | All memory + preflight + import + lifecycle endpoints               |
| 5   | Register MCP endpoints    | MCP tools for memory functions (off by default, use `--mcp`)        |
| 6   | Start viewer              | HTML dashboard on `:3743` with live health, memory, and graph stats |
| 7   | Initialize health check   | 4 built-in checks: memory files, helper scripts, staleness, syntax  |
| 8   | Initialize search index   | Full-text index of headings, nodes, paths, and words                |

Options:

```bash
--port PORT          REST API port (default: 3742)
--viewer-port PORT   Viewer dashboard port (default: 3743)
--no-viewer          Disable viewer dashboard
--no-rest            Disable REST API
--mcp                Enable MCP server (stdio)
```

Additional endpoints (beyond the standalone REST server):

| Method | Path                | Description                                                |
| ------ | ------------------- | ---------------------------------------------------------- |
| `GET`  | `/lifecycle/status` | All 8 phase results with timing                            |
| `GET`  | `/health/detailed`  | 4 built-in health checks (on-demand, no background worker) |
| `POST` | `/search`           | Full-text search (body: `{query}`)                         |
| `GET`  | `/search/stats`     | Search index stats (files, terms, by type)                 |

The viewer dashboard at `http://localhost:3743` provides a live HTML interface
showing health status, memory file metadata, knowledge graph node/edge counts,
and buttons for verify, snapshot, and search.

## Startup flow

1. Detect the active CLI host.
2. Detect the effective model.
3. Classify the model into a capability tier.
4. Read `CLAUDE.md`.
5. Recover `.claude/memory/knowledge-graph.md` and `.claude/memory/session-state.md`.
6. Verify important memory claims against real files.
7. Plan, execute, test, and update memory after meaningful work.

## Memory reminder hooks

Imported projects include a non-blocking Claude Code hook reminder. The hook
runs on `SessionStart` and substantial `UserPromptSubmit` events, then injects
advisory context reminding the agent to:

- skim `.claude/memory/knowledge-graph.md` and `.claude/memory/session-state.md`
- treat memory as a map rather than source of truth
- verify important claims against real files before editing
- update stable facts and the current execution cursor after meaningful work

The reminder is intentionally soft. It does not block prompts, and trivial
prompts can ignore it.

## Memory auto-compression

Imported projects include an auto-compression hook that runs when Claude Code
triggers a context compaction event. The hook:

1. Checks if `knowledge-graph.md` exceeds 600 lines.
2. Creates a timestamped backup (e.g., `knowledge-graph.backup.2026-05-26.md`).
3. Compresses by removing duplicate edges, collapsing empty sections, and
   archiving stale edge blocks.
4. Injects a compression report as advisory context.

The backup ensures rollback is possible if compression loses important detail.

Configuration: the hook is registered in `.claude/settings.json` under
`SessionStart` with the `compact` matcher. The compression script is at
`.claude/bin/memory-compress.js`.

## Incremental graph updates (Git hook)

The project includes a diff-driven graph updater that keeps the knowledge graph
in sync with code changes. It uses a two-part architecture:

1. **Post-commit hook** (`.claude/bin/post-commit-hook.js`) — lightweight, runs
   in <1ms. Writes the commit hash to `.git/graph_update_queue` and exits
   immediately. Does not block git operations.

2. **Graph updater daemon** (`.claude/bin/graph-updater.js`) — reads the queue,
   extracts changed entities from `git diff` using local heuristics, and patches
   `knowledge-graph.md` with a timestamped backup.

Usage:

```bash
# Install the git hook
echo 'node .claude/bin/post-commit-hook.js' > .git/hooks/post-commit
chmod +x .git/hooks/post-commit

# Process queued commits (one-shot)
node .claude/bin/graph-updater.js --once

# Run as background daemon (polls every 5s)
node .claude/bin/graph-updater.js --watch

# Preview changes without writing
node .claude/bin/graph-updater.js --dry-run
```

## Subgraph query (MCP tool)

The `tt-b_memory_subgraph` MCP tool provides macro-level dependency analysis in
a single call, avoiding the "infinite loop" of micro-level node traversal.

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

Returns LLM-friendly structured text showing upstream/downstream dependencies
within the specified hop depth. Depth is capped at 5 to prevent context explosion.

## Model detection

The helper follows this precedence:

1. CLI arguments such as `--model`, `-m`, or `-c model="..."`
2. Environment variables such as `AI_MODEL`, `MODEL`, `CLAUDE_MODEL`, `CODEX_MODEL`, `OPENCODE_MODEL`
3. Host-specific config files
4. `unknown`

Example:

```bash
node .claude/bin/model-preflight.js --host codex --model gpt-5.5
```

Text output:

```bash
Host: codex
Model: gpt-5.5
Source: cli-arg
Capability: architect_orchestrator
Startup mode: restore-plan-delegate-verify-update-memory
```

## Capability tiers

- `architect_orchestrator` - high-level planning, risk review, knowledge graph updates, task decomposition
- `engineering_executor` - code reading, editing, tests, refactors, failure fixing
- `reader_or_tester` - bounded read-only investigation or targeted verification
- `unknown` - safe probe only

## Project memory

This repo treats memory as a graph, not a diary.

- stable facts belong in `.claude/memory/knowledge-graph.md`
- current task state belongs in `.claude/memory/session-state.md`
- code evidence outranks memory
- stale assumptions must be corrected when code contradicts them

## Verification

This workspace is documentation-heavy and does not ship an application test suite.
The importer and helper can still be checked locally:

```bash
node --check bin/import-agent-workflow.js
node --check .claude/bin/model-preflight.js
node --check .claude/bin/memory-reminder.js
node --check .claude/bin/memory-compress.js
./.claude/bin/model-preflight.js --host codex --model gpt-5.5 --text
```

## Repository status

This project is intentionally small and opinionated. The main goal is to provide a reusable startup pattern for agentic work, not a user-facing app.

## Notes

- Canonical memory lives under `.claude/memory/`.
- Legacy mirror files are kept only for compatibility.
- If this workspace is embedded into a larger project later, keep the startup contract and memory layout intact.
