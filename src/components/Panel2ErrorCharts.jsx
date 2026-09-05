import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import Chart from 'chart.js/auto';
import { precalculateTimelineRadii } from '../services/triangulationEngine';
import { interpolateUnevenPointsByProgress } from '../utils/csvParser';

const SAMPLES = 300;

/**
 * 1D Catmull-Rom spline interpolation through node values.
 * Provides C1-continuous, smooth, curvature-continuous curves with zero sharp kinks.
 */
function interpolateCatmullRom1D(values, t) {
  if (!values || !values.length) return 0;
  const n = values.length;
  if (n === 1) return values[0] || 0;

  const clampedT = Math.max(0, Math.min(n - 1, t));
  const i = Math.floor(clampedT);
  const alpha = clampedT - i;

  if (alpha === 0) return values[i] || 0;

  const p0 = values[Math.max(0, i - 1)] ?? values[i] ?? 0;
  const p1 = values[i] ?? 0;
  const p2 = values[Math.min(n - 1, i + 1)] ?? values[i] ?? 0;
  const p3 = values[Math.min(n - 1, i + 2)] ?? values[Math.min(n - 1, i + 1)] ?? 0;

  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * alpha +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * (alpha * alpha) +
    (-p0 + 3 * p1 - 3 * p2 + p3) * (alpha * alpha * alpha)
  );
}

/**
 * Format X-axis tick labels smoothly based on fraction u in [0, 1].
 */
function formatTimeLabel(u, sampledPoints) {
  if (sampledPoints && sampledPoints.length > 0) {
    const total = sampledPoints.length;
    const idx = Math.min(total - 1, Math.max(0, Math.round(u * (total - 1))));
    const timeStr = sampledPoints[idx]?.time;
    if (timeStr) {
      const parts = timeStr.split(' ');
      if (parts.length > 1) {
        return parts[1].slice(0, 5); // "HH:MM"
      }
      return timeStr.slice(11, 16) || timeStr.slice(0, 5);
    }
    return String(idx);
  }
  const sec = Math.round(u * 25);
  return `${sec}s`;
}

/**
 * 1. XYZ Error Bars:
 * Plots the difference of x errors, y errors, and z errors: (True - Predicted).
 * Displayed in the box below the Panel 1 / Panel 2 switch.
 */
export function XYZErrorBars({ currentErrors, currentActualErrors, engineOutput, simTime, isPlaying = true }) {
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
        labels: ['ΔX ERR', 'ΔY ERR', 'ΔZ ERR'],
        datasets: [
          {
            label: 'Difference (m)',
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
              label: (context) => `Δ${context.label}: ${context.parsed.y >= 0 ? '+' : ''}${context.parsed.y.toFixed(2)} m`,
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

  // Update bars live with real-time difference of XYZ errors (True - Predicted)
  useEffect(() => {
    let diffX = 0;
    let diffY = 0;
    let diffZ = 0;

    if (currentActualErrors && currentErrors) {
      diffX = (currentActualErrors.x || 0) - (currentErrors.x || 0);
      diffY = (currentActualErrors.y || 0) - (currentErrors.y || 0);
      diffZ = (currentActualErrors.z || 0) - (currentErrors.z || 0);
    } else if (currentErrors && currentErrors.x != null) {
      // True is at nominal [0,0,0], difference is (0 - pred) = -pred
      diffX = 0 - (currentErrors.x || 0);
      diffY = 0 - (currentErrors.y || 0);
      diffZ = 0 - (currentErrors.z || 0);
    } else if (engineOutput?.deviatedFix) {
      diffX = 0 - (engineOutput.deviatedFix.x || 0);
      diffY = 0 - (engineOutput.deviatedFix.y || 0);
      diffZ = 0 - (engineOutput.deviatedFix.z || 0);
    } else {
      const t = simTime || 0;
      diffX = 2.2 * Math.sin(t * 0.9) + 0.3 * Math.cos(t * 2.1);
      diffY = 1.7 * Math.cos(t * 0.7) + 0.2 * Math.sin(t * 1.8);
      diffZ = 2.8 * Math.sin(t * 0.5 + 1.1) + 0.4 * Math.cos(t * 1.5);
    }

    setVals({ x: diffX, y: diffY, z: diffZ });

    if (chartRef.current) {
      chartRef.current.data.datasets[0].data = [diffX, diffY, diffZ];
      chartRef.current.update('none');
    }
  }, [simTime, currentErrors, currentActualErrors, engineOutput]);

  return (
    <div className="panel2-chart-container" aria-label="XYZ error difference 3-bar chart">
      <div className="panel2-chart-hud">
        <span className="panel2-chart-title">XYZ ERROR DIFFERENCES (TRUE - PRED)</span>
        <div className="panel2-chart-values">
          <span style={{ color: '#00ff88' }}>ΔX:{vals.x >= 0 ? '+' : ''}{vals.x.toFixed(2)}m</span>
          <span style={{ color: '#f59e0b' }}>ΔY:{vals.y >= 0 ? '+' : ''}{vals.y.toFixed(2)}m</span>
          <span style={{ color: '#38bdf8' }}>ΔZ:{vals.z >= 0 ? '+' : ''}{vals.z.toFixed(2)}m</span>
        </div>
      </div>
      <div className="panel2-chart-canvas-wrap">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

/**
 * 2. Error Magnitude Chart (Smooth Live Spline Plot):
 * Plots the magnitude of the (True - Predicted) error vector:
 * |e_true - e_pred| = sqrt((x_true - x_pred)^2 + (y_true - y_pred)^2 + (z_true - z_pred)^2)
 * Live curve is interpolated continuously at 60 FPS across the timeline.
 */
export function ErrorMagnitudeChart({
  currentErrors,
  currentActualErrors,
  engineOutput,
  simTime,
  progress = 0,
  sampledPoints = [],
  testAllPoints = [],
  isPlaying = true,
}) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const [currentMag, setCurrentMag] = useState(0);

  // Pre-calculate full static series with 300 spline-interpolated evaluation points
  const { precomputedMags, maxMag } = useMemo(() => {
    const hasSampled = sampledPoints && sampledPoints.length > 0;
    const hasTest = testAllPoints && testAllPoints.length > 0;

    const predXs = hasSampled ? sampledPoints.map((p) => p.x || 0) : [];
    const predYs = hasSampled ? sampledPoints.map((p) => p.y || 0) : [];
    const predZs = hasSampled ? sampledPoints.map((p) => p.z || 0) : [];
    const totalPred = hasSampled ? sampledPoints.length : 0;

    const mags = [];
    let mx = 3.5;

    for (let i = 0; i < SAMPLES; i++) {
      const u = i / (SAMPLES - 1);
      let predX = 0, predY = 0, predZ = 0;
      let trueX = 0, trueY = 0, trueZ = 0;

      if (hasSampled && totalPred > 1) {
        const t = u * (totalPred - 1);
        predX = interpolateCatmullRom1D(predXs, t);
        predY = interpolateCatmullRom1D(predYs, t);
        predZ = interpolateCatmullRom1D(predZs, t);
      } else if (hasSampled && totalPred === 1) {
        predX = predXs[0];
        predY = predYs[0];
        predZ = predZs[0];
      } else {
        const t = u * 25;
        predX = 2.2 * Math.sin(t * 0.9) + 0.3 * Math.cos(t * 2.1);
        predY = 1.7 * Math.cos(t * 0.7) + 0.2 * Math.sin(t * 1.8);
        predZ = 2.8 * Math.sin(t * 0.5 + 1.1) + 0.4 * Math.cos(t * 1.5);
      }

      if (hasTest) {
        const trueInterp = interpolateUnevenPointsByProgress(testAllPoints, u);
        if (trueInterp) {
          trueX = trueInterp.x || 0;
          trueY = trueInterp.y || 0;
          trueZ = trueInterp.z || 0;
        }
      } else if (!hasSampled) {
        const t = u * 25;
        trueX = 1.1 * Math.cos(t * 0.65);
        trueY = 0.8 * Math.sin(t * 0.85);
        trueZ = 1.3 * Math.cos(t * 0.45);
      }

      const dx = trueX - predX;
      const dy = trueY - predY;
      const dz = trueZ - predZ;
      const mag = Math.hypot(dx, dy, dz);
      if (mag > mx) mx = mag;

      mags.push({ x: u, y: mag });
    }

    return { precomputedMags: mags, maxMag: mx };
  }, [sampledPoints, testAllPoints]);

  // Initialize Chart.js with linear scale for continuous sub-pixel live drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 110);
    gradient.addColorStop(0, 'rgba(244, 63, 94, 0.35)');
    gradient.addColorStop(1, 'rgba(244, 63, 94, 0.02)');

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [
          // 0: Live Progressive Curve with Gradient Fill
          {
            label: '|True - Predicted| Error Vector',
            data: precomputedMags.length > 0 ? [{ x: 0, y: precomputedMags[0].y }] : [],
            borderColor: '#f43f5e',
            backgroundColor: gradient,
            fill: true,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.15,
            spanGaps: false,
          },
          // 1: Live Active Head Marker
          {
            label: 'Head',
            data: precomputedMags.length > 0 ? [{ x: 0, y: precomputedMags[0].y }] : [],
            borderColor: '#ffffff',
            backgroundColor: '#f43f5e',
            borderWidth: 1.5,
            pointRadius: 4.5,
            pointHoverRadius: 6,
            pointStyle: 'circle',
            showLine: false,
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
            max: 1,
            grid: {
              color: 'rgba(59, 130, 246, 0.08)',
            },
            ticks: {
              stepSize: 0.2,
              maxTicksLimit: 6,
              color: '#94a3b8',
              font: { family: 'Courier New, monospace', size: 8 },
              autoSkip: false,
              maxRotation: 0,
              callback: (val) => formatTimeLabel(val, sampledPoints),
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
            filter: (item) => item.datasetIndex === 0,
            backgroundColor: 'rgba(11, 19, 38, 0.95)',
            borderColor: 'rgba(244, 63, 94, 0.4)',
            borderWidth: 1,
            titleColor: '#f43f5e',
            titleFont: { family: 'Courier New, monospace', size: 10 },
            bodyFont: { family: 'Courier New, monospace', size: 10 },
            callbacks: {
              title: (items) => {
                const u = items[0]?.parsed?.x ?? 0;
                return formatTimeLabel(u, sampledPoints);
              },
              label: (context) => `|True - Pred|: ${context.parsed.y.toFixed(2)} m`,
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
  }, [sampledPoints]);

  // Update Y-scale limit when maxMag changes
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.options.scales.y.suggestedMax = Math.ceil(maxMag * 1.15);
    }
  }, [maxMag]);

  // Continuously interpolate live plotted curve across the timeline
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (!precomputedMags.length) return;

    const safeProg = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;

    let activeVal = 0;
    if (currentErrors && currentErrors.x != null) {
      const tx = currentActualErrors?.x || 0;
      const ty = currentActualErrors?.y || 0;
      const tz = currentActualErrors?.z || 0;
      activeVal = Math.hypot(tx - (currentErrors.x || 0), ty - (currentErrors.y || 0), tz - (currentErrors.z || 0));
    } else {
      const f = safeProg * (SAMPLES - 1);
      const lower = Math.floor(f);
      const upper = Math.min(SAMPLES - 1, lower + 1);
      const alpha = f - lower;
      const y1 = precomputedMags[lower]?.y ?? 0;
      const y2 = precomputedMags[upper]?.y ?? y1;
      activeVal = y1 + (y2 - y1) * alpha;
    }

    setCurrentMag(activeVal);

    // Smooth slice + exact continuous live head point
    const cutoff = Math.min(SAMPLES - 1, Math.floor(safeProg * (SAMPLES - 1)));
    const slice = precomputedMags.slice(0, cutoff + 1);
    let progressiveData;
    if (slice.length > 0 && Math.abs(slice[slice.length - 1].x - safeProg) < 0.0005) {
      progressiveData = slice;
    } else {
      progressiveData = [...slice, { x: safeProg, y: activeVal }];
    }

    chart.data.datasets[0].data = progressiveData;
    chart.data.datasets[1].data = [{ x: safeProg, y: activeVal }];
    chart.update('none');
  }, [progress, precomputedMags, currentErrors, currentActualErrors]);

  return (
    <div className="panel2-chart-container" aria-label="Error vector magnitude chart">
      <div className="panel2-chart-hud">
        <span className="panel2-chart-title">|TRUE - PREDICTED| VECTOR MAGNITUDE</span>
        <div className="panel2-chart-values">
          <span style={{ color: '#f43f5e', fontWeight: 'bold' }}>
            |e_true - e_pred|: {currentMag.toFixed(2)}m
          </span>
          <span style={{ color: '#94a3b8' }}>
            {Math.round(progress * 100)}%
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
 * 3. XYZ Error Components Chart (Smooth Live Spline Plot fallback):
 * 3 lines plotting live across static coordinate grid with smooth interpolation.
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

  const { precomputedSeries, maxVal } = useMemo(() => {
    const hasSampled = sampledPoints && sampledPoints.length > 0;
    const xs = hasSampled ? sampledPoints.map((p) => p.x || 0) : [];
    const ys = hasSampled ? sampledPoints.map((p) => p.y || 0) : [];
    const zs = hasSampled ? sampledPoints.map((p) => p.z || 0) : [];
    const total = hasSampled ? sampledPoints.length : 0;

    const xPts = [];
    const yPts = [];
    const zPts = [];
    let mx = 3.5;

    for (let i = 0; i < SAMPLES; i++) {
      const u = i / (SAMPLES - 1);
      let x = 0, y = 0, z = 0;

      if (hasSampled && total > 1) {
        const t = u * (total - 1);
        x = interpolateCatmullRom1D(xs, t);
        y = interpolateCatmullRom1D(ys, t);
        z = interpolateCatmullRom1D(zs, t);
      } else if (hasSampled && total === 1) {
        x = xs[0];
        y = ys[0];
        z = zs[0];
      } else {
        const t = u * 25;
        x = 2.2 * Math.sin(t * 0.9) + 0.3 * Math.cos(t * 2.1);
        y = 1.7 * Math.cos(t * 0.7) + 0.2 * Math.sin(t * 1.8);
        z = 2.8 * Math.sin(t * 0.5 + 1.1) + 0.4 * Math.cos(t * 1.5);
      }

      if (Math.abs(x) > mx) mx = Math.abs(x);
      if (Math.abs(y) > mx) mx = Math.abs(y);
      if (Math.abs(z) > mx) mx = Math.abs(z);

      xPts.push({ x: u, y: x });
      yPts.push({ x: u, y: y });
      zPts.push({ x: u, y: z });
    }

    return { precomputedSeries: { x: xPts, y: yPts, z: zPts }, maxVal: mx };
  }, [sampledPoints]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'X Error',
            data: precomputedSeries.x.length > 0 ? [{ x: 0, y: precomputedSeries.x[0].y }] : [],
            borderColor: '#00ff88',
            backgroundColor: 'transparent',
            borderWidth: 1.8,
            pointRadius: 0,
            tension: 0.15,
            spanGaps: false,
          },
          {
            label: 'Y Error',
            data: precomputedSeries.y.length > 0 ? [{ x: 0, y: precomputedSeries.y[0].y }] : [],
            borderColor: '#f59e0b',
            backgroundColor: 'transparent',
            borderWidth: 1.8,
            pointRadius: 0,
            tension: 0.15,
            spanGaps: false,
          },
          {
            label: 'Z Error',
            data: precomputedSeries.z.length > 0 ? [{ x: 0, y: precomputedSeries.z[0].y }] : [],
            borderColor: '#38bdf8',
            backgroundColor: 'transparent',
            borderWidth: 1.8,
            pointRadius: 0,
            tension: 0.15,
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
            type: 'linear',
            min: 0,
            max: 1,
            grid: { color: 'rgba(59, 130, 246, 0.08)' },
            ticks: {
              stepSize: 0.2,
              maxTicksLimit: 6,
              color: '#94a3b8',
              font: { family: 'Courier New, monospace', size: 8 },
              autoSkip: false,
              maxRotation: 0,
              callback: (val) => formatTimeLabel(val, sampledPoints),
            },
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
            callbacks: {
              title: (items) => {
                const u = items[0]?.parsed?.x ?? 0;
                return formatTimeLabel(u, sampledPoints);
              },
              label: (context) => `${context.dataset.label}: ${context.parsed.y >= 0 ? '+' : ''}${context.parsed.y.toFixed(2)} m`,
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
  }, [sampledPoints]);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.options.scales.y.suggestedMin = -Math.ceil(maxVal * 1.1);
      chartRef.current.options.scales.y.suggestedMax = Math.ceil(maxVal * 1.1);
    }
  }, [maxVal]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (!precomputedSeries.x.length) return;

    const safeProg = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;

    let curX = 0, curY = 0, curZ = 0;
    if (currentErrors && currentErrors.x != null) {
      curX = currentErrors.x || 0;
      curY = currentErrors.y || 0;
      curZ = currentErrors.z || 0;
    } else {
      const f = safeProg * (SAMPLES - 1);
      const lower = Math.floor(f);
      const upper = Math.min(SAMPLES - 1, lower + 1);
      const alpha = f - lower;
      curX = precomputedSeries.x[lower].y + (precomputedSeries.x[upper].y - precomputedSeries.x[lower].y) * alpha;
      curY = precomputedSeries.y[lower].y + (precomputedSeries.y[upper].y - precomputedSeries.y[lower].y) * alpha;
      curZ = precomputedSeries.z[lower].y + (precomputedSeries.z[upper].y - precomputedSeries.z[lower].y) * alpha;
    }

    setCurrentVals({ x: curX, y: curY, z: curZ });

    const cutoff = Math.min(SAMPLES - 1, Math.floor(safeProg * (SAMPLES - 1)));
    const sliceX = precomputedSeries.x.slice(0, cutoff + 1);
    const sliceY = precomputedSeries.y.slice(0, cutoff + 1);
    const sliceZ = precomputedSeries.z.slice(0, cutoff + 1);

    chart.data.datasets[0].data = [...sliceX, { x: safeProg, y: curX }];
    chart.data.datasets[1].data = [...sliceY, { x: safeProg, y: curY }];
    chart.data.datasets[2].data = [...sliceZ, { x: safeProg, y: curZ }];
    chart.update('none');
  }, [progress, precomputedSeries, currentErrors]);

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
 * Smooth continuous linear interpolation between timeline keyframes.
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

  // Continuously interpolate radii between timeline keyframes
  useEffect(() => {
    if (!redRadii.length || !corrRadii.length) return;

    const total = redRadii.length;
    const safeProg = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
    const floatIdx = safeProg * (total - 1);
    const lower = Math.min(total - 1, Math.floor(floatIdx));
    const upper = Math.min(total - 1, lower + 1);
    const alpha = floatIdx - lower;

    const redR = (redRadii[lower] ?? 0) + ((redRadii[upper] ?? redRadii[lower] ?? 0) - (redRadii[lower] ?? 0)) * alpha;
    const corrR = (corrRadii[lower] ?? 0) + ((corrRadii[upper] ?? corrRadii[lower] ?? 0) - (corrRadii[lower] ?? 0)) * alpha;

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
 * 5. Dual Error Magnitudes Chart (First lower box):
 * Plots both True Error Magnitude (|e_true|) and Predicted Error Magnitude (|e_pred|),
 * shading the difference between the two curves with transparent orange.
 * Smooth Catmull-Rom spline interpolation and continuous 60 FPS live plotting.
 */
export function NoisySinWaveChart({
  currentErrors,
  currentActualErrors,
  engineOutput,
  simTime,
  progress = 0,
  sampledPoints = [],
  testAllPoints = [],
  isPlaying = true,
}) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const [currentActMag, setCurrentActMag] = useState(0);
  const [currentPredMag, setCurrentPredMag] = useState(0);

  // Pre-calculate 300 spline-interpolated points for both error magnitudes
  const { predCurve, actCurve, maxMag } = useMemo(() => {
    const hasSampled = sampledPoints && sampledPoints.length > 0;
    const hasTest = testAllPoints && testAllPoints.length > 0;

    const predXs = hasSampled ? sampledPoints.map((p) => p.x || 0) : [];
    const predYs = hasSampled ? sampledPoints.map((p) => p.y || 0) : [];
    const predZs = hasSampled ? sampledPoints.map((p) => p.z || 0) : [];
    const totalPred = hasSampled ? sampledPoints.length : 0;

    const pCurve = [];
    const aCurve = [];
    let mx = 3.5;

    for (let i = 0; i < SAMPLES; i++) {
      const u = i / (SAMPLES - 1);
      let predX = 0, predY = 0, predZ = 0;
      let trueX = 0, trueY = 0, trueZ = 0;

      if (hasSampled && totalPred > 1) {
        const t = u * (totalPred - 1);
        predX = interpolateCatmullRom1D(predXs, t);
        predY = interpolateCatmullRom1D(predYs, t);
        predZ = interpolateCatmullRom1D(predZs, t);
      } else if (hasSampled && totalPred === 1) {
        predX = predXs[0];
        predY = predYs[0];
        predZ = predZs[0];
      } else {
        const t = u * 25;
        predX = 2.2 * Math.sin(t * 0.9) + 0.3 * Math.cos(t * 2.1);
        predY = 1.7 * Math.cos(t * 0.7) + 0.2 * Math.sin(t * 1.8);
        predZ = 2.8 * Math.sin(t * 0.5 + 1.1) + 0.4 * Math.cos(t * 1.5);
      }

      if (hasTest) {
        const trueInterp = interpolateUnevenPointsByProgress(testAllPoints, u);
        if (trueInterp) {
          trueX = trueInterp.x || 0;
          trueY = trueInterp.y || 0;
          trueZ = trueInterp.z || 0;
        }
      } else if (!hasSampled) {
        const t = u * 25;
        trueX = 1.1 * Math.cos(t * 0.65);
        trueY = 0.8 * Math.sin(t * 0.85);
        trueZ = 1.3 * Math.cos(t * 0.45);
      }

      const pm = Math.hypot(predX, predY, predZ);
      const am = Math.hypot(trueX, trueY, trueZ);
      if (pm > mx) mx = pm;
      if (am > mx) mx = am;

      pCurve.push({ x: u, y: pm });
      aCurve.push({ x: u, y: am });
    }

    return { predCurve: pCurve, actCurve: aCurve, maxMag: mx };
  }, [sampledPoints, testAllPoints]);

  // Initialize Chart.js with linear continuous scale & differential shading fill
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [
          // 0: Predicted Error Magnitude (Continuous Live Spline)
          {
            label: 'Predicted Magnitude |e_pred|',
            data: predCurve.length > 0 ? [{ x: 0, y: predCurve[0].y }] : [],
            borderColor: '#ef4444',
            backgroundColor: 'rgba(234, 88, 12, 0.25)', // Dull transparent orange fill
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.15,
            spanGaps: false,
            fill: {
              target: 1, // Fill strictly between Dataset 0 (Predicted) and Dataset 1 (True)
              above: 'rgba(234, 88, 12, 0.25)',
              below: 'rgba(234, 88, 12, 0.25)',
            },
          },
          // 1: True Error Magnitude (Continuous Live Spline)
          {
            label: 'True Magnitude |e_true|',
            data: actCurve.length > 0 ? [{ x: 0, y: actCurve[0].y }] : [],
            borderColor: '#10b981',
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.15,
            spanGaps: false,
            fill: false,
          },
          // 2: Predicted Active Head Marker
          {
            label: 'Predicted Head',
            data: predCurve.length > 0 ? [{ x: 0, y: predCurve[0].y }] : [],
            borderColor: '#ffffff',
            backgroundColor: '#ef4444',
            borderWidth: 1.5,
            pointRadius: 4.5,
            pointHoverRadius: 6,
            pointStyle: 'circle',
            showLine: false,
          },
          // 3: True Active Head Marker
          {
            label: 'True Head',
            data: actCurve.length > 0 ? [{ x: 0, y: actCurve[0].y }] : [],
            borderColor: '#ffffff',
            backgroundColor: '#10b981',
            borderWidth: 1.5,
            pointRadius: 4.5,
            pointHoverRadius: 6,
            pointStyle: 'circle',
            showLine: false,
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
            max: 1,
            grid: {
              color: 'rgba(59, 130, 246, 0.08)',
            },
            ticks: {
              stepSize: 0.2,
              maxTicksLimit: 6,
              color: '#94a3b8',
              font: { family: 'Courier New, monospace', size: 8 },
              autoSkip: false,
              maxRotation: 0,
              callback: (val) => formatTimeLabel(val, sampledPoints),
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
              maxTicksLimit: 5,
              callback: (val) => `${val}m`,
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            filter: (item) => item.datasetIndex <= 1,
            backgroundColor: 'rgba(11, 19, 38, 0.95)',
            borderColor: 'rgba(59, 130, 246, 0.4)',
            borderWidth: 1,
            titleColor: '#38bdf8',
            titleFont: { family: 'Courier New, monospace', size: 10 },
            bodyFont: { family: 'Courier New, monospace', size: 10 },
            callbacks: {
              title: (items) => {
                const u = items[0]?.parsed?.x ?? 0;
                return formatTimeLabel(u, sampledPoints);
              },
              label: (context) => {
                if (context.datasetIndex === 0) return `Pred: ${context.parsed.y.toFixed(2)} m`;
                if (context.datasetIndex === 1) return `True: ${context.parsed.y.toFixed(2)} m`;
                return '';
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
  }, [sampledPoints]);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.options.scales.y.suggestedMax = Math.ceil(maxMag * 1.15);
    }
  }, [maxMag]);

  // Live progressive plotting continuously across the static frame
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (!predCurve.length) return;

    const safeProg = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;

    let curP = 0;
    let curA = 0;

    if (currentErrors && currentErrors.x != null) {
      curP = Math.hypot(currentErrors.x || 0, currentErrors.y || 0, currentErrors.z || 0);
    } else {
      const f = safeProg * (SAMPLES - 1);
      const lower = Math.floor(f);
      const upper = Math.min(SAMPLES - 1, lower + 1);
      const alpha = f - lower;
      const y1 = predCurve[lower]?.y ?? 0;
      const y2 = predCurve[upper]?.y ?? y1;
      curP = y1 + (y2 - y1) * alpha;
    }

    if (currentActualErrors && currentActualErrors.x != null) {
      curA = Math.hypot(currentActualErrors.x || 0, currentActualErrors.y || 0, currentActualErrors.z || 0);
    } else {
      const f = safeProg * (SAMPLES - 1);
      const lower = Math.floor(f);
      const upper = Math.min(SAMPLES - 1, lower + 1);
      const alpha = f - lower;
      const y1 = actCurve[lower]?.y ?? 0;
      const y2 = actCurve[upper]?.y ?? y1;
      curA = y1 + (y2 - y1) * alpha;
    }

    setCurrentPredMag(curP);
    setCurrentActMag(curA);

    const cutoff = Math.min(SAMPLES - 1, Math.floor(safeProg * (SAMPLES - 1)));
    const sliceP = predCurve.slice(0, cutoff + 1);
    const sliceA = actCurve.slice(0, cutoff + 1);

    let progressivePred;
    let progressiveAct;

    if (sliceP.length > 0 && Math.abs(sliceP[sliceP.length - 1].x - safeProg) < 0.0005) {
      progressivePred = sliceP;
      progressiveAct = sliceA;
    } else {
      progressivePred = [...sliceP, { x: safeProg, y: curP }];
      progressiveAct = [...sliceA, { x: safeProg, y: curA }];
    }

    chart.data.datasets[0].data = progressivePred;
    chart.data.datasets[1].data = progressiveAct;
    chart.data.datasets[2].data = [{ x: safeProg, y: curP }];
    chart.data.datasets[3].data = [{ x: safeProg, y: curA }];

    chart.update('none');
  }, [progress, predCurve, actCurve, currentErrors, currentActualErrors]);

  const diffMag = Math.abs(currentActMag - currentPredMag);

  return (
    <div className="panel2-chart-container" aria-label="Dual error magnitudes chart with shaded difference">
      <div className="panel2-chart-hud">
        <span className="panel2-chart-title">DUAL ERROR MAGNITUDES</span>
        <div className="panel2-chart-values">
          <span style={{ color: '#10b981' }}>
            ACT:{currentActMag.toFixed(2)}m
          </span>
          <span style={{ color: '#ef4444' }}>
            PRED:{currentPredMag.toFixed(2)}m
          </span>
          <span style={{ color: '#f97316', fontWeight: 'bold' }}>
            DIFF:{diffMag.toFixed(2)}m
          </span>
          <span style={{ color: '#94a3b8' }}>
            {Math.round(progress * 100)}%
          </span>
        </div>
      </div>
      <div className="panel2-chart-canvas-wrap">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

export const DualErrorMagnitudeChart = NoisySinWaveChart;


