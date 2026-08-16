export default function Loading() {
  return (
    <main className="shell">
      <div className="loading-header" />
      <div className="loading-hero" />
      <div className="loading-grid">
        {Array.from({ length: 8 }, (_, index) => (
          <div className="loading-card" key={index} />
        ))}
      </div>
    </main>
  );
}
