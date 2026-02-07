import { useState } from 'react';
import { TASK_TEMPLATES } from './TaskTemplates';
import EmptyState from './EmptyState';
import TaskGrid from './TaskGrid';
import TaskForm from './TaskForm';
import CustomTaskBuilder from './CustomTaskBuilder';

export default function TaskModal({ agent, onClose, onSubmit }) {
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [formData, setFormData] = useState({});
  const [showCustom, setShowCustom] = useState(false);

  const handleCategorySelect = (categoryKey) => {
    setSelectedCategory(categoryKey);
    setSelectedTask(null);
    setFormData({});
  };

  const handleTaskSelect = (task) => {
    setSelectedTask(task);
    // Initialize form data with defaults
    const initialData = {};
    task.fields.forEach(field => {
      if (field.default !== undefined) {
        initialData[field.name] = field.default;
      }
    });
    setFormData(initialData);
  };

  const handlePresetClick = (preset) => {
    setFormData({ ...formData, ...preset });
  };

  const handleFieldChange = (fieldName, value) => {
    setFormData({ ...formData, [fieldName]: value });
  };

  const handleSubmit = () => {
    if (!selectedTask) return;

    // Validate required fields
    const missingFields = selectedTask.fields
      .filter(f => f.required && !formData[f.name])
      .map(f => f.label);

    if (missingFields.length > 0) {
      alert(`Missing required fields: ${missingFields.join(', ')}`);
      return;
    }

    // Build task object
    const task = {
      id: `task-${Date.now()}`,
      type: selectedTask.id,
      params: { ...formData },
      runOnce: false
    };

    onSubmit(task);
    onClose();
  };

  const handleCustomSubmit = () => {
    const task = {
      id: `task-${Date.now()}`,
      type: formData.type || 'cmd',
      params: formData.params || {},
      runOnce: formData.runOnce || false
    };
    onSubmit(task);
    onClose();
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
        maxWidth: '1200px',
        height: '85vh',
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
            <div style={{ color: '#58a6ff', fontWeight: '700', fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.8rem' }}>🎯</span>
              Task Builder
            </div>
            <div style={{ color: '#8b949e', fontSize: '0.9rem', marginTop: '0.25rem' }}>
              Agent: {agent.id} | {agent.cn}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid #30363d',
              color: '#58a6ff',
              padding: '10px 20px',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.95rem',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => e.target.style.background = '#21262d'}
            onMouseLeave={e => e.target.style.background = 'transparent'}
          >
            ✕ Close
          </button>
        </div>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Category Sidebar */}
          <div style={{
            width: '280px',
            borderRight: '1px solid rgba(48, 54, 61, 0.5)',
            background: 'rgba(13, 17, 23, 0.5)',
            display: 'flex',
            flexDirection: 'column',
            padding: '1.5rem 0'
          }}>
            <div style={{ padding: '0 1.5rem', marginBottom: '1rem' }}>
              <div style={{ color: '#8b949e', fontSize: '0.75rem', fontWeight: '600', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Task Categories
              </div>
            </div>

            {Object.entries(TASK_TEMPLATES).map(([key, category]) => (
              <button
                key={key}
                onClick={() => handleCategorySelect(key)}
                style={{
                  background: selectedCategory === key ? 'rgba(88, 166, 255, 0.15)' : 'transparent',
                  border: 'none',
                  borderLeft: selectedCategory === key ? '3px solid #58a6ff' : '3px solid transparent',
                  color: selectedCategory === key ? '#58a6ff' : '#c9d1d9',
                  padding: '1rem 1.5rem',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '0.95rem',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem'
                }}
                onMouseEnter={e => {
                  if (selectedCategory !== key) {
                    e.target.style.background = 'rgba(88, 166, 255, 0.05)';
                  }
                }}
                onMouseLeave={e => {
                  if (selectedCategory !== key) {
                    e.target.style.background = 'transparent';
                  }
                }}
              >
                {category.label}
              </button>
            ))}

            <button
              onClick={() => { setShowCustom(true); setSelectedCategory(null); setSelectedTask(null); }}
              style={{
                background: showCustom ? 'rgba(88, 166, 255, 0.15)' : 'transparent',
                border: 'none',
                borderLeft: showCustom ? '3px solid #58a6ff' : '3px solid transparent',
                color: showCustom ? '#58a6ff' : '#c9d1d9',
                padding: '1rem 1.5rem',
                textAlign: 'left',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.95rem',
                marginTop: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem'
              }}
            >
              ⚡ Custom JSON
            </button>
          </div>

          {/* Main Content */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {showCustom ? (
              <CustomTaskBuilder formData={formData} setFormData={setFormData} onSubmit={handleCustomSubmit} />
            ) : !selectedCategory ? (
              <EmptyState />
            ) : !selectedTask ? (
              <TaskGrid
                category={TASK_TEMPLATES[selectedCategory]}
                onTaskSelect={handleTaskSelect}
              />
            ) : (
              <TaskForm
                task={selectedTask}
                formData={formData}
                onFieldChange={handleFieldChange}
                onPresetClick={handlePresetClick}
                onSubmit={handleSubmit}
                onBack={() => setSelectedTask(null)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
