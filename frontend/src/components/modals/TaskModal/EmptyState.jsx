export default function EmptyState() {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#8b949e',
      padding: '2rem'
    }}>
      <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎯</div>
      <div style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: '0.5rem' }}>Select a Task Category</div>
      <div style={{ fontSize: '0.9rem', opacity: 0.7 }}>Choose from file operations, process management, or system reconnaissance</div>
    </div>
  );
}
