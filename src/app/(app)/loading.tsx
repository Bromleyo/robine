export default function AppLoading() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{
        height: 57, borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', padding: '0 24px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ width: 140, height: 14, borderRadius: 6, background: 'var(--surface-sunken)' }} />
      </div>
      <div style={{ flex: 1, padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {[80, 60, 60, 60, 60].map((w, i) => (
          <div key={i} style={{
            height: 14, width: `${w}%`, maxWidth: 600,
            borderRadius: 6, background: 'var(--surface-sunken)',
            opacity: 1 - i * 0.15,
          }} />
        ))}
      </div>
    </div>
  )
}
