import { useEffect, useMemo, useRef } from 'react';

// Speed of light: c = 0.299792458 meters per nanosecond
const SPEED_OF_LIGHT_M_PER_NS = 0.299792458;

// Convert clock error from meters to nanoseconds
function metersToNanoseconds(m) {
  if (m === null || m === undefined || !Number.isFinite(m)) return 0;
  return m / SPEED_OF_LIGHT_M_PER_NS;
}

// 7 seconds per nominal circle rotation
const NOMINAL_PERIOD_SECONDS = 7.0;
const BASE_MAX_ERROR_METERS = 1.6;

/**
 * 2D Clock Error Phasor Diagram:
 * - Pure 2D HTML5 Canvas rendering
 * - Two 2D spinning vector arrows:
 *     1. Green Arrow: Actual / Nominal Reference Phasor
 *     2. Red Arrow: Predicted Clock Error Deviated Phasor
 * - Visual angular arc showing the subtraction in their angles: Δθ = (θ_pred - θ_act)
 * - All units displayed in nanoseconds (ns)
 */
function ClockErrorPhasor({
  currentErrors,
  actualErrors = null,
  sampledPoints = [],
  testSampledPoints = [],
  allPoints = [],
  isPlaying = false,
  progress = 0,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const rotationAngleRef = useRef(0);
  const lastTimeRef = useRef(performance.now());

  // Calculate the maximum clock error in meters across predicted and actual points
  const maxClockErrorMeters = useMemo(() => {
    const points = sampledPoints.length > 0 ? sampledPoints : allPoints;
    const testPoints = testSampledPoints.length > 0 ? testSampledPoints : [];
    if ((!points || points.length === 0) && (!testPoints || testPoints.length === 0)) {
      return BASE_MAX_ERROR_METERS;
    }

    let maxVal = 0;
    for (const pt of points) {
      const val = Math.abs(typeof pt.clock === 'number' ? pt.clock : Number(pt.clock) || 0);
      if (val > maxVal) maxVal = val;
    }
    for (const pt of testPoints) {
      const val = Math.abs(typeof pt.clock === 'number' ? pt.clock : Number(pt.clock) || 0);
      if (val > maxVal) maxVal = val;
    }

    return maxVal > 0 ? maxVal : BASE_MAX_ERROR_METERS;
  }, [sampledPoints, allPoints, testSampledPoints]);

  // Clock errors in meters and nanoseconds
  const currentClockMeters = currentErrors?.clock !== undefined ? currentErrors.clock : 0;
  const actualClockMeters =
    actualErrors && actualErrors.clock !== undefined && actualErrors.clock !== null
      ? actualErrors.clock
      : null;

  const maxNs = metersToNanoseconds(maxClockErrorMeters);
  const predNs = metersToNanoseconds(currentClockMeters);
  const actNs = actualClockMeters !== null ? metersToNanoseconds(actualClockMeters) : null;
  const deltaNs = actNs !== null ? predNs - actNs : predNs;

  // Storing latest values in refs for animation loop
  const valuesRef = useRef({
    currentClockMeters,
    actualClockMeters,
    maxClockErrorMeters,
  });

  valuesRef.current = {
    currentClockMeters,
    actualClockMeters,
    maxClockErrorMeters,
  };

  // Draw pure 2D phasor diagram
  const drawPhasor = (baseTheta) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const dpr = window.devicePixelRatio || 1;

    // Reset transform
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cssW = width / dpr;
    const cssH = height / dpr;

    // Clear background
    ctx.clearRect(0, 0, cssW, cssH);

    const cx = cssW / 2;
    const cy = cssH / 2;
    const dialRadius = Math.max(20, Math.min(cssW, cssH) / 2 - 28);

    const {
      currentClockMeters: curM,
      actualClockMeters: actM,
      maxClockErrorMeters: maxM,
    } = valuesRef.current;

    // 1. Draw 2D Polar Grid / Dial
    ctx.save();

    // Outer dial circle
    ctx.beginPath();
    ctx.arc(cx, cy, dialRadius, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(30, 58, 138, 0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 50% radius inner circle
    ctx.beginPath();
    ctx.arc(cx, cy, dialRadius * 0.5, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(cx - dialRadius * 1.06, cy);
    ctx.lineTo(cx + dialRadius * 1.06, cy);
    ctx.moveTo(cx, cy - dialRadius * 1.06);
    ctx.lineTo(cx, cy + dialRadius * 1.06);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Cardinal tick labels (0° top, 90° right, 180° bottom, 270° left)
    ctx.font = '10px "Courier New", monospace';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillText('0°', cx, cy - dialRadius - 14);
    ctx.fillText('90°', cx + dialRadius + 14, cy);
    ctx.fillText('180°', cx, cy + dialRadius + 14);
    ctx.fillText('270°', cx - dialRadius - 14, cy);

    // 2. Compute 2D Arrow Angles & Magnitudes
    // In canvas coordinates: 0 is at top (12 o'clock), clockwise angle theta
    // x = cx + L * sin(theta), y = cy - L * cos(theta)

    // Green Arrow (Actual or Nominal Reference)
    let normMagGreen = 1.0;
    let phaseShiftGreen = 0;
    if (actM !== null) {
      normMagGreen = Math.min(1.0, Math.max(0.2, Math.abs(actM) / maxM));
      phaseShiftGreen = (actM / maxM) * (Math.PI / 2);
    }
    const thetaGreen = baseTheta + phaseShiftGreen;
    const lenGreen = dialRadius * 0.88 * normMagGreen;
    const tipGreenX = cx + lenGreen * Math.sin(thetaGreen);
    const tipGreenY = cy - lenGreen * Math.cos(thetaGreen);

    // Red Arrow (Predicted Clock Error)
    const normMagRed = Math.min(1.0, Math.max(0.2, Math.abs(curM) / maxM));
    const phaseShiftRed = (curM / maxM) * (Math.PI / 2);
    const thetaRed = baseTheta + phaseShiftRed;
    const lenRed = dialRadius * 0.88 * normMagRed;
    const tipRedX = cx + lenRed * Math.sin(thetaRed);
    const tipRedY = cy - lenRed * Math.cos(thetaRed);

    // 3. Subtraction in their angle: Δθ = thetaRed - thetaGreen
    let deltaTheta = (thetaRed - thetaGreen) % (2 * Math.PI);
    if (deltaTheta > Math.PI) deltaTheta -= 2 * Math.PI;
    if (deltaTheta < -Math.PI) deltaTheta += 2 * Math.PI;

    const deltaDeg = (deltaTheta * 180) / Math.PI;

    // Draw angular subtraction arc and shaded sector if angular separation exists
    if (Math.abs(deltaTheta) > 0.02) {
      ctx.save();
      const arcR = dialRadius * 0.42;

      // In canvas standard arc coords (0 is 3 o'clock):
      // Clockwise from 12 o'clock means angle in standard arc is (theta - Math.PI / 2)
      const standardGreen = thetaGreen - Math.PI / 2;
      const standardRed = thetaRed - Math.PI / 2;
      const counterClockwise = deltaTheta < 0;

      // Shaded sector between the two arrows
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, arcR, standardGreen, standardRed, counterClockwise);
      ctx.closePath();
      ctx.fillStyle = 'rgba(245, 158, 11, 0.16)';
      ctx.fill();

      // Angular dimension arc
      ctx.beginPath();
      ctx.arc(cx, cy, arcR, standardGreen, standardRed, counterClockwise);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Angular subtraction label: Δθ
      const midTheta = thetaGreen + deltaTheta * 0.5;
      const labelR = arcR * 1.35;
      const labelX = cx + labelR * Math.sin(midTheta);
      const labelY = cy - labelR * Math.cos(midTheta);

      ctx.font = 'bold 11px "Courier New", monospace';
      ctx.fillStyle = '#fbbf24';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`Δθ:${deltaDeg >= 0 ? '+' : ''}${deltaDeg.toFixed(1)}°`, labelX, labelY);

      ctx.restore();
    }

    // Helper to draw 2D vector arrow with sharp arrowhead
    function draw2DArrow(startX, startY, endX, endY, color, width = 3, arrowSize = 10, label = '') {
      const dx = endX - startX;
      const dy = endY - startY;
      const angle = Math.atan2(dy, dx);
      const len = Math.hypot(dx, dy);
      if (len < 5) return;

      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';

      // Arrow shaft
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // Arrowhead
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(
        endX - arrowSize * Math.cos(angle - Math.PI / 6),
        endY - arrowSize * Math.sin(angle - Math.PI / 6),
      );
      ctx.lineTo(
        endX - (arrowSize * 0.6) * Math.cos(angle),
        endY - (arrowSize * 0.6) * Math.sin(angle),
      );
      ctx.lineTo(
        endX - arrowSize * Math.cos(angle + Math.PI / 6),
        endY - arrowSize * Math.sin(angle + Math.PI / 6),
      );
      ctx.closePath();
      ctx.fill();

      // Label near arrow tip
      if (label) {
        ctx.font = 'bold 10px "Courier New", monospace';
        const lx = endX + 12 * Math.cos(angle);
        const ly = endY + 12 * Math.sin(angle);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, lx, ly);
      }

      ctx.restore();
    }

    // 4. Draw Arrow 1: Green Reference / Actual Vector
    draw2DArrow(
      cx,
      cy,
      tipGreenX,
      tipGreenY,
      '#10b981',
      3.5,
      12,
      actM !== null ? 'ACT' : 'REF',
    );

    // 5. Draw Arrow 2: Red Predicted Clock Vector
    draw2DArrow(
      cx,
      cy,
      tipRedX,
      tipRedY,
      '#ef4444',
      3.0,
      11,
      'PRED',
    );

    // 6. Glowing center origin pivot dot
    ctx.beginPath();
    ctx.arc(cx, cy, 4.5, 0, 2 * Math.PI);
    ctx.fillStyle = '#f6ff00';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();
  };

  // Resize canvas according to container dimensions and devicePixelRatio
  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      const w = Math.max(100, Math.floor(rect.width));
      const h = Math.max(100, Math.floor(rect.height));

      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      drawPhasor(rotationAngleRef.current);
    };

    handleResize();
    const observer = new ResizeObserver(handleResize);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // Animation frame loop driving smooth 2D spinning rotation (1 circle every 7s)
  useEffect(() => {
    if (!isPlaying) {
      drawPhasor(rotationAngleRef.current);
      return undefined;
    }

    let animId;
    lastTimeRef.current = performance.now();

    function step(now) {
      const deltaSec = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      // Clockwise rotation completing in 7 seconds
      rotationAngleRef.current =
        (rotationAngleRef.current + (2 * Math.PI * deltaSec) / NOMINAL_PERIOD_SECONDS) %
        (2 * Math.PI);

      drawPhasor(rotationAngleRef.current);
      animId = requestAnimationFrame(step);
    }

    animId = requestAnimationFrame(step);

    return () => cancelAnimationFrame(animId);
  }, [isPlaying]);

  // Scrubbing redraw when paused and error inputs change
  useEffect(() => {
    if (!isPlaying) {
      drawPhasor(rotationAngleRef.current);
    }
  }, [isPlaying, currentClockMeters, actualClockMeters, maxClockErrorMeters]);

  return (
    <div className="phasor-container" aria-label="2D Clock error phasor diagram">
      <header className="panel-header">
        <span className="panel-header__title">2D Phasor · Clock Error</span>
      </header>

      {/* HUD Telemetry in Nanoseconds (ns) and Angular Subtraction (Δθ) */}
      <div className="phasor-hud">
        <span>MAX: ±{maxNs.toFixed(2)}ns</span>
        <span className={Math.abs(predNs) > 0.001 ? 'phasor-hud__val--active' : ''}>
          PRED: {predNs >= 0 ? '+' : ''}
          {predNs.toFixed(2)}ns
        </span>
        {actNs !== null && (
          <span style={{ color: '#10b981', fontWeight: 600 }}>
            ACT: {actNs >= 0 ? '+' : ''}
            {actNs.toFixed(2)}ns
          </span>
        )}
        <span style={{ color: '#f59e0b', fontWeight: 600 }}>
          Δ: {deltaNs >= 0 ? '+' : ''}
          {deltaNs.toFixed(2)}ns
        </span>
      </div>

      <div ref={containerRef} className="phasor-canvas-wrapper" style={{ position: 'relative', width: '100%', height: '100%' }}>
        <canvas ref={canvasRef} className="phasor-canvas" style={{ display: 'block', width: '100%', height: '100%' }} />
      </div>

      <div className="phasor-legend">
        <div className="phasor-legend__item">
          <span className="phasor-legend__dot phasor-legend__dot--green" />
          <span>{actNs !== null ? 'ACT (ns)' : 'REF (7s)'}</span>
          <span className="phasor-legend__dot phasor-legend__dot--red" style={{ marginLeft: 6 }} />
          <span>PRED (ns)</span>
          <span className="phasor-legend__dot" style={{ backgroundColor: '#f59e0b', marginLeft: 6 }} />
          <span>Δθ SUBTRACTION</span>
        </div>
      </div>
    </div>
  );
}

export default ClockErrorPhasor;
