# Agents (developer reference)

Purpose: concise developer guide for the Go agents (build, run, packaging, tasks).

## Agent types
- `agent` — persistent beaconing agent (default)
- `agent-fileenum` — one-shot file enumeration
- `agent-regenum` — registry enumeration (Windows)
- `agent-netscan` — local network scanner
- `agent-sysinfo` — system profiling

## Build
- Build all agents:
  ```bash
  cd agents-go
  go build -o bin/agent.exe ./cmd/agent
  go build -o bin/agent-fileenum.exe ./cmd/agent-fileenum
  ```
- Cross-compile (Linux):
  ```bash
  GOOS=linux GOARCH=amd64 go build -o bin/agent-linux ./cmd/agent
  ```

## Run (developer/test)
- Required env vars:
  - `AGENT_CERT_PATH`, `AGENT_KEY_PATH`, `AGENT_CA_PATH`, `C2_URL`
- Run:
  ```bash
  ./bin/agent.exe
  ```

## Deployment notes
- Agents use mTLS client certificates — keep keys secure
- Embedding configuration produces single binaries suitable for transport
- Specialized one-shot agents are designed to be ephemeral and easier to audit

## Task system (summary)
- Agents accept typed tasks from the C2 server (`sys_info`, `cmd`, `file_read`, etc.)
- Results are posted back as `TaskResult` objects
- See `docs/developer/TASK_REFERENCE.md` for full details

## Security & testing
- Use only in authorized lab/test environments
- Default build and test workflows intentionally noisy — expect EDR alerts
- Change default credentials before any public testing

---
*Draft — confirm if you want this file moved to a different path or renamed.*