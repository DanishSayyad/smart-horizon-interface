import { useEffect, useRef, useState } from 'react';
import Chart from 'chart.js/auto';

const BUFFER_LENGTH = 45;

/**
 * 1. XYZ Error Components Chart:
 * Plots all 3 error lines (X in green/cyan, Y in amber, Z in magenta/blue) live.
 */
export function XYZErrorChart({ currentErrors, engineOutput, simTime, isPlaying = true }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const historyRef = useRef({
    x: Array(BUFFER_LENGTH).fill(0),
    y: Array(BUFFER_LENGTH).fill(0),
    z: Array(BUFFER_LENGTH).fill(0),
    labels: Array(BUFFER_LENGTH).fill(''),
  });

  const [currentVals, setCurrentVals] = useState({ x: 0, y: 0, z: 0 });

  // Initialize Chart.js
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: historyRef.current.labels,
        datasets: [
          {
            label: 'X Error',
            data: historyRef.current.x,
            borderColor: '#00ff88',
            backgroundColor: 'transparent',
            borderWidth: 1.8,
            pointRadius: 0,
            pointHoverRadius: 3,
            tension: 0.35,
          },
          {
            label: 'Y Error',
            data: historyRef.current.y,
            borderColor: '#f59e0b',
            backgroundColor: 'transparent',
            borderWidth: 1.8,
            pointRadius: 0,
            pointHoverRadius: 3,
            tension: 0.35,
          },
          {
            label: 'Z Error',
            data: historyRef.current.z,
            borderColor: '#38bdf8',
            backgroundColor: 'transparent',
            borderWidth: 1.8,
            pointRadius: 0,
            pointHoverRadius: 3,
            tension: 0.35,
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
            display: false,
          },
          y: {
            grid: {
              color: 'rgba(26, 152, 91, 0.15)',
            },
            ticks: {
              color: '#1a985b',
              font: { family: 'Courier New, monospace', size: 9 },
              maxTicksLimit: 4,
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            backgroundColor: 'rgba(9, 13, 24, 0.95)',
            borderColor: 'rgba(26, 152, 91, 0.4)',
            borderWidth: 1,
            titleColor: '#1a985b',
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
  }, []);

  // Update chart data live
  useEffect(() => {
    // Current point derivation (CSV or simulated orbital deviation)
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

    setCurrentVals({ x: xVal, y: yVal, z: zVal });

    const hist = historyRef.current;
    hist.x.push(xVal);
    hist.y.push(yVal);
    hist.z.push(zVal);
    hist.labels.push('');

    if (hist.x.length > BUFFER_LENGTH) {
      hist.x.shift();
      hist.y.shift();
      hist.z.shift();
      hist.labels.shift();
    }

    if (chartRef.current) {
      chartRef.current.data.datasets[0].data = hist.x;
      chartRef.current.data.datasets[1].data = hist.y;
      chartRef.current.data.datasets[2].data = hist.z;
      chartRef.current.update('none');
    }
  }, [simTime, currentErrors, engineOutput]);

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
 * 2. Error Magnitude Chart:
 * Plots the magnitude |R| = sqrt(x^2 + y^2 + z^2) live.
 */
export function ErrorMagnitudeChart({ currentErrors, engineOutput, simTime, isPlaying = true }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const historyRef = useRef({
    mag: Array(BUFFER_LENGTH).fill(0),
    labels: Array(BUFFER_LENGTH).fill(''),
  });

  const [currentMag, setCurrentMag] = useState(0);

  // Initialize Chart.js
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 120);
    gradient.addColorStop(0, 'rgba(244, 63, 94, 0.28)');
    gradient.addColorStop(1, 'rgba(244, 63, 94, 0.02)');

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: historyRef.current.labels,
        datasets: [
          {
            label: 'Error Magnitude |R|',
            data: historyRef.current.mag,
            borderColor: '#f43f5e',
            backgroundColor: gradient,
            fill: true,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 3,
            tension: 0.35,
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
            display: false,
          },
          y: {
            min: 0,
            grid: {
              color: 'rgba(26, 152, 91, 0.15)',
            },
            ticks: {
              color: '#1a985b',
              font: { family: 'Courier New, monospace', size: 9 },
              maxTicksLimit: 4,
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            backgroundColor: 'rgba(9, 13, 24, 0.95)',
            borderColor: 'rgba(244, 63, 94, 0.4)',
            borderWidth: 1,
            titleColor: '#f43f5e',
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
  }, []);

  // Update chart data live
  useEffect(() => {
    let mag = 0;
    if (currentErrors && currentErrors.x != null) {
      mag = Math.hypot(currentErrors.x, currentErrors.y, currentErrors.z);
    } else if (engineOutput?.rawDeviationOffset != null) {
      mag = engineOutput.rawDeviationOffset;
    } else {
      const t = simTime || 0;
      const x = 2.2 * Math.sin(t * 0.9) + 0.3 * Math.cos(t * 2.1);
      const y = 1.7 * Math.cos(t * 0.7) + 0.2 * Math.sin(t * 1.8);
      const z = 2.8 * Math.sin(t * 0.5 + 1.1) + 0.4 * Math.cos(t * 1.5);
      mag = Math.hypot(x, y, z);
    }

    setCurrentMag(mag);

    const hist = historyRef.current;
    hist.mag.push(mag);
    hist.labels.push('');

    if (hist.mag.length > BUFFER_LENGTH) {
      hist.mag.shift();
      hist.labels.shift();
    }

    if (chartRef.current) {
      chartRef.current.data.datasets[0].data = hist.mag;
      chartRef.current.update('none');
    }
  }, [simTime, currentErrors, engineOutput]);

  return (
    <div className="panel2-chart-container" aria-label="Error magnitude chart">
      <div className="panel2-chart-hud">
        <span className="panel2-chart-title">ERROR MAGNITUDE |R|</span>
        <div className="panel2-chart-values">
          <span style={{ color: '#f43f5e', fontWeight: 'bold' }}>|R|: {currentMag.toFixed(2)}m</span>
        </div>
      </div>
      <div className="panel2-chart-canvas-wrap">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

/**
 * 3. Triangulation Radii Bars Chart:
 * 2 live bars:
 * - Bar 1: Red circle radius (Pre-correction / rawDeviationOffset)
 * - Bar 2: Corrected circle radius (Post-correction / correctedDeviationOffset)
 */
export function TriangulationRadiiBars({ engineOutput, simTime, isPlaying = true }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  const [radii, setRadii] = useState({ redRadius: 10.8, corrRadius: 7.5 });

  // Initialize Chart.js Bar Chart
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
            data: [10.8, 7.5],
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
              color: '#1a985b',
              font: { family: 'Courier New, monospace', size: 9, weight: 'bold' },
            },
          },
          y: {
            min: 0,
            suggestedMax: 16,
            grid: {
              color: 'rgba(26, 152, 91, 0.15)',
            },
            ticks: {
              color: '#1a985b',
              font: { family: 'Courier New, monospace', size: 9 },
              maxTicksLimit: 4,
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            backgroundColor: 'rgba(9, 13, 24, 0.95)',
            borderColor: 'rgba(26, 152, 91, 0.4)',
            borderWidth: 1,
            titleColor: '#1a985b',
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
  }, []);

  // Update bars live as engineOutput / simTime updates
  useEffect(() => {
    let redR = 10.8;
    let corrR = 7.5;

    if (engineOutput?.radius) {
      redR = Math.max(0.5, engineOutput.radius.outer ?? 10.8);
      corrR = Math.max(0.2, engineOutput.radius.inner ?? 7.5);
    } else if (engineOutput?.rawDeviationOffset != null) {
      redR = Math.max(0.5, engineOutput.rawDeviationOffset);
      corrR = Math.max(0.2, engineOutput.correctedDeviationOffset ?? 7.5);
    } else {
      const t = simTime || 0;
      redR = 10.5 + 0.9 * Math.sin(t * 0.8) + 0.3 * Math.cos(t * 1.7);
      corrR = 7.2 + 0.5 * Math.sin(t * 0.8) + 0.2 * Math.cos(t * 1.7);
    }

    setRadii({ redRadius: redR, corrRadius: corrR });

    if (chartRef.current) {
      chartRef.current.data.datasets[0].data = [redR, corrR];
      chartRef.current.update('none');
    }
  }, [simTime, engineOutput]);

  const diffPercent = radii.redRadius > 0
    ? (((radii.corrRadius - radii.redRadius) / radii.redRadius) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="panel2-chart-container" aria-label="Triangulation radii bar chart">
      <div className="panel2-chart-hud">
        <span className="panel2-chart-title">RADII SOLVE</span>
        <div className="panel2-chart-values">
          <span style={{ color: '#ef4444' }}>PRE:{radii.redRadius.toFixed(2)}m</span>
          <span style={{ color: '#10b981' }}>POST:{radii.corrRadius.toFixed(2)}m</span>
          <span style={{ color: '#38bdf8' }}>Δ:{diffPercent}%</span>
        </div>
      </div>
      <div className="panel2-chart-canvas-wrap">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
