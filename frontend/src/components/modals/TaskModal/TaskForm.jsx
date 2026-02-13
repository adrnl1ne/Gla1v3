export default function TaskForm({ task, formData, onFieldChange, onPresetClick, onSubmit, onBack }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '2rem', borderBottom: '1px solid rgba(48, 54, 61, 0.5)' }}>
        <button
          onClick={onBack}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#58a6ff',
            cursor: 'pointer',
            fontSize: '0.9rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          ← Back to tasks
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '2.5rem' }}>{task.icon}</span>
          <div>
            <div style={{ color: '#c9d1d9', fontSize: '1.5rem', fontWeight: '700' }}>{task.label}</div>
            <div style={{ color: '#8b949e', fontSize: '0.9rem' }}>{task.description}</div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '2rem' }}>
        {task.presets && task.presets.length > 0 && (
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ color: '#8b949e', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Quick Presets
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
              {task.presets.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => onPresetClick(preset)}
                  style={{
                    background: 'rgba(88, 166, 255, 0.1)',
                    border: '1px solid rgba(88, 166, 255, 0.3)',
                    color: '#58a6ff',
                    padding: '0.5rem 1rem',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: '500',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => {
                    e.target.style.background = 'rgba(88, 166, 255, 0.2)';
                    e.target.style.borderColor = '#58a6ff';
                  }}
                  onMouseLeave={e => {
                    e.target.style.background = 'rgba(88, 166, 255, 0.1)';
                    e.target.style.borderColor = 'rgba(88, 166, 255, 0.3)';
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {task.fields.length > 0 && (
          <div>
            <div style={{ color: '#8b949e', fontSize: '0.85rem', fontWeight: '600', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Configuration
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {task.fields.map(field => (
                <div key={field.name}>
                  <label style={{
                    display: 'block',
                    color: '#c9d1d9',
                    fontSize: '0.9rem',
                    marginBottom: '0.5rem',
                    fontWeight: '600'
                  }}>
                    {field.label}
                    {field.required && <span style={{ color: '#f85149', marginLeft: '0.25rem' }}>*</span>}
                  </label>
                  
                  {field.type === 'checkbox' ? (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formData[field.name] === 'true' || formData[field.name] === true}
                        onChange={e => onFieldChange(field.name, e.target.checked ? 'true' : 'false')}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      <span style={{ color: '#8b949e', fontSize: '0.85rem' }}>Enable</span>
                    </label>
                  ) : field.type === 'textarea' ? (
                    <textarea
                      value={formData[field.name] || ''}
                      onChange={e => onFieldChange(field.name, e.target.value)}
                      placeholder={field.placeholder}
                      rows={4}
                      style={{
                        width: '100%',
                        background: '#0d1117',
                        border: '1px solid #30363d',
                        color: '#c9d1d9',
                        padding: '12px',
                        borderRadius: 8,
                        fontFamily: 'monospace',
                        fontSize: '0.9rem',
                        resize: 'vertical'
                      }}
                    />
                  ) : (
                    <input
                      type={field.type}
                      value={formData[field.name] || ''}
                      onChange={e => onFieldChange(field.name, e.target.value)}
                      placeholder={field.placeholder}
                      style={{
                        width: '100%',
                        background: '#0d1117',
                        border: '1px solid #30363d',
                        color: '#c9d1d9',
                        padding: '12px',
                        borderRadius: 8,
                        fontFamily: field.type === 'text' ? 'monospace' : 'inherit',
                        fontSize: '0.9rem'
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {task.fields.length === 0 && (
          <div style={{
            background: 'rgba(88, 166, 255, 0.05)',
            border: '1px solid rgba(88, 166, 255, 0.2)',
            borderRadius: 8,
            padding: '1.5rem',
            color: '#8b949e',
            textAlign: 'center'
          }}>
            This task requires no configuration. Click "Execute Task" to run it.
          </div>
        )}
      </div>

      <div style={{
        padding: '1.5rem 2rem',
        borderTop: '1px solid rgba(48, 54, 61, 0.5)',
        background: 'rgba(13, 17, 23, 0.5)'
      }}>
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
            width: '100%',
            boxShadow: '0 4px 12px rgba(35, 134, 54, 0.3)',
            transition: 'all 0.2s'
          }}
          onMouseEnter={e => {
            e.target.style.transform = 'translateY(-2px)';
            e.target.style.boxShadow = '0 6px 16px rgba(35, 134, 54, 0.4)';
          }}
          onMouseLeave={e => {
            e.target.style.transform = 'none';
            e.target.style.boxShadow = '0 4px 12px rgba(35, 134, 54, 0.3)';
          }}
        >
          🚀 Execute Task
        </button>
      </div>
    </div>
  );
}
