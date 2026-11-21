/**
 * ============================================================================
 * SANPABLERA ENGINE · core/modes/session.js
 * ----------------------------------------------------------------------------
 * LA PARTIDA: el pegamento entre el combate y los sistemas del PDF (§6-7).
 *
 * QUE HAY AQUI
 * ----------------------------------------------------------------------------
 *   Los modos CLASICO / DIORAMA / ROYALE / CAMPAÑA viven en una SESION que
 *   guarda: el monedero, los lugares ganados, el cuadro de Royale (si aplica)
 *   y la campana del Cuarteto (si aplica). El motor solo le dice "gano X".
 *
 * POR QUE ESTE MODULO EXISTE SEPARADO DE Engine.js
 * ----------------------------------------------------------------------------
 *   Engine.js es browser-only: no se puede testear en Node. Si la decision de
 *   cuanto Cobre se gana o cuando avanza un ciclo viviera ahi, no habria test
 *   que la sujetara. Aqui es datos puros con reloj inyectado, y el motor se
 *   limita a llamar `registrarVictoria()` cuando ve un KO.
 *
 * NO HAY RED. El monedero se guarda con el adapter inyectado (localStorage en
 * el navegador); Supabase y Google siguen siendo un pendiente documentado.
 * ============================================================================
 */

import { createWallet, credit, CURRENCY, touch } from '../economy/economy.js';
import {
    createRoyale, currentMatch, start as startRoyale, tick as tickRoyale,
    relay as relayRoyale, resolveMatch as resolveRoyale
} from './battleRoyale.js';
import {
    createCampaign, nextCycle, resumen as resumenCampana,
    serialize as serializeCampana, deserialize as deserializeCampana
} from '../narrative/cuarteto.js';

/** Los mismos ids que ui/ModeSelect.js, repetidos aqui para no importar DOM. */
export const MODO = Object.freeze({
    CLASICO: 'CLASICO',
    DIORAMA: 'DIORAMA',
    ROYALE: 'ROYALE',
    CAMPAÑA: 'CAMPAÑA'
});

/** Cobre por victoria. El Diamante NUNCA se toca desde el motor. */
export const RECOMPENSA = Object.freeze({
    CLASICO: 20,
    DIORAMA: 25,
    ROYALE: 30,
    CAMPAÑA: 15,
    CAMPEON: 100
});

export const FASE_SESION = Object.freeze({
    ACTIVA: 'ACTIVA',
    FINALIZADA: 'FINALIZADA'
});

function premioPor(modo) {
    return RECOMPENSA[modo] || RECOMPENSA.CLASICO;
}

/**
 * Crea la sesion. `jugadores` son los ids/nombres que ya eligio el jugador;
 * `semilla` fija el reparto de la campana y el botin del Royale.
 */
export function createSession(opts = {}) {
    const modo = Object.values(MODO).includes(opts.modo) ? opts.modo : MODO.CLASICO;
    const jugadores = Array.isArray(opts.jugadores) ? opts.jugadores.slice() : [];
    const ganados = {};
    if (opts.ganados && typeof opts.ganados === 'object') {
        for (const [k, v] of Object.entries(opts.ganados)) {
            const n = Number(v);
            if (Number.isFinite(n) && n > 0) ganados[k] = n;
        }
    }

    const session = {
        v: 1,
        modo,
        fase: FASE_SESION.ACTIVA,
        jugadores,
        ganados,
        wallet: opts.wallet || createWallet({ now: opts.now || 0, cobre: opts.cobre || 0 }),
        ronda: 0,
        historial: [],
        campeon: null,
        lugar: opts.lugar || null,
        royale: null,
        campana: null
    };

    if (modo === MODO.ROYALE) {
        session.royale = createRoyale({
            seed: opts.seed || 1,
            fighters: jugadores.length >= 2 ? jugadores : ['P1', 'P2']
        });
        startRoyale(session.royale, opts.now || 0);
    } else if (modo === MODO.CAMPAÑA) {
        // `deserialize` devuelve el estado COMPLETO (ciclo, bandos, misiones,
        // secretos...). `createCampaign({ desde })` solo rescata algunas claves
        // y deja el ciclo a 0, asi que no sirve para reanudar una partida.
        session.campana = opts.desde
            ? deserializeCampana(opts.desde)
            : createCampaign({ seed: opts.seed || 1 });
        // El primer reparto tatami/afueras ocurre ANTES de la primera pelea:
        // la historia no arranca vacia esperando a que alguien gane. Si venimos
        // de un guardado NO se avanza: ya trae el ultimo ciclo grabado.
        if (!opts.desde) nextCycle(session.campana, ganados);
    }
    return session;
}

/** El duelo que se esta peleando ahora, como `{ a, b }`. */
export function dueloActual(session) {
    if (session.royale) {
        const par = currentMatch(session.royale);
        if (par) return { a: par[0], b: par[1] };
    }
    const [a, b] = session.jugadores;
    return a || b ? { a: a || null, b: b || null } : null;
}

/** Avanza el reloj del Royale (cierra la ventana de relevo). */
export function tickSesion(session, ahora) {
    return session.royale ? tickRoyale(session.royale, ahora) : false;
}

/** Intenta un relevo. Devuelve el resultado del modulo puro (o `ok:false`). */
export function relevo(session, id, ahora = 0) {
    if (!session.royale) return { ok: false, motivo: 'este modo no tiene relevos' };
    return relayRoyale(session.royale, id, ahora);
}

/**
 * Anota una victoria. Es la UNICA puerta por la que entra Cobre al monedero
 * durante la partida, y la unica que mueve el cuadro y la campana.
 *
 * @returns {object|null} el evento escrito en el historial, o null si la
 *                        victoria no era valida (duelo terminado, id ajeno).
 */
export function registrarVictoria(session, ganadorId, perdedorId, ahora = 0, opts = {}) {
    if (!session || session.fase !== FASE_SESION.ACTIVA) return null;
    const duelo = dueloActual(session);
    if (!duelo || ![duelo.a, duelo.b].includes(ganadorId)) return null;
    if (perdedorId && perdedorId === ganadorId) return null;

    let premio = premioPor(session.modo);
    let campeon = null;

    if (session.royale) {
        const r = resolveRoyale(session.royale, ganadorId, ahora);
        if (!r.ok) return null;
        if (r.campeon) {
            campeon = r.campeon;
            premio += RECOMPENSA.CAMPEON;
            session.fase = FASE_SESION.FINALIZADA;
        }
    }

    if (session.campana) {
        const lugar = opts.lugar || session.lugar;
        if (lugar) session.ganados[lugar] = (session.ganados[lugar] || 0) + 1;
        nextCycle(session.campana, session.ganados);
    } else {
        // En CLASICO / DIORAMA / ROYALE no hay campana que lleve el contador,
        // pero el lugar elegido (ej. EL_MORRO en la maqueta) tambien cuenta.
        const lugar = opts.lugar || session.lugar;
        if (lugar) session.ganados[lugar] = (session.ganados[lugar] || 0) + 1;
    }

    credit(session.wallet, CURRENCY.COBRE, premio, 'victoria');
    if (typeof ahora === 'number' && ahora > 0) touch(session.wallet, ahora);
    if (campeon) session.campeon = campeon;
    session.ronda++;

    const evento = {
        tipo: 'VICTORIA',
        ganador: ganadorId,
        perdedor: perdedorId || null,
        premio,
        cobre: session.wallet.saldo.COBRE,
        ciclo: session.campana ? session.campana.ciclo : null,
        campeon,
        lugar: opts.lugar || session.lugar || null,
        t: ahora
    };
    session.historial.push(evento);
    return evento;
}

/**
 * Atajo para el bucle: recibe un mapa `{ id: vida }` y deduce quien cayo.
 * Devuelve lo mismo que `registrarVictoria`.
 */
export function registrarKO(session, vidas, ahora = 0, opts = {}) {
    const duelo = dueloActual(session);
    if (!duelo || !vidas) return null;
    const caidos = [duelo.a, duelo.b].filter((id) => id && Number(vidas[id]) <= 0);
    if (caidos.length !== 1) return null;   // 0 = sigue peleando; 2 = doble KO
    const perdedor = caidos[0];
    const ganador = duelo.a === perdedor ? duelo.b : duelo.a;
    return registrarVictoria(session, ganador, perdedor, ahora, opts);
}

/** Texto corto para la HUD: modo, ronda, Cobre y (si hay) ciclo. */
export function lineaHUD(session) {
    if (!session) return '';
    const partes = [session.modo, 'R' + (session.ronda + 1), session.wallet.saldo.COBRE + ' Cobre'];
    if (session.campana) partes.push('Ciclo ' + session.campana.ciclo);
    if (session.campeon) partes.push('Campeon: ' + session.campeon);
    return partes.join('  ·  ');
}

/** Texto de la campana para la UI (o cadena vacia si el modo no es narrativo). */
export function textoCampana(session) {
    return session && session.campana ? resumenCampana(session.campana) : '';
}

/** Guardado compacto de toda la sesion. */
export function serializeSession(session) {
    return JSON.stringify({
        v: 1,
        modo: session.modo,
        seed: session.campana ? session.campana.seed : (session.royale ? session.royale.seed : 1),
        fase: session.fase,
        jugadores: session.jugadores,
        ganados: session.ganados,
        wallet: session.wallet.saldo.COBRE,
        diamante: session.wallet.saldo.DIAMANTE,
        ronda: session.ronda,
        lugar: session.lugar,
        campeon: session.campeon,
        historial: session.historial.slice(-12),
        campana: session.campana ? serializeCampana(session.campana) : null
    });
}

/** Lee una sesion guardada. El Royale se reconstruye con los mismos jugadores. */
export function deserializeSession(texto) {
    const o = JSON.parse(texto);
    if (!o || o.v !== 1) throw new Error('[sesion] version desconocida');
    const s = createSession({
        modo: o.modo, jugadores: o.jugadores, cobre: o.wallet,
        seed: o.seed || 1, ganados: o.ganados, lugar: o.lugar,
        desde: o.campana || undefined
    });
    s.fase = o.fase === FASE_SESION.FINALIZADA ? FASE_SESION.FINALIZADA : FASE_SESION.ACTIVA;
    s.ronda = Number(o.ronda) || 0;
    s.campeon = o.campeon || null;
    s.historial = Array.isArray(o.historial) ? o.historial : [];
    // El Diamante NO se fabrica: solo se conserva si ya venia declarado.
    if (Number.isFinite(o.diamante) && o.diamante > 0) s.wallet.saldo.DIAMANTE = o.diamante;
    return s;
}

export default {
    MODO, RECOMPENSA, FASE_SESION, createSession, dueloActual, tickSesion,
    relevo, registrarVictoria, registrarKO, lineaHUD, textoCampana,
    serializeSession, deserializeSession
};
