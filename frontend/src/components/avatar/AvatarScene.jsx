/**
 * AvatarScene.jsx
 * ───────────────
 * React Three Fiber canvas that hosts the 3D avatar.
 *
 * CAMERA FRAMING:
 *   RPM avatars are ~1.8m tall. The head sits at roughly y=1.6 in world space
 *   (after the model group's position offset). We aim the camera at y=1.55
 *   (chin/neck area) and pull back to z=1.8 with a 38° FOV to get a
 *   natural head-and-shoulders portrait framing.
 *
 *   OrbitControls target is locked to [0, 1.55, 0] so orbiting always
 *   rotates around the face, not the feet.
 */

import { Suspense }  from "react";
import { Canvas }   from "@react-three/fiber";
import {
  Environment,
  ContactShadows,
  OrbitControls,
} from "@react-three/drei";
import AvatarModel  from "./AvatarModel";

// Camera looks at the avatar's face level (y=1.55 in world space)
const CAM_TARGET   = [0, 1.55, 0];
// Position: slightly above target, pulled back enough for head+shoulders
const CAM_POSITION = [0, 1.72, 1.85];

export default function AvatarScene() {
  return (
    <Canvas
      camera={{ position: CAM_POSITION, fov: 38 }}
      gl={{ antialias: true, alpha: true }}
      shadows
      style={{ width: "100%", height: "100%" }}
    >
      {/* Ambient fill — prevents fully black shadows */}
      <ambientLight intensity={0.55} />

      {/* Key light — warm front-left */}
      <directionalLight
        position={[-1.5, 2.5, 2]}
        intensity={1.8}
        color="#fff5e8"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />

      {/* Fill light — slightly cool to complement the warm key */}
      <directionalLight
        position={[2, 1, 1]}
        intensity={0.5}
        color="#ddeeff"
      />

      {/* Rim / back light — separates avatar from background */}
      <directionalLight
        position={[1.5, 0.5, -3]}
        intensity={0.7}
        color="#b8d0ff"
      />

      {/* HDR environment for PBR material reflections */}
      <Environment preset="studio" />

      <Suspense fallback={null}>
        <AvatarModel />

        {/* Soft contact shadow beneath the avatar */}
        <ContactShadows
          position={[0, -0.01, 0]}
          opacity={0.3}
          scale={3}
          blur={2.5}
          far={2}
        />
      </Suspense>

      {/*
        OrbitControls — always enabled so users can scroll/drag to adjust
        framing if their avatar proportions differ slightly.
        Target is locked to face level so rotation always pivots at the head.
      */}
      <OrbitControls
        target={CAM_TARGET}
        minDistance={0.8}
        maxDistance={4}
        enablePan={false}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 1.6}
      />
    </Canvas>
  );
}
