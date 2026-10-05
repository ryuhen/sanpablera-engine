/**
 * ============================================================================
 * SANPABLERA ENGINE · FSM · MoveTable.js
 * ----------------------------------------------------------------------------
 * FRAME DATA de cada golpe, en FRAMES a 60 Hz (ver la convencion de
 * Constants.js). Un golpe no es "un estado": es un estado + una tabla de
 * frames + una forma de colision. Separarlo permite que dos personajes
 * compartan el mismo estado ATAQUE_LIGERO y se sientan distintos.
 *
 * Que hay aqui y que no:
 *   - Aqui: timings, dano, hitstun, nivel de impacto, coste/ganancia de
 *     recurso, knockback, cancelabilidad, forma de la hitbox y clips.
 *   - En StateCatalog.js: en que estado entra el golpe, como se sale y que
 *     flags fisicas tiene.
 * ============================================================================
 */
import SPF from './Constants.js';

const { State, HitLevel, GuardHeight, CancelTier, VisualFacing, Phase } = SPF;

/**
 * Normaliza una definicion de golpe y calcula lo derivado. Todo lo derivado
 * (duracion total, id numerico) se calcula UNA vez aqui: si dos sitios tuvieran
 * que sumar startup+active+recovery a mano, tarde o temprano uno se equivoca.
 */
function defineMove(key, def) {
    const move = {
        key,
        label: def.label || key,
        state: def.state,
        phase: def.phase || Phase.GROUND,
        required: Object.freeze({ ...(def.required || {}) }),

        startup: def.startup,
        active: def.active,
        recovery: def.recovery,

        damage: def.damage,
        hitstun: def.hitstun,
        blockstun: def.blockstun,
        hitLevel: def.hitLevel || HitLevel.MEDIO,
        // Altura de guardia que BLOQUEA este golpe. Si el_guardaje del rival es
        // mas bajo, el golpe pasa: es lo que hace que agacharse no baste contra
        // un overhead sin anadir un ataque mas.
        breaksGuardHeight: def.breaksGuardHeight || GuardHeight.ALTA,

        knockdown: def.knockdown || 'NONE',      // NONE | LIGHT | ALWAYS
        launch: Object.freeze({ x: def.launchX || 0, y: def.launchY || 0 }),
        juggleAdd: def.juggleAdd || 0,
        // Frames en los que la FSM "congela" a los dos luchadores al conectar
        // (el hitstop). Es la sensacion de impacto del juego entero.
        hitstop: def.hitstop != null ? def.hitstop : 6,
        freeze: def.freeze || 0,                 // super freeze del especial

        cancelTier: def.cancelTier || CancelTier.LIGHT,
        meterCost: def.meterCost || 0,
        meterGain: def.meterGain || 0,

        hitbox: Object.freeze({
            radius: def.radius || 0.55,
            forward: def.forward != null ? def.forward : 0.55,
            centerY: def.centerY != null ? def.centerY : 1.0
        }),

        // Dos clips por orientacion visual (ver VisualFacing). Es el requisito
        // "normal / agachado / salto con frente y con espalda a camara"
        // resuelto como dato y no duplicando estados.
        clips: Object.freeze({
            [VisualFacing.FRENTE_A_CAMARA]: def.clipFront || (def.clip + '__f'),
            [VisualFacing.ESPALDA_A_CAMARA]: def.clipBack || (def.clip + '__b')
        })
    };

    move.duration = move.startup + move.active + move.recovery;
    // Frame en el que la hitbox se enciende (0-indexado) y en el que se apaga.
    move.activeStart = move.startup;
    move.activeEnd = move.startup + move.active - 1;
    return Object.freeze(move);
}

/**
 * Set base del juego. Cualquier personaje arranca con esto y encima le anade
 * (o sustituye) sus golpes propios via registerMoves().
 */
const CORE_MOVES = {
    ATAQUE_LIGERO: defineMove('ATAQUE_LIGERO', {
        label: 'Ligero', state: State.ATAQUE_LIGERO,
        startup: 4, active: 3, recovery: 7,
        damage: 6, hitstun: 12, blockstun: 8,
        hitLevel: HitLevel.MEDIO, breaksGuardHeight: GuardHeight.MEDIA,
        cancelTier: CancelTier.LIGHT, meterGain: 8, meterCost: 0,
        hitstop: 5, radius: 0.5, forward: 0.5, centerY: 1.15,
        clip: 'atk_light'
    }),

    ATAQUE_PESADO: defineMove('ATAQUE_PESADO', {
        label: 'Pesado', state: State.ATAQUE_PESADO,
        startup: 9, active: 4, recovery: 18,
        damage: 14, hitstun: 20, blockstun: 12,
        hitLevel: HitLevel.FUERTE, breaksGuardHeight: GuardHeight.ALTA,
        knockdown: 'LIGHT', launchX: 3.2, launchY: 2.6, juggleAdd: 1,
        cancelTier: CancelTier.HEAVY, meterGain: 12, meterCost: 0,
        hitstop: 10, radius: 0.72, forward: 0.7, centerY: 1.05,
        clip: 'atk_heavy'
    }),

    ATAQUE_ESPECIAL: defineMove('ATAQUE_ESPECIAL', {
        label: 'Especial', state: State.ATAQUE_ESPECIAL,
        required: { meter: 25 },
        startup: 11, active: 6, recovery: 26,
        damage: 22, hitstun: 26, blockstun: 14,
        hitLevel: HitLevel.FUERTE, breaksGuardHeight: GuardHeight.ALTA,
        knockdown: 'ALWAYS', launchX: 6.5, launchY: 4.2, juggleAdd: 2,
        cancelTier: CancelTier.SPECIAL, meterCost: 25, meterGain: 0,
        hitstop: 14, freeze: 48, radius: 0.85, forward: 0.9, centerY: 1.1,
        clip: 'atk_special'
    }),

    // Golpe en el aire. El unico que puede conectar mientras se esta en JUGGLER,
    // y por eso el unico que suma juggle.
    ATAQUE_AEREO: defineMove('ATAQUE_AEREO', {
        label: 'Aereo', state: State.ATAQUE_AEREO,
        phase: Phase.AIR,
        startup: 5, active: 6, recovery: 8,
        damage: 9, hitstun: 16, blockstun: 9,
        hitLevel: HitLevel.MEDIO, breaksGuardHeight: GuardHeight.MEDIA,
        launchX: 1.4, launchY: 2.2, juggleAdd: 1,
        cancelTier: CancelTier.LIGHT, meterGain: 10, meterCost: 0,
        hitstop: 6, radius: 0.55, forward: 0.5, centerY: 0.2,
        clip: 'atk_air'
    }),

    ATAQUE_AGACHADO: defineMove('ATAQUE_AGACHADO', {
        label: 'Agachado', state: State.ATAQUE_LIGERO,
        startup: 5, active: 3, recovery: 9,
        damage: 5, hitstun: 11, blockstun: 8,
        hitLevel: HitLevel.BAJO, breaksGuardHeight: GuardHeight.BAJA,
        cancelTier: CancelTier.LIGHT, meterGain: 6, meterCost: 0,
        hitstop: 4, radius: 0.5, forward: 0.45, centerY: 0.42,
        clip: 'atk_crouch'
    }),

    // Barrido: el unico golpe BAJO con launch, por eso derriba. Lanza al
    // estado de suelo con la orientacion de cabeza al rival.
    ATAQUE_BARRIDO: defineMove('ATAQUE_BARRIDO', {
        label: 'Barrido', state: State.ATAQUE_PESADO,
        startup: 8, active: 4, recovery: 22,
        damage: 8, hitstun: 0, blockstun: 10,
        hitLevel: HitLevel.BAJO, breaksGuardHeight: GuardHeight.BAJA,
        knockdown: 'ALWAYS', launchX: 1.1, launchY: 0,
        cancelTier: CancelTier.HEAVY, meterGain: 10, meterCost: 0,
        hitstop: 8, radius: 0.8, forward: 0.75, centerY: 0.22,
        clip: 'atk_sweep'
    }),

    // Derivada tecnica: solo sale desde POSTURA_DERIVADA_TECNICA (la ventana
    // tecnica) y es el final de la cadena de cancelacion (CancelTier.TECHNIQUE).
    DERIVADA_TECNICA: defineMove('DERIVADA_TECNICA', {
        label: 'Derivada', state: State.ATAQUE_ESPECIAL,
        required: { stance: 'POSTURA_DERIVADA_TECNICA' },
        startup: 6, active: 5, recovery: 20,
        damage: 18, hitstun: 30, blockstun: 10,
        hitLevel: HitLevel.FUERTE, breaksGuardHeight: GuardHeight.ALTA,
        knockdown: 'ALWAYS', launchX: 5.0, launchY: 5.0, juggleAdd: 3,
        cancelTier: CancelTier.TECHNIQUE, meterCost: 0, meterGain: 0,
        hitstop: 16, freeze: 30, radius: 0.8, forward: 0.85, centerY: 1.0,
        clip: 'tech_derived'
    })
};

/**
 * Registro de golpes por personaje. `base` es el set comun; cada personaje
 * registra encima su set propio y el que share keys con el base lo SUSTITUYE
 * (override) o lo usa si no existe (add).
 *
 *   registerMoves('SAN_PABLO', {
 *     ATAQUE_ESPECIAL: { ...def, label: 'Embestida' }   // override
 *     EMBESTIDA: defineMove('EMBESTIDA', { ... })       // add
 *   });
 */
const characterMoves = new Map();

function registerMoves(characterId, moves) {
    const set = characterMoves.get(characterId) || Object.create(null);
    for (const key of Object.keys(moves)) {
        set[key] = moves[key].duration
            ? moves[key]
            : defineMove(key, moves[key]);
    }
    characterMoves.set(characterId, Object.freeze(set));
    return set;
}

function getMoves(characterId) {
    return Object.freeze({
        ...CORE_MOVES,
        ...(characterMoves.get(characterId) || {})
    });
}

function getMove(characterId, key) {
    const set = characterMoves.get(characterId);
    return (set && set[key]) || CORE_MOVES[key] || null;
}

export {
    CORE_MOVES,
    defineMove,
    registerMoves,
    getMoves,
    getMove
};

export default {
    CORE_MOVES,
    defineMove,
    registerMoves,
    getMoves,
    getMove
};