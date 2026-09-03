/**
 * Simulation & 3D Visualization Configuration
 */

/**
 * Known scale factor applied to raw CSV position error values (x, y, z in meters)
 * to scale them down for 3D world space visualization.
 *
 * Example:
 * - With 0.025, an error of 100 meters = 2.5 units displacement in the 3D scene.
 * - Change this value anytime to adjust the visual magnitude of orbital deviations.
 */
export const ERROR_SCALE_FACTOR = 0.25;
