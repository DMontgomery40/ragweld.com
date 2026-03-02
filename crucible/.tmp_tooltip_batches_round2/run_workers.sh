#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/davidmontgomery/ragweld.com/crucible"
SRC="/Users/davidmontgomery/ragweld/data/glossary.json"
BATCH_DIR="$ROOT/.tmp_tooltip_batches_round2"
OUT_DIR="$ROOT/.tmp_tooltip_outputs_round2"
LOG_DIR="$ROOT/.tmp_tooltip_outputs_round2/logs"
mkdir -p "$OUT_DIR" "$LOG_DIR"

MAX_JOBS=${MAX_JOBS:-6}

run_batch() {
  local batch_file="$1"
  local bn
  bn="$(basename "$batch_file" .jsonl)"
  local out_file="$OUT_DIR/${bn}.json"
  local log_file="$LOG_DIR/${bn}.log"
  local prompt_template="$BATCH_DIR/prompt_template.txt"

  local prompt
  prompt="$(cat "$prompt_template")"
  prompt="${prompt//__SRC__/$SRC}"
  prompt="${prompt//__BATCH_FILE__/$batch_file}"
  prompt="${prompt//__OUT_FILE__/$out_file}"

  codex exec \
    --model gpt-5.3-codex \
    -c 'model_reasoning_effort="high"' \
    --dangerously-bypass-approvals-and-sandbox \
    -C "$ROOT" \
    "$prompt" >"$log_file" 2>&1
}

export -f run_batch
export ROOT SRC OUT_DIR LOG_DIR

active=0
for f in "$BATCH_DIR"/batch_*.jsonl; do
  if [[ ! -f "$f" ]]; then
    continue
  fi
  run_batch "$f" &
  while (( $(jobs -pr | wc -l) >= MAX_JOBS )); do
    sleep 1
  done
done
wait

echo "all workers finished"
