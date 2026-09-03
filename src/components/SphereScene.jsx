import { useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import GizmoAxes from './GizmoAxes';

/**
 * Ensures the sphere takes up almost all (~90%) of the canvas viewport,
 * dynamically adapting when the window or panel is resized.
 */
function ResponsiveCamera({ radius = 1.9 }) {
  const { camera, size } = useThree();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!size.width || !size.height) return;

    const aspect = size.width / size.height;
    const vFovRad = (camera.fov * Math.PI) / 180;
    // Sphere takes up ~90% of the canvas along the limiting dimension
    const targetCoverage = 0.90;
    const diameter = radius * 2;

    const reqDistVertical = diameter / (2 * Math.tan(vFovRad / 2) * targetCoverage);
    const reqDistHorizontal = diameter / (2 * Math.tan(vFovRad / 2) * aspect * targetCoverage);
    const targetDistance = Math.max(reqDistVertical, reqDistHorizontal);

    if (!initializedRef.current) {
      // Set an isometric-like perspective view direction so X, Y, and Z are all clearly visible
      const initialDirection = new THREE.Vector3(2.2, 1.8, 3.2).normalize();
      camera.position.copy(initialDirection.multiplyScalar(targetDistance));
      camera.lookAt(0, 0, 0);
      initializedRef.current = true;
    } else {
      // Preserve current user viewing angle and adjust distance to keep the sphere framed
      const dir = camera.position.clone().normalize();
      camera.position.copy(dir.multiplyScalar(targetDistance));
    }
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height, radius]);

  return null;
}

/**
 * 3D Scene Component rendered in the middle primary panel.
 * Contains:
 * - A grey translucent sphere (20% opacity) filling almost the entire canvas
 * - A 3-axis gizmo (X: Red, Y: Green, Z: Blue) centered inside the sphere at the origin
 * - OrbitControls for user interaction (orbit, pan, zoom)
 * - Canvas with alpha transparency to allow CSS background customization via style.css
 */
function SphereScene() {
  const sphereRadius = 1.9;
  const axisLength = 1.5;

  return (
    <div className="sphere-canvas-container" aria-label="3D sphere visualization">
      <Canvas
        camera={{ position: [2.2, 1.8, 3.2], fov: 45 }}
        gl={{ alpha: true, antialias: true }}
      >
        <ResponsiveCamera radius={sphereRadius} />
        <OrbitControls
          enableDamping
          dampingFactor={0.05}
          minDistance={2.1}
          maxDistance={15}
        />

        {/* Scene Lighting */}
        <ambientLight intensity={0.9} />
        <directionalLight position={[5, 8, 5]} intensity={1.2} />
        <directionalLight position={[-5, -4, -5]} intensity={0.4} />

        {/* 3-Axis Gizmo inside the sphere, centered at (0, 0, 0) */}
        <GizmoAxes axisLength={axisLength} radius={sphereRadius} />

        {/* Grey translucent sphere with 20% opacity enclosing the gizmo */}
        <mesh renderOrder={10}>
          <sphereGeometry args={[sphereRadius, 64, 64]} />
          <meshStandardMaterial
            color="#888888"
            transparent
            opacity={0.2}
            roughness={0.25}
            metalness={0.1}
            depthWrite={false}
          />
        </mesh>
      </Canvas>
    </div>
  );
}

export default SphereScene;
