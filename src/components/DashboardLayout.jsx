import { useCallback, useRef, useState } from 'react';
import MapModal from './MapModal';
import Panel from './Panel';
import SatelliteMap from './SatelliteMap';

function DashboardLayout() {
  const fileInputRef = useRef(null);
  const [fileName, setFileName] = useState('No CSV selected');
  const [interval, setInterval] = useState('15 mins');
  const [source, setSource] = useState('MEO');
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [address, setAddress] = useState('Select a point on the satellite map.');

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function handleFileChange(event) {
    const selectedFile = event.target.files?.[0];

    if (selectedFile) {
      setFileName(selectedFile.name);
    }
  }

  const openMap = useCallback(() => {
    setIsMapOpen(true);
  }, []);

  const closeMap = useCallback(() => {
    setIsMapOpen(false);
  }, []);

  const handleLocationSelect = useCallback(async (location) => {
    setSelectedLocation(location);
    setAddress('Looking up address…');

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${location.lat}&lon=${location.lng}`,
      );
      const data = await response.json();

      setAddress(data.display_name ?? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`);
    } catch {
      setAddress(`${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`);
    }
  }, []);

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

        <section
          className={`sidebar-panel map-preview${selectedLocation ? ' map-preview--selected' : ''}`}
          aria-label="Open satellite map"
          role="button"
          tabIndex={0}
          onClick={openMap}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              openMap();
            }
          }}
        >
          <SatelliteMap onActivate={openMap} selectedLocation={selectedLocation} />
        </section>
        <section className="status-panel" aria-label="Selected address">
          <p className="status-panel__label">Selected address</p>
          <p className="status-panel__address">{address}</p>
        </section>
      </aside>

      <section className="content" aria-label="Primary content">
        <Panel className="main-panel" label="Primary visualisation" />
        <Panel className="bottom-panel" label="Timeline visualisation" />
      </section>

      <aside className="right-column" aria-label="Supporting content">
        <Panel className="right-panel right-panel--top" label="Upper supporting visualisation" />
        <Panel className="right-panel right-panel--bottom" label="Lower supporting visualisation" />
      </aside>
      {isMapOpen && (
        <MapModal
          onClose={closeMap}
          onSelect={handleLocationSelect}
          selectedLocation={selectedLocation}
        />
      )}
    </main>
  );
}

export default DashboardLayout;
