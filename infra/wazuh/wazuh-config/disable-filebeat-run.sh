#!/usr/bin/with-contenv sh
# Disable embedded Filebeat service - we use the wazuh-indexer sidecar instead.
# This script intentionally exits 0 so s6 does not start the real filebeat binary.

echo "embedded Filebeat disabled by overlay run script"
exit 0
