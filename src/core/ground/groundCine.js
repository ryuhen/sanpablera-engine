/**
 * ============================================================================
 * SANPABLERA ENGINE · core/ground/groundCine.js
 * ----------------------------------------------------------------------------
 * LA CINEMATICA DE SUELO: como se ve la pelea en el suelo.
 *
 * LA REGLA QUE LO DEFINE, Y ES LA MAS IMPORTANTE DEL ARCHIVO
 * ----------------------------------------------------------------------------
 *   **AQUI NO SE NUNCA QUITA EL CONTROL.**
 *
 *   En el suelo el jugador manda siempre. La cinematica no es una secuencia
 *   guionizada que se reproduce sola y devuelve el control al final: es una
 *   CAPA que se superpone a lo que los dos ya estan haciendo. Si nadie esta
 *   haciendo nada, los dos siguen rodando o se separan y la capa esta vacia.
 *   Si alguien golpea, la capa enseña el golpe; si alguien intenta una
 *   estrangulacion, la capa enseña la estrangulacion y el otro tiene que
 *   salir.
 *
 *   Por eso este archivo NO DEVUELVE NINGUN ESTADO. Devuelve planos de
 *   camara y una lista desetminus de pose. Quien lo llama decide que hacer
 *   con ellos; este decide COMO SE VE.
 *
 * POR QUE SUPERPOSICION Y NO SUSTITUCION
 * ----------------------------------------------------------------------------
 *   Porque la postura de la pelea en el suelo ya la produce la stance
 *   (`stance.js`) y la postura de la relacion la produce la posicion
 *   (`position.js`). Si la cinematica sustituyera, en el frame que empezara
 *   el plano se perderian las dos y los peleadores volverian a la pose de
 *   reposo en mitad de un agarre.
 *
 *   Por eso lo que sale aqui son DELTAS de pose (rotaciones sueltas con un
 *   peso), que se suman encima de lo que ya hay: `Pose.overlayPose` las aplica
 *   sin tocar lo de debajo. El plano se aplica encima del plano que hubiera.
 *   Ninguno de los dos pisa al otro.
 *
 * EL VOCABULARIO YA EXISTIA
 * ----------------------------------------------------------------------------
 *   `cine/CineConstants.js` ya declara `ShotSize` (ocho planos, con el TAMANO
 *   del sujeto en metros, no "cerca" o "lejos"), `CameraMove` (diez
 *   movimientos) y `TransitionKind`. Escribirlos sin un reproductor es tener
 *   un diccionario sin quien lea: esto es el que lee.
 * ============================================================================
 */

import { ShotSize, CameraMove, TransitionKind } from '../cine/CineConstants.js';
import { ACCION, STANCE } from './stance.js';
import { POS, info } from './position.js';

export { ShotSize, CameraMove, TransitionKind };

/**
 * El TAMANO en metros de cada plano, que es como hay que declararlo: un
 * "primer plano" no dice nada hasta que sabes que encuadra un metro con
 * veinte, y en una pelea en el suelo, donde los dos cuerpos estan tumbados y
 * se solapan, "encuadra un metro con veinte" es exactamente lo que hay que
 * saber para no cortar la mitad del agarre.
 */
export const ALTO_PLANO = Object.freeze({
    [ShotSize.EXTREME_CLOSE]: 0.25,
    [ShotSize.CLOSE]: 0.45,
    [ShotSize.MEDIUM_CLOSE]: 0.80,
    [ShotSize.MEDIUM]: 1.20,
    [ShotSize.COWBOY]: 1.70,
    [ShotSize.FULL]: 2.20,
    [ShotSize.WIDE]: 4.00,
    [ShotSize.ESTABLISHING]: 9.00
});

/**
 * UN PLANO. Es un objeto de datos, no una clase: la cinematica de este motor
 * se DECLARA, no se graba.
 *
 *   dur .... frames que dura
 *   size ... que encuadra
 *   move ... que hace la camara mientras dura
 *   trans .. como se entra a este plano
 *   peso ... cuanto mete la capa de pose (0 = la camara se mueve y ya)
 *   cues ... que huesos se mueven y como (la capa de pose)
 */
function plano(dur, size, move, trans, peso, cues) {
    return Object.freeze({
        dur: dur, size: size, move: move, trans: trans,
        peso: peso, cues: Object.freeze(cues || [])
    });
}

/** Un hueso que gira con un peso, en grados. */
function cue(hueso, eje, grados, peso = 1) {
    return Object.freeze({ hueso: hueso, eje: eje, grados: grados, peso: peso });
}

/**
 * LA GUION DE CADA ACCION.
 *
 * El patron de todos los guiones es el mismo y no es casualidad: se empieza
 * EN ANCHO para ver quien manda, se cierra cuando la accion pega y se vuelve
 * a abrir. Es lo que hace una pelea en el suelo legible: si se empieza en
 * close, el espectador no sabe de donde ha salido el brazo.
 */
export const GUION = Object.freeze({
    // --- la levantada: de la lona a de pie. Empieza mirando desde arriba ---
    [ACCION.LEVANTARSE]: Object.freeze([
        plano(14, ShotSize.MEDIUM, CameraMove.PEDESTAL, TransitionKind.CUT, 0.5, [
            cue('cabeza', 'x', 18), cue('torso', 'x', 10), cue('pelvis', 'y', 8)
        ]),
        plano(16, ShotSize.COWBOY, CameraMove.TRUCK, TransitionKind.CUT, 0.8, [
            cue('muslo_d', 'x', -55), cue('muslo_i', 'x', -55), cue('rodilla_d', 'x', 60)
        ])
    ]),

    // --- atacar en la levantada: el golpe sale a media levantada -----------
    [ACCION.LEVANTARSE_ATACANDO]: Object.freeze([
        plano(10, ShotSize.MEDIUM, CameraMove.PEDESTAL, TransitionKind.CUT, 0.4, [
            cue('pelvis', 'y', -20), cue('torso', 'z', -14)
        ]),
        plano(6, ShotSize.MEDIUM_CLOSE, CameraMove.CRASH_ZOOM, TransitionKind.FLASH, 1, [
            cue('antebrazo_d', 'y', -55), cue('hombro_d', 'x', -25)
        ]),
        plano(10, ShotSize.COWBOY, CameraMove.TRUCK, TransitionKind.CUT, 0.6, [
            cue('muslo_i', 'x', -45)
        ])
    ]),

    // --- golpear tumbado: aqui no hay zoom, hay que VER el brazo entero ---
    [ACCION.ATACAR_DESDE_SUELO]: Object.freeze([
        plano(8, ShotSize.COWBOY, CameraMove.HANDHELD, TransitionKind.CUT, 0.7, [
            cue('antebrazo_d', 'y', -70, 0.8), cue('torso', 'z', -10)
        ]),
        plano(5, ShotSize.MEDIUM_CLOSE, CameraMove.CRASH_ZOOM, TransitionKind.FLASH, 1, [
            cue('antebrazo_d', 'y', -95)
        ])
    ]),

    // --- rodar para cubrirse: la camara se va con el cuerpo ----------------
    [ACCION.RODAR_DEFENSIVO]: Object.freeze([
        plano(11, ShotSize.COWBOY, CameraMove.ORBIT, TransitionKind.CUT, 0.6, [
            cue('torso', 'x', 40), cue('pelvis', 'y', 25), cue('cabeza', 'x', -15)
        ]),
        plano(9, ShotSize.MEDIUM, CameraMove.FOLLOW, TransitionKind.CUT, 0.5, [
            cue('torso', 'x', 55)
        ])
    ]),

    // --- rodar para invertir: es el unico con movimiento de camara LIBRE ---
    // El rodar ofensivo es el momento en el que los dos cuerpos dan una vuelta
    // y el espectador pierde la referencia. Por eso es el unico con ORBIT
    // completo: hay que pagar ese momento con movimiento, para que se vea
    // arriba.
    [ACCION.RODAR_OFENSIVO]: Object.freeze([
        plano(12, ShotSize.FULL, CameraMove.ORBIT, TransitionKind.CUT, 0.5, [
            cue('pelvis', 'y', 40), cue('torso', 'x', 35), cue('muslo_i', 'x', -60)
        ]),
        plano(10, ShotSize.COWBOY, CameraMove.ORBIT, TransitionKind.WHIP_PAN, 0.7, [
            cue('torso', 'y', -30), cue('muslo_d', 'x', -70)
        ]),
        plano(8, ShotSize.MEDIUM, CameraMove.CRASH_ZOOM, TransitionKind.FLASH, 0.9, [
            cue('pelvis', 'y', -25)
        ])
    ]),

    // --- cambiar el agarre: plano fijo y corto, es un gesto pequeno --------
    [ACCION.CAMBIAR_AGARRE]: Object.freeze([
        plano(9, ShotSize.MEDIUM_CLOSE, CameraMove.STATIC, TransitionKind.CUT, 0.9, [
            cue('antebrazo_d', 'z', 30), cue('antebrazo_i', 'z', -30),
            cue('torso', 'y', 10)
        ])
    ]),

    // --- soltarse: se separan, y eso pide plano ANCHO de verdad ----------
    [ACCION.SEPARARSE]: Object.freeze([
        plano(10, ShotSize.MEDIUM, CameraMove.STATIC, TransitionKind.CUT, 0.4, []),
        plano(16, ShotSize.WIDE, CameraMove.DOLLY, TransitionKind.DISSOLVE, 0.3, [
            cue('torso', 'z', 0), cue('pelvis', 'y', 0)
        ])
    ]),

    // --- la inversion: la cinematica mas larga y la unica con tres planos ---
    // La inversion es lo mas caro del suelo, asi que es lo unico que se
    //permite tres tiempos: el enganche (cerca, para ver las manos), el vuelta
    // (ancho y orbital, porque los cuerpos se dan la vuelta) y el resultado
    // (medio, para ver quien ha salido arriba).
    [ACCION.REVERTER]: Object.freeze([
        plano(8, ShotSize.MEDIUM_CLOSE, CameraMove.STATIC, TransitionKind.CUT, 0.9, [
            cue('antebrazo_d', 'y', -40), cue('antebrazo_i', 'y', 40)
        ]),
        plano(12, ShotSize.FULL, CameraMove.ORBIT, TransitionKind.WHIP_PAN, 0.6, [
            cue('pelvis', 'y', 55), cue('torso', 'x', -30)
        ]),
        plano(10, ShotSize.MEDIUM, CameraMove.CRASH_ZOOM, TransitionKind.FLASH, 0.8, [
            cue('torso', 'z', 22), cue('pelvis', 'y', -30)
        ])
    ]),

    // --- estrangulacion o palanca: el plano mas cerrado del juego ---------
    [ACCION.PRESION]: Object.freeze([
        plano(10, ShotSize.MEDIUM_CLOSE, CameraMove.STATIC, TransitionKind.CUT, 1, [
            cue('antebrazo_d', 'y', -75), cue('antebrazo_i', 'y', -75), cue('torso', 'x', 15)
        ]),
        plano(12, ShotSize.CLOSE, CameraMove.DOLLY, TransitionKind.CUT, 1, [
            cue('cabeza', 'z', -25), cue('antebrazo_i', 'z', 40)
        ]),
        plano(8, ShotSize.MEDIUM_CLOSE, CameraMove.CRASH_ZOOM, TransitionKind.FLASH, 1, [
            cue('antebrazo_d', 'x', 45)
        ])
    ]),

    // --- proyeccion: el unico con plano ANCHO de salida --------------------
    [ACCION.PROYECCION]: Object.freeze([
        plano(10, ShotSize.MEDIUM, CameraMove.HANDHELD, TransitionKind.CUT, 0.8, [
            cue('torso', 'x', -25), cue('pelvis', 'y', 30)
        ]),
        plano(12, ShotSize.FULL, CameraMove.PEDESTAL, TransitionKind.CUT, 0.5, [
            cue('torso', 'y', -45)
        ]),
        plano(8, ShotSize.COWBOY, CameraMove.DOLLY, TransitionKind.CUT, 0.4, [])
    ])
});

/** El guion de una accion. Vacio si no hay uno. */
export function guionDe(accion) {
    return Object.prototype.hasOwnProperty.call(GUION, accion) ? GUION[accion] : null;
}

/** Cuantos frames dura un guion entero. */
export function duracionDe(guion) {
    if (!guion) return 0;
    let n = 0;
    for (const p of guion) n += p.dur;
    return n;
}

/**
 * Que plano se esta viendo en este frame del guion.
 *
 * @param {string} accion  clave de ACCION
 * @param {number} frame   frame dentro de la secuencia (0 al principio)
 * @returns {object} { plano, i, dentro, t, fin } · `fin` = true si ya acabo
 */
export function planoEn(accion, frame) {
    const guion = guionDe(accion);
    if (!guion) return null;

    let f = Math.max(0, frame);
    for (let i = 0; i < guion.length; i++) {
        const p = guion[i];
        if (f < p.dur) {
            return {
                plano: p,
                i: i,
                dentro: f,
                t: f / p.dur,          // 0..1 dentro de este plano
                progreso: f / duracionDe(guion)
            };
        }
        f -= p.dur;
    }
    return null; // la secuencia ya se acabo
}

/**
 * La capa de pose del frame: los huesos que se mueven AHORA, con su peso.
 *
 * El peso TIEMBLA: sube y baja dentro del plano (un golpe entra rapido y se
 * queda). Sin eso la capa es un palo que se enciende y se apaga, y se nota
 * exactamente en las transiciones, que es donde el ojo mira.
 *
 * Devuelve una lista VACIA si la secuencia ya termino. El motor no tiene que
 * preguntar nada: si no hay nada que superponer, no superpone nada.
 */
export function capaEn(accion, frame) {
    const e = planoEn(accion, frame);
    if (!e) return [];

    const p = e.plano;
    // El peso del plano por el peso del beat: el beat se levanta y se baja.
    const golpe = p.peso <= 0 ? 0 : p.peso * pesoDelBeat(e.t);
    if (golpe <= 0) return [];

    return p.cues.map(c => Object.freeze({
        hueso: c.hueso,
        eje: c.eje,
        grados: c.grados,
        peso: golpe * (c.peso != null ? c.peso : 1)
    }));
}

/**
 * La forma del peso dentro de un plano. Entra rapido, se queda, sale.
 * Es la de los golpes: si hiciera una rampa suave, el brazo tardaria en
 * startarse y se veria que el golpe "flota".
 */
export function pesoDelBeat(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    // Subida rapida en el primer 25% y bajada en el ultimo 30%.
    if (t < 0.25) return t / 0.25;
    if (t > 0.70) return (1 - t) / 0.30;
    return 1;
}

/**
 * El PLAN COMPLETO de una accion, que es lo que el motor consume.
 *
 * @returns {object} { accion, frames, planos, existe }
 *   `existe: false` cuando no hay guion: el motor deja la camara donde esta y
 *   no toca las poses. Es el caso NORMAL y no es un fallo.
 */
export function planDe(accion) {
    const guion = guionDe(accion);
    if (!guion) return { accion: accion, existe: false, frames: 0, planos: [] };
    return {
        accion: accion,
        existe: true,
        frames: duracionDe(guion),
        planos: guion
    };
}

/**
 * Que plano hay que usar SI NO HAY NADA QUE RESOLVER: los dos estan
 * entrelazados y no hacen nada.
 *
 * Es una decision de DISENO y va en el codigo a proposito: cuando no pasa
 * nada, la camara NO se queda clavada en el plano que hizo el ultimo golpe.
 * Se abre a plano medio con la camara siguiendo a los dos, y con una capa
 * casi vacia. Rodando por el suelo, separados, o simplemente respirando, lo
 * que tiene que verse es el suelo y los dos cuerpos.
 */
export const REPOSO_ENTRELAZADO = Object.freeze({
    dur: 30,
    size: ShotSize.MEDIUM,
    move: CameraMove.FOLLOW,
    trans: TransitionKind.DISSOLVE,
    peso: 0.25,
    cues: Object.freeze([
        cue('torso', 'x', 8, 0.4),
        cue('antebrazo_d', 'z', 12, 0.4)
    ])
});

/**
 * El plan cuando no hay nada que resolver. Es lo que se usa el 90% del
 * tiempo, y por eso tiene que estar bien hecho: es el plano base.
 */
export function planDeReposo() {
    return {
        accion: null,
        existe: true,
        frames: REPOSO_ENTRELAZADO.dur,
        planos: [REPOSO_ENTRELAZADO]
    };
}

/**
 * La capa de pose del reposo. Siempre hay una, aunque sea minima: aunque
 * los dos esten quietos, el pecho sube y baja.
 */
export function capaDeReposo(frame) {
    const d = REPOSO_ENTRELAZADO.dur;
    const t = ((frame % d) + d) % d / d;
    const w = REPOSO_ENTRELAZADO.peso * pesoDelBeat(t) * 0.35;
    return REPOSO_ENTRELAZADO.cues.map(c => Object.freeze({
        hueso: c.hueso,
        eje: c.eje,
        grados: c.grados,
        peso: w * (c.peso != null ? c.peso : 1)
    }));
}

/**
 * El tamaño de plano que hace falta para encuadrar a los dos.
 *
 * Dos cuerpos tumbados y entrelazados ocupan mas que uno de pie, pero no el
 * doble. Se mide en vez de elegirse: cuando la camara encuadra 1,2 m
 * (plano medio) y los dos miden 2,2 tumbados, se les cortan las piernas.
 */
export function planoPara(altoSujeto, solapado = false) {
    // Un 35% mas si estan tumbados y solapados: los dos cuerpos se cruzan.
    const alto = altoSujeto * (solapado ? 1.35 : 1);
    if (alto <= ALTO_PLANO[ShotSize.EXTREME_CLOSE]) return ShotSize.EXTREME_CLOSE;
    if (alto <= ALTO_PLANO[ShotSize.CLOSE]) return ShotSize.CLOSE;
    if (alto <= ALTO_PLANO[ShotSize.MEDIUM_CLOSE]) return ShotSize.MEDIUM_CLOSE;
    if (alto <= ALTO_PLANO[ShotSize.MEDIUM]) return ShotSize.MEDIUM;
    if (alto <= ALTO_PLANO[ShotSize.COWBOY]) return ShotSize.COWBOY;
    if (alto <= ALTO_PLANO[ShotSize.FULL]) return ShotSize.FULL;
    if (alto <= ALTO_PLANO[ShotSize.WIDE]) return ShotSize.WIDE;
    return ShotSize.ESTABLISHING;
}

/**
 * Si hay guion para esta accion. El motor lo pregunta antes de montar nada,
 * para no crear una capa vacia cada frame.
 */
export function tieneGuion(accion) {
    return !!guionDe(accion);
}

export default {
    GUION, ALTO_PLANO, REPOSO_ENTRELAZADO,
    ShotSize, CameraMove, TransitionKind,
    guionDe, duracionDe, planoEn, capaEn, pesoDelBeat,
    planDe, planDeReposo, capaDeReposo, planoPara, tieneGuion
};