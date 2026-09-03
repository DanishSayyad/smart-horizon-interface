import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const TRAIL_POINTS = 100;
const MAX_ORBIT_ANGLE = 0.55; // ~31.5 degrees arc around the Earth

/**
 * Renders space trails revolving around the Earth:
 * - Orbit Radius = (earthRadius) + (surfaceDistance)
 * - Green trail: Nominal circular orbit around the Earth
 * - Red trail: Deviated orbit around the Earth modulated by 3D error vector
 * - Pauses on timeline pause, resumes streaming when playing
 */
function SpaceTrails({
  currentPos = new THREE.Vector3(0, 0, 0),
  curve = null,
  progress = 0,
  isPlaying = true,
  earthRadius = 45.0,
  surfaceDistance = 1.2,
}) {
  const pulsePhaseRef = useRef(0);
  const greenPulsesRef = useRef(null);
  const redPulsesRef = useRef(null);

  // Exact orbit radius: (earthRadius) + (distance from surface)
  const orbitRadius = earthRadius + surfaceDistance;
  const orbitCenterY = -orbitRadius;

  // Initialize green nominal orbit trail (circular arc revolving around the Earth)
  const greenGeometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(TRAIL_POINTS * 3);
    const colors = new Float32Array(TRAIL_POINTS * 3);

    for (let i = 0; i < TRAIL_POINTS; i++) {
      const alpha = i / (TRAIL_POINTS - 1);
      const theta = alpha * MAX_ORBIT_ANGLE;

      // Circular arc in (Y, Z) revolving around the center of the Earth
      const y = orbitCenterY + orbitRadius * Math.cos(theta);
      const z = -orbitRadius * Math.sin(theta);

      positions[i * 3] = 0;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      const fade = Math.pow(1 - alpha, 1.2);
      // Bright green (#10b981) fading into the orbital distance
      colors[i * 3] = 0.06 * fade;
      colors[i * 3 + 1] = 0.72 * fade;
      colors[i * 3 + 2] = 0.5 * fade;
    }

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geom;
  }, [orbitRadius, orbitCenterY]);

  // Initialize red deviated orbit trail
  const redGeometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(TRAIL_POINTS * 3);
    const colors = new Float32Array(TRAIL_POINTS * 3);

    for (let i = 0; i < TRAIL_POINTS; i++) {
      const alpha = i / (TRAIL_POINTS - 1);
      const theta = alpha * MAX_ORBIT_ANGLE;

      const y = orbitCenterY + orbitRadius * Math.cos(theta);
      const z = -orbitRadius * Math.sin(theta);

      positions[i * 3] = currentPos.x;
      positions[i * 3 + 1] = y + currentPos.y;
      positions[i * 3 + 2] = z + currentPos.z;

      const fade = Math.pow(1 - alpha, 1.2);
      // Bright red (#ef4444) fading into the orbital distance
      colors[i * 3] = 0.93 * fade;
      colors[i * 3 + 1] = 0.26 * fade;
      colors[i * 3 + 2] = 0.26 * fade;
    }

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geom;
  }, [orbitRadius, orbitCenterY, currentPos.x, currentPos.y, currentPos.z]);

  // Update red trail shape whenever progress or currentPos changes
  useMemo(() => {
    if (!redGeometry) return;
    const posAttr = redGeometry.attributes.position;
    if (!posAttr) return;

    for (let i = 0; i < TRAIL_POINTS; i++) {
      const alpha = i / (TRAIL_POINTS - 1);
      const theta = alpha * MAX_ORBIT_ANGLE;

      const nominalY = orbitCenterY + orbitRadius * Math.cos(theta);
      const nominalZ = -orbitRadius * Math.sin(theta);

      if (curve) {
        // Sample backward along the curve
        const progressOffset = alpha * 0.35;
        let u = (progress - progressOffset) % 1.0;
        if (u < 0) u += 1.0;

        const sample = curve.getPoint(u);
        posAttr.setXYZ(i, sample.x, nominalY + sample.y, nominalZ + sample.z);
      } else {
        posAttr.setXYZ(i, currentPos.x, nominalY + currentPos.y, nominalZ + currentPos.z);
      }
    }
    posAttr.needsUpdate = true;
  }, [redGeometry, curve, progress, orbitRadius, orbitCenterY, currentPos.x, currentPos.y, currentPos.z]);

  // Streaming particles revolving along the trails
  const PULSE_COUNT = 8;
  const pulseGeometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(PULSE_COUNT * 3);
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geom;
  }, []);

  const redPulseGeometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(PULSE_COUNT * 3);
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geom;
  }, []);

  useFrame((_, delta) => {
    if (!isPlaying) return; // Freeze trail particles on timeline pause

    pulsePhaseRef.current = (pulsePhaseRef.current + delta * 0.25) % 1.0;
    const phase = pulsePhaseRef.current;

    // Update green trail pulses along circular orbit
    if (greenPulsesRef.current) {
      const pos = greenPulsesRef.current.geometry.attributes.position;
      for (let i = 0; i < PULSE_COUNT; i++) {
        const frac = (phase + i / PULSE_COUNT) % 1.0;
        const theta = frac * MAX_ORBIT_ANGLE;
        const y = orbitCenterY + orbitRadius * Math.cos(theta);
        const z = -orbitRadius * Math.sin(theta);
        pos.setXYZ(i, 0, y, z);
      }
      pos.needsUpdate = true;
    }

    // Update red trail pulses along deviated circular orbit
    if (redPulsesRef.current) {
      const pos = redPulsesRef.current.geometry.attributes.position;
      for (let i = 0; i < PULSE_COUNT; i++) {
        const frac = (phase + i / PULSE_COUNT) % 1.0;
        const theta = frac * MAX_ORBIT_ANGLE;
        const nominalY = orbitCenterY + orbitRadius * Math.cos(theta);
        const nominalZ = -orbitRadius * Math.sin(theta);

        if (curve) {
          let u = (progress - frac * 0.35) % 1.0;
          if (u < 0) u += 1.0;
          const pt = curve.getPoint(u);
          pos.setXYZ(i, pt.x, nominalY + pt.y, nominalZ + pt.z);
        } else {
          pos.setXYZ(i, currentPos.x, nominalY + currentPos.y, nominalZ + currentPos.z);
        }
      }
      pos.needsUpdate = true;
    }
  });

  return (
    <group>
      {/* Green trail: actual nominal circular orbit around the Earth */}
      <line geometry={greenGeometry}>
        <lineBasicMaterial vertexColors transparent opacity={0.85} />
      </line>

      {/* Red trail: deviated circular orbit around the Earth */}
      <line geometry={redGeometry}>
        <lineBasicMaterial vertexColors transparent opacity={0.85} />
      </line>

      {/* Streaming pulse points revolving along green orbit */}
      <points ref={greenPulsesRef} geometry={pulseGeometry}>
        <pointsMaterial
          color="#34d399"
          size={0.07}
          transparent
          opacity={0.8}
        />
      </points>

      {/* Streaming pulse points revolving along red deviated orbit */}
      <points ref={redPulsesRef} geometry={redPulseGeometry}>
        <pointsMaterial
          color="#f87171"
          size={0.08}
          transparent
          opacity={0.85}
        />
      </points>
    </group>
  );
}

export default SpaceTrails;
