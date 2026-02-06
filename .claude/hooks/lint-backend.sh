#!/bin/bash
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Only run for Python files inside the backend directory
if [[ ! "$FILE_PATH" =~ /backend/ ]] || [[ ! "$FILE_PATH" =~ \.py$ ]]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR/backend"
uv tool run ruff check --fix "$FILE_PATH"
uv tool run ruff format "$FILE_PATH"
