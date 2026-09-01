#!/bin/bash
# Explore a Cloudflare Analytics Engine dataset
# Usage: ./explore.sh DATASET_NAME
# Shows: schema + sample data + basic stats

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "$1" ]; then
    echo "Usage: $0 DATASET_NAME" >&2
    echo "" >&2
    echo "First, list available datasets:" >&2
    echo "  $SCRIPT_DIR/query.sh \"SHOW TABLES\"" >&2
    exit 1
fi

DATASET="$1"

echo "=== SCHEMA: $DATASET ==="
"$SCRIPT_DIR/query.sh" "DESCRIBE $DATASET"

echo ""
echo "=== SAMPLE DATA (5 rows) ==="
"$SCRIPT_DIR/query.sh" "SELECT * FROM $DATASET ORDER BY timestamp DESC LIMIT 5"

echo ""
echo "=== STATS (last 24h) ==="
"$SCRIPT_DIR/query.sh" "SELECT 
  SUM(_sample_interval) as total_events,
  MIN(timestamp) as earliest,
  MAX(timestamp) as latest,
  COUNT(DISTINCT blob1) as unique_blob1_values
FROM $DATASET 
WHERE timestamp >= NOW() - INTERVAL '1' DAY"

echo ""
echo "=== TOP blob1 VALUES (last 24h) ==="
"$SCRIPT_DIR/query.sh" "SELECT 
  blob1,
  SUM(_sample_interval) as count
FROM $DATASET 
WHERE timestamp >= NOW() - INTERVAL '1' DAY
  AND blob1 != ''
GROUP BY blob1
ORDER BY count DESC
LIMIT 10"
