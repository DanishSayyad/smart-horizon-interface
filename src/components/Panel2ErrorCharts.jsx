import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import Chart from 'chart.js/auto';
import { precalculateTimelineRadii } from '../services/triangulationEngine';
import { interpolateUnevenPointsByProgress } from '../utils/csvParser';

const STATIC_SIM_STEPS = 60;

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
 * 2. Error Magnitude Chart (Static Live Plot):
 * Plots the magnitude of the (True - Predicted) error vector:
 * |e_true - e_pred| = sqrt((x_true - x_pred)^2 + (y_true - y_pred)^2 + (z_true - z_pred)^2)
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

  // Pre-calculate full static series and labels for |true - pred| vector
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

      const hasTrueData = testAllPoints && testAllPoints.length > 0;
      const mags = sampledPoints.map((predPt, idx) => {
        const u = total > 1 ? idx / (total - 1) : 0;
        let trueX = 0;
        let trueY = 0;
        let trueZ = 0;

        if (hasTrueData) {
          const trueInterp = interpolateUnevenPointsByProgress(testAllPoints, u);
          if (trueInterp) {
            trueX = trueInterp.x || 0;
            trueY = trueInterp.y || 0;
            trueZ = trueInterp.z || 0;
          }
        }

        const dx = trueX - (predPt.x || 0);
        const dy = trueY - (predPt.y || 0);
        const dz = trueZ - (predPt.z || 0);
        return Math.hypot(dx, dy, dz);
      });

      const mx = Math.max(3.5, ...mags);
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
      const predX = 2.2 * Math.sin(t * 0.9) + 0.3 * Math.cos(t * 2.1);
      const predY = 1.7 * Math.cos(t * 0.7) + 0.2 * Math.sin(t * 1.8);
      const predZ = 2.8 * Math.sin(t * 0.5 + 1.1) + 0.4 * Math.cos(t * 1.5);
      return Math.hypot(0 - predX, 0 - predY, 0 - predZ);
    });
    const mx = Math.max(3.5, ...mags);

    return { labels: lbls, allMags: mags, maxMag: mx };
  }, [sampledPoints, testAllPoints]);

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
            label: '|True - Predicted| Error Vector',
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
  }, [labels, maxMag]);

  // Update live plotted curve across the static frame based on progress
  useEffect(() => {
    if (!allMags.length) return;

    const total = allMags.length;
    const safeProg = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
    const activeIdx = Math.min(total - 1, Math.floor(safeProg * (total - 1)));

    let activeVal = allMags[activeIdx] ?? 0;
    if (currentErrors && currentErrors.x != null) {
      const tx = currentActualErrors?.x || 0;
      const ty = currentActualErrors?.y || 0;
      const tz = currentActualErrors?.z || 0;
      activeVal = Math.hypot(tx - (currentErrors.x || 0), ty - (currentErrors.y || 0), tz - (currentErrors.z || 0));
    }

    setCurrentMag(activeVal);

    const progressiveData = allMags.map((v, idx) => (idx <= activeIdx ? v : null));

    if (chartRef.current) {
      chartRef.current.data.datasets[0].data = progressiveData;
      chartRef.current.data.datasets[0].pointRadius = (ctx) =>
        ctx.dataIndex === activeIdx ? 4 : 0;
      chartRef.current.data.datasets[0].pointBackgroundColor = '#f43f5e';
      chartRef.current.data.datasets[0].pointBorderColor = '#ffffff';
      chartRef.current.data.datasets[0].pointBorderWidth = 1.5;

      chartRef.current.update('none');
    }
  }, [progress, allMags, currentErrors, currentActualErrors]);

  return (
    <div className="panel2-chart-container" aria-label="Error vector magnitude chart">
      <div className="panel2-chart-hud">
        <span className="panel2-chart-title">|TRUE - PREDICTED| VECTOR MAGNITUDE</span>
        <div className="panel2-chart-values">
          <span style={{ color: '#f43f5e', fontWeight: 'bold' }}>
            |e_true - e_pred|: {currentMag.toFixed(2)}m
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
 * 4. Dual Error Magnitudes Chart (First lower box):
 * Plots both True Error Magnitude (|e_true|) and Predicted Error Magnitude (|e_pred|),
 * shading the difference between the two curves with transparent orange.
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

  // Precalculate static series for both error magnitudes
  const { labels, predMags, actMags, maxMag } = useMemo(() => {
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

      const hasTrue = testAllPoints && testAllPoints.length > 0;
      const pMags = [];
      const aMags = [];

      for (let i = 0; i < total; i++) {
        const u = total > 1 ? i / (total - 1) : 0;
        const pt = sampledPoints[i];
        const pm = Math.hypot(pt.x || 0, pt.y || 0, pt.z || 0);
        pMags.push(pm);

        let am = 0;
        if (hasTrue) {
          const tPt = interpolateUnevenPointsByProgress(testAllPoints, u);
          if (tPt) {
            am = Math.hypot(tPt.x || 0, tPt.y || 0, tPt.z || 0);
          }
        }
        aMags.push(am);
      }

      const mx = Math.max(3.5, ...pMags, ...aMags);
      return { labels: lbls, predMags: pMags, actMags: aMags, maxMag: mx };
    }

    // Default static simulation domain across 25s loop
    const lbls = Array.from({ length: STATIC_SIM_STEPS }, (_, i) => {
      if (i % 10 === 0 || i === STATIC_SIM_STEPS - 1) {
        return `${((i / (STATIC_SIM_STEPS - 1)) * 25).toFixed(0)}s`;
      }
      return '';
    });

    const pMags = [];
    const aMags = [];
    for (let i = 0; i < STATIC_SIM_STEPS; i++) {
      const t = (i / (STATIC_SIM_STEPS - 1)) * 25;
      const px = 2.2 * Math.sin(t * 0.9) + 0.3 * Math.cos(t * 2.1);
      const py = 1.7 * Math.cos(t * 0.7) + 0.2 * Math.sin(t * 1.8);
      const pz = 2.8 * Math.sin(t * 0.5 + 1.1) + 0.4 * Math.cos(t * 1.5);
      pMags.push(Math.hypot(px, py, pz));
      aMags.push(1.4 + 0.5 * Math.sin(t * 0.7 + 0.5));
    }
    const mx = Math.max(3.5, ...pMags, ...aMags);

    return { labels: lbls, predMags: pMags, actMags: aMags, maxMag: mx };
  }, [sampledPoints, testAllPoints]);

  // Initialize Chart.js with both curves and shaded difference between them
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          // 0: Predicted Error Magnitude
          {
            label: 'Predicted Magnitude |e_pred|',
            data: predMags.map(() => null),
            borderColor: '#ef4444',
            backgroundColor: 'rgba(234, 88, 12, 0.25)', // Dull transparent orange fill between the two
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.2,
            spanGaps: false,
            fill: {
              target: 1, // Strictly fill between Dataset 0 (Predicted) and Dataset 1 (True)
              above: 'rgba(234, 88, 12, 0.25)',
              below: 'rgba(234, 88, 12, 0.25)',
            },
          },
          // 1: True Error Magnitude
          {
            label: 'True Magnitude |e_true|',
            data: actMags.map(() => null),
            borderColor: '#10b981',
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.2,
            spanGaps: false,
            fill: false,
          },
          // 2: Predicted Active Head Marker
          {
            label: 'Predicted Head',
            data: [{ x: labels[0] || '', y: 0 }],
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
            data: [{ x: labels[0] || '', y: 0 }],
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
  }, [labels, maxMag]);

  // Live progressive plotting across the static frame
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (!predMags.length) return;

    const total = predMags.length;
    const safeProg = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
    const activeIdx = Math.min(total - 1, Math.floor(safeProg * (total - 1)));

    let curP = predMags[activeIdx] ?? 0;
    let curA = actMags[activeIdx] ?? 0;

    if (currentErrors && currentErrors.x != null) {
      curP = Math.hypot(currentErrors.x || 0, currentErrors.y || 0, currentErrors.z || 0);
    }
    if (currentActualErrors && currentActualErrors.x != null) {
      curA = Math.hypot(currentActualErrors.x || 0, currentActualErrors.y || 0, currentActualErrors.z || 0);
    }

    setCurrentPredMag(curP);
    setCurrentActMag(curA);

    const progressivePred = predMags.map((v, idx) => (idx <= activeIdx ? v : null));
    const progressiveAct = actMags.map((v, idx) => (idx <= activeIdx ? v : null));

    chart.data.datasets[0].data = progressivePred;
    chart.data.datasets[1].data = progressiveAct;

    // Active head markers
    chart.data.datasets[2].data = progressivePred[activeIdx] != null ? [{ x: labels[activeIdx], y: curP }] : [];
    chart.data.datasets[3].data = progressiveAct[activeIdx] != null ? [{ x: labels[activeIdx], y: curA }] : [];

    chart.update('none');
  }, [progress, predMags, actMags, currentErrors, currentActualErrors, labels]);

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

