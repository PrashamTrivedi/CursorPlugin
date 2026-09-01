#!/bin/bash
# Analyze funnel conversion in Analytics Engine
# Usage: ./funnel.sh DATASET STEP_COLUMN "step1,step2,step3" [DAYS]
# Example: ./funnel.sh EVENTS blob2 "signup,verify,purchase" 7

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "$3" ]; then
    echo "Usage: $0 DATASET STEP_COLUMN \"step1,step2,step3\" [DAYS]" >&2
    echo "" >&2
    echo "Arguments:" >&2
    echo "  DATASET      - Analytics Engine dataset name" >&2
    echo "  STEP_COLUMN  - Column containing step names (e.g., blob1, blob2)" >&2
    echo "  STEPS        - Comma-separated step names in order" >&2
    echo "  DAYS         - Days to analyze (default: 7)" >&2
    echo "" >&2
    echo "Example:" >&2
    echo "  $0 USER_EVENTS blob2 \"page_view,signup,purchase\" 30" >&2
    exit 1
fi

DATASET="$1"
STEP_COLUMN="$2"
STEPS="$3"
DAYS="${4:-7}"

# Build CASE statements for each step
IFS=',' read -ra STEP_ARRAY <<< "$STEPS"
CASE_STATEMENTS=""
SELECT_FIELDS=""

for i in "${!STEP_ARRAY[@]}"; do
    step="${STEP_ARRAY[$i]}"
    step_name=$(echo "$step" | tr -d ' ')
    
    if [ -n "$CASE_STATEMENTS" ]; then
        CASE_STATEMENTS="$CASE_STATEMENTS,"$'\n'
        SELECT_FIELDS="$SELECT_FIELDS,"$'\n'
    fi
    
    CASE_STATEMENTS="$CASE_STATEMENTS  SUM(CASE WHEN $STEP_COLUMN = '$step_name' THEN _sample_interval ELSE 0 END) as step_$((i+1))_$step_name"
    SELECT_FIELDS="$SELECT_FIELDS  step_$((i+1))_$step_name"
done

# Build the query
QUERY="SELECT
$CASE_STATEMENTS
FROM $DATASET
WHERE timestamp >= NOW() - INTERVAL '$DAYS' DAY"

echo "=== FUNNEL: $DATASET (last $DAYS days) ==="
echo "Steps: $STEPS"
echo "Column: $STEP_COLUMN"
echo ""

"$SCRIPT_DIR/query.sh" "$QUERY"

echo ""
echo "=== CONVERSION RATES ==="
# Run a second query to calculate percentages
RATE_QUERY="WITH funnel AS (
  SELECT
$CASE_STATEMENTS
  FROM $DATASET
  WHERE timestamp >= NOW() - INTERVAL '$DAYS' DAY
)
SELECT * FROM funnel"

"$SCRIPT_DIR/query.sh" "$RATE_QUERY"
