import { useState } from 'react';
import { getTaskById } from './TaskTemplates';
import TaskForm from './TaskForm';

/**
 * BuildTaskModal - Modal for configuring tasks during agent building
 * Shows task configuration form and returns configured task data
 */
export default function BuildTaskModal({ taskId, onClose, onSave }) {
  const task = getTaskById(taskId);
  const [formData, setFormData] = useState({});

  if (!task) {
    return null;
  }

  const handleFieldChange = (fieldName, value) => {
    setFormData({ ...formData, [fieldName]: value });
  };

  const handlePresetClick = (preset) => {
    setFormData({ ...formData, ...preset });
  };

  const handleSave = () => {
    // Validate required fields
    const missingFields = task.fields
      .filter(f => f.required && !formData[f.name])
      .map(f => f.label);

    if (missingFields.length > 0) {
      alert(`Missing required fields: ${missingFields.join(', ')}`);
      return;
    }

    // Return configured task data
    onSave({
      id: taskId,
      type: taskId,
      params: { ...formData },
      runOnce: true // Default for build-time tasks
    });
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      backdropFilter: 'blur(4px)'
    }}>
      <div style={{
        width: '90vw',
        maxWidth: '700px',
        maxHeight: '85vh',
        background: 'linear-gradient(135deg, #0d1117 0%, #161b22 100%)',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(88, 166, 255, 0.3)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1.5rem 2rem',
          borderBottom: '1px solid rgba(48, 54, 61, 0.5)',
          background: 'rgba(22, 27, 34, 0.8)',
          backdropFilter: 'blur(10px)'
        }}>
          <div>
            <div style={{ color: '#58a6ff', fontWeight: '700', fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.8rem' }}>{task.icon}</span>
              Configure Task
            </div>
            <div style={{ color: '#8b949e', fontSize: '0.9rem', marginTop: '0.25rem' }}>
              {task.label} - {task.description}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid #30363d',
              color: '#58a6ff',
              padding: '8px 16px',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.9rem',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => e.target.style.background = '#21262d'}
            onMouseLeave={e => e.target.style.background = 'transparent'}
          >
            ✕ Cancel
          </button>
        </div>

        {/* Task Configuration Content */}
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
                    onClick={() => handlePresetClick(preset)}
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
                          onChange={e => handleFieldChange(field.name, e.target.checked ? 'true' : 'false')}
                          style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                        />
                        <span style={{ color: '#8b949e', fontSize: '0.85rem' }}>Enable</span>
                      </label>
                    ) : field.type === 'textarea' ? (
                      <textarea
                        value={formData[field.name] || ''}
                        onChange={e => handleFieldChange(field.name, e.target.value)}
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
                        onChange={e => handleFieldChange(field.name, e.target.value)}
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
              This task requires no configuration. Click "Add Task" to include it in your agent.
            </div>
          )}
        </div>

        {/* Footer with Save Button */}
        <div style={{
          padding: '1.5rem 2rem',
          borderTop: '1px solid rgba(48, 54, 61, 0.5)',
          background: 'rgba(13, 17, 23, 0.5)',
          display: 'flex',
          gap: '1rem'
        }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              background: 'transparent',
              border: '1px solid #30363d',
              color: '#c9d1d9',
              padding: '12px 24px',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '1rem',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => e.target.style.background = '#21262d'}
            onMouseLeave={e => e.target.style.background = 'transparent'}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              flex: 2,
              background: 'linear-gradient(135deg, #238636 0%, #2ea043 100%)',
              border: 'none',
              color: '#fff',
              padding: '12px 24px',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: '700',
              fontSize: '1rem',
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
            ✓ Add Task to Agent
          </button>
        </div>
      </div>
    </div>
  );
}
