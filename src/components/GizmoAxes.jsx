import * as THREE from 'three';
import { Html } from '@react-three/drei';

/**
 * 3-Axis Gizmo located at the origin (0, 0, 0)
 * - X axis: Red (#ff4d4f) with arrowhead and "X" badge
 * - Y axis: Green (#52c41a) with arrowhead and "Y" badge
 * - Z axis: Blue (#1677ff) with arrowhead and "Z" badge
 * - Negative stems: Semi-transparent guides along -X, -Y, -Z
 * - Origin: White sphere marker at (0, 0, 0)
 */
function GizmoAxes({ axisLength = 1.5 }) {
  const shaftRadius = 0.022;
  const headRadius = 0.07;
  const headLength = 0.24;
  const shaftLength = axisLength - headLength;
  const negLength = axisLength * 0.55;

  return (
    <group>
      {/* Center origin marker */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.045, 16, 16]} />
        <meshStandardMaterial color="#ffffff" roughness={0.3} metalness={0.2} />
      </mesh>

      {/* X AXIS (Red) */}
      <group>
        {/* +X Shaft */}
        <mesh
          position={[shaftLength / 2, 0, 0]}
          rotation={[0, 0, -Math.PI / 2]}
        >
          <cylinderGeometry args={[shaftRadius, shaftRadius, shaftLength, 16]} />
          <meshStandardMaterial color="#ff4d4f" roughness={0.3} metalness={0.1} />
        </mesh>
        {/* +X Cone Arrowhead */}
        <mesh
          position={[shaftLength + headLength / 2, 0, 0]}
          rotation={[0, 0, -Math.PI / 2]}
        >
          <coneGeometry args={[headRadius, headLength, 16]} />
          <meshStandardMaterial color="#ff4d4f" roughness={0.3} metalness={0.1} />
        </mesh>
        {/* -X Negative Stem */}
        <mesh
          position={[-negLength / 2, 0, 0]}
          rotation={[0, 0, -Math.PI / 2]}
        >
          <cylinderGeometry args={[shaftRadius * 0.6, shaftRadius * 0.6, negLength, 12]} />
          <meshStandardMaterial color="#ff4d4f" transparent opacity={0.25} />
        </mesh>
        {/* X Label */}
        <Html
          position={[axisLength + 0.16, 0, 0]}
          center
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          <div className="axis-label axis-label--x">X</div>
        </Html>
      </group>

      {/* Y AXIS (Green) */}
      <group>
        {/* +Y Shaft */}
        <mesh
          position={[0, shaftLength / 2, 0]}
          rotation={[0, 0, 0]}
        >
          <cylinderGeometry args={[shaftRadius, shaftRadius, shaftLength, 16]} />
          <meshStandardMaterial color="#52c41a" roughness={0.3} metalness={0.1} />
        </mesh>
        {/* +Y Cone Arrowhead */}
        <mesh
          position={[0, shaftLength + headLength / 2, 0]}
          rotation={[0, 0, 0]}
        >
          <coneGeometry args={[headRadius, headLength, 16]} />
          <meshStandardMaterial color="#52c41a" roughness={0.3} metalness={0.1} />
        </mesh>
        {/* -Y Negative Stem */}
        <mesh
          position={[0, -negLength / 2, 0]}
          rotation={[0, 0, 0]}
        >
          <cylinderGeometry args={[shaftRadius * 0.6, shaftRadius * 0.6, negLength, 12]} />
          <meshStandardMaterial color="#52c41a" transparent opacity={0.25} />
        </mesh>
        {/* Y Label */}
        <Html
          position={[0, axisLength + 0.16, 0]}
          center
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          <div className="axis-label axis-label--y">Y</div>
        </Html>
      </group>

      {/* Z AXIS (Blue) */}
      <group>
        {/* +Z Shaft */}
        <mesh
          position={[0, 0, shaftLength / 2]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry args={[shaftRadius, shaftRadius, shaftLength, 16]} />
          <meshStandardMaterial color="#1677ff" roughness={0.3} metalness={0.1} />
        </mesh>
        {/* +Z Cone Arrowhead */}
        <mesh
          position={[0, 0, shaftLength + headLength / 2]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <coneGeometry args={[headRadius, headLength, 16]} />
          <meshStandardMaterial color="#1677ff" roughness={0.3} metalness={0.1} />
        </mesh>
        {/* -Z Negative Stem */}
        <mesh
          position={[0, 0, -negLength / 2]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry args={[shaftRadius * 0.6, shaftRadius * 0.6, negLength, 12]} />
          <meshStandardMaterial color="#1677ff" transparent opacity={0.25} />
        </mesh>
        {/* Z Label */}
        <Html
          position={[0, 0, axisLength + 0.16]}
          center
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          <div className="axis-label axis-label--z">Z</div>
        </Html>
      </group>
    </group>
  );
}

export default GizmoAxes;
