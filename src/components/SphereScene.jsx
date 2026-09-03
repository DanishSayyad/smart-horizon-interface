import { useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import AxesWithTicks from './AxesWithTicks';
import CenterCube from './CenterCube';

/**
 * Fixed non-rotatable camera framed responsively so the sphere takes up ~90%
 * of the canvas along the limiting viewport dimension.
 */
function FixedResponsiveCamera({ radius = 1.9 }) {
  const { camera, size } = useThree();

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

    // Fixed perspective viewing angle (isometric-like, showing X, Y, and Z clearly)
    const viewDirection = new THREE.Vector3(2.2, 1.8, 3.2).normalize();
    camera.position.copy(viewDirection.multiplyScalar(targetDistance));
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height, radius]);

  return null;
}

/**
 * 3D Scene Component rendered in the middle primary panel:
 * - Non-rotatable view
 * - Translucent grey sphere (20% opacity) taking up almost all of the canvas
 * - Non-colorful axes in all 6 directions with halved thickness and standing block tick marks
 * - The number of steps from origin to sphere boundary defaults to 7 and changes dynamically
 * - A center cube defaulted to 1 unit in size (1.0 * (radius / steps))
 * - "Predicted Error" title banner overlay at the top
 * - Customizable background color via style.css
 */
function SphereScene({ steps = 7, csvData = null }) {
  const sphereRadius = 1.9;
  const safeSteps = Math.max(1, Math.floor(steps));

  return (
    <div className="sphere-canvas-container" aria-label="Predicted Error 3D visualization">
      {/* Top overlay title */}
      <div className="canvas-hud" aria-label="Visualisation title">
        <span className="canvas-hud__title">Predicted Error</span>
      </div>

      <Canvas
        camera={{ position: [2.2, 1.8, 3.2], fov: 45 }}
        gl={{ alpha: true, antialias: true }}
      >
        <FixedResponsiveCamera radius={sphereRadius} />

        {/* Scene Lighting */}
        <ambientLight intensity={0.9} />
        <directionalLight position={[5, 8, 5]} intensity={1.2} />
        <directionalLight position={[-5, -4, -5]} intensity={0.4} />

        {/* 6-direction non-colorful axes with halved thickness and standing block tick marks */}
        <AxesWithTicks sphereRadius={sphereRadius} steps={safeSteps} />

        {/* Center cube defaulted to 1 unit in size */}
        <CenterCube sphereRadius={sphereRadius} steps={safeSteps} unitMultiplier={1.0} />

        {/* Non-rotatable translucent grey sphere (20% opacity) */}
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
