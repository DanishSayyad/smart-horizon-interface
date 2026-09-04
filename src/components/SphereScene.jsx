import { Suspense, useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import SpaceTrails from './SpaceTrails';
import EarthModel from './EarthModel';
import SatelliteModel from './SatelliteModel';

/**
 * Responsive camera: sets initial camera distance and frames the green cube.
 */
function ResponsiveCamera() {
  const { camera, size } = useThree();
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (!size.width || !size.height) return;

    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    // Perspective view looking down toward origin where green cube sits
    camera.position.set(3.2, 2.4, 4.2);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height]);

  return null;
}

/**
 * 3D Space Scene Component:
 * - Dark blue space background with dynamic starfield particle system
 * - Camera rotation locked to the green cube at the origin (0, 0, 0)
 * - Earth model placed below the cubes with slow axial rotation
 * - Green outlined satellite model at origin + reference dotted green cube
 * - Red outlined satellite model at currentPos + reference moving red cube
 * - SpaceTrails: Both satellites leave trails behind along -Z
 *   - Green trail: Actual nominal flight path
 *   - Red trail: Deviated flight path
 *   - Pauses on timeline pause and resumes when playing
 */
function SphereScene({
  currentPos = new THREE.Vector3(0, 0, 0),
  curve = null,
  progress = 0,
  isPlaying = true,
  currentErrors = null,
  formattedTimer = '00:00:00:00',
}) {

  return (
    <div className="sphere-canvas-container" aria-label="Satellite Orbit Error 3D visualization">
      {/* Top overlay title with space flight telemetry */}
      <div className="canvas-hud" aria-label="Visualisation title">
        <span className="canvas-hud__title">Predicted Error</span>
        <div className="canvas-hud__legend">
          <span className="hud-tag hud-tag--green">● Actual (Origin)</span>
          <span className="hud-tag hud-tag--red">● Deviated</span>
        </div>
        {currentErrors && (
          <span className="canvas-hud__coords">
            [{currentErrors.x >= 0 ? '+' : ''}{currentErrors.x.toFixed(1)},{' '}
            {currentErrors.y >= 0 ? '+' : ''}{currentErrors.y.toFixed(1)},{' '}
            {currentErrors.z >= 0 ? '+' : ''}{currentErrors.z.toFixed(1)}]m
          </span>
        )}
      </div>

      {/* Top-Right Simulation UTC Timer in dd:hh:mm:ss format */}
      <div className="canvas-timer-hud" aria-label="Simulation timer">
        <span className="canvas-timer-hud__label">UTC</span>
        <span className="canvas-timer-hud__val">{formattedTimer}</span>
      </div>

      <Canvas
        camera={{ position: [3.0, 2.2, 3.8], fov: 45, near: 0.1, far: 2000 }}
        gl={{ alpha: true, antialias: true }}
      >
        {/* Dark blue space background */}
        <color attach="background" args={['#04081a']} />

        <ResponsiveCamera />

        {/* OrbitControls: Rotation locked to green satellite at origin, polar angle clamped above horizon */}
        <OrbitControls
          makeDefault
          target={[0, 0, 0]}
          enableDamping
          dampingFactor={0.05}
          minDistance={0.8}
          maxDistance={9.5}
          maxPolarAngle={Math.PI / 2 - 0.04} // Clamps tilt to ~87.7 deg so camera stays strictly above planet surface
        />

        {/* Deep space starfield particle system - speed pauses on timeline pause */}
        <Stars
          radius={80}
          depth={50}
          count={5000}
          factor={3.5}
          saturation={0.1}
          fade
          speed={isPlaying ? 0.6 : 0}
        />

        {/* Space Scene Lighting */}
        <ambientLight intensity={1.3} />
        <directionalLight position={[10, 20, 15]} intensity={1.8} />
        <directionalLight position={[-12, 8, -10]} intensity={0.8} />
        <directionalLight position={[0, -5, 0]} intensity={0.2} />

        {/* Space Flight Trails (circular orbit revolving around the Earth) */}
        <SpaceTrails
          currentPos={currentPos}
          curve={curve}
          progress={progress}
          isPlaying={isPlaying}
          earthRadius={45.0}
          surfaceDistance={1.2}
        />

        {/* 3D GLTF Models wrapped in Suspense */}
        <Suspense fallback={null}>
          {/* Massive Earth Model placed below satellites, tilted 75 deg on X, pauses on isPlaying false */}
          <EarthModel
            surfaceDistance={1.2}
            radius={45.0}
            tiltXDeg={75}
            spinSpeed={0.02}
            isPlaying={isPlaying}
          />

          {/* Actual Satellite: Green outlined model at origin (fixed size, never resizes on CSV input) */}
          <SatelliteModel
            position={[0, 0, 0]}
            unitSize={1.9 / 7}
            color="#10b981"
            scaleFactor={3.6}
          />

          {/* Deviated Satellite: Red outlined model at moving position (fixed size, never resizes on CSV input) */}
          <SatelliteModel
            position={[currentPos.x, currentPos.y, currentPos.z]}
            unitSize={1.9 / 7}
            color="#ef4444"
            scaleFactor={3.6}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}

export default SphereScene;
