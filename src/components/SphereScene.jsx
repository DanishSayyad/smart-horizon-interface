import { Suspense, useEffect, useRef } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import SpaceTrails from './SpaceTrails';
import EarthModel from './EarthModel';
import SatelliteModel from './SatelliteModel';

/**
 * Rotating Stars Component:
 * - Centered on the satellite at origin [0, 0, 0]
 * - Rotates opposite to Earth's axial rotation (+X direction) in both GEO and MEO settings
 * - Pauses rotation when simulation playback is paused
 */
function RotatingStars({ isPlaying }) {
  const starsGroupRef = useRef(null);

  useFrame((_, delta) => {
    if (isPlaying && starsGroupRef.current) {
      // Earth spins in negative X direction (-delta * 0.02);
      // stars rotate opposite in positive X direction around satellite [0,0,0]
      starsGroupRef.current.rotation.x += delta * 0.015;
    }
  });

  return (
    <group ref={starsGroupRef} position={[0, 0, 0]}>
      <Stars
        radius={110}
        depth={60}
        count={5500}
        factor={8}
        saturation={0}
        fade={false}
        speed={0}
      />
    </group>
  );
}

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
  currentActualPos = new THREE.Vector3(0, 0, 0),
  actualCurve = null,
  progress = 0,
  isPlaying = true,
  currentErrors = null,
  currentActualErrors = null,
  formattedTimer = '00:00:00:00',
  source = 'MEO',
}) {
  // Height variable: default distance for MEO (1.2), increased by 5 when switched to GEO
  const GEO_HEIGHT_VARIABLE = 5.0;
  const DEFAULT_SURFACE_DISTANCE = 1.2;
  const surfaceDistance =
    source === 'GEO' ? DEFAULT_SURFACE_DISTANCE + GEO_HEIGHT_VARIABLE : DEFAULT_SURFACE_DISTANCE;

  return (
    <div className="sphere-canvas-container" aria-label="Satellite Orbit Error 3D visualization">
      {/* Top overlay bar containing title, legend, telemetry and UTC timer without overlap */}
      <div className="canvas-top-bar" aria-label="Visualisation header">
        <div className="canvas-hud" aria-label="Visualisation title">
          <span className="canvas-hud__title">Predicted Error</span>
          <div className="canvas-hud__legend">
            <span className="hud-tag hud-tag--green">● Actual</span>
            <span className="hud-tag hud-tag--red">● Deviated</span>
          </div>
          <div className="canvas-hud__coords-group">
            {currentActualErrors && (
              <span className="canvas-hud__coords canvas-hud__coords--green" title="Actual Telemetry Error">
                ACT: [{currentActualErrors.x >= 0 ? '+' : ''}{currentActualErrors.x.toFixed(1)},{' '}
                {currentActualErrors.y >= 0 ? '+' : ''}{currentActualErrors.y.toFixed(1)},{' '}
                {currentActualErrors.z >= 0 ? '+' : ''}{currentActualErrors.z.toFixed(1)}]m
              </span>
            )}
            {currentErrors && (
              <span className="canvas-hud__coords" title="Deviated Predicted Error">
                {currentActualErrors ? 'PRED: ' : ''}[{currentErrors.x >= 0 ? '+' : ''}{currentErrors.x.toFixed(1)},{' '}
                {currentErrors.y >= 0 ? '+' : ''}{currentErrors.y.toFixed(1)},{' '}
                {currentErrors.z >= 0 ? '+' : ''}{currentErrors.z.toFixed(1)}]m
              </span>
            )}
          </div>
        </div>

        {/* Top-Right Simulation UTC Timer in dd:hh:mm:ss format */}
        <div className="canvas-timer-hud" aria-label="Simulation timer">
          <span className="canvas-timer-hud__label">UTC</span>
          <span className="canvas-timer-hud__val">{formattedTimer}</span>
        </div>
      </div>

      <Canvas
        camera={{ position: [3.0, 2.2, 3.8], fov: 45, near: 0.1, far: 2000 }}
        gl={{ alpha: true, antialias: true }}
      >
        {/* Dark space background */}
        <color attach="background" args={['#060913']} />

        <ResponsiveCamera />

        {/* OrbitControls: Rotation locked to origin frame, polar angle clamped above horizon */}
        <OrbitControls
          makeDefault
          target={[0, 0, 0]}
          enableDamping
          dampingFactor={0.05}
          minDistance={0.8}
          maxDistance={25.0}
          maxPolarAngle={Math.PI / 2 - 0.04} // Clamps tilt to ~87.7 deg so camera stays strictly above planet surface
        />

        {/* Stars rotating opposite to Earth, centered on satellite [0, 0, 0] in both GEO and MEO */}
        <RotatingStars isPlaying={isPlaying} />

        {/* Space Scene Lighting */}
        <ambientLight intensity={1.3} />
        <directionalLight position={[10, 20, 15]} intensity={1.8} />
        <directionalLight position={[-12, 8, -10]} intensity={0.8} />
        <directionalLight position={[0, -5, 0]} intensity={0.2} />

        {/* Space Flight Trails (circular orbit revolving around the Earth) */}
        <SpaceTrails
          currentPos={currentPos}
          curve={curve}
          currentActualPos={currentActualPos}
          actualCurve={actualCurve}
          progress={progress}
          isPlaying={isPlaying}
          earthRadius={45.0}
          surfaceDistance={surfaceDistance}
        />

        {/* 3D GLTF Models wrapped in Suspense */}
        <Suspense fallback={null}>
          {/* Massive Earth Model placed below satellites, tilted 75 deg on X, locked when source is GEO */}
          <EarthModel
            surfaceDistance={surfaceDistance}
            radius={45.0}
            tiltXDeg={75}
            spinSpeed={0.02}
            isPlaying={isPlaying}
            isLocked={source === 'GEO'}
          />

          {/* Actual Satellite: Green outlined model at currentActualPos (plots 8th-day trajectory when provided) */}
          <SatelliteModel
            position={[currentActualPos.x || 0, currentActualPos.y || 0, currentActualPos.z || 0]}
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
