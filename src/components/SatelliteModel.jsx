import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Satellite 3D Model:
 * - Rendered as an untextured outlined wireframe model
 * - Color: green (#10b981) for actual satellite, red (#ef4444) for deviated satellite
 * - Scaled up with judgment so solar panel wingspan fills the reference cube (~90%)
 * - Centered at target position
 */
function SatelliteModel({
  position = [0, 0, 0],
  unitSize = 0.17,
  color = '#10b981',
  scaleFactor = 3.6, // Scaled up so satellite fills the reference cube nicely
}) {
  const { scene } = useGLTF('/models/satellite/scene.gltf');

  // Deep clone scene and apply translucent faces wrapper material
  const outlinedScene = useMemo(() => {
    const cloned = scene.clone(true);

    const wrapperMaterial = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.35,
      metalness: 0.15,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
      emissive: color,
      emissiveIntensity: 0.12,
    });

    cloned.traverse((child) => {
      if (child.isMesh) {
        child.material = wrapperMaterial;
        child.castShadow = false;
        child.receiveShadow = false;
      }
    });

    return cloned;
  }, [scene, color]);

  // Satellite model bounds in GLTF: width ~31.08, height ~7.94, depth ~14.98
  // Geometry center is approximately [0, -2.065, 6.115]
  // Scaling by (unitSize / 31.08) * scaleFactor
  // With scaleFactor = 3.6, the satellite wingspan spans ~90% of the reference cube
  const baseScale = (unitSize / 31.08) * (scaleFactor || 3.6);

  const pos =
    position instanceof THREE.Vector3 ? [position.x, position.y, position.z] : position;

  return (
    <group position={pos}>
      {/* Offset by -center so visual center aligns with reference cube center */}
      <group scale={[baseScale, baseScale, baseScale]} rotation={[1.57, 0.4, 0]}>
        <primitive
          object={outlinedScene}
          position={[-1.3, 1.7, 3.5]}
        />
      </group>
    </group>
  );
}

useGLTF.preload('/models/satellite/scene.gltf');

export default SatelliteModel;
