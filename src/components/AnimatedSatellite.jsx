import { useMemo } from 'react';
import * as THREE from 'three';
import { Edges } from '@react-three/drei';

/**
 * Animated Satellite represented by the 1-unit cube.
 * - Position is the vector addition from the origin (0, 0, 0)
 *   based on the interpolated (x, y, z) error vector.
 * - Draws a vector line from the origin to the cube.
 * - Draws the 3D trajectory curve connecting the sampled points.
 */
function AnimatedSatellite({
  currentPos = new THREE.Vector3(0, 0, 0),
  unitSize = 0.27,
  pathPoints = [],
}) {
  // Vector line geometry from origin to current position
  const vectorGeometry = useMemo(() => {
    if (!currentPos) return null;
    const distSq =
      currentPos.x * currentPos.x + currentPos.y * currentPos.y + currentPos.z * currentPos.z;
    if (distSq < 0.00001) return null;

    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array([0, 0, 0, currentPos.x, currentPos.y, currentPos.z]);
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geom;
  }, [currentPos?.x, currentPos?.y, currentPos?.z]);

  // Trajectory path geometry through sampled points
  const pathGeometry = useMemo(() => {
    if (!pathPoints || pathPoints.length < 2) return null;
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(pathPoints.length * 3);
    for (let i = 0; i < pathPoints.length; i++) {
      positions[i * 3] = pathPoints[i].x;
      positions[i * 3 + 1] = pathPoints[i].y;
      positions[i * 3 + 2] = pathPoints[i].z;
    }
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geom;
  }, [pathPoints]);

  const pos = currentPos || new THREE.Vector3(0, 0, 0);

  return (
    <group>
      {/* Small origin marker */}
      <mesh position={[0, 0, 0]} renderOrder={6}>
        <sphereGeometry args={[Math.max(0.015, unitSize * 0.08), 16, 16]} />
        <meshStandardMaterial color="#f6ff00" roughness={0.3} metalness={0.2} />
      </mesh>

      {/* Trajectory path through sampled points */}
      {pathGeometry && (
        <line geometry={pathGeometry}>
          <lineBasicMaterial color="#38bdf8" transparent opacity={0.45} />
        </line>
      )}

      {/* Dynamic vector line connecting origin (0,0,0) to the satellite cube */}
      {vectorGeometry && (
        <line geometry={vectorGeometry}>
          <lineBasicMaterial color="#f6ff00" transparent opacity={0.85} />
        </line>
      )}

      {/* Animated Satellite Cube (1 unit dimension) */}
      <mesh position={[pos.x, pos.y, pos.z]} renderOrder={5}>
        <boxGeometry args={[unitSize, unitSize, unitSize]} />
        <meshStandardMaterial
          color="#64748b"
          roughness={0.25}
          metalness={0.2}
          transparent
          opacity={0.8}
        />
        <Edges color="#ffffff" threshold={15} />
      </mesh>
    </group>
  );
}

export default AnimatedSatellite;
