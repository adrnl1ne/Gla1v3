import { useState } from 'react';

export default function CustomTaskBuilder({ formData, setFormData, onSubmit }) {
  const [jsonInput, setJsonInput] = useState(JSON.stringify({
    type: 'cmd',
    params: { command: 'whoami' },
    runOnce: false
  }, null, 2));

  const handleJsonChange = (value) => {
    setJsonInput(value);
    try {
      const parsed = JSON.parse(value);
      setFormData(parsed);
    } catch (e) {
      // Invalid JSON, ignore
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '2rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ color: '#c9d1d9', fontSize: '1.5rem', fontWeight: '700', marginBottom: '0.5rem' }}>
          Custom JSON Task
        </div>
        <div style={{ color: '#8b949e', fontSize: '0.9rem' }}>
          Enter a task in JSON format for advanced configuration
        </div>
      </div>

      <div style={{ flex: 1, marginBottom: '1.5rem' }}>
        <textarea
          value={jsonInput}
          onChange={e => handleJsonChange(e.target.value)}
          placeholder='{"type": "cmd", "params": {"command": "whoami"}, "runOnce": false}'
          style={{
            width: '100%',
            height: '100%',
            background: '#0d1117',
            border: '1px solid #30363d',
            color: '#c9d1d9',
            padding: '1rem',
            borderRadius: 8,
            fontFamily: 'monospace',
            fontSize: '0.9rem',
            resize: 'none'
          }}
        />
      </div>

      <button
        onClick={onSubmit}
        style={{
          background: 'linear-gradient(135deg, #238636 0%, #2ea043 100%)',
          border: 'none',
          color: '#fff',
          padding: '14px 28px',
          borderRadius: 8,
          cursor: 'pointer',
          fontWeight: '700',
          fontSize: '1rem',
          boxShadow: '0 4px 12px rgba(35, 134, 54, 0.3)'
        }}
      >
        🚀 Execute Custom Task
      </button>
    </div>
  );
}
