/**
 * ============================================================================
 * SANPABLERA ENGINE · core/ground/stance.js
 * ----------------------------------------------------------------------------
 * LA STANCE DE SUELO: lo que puede hacer el peleador que esta en el suelo.
 *
 * QUE ES Y QUE NO ES
 * ----------------------------------------------------------------------------
 *   `position.js` dice DONDE estan: quien esta arriba, quien abajo, cuanto de
 *   margen queda para salir. Este archivo dice QUE HACE EL CUERPO: si esta de
 *   espaldas o de pecho, si se esta levantando, si esta enroscado, si esta
 *   entrelazado con el rival.
 *
 *   Son dos cosas distintas y no se pueden fusionar. La posicion es del
 *   COMBATE (los dos la comparten). La stance es de cada LUCHADOR. Un peleador
 *   puede estar en la montaja (posicion) y aun asi estar boca abajo (stance).
 *
 * LAS CUATRO STANCES Y POR QUE NO SON MAS
 * ----------------------------------------------------------------------------
 *   BOCA_ARRIBA .... tumbado de espaldas. Es la peor postura y la que mas
 *                   opciones da: es la unica desde la que se puede hacer un
 *                   barrido, y tambien la unica donde el rival te ve la cara.
 *   BOCA_ABAJO .... la tortuga de verdad. Es la mas segura y la que menos te
 *                   deja hacer. Nadie elige quedarse aqui mucho rato, pero es
 *                   donde se aguanta un momento.
 *   AGACHADO ..... a cuatro patas o de rodillas. El punto medio: se puede
 *                   (_) llegar a los pies del rival y al propio.
 *   DE_PIE_BAJO . de pie pero en postura baja, saliendo de la levantada. Es el
 *                   estado en el que se puede atacar.
 *   ENTRELAZADO .. los dos cuerpos cogidos. No es una postura: es la situacion
 *                   en la que los dos comparten suelo y cualquier cosa que
 *                   hagan se mezcla con lo que hace el otro.
 *
 * EL ENLACE CON `position.js`, QUE ES LO QUE PIDE EL ENCARGADO
 * ----------------------------------------------------------------------------
 *   Cada accion de la stance tiene un verbo que la conecta con el modelo
 *   posicional:
 *
 *       LEVANTARSE ........ GEV.LEVANTAR    de pie otra vez
 *       REVERTER .......... GEV.REVERSAR    el de abajo pasa a estar arriba
 *       RODAR_OFENSIVO .... GEV.REVERSAR    la variante barata de invertir
 *       RODAR_DEFENSIVO ... GEV.GUARDAR     enroscarse a cubierto
 *       SEPARARSE ......... GEV.ESCAPAR     soltarse y salir
 *       CAMBIAR_AGARRE ... (ninguno)        no cambia de posicion, la cambia
 *                                            de FORMA
 *
 *   Y las acciones que no mueven la posicion pero si hacen dano (ATACAR_DESDE_
 *   SUELO, PRESION) van a `punish.js`, que es donde vive el castigo.
 *
 *   Es el sitio donde se decide si una cosa es posible, y se decide UNA vez:
 *   la stance mira la posicion, no la inventa.
 * ============================================================================
 */

import { POS, GEV, ROL, resolverSuelo, info, peligroDe, ventanaDe } from './position.js';
import { BOTON } from './punish.js';

/** Las posturas del cuerpo de quien esta en el suelo. */
export const STANCE = Object.freeze({
    BOCA_ARRIBA: 'BOCA_ARRIBA',
    BOCA_ABAJO: 'BOCA_ABAJO',
    AGACHADO: 'AGACHADO',
    DE_PIE_BAJO: 'DE_PIE_BAJO',
    ENTRELAZADO: 'ENTRELAZADO'
});

/** Lo que puede hacer un cuerpo en el suelo. */
export const ACCION = Object.freeze({
    LEVANTARSE: 'LEVANTARSE',               // ponerse de pie
    LEVANTARSE_ATACANDO: 'LEVANTARSE_ATACANDO', // atacar en la levantada
    ATACAR_DESDE_SUELO: 'ATACAR_DESDE_SUELO',   // golpear tumbado
    RODAR_DEFENSIVO: 'RODAR_DEFENSIVO',     // rodar para cubrirse
    RODAR_OFENSIVO: 'RODAR_OFENSIVO',       // rodar para invertir
    CAMBIAR_AGARRE: 'CAMBIAR_AGARRE',       // mover las manos de sitio
    SEPARARSE: 'SEPARARSE',                 // soltarse del rival
    REVERTER: 'REVERTER',                   // intentar la inversion
    PRESION: 'PRESION',                     // estrangulacion o palanca
    PROYECCION: 'PROYECCION'                // voltear al rival
});

export const ACCIONES = Object.freeze(Object.keys(ACCION));

/** Por que no se puede una accion. */
export const MOTIVO = Object.freeze({
    LEGAL: 'LEGAL',
    STANCE_INCORRECTA: 'STANCE_INCORRECTA', // este cuerpo no puede hacer eso
    SIN_ENERGIA: 'SIN_ENERGIA',             // no le llega
    SIN_OBJETIVO: 'SIN_OBJETIVO',           // no hay a quien aplicarlo
    YA_ESTA: 'YA_ESTA'                      // ya esta en esa postura
});

/**
 * QUE BOTON HACE CADA ACCION, POR DEFECTO.
 *
 * No es un mapa plano accion -> boton, y el motivo es que el mapeo depende de
 * la postura: el boton de ACCION es "presion" con los dos entrelazados y es
 * "rodar" tumbado de espaldas. Un mapa plano no puede decir las dos cosas, y
 * el jugador no podria aprenderlo.
 *
 * Las que NO estan aqui se piden con la DIRECCION (ver `DIRECCION_DE`).
 */
export const BOTON_DE = Object.freeze({
    [ACCION.ATACAR_DESDE_SUELO]: BOTON.LIGERO,
    [ACCION.LEVANTARSE_ATACANDO]: BOTON.PESADO,
    [ACCION.PRESION]: BOTON.ACCION,
    [ACCION.CAMBIAR_AGARRE]: BOTON.GUARDIA
});

/**
 * QUE DIRECCION PIDE CADA ACCION que no sale de un boton.
 *
 * En el suelo el mando va en la direccion: arriba se levanta, abajo se rueda,
 * atras se suelta y adelante se invierte. Es el mapeo clasico de los juegos de
 * pelea en el suelo y encaja con el InputRouter, que ya lee ocho direcciones.
 */
export const DIRECCION_DE = Object.freeze({
    [ACCION.LEVANTARSE]: 'ARRIBA',
    [ACCION.RODAR_DEFENSIVO]: 'ABAJO',
    [ACCION.SEPARARSE]: 'ATRAS',
    [ACCION.REVERTER]: 'ADELANTE'
});

/**
 * EL MAPEO EXPLICITO POR POSTURA. Este es el que manda, y por eso existe:
 * cuando dos acciones comparten boton, la tabla lo decide de una vez y no por
 * un criterio ("la mas barata") que cambiaria en cuanto se tocara un numero.
 *
 * Poner el crucifijo o el remate exige un boton, y ese boton es ACCION.
 */
export const MAPEO = Object.freeze({
    [STANCE.BOCA_ARRIBA]: Object.freeze({ [BOTON.LIGERO]: ACCION.ATACAR_DESDE_SUELO, [BOTON.PESADO]: ACCION.LEVANTARSE_ATACANDO, [BOTON.ACCION]: ACCION.RODAR_OFENSIVO, [BOTON.GUARDIA]: ACCION.RODAR_DEFENSIVO }),
    BOCA_ABAJO: Object.freeze({ [BOTON.PESADO]: ACCION.LEVANTARSE_ATACANDO, [BOTON.ACCION]: ACCION.RODAR_DEFENSIVO, [BOTON.GUARDIA]: ACCION.RODAR_DEFENSIVO }),
    [STANCE.AGACHADO]: Object.freeze({ [BOTON.LIGERO]: ACCION.ATACAR_DESDE_SUELO, [BOTON.PESADO]: ACCION.LEVANTARSE_ATACANDO, [BOTON.ACCION]: ACCION.RODAR_OFENSIVO, [BOTON.GUARDIA]: ACCION.RODAR_DEFENSIVO }),
    [STANCE.DE_PIE_BAJO]: Object.freeze({ [BOTON.LIGERO]: ACCION.ATACAR_DESDE_SUELO, [BOTON.PESADO]: ACCION.LEVANTARSE_ATACANDO, [BOTON.ACCION]: ACCION.RODAR_OFENSIVO, [BOTON.GUARDIA]: ACCION.CAMBIAR_AGARRE }),
    [STANCE.ENTRELAZADO]: Object.freeze({ [BOTON.LIGERO]: ACCION.ATACAR_DESDE_SUELO, [BOTON.PESADO]: ACCION.PROYECCION, [BOTON.ACCION]: ACCION.PRESION, [BOTON.GUARDIA]: ACCION.CAMBIAR_AGARRE })
});

/**
 * LA TABLA DE STANCES.
 *
 * Expone ...... desde que stances se puede hacer
 * coste ....... frames que dura
 * energia ..... lo que gasta
 * verbo ........ la clave de GEV que pide a `position.js` (o null si no pide)
 * enlace ....... si el verbo cambia el rol (es una inversion)
 * al ....... ... a que stance se acaba
 *
 * `verbo: null` significa que la accion NO cambia la relacion con el rival: es
 * un gesto de su propio cuerpo. Rodar defensivamente no te saca de la
 * montaja, y conviene que se note: hay que gastar la inversion de verdad.
 */
const T = Object.freeze({
    BOCA_ARRIBA: Object.freeze({
        nombre: 'Tumbado de espaldas',
        // De espaldas se ve la cara, se ve el pecho y no hay nada donde
        // agarrarse: es la postura mas expuesta y la que mas opciones da.
        expone: 3,           // 0..3, cuanto se ve el rival
        protege: 0,          // 0..3, cuanto protege de la lona
        acciones: [ACCION.LEVANTARSE, ACCION.LEVANTARSE_ATACANDO,
            ACCION.ATACAR_DESDE_SUELO, ACCION.RODAR_DEFENSIVO,
            ACCION.RODAR_OFENSIVO, ACCION.PRESION]
    }),
    BOCA_ABAJO: Object.freeze({
        nombre: 'Tumbado de pecho',
        // La tortuga: no se ve nada y la lona no hace dano, pero tampoco se
        // puede golpear ni uno mismo: hay que abrirse antes de hacer nada.
        expone: 0,
        protege: 3,
        acciones: [ACCION.LEVANTARSE, ACCION.LEVANTARSE_ATACANDO,
            ACCION.RODAR_DEFENSIVO, ACCION.RODAR_OFENSIVO, ACCION.SEPARARSE]
    }),
    AGACHADO: Object.freeze({
        nombre: 'A cuatro patas',
        expone: 1, protege: 2,
        acciones: [ACCION.LEVANTARSE, ACCION.LEVANTARSE_ATACANDO,
            ACCION.ATACAR_DESDE_SUELO, ACCION.RODAR_DEFENSIVO,
            ACCION.RODAR_OFENSIVO, ACCION.SEPARARSE]
    }),
    DE_PIE_BAJO: Object.freeze({
        nombre: 'De pie en postura baja',
        expone: 3, protege: 0,
        acciones: [ACCION.ATACAR_DESDE_SUELO, ACCION.LEVANTARSE_ATACANDO,
            ACCION.RODAR_OFENSIVO, ACCION.CAMBIAR_AGARRE, ACCION.SEPARARSE]
    }),
    ENTRELAZADO: Object.freeze({
        nombre: 'Entrelazados',
        // No es una postura: es que los dos cuerpos estan cogidos. Por eso
        // tiene acciones que las otras no: cambiar el agarre, la proyeccion,
        // la presion.
        expone: 2, protege: 1,
        acciones: [ACCION.CAMBIAR_AGARRE, ACCION.SEPARARSE, ACCION.RODAR_OFENSIVO,
            ACCION.REVERTER, ACCION.PRESION, ACCION.PROYECCION,
            ACCION.ATACAR_DESDE_SUELO]
    })
});

/** Todas las stances, en el orden en que se declararon. */
export const STANCES = Object.freeze(Object.keys(T));

/** Ficha de una stance. null si no existe. */
export function infoStance(stance) {
    return Object.prototype.hasOwnProperty.call(T, stance) ? T[stance] : null;
}

/**
 * COSTE DE CADA ACCION. No va en la tabla de stances porque es el mismo desde
 * cualquiera: lo que cambia es si la accion esta disponible, no lo que cuesta.
 *
 *   coste ... frames de la animacion
 *   energia ... lo que gasta de la barra
 *   verbo .... que pide al modelo posicional (null = no pide nada)
 *   al ....... a que stance se acaba (null = se queda)
 *   invierte . true si el verbo da la vuelta los papeles
 */
export const COSTE = Object.freeze({
    [ACCION.LEVANTARSE]: Object.freeze({ coste: 26, energia: 12, verbo: GEV.LEVANTAR, al: STANCE.DE_PIE_BAJO, invierte: false }),
    [ACCION.LEVANTARSE_ATACANDO]: Object.freeze({ coste: 22, energia: 16, verbo: null, al: STANCE.DE_PIE_BAJO, invierte: false }),
    [ACCION.ATACAR_DESDE_SUELO]: Object.freeze({ coste: 12, energia: 8, verbo: null, al: null, invierte: false }),
    [ACCION.RODAR_DEFENSIVO]: Object.freeze({ coste: 20, energia: 10, verbo: GEV.GUARDAR, al: STANCE.BOCA_ABAJO, invierte: false }),
    [ACCION.RODAR_OFENSIVO]: Object.freeze({ coste: 24, energia: 14, verbo: GEV.REVERSAR, al: STANCE.AGACHADO, invierte: true }),
    [ACCION.CAMBIAR_AGARRE]: Object.freeze({ coste: 10, energia: 4, verbo: null, al: STANCE.ENTRELAZADO, invierte: false }),
    [ACCION.SEPARARSE]: Object.freeze({ coste: 22, energia: 11, verbo: GEV.ESCAPAR, al: STANCE.AGACHADO, invierte: false }),
    [ACCION.REVERTER]: Object.freeze({ coste: 28, energia: 18, verbo: GEV.REVERSAR, al: STANCE.ENTRELAZADO, invierte: true }),
    [ACCION.PRESION]: Object.freeze({ coste: 30, energia: 24, verbo: null, al: STANCE.ENTRELAZADO, invierte: false }),
    [ACCION.PROYECCION]: Object.freeze({ coste: 30, energia: 20, verbo: GEV.AVANZAR, al: STANCE.DE_PIE_BAJO, invierte: false })
});

/** Cuanto se ve y cuanto protege una stance. */
export function exposicionDe(stance) {
    const i = infoStance(stance);
    return i ? i.expone : 0;
}
export function proteccionDe(stance) {
    const i = infoStance(stance);
    return i ? i.protege : 0;
}

/** Las acciones disponibles desde una stance. Copia, no la tabla. */
export function accionesDe(stance) {
    const i = infoStance(stance);
    return i ? i.acciones.slice() : [];
}

/** ¿Se puede hacer esto desde aqui? Sin mirar energia ni posicion. */
export function puedeHacer(stance, accion) {
    const i = infoStance(stance);
    if (!i) return false;
    return i.acciones.indexOf(accion) !== -1;
}

/**
 * EL NUCLEO: dado un cuerpo en el suelo, una accion y el estado del combate,
 * que pasa.
 *
 * @param {object} s
 * @param {string} s.stance    STANCE, la postura del cuerpo
 * @param {string} s.accion    ACCION, lo que quiere hacer
 * @param {string} [s.pos]     posicion del combate (position.js). Si no se
 *                             pasa, se comprueba la parte de la stance y ya.
 * @param {string} [s.rol]     ROL.ARRIBA / ROL.ABAJO: quien es este cuerpo en
 *                             el combate. Por defecto, ABAJO (el del suelo).
 * @param {number} [s.energia] energia que le queda
 * @param {number} [s.framesInside] frames que lleva en la posicion
 * @returns {object} { ok, motivo, accion, coste, frames, energia, verbo,
 *                     posTras, stanceTras, invierte }
 */
export function resolverStance(s) {
    const o = s || {};
    const stance = o.stance;
    const accion = o.accion;
    const pos = o.pos || POS.DE_PIE;
    const rol = o.rol || ROL.ABAJO;
    const energia = o.energia != null ? o.energia : 99;
    const framesInside = o.framesInside || 0;

    const ficha = COSTE[accion];
    const cuerpo = infoStance(stance);

    // Una accion que no existe: se contesta, no se adivina.
    if (!ficha) {
        return fallo(accion, 'ACCION_DESCONOCIDA', cuerpo, pos);
    }
    // Un cuerpo que no existe, igual.
    if (!cuerpo) {
        return fallo(accion, MOTIVO.STANCE_INCORRECTA, null, pos);
    }
    // Y un cuerpo que no puede hacer esto desde esta postura.
    if (!puedeHacer(stance, accion)) {
        return fallo(accion, MOTIVO.STANCE_INCORRECTA, cuerpo, pos);
    }
    // Energia: se comprueba ANTES de tocar el modelo posicional, para que el
    // fallo que se ve sea "no llega" y no un "no puedes salir de ahi" que no
    // es lo que el jugador quiere saber.
    if (ficha.energia > energia) {
        return fallo(accion, MOTIVO.SIN_ENERGIA, cuerpo, pos);
    }

    // LA ACCION NO TIENE VERBO POSICIONAL (atacar, cambiar el agarre, la
    // presion): no se toca la posicion. Se resuelve y ya.
    if (!ficha.verbo) {
        return {
            ok: true,
            motivo: MOTIVO.LEGAL,
            accion: accion,
            stance: stance,
            coste: ficha.coste,
            frames: ficha.coste,
            energia: ficha.energia,
            verbo: null,
            posTras: pos,
            stanceTras: ficha.al || stance,
            invierte: false,
            posicionCambiada: false
        };
    }

    // TIENE VERBO: se pregunta al modelo posicional, que es el unico que sabe
    // si la jugada es legal. La stance no decide nada de la relacion.
    const r = resolverSuelo(pos, rol, ficha.verbo, framesInside);

    if (!r.ok) {
        // Aqui NO se cambia el motivo a STANCE_INCORRECTA: la postura era
        // buena, lo que fallo fue que no tocaba. El jugador tiene que poder
        // distinguir "no puedo desde aqui" de "ya se me paso el momento".
        const porPos = {
            ok: false,
            motivo: r.motivo,
            accion: accion,
            stance: stance,
            coste: ficha.coste,
            frames: 0,
            energia: 0,
            verbo: ficha.verbo,
            posTras: pos,
            stanceTras: stance,
            invierte: false,
            posicionCambiada: false
        };
        return porPos;
    }

    // Y cuando el verbo falla por la VENTANA, la accion NO se gasta: el
    // jugador no ha hecho nada, no tiene por que pagarlo.
    return {
        ok: true,
        motivo: MOTIVO.LEGAL,
        accion: accion,
        stance: stance,
        coste: ficha.coste,
        frames: ficha.coste,
        energia: ficha.energia,
        verbo: ficha.verbo,
        posTras: r.to,
        stanceTras: ficha.al || stance,
        invierte: ficha.invierte,
        posicionCambiada: r.to !== pos,
        ventanaRestante: r.ventanaRestante
    };
}

function fallo(accion, motivo, cuerpo, pos) {
    return {
        ok: false,
        motivo: motivo,
        accion: accion,
        stance: cuerpo ? cuerpo.nombre : null,
        coste: 0,
        frames: 0,
        energia: 0,
        verbo: null,
        posTras: pos,
        stanceTras: null,
        invierte: false,
        posicionCambiada: false
    };
}

/**
 * QUE ACCION HACE UN BOTON desde una postura y una posicion concretas.
 *
 * El mapa es explicito (`MAPEO`), no se deduce. Antes se elegia "la mas
 * barata" cuando dos acciones compartian boton, y eso hacia que el boton de
 * accion sacara "rodar" en vez de "presion" con los dos entrelazados, solo
 * porque rodar costs 24 frames y presion 30. Un criterio de precio para
 * decidir lo que hace un boton es un criterio que cambia en cuanto se toca un
 * numero, y el jugador no puede aprenderlo.
 *
 * Si el mapa no dice nada para ese boton en esa postura, se devuelve null: no
 * hay nada que hacer ahi con ese boton.
 */
export function accionDeBoton(stance, boton, pos = POS.DE_PIE, energia = 99) {
    const fila = Object.prototype.hasOwnProperty.call(MAPEO, stance) ? MAPEO[stance] : null;
    if (!fila) return null;

    const accion = fila[boton];
    if (!accion) return null;

    const r = resolverStance({ stance: stance, accion: accion, pos: pos, energia: energia });
    return r.ok ? r : null;
}

/**
 * Que ACCION hace una DIRECCION desde esta postura. La contraparte del boton,
 * y por el mismo motivo: en el suelo tambien se juega con el mando.
 */
export function accionDeDireccion(stance, direccion, pos = POS.DE_PIE, energia = 99) {
    const cuerpo = infoStance(stance);
    if (!cuerpo) return null;
    for (const k of cuerpo.acciones) {
        if (DIRECCION_DE[k] !== direccion) continue;
        const r = resolverStance({ stance: stance, accion: k, pos: pos, energia: energia });
        if (r.ok) return r;
    }
    return null;
}

/** Todas las acciones que saldrian de un boton. Para el HUD. */
export function opcionesDeBoton(stance, boton) {
    const cuerpo = infoStance(stance);
    if (!cuerpo) return [];
    return cuerpo.acciones
        .filter(k => BOTON_DE[k] === boton)
        .map(k => ({ accion: k, coste: COSTE[k].coste, energia: COSTE[k].energia }));
}

/**
 * El estado del suelo de UN luchador, con su posture y su relacion.
 *
 * @param {string} stance
 * @param {string} pos    posicion del combate
 * @param {string} rol    ROL.ARRIBA / ROL.ABAJO: **que papel juega este
 *   cuerpo**. Es OBLIGATORIO y no se deduce, y hay una razon dura: la postura
 *   sola no lo dice. Un cuerpo tumbado de espaldas puede ser el de arriba
 *   (esta montando al otro de lado y el otro esta boca arriba debajo) o el de
 *   abajo (le estan pisando la espalda). Las dos son BOCA_ARRIBA.
 *
 *   Antes esta funcion deducía el papel de si la posicion "tiene alguien
 *   arriba", y eso es FALSO para uno de los dos: los dos estan en la misma
 *   posicion y solo uno esta arriba. Quien lo deduce se equivoca en el
 *   primer frame.
 *
 * @param {number} framesInside
 */
export function lecturaDe(stance, pos, rol = ROL.ABAJO, framesInside = 0) {
    const i = infoStance(stance);
    const p = info(pos);
    return {
        stance: stance,
        nombreStance: i ? i.nombre : '?',
        pos: pos,
        nombrePos: p ? p.nombre : '?',
        // Si la posicion NO tiene de arriba (los dos de pie) el papel es
        // irrelevante; se devuelve ABAJO para no tener null en medio de una
        // decision.
        arriba: rol === ROL.ARRIBA,
        rol: rol,
        peligro: peligroDe(pos),
        expone: exposicionDe(stance),
        protege: proteccionDe(stance),
        acciones: accionesDe(stance),
        framesInside: framesInside,
        ventanaRestante: Math.max(0, ventanaDe(pos) - framesInside)
    };
}

export default {
    STANCE, ACCION, ACCIONES, STANCES, MOTIVO, BOTON_DE, COSTE,
    infoStance, exposicionDe, proteccionDe, accionesDe, puedeHacer,
    resolverStance, accionDeBoton, opcionesDeBoton, lecturaDe
};