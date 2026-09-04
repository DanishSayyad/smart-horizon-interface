/**
 * Satellite Motion & Triangulation Simulation Engine
 *
 * Implements the behind-the-scenes simulation engine:
 * 1. Local ENU coordinate frame with receiver at origin (0, 0, 0)
 * 2. 4 tracked satellites (A, B, C, D), slot A carrying time-varying injected error
 * 3. MEO (90s period) and GEO (360s period) orbital modes with hardcoded ranges
 * 4. 3D motion model with non-flat elevation bob
 * 5. True range + 12m common clock bias + sinusoidal injected error on slot A
 * 6. Model prediction recovering ~93% of error with realistic residual wobble
 * 7. Dual iterative Gauss-Newton least squares trilateration solves (raw vs corrected)
 * 8. Radius calculation with 4x presentation amplification
 * 9. Exact per-frame output contract
 * 10. Seamless mode switching with persistent simulation time t
 */

export const SATELLITE_SLOTS = {
  A: { azimuth: 40, elevation: 55, role: 'Errorsome', isErrorSource: true },
  B: { azimuth: 160, elevation: 35, role: 'Clean', isErrorSource: false },
  C: { azimuth: 260, elevation: 50, role: 'Clean', isErrorSource: false },
  D: { azimuth: 320, elevation: 25, role: 'Clean', isErrorSource: false },
};

export const MODE_CONFIG = {
  MEO: {
    period: 90, // seconds
    baseError: 6.6, // meters nominal baseline error (produces ~10.5m - 11m raw solve radius)
    fluctuationAmplitude: 0.35, // meters subtle realistic drift/wobble
    fluctuationPeriod: 10, // seconds
    rangesKm: {
      A: 28000,
      B: 15000,
      C: 20000,
      D: 30000,
    },
  },
  GEO: {
    period: 360, // seconds
    baseError: 6.6, // meters nominal baseline error (produces ~10.5m - 11m raw solve radius)
    fluctuationAmplitude: 0.35, // meters subtle realistic drift/wobble
    fluctuationPeriod: 14, // seconds
    rangesKm: {
      A: 50000,
      B: 23000,
      C: 35000,
      D: 30000,
    },
  },
};

export const COMMON_CLOCK_BIAS = 12; // meters
export const RADIUS_AMPLIFICATION = 1; // 1:1 true meter ratio (amplification removed)

/**
 * Converts ENU (range, azimuth, elevation) to Cartesian (East, North, Up).
 * Azimuth & elevation are in degrees.
 */
export function enuToCartesian(rangeMeters, azimuthDeg, elevationDeg) {
  const azRad = (azimuthDeg * Math.PI) / 180;
  const elRad = (elevationDeg * Math.PI) / 180;
  return {
    x: rangeMeters * Math.cos(elRad) * Math.sin(azRad), // East
    y: rangeMeters * Math.cos(elRad) * Math.cos(azRad), // North
    z: rangeMeters * Math.sin(elRad),                  // Up
  };
}

/**
 * Computes 3D position of satellite slot at time t (seconds).
 */
export function getSatellitePosition(slotKey, t, mode) {
  const config = MODE_CONFIG[mode] || MODE_CONFIG.MEO;
  const slot = SATELLITE_SLOTS[slotKey];
  const period = config.period;

  const azimuth = ((slot.azimuth + (360 / period) * t) % 360 + 360) % 360;
  const elevation = slot.elevation + 6 * Math.sin((2 * Math.PI * t) / (period / 3));
  const rangeMeters = config.rangesKm[slotKey] * 1000;

  return enuToCartesian(rangeMeters, azimuth, elevation);
}

/**
 * Gaussian elimination with partial pivoting to solve 4x4 linear system A * x = b.
 */
function solveLinearSystem4x4(A, b) {
  const M = [
    [...A[0], b[0]],
    [...A[1], b[1]],
    [...A[2], b[2]],
    [...A[3], b[3]],
  ];
  const n = 4;

  for (let i = 0; i < n; i++) {
    // Pivot selection
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) {
        maxRow = k;
      }
    }
    const temp = M[i];
    M[i] = M[maxRow];
    M[maxRow] = temp;

    if (Math.abs(M[i][i]) < 1e-12) return null; // Singular matrix

    for (let k = i + 1; k < n; k++) {
      const c = M[k][i] / M[i][i];
      for (let j = i; j <= n; j++) {
        M[k][j] -= c * M[i][j];
      }
    }
  }

  // Back substitution
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = M[i][n];
    for (let j = i + 1; j < n; j++) {
      sum -= M[i][j] * x[j];
    }
    x[i] = sum / M[i][i];
  }
  return x;
}

/**
 * 3D Trilateration solver via iterative Gauss-Newton least squares.
 * Solves for receiver position (x, y, z) and receiver clock bias b.
 */
export function solve3D(satellitePositions, pseudoranges, previousGuess) {
  let { x, y, z, b } = previousGuess || { x: 0, y: 0, z: 0, b: 0 };

  for (let iter = 0; iter < 8; iter++) {
    const A = [];
    const residuals = [];

    for (let i = 0; i < 4; i++) {
      const sp = satellitePositions[i];
      const dx = sp.x - x;
      const dy = sp.y - y;
      const dz = sp.z - z;
      const rangeHat = Math.hypot(dx, dy, dz);
      if (rangeHat === 0) continue;

      const predicted = rangeHat + b;
      A.push([-dx / rangeHat, -dy / rangeHat, -dz / rangeHat, 1]);
      residuals.push(pseudoranges[i] - predicted);
    }

    const delta = solveLinearSystem4x4(A, residuals);
    if (!delta) break;

    x += delta[0];
    y += delta[1];
    z += delta[2];
    b += delta[3];

    if (Math.hypot(delta[0], delta[1], delta[2], delta[3]) < 1e-5) {
      break;
    }
  }

  return { x, y, z, b };
}

/**
 * Formats simulation time t into UTC string matching contract: "01:20:14.15".
 */
export function formatSimulationUtc(t) {
  const baseSec = 1 * 3600 + 20 * 60; // Base: 01:20:00
  const totalSec = baseSec + t;
  const hours = Math.floor((totalSec / 3600) % 24);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = Math.floor(totalSec % 60);
  const centis = Math.floor((totalSec % 1) * 100);

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  const cs = String(centis).padStart(2, '0');

  return `${hh}:${mm}:${ss}.${cs}`;
}

/**
 * Triangulation Simulation Engine class
 */
export class TriangulationEngine {
  constructor(initialMode = 'MEO') {
    this.mode = initialMode;
    this.lastDeviatedFix = null;
    this.lastCorrectedFix = null;
  }

  setMode(newMode) {
    if (newMode !== this.mode) {
      this.mode = newMode;
      // Requirement §10.3: Reset warm-start guesses across mode switch
      this.lastDeviatedFix = null;
      this.lastCorrectedFix = null;
    }
  }

  resetWarmStart() {
    this.lastDeviatedFix = null;
    this.lastCorrectedFix = null;
  }

  /**
   * Advances simulation to time t (seconds) and evaluates per-frame state.
   */
  step(t, mode, optionalCsvError) {
    if (mode && mode !== this.mode) {
      this.setMode(mode);
    }

    const currentMode = this.mode;
    const config = MODE_CONFIG[currentMode] || MODE_CONFIG.MEO;

    // 1. Calculate 3D satellite positions
    const posA = getSatellitePosition('A', t, currentMode);
    const posB = getSatellitePosition('B', t, currentMode);
    const posC = getSatellitePosition('C', t, currentMode);
    const posD = getSatellitePosition('D', t, currentMode);

    const positions = [posA, posB, posC, posD];

    // 2. Compute true ranges & pseudoranges
    const trueRangeA = Math.hypot(posA.x, posA.y, posA.z);
    const trueRangeB = Math.hypot(posB.x, posB.y, posB.z);
    const trueRangeC = Math.hypot(posC.x, posC.y, posC.z);
    const trueRangeD = Math.hypot(posD.x, posD.y, posD.z);

    // Slot A nominal error: steady baseline (calibrated to produce ~10.5m - 11m raw solve radius)
    const baseError = optionalCsvError !== undefined && optionalCsvError !== null
      ? Math.min(8.0, Math.max(5.5, Math.abs(optionalCsvError) * 4.0))
      : config.baseError;

    const fluc =
      config.fluctuationAmplitude * Math.sin((2 * Math.PI * t) / config.fluctuationPeriod) +
      0.12 * Math.cos((2 * Math.PI * t) / (config.fluctuationPeriod * 0.45));
    const injectedError = baseError + fluc;

    // Reverted post-predictive correction residual: restores realistic ~7.5m inner circle solve
    const residual =
      4.5 +
      0.15 * Math.sin(1.8 * t) +
      0.08 * Math.cos(3.3 * t);
    const predictedError = injectedError - residual;

    const rawPseudoranges = [
      trueRangeA + COMMON_CLOCK_BIAS + injectedError,
      trueRangeB + COMMON_CLOCK_BIAS,
      trueRangeC + COMMON_CLOCK_BIAS,
      trueRangeD + COMMON_CLOCK_BIAS,
    ];

    const correctedPseudoranges = [
      trueRangeA + COMMON_CLOCK_BIAS + residual,
      rawPseudoranges[1],
      rawPseudoranges[2],
      rawPseudoranges[3],
    ];

    // 3. Dual solves with warm start
    const deviatedFix = solve3D(positions, rawPseudoranges, this.lastDeviatedFix);
    this.lastDeviatedFix = deviatedFix;

    const correctedFix = solve3D(positions, correctedPseudoranges, this.lastCorrectedFix);
    this.lastCorrectedFix = correctedFix;

    // 4. Radius calculation (Section 8)
    const rawDeviationOffset = Math.hypot(deviatedFix.x, deviatedFix.y, deviatedFix.z);
    const correctedDeviationOffset = Math.hypot(correctedFix.x, correctedFix.y, correctedFix.z);
    const outerRadius = rawDeviationOffset;
    const innerRadius = correctedDeviationOffset;

    // 5. Per-frame output contract (Section 9)
    return {
      utc: formatSimulationUtc(t),
      mode: currentMode,
      satellites: {
        A: {
          position: [posA.x, posA.y, posA.z],
          isErrorSource: true,
          rawPseudorange: rawPseudoranges[0],
          correctedPseudorange: correctedPseudoranges[0],
        },
        B: {
          position: [posB.x, posB.y, posB.z],
          isErrorSource: false,
          rawPseudorange: rawPseudoranges[1],
          correctedPseudorange: correctedPseudoranges[1],
        },
        C: {
          position: [posC.x, posC.y, posC.z],
          isErrorSource: false,
          rawPseudorange: rawPseudoranges[2],
          correctedPseudorange: correctedPseudoranges[2],
        },
        D: {
          position: [posD.x, posD.y, posD.z],
          isErrorSource: false,
          rawPseudorange: rawPseudoranges[3],
          correctedPseudorange: correctedPseudoranges[3],
        },
      },
      injectedError,
      predictedError,
      deviatedFix: {
        x: deviatedFix.x,
        y: deviatedFix.y,
        z: deviatedFix.z,
        offsetFromTruth: [deviatedFix.x, deviatedFix.y, deviatedFix.z],
      },
      correctedFix: {
        x: correctedFix.x,
        y: correctedFix.y,
        z: correctedFix.z,
        offsetFromTruth: [correctedFix.x, correctedFix.y, correctedFix.z],
      },
      clockErrorMeters: injectedError,
      radius: {
        outer: outerRadius,
        inner: innerRadius,
      },
      // Convenience metrics for UI panels
      rawDeviationOffset,
      correctedDeviationOffset,
      orbitalPeriod: config.period,
    };
  }
}

// Global default engine instance for shared per-frame simulation
export const defaultTriangulationEngine = new TriangulationEngine('MEO');
