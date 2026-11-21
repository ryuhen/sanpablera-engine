/**
 * ============================================================================
 * SANPABLERA ENGINE · core/modes/battleRoyale.js
 * ----------------------------------------------------------------------------
 * BATTLE ROYALE URBANO LOCAL (Biblia Apex Primal, seccion 6).
 *
 * QUE HAY AQUI
 * ----------------------------------------------------------------------------
 *   - Hasta CUATRO jugadores locales repartidos en equipos de dos.
 *   - Duelos estrictos 1 vs 1 encadenados por un cuadro (bracket).
 *   - Relevos: el companero puede entrar en la zona de combate durante una
 *     ventana corta y tomar el hueco. Fuera de esa ventana no entra: es la
 *     regla que evita que el relevo sea un cambio gratis.
 *   - Botin: armas blancas, proteccion SEGMENTADA (casco, extremidades, copa),
 *     vehiculos de escape y comida potenciadora. Un objeto por slot, salvo
 *     la comida, que se apila.
 *
 * QUE NO HAY
 * ----------------------------------------------------------------------------
 *   No hay render, ni input, ni red. Este modulo solo decide QUIEN pelea,
 *   QUIEN sigue vivo y QUE lleva encima. El motor lo conecta a los peleadores
 *   reales; las reglas se testean aqui en Node.
 * ============================================================================
 */

export const MAX_PLAYERS = 4;
export const MAX_TEAM_SIZE = 2;
export const RELAY_WINDOW_MS = 3000;
export const MAX_RELAYS_PER_MATCH = 2;

/** Armas blancas. `height` usa los mismos nombres que MoveTable. */
export const WEAPONS = Object.freeze({
    NAVAJA: Object.freeze({ id: 'NAVAJA', nombre: 'Navaja', damage: 8, height: 'MEDIO' }),
    MACHETE: Object.freeze({ id: 'MACHETE', nombre: 'Machete', damage: 14, height: 'ALTO' }),
    BOTELLA: Object.freeze({ id: 'BOTELLA', nombre: 'Botella rota', damage: 11, height: 'ALTO' }),
    CADENA: Object.freeze({ id: 'CADENA', nombre: 'Cadena', damage: 16, height: 'BAJO' })
});

/** Los tres segmentos del PDF, como slots independientes. */
export const PROTECTION_SLOTS = Object.freeze(['CASCO', 'EXTREMIDADES', 'COPA']);

/** Cada slot tiene sus piezas y UNA reduccion. La pieza no es el objeto. */
export const PROTECTION = Object.freeze({
    CASCO: Object.freeze({ piezas: Object.freeze({ CASCO: 'Casco' }), reduce: 0.35 }),
    EXTREMIDADES: Object.freeze({ piezas: Object.freeze({ VENDAJES: 'Vendajes' }), reduce: 0.15 }),
    COPA: Object.freeze({ piezas: Object.freeze({ COPA: 'Copa' }), reduce: 0.20 })
});

export const VEHICLES = Object.freeze({
    MOTO: Object.freeze({ id: 'MOTO', nombre: 'Moto', speed: 9 }),
    BOTE: Object.freeze({ id: 'BOTE', nombre: 'Bote de escape', speed: 5 })
});

export const FOOD = Object.freeze({
    PLATANO: Object.freeze({ id: 'PLATANO', nombre: 'Plátano', stamina: 25, health: 0 }),
    CAFE: Object.freeze({ id: 'CAFE', nombre: 'Café', stamina: 40, health: 0 }),
    SOPA: Object.freeze({ id: 'SOPA', nombre: 'Sopa', stamina: 10, health: 20 })
});

export const PHASE = Object.freeze({
    LOBBY: 'LOBBY', FIGHT: 'FIGHT', FINISHED: 'FINISHED'
});

/** PRNG determinista: la misma semilla da el mismo botin en cada partida. */
function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

function pick(list, random) {
    return list[Math.floor(random() * list.length) % list.length];
}

/**
 * Crea la partida. `fighters` es una lista de objetos `{ id, name, team }`
 * (o de cadenas, en cuyo caso se numeran y se reparten en dos equipos).
 */
export function createRoyale(opts = {}) {
    const raw = opts.fighters || [];
    if (raw.length < 2 || raw.length > MAX_PLAYERS) {
        throw new Error('[royale] hacen falta entre 2 y ' + MAX_PLAYERS + ' jugadores');
    }
    const players = raw.map((f, i) => {
        const o = typeof f === 'string' ? { id: f, name: f } : f;
        const team = o.team === undefined ? (i % 2 === 0 ? 'A' : 'B') : o.team;
        return {
            id: o.id || 'p' + i,
            name: o.name || o.id || 'P' + i,
            team,
            alive: true,
            health: 100,
            stamina: 100,
            weapon: null,
            protection: { CASCO: null, EXTREMIDADES: null, COPA: null },
            vehicle: null,
            food: [],
            relays: 0
        };
    });

    const ids = players.map((p) => p.id);
    if (new Set(ids).size !== ids.length) throw new Error('[royale] ids repetidos');

    // Cuadro: semifinales cruzadas y final. Con 2 jugadores hay una final.
    let rounds;
    if (players.length === 2) {
        rounds = [[[ids[0], ids[1]]]];
    } else if (players.length === 3) {
        rounds = [[[ids[0], ids[1]]], [[ids[2], null]]];
    } else {
        // A contra B en las dos semifinales: los companeros quedan fuera del
        // duelo y pueden entrar como relevo, no peleando entre ellos.
        rounds = [[[ids[0], ids[1]], [ids[2], ids[3]]], [[null, null]]];
    }

    return {
        seed: opts.seed || 1,
        random: rng(opts.seed || 1),
        players,
        rounds,
        round: 0,
        match: 0,
        roundWinners: [],   // ganadores de la ronda, para armar la final
        phase: PHASE.LOBBY,
        active: null,
        relayOpenUntil: 0,
        relays: 0,
        champion: null,
        log: []
    };
}

/** Partida actual (o null si ya termino). */
export function currentMatch(state) {
    const r = state.rounds[state.round];
    return r ? r[state.match] || null : null;
}

function jugador(state, id) {
    return state.players.find((p) => p.id === id) || null;
}

/** Empieza la fase de pelea y abre la ventana de relevo del primer duelo. */
export function start(state, now = 0) {
    if (state.phase !== PHASE.LOBBY) return false;
    state.phase = PHASE.FIGHT;
    state.round = 0;
    state.match = 0;
    abrirDuelo(state, now);
    return true;
}

function abrirDuelo(state, now) {
    const par = currentMatch(state);
    if (!par) return;
    state.active = { a: par[0], b: par[1] };
    state.relayOpenUntil = now + RELAY_WINDOW_MS;
    state.relays = 0;
    state.log.push({ t: now, tipo: 'DUЕLO', a: par[0], b: par[1] });
}

/** Cierra la ventana de relevo cuando pasa el tiempo. */
export function tick(state, now) {
    if (state.phase !== PHASE.FIGHT) return false;
    if (state.relayOpenUntil && now > state.relayOpenUntil) {
        state.relayOpenUntil = 0;
        return true;
    }
    return false;
}

/**
 * Relevo tactico. El que entra tiene que ser companero del que esta peleando,
 * estar vivo, y llegar dentro de la ventana. Sale por `ok:false` con un
 * motivo concreto si no se cumple alguna regla.
 */
export function relay(state, incomingId, now = 0) {
    if (state.phase !== PHASE.FIGHT || !state.active) {
        return { ok: false, motivo: 'no hay combate' };
    }
    if (now > state.relayOpenUntil) return { ok: false, motivo: 'ventana cerrada' };
    if (state.relays >= MAX_RELAYS_PER_MATCH) return { ok: false, motivo: 'sin relevos' };

    const incoming = jugador(state, incomingId);
    if (!incoming || !incoming.alive) return { ok: false, motivo: 'companero no disponible' };

    const a = jugador(state, state.active.a);
    const b = jugador(state, state.active.b);
    const enA = !!a && !!a.team && a.team === incoming.team;
    const saliente = enA ? a : b;
    if (!saliente || saliente.team !== incoming.team) {
        return { ok: false, motivo: 'no es companero del que pelea' };
    }
    if (incoming.id === saliente.id) {
        return { ok: false, motivo: 'ya esta peleando' };
    }
    if (incoming.relays >= MAX_RELAYS_PER_MATCH) return { ok: false, motivo: 'agotado' };

    // El que entra ocupa el slot y el que sale queda en la banda (sigue vivo).
    if (enA) state.active.a = incoming.id;
    else state.active.b = incoming.id;
    incoming.relays++;
    saliente.relays++;
    state.relays++;
    state.relayOpenUntil = 0;   // un solo relevo por ventana
    state.log.push({ t: now, tipo: 'RELEVO', entra: incoming.id, sale: saliente.id });
    return { ok: true, entra: incoming.id, sale: saliente.id, enA };
}

/**
 * Resuelve el duelo actual. El perdedor queda eliminado; el ganador pasa a la
 * siguiente ronda. Cuando no queda ronda, se proclama campeon.
 */
export function resolveMatch(state, winnerId, now = 0) {
    if (state.phase !== PHASE.FIGHT || !state.active) {
        return { ok: false, motivo: 'no hay combate' };
    }
    const par = currentMatch(state);
    const loserId = [state.active.a, state.active.b].find((id) => id && id !== winnerId);
    const winner = jugador(state, winnerId);
    if (!par || !winner || !par.includes(winnerId) || !loserId) {
        return { ok: false, motivo: 'ganador no valido' };
    }
    const loser = jugador(state, loserId);
    loser.alive = false;
    loser.health = 0;
    state.log.push({ t: now, tipo: 'KO', gana: winnerId, pierde: loserId });

    const rounds = state.rounds;
    rounds[state.round][state.match] = [winnerId, winnerId];
    // Se guarda aunque quede otra semifinal: sin esto el primer ganador se
    // pierde al pasar al siguiente duelo y la final sale con un hueco.
    state.roundWinners.push(winnerId);

    // Buscar el siguiente duelo de esta ronda.
    let siguiente = null;
    for (let i = state.match + 1; i < rounds[state.round].length; i++) {
        const p = rounds[state.round][i];
        if (p[0] || p[1]) { siguiente = i; break; }
    }
    if (siguiente !== null) {
        state.match = siguiente;
        abrirDuelo(state, now);
        return { ok: true, siguiente: currentMatch(state) };
    }

    if (state.round + 1 >= rounds.length) {
        state.champion = winnerId;
        state.phase = PHASE.FINISHED;
        state.active = null;
        state.relayOpenUntil = 0;
        state.log.push({ t: now, tipo: 'CAMPEON', id: winnerId });
        return { ok: true, campeon: winnerId };
    }

    // Se rellena la final con los ganadores EN ORDEN. Si hay un jugador con
    // bye (3 jugadores), ya ocupa un hueco y los ganadores llenan el otro.
    const final = rounds[state.round + 1][0];
    for (const id of state.roundWinners) {
        if (final[0] === null) final[0] = id;
        else if (final[1] === null) final[1] = id;
    }
    state.roundWinners = [];
    state.round++;
    state.match = 0;
    abrirDuelo(state, now);
    return { ok: true, siguiente: currentMatch(state), final: true };
}

// ---------------------------------------------------------------------------
// BOTIN
// ---------------------------------------------------------------------------

/** Recoge un objeto concreto. Devuelve false si el slot esta ocupado. */
export function collect(state, playerId, item) {
    const p = jugador(state, playerId);
    if (!p || !p.alive) return false;
    if (WEAPONS[item]) { p.weapon = item; return true; }
    if (VEHICLES[item]) { p.vehicle = item; return true; }
    if (FOOD[item]) { p.food.push(item); return true; }
    for (const slot of PROTECTION_SLOTS) {
        if (PROTECTION[slot] && PROTECTION[slot].piezas[item]) {
            p.protection[slot] = item;
            return true;
        }
    }
    return false;
}

/** Abre un cofre con botin aleatorio determinista (la semilla manda). */
export function openCrate(state, playerId, nodeId = 0) {
    const random = rng((state.seed + nodeId * 7919 + state.log.length * 104729) >>> 0);
    const grupos = [Object.keys(WEAPONS), Object.keys(VEHICLES), Object.keys(FOOD), 'PROTECCION'];
    const grupo = pick(grupos, random);
    let item;
    if (grupo === 'PROTECCION') {
        const slot = pick(PROTECTION_SLOTS, random);
        item = pick(Object.keys(PROTECTION[slot].piezas), random);
    } else {
        item = pick(grupo, random);
    }
    return { item, guardado: collect(state, playerId, item) };
}

/** Consume comida: suma stamina y vida hasta sus topes. */
export function eat(state, playerId, item) {
    const p = jugador(state, playerId);
    if (!p || !FOOD[item]) return false;
    const i = p.food.indexOf(item);
    if (i < 0) return false;
    p.food.splice(i, 1);
    p.stamina = Math.min(100, p.stamina + FOOD[item].stamina);
    p.health = Math.min(100, p.health + FOOD[item].health);
    return true;
}

/** Reduccion total de danio segun las tres piezas equipadas. */
export function protectionOf(state, playerId) {
    const p = jugador(state, playerId);
    if (!p) return 0;
    return PROTECTION_SLOTS.reduce((acc, slot) => {
        const pieza = p.protection[slot];
        return acc + (pieza && PROTECTION[slot].piezas[pieza] ? PROTECTION[slot].reduce : 0);
    }, 0);
}

/** Aplica danio con la proteccion ya descontada (nunca cura). */
export function damage(state, playerId, amount) {
    const p = jugador(state, playerId);
    if (!p || amount <= 0) return 0;
    const real = Math.max(1, Math.round(amount * (1 - protectionOf(state, playerId))));
    p.health = Math.max(0, p.health - real);
    return real;
}

/** Texto corto para guardar/Comparar partidas. */
export function serialize(state) {
    return JSON.stringify({
        v: 1,
        seed: state.seed,
        players: state.players.map((p) => [p.id, p.name, p.team, p.alive ? 1 : 0, p.health]),
        rounds: state.rounds,
        round: state.round,
        match: state.match,
        phase: state.phase,
        champion: state.champion
    });
}

export default {
    MAX_PLAYERS, RELAY_WINDOW_MS, WEAPONS, PROTECTION, PROTECTION_SLOTS,
    VEHICLES, FOOD, PHASE, createRoyale, currentMatch, start, tick, relay,
    resolveMatch, collect, openCrate, eat, protectionOf, damage, serialize
};
