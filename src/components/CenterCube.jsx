import { Edges } from '@react-three/drei';

/**
 * Cube of 1 unit dimension located at the origin (0, 0, 0).
 * Scales dynamically along with axes unit marks as `steps` changes:
 * - unitSize = sphereRadius / steps
 * - cubeDimension = unitMultiplier * unitSize (default: 1.0)
 */
function CenterCube({ sphereRadius = 1.9, steps = 7, unitMultiplier = 1.0 }) {
  const safeSteps = Math.max(1, Math.floor(steps));
  const unitSize = sphereRadius / safeSteps;
  const cubeDimension = unitMultiplier * unitSize;

  return (
    <mesh position={[0, 0, 0]} renderOrder={5}>
      <boxGeometry args={[cubeDimension, cubeDimension, cubeDimension]} />
      <meshStandardMaterial
        color="#64748b"
        roughness={0.3}
        metalness={0.1}
        transparent
        opacity={0.7}
      />
      <Edges color="#ffffff" threshold={15} />
    </mesh>
  );
}

export default CenterCube;
