#!/bin/bash
# Query Cloudflare Analytics Engine SQL API
# Usage: ./query.sh "SELECT * FROM DATASET LIMIT 10"
# Usage: ./query.sh "SHOW TABLES"
# Usage: ./query.sh "DESCRIBE DATASET_NAME"

set -e

# Check required env vars
if [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
    echo "Error: CLOUDFLARE_ACCOUNT_ID not set" >&2
    exit 1
fi

if [ -z "$CLOUDFLARE_ANALYTICS_TOKEN" ]; then
    echo "Error: CLOUDFLARE_ANALYTICS_TOKEN not set" >&2
    exit 1
fi

# Check for query argument
if [ -z "$1" ]; then
    echo "Usage: $0 \"SQL_QUERY\"" >&2
    echo "Examples:" >&2
    echo "  $0 \"SHOW TABLES\"" >&2
    echo "  $0 \"DESCRIBE MY_DATASET\"" >&2
    echo "  $0 \"SELECT * FROM MY_DATASET LIMIT 5\"" >&2
    exit 1
fi

SQL_QUERY="$1"
API_URL="https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/analytics_engine/sql"

# Execute query
response=$(curl -s -w "\n%{http_code}" "$API_URL" \
    -H "Authorization: Bearer $CLOUDFLARE_ANALYTICS_TOKEN" \
    -H "Content-Type: text/plain" \
    -d "$SQL_QUERY")

# Extract HTTP status code (last line)
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

# Check for errors
if [ "$http_code" != "200" ]; then
    echo "HTTP Error: $http_code" >&2
    echo "$body" | jq . 2>/dev/null || echo "$body" >&2
    exit 1
fi

# Output result (pretty print if jq available)
if command -v jq &> /dev/null; then
    echo "$body" | jq .
else
    echo "$body"
fi
