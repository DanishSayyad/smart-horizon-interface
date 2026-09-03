import { useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import AxesWithTicks from './AxesWithTicks';
import AnimatedSatellite from './AnimatedSatellite';

/**
 * Responsive camera framing: sets initial camera distance so the sphere fills
 * ~90% of the canvas along the limiting viewport dimension.
 */
function ResponsiveCamera({ radius = 1.9 }) {
  const { camera, size } = useThree();
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (!size.width || !size.height) return;

    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    const aspect = size.width / size.height;
    const vFovRad = (camera.fov * Math.PI) / 180;
    const targetCoverage = 0.90;
    const diameter = radius * 2;

    const reqDistVertical = diameter / (2 * Math.tan(vFovRad / 2) * targetCoverage);
    const reqDistHorizontal = diameter / (2 * Math.tan(vFovRad / 2) * aspect * targetCoverage);
    const targetDistance = Math.max(reqDistVertical, reqDistHorizontal);

    const viewDirection = new THREE.Vector3(2.2, 1.8, 3.2).normalize();
    camera.position.copy(viewDirection.multiplyScalar(targetDistance));
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height, radius]);

  return null;
}

/**
 * 3D Scene Component rendered in the middle primary panel:
 * - Unlocked sphere rotation with OrbitControls (interactive 3D inspection)
 * - Translucent grey sphere (20% opacity) taking up almost all of the canvas
 * - Non-colorful axes in all 6 directions with standing block tick marks
 * - Dynamic sphere step count: integer(max value + 1)
 * - Animated satellite cube of 1 unit dimension with vector line from origin
 * - "Predicted Error" title banner overlay at the top with live telemetry
 * - Customizable background color via style.css
 */
function SphereScene({
  steps = 7,
  currentPos = new THREE.Vector3(0, 0, 0),
  pathPoints = [],
  currentErrors = null,
}) {
  const sphereRadius = 1.9;
  const safeSteps = Math.max(1, Math.floor(steps));
  const unitSize = sphereRadius / safeSteps;

  return (
    <div className="sphere-canvas-container" aria-label="Predicted Error 3D visualization">
      {/* Top overlay title with live error coordinates */}
      <div className="canvas-hud" aria-label="Visualisation title">
        <span className="canvas-hud__title">Predicted Error</span>
        <span className="canvas-hud__scale">Scale: ±{safeSteps}m</span>
        {currentErrors && (
          <span className="canvas-hud__coords">
            [{currentErrors.x >= 0 ? '+' : ''}{currentErrors.x.toFixed(1)},{' '}
            {currentErrors.y >= 0 ? '+' : ''}{currentErrors.y.toFixed(1)},{' '}
            {currentErrors.z >= 0 ? '+' : ''}{currentErrors.z.toFixed(1)}]m
          </span>
        )}
      </div>

      <Canvas
        camera={{ position: [2.2, 1.8, 3.2], fov: 45 }}
        gl={{ alpha: true, antialias: true }}
      >
        <ResponsiveCamera radius={sphereRadius} />

        {/* Unlocked 3D sphere rotation controls */}
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.05}
          minDistance={1.2}
          maxDistance={25}
        />

        {/* Scene Lighting */}
        <ambientLight intensity={0.9} />
        <directionalLight position={[5, 8, 5]} intensity={1.2} />
        <directionalLight position={[-5, -4, -5]} intensity={0.4} />

        {/* 6-direction non-colorful axes with standing block tick marks */}
        <AxesWithTicks sphereRadius={sphereRadius} steps={safeSteps} />

        {/* Animated Satellite Cube (1 unit) & Vector Addition from origin */}
        <AnimatedSatellite
          currentPos={currentPos}
          unitSize={unitSize}
          pathPoints={pathPoints}
        />

        {/* Translucent grey sphere (20% opacity) */}
        <mesh renderOrder={10}>
          <sphereGeometry args={[sphereRadius, 64, 64]} />
          <meshStandardMaterial
            color="#808080"
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
