/**
 * ============================================================================
 * SANPABLERA ENGINE · FSM · StateCatalog.js
 * ----------------------------------------------------------------------------
 * FUERA DE AQUI NO HAY LOGICA DE ESTADOS, solo el MOLDE de un estado.
 *
 * Cada estado se declara como dato (fase, grupos, frames de duracion, perfil
 * fisico, postura del rig, clips, hitstop...) y la FSM lo consume. La ventaja
 * practica: el catalogo completo se puede enumerar, validar y testear sin
 * arrancar Babylon; y anadir un estado nuevo es escribir un objeto, no tocar
 * un switch de 40 ramas.
 *
 * El perfil fisico de cada estado responde a 4 preguntas que TODO estado tiene
 * que contestar, y contestarlas de forma implicita es la fuente numero uno de
 * bugs en juegos de lucha:
 *   1. ¿Que volumen de colision tiene?           -> physics.hull
 *   2. ¿Conserva la inercia al entrar?            -> physics.velocityPolicy
 *   3. ¿Le afecta la gravedad y los golpes?       -> physics.flags / gravity
 *   4. ¿Puede el jugador actuar?                  -> control.canAct
 * ============================================================================
 */
import SPF from './Constants.js';

const { StateGroup, Phase, VelocityPolicy, HullKind, PhysicalFlag, FacingAxis, VisualFacing } = SPF;
const { State } = SPF;

/**
 * Perfil fisico por defecto: de pie, en el suelo, controlable.
 * Todos los estados parten de aqui y sobrescriben lo que necesiten.
 */
const DEFAULT_PHYSICS = Object.freeze({
    flags: SPF.toFlags([PhysicalFlag.PUSHABLE, PhysicalFlag.IMPULSE_SENSITIVE, PhysicalFlag.LOCK_ROTATION, PhysicalFlag.STAGE_CLAMP]),
    velocityPolicy: VelocityPolicy.PRESERVE,
    gravity: 1,             // 1 = gravedad normal, 0 = sin gravedad, 0.35 = caida lenta
    frictionXZ: 0,          // rozamiento por frame aplicado al entrar
    hull: Object.freeze({
        kind: HullKind.CAPSULE,
        radius: 0.42,
        height: 1.7,
        centerY: 0.85
    })
});

const DEFAULT_CONTROL = Object.freeze({
    canAct: true,       // puede iniciar acciones (no confundir con "puede ser hitteado")
    canTurn: true,      // puede girar hacia el rival
    buffersInput: true, // acepta el buffer de entrada
    invulnerable: false
});

const DEFAULT_POSTURE = Object.freeze({
    // Pose del rig procedural (entities/FighterRig.js). Los valores son
    // objetivos; el rig interpola hacia ellos.
    hipY: 0.92,     // altura de la cadera
    spinePitch: 0,  // inclinacion del torso (rad)
    headPitch: 0,
    limbs: 'STAND', // identificador de la pose: STAND, CROUCH, PRONE, SUPINE, KNEEL, QUAD, STAGGER, JUGGLE, FLOAT, BRACE
    lean: 0
});

/**
 * Normaliza una declaracion de estado. Todo lo opcional tiene default para que
 * un estado nuevo sea 5 lineas y no 40.
 */
export function defineState(def) {
    if (def.id == null) throw new Error('[FSM] Estado sin id: ' + JSON.stringify(def.name || def));
    if (registry.has(def.id)) throw new Error('[FSM] Estado duplicado: ' + SPF.stateName(def.id));

    const physics = Object.assign({}, DEFAULT_PHYSICS, def.physics || {});
    if (def.physics && def.physics.hull) {
        physics.hull = Object.freeze(Object.assign({}, DEFAULT_PHYSICS.hull, def.physics.hull));
    }
    if (def.physics && def.physics.flags != null) physics.flags = def.physics.flags;

    const state = {
        id: def.id,
        name: def.name || SPF.stateName(def.id),
        tag: def.tag || 'BASE',              // categoria legible para HUD/debug
        phase: def.phase || Phase.GROUND,
        groups: Object.freeze([...(def.groups || [])]),

        // Eje del cuerpo respecto al rival (0 = mirando de frente al rival).
        // Es lo que resuelve "de espaldas" / "de frente" / "a 45 grados".
        facingAxis: def.facingAxis != null ? def.facingAxis : FacingAxis.CABEZA_A_RIVAL,

        // null = permanece hasta que una transicion lo saque (los estados base
        // no tienen "final" porque el estado base ES el destino del retorno).
        durationFrames: def.durationFrames != null ? def.durationFrames : null,

        physics: Object.freeze(physics),
        control: Object.freeze(Object.assign({}, DEFAULT_CONTROL, def.control || {})),
        posture: Object.freeze(Object.assign({}, DEFAULT_POSTURE, def.posture || {})),

        // Animacion: `clip` mas `facingAware`. Si es facingAware, la clave final
        // se resuelve con SPF.animationKey(clip, visualFacing) y da el set
        // de frente o de espaldas segun mire la camara en ese frame.
        animation: Object.freeze({
            clip: def.clip || null,
            facingAware: def.facingAware !== false,
            loop: !!def.loop
        }),

        // Golpe: referencia al key de MoveTable. Solo lo llevan los ATAQUE_*.
        attack: def.attack || null,

        // Reaccion a impacto: hitstun, knockdown y orientacion de caida.
        hitReaction: Object.freeze(Object.assign({
            hitstun: 0,
            knockdown: 'NONE',
            orientation: null
        }, def.hitReaction || {})),

        // Suelo: como se entra en este estado tumbado y por donde se sale.
        down: Object.freeze(Object.assign({
            wakeup: null,
            orientation: null,
            axis: FacingAxis.PIES_A_RIVAL
        }, def.down || {})),

        // Agarre: papel (UKE/TORI), postura y las 4 acciones del agarre
        // (atacar / escapar / proyectar / sumision) con sus clips. Solo lo
        // tienen los estados de Phase.GRAPPLE; null en todos los demas.
        grapple: def.grapple ? Object.freeze(Object.assign({}, def.grapple)) : null,

        // Estado de impacto al que se cae este luchador al recibir un golpe fuerte.
        onHeavyHit: def.onHeavyHit != null ? def.onHeavyHit : null,

        notes: def.notes || ''
    };

    registry.set(state.id, state);
    return state;
}

const registry = new Map();

export function registerState(def) {
    return defineState(def);
}

export function registerStates(list) {
    return list.map(defineState);
}

export function getState(id) {
    return registry.get(id) || null;
}

export function hasState(id) {
    return registry.has(id);
}

export function allStates() {
    return Array.from(registry.values());
}

export function statesInGroup(group) {
    return allStates().filter((s) => s.groups.indexOf(group) !== -1);
}

/**
 * Valida el catalogo contra el enum de States. Sin esto, anadir un estado al
 * enum y olvidar el cataleto produce un estado fantasma: la FSM entra en el, no
 * tiene perfil fisico y se rompe en runtime con un null.
 */
export function validateCatalog() {
    const missing = [];
    const extra = [];
    for (const key of Object.keys(State)) {
        if (!registry.has(State[key])) missing.push(key);
    }
    for (const state of registry.values()) {
        if (Object.keys(State).find((k) => State[k] === state.id) === undefined) {
            extra.push(state.name + ' (' + state.id + ')');
        }
    }
    return { ok: missing.length === 0, missing, extra };
}

/**
 * Perfil de personaje: el catalogo base mas los estados propios de ese
 * peleador. Se calcula una vez por luchador y se pasa a la FSM, para que dos
 * peleadores puedan tener un mismo id de estado con significado distinto
 * (cada uno con sus animaciones y su hitbox) sin que se pisen.
 */
export function createProfile(characterId, extraStates = []) {
    const own = extraStates.map((def) => (hasState(def.id) ? getState(def.id) : defineState(def)));
    const byId = new Map(registry);
    for (const s of own) byId.set(s.id, s);
    return Object.freeze({
        characterId,
        get: (id) => byId.get(id) || null,
        has: (id) => byId.has(id),
        ids: Object.freeze(Array.from(byId.keys())),
        list: Object.freeze(Array.from(byId.values()))
    });
}

export default {
    defineState,
    registerState,
    registerStates,
    getState,
    hasState,
    allStates,
    statesInGroup,
    validateCatalog,
    createProfile
};