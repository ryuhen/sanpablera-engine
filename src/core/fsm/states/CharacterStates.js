/**
 * ============================================================================
 * SANPABLERA ENGINE · FSM · states/CharacterStates.js
 * ----------------------------------------------------------------------------
 * STANCES PROPIOS DE CADA PELEADOR: los estados y golpes que definen como
 * pelea ese personaje y no otro.
 *
 * El mecanismo: createProfile(characterId, stances). La FSM no sabe
 * que existe Pedro ni Juan; solo ve un perfil con
 * un catalogo. Los GOLPES propios, en cambio, viven en
 * states/Movesets.js (registerMoves): el estado dice EN QUE
 * SITUACION esta el cuerpo, el moveset dice COMO es el golpe.
 * Por eso un tercer peleador es un objeto
 * de datos y no una clase nueva.
 *
 * Los stances de personaje usan el rango 100+ de ids (el enum State reserva
 * 70-99 para el agarre generico) y se registran SOLO en el perfil de ese
 * personaje: no contaminan el catalogo comun.
 * ============================================================================
 */
import SPF from '../Constants.js';

const { StateGroup, Phase, VelocityPolicy, HullKind, PhysicalFlag } = SPF;

/** Rango reservado para stances propios de personaje. */
export const CHARACTER_STATE_BASE = 100;

const F = {
    GROUND: SPF.toFlags([
        PhysicalFlag.PUSHABLE, PhysicalFlag.IMPULSE_SENSITIVE,
        PhysicalFlag.LOCK_ROTATION, PhysicalFlag.STAGE_CLAMP
    ])
};

/** =========================================================================
 *  PEDRO PÉREZ · el vecino invicto: guardia alta, golpes cortos y
 *  mucha presion. Sus stances son "de gracia" y de arriba.
 *  Sus GOLPES (el moveset capa por capa) estan en Movesets.js.
 *  ======================================================================= */
const PEDRO_STANCES = [
    {
        id: CHARACTER_STATE_BASE + 1,          // 101
        tag: 'STANCE_PERSONAJE',
        name: 'SP_CABALLERO_ALTO',
        phase: Phase.GROUND,
        groups: [StateGroup.GROUNDED, StateGroup.GROUNDED_LOCOMOTION],
        clip: 'sp_caballero_alto',
        loop: true,
        physics: {
            flags: F.GROUND,
            hull: { kind: HullKind.CAPSULE, radius: 0.44, height: 1.78, centerY: 0.89 }
        },
        posture: { limbs: 'BRACE', hipY: 0.86, spinePitch: -0.08, lean: -0.06 },
        notes: 'Guardia alta de Pedro: cobertura por arriba, no ataca'
    },
    {
        id: CHARACTER_STATE_BASE + 2,          // 102
        tag: 'STANCE_PERSONAJE',
        name: 'SP_CARGA_ALPINE',
        phase: Phase.GROUND,
        groups: [StateGroup.GROUNDED_LOCOMOTION],
        durationFrames: 38,
        clip: 'sp_carga_alpine',
        physics: {
            flags: SPF.toFlags([
                PhysicalFlag.PUSHABLE, PhysicalFlag.LOCK_ROTATION,
                PhysicalFlag.STAGE_CLAMP, PhysicalFlag.MANAGES_VELOCITY
            ]),
            velocityPolicy: VelocityPolicy.PRESERVE,
            frictionXZ: 0.02
        },
        control: { canAct: false },
        posture: { limbs: 'BRACE', hipY: 0.72, spinePitch: 0.5, lean: 0.2 },
        notes: 'Carga de Pedro: avanza encogido (la embestida es un golpe propio, ver Movesets.js)'
    },
    {
        id: CHARACTER_STATE_BASE + 3,          // 103
        tag: 'STANCE_PERSONAJE',
        name: 'SP_PASA_PIE_ABAJO',
        phase: Phase.GROUND,
        groups: [StateGroup.GROUNDED, StateGroup.GROUNDED_LOCOMOTION],
        durationFrames: 24,
        clip: 'sp_pasa_pie_abajo',
        // Invulnerable: es la tecnica de 빠져, no se puede golpear en el aire.
        control: { canAct: false, invulnerable: true },
        physics: {
            flags: SPF.toFlags([PhysicalFlag.STAGE_CLAMP, PhysicalFlag.MANAGES_VELOCITY]),
            velocityPolicy: VelocityPolicy.PRESERVE
        },
        posture: { limbs: 'QUAD', hipY: 0.3, spinePitch: 0.85 },
        notes: 'Pasa por debajo del rival (esquiva baja con invuln)'
    }
];

/** =========================================================================
 *  JUAN GARCÍA · el que no se raja: guardia alta y lenta, proyecciones
 *  fuertes. Su estilo vive en el agarre, asi que sus stances son
 *  de grappling. Su remate (RV_FIN) es un golpe propio en Movesets.js.
 *  ======================================================================= */
const JUAN_STANCES = [
    {
        id: CHARACTER_STATE_BASE + 11,         // 111
        tag: 'STANCE_PERSONAJE',
        name: 'RV_GUARDIA_ALTA',
        phase: Phase.GROUND,
        groups: [StateGroup.GROUNDED, StateGroup.GROUNDED_LOCOMOTION],
        clip: 'rv_guardia_alta',
        loop: true,
        physics: {
            flags: F.GROUND,
            hull: { kind: HullKind.CAPSULE, radius: 0.48, height: 1.82, centerY: 0.91 }
        },
        posture: { limbs: 'BRACE', hipY: 0.9, spinePitch: 0.1, lean: -0.1 },
        notes: 'Guardia alta de Juan: cubre todo menos el barrido'
    },
    {
        id: CHARACTER_STATE_BASE + 12,         // 112
        tag: 'STANCE_PERSONAJE',
        name: 'RV_AGARRE_GANCHO',
        phase: Phase.GROUND,
        groups: [StateGroup.GROUNDED_LOCOMOTION],
        durationFrames: 30,
        clip: 'rv_agarre_gancho',
        physics: {
            flags: SPF.toFlags([
                PhysicalFlag.PUSHABLE, PhysicalFlag.LOCK_ROTATION,
                PhysicalFlag.STAGE_CLAMP, PhysicalFlag.MANAGES_VELOCITY
            ]),
            velocityPolicy: VelocityPolicy.PRESERVE,
            frictionXZ: 0.04
        },
        posture: { limbs: 'BRACE', hipY: 0.82, spinePitch: 0.3 },
        notes: 'Entrada a agarre de Juan: el gancho de Juan'
    },
    {
        id: CHARACTER_STATE_BASE + 13,         // 113
        tag: 'STANCE_PERSONAJE',
        name: 'RV_FIN_DE_JUAN',
        phase: Phase.GROUND,
        groups: [StateGroup.ATTACKING],
        durationFrames: 30,
        clip: 'rv_fin_de_juan',
        attack: 'RV_FIN',
        control: { canAct: false, canTurn: false, buffersInput: true },
        physics: {
            flags: SPF.toFlags([PhysicalFlag.LOCK_ROTATION, PhysicalFlag.STAGE_CLAMP]),
            velocityPolicy: VelocityPolicy.PRESERVE,
            frictionXZ: 0.14
        },
        posture: { limbs: 'BRACE', hipY: 0.84, spinePitch: 0.28 },
        notes: 'El remate de Juan: entra al agarre en una sola accion'
    }
];

/** Catálogo de stances por personaje. */
const CHARACTER_STANCES = {
    PEDRO: PEDRO_STANCES,
    JUAN: JUAN_STANCES
};

/** Definiciones crudas de los stances del personaje (sin registrar). */
export function characterStanceDefs(characterId) {
    return (CHARACTER_STANCES[characterId] || []).slice();
}

/**
 * Registra (una sola vez) los stances de un personaje en el catalogo global.
 * La FSM trabaja despues contra createProfile(characterId, ...).
 */
export function registerCharacterStances(characterId, defineStateFn) {
    return characterStanceDefs(characterId).map((def) => defineStateFn(def));
}

/** Nombres de stances declarados por el personaje (para el menu / debug). */
export function characterStanceNames(characterId) {
    return (CHARACTER_STANCES[characterId] || []).map((d) => d.name);
}

export default CHARACTER_STANCES;