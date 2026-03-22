/**
 * AnimationController.js
 * ──────────────────────
 * Finite-state machine that drives ALL avatar animation on every frame.
 *
 * Responsibilities:
 *  1. EMOTIONS     — Blend-shape expressions (lerped on/off over time)
 *  2. EXPRESSIONS  — Transient procedural animations (play once, then fade)
 *  3. LIP SYNC     — Viseme schedule playback synced to audio wall-clock time
 *  4. IDLE         — Autonomous blinking + subtle breathing head sway
 *
 * Usage inside AvatarModel.jsx:
 *   const ctrl = useRef(new AnimationController(scene));
 *   useFrame((_, delta) => ctrl.current.update(delta));
 *
 * External API:
 *   ctrl.applyEmotion(event)      — from WebSocket "avatar_event" (emotion)
 *   ctrl.applyExpression(event)   — from WebSocket "avatar_event" (expression)
 *   ctrl.loadVisemes(schedule)    — from WebSocket "visemes" event
 *   ctrl.startAudio(wallClockMs)  — when first audio chunk starts playing
 *   ctrl.stopAudio()              — when audio finishes or is interrupted
 */

// ── OVR viseme ID → Ready Player Me morph target name ─────────────────────────
// RPM exports these when you enable "Visemes: OVR" in the avatar creator
const VISEME_TO_MORPH = {
  sil: "viseme_sil",
  PP:  "viseme_PP",
  FF:  "viseme_FF",
  TH:  "viseme_TH",
  DD:  "viseme_DD",
  kk:  "viseme_kk",
  CH:  "viseme_CH",
  SS:  "viseme_SS",
  nn:  "viseme_nn",
  RR:  "viseme_RR",
  aa:  "viseme_aa",
  E:   "viseme_E",
  ih:  "viseme_ih",
  oh:  "viseme_oh",
  ou:  "viseme_ou",
};

// ── Procedural expression animations ──────────────────────────────────────────
// Each receives (controller, t) where t ∈ [0, 1] normalized within the duration
const PROC_ANIMS = {
  // Head tilts back slightly — "I'm thinking about this"
  look_up: (c, t) => {
    if (c._bone) c._bone.rotation.x = -0.25 * Math.sin(Math.PI * t);
  },

  // Single nod — "Yes, I understand"
  nod: (c, t) => {
    if (c._bone) c._bone.rotation.x = 0.18 * Math.sin(2 * Math.PI * t);
  },

  // Gentle head tilt — curiosity or empathy
  head_tilt: (c, t) => {
    if (c._bone) c._bone.rotation.z = 0.12 * Math.sin(Math.PI * t);
  },

  // Fast double blink
  blink_fast: (c, t) => {
    const w = Math.sin(Math.PI * t);
    c._setMorph("eyeBlinkLeft",  w);
    c._setMorph("eyeBlinkRight", w);
  },

  // Micro laugh — subtle vertical bob
  laugh_micro: (c, t) => {
    if (c._bone) c._bone.position.y = 0.012 * Math.sin(4 * Math.PI * t);
  },

  // Slow continuous nod — "I'm listening"
  subtle_nod: (c, t) => {
    if (c._bone) c._bone.rotation.x = 0.04 * Math.sin(2 * Math.PI * t);
  },
};


export class AnimationController {

  constructor(scene) {
    this._mesh = null;   // SkinnedMesh with morph targets (head / body)
    this._bone = null;   // Head bone for procedural rotation

    // ── Emotion state
    this._emotTarget   = {};   // { morphName: targetWeight }
    this._emotCurrent  = {};   // { morphName: currentWeight } — lerped each frame
    this._emotTimer    = 0;
    this._emotDuration = 0;

    // ── Expression state
    this._expr      = null;   // current expression config or null
    this._exprTimer = 0;

    // ── Viseme state
    this._schedule    = [];     // viseme keyframe array
    this._schedIdx    = 0;      // current playback index
    this._audioStart  = null;   // wall-clock ms when audio started (performance.now())
    this._viseme      = "sil";  // current viseme ID
    this._visWeight   = 0;      // current blended weight
    this._visTarget   = 0;      // target weight for lerp

    // ── Idle state
    this._blinkTimer    = 0;
    this._blinkInterval = 3 + Math.random() * 3; // blink every 3–6 s
    this._swayPhase     = Math.random() * Math.PI * 2;

    this._scan(scene);
  }

  // ── Scene scan ─────────────────────────────────────────────────────────────

  _scan(scene) {
    scene.traverse((node) => {
      // Ready Player Me head mesh is typically named "Wolf3D_Head" or similar
      if (
        node.isMesh &&
        node.morphTargetInfluences &&
        (node.name.includes("Head") || node.name.includes("Wolf3D"))
      ) {
        this._mesh = node;
      }
      // Head bone for procedural rotations
      if (node.isBone && node.name === "Head") {
        this._bone = node;
      }
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Apply an emotion event from the WebSocket.
   * @param {object} event - { category, value, config: { blendshape, intensity, duration } }
   */
  applyEmotion({ config }) {
    const { blendshape, intensity, duration } = config;
    this._emotTimer    = 0;
    this._emotDuration = duration;

    // "reset" zeroes all currently tracked morphs
    if (blendshape === "reset") {
      Object.keys(this._emotTarget).forEach((k) => (this._emotTarget[k] = 0));
      return;
    }

    // Build bilateral target (RPM uses Left/Right pairs for most expressions)
    const targets = { [blendshape]: intensity };
    if (blendshape.endsWith("Left")) {
      targets[blendshape.replace("Left", "Right")] = intensity;
    }

    // Zero out any morph NOT in the new target set (smooth cross-fade)
    Object.keys(this._emotCurrent).forEach((k) => {
      if (!(k in targets)) targets[k] = 0;
    });

    this._emotTarget = targets;
  }

  /**
   * Apply an expression event from the WebSocket.
   * @param {object} event - { category, value, config: { animation, duration, loop } }
   */
  applyExpression({ config }) {
    this._expr      = config;
    this._exprTimer = 0;
  }

  /**
   * Load a new viseme schedule (replaces any existing one).
   * @param {Array} schedule - [{ time_ms, viseme, weight }, ...]
   */
  loadVisemes(schedule) {
    this._schedule = schedule;
    this._schedIdx = 0;
  }

  /**
   * Start lip-sync playback, anchored to the given wall-clock timestamp.
   * @param {number} wallClockMs - performance.now() value when audio started
   */
  startAudio(wallClockMs) {
    this._audioStart = wallClockMs;
    this._schedIdx   = 0;
  }

  /**
   * Stop lip-sync (audio finished or interrupted).
   */
  stopAudio() {
    this._audioStart = null;
    this._visTarget  = 0;
  }

  // ── Per-frame update ───────────────────────────────────────────────────────

  /**
   * Main tick — call this from useFrame() every frame.
   * @param {number} dt - delta time in seconds
   */
  update(dt) {
    if (!this._mesh) return;
    this._updateEmotions(dt);
    this._updateExpression(dt);
    this._updateVisemes();
    this._updateIdle(dt);
  }

  // ── Private update methods ─────────────────────────────────────────────────

  _updateEmotions(dt) {
    const LERP_SPEED = 5; // higher = snappier transitions

    for (const [morph, target] of Object.entries(this._emotTarget)) {
      const current = this._emotCurrent[morph] ?? 0;
      const next    = current + (target - current) * Math.min(dt * LERP_SPEED, 1);
      this._emotCurrent[morph] = next;
      this._setMorph(morph, next);
    }

    // Auto-decay: after the emotion's duration expires, fade it out
    this._emotTimer += dt;
    if (this._emotDuration > 0 && this._emotTimer > this._emotDuration) {
      Object.keys(this._emotTarget).forEach((k) => (this._emotTarget[k] = 0));
      this._emotDuration = 0;
    }
  }

  _updateExpression(dt) {
    if (!this._expr) return;

    const { animation, duration, loop } = this._expr;
    const fn = PROC_ANIMS[animation];

    if (!fn) {
      this._expr = null;
      return;
    }

    // Normalised progress 0 → 1
    fn(this, this._exprTimer / duration);
    this._exprTimer += dt;

    if (this._exprTimer >= duration) {
      if (loop) {
        // Loop: restart from 0
        this._exprTimer = 0;
      } else {
        // Done: clear expression and gently reset bone
        this._expr = null;
        if (this._bone) {
          this._bone.rotation.x *= 0.4;
          this._bone.rotation.z *= 0.4;
        }
      }
    }
  }

  _updateVisemes() {
    if (!this._audioStart || !this._schedule.length) {
      // No audio playing — lerp mouth back to closed
      this._visWeight += (0 - this._visWeight) * 0.12;
      const closingMorph = VISEME_TO_MORPH[this._viseme];
      if (closingMorph) this._setMorph(closingMorph, this._visWeight);
      return;
    }

    // How many ms have elapsed since audio started
    const elapsed = performance.now() - this._audioStart;

    // Advance schedule index to the current keyframe
    while (
      this._schedIdx < this._schedule.length - 1 &&
      this._schedule[this._schedIdx + 1].time_ms <= elapsed
    ) {
      this._schedIdx++;
    }

    const kf = this._schedule[this._schedIdx];
    if (!kf) return;

    // Viseme changed → zero out the previous morph target
    if (kf.viseme !== this._viseme) {
      const prevMorph = VISEME_TO_MORPH[this._viseme];
      if (prevMorph) this._setMorph(prevMorph, 0);
      this._viseme = kf.viseme;
    }

    // Smooth lerp toward target weight
    this._visTarget  = kf.weight;
    this._visWeight += (this._visTarget - this._visWeight) * 0.35;

    const morphName = VISEME_TO_MORPH[this._viseme];
    if (morphName) this._setMorph(morphName, this._visWeight);
  }

  _updateIdle(dt) {
    // ── Autonomous blinking ──
    this._blinkTimer += dt;
    if (this._blinkTimer >= this._blinkInterval) {
      this._triggerBlink();
      this._blinkTimer    = 0;
      this._blinkInterval = 3 + Math.random() * 3;
    }

    // ── Subtle breathing / head sway ──
    if (this._bone) {
      this._swayPhase       += dt * 0.35;
      this._bone.rotation.z  = 0.007 * Math.sin(this._swayPhase);
    }
  }

  _triggerBlink() {
    // Animate blink as a rapid open → close → open in ~120ms
    // Uses setTimeout to keep it off the render loop
    const BLINK_DURATION = 0.12; // seconds
    let t = 0;

    const step = () => {
      if (!this._mesh) return;

      const halfDur = BLINK_DURATION / 2;
      const w = t < halfDur
        ? t / halfDur
        : 1 - (t - halfDur) / halfDur;

      this._setMorph("eyeBlinkLeft",  w);
      this._setMorph("eyeBlinkRight", w);

      t += 0.016; // ~60fps step
      if (t < BLINK_DURATION) setTimeout(step, 16);
    };

    step();
  }

  // ── Utility ────────────────────────────────────────────────────────────────

  _setMorph(name, weight) {
    if (!this._mesh) return;
    const idx = this._mesh.morphTargetDictionary?.[name];
    if (idx !== undefined) {
      this._mesh.morphTargetInfluences[idx] = Math.max(0, Math.min(1, weight));
    }
  }
}
