import { useRef, useState } from 'react';
import Panel from './Panel';

function DashboardLayout() {
  const fileInputRef = useRef(null);
  const [fileName, setFileName] = useState('No CSV selected');
  const [interval, setInterval] = useState('15 mins');
  const [source, setSource] = useState('MEO');

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function handleFileChange(event) {
    const selectedFile = event.target.files?.[0];

    if (selectedFile) {
      setFileName(selectedFile.name);
    }
  }

  return (
    <main className="dashboard" aria-label="Smart Horizon dashboard">
      <aside className="sidebar">
        <div className="controls-row" aria-label="Top controls">
          <input
            ref={fileInputRef}
            className="file-input"
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
          />
          <button className="control control--wide" type="button" onClick={openFilePicker}>
            Input CSV
          </button>
          <label className="control control--wide select-control">
            <span className="sr-only">Time interval</span>
            <select value={interval} onChange={(event) => setInterval(event.target.value)}>
              <option>15 mins</option>
              <option>30 mins</option>
              <option>1 hour</option>
              <option>2 hours</option>
            </select>
          </label>
        </div>

        <p className="file-name">File name: {fileName}</p>

        <div className="controls-row" aria-label="File controls">
          <label className="control control--short select-control">
            <span className="sr-only">Orbit type</span>
            <select value={source} onChange={(event) => setSource(event.target.value)}>
              <option>MEO</option>
              <option>GEO</option>
            </select>
          </label>
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
