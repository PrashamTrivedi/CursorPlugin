---
name: cf-analytics-engine
description: Query Cloudflare Workers Analytics Engine datasets using SQL. Use this skill when the user wants to explore, query, or analyze data from their Analytics Engine datasets. Triggers on questions about analytics data, metrics, funnels, usage patterns, or when user mentions "Analytics Engine" or a specific dataset name.
allowed-tools: Bash(git:*), FileSystem, Bash(npm:*), Bash(yarn:*), Bash(lint:*), Bash(test:*), Bash(build:*), Read, Grep, Glob, Task
---

# Cloudflare Analytics Engine Query Skill

Query Workers Analytics Engine datasets via the SQL API.

## Environment Variables Required

```
CLOUDFLARE_ACCOUNT_ID     # 32-char account ID from CF dashboard
CLOUDFLARE_ANALYTICS_TOKEN # API token with Account Analytics Read permission
```

Verify before querying:
```bash
echo "Account: $CLOUDFLARE_ACCOUNT_ID"
echo "Token set: $([ -n "$CLOUDFLARE_ANALYTICS_TOKEN" ] && echo 'yes' || echo 'no')"
```

## Workflow

### 1. Get Dataset Name

Ask user for their dataset name if not provided. Dataset name = the binding name from their Worker's wrangler.toml (e.g., `ANALYTICS`, `WEATHER`, `USAGE`).

### 2. Discover Schema

Run `SHOW TABLES` first, then describe the dataset:

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/analytics_engine/sql" \
  -H "Authorization: Bearer $CLOUDFLARE_ANALYTICS_TOKEN" \
  -d "DESCRIBE $DATASET_NAME" | jq
```

### 3. Query Data

Use `scripts/query.sh` for queries:

```bash
./scripts/query.sh "SELECT * FROM $DATASET_NAME LIMIT 5"
```

## Schema Reference

Analytics Engine datasets have these columns:

| Column | Type | Description |
|--------|------|-------------|
| `timestamp` | DateTime | Auto-populated event time |
| `blob1`-`blob20` | String | String dimensions (indexed: blob1-blob10) |
| `double1`-`double20` | Float64 | Numeric values |
| `index1` | String | Primary index (often customer/user ID) |
| `_sample_interval` | UInt32 | Sampling weight (use for accurate aggregations) |

## Common Query Patterns

### Basic count with sampling
```sql
SELECT SUM(_sample_interval) as total_events
FROM DATASET_NAME
WHERE timestamp >= NOW() - INTERVAL '1' DAY
```

### Group by dimension
```sql
SELECT blob1 as category, SUM(_sample_interval) as count
FROM DATASET_NAME
WHERE timestamp >= NOW() - INTERVAL '7' DAY
GROUP BY category
ORDER BY count DESC
LIMIT 10
```

### Time series (5-min buckets)
```sql
SELECT 
  intDiv(toUInt32(timestamp), 300) * 300 AS t,
  SUM(_sample_interval) as events
FROM DATASET_NAME
WHERE timestamp >= NOW() - INTERVAL '1' DAY
GROUP BY t
ORDER BY t
```

### Weighted average
```sql
SELECT 
  SUM(_sample_interval * double1) / SUM(_sample_interval) AS weighted_avg
FROM DATASET_NAME
WHERE timestamp >= NOW() - INTERVAL '1' DAY
```

### Funnel analysis (multi-step)
```sql
SELECT
  SUM(CASE WHEN blob2 = 'step1' THEN _sample_interval ELSE 0 END) as step1,
  SUM(CASE WHEN blob2 = 'step2' THEN _sample_interval ELSE 0 END) as step2,
  SUM(CASE WHEN blob2 = 'step3' THEN _sample_interval ELSE 0 END) as step3
FROM DATASET_NAME
WHERE timestamp >= NOW() - INTERVAL '7' DAY
```

## Important Notes

- **Always use `_sample_interval`** for counts/sums — data may be sampled
- **Indexed blobs (1-10)** are faster for filtering
- **Time filters first** — always include `timestamp` in WHERE clause
- **LIMIT results** — avoid returning massive datasets
- Output is JSON; pipe through `jq` for formatting
