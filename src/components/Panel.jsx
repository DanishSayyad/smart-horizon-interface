function Panel({ className = '', label }) {
  return (
    <section className={`panel ${className}`} aria-label={label}>
      {label && <span className="sr-only">{label}</span>}
    </section>
  );
}

export default Panel;
