/**
 * ============================================================================
 * SANPABLERA ENGINE · FSM · states/GroundStates.js
 * ----------------------------------------------------------------------------
 * Estados APOYADOS EN EL SUELO: base (de pie / agachado), movilidad con
 * inercia y stances de four caracter.
 *
 * Nota sobre "de pie" y "pecho tierra": los 4 estados base que pide el diseño
 * son aire (AirStates.js), de pie (NORMAL_*), agachado (AGACHADO*) y pecho
 * tierra (SUELO_TUMBADO_BOCA_ABAJO, en ImpactStates.js, porque caer boca abajo
 * es una reaccion de impacto con su propia salida). Se separan por archivo
 * segun quien los usa, no segun el orden del enunciado.
 *
 * NORMAL_A / NORMAL_B son los dos SETS DE ANIMACION del estado de pie (A = de
 * cara a camara, B = de espaldas). El combate cotidiano no pasa por A/B: usa
 * NORMAL_A y la FSM resuelve la variante en runtime por visualFacing. A/B
 * existen para los momentos guionizados (intro, presentacion, KO) donde el set
 * se elige a mano. Misma idea en SALTO_NORMAL_A/B y SALTO_CORTO_A/B.
 * ============================================================================
 */
import SPF from '../Constants.js';

const {
    State, StateGroup, Phase, VelocityPolicy, HullKind, PhysicalFlag,
    FacingAxis
} = SPF;

/**
 * Perfiles de flags reutilizables. Se declaran aqui, y no en cada estado,
 * porque la combinacion "se puede empujar + no rota + se auto-limita" la
 * comparten 20 estados y repetirla 20 veces es garantizar que un dia una se
 * quede sin PUSHABLE.
 */
const F = {
    // Estado normal de suelo: empuja, recibe golpes, no rota, no sale del ring.
    GROUND: SPF.toFlags([
        PhysicalFlag.PUSHABLE, PhysicalFlag.IMPULSE_SENSITIVE,
        PhysicalFlag.LOCK_ROTATION, PhysicalFlag.STAGE_CLAMP
    ]),

    // Suelo en movimiento (dash, slide): el estado gestiona la velocidad, asi
    // que NO debe recibir empuje del rival ni gravedad ajena.
    MOTION: SPF.toFlags([
        PhysicalFlag.PUSHABLE, PhysicalFlag.LOCK_ROTATION,
        PhysicalFlag.STAGE_CLAMP, PhysicalFlag.MANAGES_VELOCITY
    ]),

    // Movimiento deslizante: ademas conserva la velocidad (sin rozamiento).
    GLIDE: SPF.toFlags([
        PhysicalFlag.PUSHABLE, PhysicalFlag.LOCK_ROTATION,
        PhysicalFlag.GROUND_FRICTION_OFF, PhysicalFlag.STAGE_CLAMP,
        PhysicalFlag.MANAGES_VELOCITY
    ]),

    // En el suelo pero sin control: no se puede empujar (el hitstun manda).
    LOCKED: SPF.toFlags([PhysicalFlag.STAGE_CLAMP])
};

export default [
    // =========================================================================
    // 1. BASE
    // =========================================================================
    {
        id: State.NORMAL_A,
        tag: 'BASE',
        phase: Phase.GROUND,
        groups: [StateGroup.GROUNDED, StateGroup.GROUNDED_LOCOMOTION],
        facingAxis: FacingAxis.CABEZA_A_RIVAL,
        clip: 'idle',
        loop: true,
        posture: { limbs: 'STAND', hipY: 0.92, spinePitch: 0.04 }
    },
    {
        id: State.NORMAL_B,
        tag: 'BASE',
        phase: Phase.GROUND,
        groups: [StateGroup.GROUNDED, StateGroup.GROUNDED_LOCOMOTION],
        // De espaldas: el eje del cuerpo se invierte respecto al rival.
        facingAxis: FacingAxis.PIES_A_RIVAL,
        clip: 'idle',
        loop: true,
        posture: { limbs: 'STAND', hipY: 0.92, spinePitch: 0.04 }
    },
    {
        id: State.AGACHADO,
        tag: 'BASE',
        phase: Phase.GROUND,
        groups: [StateGroup.GROUNDED, StateGroup.GROUNDED_LOCOMOTION],
        clip: 'crouch',
        loop: true,
        physics: {
            flags: F.GROUND,
            hull: { kind: HullKind.CAPSULE, radius: 0.46, height: 1.1, centerY: 0.55 }
        },
        posture: { limbs: 'CROUCH', hipY: 0.5, spinePitch: 0.35 }
    },
    {
        // Guardia alta: agachado y cubriendo el centro. El hull sube para cubrir el centro.
        id: State.AGACHADO_GUARDIA_ALTA,
        tag: 'GUARDIA',
        phase: Phase.GROUND,
        groups: [StateGroup.GROUNDED, StateGroup.GROUNDED_LOCOMOTION],
        clip: 'crouch_guard_high',
        loop: true,
        physics: {
            flags: F.GROUND,
            hull: { kind: HullKind.CAPSULE, radius: 0.48, height: 1.3, centerY: 0.64 }
        },
        posture: { limbs: 'BRACE', hipY: 0.58, spinePitch: 0.28, lean: -0.1 }
    },
    {
        id: State.AGACHADO_GUARDIA_BAJA,
        tag: 'GUARDIA',
        phase: Phase.GROUND,
        groups: [StateGroup.GROUNDED, StateGroup.GROUNDED_LOCOMOTION],
        clip: 'crouch_guard_low',
        loop: true,
        physics: {
            flags: F.GROUND,
            hull: { kind: HullKind.CAPSULE, radius: 0.48, height: 0.85, centerY: 0.42 }
        },
        posture: { limbs: 'BRACE', hipY: 0.32, spinePitch: 0.5 }
    },
    {
        id: State.MOVIMIENTO_8_DIRECCIONES,
        tag: 'BASE',
        phase: Phase.GROUND,
        groups: [StateGroup.GROUNDED, StateGroup.GROUNDED_LOCOMOTION],
        clip: 'walk',
        loop: true,
        physics: { flags: F.GROUND },
        posture: { limbs: 'STAND', hipY: 0.9, spinePitch: 0.08 }
    },
    {
        // Postura base del estilo: la guardia "de estilo" de cada peleador.
        // Es la que se carga al mantener guardia sin direccion.
        id: State.POSTURA_ESTILO_BASE,
        tag: 'STANCE',
        phase: Phase.GROUND,
        groups: [StateGroup.GROUNDED, StateGroup.GROUNDED_LOCOMOTION],
        clip: 'stance_base',
        loop: true,
        posture: { limbs: 'BRACE', hipY: 0.8, spinePitch: 0.12 }
    },
    {
        // Ventana tecnica. Se abre por cancel al final de un ataque y es la
        // unica forma de sacar la DERIVADA_TECNICA. Va en fase SYSTEM porque
        // su funcion es de cancelacion, no de pose.
        id: State.POSTURA_DERIVADA_TECNICA,
        tag: 'TECNICA',
        phase: Phase.SYSTEM,
        groups: [StateGroup.GROUNDED],
        durationFrames: 18,
        clip: 'tech_window',
        control: { canAct: true, invulnerable: true },
        physics: { flags: F.GROUND },
        posture: { limbs: 'BRACE', hipY: 0.86, spinePitch: 0.2 }
    },

    // =========================================================================
    // 2. MOVILIDAD E INERCIA
    // =========================================================================
    {
        id: State.SPRINT_FRONTAL,
        tag: 'MOVILIDAD',
        phase: Phase.GROUND,
        groups: [StateGroup.GROUNDED_LOCOMOTION],
        durationFrames: 34,
        clip: 'sprint_f',
        physics: { flags: F.MOTION, frictionXZ: 0.02 },
        posture: { limbs: 'STAND', hipY: 0.98, spinePitch: 0.22, lean: 0.12 }
    },
    {
        id: State.SPRINT_ATRAS,
        tag: 'MOVILIDAD',
        phase: Phase.GROUND,
        groups: [StateGroup.GROUNDED_LOCOMOTION],
        durationFrames: 30,
        clip: 'sprint_b',
        physics: { flags: F.MOTION, frictionXZ: 0.03 },
        posture: { limbs: 'STAND', hipY: 0.88, spinePitch: -0.18, lean: -0.12 }
    },
    {
        id: State.DASH_LATERAL,
        tag: 'MOVILIDAD',
        phase: Phase.GROUND,
        groups: [StateGroup.GROUNDED_LOCOMOTION],
        durationFrames: 20,
        clip: 'dash_side',
        physics: { flags: F.MOTION, frictionXZ: 0.06 },
        posture: { limbs: 'STAND', hipY: 0.86, spinePitch: 0.1 }
    },
    {
        id: State.SIDE_STEP,
        tag: 'MOVILIDAD',
        phase: Phase.GROUND,
        groups: [StateGroup.GROUNDED_LOCOMOTION],
        durationFrames: 22,
        clip: 'side_step',
        physics: { flags: F.MOTION, frictionXZ: 0.05 },
        posture: { limbs: 'BRACE', hipY: 0.86, spinePitch: 0.06 }
    },
    {
        // Backdash: la herramienta anti-presion, por eso lleva invulnerabilidad
        // de frames y frenada fuerte para no quedarse "pegado" al suelo.
        id: State.DASH_ATRAS,
        tag: 'MOVILIDAD',
        phase: Phase.GROUND,
        groups: [StateGroup.GROUNDED_LOCOMOTION],
        durationFrames: 22,
        clip: 'backdash',
        control: { canAct: false, invulnerable: true },
        physics: {
            flags: F.MOTION,
            velocityPolicy: VelocityPolicy.ZERO,
            frictionXZ: 0.14
        },
        posture: { limbs: 'STAND', hipY: 0.84, spinePitch: -0.3 }
    },
    {
        id: State.DESLIZAMIENTO,
        tag: 'MOVILIDAD',
        phase: Phase.GROUND,
        groups: [StateGroup.GROUNDED_LOCOMOTION],
        durationFrames: 26,
        clip: 'slide',
        physics: {
            flags: F.GLIDE,
            velocityPolicy: VelocityPolicy.DECAY,
            frictionXZ: 0.05,
            hull: { kind: HullKind.CAPSULE, radius: 0.5, height: 0.95, centerY: 0.45 }
        },
        posture: { limbs: 'CROUCH', hipY: 0.36, spinePitch: 0.15 }
    },
    {
        // Cuadrupeda: guardia baja con recuperacion lenta. Habilita el ataque
        // rasante y es el estado del que se sale con mania o guardia.
        id: State.CUADRUPEDA,
        tag: 'STANCE',
        phase: Phase.GROUND,
        groups: [StateGroup.GROUNDED, StateGroup.GROUNDED_LOCOMOTION],
        clip: 'quad',
        loop: true,
        physics: {
            flags: F.GROUND,
            hull: { kind: HullKind.CAPSULE, radius: 0.5, height: 0.8, centerY: 0.38 }
        },
        posture: { limbs: 'QUAD', hipY: 0.34, spinePitch: 0.7 }
    },
    {
        // De rodillas: a media altura, vulnerable a golpes medios y no a los
        // bajos. Es el estado al que se entra tras un knockdown corto.
        id: State.DE_RODILLAS,
        tag: 'STANCE',
        phase: Phase.GROUND,
        groups: [StateGroup.GROUNDED, StateGroup.GROUNDED_LOCOMOTION],
        durationFrames: 44,
        clip: 'kneel',
        physics: {
            flags: F.GROUND,
            hull: { kind: HullKind.CAPSULE, radius: 0.44, height: 1.15, centerY: 0.58 }
        },
        posture: { limbs: 'KNEEL', hipY: 0.5, spinePitch: 0.3 }
    },
    {
        // Tropezon: pierde el apoyo y se va atras. Destino de los golpes que
        // tumblean sin derribar (y de los errores de spacing del jugador).
        id: State.TROPEZON,
        tag: 'IMPACTO_MENOR',
        phase: Phase.GROUND,
        groups: [StateGroup.GROUNDED_LOCOMOTION, StateGroup.STUNNED],
        durationFrames: 28,
        clip: 'stagger',
        physics: {
            flags: SPF.toFlags([
                PhysicalFlag.IMPULSE_SENSITIVE, PhysicalFlag.LOCK_ROTATION,
                PhysicalFlag.STAGE_CLAMP
            ]),
            velocityPolicy: VelocityPolicy.DECAY,
            frictionXZ: 0.09
        },
        control: { canAct: false },
        posture: { limbs: 'STAGGER', hipY: 0.78, spinePitch: -0.4, headPitch: 0.3 }
    },
    {
        id: State.RODANDO,
        tag: 'MOVILIDAD',
        phase: Phase.GROUND,
        groups: [StateGroup.GROUNDED_LOCOMOTION],
        durationFrames: 32,
        clip: 'roll',
        physics: {
            flags: F.GLIDE,
            velocityPolicy: VelocityPolicy.DECAY,
            frictionXZ: 0.04,
            hull: { kind: HullKind.SPHERE, radius: 0.45, centerY: 0.45, height: 0.9 }
        },
        control: { canAct: false, invulnerable: true },
        posture: { limbs: 'ROLL', hipY: 0.45, spinePitch: 1.2 }
    },
    {
        id: State.ACROBACIA,
        tag: 'MOVILIDAD',
        phase: Phase.GROUND,
        groups: [StateGroup.GROUNDED_LOCOMOTION],
        durationFrames: 48,
        clip: 'acrobatics',
        physics: {
            flags: F.MOTION,
            gravity: 1.4,     // el multiplicador de gravedad sube: pega mas alto
            frictionXZ: 0.03
        },
        control: { canAct: false, invulnerable: true },
        posture: { limbs: 'FLOAT', hipY: 1.15, spinePitch: 0.6 }
    }
];