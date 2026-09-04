import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import Chart from 'chart.js/auto';
import { precalculateTimelineRadii } from '../services/triangulationEngine';

const STATIC_SIM_STEPS = 60;

/**
 * 1. XYZ Error Bars:
 * 3 live moving bars (X error in neon green, Y error in amber, Z error in sky blue).
 * Displayed in the box below the Panel 1 / Panel 2 switch.
 */
export function XYZErrorBars({ currentErrors, engineOutput, simTime, isPlaying = true }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const [vals, setVals] = useState({ x: 0, y: 0, z: 0 });

  // Initialize Chart.js Bar Chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['X ERR', 'Y ERR', 'Z ERR'],
        datasets: [
          {
            label: 'Error (m)',
            data: [0, 0, 0],
            backgroundColor: [
              'rgba(0, 255, 136, 0.65)',
              'rgba(245, 158, 11, 0.65)',
              'rgba(56, 189, 248, 0.65)',
            ],
            borderColor: [
              '#00ff88',
              '#f59e0b',
              '#38bdf8',
            ],
            borderWidth: 1.8,
            borderRadius: 3,
            barPercentage: 0.58,
            categoryPercentage: 0.72,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: '#94a3b8',
              font: { family: 'Courier New, monospace', size: 9, weight: 'bold' },
            },
          },
          y: {
            suggestedMin: -3.5,
            suggestedMax: 3.5,
            grid: {
              color: 'rgba(59, 130, 246, 0.12)',
            },
            ticks: {
              color: '#94a3b8',
              font: { family: 'Courier New, monospace', size: 9 },
              maxTicksLimit: 5,
              callback: (val) => `${Number(val) > 0 ? '+' : ''}${val}m`,
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            backgroundColor: 'rgba(11, 19, 38, 0.95)',
            borderColor: 'rgba(59, 130, 246, 0.4)',
            borderWidth: 1,
            titleColor: '#38bdf8',
            titleFont: { family: 'Courier New, monospace', size: 10 },
            bodyFont: { family: 'Courier New, monospace', size: 10 },
            callbacks: {
              label: (context) => `${context.parsed.y >= 0 ? '+' : ''}${context.parsed.y.toFixed(2)} meters`,
            },
          },
        },
      },
    });

    chartRef.current = chart;

    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  }, []);

  // Update bars live with real-time XYZ errors
  useEffect(() => {
    let xVal = 0;
    let yVal = 0;
    let zVal = 0;

    if (currentErrors && currentErrors.x != null) {
      xVal = currentErrors.x;
      yVal = currentErrors.y;
      zVal = currentErrors.z;
    } else if (engineOutput?.deviatedFix) {
      xVal = engineOutput.deviatedFix.x;
      yVal = engineOutput.deviatedFix.y;
      zVal = engineOutput.deviatedFix.z;
    } else {
      const t = simTime || 0;
      xVal = 2.2 * Math.sin(t * 0.9) + 0.3 * Math.cos(t * 2.1);
      yVal = 1.7 * Math.cos(t * 0.7) + 0.2 * Math.sin(t * 1.8);
      zVal = 2.8 * Math.sin(t * 0.5 + 1.1) + 0.4 * Math.cos(t * 1.5);
    }

    setVals({ x: xVal, y: yVal, z: zVal });

    if (chartRef.current) {
      chartRef.current.data.datasets[0].data = [xVal, yVal, zVal];
      chartRef.current.update('none');
    }
  }, [simTime, currentErrors, engineOutput]);

  return (
    <div className="panel2-chart-container" aria-label="XYZ error 3-bar chart">
      <div className="panel2-chart-hud">
        <span className="panel2-chart-title">XYZ ERROR BARS</span>
        <div className="panel2-chart-values">
          <span style={{ color: '#00ff88' }}>X:{vals.x >= 0 ? '+' : ''}{vals.x.toFixed(2)}m</span>
          <span style={{ color: '#f59e0b' }}>Y:{vals.y >= 0 ? '+' : ''}{vals.y.toFixed(2)}m</span>
          <span style={{ color: '#38bdf8' }}>Z:{vals.z >= 0 ? '+' : ''}{vals.z.toFixed(2)}m</span>
        </div>
      </div>
      <div className="panel2-chart-canvas-wrap">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

/**
 * 2. Error Magnitude Chart (Static Live Plot):
 * Static coordinate frame across the full time domain.
 * The curve is plotted live from left to right as playback/timeline progresses,
 * with no trailing sliding window or conveyor belt movement.
 */
export function ErrorMagnitudeChart({
  currentErrors,
  engineOutput,
  simTime,
  progress = 0,
  sampledPoints = [],
  isPlaying = true,
}) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const [currentMag, setCurrentMag] = useState(0);

  // Pre-calculate full static series and labels
  const { labels, allMags, maxMag } = useMemo(() => {
    if (sampledPoints && sampledPoints.length > 1) {
      const total = sampledPoints.length;
      const step = Math.max(1, Math.floor(total / 7));
      const lbls = sampledPoints.map((pt, idx) => {
        if (idx % step === 0 || idx === total - 1) {
          if (pt.time) {
            const parts = pt.time.split(' ');
            return parts[1]?.slice(0, 5) || pt.time.slice(11, 16) || `${idx}`;
          }
          return `${idx}`;
        }
        return '';
      });

      const mags = sampledPoints.map((pt) =>
        Math.hypot(pt.x || 0, pt.y || 0, pt.z || 0),
      );
      const mx = Math.max(4, ...mags);
      return { labels: lbls, allMags: mags, maxMag: mx };
    }

    // Default static simulation domain across 25s loop
    const lbls = Array.from({ length: STATIC_SIM_STEPS }, (_, i) => {
      if (i % 10 === 0 || i === STATIC_SIM_STEPS - 1) {
        return `${((i / (STATIC_SIM_STEPS - 1)) * 25).toFixed(0)}s`;
      }
      return '';
    });

    const mags = Array.from({ length: STATIC_SIM_STEPS }, (_, i) => {
      const t = (i / (STATIC_SIM_STEPS - 1)) * 25;
      const x = 2.2 * Math.sin(t * 0.9) + 0.3 * Math.cos(t * 2.1);
      const y = 1.7 * Math.cos(t * 0.7) + 0.2 * Math.sin(t * 1.8);
      const z = 2.8 * Math.sin(t * 0.5 + 1.1) + 0.4 * Math.cos(t * 1.5);
      return Math.hypot(x, y, z);
    });
    const mx = Math.max(4, ...mags);

    return { labels: lbls, allMags: mags, maxMag: mx };
  }, [sampledPoints]);

  // Initialize Chart.js with static grid
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 110);
    gradient.addColorStop(0, 'rgba(244, 63, 94, 0.32)');
    gradient.addColorStop(1, 'rgba(244, 63, 94, 0.02)');

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Error Magnitude |R|',
            data: allMags.map(() => null),
            borderColor: '#f43f5e',
            backgroundColor: gradient,
            fill: true,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.3,
            spanGaps: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: {
          mode: 'nearest',
          intersect: false,
        },
        scales: {
          x: {
            display: true,
            grid: {
              color: 'rgba(59, 130, 246, 0.08)',
            },
            ticks: {
              color: '#94a3b8',
              font: { family: 'Courier New, monospace', size: 8 },
              autoSkip: false,
              maxRotation: 0,
            },
          },
          y: {
            min: 0,
            suggestedMax: Math.ceil(maxMag * 1.15),
            grid: {
              color: 'rgba(59, 130, 246, 0.12)',
            },
            ticks: {
              color: '#94a3b8',
              font: { family: 'Courier New, monospace', size: 9 },
              maxTicksLimit: 4,
              callback: (val) => `${val}m`,
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            backgroundColor: 'rgba(11, 19, 38, 0.95)',
            borderColor: 'rgba(244, 63, 94, 0.4)',
            borderWidth: 1,
            titleColor: '#f43f5e',
            titleFont: { family: 'Courier New, monospace', size: 10 },
            bodyFont: { family: 'Courier New, monospace', size: 10 },
            callbacks: {
              label: (context) => `|R|: ${context.parsed.y.toFixed(2)} m`,
            },
          },
        },
      },
    });

    chartRef.current = chart;

    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  }, [labels, maxMag]);

  // Update live plotted curve across the static frame based on progress
  useEffect(() => {
    if (!allMags.length) return;

    const total = allMags.length;
    const safeProg = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
    const activeIdx = Math.min(total - 1, Math.floor(safeProg * (total - 1)));

    // Progressive plotting: values up to activeIdx are drawn, future values are null
    const progressiveData = allMags.map((v, idx) => (idx <= activeIdx ? v : null));
    const activeVal = allMags[activeIdx] ?? 0;

    setCurrentMag(activeVal);

    if (chartRef.current) {
      chartRef.current.data.datasets[0].data = progressiveData;
      // Head point marker indicator
      chartRef.current.data.datasets[0].pointRadius = (ctx) =>
        ctx.dataIndex === activeIdx ? 4 : 0;
      chartRef.current.data.datasets[0].pointBackgroundColor = '#f43f5e';
      chartRef.current.data.datasets[0].pointBorderColor = '#ffffff';
      chartRef.current.data.datasets[0].pointBorderWidth = 1.5;

      chartRef.current.update('none');
    }
  }, [progress, allMags]);

  return (
    <div className="panel2-chart-container" aria-label="Error magnitude chart">
      <div className="panel2-chart-hud">
        <span className="panel2-chart-title">ERROR MAGNITUDE |R|</span>
        <div className="panel2-chart-values">
          <span style={{ color: '#f43f5e', fontWeight: 'bold' }}>
            |R|: {currentMag.toFixed(2)}m
          </span>
        </div>
      </div>
      <div className="panel2-chart-canvas-wrap">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

/**
 * 3. XYZ Error Components Chart (Static Live Plot fallback):
 * 3 lines plotting live across static coordinate grid.
 */
export function XYZErrorChart({
  currentErrors,
  engineOutput,
  simTime,
  progress = 0,
  sampledPoints = [],
  isPlaying = true,
}) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const [currentVals, setCurrentVals] = useState({ x: 0, y: 0, z: 0 });

  const { labels, series, maxVal } = useMemo(() => {
    if (sampledPoints && sampledPoints.length > 1) {
      const total = sampledPoints.length;
      const step = Math.max(1, Math.floor(total / 7));
      const lbls = sampledPoints.map((pt, idx) => {
        if (idx % step === 0 || idx === total - 1) {
          return pt.time?.slice(11, 16) || `${idx}`;
        }
        return '';
      });

      const xs = sampledPoints.map((pt) => pt.x || 0);
      const ys = sampledPoints.map((pt) => pt.y || 0);
      const zs = sampledPoints.map((pt) => pt.z || 0);
      const mx = Math.max(3, ...xs.map(Math.abs), ...ys.map(Math.abs), ...zs.map(Math.abs));

      return { labels: lbls, series: { x: xs, y: ys, z: zs }, maxVal: mx };
    }

    const lbls = Array.from({ length: STATIC_SIM_STEPS }, (_, i) =>
      i % 10 === 0 || i === STATIC_SIM_STEPS - 1 ? `${((i / (STATIC_SIM_STEPS - 1)) * 25).toFixed(0)}s` : '',
    );
    const xs = [];
    const ys = [];
    const zs = [];
    for (let i = 0; i < STATIC_SIM_STEPS; i++) {
      const t = (i / (STATIC_SIM_STEPS - 1)) * 25;
      xs.push(2.2 * Math.sin(t * 0.9) + 0.3 * Math.cos(t * 2.1));
      ys.push(1.7 * Math.cos(t * 0.7) + 0.2 * Math.sin(t * 1.8));
      zs.push(2.8 * Math.sin(t * 0.5 + 1.1) + 0.4 * Math.cos(t * 1.5));
    }
    const mx = Math.max(3, ...xs.map(Math.abs), ...ys.map(Math.abs), ...zs.map(Math.abs));

    return { labels: lbls, series: { x: xs, y: ys, z: zs }, maxVal: mx };
  }, [sampledPoints]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'X Error',
            data: series.x.map(() => null),
            borderColor: '#00ff88',
            backgroundColor: 'transparent',
            borderWidth: 1.8,
            pointRadius: 0,
            tension: 0.3,
            spanGaps: false,
          },
          {
            label: 'Y Error',
            data: series.y.map(() => null),
            borderColor: '#f59e0b',
            backgroundColor: 'transparent',
            borderWidth: 1.8,
            pointRadius: 0,
            tension: 0.3,
            spanGaps: false,
          },
          {
            label: 'Z Error',
            data: series.z.map(() => null),
            borderColor: '#38bdf8',
            backgroundColor: 'transparent',
            borderWidth: 1.8,
            pointRadius: 0,
            tension: 0.3,
            spanGaps: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
          x: {
            display: true,
            grid: { color: 'rgba(59, 130, 246, 0.12)' },
            ticks: { color: '#94a3b8', font: { family: 'Courier New, monospace', size: 8 } },
          },
          y: {
            suggestedMin: -Math.ceil(maxVal * 1.1),
            suggestedMax: Math.ceil(maxVal * 1.1),
            grid: { color: 'rgba(59, 130, 246, 0.12)' },
            ticks: { color: '#94a3b8', font: { family: 'Courier New, monospace', size: 9 }, maxTicksLimit: 5 },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            backgroundColor: 'rgba(11, 19, 38, 0.95)',
            borderColor: 'rgba(59, 130, 246, 0.4)',
            borderWidth: 1,
            titleColor: '#38bdf8',
            titleFont: { family: 'Courier New, monospace', size: 10 },
            bodyFont: { family: 'Courier New, monospace', size: 10 },
          },
        },
      },
    });

    chartRef.current = chart;

    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  }, [labels, series, maxVal]);

  useEffect(() => {
    if (!series.x.length) return;
    const total = series.x.length;
    const safeProg = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
    const activeIdx = Math.min(total - 1, Math.floor(safeProg * (total - 1)));

    setCurrentVals({
      x: series.x[activeIdx] ?? 0,
      y: series.y[activeIdx] ?? 0,
      z: series.z[activeIdx] ?? 0,
    });

    if (chartRef.current) {
      chartRef.current.data.datasets[0].data = series.x.map((v, i) => (i <= activeIdx ? v : null));
      chartRef.current.data.datasets[1].data = series.y.map((v, i) => (i <= activeIdx ? v : null));
      chartRef.current.data.datasets[2].data = series.z.map((v, i) => (i <= activeIdx ? v : null));
      chartRef.current.update('none');
    }
  }, [progress, series]);

  return (
    <div className="panel2-chart-container" aria-label="X Y Z Error components chart">
      <div className="panel2-chart-hud">
        <span className="panel2-chart-title">X Y Z ERRORS</span>
        <div className="panel2-chart-values">
          <span style={{ color: '#00ff88' }}>X:{currentVals.x >= 0 ? '+' : ''}{currentVals.x.toFixed(2)}m</span>
          <span style={{ color: '#f59e0b' }}>Y:{currentVals.y >= 0 ? '+' : ''}{currentVals.y.toFixed(2)}m</span>
          <span style={{ color: '#38bdf8' }}>Z:{currentVals.z >= 0 ? '+' : ''}{currentVals.z.toFixed(2)}m</span>
        </div>
      </div>
      <div className="panel2-chart-canvas-wrap">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

/**
 * 4. Triangulation Radii Bars Chart:
 * 2 live bars:
 * - Bar 1: Red circle radius (Pre-correction / rawDeviationOffset)
 * - Bar 2: Corrected circle radius (Post-correction / correctedDeviationOffset)
 * 
 * Upper bound is fixed to the maximum radius that can occur at any point in the timeline.
 * Precalculated arrays are used throughout the timeline.
 */
export function TriangulationRadiiBars({
  engineOutput,
  simTime,
  progress = 0,
  sampledPoints = [],
  source = 'MEO',
  timelineRadii = null,
  isPlaying = true,
}) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  // Precalculate or consume precalculated timeline arrays
  const precalc = useMemo(() => {
    if (timelineRadii && timelineRadii.redRadii?.length) {
      return timelineRadii;
    }
    return precalculateTimelineRadii({
      mode: source,
      sampledPoints,
      loopDuration: 25,
    });
  }, [timelineRadii, source, sampledPoints]);

  const { redRadii, corrRadii, maxRadius, upperBound } = precalc;

  const [radii, setRadii] = useState(() => ({
    redRadius: redRadii[0] ?? 10.8,
    corrRadius: corrRadii[0] ?? 7.5,
  }));

  // Initialize Chart.js Bar Chart with fixed upper bound
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['PRE-CORR (RED)', 'POST-CORR (CORR)'],
        datasets: [
          {
            label: 'Radius (m)',
            data: [redRadii[0] ?? 10.8, corrRadii[0] ?? 7.5],
            backgroundColor: [
              'rgba(239, 68, 68, 0.65)',
              'rgba(16, 185, 129, 0.65)',
            ],
            borderColor: [
              '#ef4444',
              '#10b981',
            ],
            borderWidth: 2,
            borderRadius: 4,
            barPercentage: 0.55,
            categoryPercentage: 0.7,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: '#94a3b8',
              font: { family: 'Courier New, monospace', size: 9, weight: 'bold' },
            },
          },
          y: {
            min: 0,
            max: upperBound,
            suggestedMax: upperBound,
            grid: {
              color: 'rgba(59, 130, 246, 0.12)',
            },
            ticks: {
              color: '#94a3b8',
              font: { family: 'Courier New, monospace', size: 9 },
              maxTicksLimit: 5,
              callback: (val) => `${val}m`,
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            backgroundColor: 'rgba(11, 19, 38, 0.95)',
            borderColor: 'rgba(59, 130, 246, 0.4)',
            borderWidth: 1,
            titleColor: '#38bdf8',
            titleFont: { family: 'Courier New, monospace', size: 10 },
            bodyFont: { family: 'Courier New, monospace', size: 10 },
            callbacks: {
              label: (context) => `${context.parsed.y.toFixed(2)} meters`,
            },
          },
        },
      },
    });

    chartRef.current = chart;

    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  }, [upperBound]);

  // Update bars throughout the timeline using the precalculated arrays
  useEffect(() => {
    if (!redRadii.length || !corrRadii.length) return;

    const total = redRadii.length;
    const safeProg = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
    const index = Math.min(total - 1, Math.max(0, Math.floor(safeProg * (total - 1))));

    const redR = redRadii[index];
    const corrR = corrRadii[index];

    setRadii({ redRadius: redR, corrRadius: corrR });

    if (chartRef.current) {
      chartRef.current.data.datasets[0].data = [redR, corrR];
      chartRef.current.update('none');
    }
  }, [progress, redRadii, corrRadii]);

  const diffPercent =
    radii.redRadius > 0
      ? (((radii.corrRadius - radii.redRadius) / radii.redRadius) * 100).toFixed(1)
      : '0.0';

  return (
    <div className="panel2-chart-container" aria-label="Triangulation radii bar chart">
      <div className="panel2-chart-hud">
        <span className="panel2-chart-title">RADII SOLVE</span>
        <div className="panel2-chart-values">
          <span style={{ color: '#ef4444' }}>PRE:{radii.redRadius.toFixed(2)}m</span>
          <span style={{ color: '#10b981' }}>POST:{radii.corrRadius.toFixed(2)}m</span>
          <span style={{ color: '#38bdf8' }}>MAX:{maxRadius.toFixed(2)}m</span>
          <span style={{ color: '#38bdf8' }}>Δ:{diffPercent}%</span>
        </div>
      </div>
      <div className="panel2-chart-canvas-wrap">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

/**
 * 4. NoisySinWaveChart:
 * - Exactly ONE wavelength (1λ, phase Δφ = 2π) across the entirety of the graph domain [0, X_MAX].
 * - Starting point y0 randomly chosen in [-1, 1] on the left Y-axis (at x = 0).
/**
 * 4. NoisySinWaveChart:
 * - Live static plot across fixed coordinate axes (no trailing sliding window / conveyor belt).
 * - Exactly ONE wavelength (1λ, phase Δφ = 2π) across the entire static domain [0, X_MAX].
 * - Starting point y0 randomly chosen in [-1, 1] on the left Y-axis (at x = 0).
 * - Increased noisiness: multi-frequency ripple harmonics & jagged texture (tension: 0.05).
 * - Amplitude capped strictly at <= 1.5.
 * - Upper wave: adds magnitude of error above base wave (y_upper = y_base + errMag).
 * - Filled in between with dull transparent orange (rgba(234, 88, 12, 0.22)).
 * - Draws live from left to right in lockstep with simulation progress, featuring live head markers.
 */
export function NoisySinWaveChart({
  currentErrors,
  engineOutput,
  simTime,
  progress = 0,
  sampledPoints = [],
  isPlaying = true,
}) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  const generateWaveData = useCallback(() => {
    // 1. Starting value strictly within [-1, 1] on the left Y-axis
    const y0 = Number(((Math.random() * 2) - 1).toFixed(2));

    // 2. Exactly ONE wavelength across the entire static graph domain [0, X_MAX]
    const X_MAX = 10;
    const TOTAL_POINTS = 180;
    const seed = Math.random() * 80 + 5;

    // Macro 1λ carrier: A ~ 0.95 - 1.05
    const A_carrier = Number((0.96 + Math.random() * 0.12).toFixed(2));

    // Calculate initial noise at x=0 so it can be subtracted, ensuring strict start at y0
    const initNoise =
      0.16 * Math.sin(seed) +
      0.12 * Math.sin(seed * 1.83) +
      0.09 * Math.sin(seed * 2.71) +
      0.06 * Math.sin(seed * 4.19) +
      0.06 * Math.sin(seed * 0.82) +
      0.05 * Math.cos(seed * 1.47);

    const basePoints = [];
    const errMags = [];
    const upperPoints = [];
    let maxDev = 0;

    const totalPts = sampledPoints && sampledPoints.length > 1 ? sampledPoints.length : 0;

    for (let i = 0; i <= TOTAL_POINTS; i++) {
      const x = Number(((i / TOTAL_POINTS) * X_MAX).toFixed(3));
      const frac = i / TOTAL_POINTS;
      const phi = (2 * Math.PI * x) / X_MAX; // Exactly 1 wavelength across X_MAX

      // Macro sine carrier (1λ across entire graph)
      const carrier = A_carrier * Math.sin(phi);

      // Pronounced multi-frequency noise & harmonics for high noisiness:
      const h1 = 0.16 * Math.sin(6 * phi + seed);
      const h2 = 0.12 * Math.sin(11 * phi + seed * 1.83);
      const h3 = 0.09 * Math.sin(19 * phi + seed * 2.71);
      const h4 = 0.06 * Math.sin(31 * phi + seed * 4.19);

      // Fast jagged pseudo-random texture:
      const jitter = 0.06 * Math.sin(i * 2.77 + seed * 0.82) + 0.05 * Math.cos(i * 5.13 + seed * 1.47);

      // Transition out initial offset in first 0.6 units so x=0 is strictly 0 offset
      const startFade = Math.max(0, 1 - (x / 0.6));
      const rawNoise = (h1 + h2 + h3 + h4 + jitter) - initNoise * startFade;

      // Strictly cap total deviation to <= 1.45 (strictly satisfying cap 1.5)
      const dev = Math.max(-1.45, Math.min(1.45, carrier + rawNoise));
      const y = Number((y0 + dev).toFixed(3));

      const absDev = Math.abs(y - y0);
      if (absDev > maxDev) maxDev = absDev;

      basePoints.push({ x, y });

      // Error magnitude at this timeline step
      let mag = 1.65;
      if (totalPts > 1) {
        const ptIdx = Math.min(totalPts - 1, Math.floor(frac * (totalPts - 1)));
        const pt = sampledPoints[ptIdx];
        if (pt) {
          const m = Math.hypot(pt.x || 0, pt.y || 0, pt.z || 0);
          if (m > 0.05) mag = m;
        }
      } else {
        const t = frac * 25;
        const ex = 2.2 * Math.sin(t * 0.9) + 0.3 * Math.cos(t * 2.1);
        const ey = 1.7 * Math.cos(t * 0.7) + 0.2 * Math.sin(t * 1.8);
        const ez = 2.8 * Math.sin(t * 0.5 + 1.1) + 0.4 * Math.cos(t * 1.5);
        mag = Math.hypot(ex, ey, ez) * 0.45;
      }
      // Add slight organic texture to error magnitude
      const magWithTexture = Math.max(0.6, mag * (1 + 0.06 * Math.sin(i * 1.8 + seed)));
      errMags.push(Number(magWithTexture.toFixed(2)));

      upperPoints.push({ x, y: Number((y + magWithTexture).toFixed(3)) });
    }

    return {
      y0,
      X_MAX,
      TOTAL_POINTS,
      basePoints,
      errMags,
      upperPoints,
      maxAmp: Number(maxDev.toFixed(2)),
    };
  }, [sampledPoints]);

  const [waveState, setWaveState] = useState(() => generateWaveData());

  const safeProg = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const initialActiveIdx = Math.min(waveState.TOTAL_POINTS, Math.floor(safeProg * waveState.TOTAL_POINTS));

  const [currentErrMag, setCurrentErrMag] = useState(() => waveState.errMags[initialActiveIdx] ?? 1.65);
  const [currentPlotPercent, setCurrentPlotPercent] = useState(() => Math.round(safeProg * 100));

  // Regenerate wave if sampled points change on CSV upload
  useEffect(() => {
    setWaveState(generateWaveData());
  }, [sampledPoints, generateWaveData]);

  const handleReroll = () => {
    const nextData = generateWaveData();
    setWaveState(nextData);

    const curProg = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
    const activeIdx = Math.min(nextData.TOTAL_POINTS, Math.floor(curProg * nextData.TOTAL_POINTS));

    const upperSlice = nextData.upperPoints.slice(0, activeIdx + 1);
    const baseSlice = nextData.basePoints.slice(0, activeIdx + 1);
    const activeHeadBase = baseSlice[baseSlice.length - 1] || { x: 0, y: nextData.y0 };
    const activeHeadUpper = upperSlice[upperSlice.length - 1] || { x: 0, y: nextData.upperPoints[0].y };
    const curErr = nextData.errMags[activeIdx] ?? 1.65;

    setCurrentErrMag(curErr);
    setCurrentPlotPercent(Math.round(curProg * 100));

    if (chartRef.current) {
      chartRef.current.data.datasets[0].data = upperSlice;
      chartRef.current.data.datasets[1].data = baseSlice;
      chartRef.current.data.datasets[2].data = [activeHeadUpper];
      chartRef.current.data.datasets[3].data = [activeHeadBase];
      chartRef.current.data.datasets[4].data = [{ x: 0, y: nextData.y0 }];
      chartRef.current.data.datasets[5].data = [{ x: 0, y: nextData.upperPoints[0].y }];
      chartRef.current.update('none');
    }
  };

  // Initialize Chart.js with static coordinate frame
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const curProg = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
    const activeIdx = Math.min(waveState.TOTAL_POINTS, Math.floor(curProg * waveState.TOTAL_POINTS));

    const upperSlice = waveState.upperPoints.slice(0, activeIdx + 1);
    const baseSlice = waveState.basePoints.slice(0, activeIdx + 1);
    const activeHeadBase = baseSlice[baseSlice.length - 1] || { x: 0, y: waveState.y0 };
    const activeHeadUpper = upperSlice[upperSlice.length - 1] || { x: 0, y: waveState.upperPoints[0].y };

    const ctx = canvas.getContext('2d');
    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Upper Wave (Base + Error Mag)',
            data: upperSlice,
            borderColor: '#f97316',
            backgroundColor: 'rgba(234, 88, 12, 0.22)', // Dull transparent orange fill
            borderWidth: 1.8,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.05, // Crisp, sharp noise contours without artificial bezier smoothing
            fill: {
              target: 1, // Fill strictly between Upper Wave (dataset 0) and Base Sine Wave (dataset 1)
              above: 'rgba(234, 88, 12, 0.22)',
              below: 'rgba(234, 88, 12, 0.22)',
            },
            clip: false,
          },
          {
            label: 'Noisy Sine Wave (1λ)',
            data: baseSlice,
            borderColor: '#38bdf8',
            backgroundColor: 'transparent',
            borderWidth: 1.8,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.05, // Crisp, sharp noise contours
            fill: false,
            clip: false,
          },
          {
            label: 'Upper Head',
            data: [activeHeadUpper],
            borderColor: '#ffffff',
            backgroundColor: '#f97316',
            borderWidth: 1.5,
            pointRadius: 4.5,
            pointHoverRadius: 6,
            pointStyle: 'circle',
            showLine: false,
            clip: false,
          },
          {
            label: 'Base Head',
            data: [activeHeadBase],
            borderColor: '#ffffff',
            backgroundColor: '#38bdf8',
            borderWidth: 1.5,
            pointRadius: 4.5,
            pointHoverRadius: 6,
            pointStyle: 'circle',
            showLine: false,
            clip: false,
          },
          {
            label: 'Base Origin (0, y₀)',
            data: [{ x: 0, y: waveState.y0 }],
            borderColor: '#38bdf8',
            backgroundColor: '#38bdf8',
            pointRadius: 4,
            pointHoverRadius: 6,
            pointStyle: 'circle',
            showLine: false,
            clip: false,
          },
          {
            label: 'Upper Origin (0, y₀ + |Err|₀)',
            data: [{ x: 0, y: waveState.upperPoints[0].y }],
            borderColor: '#f97316',
            backgroundColor: '#f97316',
            pointRadius: 4,
            pointHoverRadius: 6,
            pointStyle: 'circle',
            showLine: false,
            clip: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: {
          mode: 'nearest',
          intersect: false,
        },
        scales: {
          x: {
            type: 'linear',
            min: 0,
            max: waveState.X_MAX,
            position: 'center', // Horizontal X-axis runs through y = 0
            grid: {
              color: (context) =>
                context.tick && context.tick.value === 0
                  ? 'rgba(56, 189, 248, 0.45)'
                  : 'rgba(59, 130, 246, 0.12)',
              lineWidth: (context) => (context.tick && context.tick.value === 0 ? 1.5 : 1),
            },
            ticks: {
              color: '#94a3b8',
              font: { family: 'Courier New, monospace', size: 9 },
              stepSize: 2,
            },
          },
          y: {
            type: 'linear',
            suggestedMin: -3,
            suggestedMax: 5,
            position: 'left', // Origin shifted to left edge
            grid: {
              color: (context) =>
                context.tick && context.tick.value === 0
                  ? 'rgba(56, 189, 248, 0.45)'
                  : 'rgba(59, 130, 246, 0.12)',
              lineWidth: (context) => (context.tick && context.tick.value === 0 ? 1.5 : 1),
            },
            ticks: {
              color: '#94a3b8',
              font: { family: 'Courier New, monospace', size: 9 },
              stepSize: 1,
              callback: (val) => `${Number(val) > 0 ? '+' : ''}${val}`,
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            backgroundColor: 'rgba(11, 19, 38, 0.95)',
            borderColor: 'rgba(59, 130, 246, 0.4)',
            borderWidth: 1,
            titleColor: '#38bdf8',
            titleFont: { family: 'Courier New, monospace', size: 10 },
            bodyFont: { family: 'Courier New, monospace', size: 10 },
            callbacks: {
              label: (context) => {
                if (context.datasetIndex === 0 || context.datasetIndex === 2) {
                  return `Upper Wave: ${context.parsed.y >= 0 ? '+' : ''}${context.parsed.y.toFixed(2)} (Base + |Err|)`;
                }
                if (context.datasetIndex === 1 || context.datasetIndex === 3) {
                  return `Noisy Sine (1λ): ${context.parsed.y >= 0 ? '+' : ''}${context.parsed.y.toFixed(2)}`;
                }
                if (context.datasetIndex === 4) {
                  return `Base Start: (0, ${context.parsed.y >= 0 ? '+' : ''}${context.parsed.y.toFixed(2)})`;
                }
                return `Upper Start: (0, ${context.parsed.y >= 0 ? '+' : ''}${context.parsed.y.toFixed(2)})`;
              },
            },
          },
        },
      },
    });

    chartRef.current = chart;

    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  }, [waveState]);

  // Live progressive plotting across the static frame as timeline progress advances
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const curProg = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
    const activeIdx = Math.min(waveState.TOTAL_POINTS, Math.floor(curProg * waveState.TOTAL_POINTS));

    const upperSlice = waveState.upperPoints.slice(0, activeIdx + 1);
    const baseSlice = waveState.basePoints.slice(0, activeIdx + 1);
    const activeHeadBase = baseSlice[baseSlice.length - 1] || { x: 0, y: waveState.y0 };
    const activeHeadUpper = upperSlice[upperSlice.length - 1] || { x: 0, y: waveState.upperPoints[0].y };

    const liveErr = currentErrors
      ? Math.hypot(currentErrors.x || 0, currentErrors.y || 0, currentErrors.z || 0)
      : (waveState.errMags[activeIdx] ?? 1.65);

    setCurrentErrMag(liveErr);
    setCurrentPlotPercent(Math.round(curProg * 100));

    chart.data.datasets[0].data = upperSlice;
    chart.data.datasets[1].data = baseSlice;
    chart.data.datasets[2].data = [activeHeadUpper];
    chart.data.datasets[3].data = [activeHeadBase];
    chart.update('none');
  }, [progress, currentErrors, waveState]);

  return (
    <div className="panel2-chart-container" aria-label="1λ Noisy Sine Wave & Error Magnitude Live Plot">
      <div className="panel2-chart-hud">
        <span className="panel2-chart-title">NOISY SINE &amp; ERROR MAG</span>
        <div className="panel2-chart-values">
          <span style={{ color: '#38bdf8' }}>
            Y₀:{waveState.y0 >= 0 ? '+' : ''}{waveState.y0.toFixed(2)}
          </span>
          <span style={{ color: '#f97316' }}>
            |ERR|:+{currentErrMag.toFixed(2)}m
          </span>
          <span style={{ color: '#94a3b8' }}>
            PLOT:{currentPlotPercent}%
          </span>
          <button
            type="button"
            className="panel2-chart-btn"
            onClick={handleReroll}
            title="Generate new random Y₀ between -1 and 1 and noisy pattern"
          >
            REROLL Y₀
          </button>
        </div>
      </div>
      <div className="panel2-chart-canvas-wrap">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

