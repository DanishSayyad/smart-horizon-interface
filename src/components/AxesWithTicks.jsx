import { useMemo } from 'react';

/**
 * 3 Axes in all 6 directions (+X, -X, +Y, -Y, +Z, -Z) without labels,
 * rendered with halved thickness and standing block tick marks (single line perpendicular to axis).
 *
 * - Axis radius: 0.0065 (halved thickness)
 * - Tick radius: 0.004 (halved thickness)
 * - X Axis ticks: standing vertically along Y
 * - Z Axis ticks: standing vertically along Y
 * - Y Axis ticks: standing perpendicular along X
 */
function AxesWithTicks({ sphereRadius = 1.9, steps = 7, color = '#e5e7eb' }) {
  const safeSteps = Math.max(1, Math.floor(steps));
  const unitSize = sphereRadius / safeSteps;
  const axisRadius = 0.0065;
  const tickRadius = 0.004;
  const tickLength = Math.max(0.03, Math.min(0.065, unitSize * 0.3));
  const fullDiameter = sphereRadius * 2;

  // Generate step indices: [1, 2, ..., steps]
  const tickIndices = useMemo(() => {
    return Array.from({ length: safeSteps }, (_, i) => i + 1);
  }, [safeSteps]);

  return (
    <group>
      {/* ===================== X AXIS (Full: -R to +R) ===================== */}
      <group>
        {/* Shaft along X */}
        <mesh position={[0, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <cylinderGeometry args={[axisRadius, axisRadius, fullDiameter, 16]} />
          <meshStandardMaterial color={color} roughness={0.3} metalness={0.1} />
        </mesh>

        {/* Standing vertical unit marks (along Y) on +X and -X */}
        {tickIndices.map((i) => {
          const dist = i * unitSize;
          return (
            <group key={`ticks-x-${i}`}>
              {/* +X standing tick */}
              <mesh position={[dist, 0, 0]} rotation={[0, 0, 0]}>
                <cylinderGeometry args={[tickRadius, tickRadius, tickLength, 10]} />
                <meshStandardMaterial color={color} roughness={0.3} metalness={0.1} />
              </mesh>
              {/* -X standing tick */}
              <mesh position={[-dist, 0, 0]} rotation={[0, 0, 0]}>
                <cylinderGeometry args={[tickRadius, tickRadius, tickLength, 10]} />
                <meshStandardMaterial color={color} roughness={0.3} metalness={0.1} />
              </mesh>
            </group>
          );
        })}
      </group>

      {/* ===================== Y AXIS (Full: -R to +R) ===================== */}
      <group>
        {/* Shaft along Y */}
        <mesh position={[0, 0, 0]} rotation={[0, 0, 0]}>
          <cylinderGeometry args={[axisRadius, axisRadius, fullDiameter, 16]} />
          <meshStandardMaterial color={color} roughness={0.3} metalness={0.1} />
        </mesh>

        {/* Perpendicular unit marks (along X) on +Y and -Y */}
        {tickIndices.map((i) => {
          const dist = i * unitSize;
          return (
            <group key={`ticks-y-${i}`}>
              {/* +Y tick */}
              <mesh position={[0, dist, 0]} rotation={[0, 0, -Math.PI / 2]}>
                <cylinderGeometry args={[tickRadius, tickRadius, tickLength, 10]} />
                <meshStandardMaterial color={color} roughness={0.3} metalness={0.1} />
              </mesh>
              {/* -Y tick */}
              <mesh position={[0, -dist, 0]} rotation={[0, 0, -Math.PI / 2]}>
                <cylinderGeometry args={[tickRadius, tickRadius, tickLength, 10]} />
                <meshStandardMaterial color={color} roughness={0.3} metalness={0.1} />
              </mesh>
            </group>
          );
        })}
      </group>

      {/* ===================== Z AXIS (Full: -R to +R) ===================== */}
      <group>
        {/* Shaft along Z */}
        <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[axisRadius, axisRadius, fullDiameter, 16]} />
          <meshStandardMaterial color={color} roughness={0.3} metalness={0.1} />
        </mesh>

        {/* Standing vertical unit marks (along Y) on +Z and -Z */}
        {tickIndices.map((i) => {
          const dist = i * unitSize;
          return (
            <group key={`ticks-z-${i}`}>
              {/* +Z standing tick */}
              <mesh position={[0, 0, dist]} rotation={[0, 0, 0]}>
                <cylinderGeometry args={[tickRadius, tickRadius, tickLength, 10]} />
                <meshStandardMaterial color={color} roughness={0.3} metalness={0.1} />
              </mesh>
              {/* -Z standing tick */}
              <mesh position={[0, 0, -dist]} rotation={[0, 0, 0]}>
                <cylinderGeometry args={[tickRadius, tickRadius, tickLength, 10]} />
                <meshStandardMaterial color={color} roughness={0.3} metalness={0.1} />
              </mesh>
            </group>
          );
        })}
      </group>
    </group>
  );
}

export default AxesWithTicks;
