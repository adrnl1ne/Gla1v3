export default function TaskGrid({ category, onTaskSelect }) {
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '2rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ color: '#c9d1d9', fontSize: '1.5rem', fontWeight: '700', marginBottom: '0.5rem' }}>
          {category.label}
        </div>
        <div style={{ color: '#8b949e', fontSize: '0.9rem' }}>
          Select a task to configure and execute
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '1.5rem'
      }}>
        {category.tasks.map(task => (
          <button
            key={task.id}
            onClick={() => onTaskSelect(task)}
            style={{
              background: 'rgba(22, 27, 34, 0.6)',
              border: '1px solid rgba(48, 54, 61, 0.8)',
              borderRadius: 12,
              padding: '1.5rem',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.3s',
              color: '#c9d1d9'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(88, 166, 255, 0.1)';
              e.currentTarget.style.borderColor = '#58a6ff';
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(88, 166, 255, 0.2)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(22, 27, 34, 0.6)';
              e.currentTarget.style.borderColor = 'rgba(48, 54, 61, 0.8)';
              e.currentTarget.style.transform = 'none';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>{task.icon}</div>
            <div style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '0.5rem', color: '#58a6ff' }}>
              {task.label}
            </div>
            <div style={{ fontSize: '0.85rem', color: '#8b949e', lineHeight: '1.4' }}>
              {task.description}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
