import { useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Earth 3D Model:
 * - Positioned below the satellites along negative Y
 * - Dynamically normalized so the top surface sits at Y = -surfaceDistance
 * - Tilted ~75 degrees on the X axis
 * - Continuously spins around its own local Y axis (slow spin, never pauses)
 */
function EarthModel({
  surfaceDistance = 1.2, // Satellite altitude above Earth's surface
  radius = 200.0,         // Massive planetary globe
  tiltXDeg = 75,         // Tilt angle on X axis in degrees
  spinSpeed = 0.01,      // Continuous spin speed on its own Y axis
  isPlaying = true,      // Pauses Earth rotation when simulation is paused
  isLocked = false,      // Locks Earth rotation when GEO is selected
}) {
  const spinRef = useRef(null);
  const { scene } = useGLTF('/models/earth/scene.gltf');

  // Clone scene so multiple Canvas instances (Panel 1 & Panel 2) each own an independent model hierarchy
  const earthScene = useMemo(() => {
    return scene.clone(true);
  }, [scene]);

  // Measure raw model dimensions to normalize scale accurately
  const { rawRadius, centerOffset } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(earthScene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z) || 196.2;

    return {
      rawRadius: maxDim / 2,
      centerOffset: center.negate(),
    };
  }, [earthScene]);

  // Scale so the model's actual radius equals target radius
  const scale = radius / (rawRadius || 98.1);
  // Position center so top apex is exactly at Y = -surfaceDistance
  const centerY = -(surfaceDistance + radius);

  // 75 degrees in radians
  const tiltXRad = THREE.MathUtils.degToRad(tiltXDeg);

  // Continuous spin on its own local Y axis - pauses when isPlaying is false or when isLocked is true (GEO mode)
  useFrame((_, delta) => {
    if (isPlaying && !isLocked && spinRef.current) {
      spinRef.current.rotation.x -= delta * spinSpeed;
    }
  });

  return (
    <group
      position={[0, centerY, 0]}
      scale={[scale, scale, scale]}
    >
      {/* Tilted on X axis by 75 degrees */}
      <group rotation={[tiltXRad, 0, 0]}>
        {/* Continuously spins around its own local Y axis */}
        <group ref={spinRef}>
          <primitive
            object={earthScene}
            position={[centerOffset.x, centerOffset.y, centerOffset.z]}
          />
        </group>
      </group>
    </group>
  );
}

useGLTF.preload('/models/earth/scene.gltf');

export default EarthModel;
