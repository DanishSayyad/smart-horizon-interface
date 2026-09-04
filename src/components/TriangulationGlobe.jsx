import { memo } from 'react';

/**
 * 3D GNSS Constellation Globe Component
 * Embeds the vanilla JS 3D globe application from the triangulation module.
 * Preserves the original animations (flowing dashed signal beams, expanding concentric ripple rings,
 * 3D space triangle, ground target marker, camera transitions, and stepper HUD) without interfering
 * with the React dashboard's location selection.
 */
function TriangulationGlobe() {
  return (
    <div className="triangulation-globe-wrapper" aria-label="3D GNSS Constellation Globe">
      <iframe
        src="/triangulation/index.html?embed=1"
        title="3D GNSS Constellation Globe"
        className="triangulation-globe-iframe"
      />
    </div>
  );
}

export default memo(TriangulationGlobe);
