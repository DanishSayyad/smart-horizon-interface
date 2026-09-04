import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import MapModal from './MapModal';
import Panel from './Panel';
import SatelliteMap from './SatelliteMap';
import SphereScene from './SphereScene';
import TimelineSlider from './TimelineSlider';
import ClockErrorPhasor from './ClockErrorPhasor';
import TriangulationMap from './TriangulationMap';
import {
  parseCSVToColumns,
  extractNormalizedPoints,
  samplePointsByInterval,
  parseCsvTimestampToMs,
  formatTimestampDdhhmmss,
} from '../utils/csvParser';
import { TriangulationEngine } from '../services/triangulationEngine';
import { ERROR_SCALE_FACTOR } from '../config/simulation';

const ANIMATION_LOOP_SECONDS = 25; // Constant loop duration across all intervals

function DashboardLayout() {
  const fileInputRef = useRef(null);
  const [fileName, setFileName] = useState('No CSV selected');
  const [interval, setInterval] = useState('15 mins');
  const [source, setSource] = useState('MEO');
  const [activeTrack, setActiveTrack] = useState('track1'); // 'track1' | 'track2'
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [address, setAddress] = useState('Select a point on the satellite map.');

  // Backend / CSV states
  const [resultCsv, setResultCsv] = useState(null);
  const [csvData, setCsvData] = useState(null);
  const [isPredicting, setIsPredicting] = useState(false);
  const [inferenceStatus, setInferenceStatus] = useState('');

  // Animation states - pristine defaults, motionless until CSV is loaded
  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1); // 1x, 2x, 4x, 8x, 16x

  // Triangulation Simulation Engine (§1 - §10) specifically for Post-Predicted Triangulation panel
  const engineRef = useRef(new TriangulationEngine(source));
  const [simTime, setSimTime] = useState(0);
  const simTimeRef = useRef(0);

  // Mode switching (§10): reload ranges & period, reset warm-start guesses, keep t running
  useEffect(() => {
    engineRef.current.setMode(source);
  }, [source]);

  // Clear any global window artifacts on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__SMART_HORIZON_CSV_COLUMNS__ = null;
      window.__SMART_HORIZON_RAW_CSV__ = null;
    }
  }, []);

  // Global spacebar listener for Pause / Play
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.code === 'Space' || event.key === ' ') {
        const activeTag = document.activeElement?.tagName;
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
          return;
        }
        event.preventDefault();
        setIsPlaying((prev) => !prev);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Animation frame loop - runs over ANIMATION_LOOP_SECONDS scaled by speed multiplier
  useEffect(() => {
    if (!isPlaying) return;

    let animId;
    let lastTime = performance.now();

    function step(now) {
      const deltaSec = (now - lastTime) / 1000;
      lastTime = now;

      const delta = deltaSec * speed;
      setProgress((prev) => (prev + delta / ANIMATION_LOOP_SECONDS) % 1.0);
      simTimeRef.current += delta;
      setSimTime(simTimeRef.current);
      animId = requestAnimationFrame(step);
    }

    animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, speed]);

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
          // Direct fallback to port 8000 on IPv4
          const directResponse = await fetch('http://127.0.0.1:8000/predict', {
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

        // Parse column arrays
        const parsed = parseCSVToColumns(responseText);
        setCsvData(parsed);

        // Expose on window for easy access/scripting
        if (typeof window !== 'undefined') {
          window.__SMART_HORIZON_CSV_COLUMNS__ = parsed.columns;
          window.__SMART_HORIZON_RAW_CSV__ = responseText;
        }

        setInferenceStatus(`Ready (${parsed.rowCount} rows)`);
        setProgress(0); // Reset animation progress to start
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

  // Extract all points from CSV data
  const allPoints = useMemo(() => {
    return extractNormalizedPoints(csvData);
  }, [csvData]);

  // Subsample points based on interval:
  // 15 mins: all rows | 30 mins: alternate rows | 1 hour: every 4th row | 2 hours: every 8th row
  const sampledPoints = useMemo(() => {
    return samplePointsByInterval(allPoints, interval);
  }, [allPoints, interval]);

  // Build 3D spline curve and trajectory path from sampled points using ERROR_SCALE_FACTOR
  const { curve, pathPoints } = useMemo(() => {
    if (!sampledPoints || !sampledPoints.length) {
      return { curve: null, pathPoints: [] };
    }

    const vectors = sampledPoints.map(
      (pt) =>
        new THREE.Vector3(
          (pt.x || 0) * ERROR_SCALE_FACTOR,
          (pt.y || 0) * ERROR_SCALE_FACTOR,
          (pt.z || 0) * ERROR_SCALE_FACTOR,
        ),
    );

    if (vectors.length < 2) {
      return { curve: null, pathPoints: vectors };
    }

    const catmullCurve = new THREE.CatmullRomCurve3(vectors, false, 'centripetal', 0.5);
    const finePath = catmullCurve.getPoints(Math.max(50, vectors.length * 5));

    return { curve: catmullCurve, pathPoints: finePath };
  }, [sampledPoints]);

  // Interpolate current satellite position, timestamp, and error values based on progress
  const { currentPos, currentTimestamp, currentErrors } = useMemo(() => {
    if (!sampledPoints || !sampledPoints.length) {
      return {
        currentPos: new THREE.Vector3(0, 0, 0),
        currentTimestamp: '',
        currentErrors: null,
      };
    }

    const safeProgress = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;

    // 3D position along the Catmull-Rom curve
    let pos = new THREE.Vector3(0, 0, 0);
    if (curve) {
      pos = curve.getPoint(Math.min(0.9999, safeProgress));
    } else if (sampledPoints[0]) {
      pos = new THREE.Vector3(
        (sampledPoints[0].x || 0) * ERROR_SCALE_FACTOR,
        (sampledPoints[0].y || 0) * ERROR_SCALE_FACTOR,
        (sampledPoints[0].z || 0) * ERROR_SCALE_FACTOR,
      );
    }

    // Interpolate timestamp & numeric errors
    const totalSegments = sampledPoints.length - 1;
    if (totalSegments <= 0) {
      const pt = sampledPoints[0];
      return {
        currentPos: pos,
        currentTimestamp: pt?.time || '',
        currentErrors: pt
          ? {
              x: pt.x || 0,
              y: pt.y || 0,
              z: pt.z || 0,
              clock: typeof pt.clock === 'number' ? pt.clock : Number(pt.clock) || 0,
            }
          : null,
      };
    }

    const floatIndex = safeProgress * totalSegments;
    const lower = Math.max(0, Math.min(Math.floor(floatIndex) || 0, totalSegments));
    const upper = Math.max(0, Math.min(lower + 1, totalSegments));
    const alpha = Number.isFinite(floatIndex - lower) ? floatIndex - lower : 0;

    const p1 = sampledPoints[lower] || sampledPoints[0];
    const p2 = sampledPoints[upper] || p1;

    if (!p1) {
      return { currentPos: pos, currentTimestamp: '', currentErrors: null };
    }

    const timestamp = alpha < 0.5 ? (p1?.time || '') : (p2?.time || p1?.time || '');
    const p1x = p1.x ?? 0;
    const p1y = p1.y ?? 0;
    const p1z = p1.z ?? 0;
    const p2x = p2?.x ?? p1x;
    const p2y = p2?.y ?? p1y;
    const p2z = p2?.z ?? p1z;

    const p1clk = typeof p1.clock === 'number' ? p1.clock : Number(p1.clock) || 0;
    const p2clk = typeof p2?.clock === 'number' ? p2.clock : Number(p2?.clock) || p1clk;

    const errors = {
      x: p1x + (p2x - p1x) * alpha,
      y: p1y + (p2y - p1y) * alpha,
      z: p1z + (p2z - p1z) * alpha,
      clock: p1clk + (p2clk - p1clk) * alpha,
    };

    return { currentPos: pos, currentTimestamp: timestamp, currentErrors: errors };
  }, [sampledPoints, curve, progress]);

  // Compute total duration of CSV data in seconds from timestamps or interval fallback
  const totalSimulationSeconds = useMemo(() => {
    const pts = sampledPoints.length > 0 ? sampledPoints : allPoints;
    if (!pts || pts.length < 2) return 0;

    const t0 = pts[0]?.timeMs ?? parseCsvTimestampToMs(pts[0]?.time);
    const t1 = pts[pts.length - 1]?.timeMs ?? parseCsvTimestampToMs(pts[pts.length - 1]?.time);

    if (Number.isFinite(t0) && Number.isFinite(t1) && t1 > t0) {
      return (t1 - t0) / 1000;
    }

    // Fallback: estimate duration from stride / interval
    let intervalSec = 15 * 60;
    if (interval === '30 mins') intervalSec = 30 * 60;
    if (interval === '1 hour') intervalSec = 60 * 60;
    if (interval === '2 hours') intervalSec = 120 * 60;

    return (pts.length - 1) * intervalSec;
  }, [sampledPoints, allPoints, interval]);

  // Timer in dd:hh:mm:ss format displaying active simulation timestamp time (seconds advance smoothly & rapidly)
  const formattedTimer = useMemo(() => {
    const pts = sampledPoints.length > 0 ? sampledPoints : allPoints;
    if (!pts || pts.length === 0) return '00:00:00:00';

    const safeProgress = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
    const totalSegments = pts.length - 1;

    if (totalSegments <= 0) {
      const t = pts[0]?.timeMs ?? parseCsvTimestampToMs(pts[0]?.time);
      return Number.isFinite(t) ? formatTimestampDdhhmmss(t) : '00:00:00:00';
    }

    const floatIndex = safeProgress * totalSegments;
    const lower = Math.max(0, Math.min(Math.floor(floatIndex) || 0, totalSegments));
    const upper = Math.max(0, Math.min(lower + 1, totalSegments));
    const alpha = Number.isFinite(floatIndex - lower) ? floatIndex - lower : 0;

    const p1 = pts[lower] || pts[0];
    const p2 = pts[upper] || p1;

    const t1 = p1?.timeMs ?? parseCsvTimestampToMs(p1?.time);
    const t2 = p2?.timeMs ?? parseCsvTimestampToMs(p2?.time);

    if (Number.isFinite(t1) && Number.isFinite(t2)) {
      const currentMs = t1 + (t2 - t1) * alpha;
      return formatTimestampDdhhmmss(currentMs);
    } else if (Number.isFinite(t1)) {
      return formatTimestampDdhhmmss(t1);
    }

    if (totalSimulationSeconds > 0) {
      const elapsedSec = Math.floor(safeProgress * totalSimulationSeconds);
      const days = Math.floor(elapsedSec / 86400);
      const hours = Math.floor((elapsedSec % 86400) / 3600);
      const minutes = Math.floor((elapsedSec % 3600) / 60);
      const seconds = Math.floor(elapsedSec % 60);

      const dd = String(days).padStart(2, '0');
      const hh = String(hours).padStart(2, '0');
      const mm = String(minutes).padStart(2, '0');
      const ss = String(seconds).padStart(2, '0');
      return `${dd}:${hh}:${mm}:${ss}`;
    }

    return '00:00:00:00';
  }, [progress, sampledPoints, allPoints, totalSimulationSeconds]);

  // Triangulation Simulation Engine (§1 - §10) specifically for Post-Predicted Triangulation panel
  const engineOutput = useMemo(() => {
    const csvErr = currentErrors?.clock != null
      ? currentErrors.clock
      : currentErrors ? Math.hypot(currentErrors.x, currentErrors.y, currentErrors.z) : null;
    return engineRef.current.step(simTime, source, csvErr);
  }, [simTime, source, currentErrors]);

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

        <div className="sidebar-map-wrapper">
          <header
            className="sidebar-panel-header"
            onClick={openMap}
            role="button"
            tabIndex={0}
            aria-label="Open location selector dialog"
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openMap();
              }
            }}
          >
            <span>Select Location</span>
            <span className="sidebar-panel-header__icon" title="Expand map">⤢</span>
          </header>
          <section
            className={`sidebar-panel map-preview${selectedLocation ? ' map-preview--selected' : ''}`}
            aria-label="Select location"
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
        </div>
        <section className="status-panel" aria-label="Selected address">
          <p className="status-panel__label">Selected address</p>
          <p className="status-panel__address">{address}</p>
        </section>
      </aside>

      <section className="content" aria-label="Primary content">
        <Panel className="main-panel" label="Primary visualisation">
          <SphereScene
            currentPos={currentPos}
            curve={curve}
            progress={progress}
            isPlaying={isPlaying}
            currentErrors={currentErrors}
            formattedTimer={formattedTimer}
          />
        </Panel>
        <Panel className="bottom-panel" label="Timeline visualisation">
          <TimelineSlider
            progress={progress}
            onSeek={setProgress}
            isPlaying={isPlaying}
            onTogglePlay={() => setIsPlaying((p) => !p)}
            currentTimestamp={currentTimestamp}
            currentErrors={currentErrors}
            totalPoints={sampledPoints.length}
            interval={interval}
            speed={speed}
            onSpeedChange={setSpeed}
          />
        </Panel>
      </section>

      <aside className="right-column" aria-label="Supporting content">
        <div className="track-selector-row" aria-label="Track selector">
          <button
            type="button"
            className={`track-box ${activeTrack === 'track1' ? 'track-box--active' : ''}`}
            onClick={() => setActiveTrack('track1')}
          >
            Track 1
          </button>
          <button
            type="button"
            className={`track-box ${activeTrack === 'track2' ? 'track-box--active' : ''}`}
            onClick={() => setActiveTrack('track2')}
          >
            Track 2
          </button>
        </div>
        <Panel className="right-panel right-panel--top" label="Clock error">
          <ClockErrorPhasor
            currentErrors={currentErrors}
            sampledPoints={sampledPoints}
            allPoints={allPoints}
            isPlaying={isPlaying}
            progress={progress}
          />
        </Panel>
        <Panel className="right-panel right-panel--bottom" label="post-predicted triangulation">
          <TriangulationMap
            selectedLocation={selectedLocation}
            engineOutput={engineOutput}
            isPlaying={isPlaying}
          />
        </Panel>
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
