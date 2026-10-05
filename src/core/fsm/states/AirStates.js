/**
 * ============================================================================
 * SANPABLERA ENGINE · FSM · states/AirStates.js
 * ----------------------------------------------------------------------------
 * Estados EN EL AIRE: saltos, caida libre, caida lenta, juggle y air recovery.
 *
 * El juego de pelea tiene dos airs distintos y confundirlos arruina el
 * personaje:
 *   - AIRE_LIBRE: el jugador controla el salto (avance/retroceso en el aire).
 *   - JUGGLER: el jugador NO controla nada; el cuerpo va donde lo mandaron.
 * Ambos se comportan igual en el aire, pero el segundo no acepta input de
 * ataque aereo (salvo por el combo breaker) porque si no, el juggle se
 * convierte en un combo infinito de toques.
 *
 * CAIDA_LENTA existe por el mismo motivo: cuando un personaje cae por una
 * tecnica, la gravedad se reduce y se abre la ventana de "ataque de caida".
 * ============================================================================
 */
import SPF from '../Constants.js';

const {
    State, StateGroup, Phase, VelocityPolicy, HullKind, PhysicalFlag,
    FacingAxis
} = SPF;

const F = {
    // En el aire: el luchador no se auto-limita (el limite lo pone el anillo en
    // el eje X y el rizado de la arena en Y) y NO bloquea rotacion, porque en
    // el aire el giro viene del knockback.
    AIRBORNE: SPF.toFlags([
        PhysicalFlag.PUSHABLE, PhysicalFlag.IMPULSE_SENSITIVE,
        PhysicalFlag.STAGE_CLAMP, PhysicalFlag.MANAGES_VELOCITY
    ]),

    // Juggler: cuerpo launched, sin control.
    LAUNCHED: SPF.toFlags([
        PhysicalFlag.IMPULSE_SENSITIVE, PhysicalFlag.STAGE_CLAMP,
        PhysicalFlag.MANAGES_VELOCITY
    ])
};

export default [
    {
        id: State.SALTO_NORMAL_A,
        tag: 'AEREO',
        phase: Phase.AIR,
        groups: [StateGroup.AIRBORNE, StateGroup.GROUNDED_AIRBORNE_PROJ],
        facingAxis: FacingAxis.CABEZA_A_RIVAL,
        clip: 'jump',
        physics: { flags: F.AIRBORNE, gravity: 1.25 },
        control: { canTurn: true },
        posture: { limbs: 'STAND', hipY: 1.0, spinePitch: 0.1 }
    },
    {
        id: State.SALTO_NORMAL_B,
        tag: 'AEREO',
        phase: Phase.AIR,
        groups: [StateGroup.AIRBORNE, StateGroup.GROUNDED_AIRBORNE_PROJ],
        facingAxis: FacingAxis.PIES_A_RIVAL,
        clip: 'jump',
        physics: { flags: F.AIRBORNE, gravity: 1.25 },
        control: { canTurn: true },
        posture: { limbs: 'STAND', hipY: 1.0, spinePitch: 0.1 }
    },
    {
        // Salto corto: el que se usa para dash aerial o para no comerse el
        // barrido. Menos altura, menos commitment.
        id: State.SALTO_CORTO_A,
        tag: 'AEREO',
        phase: Phase.AIR,
        groups: [StateGroup.AIRBORNE, StateGroup.GROUNDED_AIRBORNE_PROJ],
        facingAxis: FacingAxis.CABEZA_A_RIVAL,
        clip: 'hop',
        physics: { flags: F.AIRBORNE, gravity: 1.8 },
        posture: { limbs: 'CROUCH', hipY: 0.62, spinePitch: 0.4 }
    },
    {
        id: State.SALTO_CORTO_B,
        tag: 'AEREO',
        phase: Phase.AIR,
        groups: [StateGroup.AIRBORNE, StateGroup.GROUNDED_AIRBORNE_PROJ],
        facingAxis: FacingAxis.PIES_A_RIVAL,
        clip: 'hop',
        physics: { flags: F.AIRBORNE, gravity: 1.8 },
        posture: { limbs: 'CROUCH', hipY: 0.62, spinePitch: 0.4 }
    },
    {
        // Caida libre con control: el estado "de pie pero en el aire".
        id: State.AIRE_LIBRE,
        tag: 'AEREO',
        phase: Phase.AIR,
        groups: [StateGroup.AIRBORNE],
        clip: 'fall',
        loop: true,
        physics: { flags: F.AIRBORNE, gravity: 1 },
        control: { canAct: true, canTurn: true },
        posture: { limbs: 'STAND', hipY: 0.95, spinePitch: 0.12 }
    },
    {
        // Juggle: lanzado con fuerza hacia atras o hacia el aire. No hay
        // control, no hay gravedad especial, solo deceleracion. El numero de
        // golpes encadenados lo lleva la FSM (juggleCount), no el estado: asi
        // el limite JUGGLE_MAX es una regla del motor y no un estado mas.
        id: State.JUGGLER,
        tag: 'JUGGLE',
        phase: Phase.AIR,
        groups: [StateGroup.AIRBORNE, StateGroup.IMPACT, StateGroup.STUNNED],
        clip: 'juggle',
        physics: {
            flags: F.LAUNCHED,
            velocityPolicy: VelocityPolicy.PRESERVE,
            gravity: 0.85,
            frictionXZ: 0.006,
            hull: { kind: HullKind.SPHERE, radius: 0.5, centerY: 0.55, height: 1.1 }
        },
        control: { canAct: false, canTurn: false, buffersInput: true },
        posture: { limbs: 'JUGGLE', hipY: 0.7, spinePitch: -0.5, headPitch: -0.25 }
    },
    {
        // Air recovery: la ventana de recuperacion en el aire. Solo existe si
        // el juggleCount no ha pasado JUGGLE_MAX (lo comprueba la transicion).
        id: State.SALTO_AEREO_RECUPERACION,
        tag: 'AEREO',
        phase: Phase.AIR,
        groups: [StateGroup.AIRBORNE, StateGroup.STUNNED],
        durationFrames: 20,
        clip: 'air_recover',
        control: { invulnerable: true },
        physics: {
            flags: SPF.toFlags([
                PhysicalFlag.PUSHABLE, PhysicalFlag.STAGE_CLAMP,
                PhysicalFlag.MANAGES_VELOCITY
            ]),
            gravity: 0.55,
            frictionXZ: 0.08
        },
        posture: { limbs: 'FLOAT', hipY: 0.85, spinePitch: 0.3 }
    },
    {
        // Caida lenta: gravedad reducida. Se entra desde una tecnica o un
        // air dash; permite el ataque de caida y alarga el tiempo de decision
        // del rival.
        id: State.CAIDA_LENTA,
        tag: 'AEREO',
        phase: Phase.AIR,
        groups: [StateGroup.AIRBORNE],
        clip: 'slow_fall',
        loop: true,
        physics: {
            flags: F.AIRBORNE,
            gravity: 0.35,
            velocityPolicy: VelocityPolicy.DECAY,
            frictionXZ: 0.02
        },
        control: { canAct: true, canTurn: true },
        posture: { limbs: 'FLOAT', hipY: 0.98, spinePitch: 0.05 }
    }
];