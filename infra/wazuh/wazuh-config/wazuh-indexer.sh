#!/bin/sh

echo "Wazuh OpenSearch Indexer starting..."
echo "Monitoring Wazuh alert files for new alerts..."

# Wait for OpenSearch to be ready
echo "Waiting for OpenSearch..."
until curl -f http://opensearch:9200/_cluster/health > /dev/null 2>&1; do
  echo "OpenSearch not ready, waiting..."
  sleep 5
done
echo "OpenSearch is ready!"

# All-in-one image stores alerts in /var/ossec/logs/alerts/
ALERT_DIR="/var/ossec/logs/alerts"
ALERT_FILE="$ALERT_DIR/alerts.json"
LAST_POSITION=0

# Get initial file size if it exists
if [ -f "$ALERT_FILE" ]; then
  LAST_POSITION=$(wc -c < "$ALERT_FILE")
fi

while true; do
  if [ -f "$ALERT_FILE" ]; then
    CURRENT_SIZE=$(wc -c < "$ALERT_FILE")

    # If file has grown, read new content
    if [ "$CURRENT_SIZE" -gt "$LAST_POSITION" ]; then
      # Read the tail of the file to get new alerts
      tail -c +$((LAST_POSITION + 1)) "$ALERT_FILE" | grep -o '^{.*}' | while IFS= read -r alert; do
        if [ -n "$alert" ]; then
          # Extract timestamp for index name
          timestamp=$(echo "$alert" | grep -o '"timestamp":"[^"]*' | cut -d'"' -f4 | cut -d'T' -f1)
          if [ -z "$timestamp" ]; then
            timestamp=$(date +%Y-%m-%d)
          fi
          index_name="wazuh-alerts-${timestamp}"

          # Send to OpenSearch
          response=$(echo "$alert" | curl -s -X POST "http://opensearch:9200/${index_name}/_doc" \
            -H "Content-Type: application/json" \
            -d @- 2>&1)

          if echo "$response" | grep -q '"_id"'; then
            echo "✓ Indexed alert to ${index_name}"
          else
            echo "✗ Failed to index alert"
          fi
        fi
      done

      LAST_POSITION=$CURRENT_SIZE
    fi
  fi

  sleep 3
done