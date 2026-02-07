# Task Modal System Architecture

## 📁 Structure

```
frontend/src/components/
├── modals/
│   ├── index.js                           # Central exports
│   └── TaskModal/
│       ├── index.jsx                      # Main TaskModal (for live agents)
│       ├── BuildTaskModal.jsx             # Modal for BuildAgent
│       ├── TaskTemplates.js               # Task definitions (single source of truth)
│       ├── EmptyState.jsx                 # Empty state component
│       ├── TaskGrid.jsx                   # Task selection grid
│       ├── TaskForm.jsx                   # Task configuration form
│       └── CustomTaskBuilder.jsx          # Custom JSON builder
├── BuildAgent.jsx                         # Uses BuildTaskModal
└── TaskPanel.jsx                          # Uses TaskModal
```

## 🎯 Usage

### BuildAgent (Building Agents)
- Tasks sourced from `TaskTemplates.js`
- Clicking tasks marked with `needsConfig: true` opens `BuildTaskModal`
- Modal allows configuration before adding to agent
- Configured tasks show "✓ Configured" badge
- Tasks without config are added immediately

### TaskPanel (Live Agents)
- Full `TaskModal` with category navigation
- Used for executing tasks on connected agents
- Support for file operations, process management, system recon
- Custom JSON mode for advanced users

## 📋 Task Categories

### File Operations (6 tasks)
- `file_list` - List directory contents ⚙️
- `file_search` - Search for files by pattern ⚙️
- `file_read` - Read file contents ⚙️
- `file_download` - Download files ⚙️
- `file_write` - Write data to files ⚙️
- `file_delete` - Delete files/directories ⚙️

### Process Operations (5 tasks)
- `proc_list` - List running processes
- `proc_kill` - Kill process by PID ⚙️
- `proc_kill_name` - Kill by process name ⚙️
- `proc_start` - Start new process ⚙️
- `proc_info` - Get process details ⚙️

### System Reconnaissance (3 tasks)
- `sys_info` - System information
- `priv_check` - Privilege check
- `cmd` - Execute shell command ⚙️

⚙️ = Requires configuration

## 🔧 Adding New Tasks

1. Add to `TaskTemplates.js`:
```javascript
{
  id: 'new_task',
  label: 'New Task',
  icon: '🆕',
  description: 'Task description',
  needsConfig: true, // or false
  fields: [
    { name: 'param1', label: 'Parameter 1', type: 'text', required: true }
  ],
  presets: [
    { label: 'Preset 1', param1: 'value1' }
  ]
}
```

2. Add category mapping in `BuildAgent.jsx`:
```javascript
const categories = {
  // ...
  new_task: 'Category Name'
};
```

3. Task automatically appears in both BuildAgent and TaskPanel!
