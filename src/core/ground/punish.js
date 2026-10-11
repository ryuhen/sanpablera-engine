/**
 * ============================================================================
 * SANPABLERA ENGINE · core/ground/punish.js
 * ----------------------------------------------------------------------------
 * EL MODO DOMINANTE: castigar por zonas y buscar la sumision.
 *
 * QUE ES
 * ----------------------------------------------------------------------------
 *   La mitad del sistema de suelo que le toca al que esta ARRIBA. La otra
 *   mitad (donde esta cada uno y como se cambia de sitio) esta en
 *   `position.js`. Aqui esta QUE SE HACE una vez que ya has llegado.
 *
 *   El spec 8 lo pide asi: "cada boton castiga una zona especifica (cabeza,
 *   torso, costillas para obligar a girar la espalda), aplicar sumisiones, o
 *   ejecutar proyecciones desde el suelo y remates despiadados".
 *
 * LO QUE HACE QUE ESTO NO SEA UN LISTADO DE GOLPES
 * ----------------------------------------------------------------------------
 *   La clave del enunciado es la coletilla: **las costillas OBLIGAN A GIRAR LA
 *   ESPALDA**. Si castigar a las costillas solo quita vida, el sistema de suelo
 *   es un peleon de golpes con el rival tumbado y no tiene nada de posicional.
 *
 *   Asi que el castigo tiene una CONSECUENCIA POSICIONAL: pegar en las
 *   costillas acumula "giro" y, al tercero, el de abajo se queda de espaldas,
 *   y eso es entrar en ESPALDA. Cambiar de posicion CUENTA como hacer daño, y
 *   es la unica forma barata de llegar al sitio desde el que se acaba.
 *
 *   De ahi sale la decision de juego: los golpes a la cabeza hacen mucho daño
 *   pero no mueven; las costillas hacen menos daño y te llevan a la espalda.
 *   Cambiar de posicion CUENTA como hacer daño, y es la unica forma barata de
 *   llegar al sitio desde el que se acaba.
 *
 * LO QUE NO HACE ESTE ARCHIVO
 * ----------------------------------------------------------------------------
 *   No aplica daño, no gasta energia y no cambia el estado de nadie: eso es
 *   cosa del motor. Aqui solo se DICE, para un boton y una posicion, que se
 *   puede hacer, cuanto cuesta y a donde lleva. Por eso es puro y se prueba
 *   en Node.
 * ============================================================================
 */

import { POS, ZONA, info, puedeCastigar } from './position.js';

/** Los botones. Los mismos cuatro que en el resto del juego. */
export const BOTON = Object.freeze({
    LIGERO: 'LIGERO',
    PESADO: 'PESADO',
    GUARDIA: 'GUARDIA',
    ACCION: 'ACCION'
});

/** Lo que hace cada boton cuando estas arriba. */
export const ACCION = Object.freeze({
    CABEZA: 'CABEZA',           // dano puro, el mas rápido
    TORSO: 'TORSO',             // dano y cansancio: el golpe de desgaste
    COSTILLAS: 'COSTILLAS',     // poco dano pero GIRA LA ESPALDA
    BRAZO: 'BRAZO',             // atemí al brazo: prepara la sumision
    SUMISION: 'SUMISION',       // la jugada que acaba el suelo
    PROYECCION: 'PROYECCION'    // voltear al de abajo
});

/** Las sumisiones. Cada una dice de donde se puede y que gana. */
export const SUM = Object.freeze({
    PAJITAS: Object.freeze({
        clave: 'PAJITAS', nombre: 'Pajitas', frames: 20, stamina: 22,
        desde: [POS.CONTROL_LATERAL, POS.CRUCIFIX, POS.MONTEJA,
                POS.MEDIA_MONTEJA, POS.ESPALDA, POS.ESPALDA_GANCHO],
        zona: ZONA.CABEZA, aviso: 10,
        resultado: { posicion: null, dano: 0, entrega: true }
    }),
    TRICOLOQUEO: Object.freeze({
        clave: 'TRICOLOQUEO', nombre: 'Tricolqueo', frames: 24, stamina: 26,
        desde: [POS.CRUCIFIX, POS.ESPALDA, POS.ESPALDA_GANCHO],
        zona: ZONA.CABEZA, aviso: 10,
        resultado: { posicion: null, dano: 0, entrega: true }
    }),
    MATRACA: Object.freeze({
        clave: 'MATRACA', nombre: 'Matraca', frames: 26, stamina: 28,
        desde: [POS.MONTEJA, POS.MEDIA_MONTEJA, POS.ESPALDA_GANCHO],
        zona: ZONA.BRAZO, aviso: 12,
        resultado: { posicion: null, dano: 0, entrega: true }
    }),
    CODO: Object.freeze({
        clave: 'CODO', nombre: 'Codo al cuello', frames: 18, stamina: 18,
        desde: [POS.CONTROL_LATERAL, POS.MONTEJA],
        zona: ZONA.TORSO, aviso: 8,
        resultado: { posicion: null, dano: 0, entrega: true }
    })
});

/** Todas las sumisiones, en una lista. */
export const SUMISIONES = Object.freeze(Object.keys(SUM));

/**
 * Que castiga cada boton.
 *
 *   frames .... lo que tarda en salir el golpe (es la fase Startup del frame
 *               data, aqui puesta en frames de suelo)
 *   dano ...... vida que quita
 *   stamina ... energia que gasta el de arriba (el castigo en el suelo tiene que
 *               costar, o el de arriba no para nunca)
 *   giro ...... cuantos golpes a esta zona hacen falta para forzar la espalda
 *   hacia ..... a que posicion lleva al de abajo cuando se completa el giro
 *
 * El boton de GUARDIA esta aqui a proposito: arriba, "guardia" no es defenderse
 * sino lo contrario, mantener el control y RESETEAR el giro acumulado. Es lo
 * que hace que el boton tenga sentido en el suelo y no sea un boton muerto.
 */
export const CASTIGO = Object.freeze({
    LIGERO: Object.freeze({
        boton: BOTON.LIGERO, accion: ACCION.CABEZA, zona: ZONA.CABEZA,
        frames: 7, dano: 4, stamina: 3, giro: 0, hacia: null,
        nota: 'El mas rapido y el que menos hace. Es el que te deja encadenar.'
    }),
    PESADO: Object.freeze({
        boton: BOTON.PESADO, accion: ACCION.COSTILLAS, zona: ZONA.COSTILLAS,
        frames: 13, dano: 9, stamina: 8, giro: 1, hacia: POS.ESPALDA,
        nota: 'El que gira la espalda. Poco dano por golpe, pero es el camino.'
    }),
    ACCION: Object.freeze({
        boton: BOTON.ACCION, accion: ACCION.SUMISION, zona: ZONA.CABEZA,
        frames: 18, dano: 0, stamina: 20, giro: 0, hacia: null,
        nota: 'Intenta la sumision disponible en esta posicion.'
    }),
    GUARDIA: Object.freeze({
        boton: BOTON.GUARDIA, accion: ACCION.TORSO, zona: ZONA.TORSO,
        frames: 9, dano: 3, stamina: 2, giro: -1, hacia: null,
        nota: 'Frenar y mantener el control: quita un golpe de giro acumulado.'
    })
});

/**
 * Las PROYECCIONES: voltear al de abajo y quedarse mejor. Son caras y lentas,
 * pero son la unica forma de subir MUCHO de golpe sin pasar por todos los
 * escalones.
 */
export const PROYECCION = Object.freeze({
    PASE: Object.freeze({
        clave: 'PASE', nombre: 'Pasada de pierna', frames: 24, stamina: 16,
        desde: [POS.GUARDIA_ABIERTA, POS.GUARDIA_CERRADA, POS.MEDIA_GUARDIA],
        llevaA: POS.PASADO
    }),
    VOLTEO: Object.freeze({
        clave: 'VOLTEO', nombre: 'Volteo de cadera', frames: 28, stamina: 20,
        desde: [POS.CONTROL_LATERAL],
        llevaA: POS.MONTEJA
    })
});

/** Cuantos golpes de giro se necesitan para entrar en cada posicion. */
export const GIRO_NECESARIO = Object.freeze({
    ESPALDA: 3,
    ESPALDA_GANCHO: 3   // el tercero y cuarto: el cuarto engancha
});

/**
 * Que castigo corresponde a un boton, y si se puede hacer desde aqui.
 *
 * @param {string} pos  posicion actual
 * @param {string} boton una clave de BOTON
 * @returns {object} { ok, motivo, castigo, frames, dano, stamina }
 */
export function castigoDe(pos, boton) {
    const castigo = CASTIGO[boton];

    // Boton que no existe: se contesta, no se adivina.
    if (!castigo) {
        return { ok: false, motivo: 'BOTON_DESCONOCIDO', castigo: null, frames: 0, dano: 0, stamina: 0 };
    }

    // La tabla de posiciones es la que dice si la zona se alcanza; el castigo
    // no vuelve a decidirlo. Una sola fuente para "que se puede tocar aqui".
    const alcance = puedeCastigar(pos, castigo.zona);
    if (!alcance.ok) {
        return { ok: false, motivo: alcance.motivo, castigo: castigo, frames: 0, dano: 0, stamina: 0 };
    }

    return {
        ok: true,
        motivo: 'LEGAL',
        castigo: castigo,
        frames: castigo.frames,
        dano: castigo.dano,
        stamina: castigo.stamina
    };
}

/**
 * Cuantos golpes de giro lleva el de arriba. El CONTADOR no esta aqui: este
 * modulo es sin estado a proposito, para que dos peleadores no compartan
 * numero. Quien lo lleva es el motor.
 *
 * @param {string} pos      posicion actual
 * @param {string} boton    boton que se va a pulsar
 * @param {number} giroActual  golpes de giro que lleva
 * @returns {object} { giro, completo, hacia,frames, dano, stamina }
 */
export function resolverGiro(pos, boton, giroActual = 0) {
    const golpe = castigoDe(pos, boton);
    if (!golpe.ok) {
        return { ok: false, giro: giroActual, completo: false, hacia: null, frames: 0, dano: 0, stamina: 0 };
    }

    const g = golpe.castigo.giro;
    const giro = Math.max(0, giroActual + g);

    // El golpe de guardia FRENA: es lo unico que frena. Si tambien hiciera
    // giro, el giro solo subiria y el de abajo tendria una sola salida.
    const completo = giro >= GIRO_NECESARIO.ESPALDA;

    return {
        ok: true,
        giro: giro,
        completo: completo && g > 0,
        hacia: completo ? golpe.castigo.hacia : null,
        frames: golpe.frames,
        dano: golpe.dano,
        stamina: golpe.stamina,
        motivo: golpe.motivo
    };
}

/**
 * La sumision que toca desde esta posicion. La mas rapida de las posibles,
 * que es la que se elige: de tres sumisiones disponibles en la monteja, la
 * de menos frames es la de 18 y no la de 26.
 *
 * @param {string} pos   posicion actual
 * @param {number} stamina  energia que le queda al de arriba
 * @returns {object} { ok, sumision, motivo, frames, stamina, entrega }
 */
export function sumisionDe(pos, stamina = 99) {
    const i = info(pos);
    if (!i || !i.arriba) return { ok: false, motivo: 'NO_HAY_ARRIBA', sumision: null, frames: 0, entrega: false };

    const disponibles = i.sumision.filter(k => SUM[k]);
    if (!disponibles.length) {
        return { ok: false, motivo: 'SIN_SUMISION_AQUI', sumision: null, frames: 0, entrega: false };
    }

    let mejor = null;
    for (const k of disponibles) {
        const s = SUM[k];
        if (s.stamina > stamina) continue;
        if (!mejor || s.frames < mejor.frames) mejor = s;
    }

    // Había sumisiones pero ninguna pagable: el motivo tiene que decir ESO y no
    // "no hay sumision", que no es verdad y esconde un problema de energia.
    if (!mejor) {
        return {
            ok: false, motivo: 'SIN_STAMINA', sumision: null, frames: 0, entrega: false,
            disponibles: disponibles
        };
    }

    return {
        ok: true,
        motivo: 'LEGAL',
        sumision: mejor,
        frames: mejor.frames,
        stamina: mejor.stamina,
        zona: mejor.zona,
        aviso: mejor.aviso,
        entrega: mejor.resultado.entrega
    };
}

/**
 * La proyeccion que toca desde aqui. Igual que la sumision: la mas rapida de
 * las que se pueden pagar.
 */
export function proyeccionDe(pos, stamina = 99) {
    const claves = Object.keys(PROYECCION);
    let mejor = null;
    for (const k of claves) {
        const p = PROYECCION[k];
        if (p.desde.indexOf(pos) === -1) continue;
        if (p.stamina > stamina) continue;
        if (!mejor || p.frames < mejor.frames) mejor = p;
    }
    if (!mejor) return { ok: false, motivo: 'SIN_PROYECCION_AQUI', proyeccion: null, llevaA: null };
    return { ok: true, motivo: 'LEGAL', proyeccion: mejor, frames: mejor.frames, stamina: mejor.stamina, llevaA: mejor.llevaA };
}

/**
 * El remate: desde donde se puede acabar el combate en el suelo.
 * Es la lista corta y se lee de un vistazo: son las posiciones desde las que
 * el de arriba ya solo tiene que rematar.
 */
export function posicionesDeRemate() {
    return [POS.CRUCIFIX, POS.MONTEJA, POS.MEDIA_MONTEJA, POS.ESPALDA, POS.ESPALDA_GANCHO]
        .filter(p => info(p) && info(p).peligro >= 8);
}

export default {
    BOTON, ACCION, SUM, SUMISIONES, CASTIGO, PROYECCION, GIRO_NECESARIO,
    castigoDe, resolverGiro, sumisionDe, proyeccionDe, posicionesDeRemate
};