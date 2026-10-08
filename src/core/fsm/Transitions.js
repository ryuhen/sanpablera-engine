/**
 * ============================================================================
 * SANPABLERA ENGINE · FSM · Transitions.js
 * ----------------------------------------------------------------------------
 * TABLA DE TRANSICIONES. Toda la logica de "de aqui se puede ir a alla" vive
 * aqui como DATOS, no como ifs dentro del update.
 *
 * Por que tabla y no if:
 *   1. Depurar un juego de pelea es responder "¿por que el luchador no entro en
 *      ese estado?". Con tabla, Transitions.explain() responde en una linea.
 *   2. Anadir un estado propio de personaje son 3 lineas mas aqui, sin tocar
 *      la maquina.
 *   3. La tabla se puede testear: se recorre entera y se comprueba que todo
 *      destino existe en el catalogo.
 *
 * Cada regla:
 *   from    : id de estado | grupo | '*' (cualquiera)
 *   source  : de donde viene el evento (INPUT, TIMER, HIT, CONTACT, CANCEL, SYSTEM)
 *   event   : el evento concreto (un Intent, 'TIMEOUT', 'HIT', 'LANDED', ...)
 *   guard   : (ctx) => boolean. Recibe el contexto de la transicion y decide.
 *   to      : id de destino | (ctx) => id
 *   priority: mayor gana. El orden por defecto es la de abajo.
 * ============================================================================
 */
import SPF from './Constants.js';
import { hasMove } from './MoveTable.js';
import { MOVE_STATE_IDS } from './states/Movesets.js';

const {
    State, StateGroup, Phase, Intent, TransitionSource, GrappleRole,
    GrappleStance, GrappleAction, HitLevel, CancelTier, CANCEL_TIER_ORDER,
    FacingAxis, DownOrientation, CONFIG
} = SPF;

/**
 * Helper de regla. Guarda `debug` para que explain() pueda decir por que una
 * regla no se cumplio, que es el 90% de la depuracion de una FSM.
 */
function rule(def) {
    return Object.freeze({
        from: def.from != null ? def.from : '*',
        source: def.source,
        event: def.event,
        guard: def.guard || (() => true),
        to: def.to,
        priority: def.priority != null ? def.priority : 0,
        debug: def.debug || ''
    });
}

/** Un estado concreto cumple el `from` de la regla. */
function matches(state, from) {
    if (from === '*') return true;
    if (typeof from === 'number') return state.id === from;
    if (typeof from === 'string') return state.groups.indexOf(from) !== -1;
    // Lista de estados y/o grupos: "este golpe aplica desde cualquiera de
    // estos". Es lo que evita 4 reglas identicas por un mismo comportamiento.
    if (Array.isArray(from)) {
        for (const entry of from) {
            if (matches(state, entry)) return true;
        }
        return false;
    }
    return false;
}

/** ¿El golpe sale con el luchador por los aires (ya volando o lanzado)? */
function airborne(ctx) {
    return ctx.api.phase() === Phase.AIR || !!(ctx.hit && ctx.hit.launchY > 0);
}

/** El frame data dice que este golpe derriba. */
function knockdownForced(hit) {
    const h = hit || {};
    if (h.knockdown === 'ALWAYS') return true;
    if (h.knockdown === 'LIGHT') return h.hitLevel === HitLevel.FUERTE;
    return h.hitLevel === HitLevel.BAJO;
}

/** Golpe que NO derriba: 'NONE' (y lo que venga vacio) cuenta como no derribo. */
function noKnockdown(hit) {
    const k = hit && hit.knockdown;
    return k == null || k === 'NONE';
}

/** Estados "de pie": todo lo que puede actuar sin estar agarrado. */
const FREE = [StateGroup.GROUNDED, StateGroup.GROUNDED_LOCOMOTION];

const RULES = [
    // =========================================================================
    // SYSTEM · la maxima prioridad: si hay round start o KO, nada mas importa
    // =========================================================================
    rule({
        from: '*', source: TransitionSource.SYSTEM, event: 'ROUND_START',
        to: State.NORMAL_A, priority: 100, debug: 'round start -> idle'
    }),
    rule({
        from: '*', source: TransitionSource.SYSTEM, event: 'MATCH_END',
        to: State.NORMAL_A, priority: 99, debug: 'fin de combate -> idle'
    }),
    rule({
        from: '*', source: TransitionSource.SYSTEM, event: 'RESET',
        to: State.NORMAL_A, priority: 99, debug: 'reset -> idle'
    }),

    // =========================================================================
    // HIT · recibir un golpe. La regla mas importante del juego.
    // -------------------------------------------------------------------------
    // El destino NO es siempre el mismo: depende del nivel de impacto, de si
    // estaba en el aire y de si ya estaba en el suelo. Todo eso son guards.
    // =========================================================================
    rule({
        from: '*', source: TransitionSource.HIT, event: 'HIT', priority: 90,
        // Ya estaba en el suelo -> el golpe lo deja en el suelo (no se levanta
        // solo): esto es lo que permite el "ground and pound".
        guard: (ctx) => ctx.state.phase === Phase.DOWNED,
        to: (ctx) => {
            // En el suelo el UKE flippea entre boca arriba y boca abajo segun
            // de donde venga el golpe: por eso el estado de suelo se elige,
            // no se hereda.
            const low = ctx.hit.hitLevel === HitLevel.BAJO;
            return low ? State.SUELO_TUMBADO_BOCA_ABAJO : State.SUELO_TUMBADO_BOCA_ARRIBA;
        },
        debug: 'golpe en el suelo -> se queda en el suelo'
    }),
    rule({
        from: '*', source: TransitionSource.HIT, event: 'HIT', priority: 88,
        // En el aire (o lanzado) y sin margen de juggle -> no hay air recovery:
        // cae derecho al suelo.
        guard: (ctx) => airborne(ctx) && ctx.api.juggleCount() >= CONFIG.JUGGLE_MAX,
        to: State.SIN_AIRE,
        debug: 'juggle max -> SIN_AIRE (sin air recovery)'
    }),
    rule({
        from: '*', source: TransitionSource.HIT, event: 'HIT', priority: 86,
        // En el aire o lanzado -> JUGGLER (tumble). El air recovery se pide
        // despues con Intent.SALTAR si queda margen.
        guard: (ctx) => airborne(ctx),
        to: State.JUGGLER,
        debug: 'golpe en el aire -> JUGGLER'
    }),
    rule({
        from: '*', source: TransitionSource.HIT, event: 'HIT', priority: 84,
        // Golpe bajo (barrido) -> derribo de cara (pecho tierra). Un barrido no
        // deja al rival de espaldas aunque el golpe sea de frente.
        guard: (ctx) => ctx.hit.hitLevel === HitLevel.BAJO && knockdownForced(ctx.hit),
        to: (ctx) => ctx.api.knockdownState(),
        debug: 'golpe bajo -> pecho tierra'
    }),
    rule({
        from: '*', source: TransitionSource.HIT, event: 'HIT', priority: 82,
        // El frame data impone el derribo (knockdown ALWAYS). El estado de suelo
        // lo decide la orientacion del golpe, no esta regla.
        guard: (ctx) => ctx.hit.knockdown === 'ALWAYS',
        to: (ctx) => ctx.api.knockdownState(),
        debug: 'knockdown obligatorio -> suelo segun orientacion'
    }),
    rule({
        from: '*', source: TransitionSource.HIT, event: 'HIT', priority: 81,
        // Golpe medio que no derriba -> hitstun corto y sigue de pie
        guard: (ctx) => ctx.hit.hitLevel === HitLevel.MEDIO && noKnockdown(ctx.hit),
        to: State.TROPEZON,
        debug: 'golpe medio -> tropezon (sin KD)'
    }),
    rule({
        from: '*', source: TransitionSource.HIT, event: 'HIT', priority: 78,
        // Ultimo recurso: hitstun generico
        to: State.GOLPEADO,
        debug: 'golpe -> hitstun'
    }),
    rule({
        // Mareado: cuando el hitstun acumulado pasa el umbral. El estado lo
        // pide el sistema de combate (ctx.hit.dizzy), no la FSM.
        from: '*', source: TransitionSource.HIT, event: 'HIT', priority: 79,
        guard: (ctx) => !!ctx.hit.dizzy,
        to: State.MAREADO,
        debug: 'acumulado -> mareado'
    }),
    rule({
        // Romper un combo desde el hitstun: el UKE gasta recurso.
        from: [StateGroup.IMPACT, StateGroup.STUNNED],
        source: TransitionSource.INPUT, event: Intent.GUARDIA, priority: 86,
        guard: (ctx) => ctx.api.canPay(50) && ctx.api.framesInState() > 4,
        to: State.COMBO_BREAKER,
        debug: 'combo breaker (paga 50 de recurso)'
    }),

    // =========================================================================
    // CANCEL · Any-Point Cancel y ventanas tecnicas
    // =========================================================================
    rule({
        from: StateGroup.ATTACKING, source: TransitionSource.CANCEL,
        event: 'APC', priority: 70,
        guard: (ctx) => ctx.api.canCancelInto(ctx.requestedTier || ctx.tier),
        to: State.ANY_POINT_CANCEL,
        debug: 'APC -> estado puente'
    }),
    rule({
        from: State.ANY_POINT_CANCEL, source: TransitionSource.TIMER,
        event: 'TIMEOUT', priority: 70,
        to: (ctx) => ctx.api.apcTarget(),
        debug: 'el puente APC entrega el destino'
    }),
    rule({
        from: StateGroup.ATTACKING, source: TransitionSource.CANCEL,
        event: 'TECH', priority: 71,
        guard: (ctx) => ctx.api.framesIntoMove() >= CONFIG.TECH_WINDOW_FRAMES,
        to: State.POSTURA_DERIVADA_TECNICA,
        debug: 'ventana tecnica abierta -> POSTURA_DERIVADA_TECNICA'
    }),

    // =========================================================================
    // INPUT · guardia, agacharse, andar
    // =========================================================================
    rule({
        from: FREE, source: TransitionSource.INPUT, event: Intent.GUARDIA, priority: 60,
        // Agachado + guardia = guardia baja. De pie = guardia alta.
        guard: (ctx) => ctx.input.down,
        to: State.AGACHADO_GUARDIA_BAJA,
        debug: 'abajo + guardia -> guardia baja'
    }),
    rule({
        from: FREE, source: TransitionSource.INPUT, event: Intent.GUARDIA, priority: 60,
        to: State.AGACHADO_GUARDIA_ALTA,
        debug: 'guardia de pie -> guardia alta'
    }),
    rule({
        from: FREE, source: TransitionSource.INPUT, event: Intent.AGACHARSE, priority: 55,
        guard: (ctx) => ctx.input.down,
        to: State.CUADRUPEDA,
        debug: 'abajo + adelante -> cuadrupeda'
    }),
    rule({
        from: FREE, source: TransitionSource.INPUT, event: Intent.AGACHARSE, priority: 50,
        to: State.AGACHADO,
        debug: 'abajo -> agachado'
    }),
    rule({
        from: FREE, source: TransitionSource.INPUT, event: Intent.DASH, priority: 48,
        guard: (ctx) => ctx.input.forward,
        to: State.SPRINT_FRONTAL,
        debug: 'sprint frontal'
    }),
    rule({
        from: FREE, source: TransitionSource.INPUT, event: Intent.DASH, priority: 48,
        to: State.SPRINT_ATRAS,
        debug: 'sprint atras'
    }),
    rule({
        from: FREE, source: TransitionSource.INPUT, event: Intent.SALTAR, priority: 45,
        guard: (ctx) => ctx.input.up,
        to: State.SALTO_NORMAL_A,
        debug: 'arriba -> salto (set A, frente a camara)'
    }),
    rule({
        from: FREE, source: TransitionSource.INPUT, event: Intent.SALTAR, priority: 44,
        to: State.SALTO_NORMAL_B,
        debug: 'salto (set B, de espaldas)'
    }),
    rule({
        from: FREE, source: TransitionSource.INPUT, event: Intent.ACROBACIA, priority: 43,
        to: State.RODANDO,
        debug: 'acroacia -> rodando'
    }),

    // =========================================================================
    // INPUT · ataques
    // =========================================================================
    rule({
        from: State.POSTURA_DERIVADA_TECNICA, source: TransitionSource.INPUT,
        event: Intent.ATAQUE_ESPECIAL, priority: 75,
        guard: (ctx) => ctx.affordable('ATAQUE_ESPECIAL'),
        to: State.ATAQUE_ESPECIAL,
        debug: 'derivada tecnica'
    }),
    rule({
        from: FREE, source: TransitionSource.INPUT, event: Intent.ATAQUE_ESPECIAL, priority: 65,
        // El presupuesto se mira por la clave del golpe que se va a hacer, NO
        // por ctx.move: ctx.move es el golpe EN CURSO y desde suelo es null, asi
        // que preguntar por el coste ahi reventaba (y resolve() se traga la
        // excepcion, con lo que el especial nunca salia).
        guard: (ctx) => ctx.affordable('ATAQUE_ESPECIAL'),
        to: State.ATAQUE_ESPECIAL,
        debug: 'especial (paga recurso)'
    }),
    rule({
        from: [StateGroup.GROUNDED_LOCOMOTION], source: TransitionSource.INPUT,
        event: Intent.ATAQUE_PESADO, priority: 64,
        guard: (ctx) => ctx.input.down,
        to: State.ATAQUE_PESADO,      // el golpe de pie es el barrido (BAJO)
        debug: 'abajo + pesado -> barrido'
    }),
    rule({
        from: [StateGroup.GROUNDED_LOCOMOTION], source: TransitionSource.INPUT,
        event: Intent.ATAQUE_PESADO, priority: 63,
        to: State.ATAQUE_PESADO,
        debug: 'pesado'
    }),
    rule({
        from: FREE, source: TransitionSource.INPUT, event: Intent.ATAQUE_LIGERO, priority: 62,
        guard: (ctx) => ctx.input.down,
        to: State.ATAQUE_LIGERO,      // variant agachada del mismo estado
        debug: 'abajo + ligero -> golpe bajo'
    }),
    rule({
        from: FREE, source: TransitionSource.INPUT, event: Intent.ATAQUE_LIGERO, priority: 61,
        to: State.ATAQUE_LIGERO,
        debug: 'ligero'
    }),
    rule({
        from: StateGroup.AIRBORNE, source: TransitionSource.INPUT,
        event: Intent.ATAQUE_LIGERO, priority: 66,
        guard: (ctx) => ctx.state.id === State.JUGGLER && ctx.api.canBreakCombo(),
        to: State.ATAQUE_AEREO,
        debug: 'golpe aereo en juggle (solo si rompe combo)'
    }),
    rule({
        from: [State.AIRE_LIBRE, State.CAIDA_LENTA, State.SALTO_NORMAL_A, State.SALTO_NORMAL_B],
        source: TransitionSource.INPUT, event: Intent.ATAQUE_LIGERO, priority: 64,
        to: State.ATAQUE_AEREO,
        debug: 'golpe aereo'
    }),
    rule({
        from: [State.JUGGLER, State.SIN_AIRE, State.AIRE_LIBRE, State.CAIDA_LENTA],
        source: TransitionSource.INPUT, event: Intent.SALTAR, priority: 62,
        // Air recovery: solo si el juggle no ha pasado el limite. Si no, el
        // UKE se queda sin salida aerea (y por eso el combo se acaba).
        guard: (ctx) => ctx.api.canAirRecover(),
        to: State.SALTO_AEREO_RECUPERACION,
        debug: 'air recovery (queda margen de juggle)'
    }),
    rule({
        from: State.SALTO_AEREO_RECUPERACION, source: TransitionSource.TIMER,
        event: 'TIMEOUT', priority: 40,
        to: State.CAIDA_LENTA,
        debug: 'air recovery -> caida lenta'
    }),

    // =========================================================================
    // MOVISETS · los golpes propios de cada peleador
    // -------------------------------------------------------------------------
    // El vocabulario de intents es el MISMO para todos (ligero,
    // pesado, tecnica...). Lo que cambia es el CONTENIDO: estas
    // reglas llevan a los estados propios SOLO cuando el MOVISET
    // del peleador define el golpe (hasMove). Si no lo define, la
    // regla no compite y gana el golpe base. Asi cada moveset
    // amplia el vocabulario sin tocar la maquina ni romper al
    // resto de peleadores.
    //
    // Los golpes y sus estados viven en states/Movesets.js: el
    // moveset de Pedro Perez es el ejemplo escrito capa por capa
    // (boxeo -> patadas -> suelo -> botella).
    // =========================================================================
    rule({
        from: FREE, source: TransitionSource.INPUT, event: Intent.ATAQUE_LIGERO,
        priority: 63,
        // Adelante + ligero: el gancho (entra hacia el rival).
        guard: (ctx) => !!ctx.input.forward && !ctx.input.down
            && hasMove(ctx.fsm.api.characterId, 'GANCHO'),
        to: () => MOVE_STATE_IDS.SP_GANCHO,
        debug: 'adelante + ligero -> gancho (moveset)'
    }),
    rule({
        from: FREE, source: TransitionSource.INPUT, event: Intent.ATAQUE_LIGERO,
        priority: 63,
        // Atras + ligero: el codazo (castiga al que retrocede).
        guard: (ctx) => !!ctx.input.back && !ctx.input.down
            && hasMove(ctx.fsm.api.characterId, 'GOLPE_CODO'),
        to: () => MOVE_STATE_IDS.SP_CODAZO,
        debug: 'atras + ligero -> codazo (moveset)'
    }),
    rule({
        from: [StateGroup.GROUNDED_LOCOMOTION], source: TransitionSource.INPUT,
        event: Intent.ATAQUE_PESADO, priority: 65,
        // Adelante + pesado: la patada frontal (larga, mantiene la distancia).
        guard: (ctx) => !!ctx.input.forward && !ctx.input.down
            && hasMove(ctx.fsm.api.characterId, 'PATADA_FRONTAL'),
        to: () => MOVE_STATE_IDS.SP_PATADA_FRONTAL,
        debug: 'adelante + pesado -> patada frontal (moveset)'
    }),
    rule({
        from: [StateGroup.GROUNDED_LOCOMOTION], source: TransitionSource.INPUT,
        event: Intent.ATAQUE_PESADO, priority: 65,
        // Abajo + pesado: el barrido propio (bajo, derriba).
        guard: (ctx) => !!ctx.input.down
            && hasMove(ctx.fsm.api.characterId, 'BARREDO'),
        to: () => MOVE_STATE_IDS.SP_BARREDO,
        debug: 'abajo + pesado -> barrido (moveset)'
    }),
    rule({
        from: State.CUADRUPEDA, source: TransitionSource.INPUT,
        event: Intent.ATAQUE_PESADO, priority: 66,
        // Cuadrupeda + pesado: la embestida (la carga: cierra
        // distancia de un golpe).
        guard: (ctx) => hasMove(ctx.fsm.api.characterId, 'EMBESTIDA'),
        to: () => MOVE_STATE_IDS.SP_EMBESTIDA,
        debug: 'cuadrupeda + pesado -> embestida (moveset)'
    }),
    rule({
        from: FREE, source: TransitionSource.INPUT, event: Intent.TECNICA,
        priority: 60,
        // Tecnica: el derribo (la puerta al suelo). Va POR DEBAJO
        // del agarre (68): si el peleador tiene agarre, el agarre
        // manda; si no, el derribo es SU tecnica.
        guard: (ctx) => hasMove(ctx.fsm.api.characterId, 'DERIBO'),
        to: () => MOVE_STATE_IDS.SP_DERIBO,
        debug: 'tecnica -> derribo (moveset)'
    }),

    // =========================================================================
    // AGARRE · entrada al agarre y momentos internos
    // =========================================================================
    rule({
        from: FREE, source: TransitionSource.INPUT, event: Intent.TECNICA, priority: 68,
        guard: (ctx) => ctx.api.canGrapple(),
        to: (ctx) => SPF.grappleState(ctx.grappleStance(), GrappleRole.UKE),
        debug: 'enganche: el que lo pide es el UKE'
    }),
    rule({
        from: [StateGroup.GRAPPLE], source: TransitionSource.INPUT,
        event: Intent.ATACAR, priority: 70,
        guard: (ctx) => ctx.role === GrappleRole.TORI && ctx.actionAvailable(GrappleAction.ATACAR),
        to: (ctx) => SPF.grappleState(GrappleStance.ATEMI, ctx.role),
        debug: 'atemi dentro del agarre'
    }),
    rule({
        from: [StateGroup.GRAPPLE], source: TransitionSource.INPUT,
        event: Intent.ATAQUE_PESADO, priority: 70,
        guard: (ctx) => ctx.role === GrappleRole.TORI && ctx.actionAvailable(GrappleAction.PROYECCION),
        to: (ctx) => SPF.grappleState(GrappleStance.PROYECCION, ctx.role),
        debug: 'proyeccion'
    }),
    rule({
        from: [StateGroup.GRAPPLE], source: TransitionSource.INPUT,
        event: Intent.ATAQUE_ESPECIAL, priority: 70,
        guard: (ctx) => ctx.role === GrappleRole.TORI && ctx.actionAvailable(GrappleAction.SUMISION),
        to: (ctx) => SPF.grappleState(GrappleStance.SUMISION, ctx.role),
        debug: 'sumision'
    }),
    rule({
        from: [StateGroup.GRAPPLE], source: TransitionSource.INPUT,
        event: Intent.GUARDIA, priority: 72,
        guard: (ctx) => ctx.role === GrappleRole.UKE && ctx.actionAvailable(GrappleAction.ESCAPE),
        to: (ctx) => SPF.grappleState(GrappleStance.ESCAPE, ctx.role),
        debug: 'el UKE intenta escapar'
    }),
    rule({
        from: [StateGroup.GRAPPLE], source: TransitionSource.TIMER, event: 'TIMEOUT',
        priority: 40,
        guard: (ctx) => ctx.api.grappleOver(),
        to: (ctx) => ctx.api.grappleExitState(),
        debug: 'el agarre se resuelve (escape / ukemi / fallo del tori)'
    }),

    // =========================================================================
    // CONTACT · suelo y paredes
    // =========================================================================
    rule({
        from: StateGroup.AIRBORNE, source: TransitionSource.CONTACT, event: 'LANDED',
        priority: 50,
        guard: (ctx) => ctx.api.isDownAttack(),
        to: State.SUELO_TUMBADO_BOCA_ABAJO,
        debug: 'aterrizaje de ataque (ruin): se cae de cara'
    }),
    rule({
        from: StateGroup.AIRBORNE, source: TransitionSource.CONTACT, event: 'LANDED',
        priority: 49,
        to: State.AGACHADO,
        debug: 'aterrizaje -> agachado (pose de amortiguacion)'
    }),
    rule({
        from: StateGroup.DOWNED, source: TransitionSource.INPUT, event: Intent.LEVANTARSE,
        priority: 40,
        guard: (ctx) => ctx.api.wakeupReady(),
        to: (ctx) => ctx.state.down.wakeup,
        debug: 'levantarse (con invulnerabilidad)'
    }),
    rule({
        from: StateGroup.WAKEUP, source: TransitionSource.TIMER, event: 'TIMEOUT',
        priority: 40,
        to: State.NORMAL_A,
        debug: 'levantado -> idle'
    }),

    // =========================================================================
    // TIMER · salidas por duracion
    // =========================================================================
    rule({
        from: StateGroup.ATTACKING, source: TransitionSource.TIMER, event: 'TIMEOUT',
        priority: 30,
        to: (ctx) => ctx.api.returnState(),
        debug: 'fin de ataque -> vuelta a la base'
    }),
    rule({
        from: StateGroup.IMPACT, source: TransitionSource.TIMER, event: 'TIMEOUT',
        priority: 30,
        guard: (ctx) => ctx.api.knockdownOnEnd(),
        to: (ctx) => ctx.api.knockdownState(),
        debug: 'hitstun agotado -> knockdown'
    }),
    rule({
        from: StateGroup.IMPACT, source: TransitionSource.TIMER, event: 'TIMEOUT',
        priority: 29,
        to: State.NORMAL_A,
        debug: 'hitstun agotado -> idle'
    }),
    rule({
        from: StateGroup.GROUNDED_LOCOMOTION, source: TransitionSource.TIMER, event: 'TIMEOUT',
        priority: 28,
        to: State.NORMAL_A,
        debug: 'movilidad agotada -> idle'
    }),
    rule({
        from: State.GOLPEADO, source: TransitionSource.TIMER, event: 'TIMEOUT',
        priority: 27,
        to: State.DE_RODILLAS,
        debug: 'hitstun largo -> de rodillas'
    })
];

/**
 * Resuelve una transicion.
 *
 * @param {object} state  Estado actual (del catalogo)
 * @param {string} event  Evento (Intent, 'HIT', 'TIMEOUT', ...)
 * @param {string} source TransitionSource
 * @param {object} ctx    Contexto para los guards
 * @returns {{rule: object, to: number}|null}
 */
export function resolve(state, event, source, ctx) {
    let best = null;
    for (let i = 0; i < RULES.length; i++) {
        const r = RULES[i];
        if (r.event !== event || r.source !== source) continue;
        if (!matches(state, r.from)) continue;

        let ok = false;
        try {
            ok = r.guard(ctx);
        } catch (err) {
            ok = false;
        }
        if (!ok) continue;

        if (!best || r.priority > best.priority) best = r;
    }
    if (!best) return null;

    const to = typeof best.to === 'function' ? best.to(ctx) : best.to;
    return to == null ? null : { rule: best, to };
}

/**
 * Depuracion: devuelve TODAS las reglas candidatas para un evento, marcando
 * cuales se cumplieron y cuales no (y por que). Es la respuesta a
 * "¿por que no entro en ese estado?".
 */
export function explain(state, event, source, ctx) {
    const out = [];
    for (let i = 0; i < RULES.length; i++) {
        const r = RULES[i];
        if (r.event !== event || r.source !== source) continue;
        const fromOk = matches(state, r.from);
        let guardOk = null;
        if (fromOk) {
            try {
                guardOk = r.guard(ctx);
            } catch (err) {
                guardOk = false;
            }
        }
        out.push({
            from: r.from, priority: r.priority, debug: r.debug,
            fromOk, guardOk,
            to: typeof r.to === 'function' ? '(fn)' : SPF.stateName(r.to)
        });
    }
    return out.sort((a, b) => b.priority - a.priority);
}

/** Todas las reglas (para tests y para el panel de depuracion del HUD). */
export function allRules() {
    return RULES;
}

/**
 * Comprobacion de integridad: todo destino tiene que existir en el catalogo.
 * Un destino mal escrito es un null en runtime (el luchador se queda en el
 * estado anterior sin avisar), que es el peor tipo de bug posible.
 */
export function validateTargets(profile) {
    const missing = [];
    const groups = Object.keys(StateGroup).map((k) => StateGroup[k]);

    const checkFrom = (from, rule) => {
        if (from === '*' || from == null) return;
        if (Array.isArray(from)) {
            for (const entry of from) checkFrom(entry, rule);
            return;
        }
        if (typeof from === 'number') {
            if (!profile.has(from)) missing.push({ rule: rule.debug, missing: SPF.stateName(from) });
        } else if (typeof from === 'string' && groups.indexOf(from) === -1) {
            missing.push({ rule: rule.debug, missing: 'grupo ' + from });
        }
    };

    for (const r of RULES) {
        checkFrom(r.from, r);
        if (typeof r.to === 'number' && !profile.has(r.to)) {
            missing.push({ rule: r.debug, missing: SPF.stateName(r.to) });
        }
    }
    return { ok: missing.length === 0, missing };
}

export default { resolve, explain, allRules, validateTargets };