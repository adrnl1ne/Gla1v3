#!/usr/bin/with-contenv sh
# Disable embedded Filebeat service - use a long-running noop so s6 treats the
# service as "running" (prevents the container from exiting). The wazuh-indexer
# sidecar performs alert indexing instead.

echo "embedded Filebeat disabled (dummy process)"
# Keep the service alive to satisfy s6 supervision
exec tail -f /dev/null
