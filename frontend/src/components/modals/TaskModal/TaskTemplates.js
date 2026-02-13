// Task templates matching actual agent capabilities (TASK_REFERENCE.md)
export const TASK_TEMPLATES = {
  file_operations: {
    label: '📁 File Operations',
    tasks: [
      {
        id: 'file_list',
        label: 'List Directory',
        icon: '📂',
        description: 'List contents of a directory',
        needsConfig: true,
        fields: [
          { name: 'path', label: 'Directory Path', type: 'text', placeholder: '/home/user or C:\\Users', required: true }
        ],
        presets: [
          { label: 'Current Dir', path: '.' },
          { label: 'Home (Linux)', path: '/home' },
          { label: 'Users (Win)', path: 'C:\\Users' },
          { label: 'Temp', path: '/tmp' },
        ]
      },
      {
        id: 'file_search',
        label: 'Search Files',
        icon: '🔍',
        description: 'Find files matching a pattern (max depth: 5)',
        needsConfig: true,
        fields: [
          { name: 'path', label: 'Search Path', type: 'text', placeholder: '/home or C:\\', required: true },
          { name: 'pattern', label: 'Pattern', type: 'text', placeholder: '*.txt or id_rsa*', required: true }
        ],
        presets: [
          { label: 'SSH Keys', path: '/home', pattern: 'id_rsa*' },
          { label: 'Config Files', path: '/etc', pattern: '*.conf' },
          { label: 'Passwords', path: '/home', pattern: '*password*' },
          { label: 'Documents (Win)', path: 'C:\\Users', pattern: '*.docx' },
          { label: 'Logs', path: '/var/log', pattern: '*.log' },
        ]
      },
      {
        id: 'file_read',
        label: 'Read File',
        icon: '📄',
        description: 'Read file contents (base64, max 10MB)',
        needsConfig: true,
        fields: [
          { name: 'path', label: 'File Path', type: 'text', placeholder: '/etc/passwd', required: true }
        ],
        presets: [
          { label: '/etc/passwd', path: '/etc/passwd' },
          { label: '/etc/shadow', path: '/etc/shadow' },
          { label: 'SSH Config', path: '/etc/ssh/sshd_config' },
          { label: 'Hosts File', path: '/etc/hosts' },
        ]
      },
      {
        id: 'file_download',
        label: 'Download File',
        icon: '⬇️',
        description: 'Download file from agent (auto-chunks large files)',
        needsConfig: true,
        fields: [
          { name: 'path', label: 'File Path', type: 'text', placeholder: '/var/log/syslog', required: true }
        ]
      },
      {
        id: 'file_write',
        label: 'Write File',
        icon: '✏️',
        description: 'Write data to file (base64 encoded)',
        needsConfig: true,
        fields: [
          { name: 'path', label: 'File Path', type: 'text', placeholder: '/tmp/test.txt', required: true },
          { name: 'data', label: 'Data (base64)', type: 'textarea', placeholder: 'SGVsbG8gV29ybGQh', required: true },
          { name: 'append', label: 'Append Mode', type: 'checkbox', default: 'false' }
        ]
      },
      {
        id: 'file_delete',
        label: 'Delete File',
        icon: '🗑️',
        description: 'Delete file or directory',
        needsConfig: true,
        fields: [
          { name: 'path', label: 'Path', type: 'text', placeholder: '/tmp/file.txt', required: true },
          { name: 'recursive', label: 'Recursive (dirs)', type: 'checkbox', default: 'false' }
        ]
      }
    ]
  },
  process_operations: {
    label: '⚙️ Process Operations',
    tasks: [
      {
        id: 'proc_list',
        label: 'List Processes',
        icon: '📋',
        description: 'Show all running processes',
        needsConfig: false,
        fields: []
      },
      {
        id: 'proc_kill',
        label: 'Kill Process (PID)',
        icon: '❌',
        description: 'Terminate process by PID',
        needsConfig: true,
        fields: [
          { name: 'pid', label: 'Process ID', type: 'text', placeholder: '1234', required: true }
        ]
      },
      {
        id: 'proc_kill_name',
        label: 'Kill Process (Name)',
        icon: '🎯',
        description: 'Terminate all processes by name',
        needsConfig: true,
        fields: [
          { name: 'name', label: 'Process Name', type: 'text', placeholder: 'chrome.exe or apache2', required: true }
        ],
        presets: [
          { label: 'Chrome', name: 'chrome.exe' },
          { label: 'Firefox', name: 'firefox.exe' },
          { label: 'Notepad', name: 'notepad.exe' },
          { label: 'Apache', name: 'apache2' },
          { label: 'MySQL', name: 'mysqld' },
        ]
      },
      {
        id: 'proc_start',
        label: 'Start Process',
        icon: '▶️',
        description: 'Launch a new process',
        needsConfig: true,
        fields: [
          { name: 'command', label: 'Command', type: 'text', placeholder: 'calc.exe', required: true },
          { name: 'background', label: 'Background', type: 'checkbox', default: 'true' }
        ],
        presets: [
          { label: 'Calculator', command: 'calc.exe', background: 'true' },
          { label: 'Notepad', command: 'notepad.exe', background: 'true' },
          { label: 'CMD', command: 'cmd.exe', background: 'false' },
        ]
      },
      {
        id: 'proc_info',
        label: 'Process Info',
        icon: 'ℹ️',
        description: 'Get detailed process information',
        needsConfig: true,
        fields: [
          { name: 'pid', label: 'Process ID', type: 'text', placeholder: '1234', required: true }
        ]
      }
    ]
  },
  system_recon: {
    label: '🔍 System Reconnaissance',
    tasks: [
      {
        id: 'sys_info',
        label: 'System Info',
        icon: '💻',
        description: 'Get hostname, OS, architecture, kernel version',
        needsConfig: false,
        fields: []
      },
      {
        id: 'priv_check',
        label: 'Privilege Check',
        icon: '🔐',
        description: 'Check if running as root/admin and sudo access',
        needsConfig: false,
        fields: []
      },
      {
        id: 'cmd',
        label: 'Run Command',
        icon: '⌨️',
        description: 'Execute arbitrary shell command',
        needsConfig: true,
        fields: [
          { name: 'command', label: 'Command', type: 'text', placeholder: 'whoami', required: true }
        ],
        presets: [
          { label: 'whoami', command: 'whoami' },
          { label: 'hostname', command: 'hostname' },
          { label: 'ifconfig', command: 'ip addr show || ifconfig' },
          { label: 'ipconfig', command: 'ipconfig /all' },
          { label: 'netstat', command: 'netstat -ano' },
          { label: 'ps aux', command: 'ps aux' },
        ]
      }
    ]
  }
};

// Helper to get all tasks as flat array
export const getAllTasks = () => {
  return Object.values(TASK_TEMPLATES).flatMap(category => category.tasks);
};

// Helper to get task by ID
export const getTaskById = (taskId) => {
  return getAllTasks().find(task => task.id === taskId);
};
