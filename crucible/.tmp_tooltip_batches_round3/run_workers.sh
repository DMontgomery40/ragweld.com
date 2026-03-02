#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/davidmontgomery/ragweld.com/crucible"
SRC="/Users/davidmontgomery/ragweld/data/glossary.json"
BATCH_DIR="$ROOT/.tmp_tooltip_batches_round3"
OUT_DIR="$ROOT/.tmp_tooltip_outputs_round3"
LOG_DIR="$OUT_DIR/logs"
mkdir -p "$OUT_DIR" "$LOG_DIR"

MAX_JOBS=${MAX_JOBS:-4}

run_batch() {
  local batch_file="$1"
  local bn
  bn="$(basename "$batch_file" .jsonl)"
  local out_file="$OUT_DIR/${bn}.json"
  local log_file="$LOG_DIR/${bn}.log"
  local prompt_template="$BATCH_DIR/prompt_template.txt"

  if [[ -s "$out_file" ]]; then
    echo "skip ${bn} (exists)"
    return 0
  fi

  local prompt
  prompt="$(cat "$prompt_template")"
  prompt="${prompt//__SRC__/$SRC}"
  prompt="${prompt//__BATCH_FILE__/$batch_file}"
  prompt="${prompt//__OUT_FILE__/$out_file}"

  echo "start ${bn}"
  codex exec \
    --model gpt-5.3-codex \
    -c 'model_reasoning_effort="high"' \
    --dangerously-bypass-approvals-and-sandbox \
    -C "$ROOT" \
    "$prompt" >"$log_file" 2>&1
  echo "done ${bn}"
}

export -f run_batch
export ROOT SRC OUT_DIR LOG_DIR

for f in "$BATCH_DIR"/batch_*.jsonl; do
  [[ -f "$f" ]] || continue
  run_batch "$f" &
  while (( $(jobs -pr | wc -l) >= MAX_JOBS )); do
    sleep 1
  done
done
wait

echo "all workers finished"
