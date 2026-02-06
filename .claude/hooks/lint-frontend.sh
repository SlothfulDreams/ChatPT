#!/bin/bash
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Only run for files inside the frontend directory
if [[ ! "$FILE_PATH" =~ /frontend/ ]]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR/frontend"
npx @biomejs/biome check --write "$FILE_PATH"
