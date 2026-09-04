import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import MapModal from './MapModal';
import CsvUploadModal from './CsvUploadModal';
import Panel from './Panel';
import SatelliteMap from './SatelliteMap';
import SphereScene from './SphereScene';
import TimelineSlider from './TimelineSlider';
import ClockErrorPhasor from './ClockErrorPhasor';
import TriangulationMap from './TriangulationMap';
import TriangulationGlobe from './TriangulationGlobe';
import {
  XYZErrorBars,
  XYZErrorChart,
  ErrorMagnitudeChart,
  TriangulationRadiiBars,
  NoisySinWaveChart,
} from './Panel2ErrorCharts';
import {
  parseCSVToColumns,
  extractNormalizedPoints,
  samplePointsByInterval,
  parseCsvTimestampToMs,
  formatTimestampDdhhmmss,
  detectIntervalFromPoints,
  interpolateUnevenPointsByProgress,
} from '../utils/csvParser';
import { TriangulationEngine, precalculateTimelineRadii } from '../services/triangulationEngine';
import { ERROR_SCALE_FACTOR } from '../config/simulation';
import { PREDICT_API_URL, API_BASE_URL } from '../config/api';

const ANIMATION_LOOP_SECONDS = 25; // Constant loop duration across all intervals

function DashboardLayout() {
  const fileInputRef = useRef(null);
  const selectedFileRef = useRef(null);
  const [fileName, setFileName] = useState('No CSV selected');
  const [interval, setInterval] = useState('15 mins');
  const [source, setSource] = useState('MEO');
  const [activeTrack, setActiveTrack] = useState('track1'); // 'track1' | 'track2'
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [address, setAddress] = useState('Select a point on the satellite map.');

  // Backend / CSV states (7 Days Training)
  const [resultCsv, setResultCsv] = useState(null);
  const [csvData, setCsvData] = useState(null);
  const [isPredicting, setIsPredicting] = useState(false);
  const [inferenceStatus, setInferenceStatus] = useState('');

  // 8th Day Testing CSV states (Ground Truth)
  const [testCsvData, setTestCsvData] = useState(null);
  const [testFileName, setTestFileName] = useState('No CSV selected');

  // CSV Upload Pop-up Modal state
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);

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

  const runInference = useCallback(
    async (file, orbitType) => {
      if (!file) return;
      const orbit = (orbitType || source || 'MEO').toUpperCase();
      setIsPredicting(true);
      setInferenceStatus(`Predicting (${orbit})…`);

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('orbit', orbit);

        let responseText = '';
        let primaryError = null;

        // 1. Primary inference attempt using configured environment URL (VITE_API_URL)
        try {
          const response = await fetch(PREDICT_API_URL, {
            method: 'POST',
            body: formData,
          });
          if (response.ok) {
            responseText = await response.text();
          } else {
            const errData = await response.json().catch(() => null);
            throw new Error(errData?.error || `Server status: ${response.status}`);
          }
        } catch (err) {
          primaryError = err;
        }

        // 2. Secondary fallback attempt: if direct PREDICT_API_URL failed and differs from local proxy '/predict'
        if (!responseText && PREDICT_API_URL !== '/predict') {
          try {
            const fallbackResponse = await fetch('/predict', {
              method: 'POST',
              body: formData,
            });
            if (fallbackResponse.ok) {
              responseText = await fallbackResponse.text();
            }
          } catch {
            // Secondary fallback failed; primaryError will be reported below
          }
        }

        if (!responseText) {
          throw primaryError || new Error(`Could not reach backend at ${API_BASE_URL}`);
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

        setInferenceStatus(`Ready (${parsed.rowCount} rows · ${orbit})`);
        setProgress(0); // Reset animation progress to start
      } catch (err) {
        console.error('Inference request failed:', err);
        setInferenceStatus(`Inference failed: ${err.message || `check backend at ${API_BASE_URL}`}`);
      } finally {
        setIsPredicting(false);
      }
    },
    [source],
  );

  const handleUploadTrainCsv = useCallback(
    async (file) => {
      if (!file) return;
      selectedFileRef.current = file;
      setFileName(file.name);

      let targetOrbit = source;
      const upperName = file.name.toUpperCase();
      if (upperName.includes('GEO') && !upperName.includes('MEO')) {
        targetOrbit = 'GEO';
        setSource('GEO');
      } else if (upperName.includes('MEO') && !upperName.includes('GEO')) {
        targetOrbit = 'MEO';
        setSource('MEO');
      }

      await runInference(file, targetOrbit);
    },
    [source, runInference],
  );

  const handleUploadTestCsv = useCallback((name, csvText) => {
    setTestFileName(name);
    const parsed = parseCSVToColumns(csvText);
    setTestCsvData(parsed);

    // Pick out the interval from the 8th day CSV and set that interval as the interface interval to proceed with
    const pts = extractNormalizedPoints(parsed);
    const detectedInterval = detectIntervalFromPoints(pts);
    if (detectedInterval) {
      setInterval(detectedInterval);
    }
  }, []);

  async function handleFileChange(event) {
    const selectedFile = event.target.files?.[0];

    if (selectedFile) {
      await handleUploadTrainCsv(selectedFile);

      if (event.target) {
        event.target.value = '';
      }
    }
  }

  function handleOrbitChange(event) {
    const newOrbit = event.target.value;
    setSource(newOrbit);
    if (selectedFileRef.current) {
      runInference(selectedFileRef.current, newOrbit);
    }
  }

  function handleDownloadResult() {
    if (!resultCsv) return;
    const blob = new Blob([resultCsv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const downloadName =
      fileName && fileName !== 'No CSV selected'
        ? `${fileName.replace(/\.csv$/i, '')}_${source.toLowerCase()}_predicted.csv`
        : `predicted_${source.toLowerCase()}_result.csv`;
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

  // Extract all points from 8th Day Testing CSV data (ground truth)
  const testAllPoints = useMemo(() => {
    return extractNormalizedPoints(testCsvData);
  }, [testCsvData]);

  // Build 3D spline curve for actual trajectory using ERROR_SCALE_FACTOR
  const { actualCurve } = useMemo(() => {
    if (!testAllPoints || !testAllPoints.length) {
      return { actualCurve: null };
    }

    const vectors = testAllPoints.map(
      (pt) =>
        new THREE.Vector3(
          (pt.x || 0) * ERROR_SCALE_FACTOR,
          (pt.y || 0) * ERROR_SCALE_FACTOR,
          (pt.z || 0) * ERROR_SCALE_FACTOR,
        ),
    );

    if (vectors.length < 2) {
      return { actualCurve: null };
    }

    const catmullCurve = new THREE.CatmullRomCurve3(vectors, false, 'centripetal', 0.5);
    return { actualCurve: catmullCurve };
  }, [testAllPoints]);

  // Interpolate current actual satellite position and actual errors based on progress.
  // Handles uneven/irregular intervals in the 8th day CSV, mapping them continuously to the timeline.
  const { currentActualPos, currentActualErrors } = useMemo(() => {
    if (!testAllPoints || !testAllPoints.length) {
      return {
        currentActualPos: new THREE.Vector3(0, 0, 0),
        currentActualErrors: null,
      };
    }

    const safeProgress = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
    const interp = interpolateUnevenPointsByProgress(testAllPoints, safeProgress);

    if (!interp) {
      return {
        currentActualPos: new THREE.Vector3(0, 0, 0),
        currentActualErrors: null,
      };
    }

    const pos = new THREE.Vector3(
      (interp.x || 0) * ERROR_SCALE_FACTOR,
      (interp.y || 0) * ERROR_SCALE_FACTOR,
      (interp.z || 0) * ERROR_SCALE_FACTOR,
    );

    const errors = {
      x: interp.x || 0,
      y: interp.y || 0,
      z: interp.z || 0,
      clock: typeof interp.clock === 'number' ? interp.clock : Number(interp.clock) || 0,
    };

    return { currentActualPos: pos, currentActualErrors: errors };
  }, [testAllPoints, progress]);

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

  // Precalculated radii arrays across the timeline beforehand
  const timelineRadii = useMemo(() => {
    return precalculateTimelineRadii({
      mode: source,
      sampledPoints,
      loopDuration: ANIMATION_LOOP_SECONDS,
    });
  }, [source, sampledPoints]);

  // Triangulation Simulation Engine (§1 - §10) specifically for Post-Predicted Triangulation panel
  const engineOutput = useMemo(() => {
    const csvErr = currentErrors?.clock != null
      ? currentErrors.clock
      : currentErrors ? Math.hypot(currentErrors.x, currentErrors.y, currentErrors.z) : null;
    const baseOutput = engineRef.current.step(simTime, source, csvErr);

    // Synchronize radii with precalculated timeline arrays
    if (timelineRadii?.redRadii?.length) {
      const total = timelineRadii.redRadii.length;
      const safeProg = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
      const idx = Math.min(total - 1, Math.max(0, Math.floor(safeProg * (total - 1))));
      const precalcOuter = timelineRadii.redRadii[idx];
      const precalcInner = timelineRadii.corrRadii[idx];

      return {
        ...baseOutput,
        radius: {
          outer: precalcOuter,
          inner: precalcInner,
        },
        rawDeviationOffset: precalcOuter,
        correctedDeviationOffset: precalcInner,
      };
    }

    return baseOutput;
  }, [simTime, source, currentErrors, timelineRadii, progress]);

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

  const renderTrackSelector = () => (
    <div className="track-selector-row" aria-label="Track selector">
      <button
        type="button"
        className={`track-box ${activeTrack === 'track1' ? 'track-box--active' : ''}`}
        onClick={() => setActiveTrack('track1')}
      >
        Panel 1
      </button>
      <button
        type="button"
        className={`track-box ${activeTrack === 'track2' ? 'track-box--active' : ''}`}
        onClick={() => setActiveTrack('track2')}
      >
        Panel 2
      </button>
    </div>
  );

  useEffect(() => {
    // Notify WebGL canvas and Leaflet map to adjust sizes immediately on panel toggle
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 20);
    return () => clearTimeout(timer);
  }, [activeTrack]);

  return (
    <main className="dashboard-root" aria-label="Smart Horizon dashboard">
      <input
        ref={fileInputRef}
        className="file-input"
        type="file"
        accept=".csv,text/csv"
        onChange={handleFileChange}
      />

      {/* Panel 1 Layout (kept permanently mounted & preloaded) */}
      <div
        className={`dashboard-view dashboard ${
          activeTrack === 'track1' ? 'dashboard-view--active' : 'dashboard-view--hidden'
        }`}
        aria-hidden={activeTrack !== 'track1'}
      >
        <aside className="sidebar">
          <div className="controls-row" aria-label="Top controls">
            <button
              className="control control--wide"
              type="button"
              onClick={() => setIsCsvModalOpen(true)}
            >
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

          <p className="file-name" title={fileName}>
            Train: {fileName}
          </p>
          {testFileName && testFileName !== 'No CSV selected' && (
            <p className="file-name" title={testFileName} style={{ color: '#10b981', marginTop: -4 }}>
              Test: {testFileName}
            </p>
          )}
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
              <select value={source} onChange={handleOrbitChange}>
                <option value="MEO">MEO</option>
                <option value="GEO">GEO</option>
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
              currentActualPos={currentActualPos}
              actualCurve={actualCurve}
              progress={progress}
              isPlaying={isPlaying}
              currentErrors={currentErrors}
              currentActualErrors={currentActualErrors}
              formattedTimer={formattedTimer}
              source={source}
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
          {renderTrackSelector()}
          <Panel className="right-panel right-panel--top" label="Clock error">
            <ClockErrorPhasor
              currentErrors={currentErrors}
              actualErrors={currentActualErrors}
              sampledPoints={sampledPoints}
              testSampledPoints={testAllPoints}
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
      </div>

      {/* Panel 2 Layout (kept permanently mounted & preloaded) */}
      <div
        className={`dashboard-view dashboard--panel2 ${
          activeTrack === 'track2' ? 'dashboard-view--active' : 'dashboard-view--hidden'
        }`}
        aria-hidden={activeTrack !== 'track2'}
      >
        <section className="panel2-main" aria-label="Panel 2 primary layout">
          <div className="panel2-upper-row">
            <div className="panel2-left-stack">
              <Panel className="panel2-canvas-panel" label="Predicted error visualisation">
                <SphereScene
                  currentPos={currentPos}
                  curve={curve}
                  currentActualPos={currentActualPos}
                  actualCurve={actualCurve}
                  progress={progress}
                  isPlaying={isPlaying}
                  currentErrors={currentErrors}
                  currentActualErrors={currentActualErrors}
                  formattedTimer={formattedTimer}
                  source={source}
                />
              </Panel>
              <Panel className="panel2-timeline-panel" label="Timeline visualisation">
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
            </div>

            {/* Central 3D Globe with hovering satellites & orbit speed slider */}
            <Panel className="panel2-center-box" label="Triangulation Simulation">
              <TriangulationGlobe />
            </Panel>
          </div>

          {/* Three lower error charts in panel 2 */}
          <div className="panel2-bottom-row" aria-label="Bottom error charts">
            <Panel className="panel2-bottom-box" label="Dual Error Magnitudes (Actual vs Predicted)">
              <NoisySinWaveChart
                currentErrors={currentErrors}
                currentActualErrors={currentActualErrors}
                testAllPoints={testAllPoints}
                engineOutput={engineOutput}
                simTime={simTime}
                progress={progress}
                sampledPoints={sampledPoints}
                isPlaying={isPlaying}
              />
            </Panel>
            <Panel className="panel2-bottom-box" label="|True - Predicted| Error Vector Magnitude">
              <ErrorMagnitudeChart
                currentErrors={currentErrors}
                currentActualErrors={currentActualErrors}
                testAllPoints={testAllPoints}
                engineOutput={engineOutput}
                simTime={simTime}
                progress={progress}
                sampledPoints={sampledPoints}
                isPlaying={isPlaying}
              />
            </Panel>
            <Panel className="panel2-bottom-box" label="Triangulation Radii">
              <TriangulationRadiiBars
                engineOutput={engineOutput}
                simTime={simTime}
                progress={progress}
                sampledPoints={sampledPoints}
                source={source}
                timelineRadii={timelineRadii}
                isPlaying={isPlaying}
              />
            </Panel>
          </div>
        </section>

        {/* Right column: Switch, XYZ Error 3 Bars box, Triangulation box */}
        <aside className="right-column panel2-right-column" aria-label="Supporting content">
          {renderTrackSelector()}
          <Panel className="panel2-right-blank" label="XYZ Error Differences (True - Predicted)">
            <XYZErrorBars
              currentErrors={currentErrors}
              currentActualErrors={currentActualErrors}
              engineOutput={engineOutput}
              simTime={simTime}
              isPlaying={isPlaying}
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
      </div>
      {isMapOpen && (
        <MapModal
          onClose={closeMap}
          onSelect={handleLocationSelect}
          selectedLocation={selectedLocation}
        />
      )}
      <CsvUploadModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        onUploadTrain={handleUploadTrainCsv}
        onUploadTest={handleUploadTestCsv}
        trainFileName={fileName}
        testFileName={testFileName}
        isPredicting={isPredicting}
        inferenceStatus={inferenceStatus}
        testRowCount={testAllPoints.length}
      />
    </main>
  );
}

export default DashboardLayout;
