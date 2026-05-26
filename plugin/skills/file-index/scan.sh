#!/bin/bash
# Quick scan wrapper for file-index skill
# Usage: ./scan.sh /path/to/project [format]

PROJECT_PATH="${1:-.}"
FORMAT="${2:-markdown}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

python3 "$SCRIPT_DIR/file_index.py" scan "$PROJECT_PATH" --format "$FORMAT"
