/**
 * ============================================================================
 * SANPABLERA ENGINE · ui/selectState.js
 * ----------------------------------------------------------------------------
 * EL ESTADO DE LA SELECCION, SIN DOM Y SIN BABYLON.
 *
 * POR QUE ESTA SEPARADO DE LA PANTALLA
 * ----------------------------------------------------------------------------
 *   La pantalla de seleccion (SelectScreen.js) tiene el panal, los botones, el
 *   3D y el DOM: cosas que no se pueden probar en Node. Aqui esta TODA la
 *   logica que si se puede: que boton hace que, como se navega por el panal, que
 *   atuendo lleva cada peleador y que animacion se esta viendo.
 *
 *   La pantalla llama a `apply('attack1')` y redibuja con lo que devuelve. Si
 *   la logica esta aqui, se puede testear entera (ver tests/select.smoke.mjs)
 *   sin abrir un navegador, y el dia que se rompa un boton se sabe al momento.
 *
 * LOS CUATRO BOTONES, Y QUE HACEN
 * ----------------------------------------------------------------------------
 *   attack1 (J, ligero)  : CONFIRMAR. El peleador enfocado lo elige el jugador
 *                          que esta mirando (P1 o P2). Si ya estaba elegido,
 *                          no hace nada: deseleccionar es cosa de ACCION.
 *   attack2 (K, pesado)  : VESTUARIO. Cambia la ropa del peleador enfocado. Es
 *                          un CICLO, no un cursor: siempre avanza uno y vuelve
 *                          al principio, asi que el boton no tiene estado.
 *   block    (L, guardia): ANIMACION. Cambia que animacion se esta viendo en la
 *                          vista previa del peleador enfocado.
 *   action   (U, accion) : DESELECCIONAR / VOLVER. Si el peleador enfocado ya
 *                          estaba elegido, lo suelta; si no, le devuelve el
 *                          control a quien no haya elegido todavia.
 *   cruceta               : NAVEGAR por el panal. Mover el foco entre celdas
 *                          vecinas (y cambiar de lado cuando toca).
 *
 * POR QUE ACCION DESELECCIONA Y NO "CONFIRMA"
 * ----------------------------------------------------------------------------
 *   Es lo que pidio el juego: ataque elige, accion suelta. Con eso se puede
 *   cambiar de opinion sin volver atras, que es lo que pasa en un menu de
 *   peleas de verdad: marcas a alguien, te arrepientes y lo marcas a otro.
 *
 * LADO IZQUIERDO / DERECHO
 * ----------------------------------------------------------------------------
 *   P2 esta a la IZQUIERDA y P1 a la DERECHA (lo contrario de un Versus de
 *   arcade clasico, pero es como lo pidio el juego: el jugador 1, que es el
 *   que esta al mando, se queda del lado de la derecha). El estado no depende
 *   del lado: solo guarda `quienMira` (0 = P1, 1 = P2).
 * ============================================================================
 */

import { nextOutfit, defaultFor, outfitById, outfitsFor } from './wardrobe.js';
import { ANIMATIONS, defaultAnimationFor, animationsOf } from './selectAnims.js';

/** Cuantos peleadores caben por fila en el panal. */
export const COLS = 3;

/** Los lados: P2 a la izquierda, P1 a la derecha. */
export const SIDE = Object.freeze({
    P1: { slot: 0, label: 'P1', lado: 'derecha' },
    P2: { slot: 1, label: 'P2', lado: 'izquierda' }
});

/** Las acciones que la pantalla puede aplicar. */
export const ACTION = Object.freeze({
    CONFIRMAR: 'attack1',        // elige al peleador enfocado
    VESTUARIO: 'attack2',        // cambia de ropa
    ANIMACION: 'block',          // cambia la animacion de la vista previa
    DESELECCIONAR: 'action',     // suelta la seleccion
    ARRIBA: 'up',
    ABAJO: 'down',
    IZQUIERDA: 'left',
    DERECHA: 'right'
});

/**
 * Crea el estado de la seleccion.
 *
 * @param {Array} roster  peleadores (normalmente fullRoster())
 * @returns {object} el estado
 */
export function createSelectState(roster) {
    const lista = Array.isArray(roster) ? roster.slice() : [];
    if (!lista.length) throw new Error('selectState: hace falta un roster');

    // Un fighterslot por lado, con su atuendo y su animacion.
    const slots = [SIDE.P1, SIDE.P2].map((s) => ({
        slot: s.slot,
        label: s.label,
        lado: s.lado,
        fighter: null,      // el peleador elegido, o null
        outfit: null,       // id del atuendo que lleva
        anim: null          // id de la animacion que se esta viendo
    }));

    return {
        roster: lista,
        slots,
        focus: 0,           // indice enfocado en el panal
        quienMira: 0,       // 0 = P1 eligiendo, 1 = P2 eligiendo
        // Las dos flechas de la cruceta se remembers por lado, para que al ir
        // de P1 a P2 el panal este donde ese jugador lo dejo.
        focusPorLado: [0, 0],
        // Si los dos estan listos, aparece el boton de pelea.
        confirmado: false
    };
}

/** El peleador enfocado ahora mismo. */
export function focused(state) {
    return state.roster[state.focus] || null;
}

/** El slot del jugador que esta eligiendo. */
export function slotActual(state) {
    return state.slots[state.quienMira];
}

/** El peleador enfocado lleva puesto el atuendo que toca? */
export function outfitOf(state, slot) {
    const s = state.slots[slot];
    if (!s) return null;
    const id = s.fighter ? s.outfit : defaultFor(s.fighter ? s.fighter.id : 'BASE');
    return outfitById(id) || null;
}

/** La animacion que se esta viendo del peleador enfocado. */
export function animOf(state, slot) {
    const s = state.slots[slot];
    if (!s) return null;
    const id = s.anim || defaultAnimationFor(focusedId(state));
    return ANIMATIONS[id] || ANIMATIONS[Object.keys(ANIMATIONS)[0]];
}

/** El id del peleador enfocado (o null). */
export function focusedId(state) {
    const f = focused(state);
    return f ? f.id : null;
}

// ===========================================================================
// NAVEGACION
// ===========================================================================

/**
 * Mueve el foco por la cruceta, como en el resto de menus.
 *
 * @param {object} state
 * @param {string} dir  up | down | left | right
 * @returns {object} el estado (se muta en sitio y se devuelve)
 */
export function move(state, dir) {
    const n = state.roster.length;
    // Con un solo peleador (o ninguno) no hay a donde ir: se sale antes de
    // calcular la fila, porque `Math.min(COLS - 1, col + 1)` con COLS = 3
    // llevaria el foco a la celda 1, que no existe. Ahi `focused()` daria
    // null y el boton de ATAQUE se comeria la pulsacion sin hacer nada.
    if (n <= 1) return state;

    const filas = Math.ceil(n / COLS);
    const f = state.focus;
    const fila = Math.floor(f / COLS);
    const col = f % COLS;
    let nf = fila, nc = col;

    if (dir === ACTION.ARRIBA) nf = Math.max(0, fila - 1);
    else if (dir === ACTION.ABAJO) nf = Math.min(filas - 1, fila + 1);
    else if (dir === ACTION.IZQUIERDA) nc = Math.max(0, col - 1);
    else if (dir === ACTION.DERECHA) nc = Math.min(COLS - 1, col + 1);

    // La celda de destino tiene que existir de verdad. En la ultima fila puede
    // que haya menos de COLS (con 8 peleadores y COLS = 3 son 3+3+2), asi que
    // el tope de `nc` no basta: hay que comprobar contra el tamano real.
    let destino = nf * COLS + nc;
    if (destino >= n) {
        if (dir === ACTION.DERECHA) nc = Math.max(0, nc - 1);
        else if (dir === ACTION.ABAJO) nf = Math.max(0, nf - 1);
        else return state;
        destino = nf * COLS + nc;
    }

    state.focus = destino;
    state.focusPorLado[state.quienMira] = state.focus;
    return state;
}

/**
 * Cambia de lado (P1 <-> P2) sin tocar el foco de la otra pantalla.
 *
 * POR QUE NO ES UN BOTON DE LA CRUCETA
 *   Las cuatro flechas navegan por el panal. Passar de P1 a P2 es otra cosa: es
 *   cambiar de jugador, y por eso va con ACCION cuando ya estan los dos
 *   elegidos (ver `apply`), o con la tecla L si esta libre.
 */
export function swapSide(state) {
    state.quienMira = state.quienMira ? 0 : 1;
    state.focus = state.focusPorLado[state.quienMira];
    return state;
}

// ===========================================================================
// LOS CUATRO BOTONES
// ===========================================================================

/**
 * Aplica un boton y devuelve lo que hay que redibujar.
 *
 * @param {object} state
 * @param {string} action  una de ACTION
 * @returns {{cambio:string, side:object|null, focus:object|null}}
 *   `cambio` es que ha pasado (util para el sonido / la animacion), `side` el
 *   slot que se ha tocado (para repintar la ficha) y `focus` el peleador
 *   enfocado (para la vista previa 3D).
 */
export function apply(state, action) {
    const foco = focused(state);

    switch (action) {
        case ACTION.CONFIRMAR:
            return confirmar(state, foco);

        case ACTION.VESTUARIO:
            return cambiarVestuario(state, foco);

        case ACTION.ANIMACION:
            return cambiarAnimacion(state, foco);

        case ACTION.DESELECCIONAR:
            return deseleccionar(state);

        case ACTION.ARRIBA:
        case ACTION.ABAJO:
        case ACTION.IZQUIERDA:
        case ACTION.DERECHA:
            move(state, action);
            return { cambio: 'navegar', side: slotActual(state), focus: focused(state) };

        default:
            return { cambio: 'nada', side: null, focus: foco };
    }
}

/**
 * ATAQUE: elige al peleador enfocado para el jugador que esta mirando.
 *
 * Si ya estaba elegido, no hace nada (deseleccionar es de ACCION). Si el
 * jugador ya habia elegido antes y ahora elige a otro, el nuevo sustituye al
 * viejo: es lo mas comodo y lo que se espera.
 */
function confirmar(state, foco) {
    const slot = slotActual(state);
    if (!foco) return { cambio: 'nada', side: slot, focus: null };

    const yaEraEste = slot.fighter && slot.fighter.id === foco.id;
    if (yaEraEste) return { cambio: 'ya-estaba', side: slot, focus: foco };

    slot.fighter = foco;
    // El atuendo arranca en el suyo, y la animacion en la que le toca por
    // defecto: el jugador las cambia despues con K y con L.
    slot.outfit = defaultFor(foco.id).id;
    slot.anim = defaultAnimationFor(foco.id);

    // Al elegir uno, el foco salta al siguiente que NOsea ese, para que elegir
    // a los dos seguidos (P1 y luego P2) no requiera mover la cruceta.
    const siguiente = state.roster.findIndex((f, i) => i !== state.focus);
    if (state.quienMira === 0 && !state.slots[1].fighter && siguiente >= 0) {
        state.quienMira = 1;
        state.focusPorLado[1] = siguiente;
        state.focus = siguiente;
    }

    return { cambio: 'elegido', side: slot, focus: foco };
}

/**
 * PATADA: cambia el atuendo del peleador enfocado.
 *
 * Solo si ya esta elegido: si no lo esta, el boton no hace nada (no tiene
 * sentido vestir a alguien que todavia no has picked).
 */
function cambiarVestuario(state, foco) {
    const slot = slotActual(state);
    if (!slot.fighter || !foco || slot.fighter.id !== foco.id) {
        return { cambio: 'nada', side: slot, focus: foco };
    }
    slot.outfit = nextOutfit(slot.fighter.id, slot.outfit);
    return { cambio: 'vestuario', side: slot, focus: foco };
}

/**
 * GUARDIA: cambia la animacion que se ve en la vista previa.
 *
 * Tambien solo si el peleador ya esta elegido. El ciclo va sobre las
 * animaciones de ESE peleador, que no son las mismas para todos (el motor
 * recorre solo las que tiene).
 */
function cambiarAnimacion(state, foco) {
    const slot = slotActual(state);
    if (!slot.fighter || !foco || slot.fighter.id !== foco.id) {
        return { cambio: 'nada', side: slot, focus: foco };
    }
    const lista = animationsOf(slot.fighter.id);
    if (lista.length < 2) return { cambio: 'nada', side: slot, focus: foco };
    const i = lista.findIndex((id) => id === slot.anim);
    slot.anim = lista[(i + 1) % lista.length];
    return { cambio: 'animacion', side: slot, focus: foco };
}

/**
 * ACCION: suelta la seleccion del jugador que esta mirando.
 *
 * Si el peleador NO estaba elegido, esto pasa el turno al otro jugador (que es
 * lo que se necesita cuando uno ya ha elegido y el otro todavia no ha empezado):
 * si no, ACTION soltaba siempre y no se podria cambiar de jugador sin
 * deshacer lo ya elegido.
 */
function deseleccionar(state) {
    const slot = slotActual(state);
    if (slot.fighter) {
        slot.fighter = null;
        slot.outfit = null;
        slot.anim = null;
        return { cambio: 'deseleccionado', side: slot, focus: focused(state) };
    }
    // No habia nada elegido: le toca al otro.
    if (!state.slots[1].fighter || !state.slots[0].fighter) {
        state.quienMira = state.quienMira ? 0 : 1;
        state.focus = state.focusPorLado[state.quienMira];
        return { cambio: 'turno', side: slotActual(state), focus: focused(state) };
    }
    return { cambio: 'nada', side: slot, focus: focused(state) };
}

/** Los dos estan elegidos: se puede pelear. */
export function listo(state) {
    return !!(state.slots[0].fighter && state.slots[1].fighter);
}

/** El boton de pelea se puede pulsar? */
export function puedePelear(state) {
    return listo(state);
}

/** Resumen para la pantalla y para el HUD de depuracion. */
export function resumen(state) {
    return {
        focus: state.focus,
        quienMira: state.quienMira,
        p1: state.slots[0].fighter ? state.slots[0].fighter.name : null,
        p2: state.slots[1].fighter ? state.slots[1].fighter.name : null,
        listo: listo(state)
    };
}

export default {
    COLS, SIDE, ACTION,
    createSelectState, apply, move, swapSide,
    focused, slotActual, outfitOf, animOf, focusedId,
    listo, puedePelear, resumen
};
