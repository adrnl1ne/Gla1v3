# Agent Modules (pkg/ overview)

Purpose: explain `agents-go/pkg/` package responsibilities and where to extend functionality.

## Packages
- `config` — runtime and build-time configuration
- `client` — mTLS HTTP client logic (C2/API)
- `tasks` — task execution engine and result submission
- `system` — OS-specific info collectors
- `network` — gateway detection and hosts management
- `beacon` — beacon loop and task polling

## How to add functionality
1. Add function in the relevant package (unit tests required)
2. Wire into `tasks/executor.go` (for new task types)
3. Add integration test under `pkg/` and update `pkg/README.md` if necessary

## Testing & building
- Unit tests per package: `go test ./pkg/<package>`
- Integration: `go test ./pkg/...`
- Build flags: use `-ldflags` for compile-time vars

---
*Draft — mirrors style found in `docs/`.*