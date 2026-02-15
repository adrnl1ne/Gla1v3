# Agent Task Reference (developer)

Quick, precise reference for all agent task types and expected parameters/outputs.

## Common envelope
- `id` — unique task id
- `type` — task type (see below)
- `params` — key/value string parameters
- `runOnce` — `true` / `false`

## Supported tasks (summary)
- `sys_info` — collect host metadata (no params)
- `priv_check` — report privilege level (no params)
- `cmd` — execute shell command
  - params: `command`
- `file_list` / `file_read` / `file_write` / `file_delete` — file operations
  - params: `path`, (`data` for write, base64)
- `file_download` — prepare large-file transfer (chunked)
- `proc_list` / `proc_kill` / `proc_start` — process management

## Examples
- Run `whoami`:
  ```json
  {"id":"task-003","type":"cmd","params":{"command":"whoami"},"runOnce":false}
  ```

## Response format
```json
{
  "taskId":"task-001",
  "type":"sys_info",
  "status":"completed",
  "output":"{...}",
  "error":""
}
```
- `status`: `completed` | `failed`
- `output`: JSON or base64 (when applicable)

## Limits & safety
- File read max: 10MB (chunking enforced)
- All file data is base64-encoded when binary
- Tasks that require elevation will return an error when run as an unprivileged user

## Adding new task types
- Implement handler in `agents-go/pkg/tasks/executor.go`
- Add task ID/type to `TASK_REFERENCE.md` and update tests

---
*Draft — ready for review.*