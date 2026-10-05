/**
 * ============================================================================
 * SANPABLERA ENGINE · FSM · states/AttackStates.js
 * ----------------------------------------------------------------------------
 * Estados de ATAQUE.
 *
 * Los cuatro ataques comparten la misma mecanica (startup -> active ->
 * recovery) y solo cambian el frame data, que vive en MoveTable.js. Por eso
 * son 4 estados y no 12: la fase del golpe se lee del contador de frames
 * (StateMachine#getAttackPhase) y no del id del estado.
 *
 * El clip tiene dos variantes (frente / espaldas a camara). Para el ataque
 * aereo la variante se elige por donde mire el personaje, que en pleno vuelo
 * cambia de un frame a otro: por eso el resolve de visualFacing se hace cada
 * frame y no al entrar en el estado.
 * ============================================================================
 */
import SPF from '../Constants.js';

const {
    State, StateGroup, Phase, VelocityPolicy, HullKind, PhysicalFlag
} = SPF;

/**
 * Ataque en el suelo: el golpe manda en el movimiento. Se quitan
 * IMPULSE_SENSITIVE y PUSHABLE para que al conectar no lo empujen del sitio
 * los dos cuerpos a la vez, y se queda LOCK_ROTATION para que el luchador no
 * gire a media animacion.
 */
const ATTACK_FLAGS = SPF.toFlags([
    PhysicalFlag.LOCK_ROTATION, PhysicalFlag.STAGE_CLAMP
]);

/**
 * Ataque en el aire: el luchador ya va marcado por el knockback, asi que el
 * estado solo congela el avance horizontal y deja caer.
 */
const AIR_ATTACK_FLAGS = SPF.toFlags([
    PhysicalFlag.IMPULSE_SENSITIVE, PhysicalFlag.STAGE_CLAMP,
    PhysicalFlag.MANAGES_VELOCITY
]);

export default [
    {
        id: State.ATAQUE_LIGERO,
        tag: 'ATAQUE',
        phase: Phase.GROUND,
        groups: [StateGroup.ATTACKING, StateGroup.GROUNDED],
        attack: 'ATAQUE_LIGERO',
        clip: 'atk_light',
        physics: {
            flags: ATTACK_FLAGS,
            velocityPolicy: VelocityPolicy.PRESERVE,
            frictionXZ: 0.12
        },
        control: { canAct: false, canTurn: false, buffersInput: true },
        posture: { limbs: 'STAND', hipY: 0.88, spinePitch: 0.18 }
    },
    {
        id: State.ATAQUE_PESADO,
        tag: 'ATAQUE',
        phase: Phase.GROUND,
        groups: [StateGroup.ATTACKING, StateGroup.GROUNDED],
        attack: 'ATAQUE_PESADO',
        clip: 'atk_heavy',
        physics: {
            flags: ATTACK_FLAGS,
            velocityPolicy: VelocityPolicy.PRESERVE,
            frictionXZ: 0.16
        },
        control: { canAct: false, canTurn: false, buffersInput: true },
        posture: { limbs: 'STAND', hipY: 0.86, spinePitch: 0.3 }
    },
    {
        id: State.ATAQUE_ESPECIAL,
        tag: 'ATAQUE',
        phase: Phase.GROUND,
        groups: [StateGroup.ATTACKING, StateGroup.GROUNDED],
        attack: 'ATAQUE_ESPECIAL',
        clip: 'atk_special',
        physics: {
            flags: ATTACK_FLAGS,
            velocityPolicy: VelocityPolicy.PRESERVE,
            frictionXZ: 0.2
        },
        control: { canAct: false, canTurn: false, buffersInput: true },
        posture: { limbs: 'BRACE', hipY: 0.8, spinePitch: 0.42 }
    },
    {
        id: State.ATAQUE_AEREO,
        tag: 'ATAQUE',
        phase: Phase.AIR,
        groups: [StateGroup.ATTACKING, StateGroup.AIRBORNE],
        attack: 'ATAQUE_AEREO',
        clip: 'atk_air',
        physics: {
            flags: AIR_ATTACK_FLAGS,
            velocityPolicy: VelocityPolicy.DECAY,
            gravity: 0.45,
            frictionXZ: 0.03
        },
        control: { canAct: false, canTurn: false, buffersInput: true },
        posture: { limbs: 'JUGGLE', hipY: 0.7, spinePitch: 0.25 }
    }
];

/**
 * Identificadores de golpe que este juego admite en los estados de ataque. Un
 * golpe que no este en esta lista es un error de declaracion, y se detecta al
 * cargar el catalogo (ver StateCatalog.validateCatalog) y no al conectar el
 * primer golpe en partida.
 */
export const ATTACK_MOVE_KEYS = Object.freeze([
    'ATAQUE_LIGERO', 'ATAQUE_PESADO', 'ATAQUE_ESPECIAL', 'ATAQUE_AEREO',
    'ATAQUE_AGACHADO', 'ATAQUE_BARRIDO', 'DERIVADA_TECNICA'
]);