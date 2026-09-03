import Panel from './Panel';

function DashboardLayout() {
  return (
    <main className="dashboard" aria-label="Smart Horizon dashboard">
      <aside className="sidebar">
        <div className="controls-row" aria-label="Top controls">
          <Panel className="control control--wide" label="First control" />
          <Panel className="control control--wide" label="Second control" />
        </div>

        <p className="file-name">File name: xyz.csv</p>

        <div className="controls-row" aria-label="File controls">
          <Panel className="control control--short" label="File action" />
          <Panel className="control control--wide" label="File selector" />
        </div>

        <Panel className="sidebar-panel" label="Sidebar visualisation" />
        <section className="status-panel" aria-label="Status panel" />
      </aside>

      <section className="content" aria-label="Primary content">
        <Panel className="main-panel" label="Primary visualisation" />
        <Panel className="bottom-panel" label="Timeline visualisation" />
      </section>

      <aside className="right-column" aria-label="Supporting content">
        <Panel className="right-panel right-panel--top" label="Upper supporting visualisation" />
        <Panel className="right-panel right-panel--bottom" label="Lower supporting visualisation" />
      </aside>
    </main>
  );
}

export default DashboardLayout;
