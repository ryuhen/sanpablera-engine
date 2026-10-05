/**
 * ============================================================================
 * SANPABLERA ENGINE · FSM · states/CharacterStates.js
 * ----------------------------------------------------------------------------
 * STANCES PROPIOS DE CADA PELEADOR: los estados y golpes que definen como
 * pelea ese personaje y no otro.
 *
 * El mecanismo: createProfile(characterId, stances) + registerMoves(characterId,
 * moves). La FSM no sabe que existe San Pablo ni Malon; solo ve un perfil con
 * un catalogo y una tabla de golpes. Por eso un tercer peleador es un objeto
 * de datos y no una clase nueva.
 *
 * Los stances de personaje usan el rango 100+ de ids (el enum State reserva
 * 70-99 para el agarre generico) y se registran SOLO en el perfil de ese
 * personaje: no contaminan el catalogo comun.
 * ============================================================================
 */
import SPF from '../Constants.js';
import { defineMove, registerMoves } from '../MoveTable.js';

const { State, StateGroup, Phase, VelocityPolicy, HullKind, PhysicalFlag } = SPF;

/** Rango reservado para stances propios de personaje. */
export const CHARACTER_STATE_BASE = 100;

const F = {
    GROUND: SPF.toFlags([
        PhysicalFlag.PUSHABLE, PhysicalFlag.IMPULSE_SENSITIVE,
        PhysicalFlag.LOCK_ROTATION, PhysicalFlag.STAGE_CLAMP
    ])
};

/** =========================================================================
 *  SAN PABLO · el luchador de barrio: guardia alta, golpes cortos y una
 *  embestida con mucha presion. Sus stances son "de gracia" y de arriba.
 *  ======================================================================= */
const SAN_PABLO_STANCES = [
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
        notes: 'Guardia alta de San Pablo: cobertura por arriba, no ataca'
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
        notes: 'Carga de San Pablo: avanza encogido y suelta la embestida al final'
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
        notes: 'Pasa por debajo del rival de San Pablo (esquiva baja con invuln)'
    }
];

/** =========================================================================
 *  MALON · el rival: guardia alta y lenta, proyectores fortes y sumisiones.
 *  Su estilo vive en el agarre, asi que sus stances son de grappling.
 *  ======================================================================= */
const MALON_STANCES = [
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
        notes: 'Guardia alta de Malon: cubre todo menos el barrido'
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
        notes: 'Entrada a agarre de Malon: el gancho de Malon'
    },
    {
        id: CHARACTER_STATE_BASE + 13,         // 113
        tag: 'STANCE_PERSONAJE',
        name: 'RV_FIN_DE_MALON',
        phase: Phase.GROUND,
        groups: [StateGroup.ATTACKING],
        durationFrames: 30,
        clip: 'rv_fin_de_malon',
        attack: 'RV_FIN',
        control: { canAct: false, canTurn: false, buffersInput: true },
        physics: {
            flags: SPF.toFlags([PhysicalFlag.LOCK_ROTATION, PhysicalFlag.STAGE_CLAMP]),
            velocityPolicy: VelocityPolicy.PRESERVE,
            frictionXZ: 0.14
        },
        posture: { limbs: 'BRACE', hipY: 0.84, spinePitch: 0.28 },
        notes: 'El remate de Malon: entra al agarre en una sola accion'
    }
];

/** Catálogo de stances por personaje. */
const CHARACTER_STANCES = {
    SAN_PABLO: SAN_PABLO_STANCES,
    MALON: MALON_STANCES
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

/** ------------------------------------------------------------------------
 *  GOLPES PROPIOS. Se registran con registerMoves para que getMoves los mezcle
 *  con el set base; un key que coincide con el base lo SUSTITUYE.
 *  ---------------------------------------------------------------------- */
registerMoves('SAN_PABLO', {
    // San Pablo no tiene especial de recurso: su tecnica es la carga, que es
    // un golpe normal con otra animacion y otro alcance.
    EMBESTIDA: defineMove('EMBESTIDA', {
        label: 'Embestida', state: State.ATAQUE_PESADO,
        startup: 11, active: 5, recovery: 20,
        damage: 13, hitstun: 22, blockstun: 12,
        hitLevel: SPF.HitLevel.FUERTE, breaksGuardHeight: SPF.GuardHeight.ALTA,
        knockdown: 'LIGHT', launchX: 4.0, launchY: 2.0, juggleAdd: 1,
        cancelTier: SPF.CancelTier.HEAVY, meterGain: 14, meterCost: 0,
        hitstop: 12, radius: 0.68, forward: 1.15, centerY: 1.0,
        clip: 'sp_embestida'
    }),
    GOLPE_CODO: defineMove('GOLPE_CODO', {
        label: 'Codo', state: State.ATAQUE_LIGERO,
        startup: 3, active: 2, recovery: 8,
        damage: 4, hitstun: 10, blockstun: 7,
        hitLevel: SPF.HitLevel.MEDIO, breaksGuardHeight: SPF.GuardHeight.ALTA,
        cancelTier: SPF.CancelTier.LIGHT, meterGain: 6, meterCost: 0,
        hitstop: 4, radius: 0.42, forward: 0.38, centerY: 1.3,
        clip: 'sp_codo'
    })
});

registerMoves('MALON', {
    RV_FIN: defineMove('RV_FIN', {
        label: 'Remate', state: State.ATAQUE_PESADO,
        startup: 14, active: 6, recovery: 24,
        damage: 18, hitstun: 26, blockstun: 12,
        hitLevel: SPF.HitLevel.FUERTE, breaksGuardHeight: SPF.GuardHeight.ALTA,
        knockdown: 'ALWAYS', launchX: 5.0, launchY: 3.4, juggleAdd: 2,
        cancelTier: SPF.CancelTier.HEAVY, meterGain: 16, meterCost: 0,
        hitstop: 14, radius: 0.9, forward: 0.95, centerY: 1.05,
        clip: 'rv_fin'
    })
});

export default CHARACTER_STANCES;