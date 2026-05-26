---
name: file-index
description: Project file indexing and categorization. Scan project directories to create categorized file indexes, enabling smart file discovery without reading all files. Use when starting work on a new project or when file structure is unclear.
---

# File Index Skill

Create and maintain categorized file indexes for projects, enabling efficient file discovery and preventing unnecessary full-directory reads.

## Trigger Conditions

Activate this skill when:
- Starting work on a new or unfamiliar project
- User asks about project structure
- Need to find specific types of files (configs, docs, tests)
- Planning implementation and need to understand file organization
- User mentions "project structure", "file index", "file map", or "categorize files"

## Core Concept

Instead of reading all files, maintain a lightweight index that categorizes files by their role in the project. Store this index in memory for quick reference.

## Quick Start

```bash
# Create config file in your project
python3 ~/.claude/skills/file-index/file_index.py init /path/to/project

# Scan current directory (markdown output)
python3 ~/.claude/skills/file-index/file_index.py scan .

# Scan specific project (JSON output)
python3 ~/.claude/skills/file-index/file_index.py scan /path/to/project --format json

# Show only essential files
python3 ~/.claude/skills/file-index/file_index.py essentials /path/to/project

# List files in a category
python3 ~/.claude/skills/file-index/file_index.py list /path/to/project --category source

# Save index to file
python3 ~/.claude/skills/file-index/file_index.py scan /path/to/project -o index.md
```

## Configuration

Create a `.fileindex` file in your project root to customize categorization:

```bash
# Create sample config
python3 ~/.claude/skills/file-index/file_index.py init /path/to/project

# Force overwrite existing config
python3 ~/.claude/skills/file-index/file_index.py init /path/to/project --force
```

### Config File Format

```yaml
# Essential files (always read first)
essential:
  - package.json
  - README.md
  - config/settings.py

# Source directories
source_dirs:
  - src
  - lib
  - core

# Test directories
test_dirs:
  - tests
  - spec
  - e2e

# Documentation directories
docs_dirs:
  - docs
  - wiki

# Ignore patterns (like .gitignore)
ignore:
  - node_modules/
  - dist/
  - *.log
  - .cache/

# Custom categories
custom_categories:
  api:
    description: "API route handlers"
    dirs: [api, routes, controllers]
    extensions: [.js, .ts]

# File descriptions
file_descriptions:
  package.json: "Dependencies and scripts"
  config/settings.py: "Application settings"
```

See [.fileindex.example](.fileindex.example) for full documentation.

## File Categories

| Category | Description | Examples |
|----------|-------------|----------|
| `essential` | Must-read for project startup and understanding | `package.json`, `README.md`, `CLAUDE.md`, `Makefile`, `docker-compose.yml`, main entry points |
| `config` | Configuration files | `.env.example`, `tsconfig.json`, `webpack.config.js`, `.eslintrc`, `jest.config.js` |
| `source` | Core application source code | `src/`, `lib/`, `app/` directories |
| `docs` | Documentation | `docs/`, `*.md` files, API specs |
| `test` | Test files | `__tests__/`, `*.test.js`, `*.spec.ts`, `tests/` |
| `assets` | Static resources | `public/`, `images/`, `fonts/`, `static/` |
| `build` | Build output (usually ignore) | `dist/`, `build/`, `out/`, `.next/` |
| `deps` | Dependencies (usually ignore) | `node_modules/`, `vendor/`, `.venv/` |
| `temp` | Temporary files (always ignore) | `*.log`, `*.tmp`, `.cache/`, `tmp/` |
| `hidden` | Hidden/dot files | `.git/`, `.github/`, `.vscode/`, `.idea/` |

## Usage

### Scan and Create Index

```bash
# Use the file-index tool
python /Users/m9570/.claude/skills/file-index/file_index.py scan /path/to/project
```

Or manually via shell:

```bash
# List all files with categories
find /path/to/project -type f | head -200
```

### Index Output Format

The index is stored as a structured document:

```markdown
# Project File Index: /path/to/project

## Essential (startup-critical)
- package.json - Dependencies and scripts
- src/index.ts - Main entry point
- README.md - Project documentation

## Config
- tsconfig.json - TypeScript config
- .env.example - Environment template

## Source
- src/app.ts - Application core
- src/utils/ - Utility functions
  - helper.ts
  - logger.ts

## Docs
- docs/api.md - API documentation
- CHANGELOG.md - Version history

## Test
- tests/app.test.ts - Main test file

## Ignore
- node_modules/
- dist/
- *.log
```

### Read Files by Category

When you need specific types of files:

```python
# Read only essential files first
essential_files = get_files_by_category("essential")

# Read source files in a specific directory
source_files = get_files_in_path("src/", category="source")

# Skip ignored files
all_useful = get_all_files(exclude=["ignore", "build", "deps", "temp"])
```

## Integration with Memory

After scanning, save the index to Claude's memory system for future reference:

### Step 1: Scan and Save

```bash
# Scan project and save to memory file
python3 ~/.claude/skills/file-index/file_index.py scan /path/to/project -o ~/.claude/memory/file-index-projectname.md
```

### Step 2: Update Memory Index

Add to `~/.claude/memory/MEMORY.md`:

```markdown
- [Project File Index](file-index-projectname.md) - Categorized file structure for ProjectName
```

### Step 3: Use in Future Sessions

When starting work on the project:

1. Read `~/.claude/memory/file-index-projectname.md` first
2. Start with `essential` files only
3. Expand to other categories as needed

### Memory File Format

```markdown
---
name: file-index-projectname
description: File index for ProjectName - categorized file structure for efficient discovery
metadata:
  type: reference
  project_path: /path/to/project
  last_scanned: 2026-05-26
---

# ProjectName File Index

## Essential (startup-critical)
- `package.json` - Dependencies and scripts
- `src/index.ts` - Main entry point
- `README.md` - Project documentation

## Source
- `src/app.ts` - Application core
- `src/utils/helper.ts` - Utility functions

## Config
- `tsconfig.json` - TypeScript config
- `.env.example` - Environment template

## Test
- `tests/app.test.ts` - Main test file

## Docs
- `docs/api.md` - API documentation
```

## Workflow

### 1. Initial Scan (New Project)

```python
# Step 1: Scan the project
scan_project(project_path)

# Step 2: Identify essential files
essential = identify_essential_files(project_path)

# Step 3: Read only essential files first
for file in essential:
    read_file(file)

# Step 4: Save index to memory
save_index_to_memory(project_path)
```

### 2. Smart File Discovery

```python
# Instead of: find . -type f (returns everything)
# Use: get_files_by_category("source", path="src/")

# When looking for config files
config_files = get_files_by_category("config")

# When looking for test files
test_files = get_files_by_category("test")
```

### 3. Incremental Updates

```python
# After code changes, update only changed files
update_index(project_path, changed_files=["src/app.ts", "tests/app.test.ts"])
```

## Essential File Detection Rules

Files are marked as `essential` if they match:

1. **Project Root Files**
   - `package.json`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`
   - `Makefile`, `CMakeLists.txt`
   - `docker-compose.yml`, `Dockerfile`
   - `README.md`, `README`
   - `CLAUDE.md`
   - `.gitignore`
   - `LICENSE`

2. **Entry Points** (detected from package.json or config)
   - `main` field in package.json
   - `index.js`, `index.ts`, `main.py`, `app.py`
   - `src/index.*`, `src/main.*`, `src/app.*`

3. **Configuration**
   - `*.config.js`, `*.config.ts`
   - `.env.example`
   - `tsconfig.json`, `jsconfig.json`

## Ignore Rules

Files/directories are automatically categorized as `ignore`:

```
node_modules/
.git/
dist/
build/
out/
.next/
.cache/
*.log
*.tmp
.DS_Store
Thumbs.db
__pycache__/
*.pyc
.env
.env.local
```

## CLI Interface

```bash
# Scan project
file-index scan /path/to/project

# List by category
file-index list /path/to/project --category source

# Show essential files only
file-index essentials /path/to/project

# Export index as JSON
file-index export /path/to/project --format json

# Update index for changed files
file-index update /path/to/project --files "src/app.ts,tests/app.test.ts"
```

## Example: Starting Work on New Project

```python
# 1. Check if index exists in memory
existing_index = load_from_memory("file-index-myproject")

if not existing_index:
    # 2. Scan the project
    index = scan_project("/path/to/myproject")

    # 3. Save to memory
    save_to_memory("file-index-myproject", index)

# 4. Read essential files first
essential_files = index["categories"]["essential"]
for file in essential_files:
    content = read_file(file)
    # Process...

# 5. Based on task, read relevant category
if task == "fix_bug":
    source_files = index["categories"]["source"]
    test_files = index["categories"]["test"]
elif task == "update_docs":
    doc_files = index["categories"]["docs"]
```

## Benefits

1. **Efficiency** - Don't read 100+ files when you only need 5
2. **Focus** - Start with essential files, expand as needed
3. **Memory** - Index persists across sessions
4. **Organization** - Clear categorization of project structure
5. **Speed** - Quick file discovery without full directory scan

## Notes

- Index should be refreshed when project structure changes significantly
- Use `file-index update` for incremental changes
- Essential files are project-type aware (Node.js vs Python vs Go)
- The index is a guide, not a constraint - read files outside categories when needed
