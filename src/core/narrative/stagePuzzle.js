/**
 * ============================================================================
 * SANPABLERA ENGINE · core/narrative/stagePuzzle.js
 * ----------------------------------------------------------------------------
 * NARRATIVA DE ACCION EN PUZZLE: escenarios por regiones, interconectados.
 *
 * IDEA
 *   La isla no es una lista de escenarios: es un rompecabezas de locaciones.
 *   Cada nodo es un lugar de pelea/narrativa; cada conexion es una accion que
 *   puede trasladar el combate a otro lugar (caerse, saltar, romper, lanzar,
 *   etc.). El resultado es una pelea que viaja por Sanpablera.
 *
 * PRINCIPIOS
 *   - PURO: sin DOM, sin Babylon, sin reloj, sin red. Determinista por entrada.
 *   - DATOS PRIMERO: el motor de combate/engine decide cuando ocurre una accion;
 *     este modulo decide si esa accion abre una transicion y a donde lleva.
 *   - NARRATIVA + GAMEPLAY: cada transicion tiene consecuencia narrativa y
 *     efecto de combate (posicion, ventaja, daño de caída, etc.).
 * ============================================================================
 */

import { LUGARES, ZONAS, lugar } from '../geo/margarita.js';

export const ACTION_TRIGGER = Object.freeze({
    CAIDA: 'CAIDA',                 // caer por borde, baranda, risco
    SALTO: 'SALTO',                 // salto largo/salto a otra plataforma
    LANZAMIENTO: 'LANZAMIENTO',     // throw/proyección que saca al rival
    DERRIBO_FUERTE: 'DERRIBO_FUERTE', // slam/knockdown cerca de borde
    ROMPER_SUELO: 'ROMPER_SUELO',   // romper piso/techo débil
    ROMPER_PARED: 'ROMPER_PARED',   // atravesar pared/frágil
    AGARRE_PARED: 'AGARRE_PARED',   // escalar/agarrarse y subir
    EXPLOSION: 'EXPLOSION',         // evento de escenario
    VEHICULO: 'VEHICULO',           // salto a bote/camión/plataforma móvil
    SECRETO: 'SECRETO'              // ruta narrativa desbloqueada por estado
});

export const TRANSITION_KIND = Object.freeze({
    ONE_WAY: 'ONE_WAY',
    BIDIRECTIONAL: 'BIDIRECTIONAL',
    CONDITIONAL: 'CONDITIONAL'
});

export const REGION = Object.freeze({
    COSTA: Object.freeze({ id: 'COSTA', nombre: 'Costa y Pueblo', zona: 'COSTA', color: '#1f6fb2' }),
    SUR_SECO: Object.freeze({ id: 'SUR_SECO', nombre: 'Puerto y Sur Seco', zona: 'SUR_SECO', color: '#b8873a' }),
    MACIZO: Object.freeze({ id: 'MACIZO', nombre: 'Selva y Cañon', zona: 'MACIZO', color: '#2f5d3a' }),
    CERRO: Object.freeze({ id: 'CERRO', nombre: 'Cerro y Cratera', zona: 'CERRO', color: '#5a3a2a' })
});

function node(id, spec) {
    const loc = lugar(id);
    return Object.freeze({
        id,
        nombre: spec.nombre || (loc ? loc.nombre : id),
        region: spec.region,
        zona: spec.zona || (loc ? loc.zona : null),
        tipo: spec.tipo || 'pelea',
        descripcion: spec.descripcion || '',
        narrativa: spec.narrativa || '',
        tags: Object.freeze(spec.tags || []),
        anchors: Object.freeze(spec.anchors || []) // puntos de accion dentro del escenario
    });
}

function edge(spec) {
    return Object.freeze({
        id: spec.id,
        from: spec.from,
        to: spec.to,
        trigger: spec.trigger,
        kind: spec.kind || TRANSITION_KIND.ONE_WAY,
        action: spec.action,
        requirement: Object.freeze(spec.requirement || null),
        combat: Object.freeze({
            damage: spec.combat?.damage ?? 0,
            stamina: spec.combat?.stamina ?? 0,
            advantage: spec.combat?.advantage || 'neutral', // attacker|defender|neutral
            positionReset: spec.combat?.positionReset ?? true
        }),
        camera: spec.camera || 'CUT',
        narrativa: spec.narrativa || '',
        reversible: !!spec.reversible
    });
}

/** Nodos del puzzle: locaciones jugables/narrativas interconectadas. */
export const PUZZLE_NODES = Object.freeze([
    node('PLAYA_AGUA', {
        region: 'COSTA', tipo: 'pelea',
        descripcion: 'Playa abierta con muelle, botes y tarima de torneo.',
        narrativa: 'Inicio publico: la pelea puede salir del ring e ir al muelle.',
        tags: ['playa', 'muelle', 'publico'],
        anchors: ['BORDE_MUELLE', 'BOTE', 'TARIMA']
    }),
    node('EL_MORRO', {
        region: 'COSTA', tipo: 'pelea',
        descripcion: 'Promontorio rocoso con viento fuerte y caida al mar.',
        narrativa: 'Zona de riesgo: un error manda la pelea abajo.',
        tags: ['risco', 'viento', 'roca'],
        anchors: ['BORDE_RISCO', 'PLATAFORMA_BAJA']
    }),
    node('PUEBLO_PAN', {
        region: 'COSTA', tipo: 'narrativa',
        descripcion: 'Callejones, techos bajos y patios internos.',
        narrativa: 'Ruta urbana: saltos de techo y caídas a patio conectan calles.',
        tags: ['callejon', 'techo', 'patio'],
        anchors: ['TECHO', 'PATIO', 'CALLEJON']
    }),
    node('PUERTO_AZUL', {
        region: 'SUR_SECO', tipo: 'pelea',
        descripcion: 'Contenedores, gruas y pasarelas de puerto.',
        narrativa: 'Zona industrial: lanzamientos y rupturas cambian de nivel.',
        tags: ['contenedor', 'grua', 'pasarela'],
        anchors: ['PASARELA', 'CONTENEDOR', 'BORDE_CARGA']
    }),
    node('MIRADOR_SECO', {
        region: 'SUR_SECO', tipo: 'pelea',
        descripcion: 'Risco de tierra roja con camino angosto.',
        narrativa: 'Punto de cruce entre costa, puerto y macizo.',
        tags: ['risco', 'camino', 'calor'],
        anchors: ['BORDE_RISCO', 'CAMINO', 'PARED_ROCA']
    }),
    node('SELVA_BORDE', {
        region: 'MACIZO', tipo: 'pelea',
        descripcion: 'Borde de selva con raices, barro y ramas bajas.',
        narrativa: 'Emboscada: caidas y saltos abren rutas ocultas.',
        tags: ['selva', 'raices', 'barro'],
        anchors: ['RAMA', 'QUEBRADA', 'SUELO_HUMEDO']
    }),
    node('CANYON_SECO', {
        region: 'MACIZO', tipo: 'pelea',
        descripcion: 'Garganta estrecha con ecos y paredes quebradizas.',
        narrativa: 'Corredor peligroso: romper pared o caer cambia el frente.',
        tags: ['canon', 'eco', 'pared'],
        anchors: ['PARED_DEBIL', 'LEDGE', 'FONDO']
    }),
    node('VILLA_BASALTICA', {
        region: 'CERRO', tipo: 'narrativa',
        descripcion: 'Casas de roca negra, escaleras y terrazas calientes.',
        narrativa: 'Antesala del final: subir o caer define la ruta a la cratera.',
        tags: ['basalto', 'escalera', 'terraza'],
        anchors: ['TERRAZA', 'ESCALERA', 'GRIETA']
    }),
    node('CRATERA', {
        region: 'CERRO', tipo: 'boss',
        descripcion: 'Arena final sobre roca hueca y calor rojo.',
        narrativa: 'Climax: el suelo puede romperse y revelar el camino de afueras.',
        tags: ['cratera', 'final', 'calor'],
        anchors: ['BORDE', 'SUELO_HUECO', 'CENTRO']
    })
]);

/** Conexiones del puzzle (acciones que trasladan el combate). */
export const PUZZLE_EDGES = Object.freeze([
    edge({
        id: 'PLAYA_A_MORRO_SALTO', from: 'PLAYA_AGUA', to: 'EL_MORRO',
        trigger: ACTION_TRIGGER.SALTO, kind: TRANSITION_KIND.BIDIRECTIONAL, reversible: true,
        action: 'Saltar desde la tarima/muelle hacia las rocas del Morro.',
        combat: { damage: 0, stamina: 8, advantage: 'neutral', positionReset: true },
        camera: 'FOLLOW_JUMP',
        narrativa: 'El peleador toma impulso en la tarima y aterriza en las rocas del Morro.'
    }),
    edge({
        id: 'MORRO_A_PLAYA_CAIDA', from: 'EL_MORRO', to: 'PLAYA_AGUA',
        trigger: ACTION_TRIGGER.CAIDA, kind: TRANSITION_KIND.ONE_WAY,
        action: 'Caer por el borde del risco hacia la playa.',
        combat: { damage: 12, stamina: 0, advantage: 'attacker', positionReset: true },
        camera: 'CRASH_DOWN',
        narrativa: 'Un mal paso en el risco termina en la arena de la playa.'
    }),
    edge({
        id: 'PLAYA_A_PUEBLO_VEHICULO', from: 'PLAYA_AGUA', to: 'PUEBLO_PAN',
        trigger: ACTION_TRIGGER.VEHICULO, kind: TRANSITION_KIND.CONDITIONAL, reversible: true,
        action: 'Saltar a un bote/carro de pesca y llegar al pueblo.',
        requirement: { type: 'flag', key: 'bote_disponible', value: true },
        combat: { damage: 0, stamina: 4, advantage: 'neutral', positionReset: true },
        camera: 'PAN_TRAVEL',
        narrativa: 'La pelea se corta un instante y reaparece en los callejones del pueblo.'
    }),
    edge({
        id: 'PUEBLO_A_PUERTO_SALTO', from: 'PUEBLO_PAN', to: 'PUERTO_AZUL',
        trigger: ACTION_TRIGGER.SALTO, kind: TRANSITION_KIND.BIDIRECTIONAL, reversible: true,
        action: 'Saltar por techos y caer en la pasarela del puerto.',
        combat: { damage: 4, stamina: 6, advantage: 'neutral', positionReset: true },
        camera: 'ROOFTOP_FOLLOW',
        narrativa: 'De techo en techo, la pelea cae sobre el ruido metálico del puerto.'
    }),
    edge({
        id: 'PUEBLO_A_PUERTO_CAIDA', from: 'PUEBLO_PAN', to: 'PUERTO_AZUL',
        trigger: ACTION_TRIGGER.CAIDA, kind: TRANSITION_KIND.ONE_WAY,
        action: 'Caer desde un patio/techo al nivel inferior del puerto.',
        combat: { damage: 10, stamina: 0, advantage: 'attacker', positionReset: true },
        camera: 'CRASH_DOWN',
        narrativa: 'El suelo cede o el borde falla: la pelea cae al puerto.'
    }),
    edge({
        id: 'PUERTO_A_MIRADOR_LANZAMIENTO', from: 'PUERTO_AZUL', to: 'MIRADOR_SECO',
        trigger: ACTION_TRIGGER.LANZAMIENTO, kind: TRANSITION_KIND.ONE_WAY,
        action: 'Proyección fuerte que manda al rival fuera de la pasarela hacia el camino seco.',
        combat: { damage: 8, stamina: 0, advantage: 'attacker', positionReset: true },
        camera: 'THROW_FOLLOW',
        narrativa: 'Un lanzamiento brutal saca la pelea del puerto y la deja en el mirador seco.'
    }),
    edge({
        id: 'MIRADOR_A_SELVA_SALTO', from: 'MIRADOR_SECO', to: 'SELVA_BORDE',
        trigger: ACTION_TRIGGER.SALTO, kind: TRANSITION_KIND.BIDIRECTIONAL, reversible: true,
        action: 'Saltar el barranco corto hacia el borde de selva.',
        combat: { damage: 0, stamina: 10, advantage: 'neutral', positionReset: true },
        camera: 'FOLLOW_JUMP',
        narrativa: 'Un salto largo cruza el calor del mirador y entra en la humedad de la selva.'
    }),
    edge({
        id: 'MIRADOR_A_CANYON_CAIDA', from: 'MIRADOR_SECO', to: 'CANYON_SECO',
        trigger: ACTION_TRIGGER.CAIDA, kind: TRANSITION_KIND.ONE_WAY,
        action: 'Caer por el risco del mirador al cañon.',
        combat: { damage: 14, stamina: 0, advantage: 'attacker', positionReset: true },
        camera: 'CRASH_DOWN',
        narrativa: 'El mirador no perdona: la caída abre un frente nuevo en el cañon.'
    }),
    edge({
        id: 'SELVA_A_CANYON_DERRIBO', from: 'SELVA_BORDE', to: 'CANYON_SECO',
        trigger: ACTION_TRIGGER.DERRIBO_FUERTE, kind: TRANSITION_KIND.ONE_WAY,
        action: 'Derribo fuerte cerca de la quebrada.',
        combat: { damage: 10, stamina: 0, advantage: 'attacker', positionReset: true },
        camera: 'SLAM_FOLLOW',
        narrativa: 'La quebrada se traga la pelea y la escupe en el cañon.'
    }),
    edge({
        id: 'CANYON_A_VILLA_AGARRE', from: 'CANYON_SECO', to: 'VILLA_BASALTICA',
        trigger: ACTION_TRIGGER.AGARRE_PARED, kind: TRANSITION_KIND.BIDIRECTIONAL, reversible: true,
        action: 'Escalar la pared del cañon hacia la villa basáltica.',
        combat: { damage: 0, stamina: 12, advantage: 'neutral', positionReset: true },
        camera: 'CLIMB_UP',
        narrativa: 'Entre golpes y agarres, la pelea sube por la roca negra.'
    }),
    edge({
        id: 'CANYON_A_VILLA_ROMPER', from: 'CANYON_SECO', to: 'VILLA_BASALTICA',
        trigger: ACTION_TRIGGER.ROMPER_PARED, kind: TRANSITION_KIND.ONE_WAY,
        action: 'Romper una pared débil y descubrir un paso hacia la villa.',
        requirement: { type: 'stat', key: 'power', min: 70 },
        combat: { damage: 6, stamina: 6, advantage: 'attacker', positionReset: true },
        camera: 'BREAK_WALL',
        narrativa: 'La pared cede: detras habia un paso viejo hacia la villa.'
    }),
    edge({
        id: 'VILLA_A_CRATERA_SALTO', from: 'VILLA_BASALTICA', to: 'CRATERA',
        trigger: ACTION_TRIGGER.SALTO, kind: TRANSITION_KIND.BIDIRECTIONAL, reversible: true,
        action: 'Saltar la grieta final hacia la cratera.',
        combat: { damage: 0, stamina: 10, advantage: 'neutral', positionReset: true },
        camera: 'FOLLOW_JUMP',
        narrativa: 'La última grieta separa la villa del calor rojo de la cratera.'
    }),
    edge({
        id: 'CRATERA_A_VILLA_CAIDA', from: 'CRATERA', to: 'VILLA_BASALTICA',
        trigger: ACTION_TRIGGER.CAIDA, kind: TRANSITION_KIND.ONE_WAY,
        action: 'Caer por el borde exterior de la cratera.',
        combat: { damage: 16, stamina: 0, advantage: 'attacker', positionReset: true },
        camera: 'CRASH_DOWN',
        narrativa: 'Hasta la final tiene un borde: caer aqui devuelve la pelea a la villa.'
    }),
    edge({
        id: 'CRATERA_A_CANYON_ROMPER_SUELO', from: 'CRATERA', to: 'CANYON_SECO',
        trigger: ACTION_TRIGGER.ROMPER_SUELO, kind: TRANSITION_KIND.CONDITIONAL,
        action: 'Romper el suelo hueco de la cratera y caer al camino de afueras.',
        requirement: { type: 'flag', key: 'suelo_hueco_descubierto', value: true },
        combat: { damage: 18, stamina: 0, advantage: 'attacker', positionReset: true },
        camera: 'FLOOR_BREAK',
        narrativa: 'El suelo hueco revela el secreto de la cratera: debajo pasa el camino de afueras.'
    })
]);

export const STAGE_PUZZLE = Object.freeze({
    id: 'SANPABLERA_PUZZLE',
    nombre: 'Sanpablera: Rompecabezas de Acción',
    regiones: REGION,
    nodes: PUZZLE_NODES,
    edges: PUZZLE_EDGES
});

/** Indice rapido por id de nodo. */
export const NODE_BY_ID = Object.freeze(Object.fromEntries(PUZZLE_NODES.map((n) => [n.id, n])));

export function getNode(id) {
    return NODE_BY_ID[id] || null;
}

function asReverseEdge(e) {
    return Object.freeze({
        ...e,
        id: `${e.id}__REV`,
        from: e.to,
        to: e.from,
        action: e.reverseAction || `Volver: ${e.action}`,
        narrativa: e.reverseNarrativa || e.narrativa,
        // En reversa, la ventaja se invierte si era direccional.
        combat: Object.freeze({
            ...e.combat,
            advantage: e.combat.advantage === 'attacker' ? 'defender'
                : e.combat.advantage === 'defender' ? 'attacker'
                : 'neutral'
        }),
        _reversed: true,
        _sourceEdge: e.id
    });
}

/** Aristas que salen de nodeId, incluyendo reversas de BIDIRECTIONAL/reversible. */
export function edgesFrom(nodeId, opts = {}) {
    const includeReverse = opts.includeReverse !== false;
    const out = [];
    for (const e of PUZZLE_EDGES) {
        if (e.from === nodeId) out.push(e);
        else if (includeReverse && e.to === nodeId && (e.kind === TRANSITION_KIND.BIDIRECTIONAL || e.reversible)) {
            out.push(asReverseEdge(e));
        }
    }
    return out;
}

export function edgesTo(nodeId) {
    return PUZZLE_EDGES.filter((e) => e.to === nodeId);
}

function meetsRequirement(requirement, context = {}) {
    if (!requirement) return true;
    if (requirement.type === 'flag') {
        return !!(context.flags && context.flags[requirement.key] === requirement.value);
    }
    if (requirement.type === 'stat') {
        const value = context.stats ? context.stats[requirement.key] : undefined;
        if (typeof value !== 'number') return false;
        if (typeof requirement.min === 'number' && value < requirement.min) return false;
        if (typeof requirement.max === 'number' && value > requirement.max) return false;
        return true;
    }
    if (requirement.type === 'node') {
        return context.currentNode === requirement.value;
    }
    return false;
}

/**
 * Lista transiciones disponibles desde un nodo para un contexto dado.
 * Incluye reversas de aristas bidireccionales/reversibles.
 */
export function availableTransitions(nodeId, context = {}) {
    return edgesFrom(nodeId).filter((e) => meetsRequirement(e.requirement, context));
}

/**
 * Resuelve una accion en un nodo. Devuelve la transicion aplicable o null.
 * @param {string} nodeId
 * @param {string} trigger ACTION_TRIGGER
 * @param {object} [context] { flags, stats, currentNode }
 */
export function resolveTransition(nodeId, trigger, context = {}) {
    const candidates = edgesFrom(nodeId).filter((e) => e.trigger === trigger);
    for (const e of candidates) {
        if (meetsRequirement(e.requirement, context)) return e;
    }
    return null;
}

/**
 * Aplica una transicion a un estado de combate/narrativa simple.
 * No muta el estado de entrada; devuelve nuevo estado.
 */
export function applyTransition(state = {}, transition, event = {}) {
    if (!transition) return { ...state };
    const next = {
        ...state,
        currentNode: transition.to,
        previousNode: transition.from,
        lastTransition: transition.id,
        lastTrigger: transition.trigger,
        history: Array.isArray(state.history) ? [...state.history, {
            from: transition.from,
            to: transition.to,
            trigger: transition.trigger,
            transitionId: transition.id,
            at: event.at || null
        }] : [{
            from: transition.from,
            to: transition.to,
            trigger: transition.trigger,
            transitionId: transition.id,
            at: event.at || null
        }]
    };
    return next;
}

/**
 * Crea estado inicial de la narrativa de puzzle.
 */
export function createPuzzleState(opts = {}) {
    const start = opts.startNode || 'PLAYA_AGUA';
    if (!getNode(start)) throw new Error(`Nodo inicial desconocido: ${start}`);
    return {
        currentNode: start,
        previousNode: null,
        lastTransition: null,
        lastTrigger: null,
        flags: { ...(opts.flags || {}) },
        history: []
    };
}

/**
 * Lista rutas posibles desde un nodo (profundidad limitada).
 * Util para IA narrativa, debug o diseño.
 */
export function reachableFrom(nodeId, maxDepth = 2) {
    const out = [];
    const seen = new Set([nodeId]);
    function walk(current, depth, path) {
        if (depth >= maxDepth) return;
        for (const e of edgesFrom(current)) {
            const nextPath = [...path, e.id];
            out.push({ to: e.to, depth: depth + 1, path: nextPath, edge: e });
            if (!seen.has(e.to)) {
                seen.add(e.to);
                walk(e.to, depth + 1, nextPath);
                seen.delete(e.to);
            }
        }
    }
    walk(nodeId, 0, []);
    return out;
}

/**
 * Valida integridad basica del grafo.
 */
export function validatePuzzle(puzzle = STAGE_PUZZLE) {
    const issues = [];
    const nodeIds = new Set(puzzle.nodes.map((n) => n.id));
    for (const n of puzzle.nodes) {
        if (!n.region) issues.push(`${n.id}: sin region`);
        if (!n.zona) issues.push(`${n.id}: sin zona`);
    }
    for (const e of puzzle.edges) {
        if (!nodeIds.has(e.from)) issues.push(`${e.id}: from desconocido ${e.from}`);
        if (!nodeIds.has(e.to)) issues.push(`${e.id}: to desconocido ${e.to}`);
        if (!e.trigger) issues.push(`${e.id}: sin trigger`);
        if (!Object.values(ACTION_TRIGGER).includes(e.trigger)) issues.push(`${e.id}: trigger invalido ${e.trigger}`);
    }
    return issues;
}

export default STAGE_PUZZLE;
