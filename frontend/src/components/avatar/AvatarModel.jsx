/**
 * AvatarModel.jsx
 * ───────────────
 * Loads a Ready Player Me GLB avatar, wires up the AnimationController,
 * and ticks it every frame via useFrame().
 *
 * Props: none — all state comes from the Zustand store.
 *
 * Avatar setup notes:
 *  - Download your GLB from readyplayer.me
 *  - In the RPM export settings, enable:
 *      ✓ Morph Targets: ARKit + Oculus Visemes
 *      ✓ Texture Atlas
 *  - Place the file at frontend/public/avatar.glb
 */

import { useRef, useEffect }        from "react";
import { useGLTF, useAnimations }   from "@react-three/drei";
import { useFrame }                  from "@react-three/fiber";
import { AnimationController }       from "./AnimationController";
import { useAvatarStore }            from "../../store/avatarStore";

const AVATAR_URL = "/avatar.glb";

export default function AvatarModel() {
  const group = useRef();
  const ctrl  = useRef(null);

  const { scene, animations }  = useGLTF(AVATAR_URL);
  const { actions }            = useAnimations(animations, group);

  // Pull real-time state from the store
  const emotionEvent    = useAvatarStore((s) => s.emotionEvent);
  const expressionEvent = useAvatarStore((s) => s.expressionEvent);
  const visemeSchedule  = useAvatarStore((s) => s.visemeSchedule);
  const audioStartTime  = useAvatarStore((s) => s.audioStartTime);
  const isSpeaking      = useAvatarStore((s) => s.isSpeaking);

  // ── Initialise AnimationController once the scene is ready ─────────────────
  useEffect(() => {
    if (scene) {
      ctrl.current = new AnimationController(scene);
    }
  }, [scene]);

  // ── Play GLB idle animation if the model includes one ──────────────────────
  useEffect(() => {
    // RPM GLBs may or may not include embedded animations
    const idle =
      actions["Idle"] ??
      actions["idle"] ??
      actions["Armature|mixamo.com|Layer0"] ??
      Object.values(actions)[0];

    if (idle) {
      idle.reset().play();
      idle.timeScale = 0.6; // slow it down for a more natural feel
    }
  }, [actions]);

  // ── Forward WebSocket emotion events to the controller ─────────────────────
  useEffect(() => {
    if (emotionEvent && ctrl.current) {
      ctrl.current.applyEmotion(emotionEvent);
    }
  }, [emotionEvent]);

  // ── Forward WebSocket expression events to the controller ──────────────────
  useEffect(() => {
    if (expressionEvent && ctrl.current) {
      ctrl.current.applyExpression(expressionEvent);
    }
  }, [expressionEvent]);

  // ── Load new viseme schedule when it arrives ────────────────────────────────
  useEffect(() => {
    if (visemeSchedule?.length && ctrl.current) {
      ctrl.current.loadVisemes(visemeSchedule);
    }
  }, [visemeSchedule]);

  // ── Start / stop lip-sync based on audio playback state ────────────────────
  useEffect(() => {
    if (!ctrl.current) return;

    if (isSpeaking && audioStartTime) {
      ctrl.current.startAudio(audioStartTime);
    } else {
      ctrl.current.stopAudio();
    }
  }, [isSpeaking, audioStartTime]);

  // ── Per-frame animation tick ────────────────────────────────────────────────
  useFrame((_, delta) => {
    ctrl.current?.update(delta);
  });

  return (
    /*
      Position: feet at y=0, centred on x/z.
      Scale: 1.0 — RPM avatars are exported in metres (~1.8m tall).
      Camera targets y=1.55 (face level) which matches at scale 1.0.
      Adjust scale only if your specific avatar is unusually sized.
    */
    <group ref={group} position={[0, 0, 0]} scale={1.0}>
      <primitive object={scene} />
    </group>
  );
}

// Preload so the GLB is ready before the first render
useGLTF.preload(AVATAR_URL);
