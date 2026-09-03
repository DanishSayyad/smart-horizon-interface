import { useCallback, useRef, useState } from 'react';
import MapModal from './MapModal';
import Panel from './Panel';
import SatelliteMap from './SatelliteMap';
import SphereScene from './SphereScene';
import { parseCSVToColumns } from '../utils/csvParser';

function DashboardLayout() {
  const fileInputRef = useRef(null);
  const [fileName, setFileName] = useState('No CSV selected');
  const [interval, setInterval] = useState('15 mins');
  const [source, setSource] = useState('MEO');
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [address, setAddress] = useState('Select a point on the satellite map.');
  const [scaleSteps] = useState(7);
  const [resultCsv, setResultCsv] = useState(null);
  const [csvData, setCsvData] = useState(null);
  const [isPredicting, setIsPredicting] = useState(false);
  const [inferenceStatus, setInferenceStatus] = useState('');

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(event) {
    const selectedFile = event.target.files?.[0];

    if (selectedFile) {
      setFileName(selectedFile.name);
      setIsPredicting(true);
      setInferenceStatus('Predicting…');

      try {
        const formData = new FormData();
        formData.append('file', selectedFile);

        let responseText = '';
        try {
          const response = await fetch('/predict', {
            method: 'POST',
            body: formData,
          });
          if (response.ok) {
            responseText = await response.text();
          } else {
            throw new Error(`Server status: ${response.status}`);
          }
        } catch {
          // Direct fallback to port 8000
          const directResponse = await fetch('http://localhost:8000/predict', {
            method: 'POST',
            body: formData,
          });
          if (!directResponse.ok) {
            throw new Error(`Server status: ${directResponse.status}`);
          }
          responseText = await directResponse.text();
        }

        // Store returned CSV in background
        setResultCsv(responseText);

        // Parse column arrays for 3D animations
        const parsed = parseCSVToColumns(responseText);
        setCsvData(parsed);

        // Expose on window for easy access/scripting
        if (typeof window !== 'undefined') {
          window.__SMART_HORIZON_CSV_COLUMNS__ = parsed.columns;
          window.__SMART_HORIZON_RAW_CSV__ = responseText;
        }

        setInferenceStatus(`Ready (${parsed.rowCount} rows)`);
      } catch (err) {
        console.error('Inference request failed:', err);
        setInferenceStatus('Inference failed (check port 8000)');
      } finally {
        setIsPredicting(false);
      }
    }
  }

  function handleDownloadResult() {
    if (!resultCsv) return;
    const blob = new Blob([resultCsv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const downloadName =
      fileName && fileName !== 'No CSV selected'
        ? `${fileName.replace(/\.csv$/i, '')}_predicted.csv`
        : 'predicted_result.csv';
    link.href = url;
    link.setAttribute('download', downloadName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
        {inferenceStatus && (
          <p
            className={`inference-status${
              inferenceStatus.includes('failed') ? ' inference-status--error' : ''
            }`}
          >
            [{inferenceStatus}]
          </p>
        )}

        <div className="controls-row" aria-label="File controls">
          <label className="control control--short select-control">
            <span className="sr-only">Orbit type</span>
            <select value={source} onChange={(event) => setSource(event.target.value)}>
              <option>MEO</option>
              <option>GEO</option>
            </select>
          </label>
          <button
            type="button"
            className="control control--wide download-btn"
            onClick={handleDownloadResult}
            disabled={!resultCsv || isPredicting}
            title={resultCsv ? 'Download returned CSV' : 'No result yet. Upload a CSV first.'}
          >
            {isPredicting ? 'Predicting…' : 'Download Result'}
          </button>
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
        <Panel className="main-panel" label="Primary visualisation">
          <SphereScene steps={scaleSteps} csvData={csvData} />
        </Panel>
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
