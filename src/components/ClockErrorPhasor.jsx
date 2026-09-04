import { useEffect, useMemo, useRef } from 'react';
import Chart from 'chart.js/auto';

// Benchmark: green reference hand completes a full clockwise rotation in 7 seconds (7:1.6 ratio)
const NOMINAL_PERIOD = 7.0; // 7 seconds per circle (ratio 7:1.6)
const RATIO_SECONDS_PER_UNIT = 7.0 / 1.6; // 4.375 s/unit
const BASE_MAX_ERROR = 1.6;
const PHASOR_RADIUS = 1.0; // Constant magnitude for nominal reference hand

/**
 * Generates points on a circle of given radius.
 */
function generateCirclePoints(radius, segments = 64) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * 2 * Math.PI;
    points.push({
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle),
    });
  }
  return points;
}

function ClockErrorPhasor({
  currentErrors,
  sampledPoints = [],
  allPoints = [],
  isPlaying = false,
  progress = 0,
}) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const rotationAngleRef = useRef(0);
  const lastTimeRef = useRef(performance.now());

  // Calculate the maximum magnitude of the clock error from loaded CSV data
  const maxClockError = useMemo(() => {
    const points = sampledPoints.length > 0 ? sampledPoints : allPoints;
    if (!points || points.length === 0) {
      return BASE_MAX_ERROR;
    }

    let maxVal = 0;
    for (const pt of points) {
      const val = Math.abs(typeof pt.clock === 'number' ? pt.clock : Number(pt.clock) || 0);
      if (val > maxVal) {
        maxVal = val;
      }
    }

    return maxVal > 0 ? maxVal : BASE_MAX_ERROR;
  }, [sampledPoints, allPoints]);

  // Current clock error value from active playback / scrub position
  const currentClockError = currentErrors?.clock !== undefined ? currentErrors.clock : 0;

  // Sync references for animation loop
  const currentClockErrorRef = useRef(currentClockError);
  const maxClockErrorRef = useRef(maxClockError);

  currentClockErrorRef.current = currentClockError;
  maxClockErrorRef.current = maxClockError;

  // Initialize Chart.js
  useEffect(() => {
    if (!canvasRef.current) return;

    const ctx = canvasRef.current.getContext('2d');

    // Concentric circle rings for polar grid
    const outerRing = generateCirclePoints(PHASOR_RADIUS, 64);
    const ring75 = generateCirclePoints(PHASOR_RADIUS * 0.75, 48);
    const ring50 = generateCirclePoints(PHASOR_RADIUS * 0.5, 40);
    const ring25 = generateCirclePoints(PHASOR_RADIUS * 0.25, 32);

    // Custom plugin to draw glowing arrowheads, center pivot, dial markers, and phase arc
    const phasorVisualsPlugin = {
      id: 'phasorVisuals',
      afterDraw(chart) {
        const { ctx: c, scales } = chart;
        const { x: xScale, y: yScale } = scales;
        if (!xScale || !yScale) return;

        const cx = xScale.getPixelForValue(0);
        const cy = yScale.getPixelForValue(0);
        const rPix = Math.abs(xScale.getPixelForValue(PHASOR_RADIUS) - cx);

        c.save();

        // 1. Polar angle tick marks and labels (clockwise dial)
        const ticks = [
          { x: 0, y: PHASOR_RADIUS, label: '0°' },       // Top (12 o'clock)
          { x: PHASOR_RADIUS, y: 0, label: '90°' },      // Right (3 o'clock)
          { x: 0, y: -PHASOR_RADIUS, label: '180°' },    // Bottom (6 o'clock)
          { x: -PHASOR_RADIUS, y: 0, label: '270°' },    // Left (9 o'clock)
        ];

        c.font = '9px "Courier New", monospace';
        c.fillStyle = 'rgba(26, 152, 91, 0.75)';
        c.textAlign = 'center';
        c.textBaseline = 'middle';

        ticks.forEach(({ x, y, label }) => {
          const tx = cx + (xScale.getPixelForValue(x) - cx) * 1.15;
          const ty = cy + (yScale.getPixelForValue(y) - cy) * 1.15;
          c.fillText(label, tx, ty);
        });

        // 2. Draw glowing arrowheads on vectors
        function drawArrowhead(tipXVal, tipYVal, color, glowColor, arrowSize = 9) {
          const tipX = xScale.getPixelForValue(tipXVal);
          const tipY = yScale.getPixelForValue(tipYVal);
          const dx = tipX - cx;
          const dy = tipY - cy;
          const len = Math.hypot(dx, dy);
          if (len < 10) return;

          const angle = Math.atan2(dy, dx);

          c.save();
          c.shadowColor = glowColor;
          c.shadowBlur = 8;
          c.fillStyle = color;
          c.beginPath();
          c.moveTo(tipX, tipY);
          c.lineTo(
            tipX - arrowSize * Math.cos(angle - Math.PI / 6),
            tipY - arrowSize * Math.sin(angle - Math.PI / 6),
          );
          c.lineTo(
            tipX - (arrowSize * 0.6) * Math.cos(angle),
            tipY - (arrowSize * 0.6) * Math.sin(angle),
          );
          c.lineTo(
            tipX - arrowSize * Math.cos(angle + Math.PI / 6),
            tipY - arrowSize * Math.sin(angle + Math.PI / 6),
          );
          c.closePath();
          c.fill();
          c.restore();
        }

        // Arrow for Green Reference Hand (Dataset index 5)
        const greenData = chart.data.datasets[5]?.data;
        if (greenData && greenData[1]) {
          drawArrowhead(greenData[1].x, greenData[1].y, '#10b981', 'rgba(16, 185, 129, 0.8)', 10);
        }

        // Arrow for Red Clock Error Hand (Dataset index 6)
        const redData = chart.data.datasets[6]?.data;
        if (redData && redData[1]) {
          drawArrowhead(redData[1].x, redData[1].y, '#ef4444', 'rgba(239, 68, 68, 0.8)', 8);
        }

        // 3. Phase error arc between green hand and red hand
        if (greenData && greenData[1] && redData && redData[1]) {
          const tipGX = xScale.getPixelForValue(greenData[1].x) - cx;
          const tipGY = yScale.getPixelForValue(greenData[1].y) - cy;
          const tipRX = xScale.getPixelForValue(redData[1].x) - cx;
          const tipRY = yScale.getPixelForValue(redData[1].y) - cy;

          const angleG = Math.atan2(tipGY, tipGX);
          const angleR = Math.atan2(tipRY, tipRX);

          if (Math.abs(angleR - angleG) > 0.05) {
            c.save();
            c.beginPath();
            c.arc(cx, cy, rPix * 0.35, angleG, angleR, false);
            c.strokeStyle = 'rgba(246, 255, 0, 0.5)';
            c.lineWidth = 1.5;
            c.setLineDash([2, 2]);
            c.stroke();
            c.restore();
          }
        }

        // 4. Glowing center origin pivot dot
        c.save();
        c.beginPath();
        c.arc(cx, cy, 3, 0, 2 * Math.PI);
        c.fillStyle = '#f6ff00';
        c.shadowColor = '#f6ff00';
        c.shadowBlur = 8;
        c.fill();
        c.restore();

        c.restore();
      },
    };

    const chart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          // 0: Outer Boundary Ring (R = 1.0)
          {
            label: 'Boundary Ring',
            data: outerRing,
            showLine: true,
            borderColor: 'rgba(26, 152, 91, 0.5)',
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false,
          },
          // 1: Inner Ring 75%
          {
            label: 'Ring 75%',
            data: ring75,
            showLine: true,
            borderColor: 'rgba(26, 152, 91, 0.2)',
            borderWidth: 1,
            borderDash: [3, 3],
            pointRadius: 0,
            fill: false,
          },
          // 2: Inner Ring 50%
          {
            label: 'Ring 50%',
            data: ring50,
            showLine: true,
            borderColor: 'rgba(26, 152, 91, 0.25)',
            borderWidth: 1,
            borderDash: [3, 3],
            pointRadius: 0,
            fill: false,
          },
          // 3: Inner Ring 25%
          {
            label: 'Ring 25%',
            data: ring25,
            showLine: true,
            borderColor: 'rgba(26, 152, 91, 0.2)',
            borderWidth: 1,
            borderDash: [3, 3],
            pointRadius: 0,
            fill: false,
          },
          // 4: Coordinate Axes
          {
            label: 'Axes',
            data: [
              { x: -1.15, y: 0 },
              { x: 1.15, y: 0 },
              { x: null, y: null },
              { x: 0, y: -1.15 },
              { x: 0, y: 1.15 },
            ],
            showLine: true,
            borderColor: 'rgba(26, 152, 91, 0.3)',
            borderWidth: 1,
            pointRadius: 0,
            fill: false,
          },
          // 5: Green Hand (Nominal Reference Phasor - Constant Magnitude)
          {
            label: 'Nominal Reference (Constant)',
            data: [
              { x: 0, y: 0 },
              { x: 0, y: PHASOR_RADIUS },
            ],
            showLine: true,
            borderColor: '#10b981',
            borderWidth: 2.5,
            pointRadius: 0,
            fill: false,
          },
          // 6: Red Hand (Clock Error Deviated Phasor)
          {
            label: 'Clock Error Phasor',
            data: [
              { x: 0, y: 0 },
              { x: 0, y: 0 },
            ],
            showLine: true,
            borderColor: '#ef4444',
            borderWidth: 2,
            borderDash: [4, 2],
            pointRadius: 0,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 1,
        animation: false,
        events: [],
        layout: {
          padding: 12,
        },
        scales: {
          x: {
            min: -1.25,
            max: 1.25,
            display: false,
          },
          y: {
            min: -1.25,
            max: 1.25,
            display: false,
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
        },
      },
      plugins: [phasorVisualsPlugin],
    });

    chartRef.current = chart;

    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  }, []);

  // Update chart phasor hands to specified rotation angle and clock error
  const renderPhasorHands = (theta, err, maxErr) => {
    if (!chartRef.current) return;
    const chart = chartRef.current;

    // Clockwise rotation from 12 o'clock: x = sin(theta), y = cos(theta)
    const xGreen = PHASOR_RADIUS * Math.sin(theta);
    const yGreen = PHASOR_RADIUS * Math.cos(theta);

    if (chart.data.datasets[5]) {
      chart.data.datasets[5].data[1] = { x: xGreen, y: yGreen };
    }

    // Red hand: clockwise with phase offset based on clock error
    const normMagnitude = Math.min(1.0, Math.max(0.1, Math.abs(err) / maxErr));
    const phaseShift = (err / maxErr) * (Math.PI / 2); // Phase lead/lag
    const thetaRed = theta + phaseShift;

    const xRed = normMagnitude * PHASOR_RADIUS * Math.sin(thetaRed);
    const yRed = normMagnitude * PHASOR_RADIUS * Math.cos(thetaRed);

    if (chart.data.datasets[6]) {
      chart.data.datasets[6].data[1] = { x: xRed, y: yRed };
    }

    chart.update('none');
  };

  // Animation loop driving clockwise rotation completing 1 circle in 7 seconds.
  // Pauses strictly with the timeline when isPlaying is false.
  useEffect(() => {
    if (!isPlaying) {
      // While paused, keep hands frozen at current rotation angle
      renderPhasorHands(
        rotationAngleRef.current,
        currentClockErrorRef.current,
        maxClockErrorRef.current || BASE_MAX_ERROR,
      );
      return undefined;
    }

    let animId;
    lastTimeRef.current = performance.now();

    function frame(now) {
      const deltaSec = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      // Clockwise rotation completing in 7 seconds (fixed 7:1.6 ratio, unsynced from speedup)
      rotationAngleRef.current =
        (rotationAngleRef.current + (2 * Math.PI * deltaSec) / NOMINAL_PERIOD) % (2 * Math.PI);

      renderPhasorHands(
        rotationAngleRef.current,
        currentClockErrorRef.current,
        maxClockErrorRef.current || BASE_MAX_ERROR,
      );

      animId = requestAnimationFrame(frame);
    }

    animId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isPlaying]);

  // If user scrubs the timeline slider while paused, update the red error hand immediately
  useEffect(() => {
    if (!isPlaying) {
      renderPhasorHands(
        rotationAngleRef.current,
        currentClockError,
        maxClockError || BASE_MAX_ERROR,
      );
    }
  }, [isPlaying, currentClockError, maxClockError]);

  return (
    <div className="phasor-container" aria-label="Clock error phasor diagram">
      <header className="panel-header">
        <span className="panel-header__title">Clock Error</span>
      </header>

      <div className="phasor-hud">
        <span>MAX: ±{maxClockError.toFixed(2)}m</span>
        <span className={Math.abs(currentClockError) > 0.001 ? 'phasor-hud__val--active' : ''}>
          CURR: {currentClockError >= 0 ? '+' : ''}
          {currentClockError.toFixed(2)}m
        </span>
        <span>7s CYCLE</span>
      </div>

      <div className="phasor-canvas-wrapper">
        <canvas ref={canvasRef} className="phasor-canvas" />
      </div>

      <div className="phasor-legend">
        <div className="phasor-legend__item">
          <span className="phasor-legend__dot phasor-legend__dot--green" />
          <span>NOMINAL (7s)</span>
          <span className="phasor-legend__dot phasor-legend__dot--red" style={{ marginLeft: 8 }} />
          <span>CLOCK DEV</span>
        </div>
      </div>
    </div>
  );
}

export default ClockErrorPhasor;
