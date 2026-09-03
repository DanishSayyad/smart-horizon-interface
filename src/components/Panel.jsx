function Panel({ className = '', label, children, ...props }) {
  return (
    <section className={`panel ${className}`} aria-label={label} {...props}>
      {label && <span className="sr-only">{label}</span>}
      {children}
    </section>
  );
}

export default Panel;
