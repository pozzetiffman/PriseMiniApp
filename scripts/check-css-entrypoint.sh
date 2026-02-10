#!/usr/bin/env bash
# Stage 9: CSS entrypoint guardrails — no deprecated imports, only @import+comments, section order.
# Run from repo root: bash scripts/check-css-entrypoint.sh  OR  npm run check:css

set -e
ENTRYPOINT="${1:-webapp/css/style.css}"
MODULES_DIR="${2:-webapp/css/modules}"
# If script is run from repo root, paths are correct; else allow override via env
ROOT="${CSS_CHECK_ROOT:-.}"
FILE="$ROOT/$ENTRYPOINT"

if [ ! -f "$FILE" ]; then
  echo "ERROR: Entrypoint not found: $FILE"
  exit 1
fi

FAIL=0

# --- A) No import of deprecated modules ---
for dep in "40-product-page.css" "91-admin-modals.css"; do
  if grep -q "./modules/$dep" "$FILE"; then
    echo "ERROR (A): Deprecated module must not be imported: $dep"
    FAIL=1
  fi
done

# --- B) style.css must contain only @import, comments, empty lines (no CSS rules/selectors/braces) ---
if grep -q '[{}]' "$FILE"; then
  echo "ERROR (B): style.css must not contain CSS rules (curly braces). Only @import and comments allowed."
  grep -n '[{}]' "$FILE" || true
  FAIL=1
fi
# Any line that is not empty, not a comment, and not an @import is forbidden
while IFS= read -r line; do
  line_num="${line%%:*}"
  rest="${line#*:}"
  stripped=$(printf '%s' "$rest" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  [ -z "$stripped" ] && continue
  printf '%s' "$stripped" | grep -q '^/\*' && continue
  printf '%s' "$stripped" | grep -q '^@import url("./modules/' && continue
  echo "ERROR (B): style.css line $line_num contains disallowed content (only @import and comments allowed): $rest"
  FAIL=1
done < <(grep -n '^' "$FILE")

# --- C) Section order: each section comment must appear exactly once in order ---
SECTIONS=(
  "TOKENS"
  "BASE"
  "LAYOUT"
  "COMPONENTS"
  "MODALS/OVERLAYS"
  "PAGES"
  "ADMIN"
)
last_pos=0
for sec in "${SECTIONS[@]}"; do
  pattern="/* $sec */"
  pos=$(grep -nF "$pattern" "$FILE" 2>/dev/null | head -1 | cut -d: -f1 || true)
  if [ -z "$pos" ]; then
    echo "ERROR (C): Missing section comment: /* $sec */"
    FAIL=1
  elif [ "$pos" -le "$last_pos" ]; then
    echo "ERROR (C): Section /* $sec */ is out of order (expected after position $last_pos, found at $pos)"
    FAIL=1
  else
    last_pos="$pos"
  fi
done
# Check each appears only once
for sec in "${SECTIONS[@]}"; do
  pattern="/* $sec */"
  count=$(grep -cF "$pattern" "$FILE" 2>/dev/null || true)
  if [ "${count:-0}" -gt 1 ]; then
    echo "ERROR (C): Section /* $sec */ must appear exactly once (found $count times)"
    FAIL=1
  fi
done

if [ "$FAIL" -eq 1 ]; then
  echo "---"
  echo "Fix the above and run again: npm run check:css"
  exit 1
fi

# --- D) Metrics (always printed) ---
IMP=$(grep -R "!important" "$ROOT/$MODULES_DIR" 2>/dev/null | wc -l | tr -d ' ')
STYLEATTR=$(grep -R '\[style\*=' "$ROOT/$MODULES_DIR" 2>/dev/null | wc -l | tr -d ' ')
echo "count !important: $IMP"
echo "count [style*=]: $STYLEATTR"

echo "OK: css entrypoint validated"
exit 0
