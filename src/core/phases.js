/**
 * ============================================================================
 * SANPABLERA ENGINE · core/phases.js
 * ----------------------------------------------------------------------------
 * ESCALADA DE COMBATE POR FASES (roadmap de campaña).
 * Las REGLAS del combate cambian segun la fase activa;
 * el motor las lee COMO DATOS para que programar la
 * evolucion sea editar esta tabla, no la maquina:
 * añadir una fase (o cambiar una regla de la 1 a la 4)
 * no toca el codigo de combate.
 *
 *   FASE 1 · SPORT     Combate Deportivo (reglamentado):
 *                        arbitro, ventana de 1 s en el
 *                        suelo, jueces y tarjetas.
 *   FASE 2 · STREET    Combate de Barrio (callejero):
 *                        KO estricto, sin arbitro, suelo
 *                        y Ground & Pound sin limites.
 *   FASE 3 · TACTICAL  Combate Tactico Urbano: entorno y
 *                        armas ocultas/portatiles.
 *   FASE 4 · OUTLAW    Duelos Ilegales (el clímax):
 *                        armas de pleno uso + desarme y
 *                        apropiacion del arma del rival.
 *
 * PURO: solo datos y consultas. Las reglas AUN no se
 * aplican en el runtime (es el roadmap hecho modulo);
 * quien las consuma (el engine, la IA, el modo campaña)
 * pregunta a estas funciones.
 * ============================================================================
 */

/** Las cuatro fases de la campaña. */
export const PHASE = Object.freeze({
    SPORT: 'SPORT',
    STREET: 'STREET',
    TACTICAL: 'TACTICAL',
    OUTLAW: 'OUTLAW'
});

/** Orden de la campaña: la escalada de reglas. */
export const PHASE_ORDER = Object.freeze([
    PHASE.SPORT,
    PHASE.STREET,
    PHASE.TACTICAL,
    PHASE.OUTLAW
]);

/**
 * Ventana de remate en el suelo de la FASE 1 (frames
 * a 60 Hz): cae un peleador y hay UN SEGUNDO para
 * rematar o transicionar a suelo; pasado ese tiempo el
 * arbitro detiene el combate y lo reinicia a distancia
 * de golpe.
 */
export const REFEREE_STOP_FRAMES = 60;

/** Zonas del cuerpo (para jueces y penalizaciones). */
export const ZONES = Object.freeze({
    FACE: 'FACE',                 // cara
    TORSO: 'TORSO',               // torso
    BACK: 'BACK',                 // espalda (ilegal en Fase 1)
    LEGS: 'LEGS',                 // piernas  (ilegal en Fase 1)
    GROIN: 'GROIN',               // ingles   (siempre ilegal)
    NECK: 'NECK',                 // cuello   (siempre ilegal)
    EYES: 'EYES'                  // ojos     (siempre ilegal)
});

/** Armas portatiles/ocultas de las fases 3 y 4. */
export const WEAPONS = Object.freeze({
    KNIFE: 'KNIFE',               // cuchillo
    BOTTLE: 'BOTTLE',             // botella rota
    STICK: 'STICK',               // palo
    CHAIN: 'CHAIN',               // cadena
    BELT: 'BELT',                 // correa
    CLOTHING: 'CLOTHING'          // prenda (la misma ropa)
});

const RULES = Object.freeze({

    // --- FASE 1 · COMBATE DEPORTIVO (REGLAMENTADO) -------------------
    [PHASE.SPORT]: Object.freeze({
        label: 'Combate Deportivo (reglamentado)',
        referee: true,
        groundWindow: REFEREE_STOP_FRAMES,   // 1 s para rematar
        groundAndPound: false,               // el arbitro lo para
        timeLimit: true,
        weapons: Object.freeze([]),
        disarm: false,
        // Los jueces premian...
        score: Object.freeze({
            clean: true,                     // golpes limpios (cara/torso)
            counter: true,                   // contraataques
            projection: true                 // proyecciones
        }),
        // ...y penalizan con tarjetas los golpes prohibidos
        // (espalda, piernas, piquetes de ojos, ingles, cuello,
        // bloqueos inquebrantables ilegales).
        legalTargets: Object.freeze([ZONES.FACE, ZONES.TORSO]),
        illegalTargets: Object.freeze([
            ZONES.BACK, ZONES.LEGS, ZONES.GROIN, ZONES.NECK, ZONES.EYES
        ]),
        cards: true
    }),

    // --- FASE 2 · COMBATE DE BARRIO (CALLEJERO) ----------------------
    [PHASE.STREET]: Object.freeze({
        label: 'Combate de Barrio (callejero)',
        referee: false,                      // desaparece el arbitro
        groundWindow: null,                  // sin limite de tiempo
        groundAndPound: true,                // G&P sin restricciones
        timeLimit: false,                    // estrictamente a KO
        weapons: Object.freeze([]),
        disarm: false,
        score: null,                         // solo importa el KO
        legalTargets: Object.freeze([ZONES.FACE, ZONES.TORSO, ZONES.BACK, ZONES.LEGS]),
        illegalTargets: Object.freeze([]),
        cards: false
    }),

    // --- FASE 3 · COMBATE TACTICO URBANO -----------------------------
    [PHASE.TACTICAL]: Object.freeze({
        label: 'Combate Táctico Urbano',
        referee: false,
        groundWindow: null,
        groundAndPound: true,
        timeLimit: false,
        // Elementos del entorno y armas ocultas/portatiles.
        weapons: Object.freeze([
            WEAPONS.KNIFE, WEAPONS.BOTTLE, WEAPONS.STICK,
            WEAPONS.CHAIN, WEAPONS.BELT, WEAPONS.CLOTHING
        ]),
        disarm: false,
        score: null,
        legalTargets: Object.freeze([ZONES.FACE, ZONES.TORSO, ZONES.BACK, ZONES.LEGS]),
        illegalTargets: Object.freeze([]),
        cards: false
    }),

    // --- FASE 4 · DUELOS ILEGALES (EL CLIMAX) ------------------------
    [PHASE.OUTLAW]: Object.freeze({
        label: 'Duelos Ilegales (el clímax)',
        referee: false,
        groundWindow: null,
        groundAndPound: true,
        timeLimit: false,
        weapons: 'ANY',                      // armas de pleno uso
        // Sistema tactico de desarme / apropiacion del arma
        // del rival en pleno cuerpo a cuerpo.
        disarm: true,
        score: null,
        legalTargets: Object.freeze([ZONES.FACE, ZONES.TORSO, ZONES.BACK, ZONES.LEGS]),
        illegalTargets: Object.freeze([]),
        cards: false
    })
});

/** Reglas de una fase (por defecto: la calle, la base del juego). */
export function phaseRules(phase) {
    return RULES[phase] || RULES[PHASE.STREET];
}

/** ¿Es legal golpear la zona en esta fase? */
export function isLegalTarget(phase, zone) {
    return phaseRules(phase).legalTargets.indexOf(zone) !== -1;
}

/** ¿Hay armas disponibles en esta fase? ('ANY' = cualquiera). */
export function weaponAvailable(phase, weapon) {
    const w = phaseRules(phase).weapons;
    return w === 'ANY' || w.indexOf(weapon) !== -1;
}

/** ¿Hay arbitro en esta fase? */
export function hasReferee(phase) {
    return phaseRules(phase).referee;
}

/** ¿El suelo es libre (G&P sin limite) en esta fase? */
export function freeGround(phase) {
    const r = phaseRules(phase);
    return !r.referee && r.groundAndPound;
}

export default {
    PHASE, PHASE_ORDER, REFEREE_STOP_FRAMES, ZONES, WEAPONS,
    phaseRules, isLegalTarget, weaponAvailable, hasReferee, freeGround
};
