#!/usr/bin/env python3
"""
File Index - Project file categorization tool
Scans project directories and categorizes files for efficient discovery.
"""

import os
import json
import argparse
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Set, Optional
from collections import defaultdict

# Category definitions with patterns
CATEGORIES = {
    "essential": {
        "description": "Must-read for project startup",
        "root_files": {
            "package.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
            "Makefile", "CMakeLists.txt", "docker-compose.yml", "docker-compose.yaml",
            "Dockerfile", "README.md", "README", "CLAUDE.md", ".gitignore",
            "LICENSE", "LICENSE.md", "setup.py", "setup.cfg", "pyproject.toml",
            "go.mod", "go.sum", "Cargo.toml", "Gemfile", "requirements.txt",
            "Pipfile", "poetry.lock", "composer.json"
        },
        "entry_patterns": [
            "index.js", "index.ts", "index.jsx", "index.tsx",
            "main.js", "main.ts", "main.py", "app.py", "app.js",
            "server.js", "server.ts", "cmd/main.go", "src/main.rs"
        ],
        "config_patterns": [
            "*.config.js", "*.config.ts", "*.config.mjs",
            ".env.example", ".env.sample",
            "tsconfig.json", "jsconfig.json", "babel.config.*",
            ".babelrc", ".eslintrc*", ".prettierrc*",
            "jest.config.*", "vitest.config.*", "webpack.config.*",
            "vite.config.*", "rollup.config.*", "next.config.*",
            "nuxt.config.*", "angular.json", "vue.config.*"
        ]
    },
    "config": {
        "description": "Configuration files",
        "patterns": [
            "*.config.*", ".env.*", ".*rc", ".*rc.json", ".*rc.js",
            "*.yml", "*.yaml", "*.toml", "*.ini", "*.cfg",
            "tsconfig*.json", "jsconfig*.json"
        ],
        "exclude": {"package.json", "package-lock.json", "yarn.lock"}
    },
    "source": {
        "description": "Core application source code",
        "dirs": {"src", "lib", "app", "pkg", "internal", "cmd"},
        "extensions": {
            ".js", ".ts", ".jsx", ".tsx", ".py", ".rb", ".go",
            ".rs", ".java", ".kt", ".swift", ".c", ".cpp", ".h",
            ".hpp", ".cs", ".php", ".lua", ".r", ".m", ".mm"
        }
    },
    "docs": {
        "description": "Documentation",
        "dirs": {"docs", "doc", "documentation", "wiki"},
        "extensions": {".md", ".mdx", ".rst", ".txt", ".adoc"},
        "patterns": ["*.md", "*.mdx", "CHANGELOG*", "CONTRIBUTING*", "SECURITY*"]
    },
    "test": {
        "description": "Test files",
        "dirs": {"test", "tests", "__tests__", "spec", "specs", "e2e"},
        "patterns": [
            "*.test.*", "*.spec.*", "*.test", "*.spec",
            "test_*", "*_test.*", "*_spec.*"
        ],
        "extensions": {".test.js", ".test.ts", ".spec.js", ".spec.ts"}
    },
    "assets": {
        "description": "Static resources",
        "dirs": {"public", "static", "assets", "images", "img", "fonts", "media"},
        "extensions": {
            ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp",
            ".mp3", ".mp4", ".wav", ".avi", ".mov",
            ".woff", ".woff2", ".ttf", ".eot", ".otf",
            ".css", ".scss", ".sass", ".less"
        }
    },
    "build": {
        "description": "Build output (usually ignore)",
        "dirs": {"dist", "build", "out", ".next", ".nuxt", "target", "bin", "release"},
        "patterns": ["*.min.js", "*.min.css", "*.bundle.*"]
    },
    "deps": {
        "description": "Dependencies (usually ignore)",
        "dirs": {
            "node_modules", "vendor", ".venv", "venv", "env",
            ".tox", ".mypy_cache", ".pytest_cache", "__pycache__",
            ".gradle", ".mvn"
        }
    },
    "temp": {
        "description": "Temporary files (always ignore)",
        "patterns": ["*.log", "*.tmp", "*.temp", "*.swp", "*.swo", "*~"],
        "dirs": {".cache", "tmp", "temp", ".tmp"},
        "extensions": {".log", ".tmp", ".temp"}
    },
    "hidden": {
        "description": "Hidden/dot files",
        "dirs": {
            ".git", ".github", ".vscode", ".idea", ".eclipse",
            ".circleci", ".travis", ".gitlab"
        }
    }
}

# Directories to always skip during scan
SKIP_DIRS = {
    "node_modules", ".git", "__pycache__", ".tox", ".mypy_cache",
    ".pytest_cache", ".venv", "venv", "env", ".env",
    ".cache", "dist", "build", "out", ".next", ".nuxt",
    "target", "vendor", ".gradle", ".mvn"
}

# Extensions to always skip
SKIP_EXTENSIONS = {
    ".pyc", ".pyo", ".class", ".o", ".obj", ".so", ".dylib", ".dll",
    ".exe", ".bin", ".dat", ".db", ".sqlite", ".sqlite3"
}

# Config file name
CONFIG_FILE = ".fileindex"


def load_config(project_path: Path) -> Dict:
    """Load configuration from .fileindex file if it exists."""
    config_path = project_path / CONFIG_FILE
    config = {}

    if config_path.exists():
        try:
            import yaml
            with open(config_path) as f:
                config = yaml.safe_load(f) or {}
        except ImportError:
            # Fallback: parse simple key-value format
            config = parse_simple_config(config_path)
        except Exception as e:
            print(f"Warning: Could not load config: {e}")

    return config


def parse_simple_config(config_path: Path) -> Dict:
    """Parse simple config file without yaml dependency."""
    config = {}
    current_section = None
    current_list = None

    with open(config_path) as f:
        for line in f:
            line = line.rstrip()

            # Skip empty lines and comments
            if not line or line.startswith('#'):
                if current_list is not None:
                    current_list = None
                continue

            # Section header
            if line.endswith(':') and not line.startswith(' '):
                current_section = line[:-1].strip()
                if current_section not in config:
                    config[current_section] = {}
                current_list = None
                continue

            # List item
            if line.startswith('- '):
                if current_section:
                    if current_list is None:
                        current_list = []
                        config[current_section] = current_list
                    if isinstance(current_list, list):
                        current_list.append(line[2:].strip())
                continue

            # Key-value pair
            if ':' in line and current_section:
                key, value = line.split(':', 1)
                key = key.strip()
                value = value.strip()
                if current_section not in config:
                    config[current_section] = {}
                if isinstance(config[current_section], dict):
                    config[current_section][key] = value

    return config


def apply_config(config: Dict):
    """Apply configuration to global settings."""
    global SKIP_DIRS, SKIP_EXTENSIONS, CATEGORIES

    # Apply ignore patterns
    if 'ignore' in config:
        for pattern in config['ignore']:
            pattern = pattern.strip('/')
            if pattern.startswith('*.'):
                SKIP_EXTENSIONS.add(pattern[1:])
            else:
                SKIP_DIRS.add(pattern)

    # Apply source directories
    if 'source_dirs' in config:
        CATEGORIES['source']['dirs'].update(config['source_dirs'])

    # Apply test directories
    if 'test_dirs' in config:
        CATEGORIES['test']['dirs'].update(config['test_dirs'])

    # Apply docs directories
    if 'docs_dirs' in config:
        CATEGORIES['docs']['dirs'].update(config['docs_dirs'])

    # Apply asset directories
    if 'asset_dirs' in config:
        CATEGORIES['assets']['dirs'].update(config['asset_dirs'])

    # Apply essential files
    if 'essential' in config:
        CATEGORIES['essential']['root_files'].update(config['essential'])


class FileIndex:
    def __init__(self, project_path: str, config: Optional[Dict] = None):
        self.project_path = Path(project_path).resolve()
        self.categories: Dict[str, List[str]] = defaultdict(list)
        self.file_info: Dict[str, dict] = {}
        self.essential_files: List[str] = []
        self.custom_categories: Dict[str, Dict] = {}
        self.file_descriptions: Dict[str, str] = {}

        # Load config from file if not provided
        if config is None:
            config = load_config(self.project_path)

        self.config = config
        self._apply_config()

    def _apply_config(self):
        """Apply configuration settings."""
        if not self.config:
            return

        # Apply ignore patterns
        if 'ignore' in self.config:
            for pattern in self.config['ignore']:
                pattern = pattern.strip('/')
                if pattern.startswith('*.'):
                    SKIP_EXTENSIONS.add(pattern[1:])
                else:
                    SKIP_DIRS.add(pattern)

        # Apply custom source directories
        if 'source_dirs' in self.config:
            CATEGORIES['source']['dirs'].update(self.config['source_dirs'])

        # Apply custom test directories
        if 'test_dirs' in self.config:
            CATEGORIES['test']['dirs'].update(self.config['test_dirs'])

        # Apply custom docs directories
        if 'docs_dirs' in self.config:
            CATEGORIES['docs']['dirs'].update(self.config['docs_dirs'])

        # Apply custom asset directories
        if 'asset_dirs' in self.config:
            CATEGORIES['assets']['dirs'].update(self.config['asset_dirs'])

        # Apply essential files
        if 'essential' in self.config:
            CATEGORIES['essential']['root_files'].update(self.config['essential'])

        # Apply custom categories
        if 'custom_categories' in self.config:
            self.custom_categories = self.config['custom_categories']
            for cat_name, cat_def in self.custom_categories.items():
                if cat_name not in CATEGORIES:
                    CATEGORIES[cat_name] = {
                        'description': cat_def.get('description', cat_name),
                        'dirs': set(cat_def.get('dirs', [])),
                        'extensions': set(cat_def.get('extensions', []))
                    }

        # Apply file descriptions
        if 'file_descriptions' in self.config:
            self.file_descriptions = self.config['file_descriptions']

    def scan(self) -> Dict:
        """Scan project and categorize all files."""
        if not self.project_path.exists():
            raise FileNotFoundError(f"Project path not found: {self.project_path}")

        # Reset categories
        self.categories = defaultdict(list)
        self.file_info = {}

        # Scan all files
        for root, dirs, files in os.walk(self.project_path):
            # Skip certain directories
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]

            for file in files:
                file_path = Path(root) / file
                rel_path = file_path.relative_to(self.project_path)

                # Skip certain extensions
                if file_path.suffix in SKIP_EXTENSIONS:
                    continue

                # Categorize the file
                category = self._categorize_file(file_path, rel_path)
                self.categories[category].append(str(rel_path))

                # Store file info
                self.file_info[str(rel_path)] = {
                    "category": category,
                    "size": file_path.stat().st_size if file_path.exists() else 0,
                    "modified": datetime.fromtimestamp(
                        file_path.stat().st_mtime
                    ).isoformat() if file_path.exists() else None
                }

        # Identify essential files
        self._identify_essential_files()

        return self.to_dict()

    def _categorize_file(self, file_path: Path, rel_path: Path) -> str:
        """Determine the category of a file."""
        file_name = file_path.name
        file_ext = file_path.suffix
        parent_dir = rel_path.parts[0] if rel_path.parts else ""

        # Check essential first (root files)
        if len(rel_path.parts) == 1:
            if file_name in CATEGORIES["essential"]["root_files"]:
                return "essential"

        # Check entry points
        for pattern in CATEGORIES["essential"]["entry_patterns"]:
            if self._match_pattern(str(rel_path), pattern):
                return "essential"

        # Check if in source directories
        if parent_dir in CATEGORIES["source"]["dirs"]:
            if file_ext in CATEGORIES["source"]["extensions"]:
                return "source"

        # Check test files
        if parent_dir in CATEGORIES["test"]["dirs"]:
            return "test"
        for pattern in CATEGORIES["test"]["patterns"]:
            if self._match_pattern(file_name, pattern):
                return "test"

        # Check docs
        if parent_dir in CATEGORIES["docs"]["dirs"]:
            return "docs"
        if file_ext in CATEGORIES["docs"]["extensions"]:
            return "docs"

        # Check assets
        if parent_dir in CATEGORIES["assets"]["dirs"]:
            return "assets"
        if file_ext in CATEGORIES["assets"]["extensions"]:
            return "assets"

        # Check build
        if parent_dir in CATEGORIES["build"]["dirs"]:
            return "build"

        # Check config
        if file_ext in {".json", ".yml", ".yaml", ".toml", ".ini", ".cfg"}:
            if file_name not in CATEGORIES["config"]["exclude"]:
                return "config"

        # Check temp
        if file_ext in CATEGORIES["temp"]["extensions"]:
            return "temp"

        # Default to source if it's a code file
        if file_ext in CATEGORIES["source"]["extensions"]:
            return "source"

        return "other"

    def _match_pattern(self, text: str, pattern: str) -> bool:
        """Simple pattern matching with wildcards."""
        if "*" not in pattern:
            return text == pattern

        # Convert glob pattern to check
        if pattern.startswith("*"):
            return text.endswith(pattern[1:])
        elif pattern.endswith("*"):
            return text.startswith(pattern[:-1])
        elif "*" in pattern:
            prefix, suffix = pattern.split("*", 1)
            return text.startswith(prefix) and text.endswith(suffix)
        return False

    def _identify_essential_files(self):
        """Identify and mark essential files."""
        self.essential_files = self.categories.get("essential", [])

        # Also check for main entry points in package.json
        pkg_json = self.project_path / "package.json"
        if pkg_json.exists():
            try:
                with open(pkg_json) as f:
                    pkg = json.load(f)
                    main = pkg.get("main", "")
                    if main and main not in self.essential_files:
                        self.essential_files.append(main)
            except (json.JSONDecodeError, IOError):
                pass

    def to_dict(self) -> Dict:
        """Convert index to dictionary."""
        return {
            "project_path": str(self.project_path),
            "scan_time": datetime.now().isoformat(),
            "total_files": sum(len(files) for files in self.categories.values()),
            "categories": dict(self.categories),
            "essential_files": self.essential_files,
            "file_info": self.file_info
        }

    def to_markdown(self) -> str:
        """Convert index to markdown format."""
        lines = [
            f"# Project File Index: {self.project_path}",
            f"",
            f"**Scanned:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            f"**Total Files:** {sum(len(files) for files in self.categories.values())}",
            ""
        ]

        # Essential files first
        if self.essential_files:
            lines.append("## Essential (startup-critical)")
            lines.append("")
            for f in sorted(self.essential_files):
                info = self.file_info.get(f, {})
                desc = self._get_file_description(f)
                lines.append(f"- `{f}` - {desc}")
            lines.append("")

        # Other categories
        for category in ["source", "config", "docs", "test", "assets", "build", "deps", "temp", "hidden", "other"]:
            files = self.categories.get(category, [])
            if not files:
                continue

            cat_info = CATEGORIES.get(category, {})
            desc = cat_info.get("description", category.title())

            lines.append(f"## {category.title()} ({desc})")
            lines.append("")

            # Group by directory
            by_dir = defaultdict(list)
            for f in sorted(files):
                parts = Path(f).parts
                if len(parts) > 1:
                    by_dir[parts[0]].append(f)
                else:
                    by_dir["."].append(f)

            for dir_name, dir_files in sorted(by_dir.items()):
                if dir_name != "." and len(dir_files) > 3:
                    lines.append(f"- `{dir_name}/` ({len(dir_files)} files)")
                    # Show first few files
                    for f in dir_files[:3]:
                        lines.append(f"  - `{Path(f).name}`")
                    if len(dir_files) > 3:
                        lines.append(f"  - ... and {len(dir_files) - 3} more")
                else:
                    for f in dir_files:
                        lines.append(f"- `{f}`")
            lines.append("")

        return "\n".join(lines)

    def _get_file_description(self, file_path: str) -> str:
        """Get a description for a file based on its name."""
        name = Path(file_path).name

        # Check custom descriptions first
        if name in self.file_descriptions:
            return self.file_descriptions[name]

        # Check by path
        if file_path in self.file_descriptions:
            return self.file_descriptions[file_path]

        # Default descriptions
        descriptions = {
            "package.json": "Dependencies and scripts",
            "README.md": "Project documentation",
            "CLAUDE.md": "Claude instructions",
            ".gitignore": "Git ignore rules",
            "Makefile": "Build automation",
            "Dockerfile": "Container configuration",
            "docker-compose.yml": "Container orchestration",
            "tsconfig.json": "TypeScript configuration",
            ".env.example": "Environment template",
            "LICENSE": "Project license"
        }
        return descriptions.get(name, "Project file")

    def get_files_by_category(self, category: str) -> List[str]:
        """Get all files in a category."""
        return self.categories.get(category, [])

    def get_essential_files(self) -> List[str]:
        """Get essential files for project startup."""
        return self.essential_files

    def export_json(self, output_path: Optional[str] = None) -> str:
        """Export index as JSON."""
        data = self.to_dict()
        json_str = json.dumps(data, indent=2, ensure_ascii=False)

        if output_path:
            with open(output_path, 'w') as f:
                f.write(json_str)

        return json_str


def scan_command(args):
    """Handle scan command."""
    index = FileIndex(args.path)
    result = index.scan()

    if args.format == "json":
        print(index.export_json())
    else:
        print(index.to_markdown())

    # Save to file if requested
    if args.output:
        with open(args.output, 'w') as f:
            if args.format == "json":
                f.write(index.export_json())
            else:
                f.write(index.to_markdown())
        print(f"\nIndex saved to: {args.output}")


def list_command(args):
    """Handle list command."""
    index = FileIndex(args.path)
    index.scan()

    if args.category:
        files = index.get_files_by_category(args.category)
        print(f"## {args.category.title()} Files\n")
        for f in sorted(files):
            print(f"- {f}")
    else:
        print("Available categories:")
        for cat, files in sorted(index.categories.items()):
            print(f"  {cat}: {len(files)} files")


def essentials_command(args):
    """Handle essentials command."""
    index = FileIndex(args.path)
    index.scan()

    print("## Essential Files (Startup Critical)\n")
    for f in sorted(index.get_essential_files()):
        desc = index._get_file_description(f)
        print(f"- `{f}` - {desc}")


def init_command(args):
    """Handle init command - create sample .fileindex config."""
    project_path = Path(args.path).resolve()
    config_path = project_path / ".fileindex"

    if config_path.exists() and not args.force:
        print(f"Config already exists: {config_path}")
        print("Use --force to overwrite")
        return

    # Sample config content
    sample_config = """# File Index Configuration
# Customize how files are categorized in your project
# See .fileindex.example for full documentation

# Essential files (always read first)
essential:
  - package.json
  - README.md
  - CLAUDE.md
  # Add your project-specific essential files:
  # - config/settings.py
  # - docs/architecture.md

# Source directories
source_dirs:
  - src
  - lib
  - app
  # Add your source directories:
  # - core
  # - services

# Test directories
test_dirs:
  - tests
  - test
  - __tests__
  - spec

# Documentation directories
docs_dirs:
  - docs
  - doc

# Asset directories
asset_dirs:
  - public
  - static
  - assets
  - images

# Ignore patterns (like .gitignore)
ignore:
  # Dependencies
  - node_modules/
  - vendor/
  - .venv/
  - __pycache__/

  # Build output
  - dist/
  - build/
  - out/

  # Temporary files
  - *.log
  - *.tmp
  - .cache/

  # Add your custom ignores:
  # - coverage/
  # - .env.local

# File descriptions (optional)
file_descriptions:
  package.json: "Dependencies and scripts"
  README.md: "Project documentation"
  # Add descriptions for your important files:
  # config/settings.py: "Application settings"
"""

    # Create directory if it doesn't exist
    project_path.mkdir(parents=True, exist_ok=True)

    with open(config_path, 'w') as f:
        f.write(sample_config)

    print(f"Created config file: {config_path}")
    print("Edit this file to customize file categorization for your project.")


def main():
    parser = argparse.ArgumentParser(
        description="File Index - Project file categorization tool"
    )
    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # Scan command
    scan_parser = subparsers.add_parser("scan", help="Scan project and create index")
    scan_parser.add_argument("path", help="Project path to scan")
    scan_parser.add_argument("--format", choices=["markdown", "json"], default="markdown")
    scan_parser.add_argument("--output", "-o", help="Output file path")

    # List command
    list_parser = subparsers.add_parser("list", help="List files by category")
    list_parser.add_argument("path", help="Project path")
    list_parser.add_argument("--category", "-c", help="Category to list")

    # Essentials command
    essentials_parser = subparsers.add_parser("essentials", help="Show essential files")
    essentials_parser.add_argument("path", help="Project path")

    # Init command
    init_parser = subparsers.add_parser("init", help="Create sample .fileindex config")
    init_parser.add_argument("path", help="Project path")
    init_parser.add_argument("--force", "-f", action="store_true", help="Overwrite existing config")

    args = parser.parse_args()

    if args.command == "scan":
        scan_command(args)
    elif args.command == "list":
        list_command(args)
    elif args.command == "essentials":
        essentials_command(args)
    elif args.command == "init":
        init_command(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
