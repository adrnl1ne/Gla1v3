Gla1v3 Revamp — Phase 0: Wazuh Cleanup
(Complete this before starting Phase 1)

---
Goal

Remove all Wazuh EDR components from the codebase entirely. Wazuh will be replaced
by a custom SIEM at a later stage. This phase has no dependencies and is a prerequisite
for all subsequent phases.

---
Tasks

- Delete infra/wazuh/ directory
- Delete infra/wazuh-indexer.sh
- Delete any other Wazuh-related scripts found in infra/scripts/
- Remove all Wazuh references from documentation (docs/, README.md)
- Remove any Wazuh health checks or monitoring endpoints

---
Search Commands

Use these to locate everything that needs to be removed:

  # Find Wazuh directories and files
  find . -type d -name "*wazuh*"
  find . -type f -name "*wazuh*"

  # Find Wazuh references in config, docs, and scripts
  grep -r "wazuh" --include="*.md" --include="*.yml" --include="*.sh"

---
Files to Delete

  infra/wazuh/                  (entire directory)
  infra/wazuh-indexer.sh

---
Verification

- Re-run the grep search commands above — zero results expected
- docker-compose config should parse without errors after removal
- No Wazuh-related containers should appear in docker-compose ps
