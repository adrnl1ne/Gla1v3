FROM wazuh/wazuh-manager:4.8.2

# Disable Filebeat service since we don't need Wazuh indexer integration
RUN touch /etc/services.d/filebeat/down

# The manager will only run core Wazuh services:
# - wazuh-manager (receives agent events)
# - wazuh-api (REST API for integration)
# - wazuh-authd (agent enrollment)
