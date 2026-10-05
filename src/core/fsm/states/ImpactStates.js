/**
 * ============================================================================
 * SANPABLERA ENGINE · FSM · states/ImpactStates.js
 * ----------------------------------------------------------------------------
 * Estados de IMPACTO, SUELO y RECUPERACION.
 *
 * Aqui se decide la parte del combate que mas se nota cuando esta mal: como se
 * cae el luchador y por donde se levanta.
 *
 * Reglas implementadas en los datos de este archivo:
 *
 * 1. NIVEL DE IMPACTO (HitLevel) -> estado de reaccion.
 *      BAJO  -> derribo de cara (pecho tierra): un barrido no manda a la
 *               espalda aunque el golpe sea de frente.
 *      MEDIO -> hitstun en el sitio; knockdown solo si ya estaba en el suelo.
 *      FUERTE-> hitstun largo + knockdown, y rompe guardia.
 *
 * 2. ORIENTACION DE CAIDA (DownOrientation + FacingAxis).
 *      De frente -> CABEZA_A_RIVAL (se cae de espaldas, viendo al rival).
 *      A la espalda -> PIES_A_RIVAL (se cae de cara, viendo al rival).
 *      Barrido/rasante -> FLANCO (angulo intermedio: ni de frente ni de
 *      espaldas, que es donde mas se nota la falta de animaciones).
 *
 * 3. LEVANTADA con invulnerabilidad (WAKEUP_INVULN_FRAMES). Sin esto, el
 *      bucle "tumbado -> levantarse -> re-cebir -> tumbado" es infinito y el
 *      juego se vuelve injugable en la esquina.
 * ============================================================================
 */
import SPF from '../Constants.js';

const {
    State, StateGroup, Phase, VelocityPolicy, HullKind, PhysicalFlag,
    FacingAxis, DownOrientation, ORIENTATION_TO_AXIS
} = SPF;

const F = {
    // Hitstun en el suelo: no se puede empujar (el knockback manda) pero si
    // recibe mas impulsos si esta en el aire.
    HITSTUN: SPF.toFlags([PhysicalFlag.STAGE_CLAMP, PhysicalFlag.MANAGES_VELOCITY]),
    // Tumble en el aire.
    TUMBLE: SPF.toFlags([
        PhysicalFlag.IMPULSE_SENSITIVE, PhysicalFlag.STAGE_CLAMP,
        PhysicalFlag.MANAGES_VELOCITY
    ]),
    // En el suelo: no puede empujar a nadie ni ser empujado; esta tumbado.
    DOWNED: SPF.toFlags([PhysicalFlag.STAGE_CLAMP]),
    // Levantada: invulnerable por control, no por flag (lo comprueba el
    // guard de transicion con WAKEUP_INVULN_FRAMES).
    WAKEUP: SPF.toFlags([
        PhysicalFlag.PUSHABLE, PhysicalFlag.IMPULSE_SENSITIVE,
        PhysicalFlag.LOCK_ROTATION, PhysicalFlag.STAGE_CLAMP
    ])
};

/**
 * Volumenes tumbados. Un tumbado necesita un hull bajo y ancho; si se le
 * deja la capsula de pie, el rival le "atraviesa" el cuerpo al Levantarse y los
 * golpes bajos nunca conectan contra el.
 */
const HULL_PRONE = { kind: HullKind.CAPSULE, radius: 0.5, height: 0.45, centerY: 0.22 };
const HULL_SUPINE = { kind: HullKind.CAPSULE, radius: 0.5, height: 0.45, centerY: 0.22 };
const HULL_WAKEUP = { kind: HullKind.CAPSULE, radius: 0.44, height: 1.3, centerY: 0.65 };

export default [
    // =========================================================================
    // IMPACTO EN EL AIRE Y EN EL SUELO
    // =========================================================================
    {
        // Hitstun normal. La duracion la fija el golpe que entro
        // (hitReaction.hitstun), no un numero aqui: por eso no lleva
        // durationFrames y el handler usa el payload del HIT.
        id: State.GOLPEADO,
        tag: 'IMPACTO',
        phase: Phase.IMPACT,
        groups: [StateGroup.IMPACT, StateGroup.STUNNED],
        clip: 'hitstun',
        physics: {
            flags: F.HITSTUN,
            velocityPolicy: VelocityPolicy.DECAY,
            frictionXZ: 0.06,
            hull: { kind: HullKind.CAPSULE, radius: 0.46, height: 1.6, centerY: 0.8 }
        },
        control: { canAct: false, canTurn: false, buffersInput: true },
        posture: { limbs: 'STAGGER', hipY: 0.84, spinePitch: -0.28, headPitch: 0.35 }
    },
    {
        // Mareado: hitstun largo y mareo (no se puede atacar). Es el castigo
        // por encadenar golpes medios: mas spectacular que el knockdown y
        // deja al rival vulnerable a un combo.
        id: State.MAREADO,
        tag: 'IMPACTO',
        phase: Phase.IMPACT,
        groups: [StateGroup.IMPACT, StateGroup.STUNNED],
        clip: 'dizzy',
        physics: {
            flags: F.HITSTUN,
            velocityPolicy: VelocityPolicy.DECAY,
            frictionXZ: 0.08
        },
        control: { canAct: false, canTurn: false, buffersInput: true },
        posture: { limbs: 'STAGGER', hipY: 0.8, spinePitch: 0.18, headPitch: 0.5 }
    },
    {
        // Sin aire: se acabo el juggle (juggleCount > JUGGLE_MAX). Pierde el
        // air recovery y cae derecho al suelo. Es el estado que cierra el
        // el bucle infinito de combos aereos.
        id: State.SIN_AIRE,
        tag: 'IMPACTO',
        phase: Phase.AIR,
        groups: [StateGroup.IMPACT, StateGroup.AIRBORNE, StateGroup.STUNNED],
        clip: 'juggle_dead',
        physics: {
            flags: F.TUMBLE,
            velocityPolicy: VelocityPolicy.DECAY,
            gravity: 1.6,     // cae mas rapido: el castigo por perder el aire
            frictionXZ: 0.01
        },
        control: { canAct: false, canTurn: false },
        posture: { limbs: 'JUGGLE', hipY: 0.72, spinePitch: -0.6, headPitch: -0.3 }
    },

    // =========================================================================
    // SUELO (2 orientaciones de cuerpo x 4 orientaciones de eje)
    // =========================================================================
    {
        // Pecho tierra (boca abajo). Se llega tras un barrido o tras caerse de
        // frente. De esta postura se levanta con LEVANTANDOSE_DESDE_PECHO_TIERRA
        // (el "get up" lento, con invulnerabilidad) o se entra en groundwork.
        id: State.SUELO_TUMBADO_BOCA_ABAJO,
        tag: 'SUELO',
        phase: Phase.DOWNED,
        groups: [StateGroup.DOWNED],
        clip: 'down_prone',
        physics: {
            flags: F.DOWNED,
            velocityPolicy: VelocityPolicy.ZERO,
            hull: HULL_PRONE
        },
        control: { canAct: false, canTurn: false, buffersInput: true },
        posture: { limbs: 'PRONE', hipY: 0.18, spinePitch: 0, headPitch: 0 },
        down: {
            wakeup: State.LEVANTANDOSE_DESDE_PECHO_TIERRA,
            orientation: DownOrientation.CABEZA_A_RIVAL,
            axis: FacingAxis.CABEZA_A_RIVAL
        },
        onHeavyHit: State.SUELO_TUMBADO_BOCA_ABAJO
    },
    {
        // Espalda (boca arriba). El knockdown clasico. El eje por defecto son
        // los pies hacia el rival, porque asi el primer frame de la levantada
        // mira hacia donde viene el golpe y el jugador ve el peligro.
        id: State.SUELO_TUMBADO_BOCA_ARRIBA,
        tag: 'SUELO',
        phase: Phase.DOWNED,
        groups: [StateGroup.DOWNED],
        clip: 'down_supine',
        physics: {
            flags: F.DOWNED,
            velocityPolicy: VelocityPolicy.ZERO,
            hull: HULL_SUPINE
        },
        control: { canAct: false, canTurn: false, buffersInput: true },
        posture: { limbs: 'SUPINE', hipY: 0.2, spinePitch: 0, headPitch: 0 },
        down: {
            wakeup: State.LEVANTANDOSE_DESDE_AGACHADO,
            orientation: DownOrientation.PIES_A_RIVAL,
            axis: FacingAxis.PIES_A_RIVAL
        },
        onHeavyHit: State.SUELO_TUMBADO_BOCA_ARRIBA
    },

    // =========================================================================
    // LEVANTADA (wakeup)
    // =========================================================================
    {
        id: State.LEVANTANDOSE_DESDE_AGACHADO,
        tag: 'WAKEUP',
        phase: Phase.WAKEUP,
        groups: [StateGroup.WAKEUP],
        durationFrames: 14,
        clip: 'wakeup_crouch',
        control: { canAct: false, invulnerable: true },
        physics: {
            flags: F.WAKEUP,
            velocityPolicy: VelocityPolicy.ZERO,
            hull: HULL_WAKEUP
        },
        posture: { limbs: 'CROUCH', hipY: 0.46, spinePitch: 0.4 }
    },
    {
        id: State.LEVANTANDOSE_DESDE_PECHO_TIERRA,
        tag: 'WAKEUP',
        phase: Phase.WAKEUP,
        groups: [StateGroup.WAKEUP],
        durationFrames: 22,
        clip: 'wakeup_prone',
        control: { canAct: false, invulnerable: true },
        physics: {
            flags: F.WAKEUP,
            velocityPolicy: VelocityPolicy.ZERO,
            hull: HULL_WAKEUP
        },
        posture: { limbs: 'KNEEL', hipY: 0.4, spinePitch: 0.55 }
    },

    // =========================================================================
    // MECANICAS DE SISTEMA
    // =========================================================================
    {
        // Any-Point Cancel: estado puente de 1 frame. Existe para que la
        // transicion de cancel sea auditable (se puede ver en el log que el
        // cancel paso por aqui) y para aplicar la penalizacion de frames de
        // una sola vez, en un sitio.
        id: State.ANY_POINT_CANCEL,
        tag: 'SISTEMA',
        phase: Phase.SYSTEM,
        groups: [StateGroup.ATTACKING],
        durationFrames: 1,
        clip: null,
        control: { canAct: true, invulnerable: true },
        physics: { flags: F.HITSTUN, velocityPolicy: VelocityPolicy.PRESERVE }
    },
    {
        // Combo Breaker: rompe el combo con invulnerabilidad y empuje. Es la
        // red de seguridad del sistema de combos: si el rival llega a
        // JUGGLE_MAX, todavia puede salir con coste de recurso.
        id: State.COMBO_BREAKER,
        tag: 'SISTEMA',
        phase: Phase.SYSTEM,
        groups: [StateGroup.IMPACT],
        durationFrames: 12,
        clip: 'combo_breaker',
        control: { canAct: true, invulnerable: true },
        physics: {
            flags: SPF.toFlags([PhysicalFlag.PUSHABLE, PhysicalFlag.STAGE_CLAMP]),
            velocityPolicy: VelocityPolicy.ZERO
        },
        posture: { limbs: 'BRACE', hipY: 0.9, spinePitch: 0.1 }
    }
];

/**
 * Traduce una DownOrientation al eje numerico del cuerpo. Se exporta para que
 * la sesion de agarre y el resolutor de caidas usen el mismo criterio que el
 * catalogo.
 */
export function axisOf(orientation) {
    return ORIENTATION_TO_AXIS[orientation] != null
        ? ORIENTATION_TO_AXIS[orientation]
        : FacingAxis.PIES_A_RIVAL;
}