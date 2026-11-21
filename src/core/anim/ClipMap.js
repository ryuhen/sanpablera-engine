/**
 * ============================================================================
 * SANPABLERA ENGINE · core/anim/ClipMap.js
 * ----------------------------------------------------------------------------
 * EL MAPA DE ANIMACIONES (datos puros, sin Babylon ni DOM).
 *
 * POR QUE EXISTE
 *   El motor tiene TRES listas que no se hablan entre si:
 *     - `ui/selectAnims.js`: 18 animaciones de vista previa con su `clip`.
 *     - `anim/ClipLibrary.js`: ~83 clips procedurales con ficha (dur, loop...).
 *     - `render/ClipGrabber.js`: clips grabados en GLB.
 *   `selectAnims` pide nombres como `LIGHT_1` o `REVERSE_KICK`, que son ESTADOS,
 *   no nombres de clip de la biblioteca. Nadie lo decia: la vista previa pide
 *   un clip, no sabe si existe y no hay forma de ver el mapa completo.
 *
 *   Este modulo junta las tres listas en FILAS y marca las que no conectan. Es
 *   la fuente de datos de la ventana del editor (ui/AnimEditor.js).
 *
 * QUE NO ES
 *   No es el frame data del combate. Las tres frases de la barra (STARTUP /
 *   ACTIVE / RECOVERY) son una particion EDITABLE de la duracion para recorrer
 *   la animacion; el motor sigue usando `MoveTable`/`framedata.js` para las
 *   fases reales de golpe. La ventana lo dice para no inducir a error.
 * ============================================================================
 */

import { ANIMATIONS } from '../../ui/selectAnims.js';

/**
 * `selectAnims` no pide nombres de clip: pide nombres de ESTADO (`IDLE`,
 * `LIGHT_1`, `REVERSE_KICK`...). El motor los entiende, la biblioteca de clips
 * no. Esta tabla es el traductor explicito para que el editor pueda mostrar la
 * animacion REAL que corresponde a cada fila del mapa.
 *
 * Esta en este archivo y no en Engine.js por la misma razon que el mapa: es un
 * dato que se puede probar en Node, y si el nombre de un clip cambia, la prueba
 * lo tiene que decir antes de abrir el navegador.
 */
export const ALIAS_CLIP = Object.freeze({
    IDLE: 'idle',
    TAUNT: 'idle',
    WALK: 'walk',
    LIGHT_1: 'st_recto',
    HEAVY_2: 'st_gancho',
    UPPERCUT: 'st_uppercut',
    DASH_SIDE: 'dash_side',
    KICK_HIGH: 'sp_patada_frontal',
    KICK_LOW: 'st_patada_baja',
    SUBMISSION: 'rv_sumision',
    JUMP: 'jump',
    QUADRUPED: 'quad',
    SLIDE: 'slide',
    REVERSE_KICK: 'sp_patada_giro',
    BOTTLE: 'sp_botellazo',
    PROJECTION: 'rv_proyeccion',
    ARM_LOCK: 'rv_agarre_gancho',
    LEG_LOCK: 'rv_agarre_pie'
});

/** El nombre de clip que realmente se le pide al motor. */
export function clipEfectivo(clip) {
    if (!clip) return clip;
    return ALIAS_CLIP[clip] || clip;
}

/** Las tres frases de una barra de animacion. */
export const FASES = Object.freeze(['STARTUP', 'ACTIVE', 'RECOVERY']);

/** Reparto inicial. Suma 1 y siempre se mantiene sumando 1 al editar. */
export const FASES_DEFECTO = Object.freeze({
    STARTUP: 0.20, ACTIVE: 0.20, RECOVERY: 0.60
});

function num(v, defecto = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : defecto;
}

/** Copia una animacion a una fila plana, sin tocar el original congelado. */
function filaDeAnimacion(a, idFallback) {
    const a2 = a || {};
    return {
        id: a2.id || idFallback || '',
        nombre: a2.nombre || a2.id || idFallback || '',
        tipo: a2.tipo || '',
        clip: a2.clip || '',
        dur: num(a2.dur, 0),
        pes: num(a2.pes, 0)
    };
}

function listaDeAnimaciones(animaciones) {
    if (Array.isArray(animaciones)) return animaciones.map((a, i) => filaDeAnimacion(a, String(i)));
    const fuente = animaciones || ANIMATIONS;
    return Object.keys(fuente).sort().map((k) => filaDeAnimacion(fuente[k], k));
}

/**
 * Construye el mapa.
 *
 * @param {object} [opts]
 *   animaciones  objeto o array de animaciones (por defecto, `ANIMATIONS`)
 *   biblioteca   biblioteca procedural; se usa solo para leer fichas
 *   nombresClip  nombres de clips admitidos (GLB incluidos)
 * @returns {{filas: object[], nombresClip: string[], total: number}}
 */
export function buildClipMap(opts = {}) {
    const filas = listaDeAnimaciones(opts.animaciones);
    const bib = opts.biblioteca || null;
    const nombresClip = Array.isArray(opts.nombresClip)
        ? Array.from(new Set(opts.nombresClip.filter((n) => typeof n === 'string' && n))).sort()
        : (bib ? Object.keys(bib).sort() : []);

    for (const fila of filas) {
        // `fila.clip` sigue siendo lo que pide selectAnims (para no mentir sobre
        // la tabla original). `clipReal` es lo que se reproduce de verdad.
        fila.clipReal = clipEfectivo(fila.clip);
        fila.esAlias = fila.clipReal !== fila.clip;
        const ficha = bib && bib[fila.clipReal] ? Object.assign({}, bib[fila.clipReal]) : null;
        fila.ficha = ficha;
        fila.clipEnBiblioteca = !!ficha;
        fila.durClip = ficha ? num(ficha.dur, 0) : 0;
        fila.fases = Object.assign({}, FASES_DEFECTO);
        if (ficha && num(ficha.commitment, 0) > 0) {
            // Solo una pista visual: los clips con mas compromiso tienen mas
            // recovery. No sustituye al frame data real del combate.
            const c = Math.min(1, Math.max(0, num(ficha.commitment)));
            fila.fases = {
                STARTUP: +(0.35 - c * 0.15).toFixed(3),
                ACTIVE: +(0.25 - c * 0.05).toFixed(3),
                RECOVERY: +(0.40 + c * 0.20).toFixed(3)
            };
        }
        fila.aviso = ficha ? null : 'el clip pedido no existe en la biblioteca';
    }

    return { filas, nombresClip, total: filas.length };
}

/** La fila con ese id, o null. */
export function porId(mapa, id) {
    if (!mapa || !Array.isArray(mapa.filas)) return null;
    return mapa.filas.find((f) => f.id === id) || null;
}

/** Indice de una fila, o -1. */
export function indiceDe(mapa, id) {
    if (!mapa || !Array.isArray(mapa.filas)) return -1;
    return mapa.filas.findIndex((f) => f.id === id);
}

/**
 * Fila vecina, con vuelta al principio/final. Así las flechas del teclado
 * recorren el mapa sin quedarse clavadas en un extremo.
 */
export function vecino(mapa, id, delta = 1) {
    const filas = mapa && mapa.filas;
    if (!filas || !filas.length) return null;
    const i = indiceDe(mapa, id);
    if (i < 0) return filas[0];
    const n = filas.length;
    return filas[((i + delta) % n + n) % n];
}

/** En que frase cae el instante `t` (0..1) de una fila. */
export function faseEn(fila, t) {
    const f = (fila && fila.fases) || FASES_DEFECTO;
    const v = Math.min(1, Math.max(0, num(t, 0)));
    if (v < num(f.STARTUP, 0)) return 'STARTUP';
    if (v < num(f.STARTUP, 0) + num(f.ACTIVE, 0)) return 'ACTIVE';
    return 'RECOVERY';
}

/** Duracion en segundos de una frase de la fila. */
export function segundosDeFase(fila, fase) {
    const f = (fila && fila.fases) || FASES_DEFECTO;
    const p = num(f[fase], 0);
    // Las animaciones de bucle (guardia, caminar) declaran dur: 0: duran lo que
    // dure el bucle. Para esas se usa la duracion de la ficha del clip, si hay.
    const dur = num(fila && fila.dur, 0) > 0 ? num(fila.dur) : num(fila && fila.durClip, 0);
    return Math.max(0, dur * p);
}

/** Cuantas filas conectan y cuantas no. */
export function resumen(mapa) {
    const filas = (mapa && mapa.filas) || [];
    let conClip = 0;
    for (const f of filas) if (f.clipEnBiblioteca) conClip++;
    return {
        total: filas.length,
        conClip,
        sinClip: filas.length - conClip,
        conFicha: filas.filter((f) => !!f.ficha).length,
        sinFicha: filas.filter((f) => !f.ficha).length
    };
}

/** Las filas que no conectan: la lista de trabajo del mapa. */
export function avisos(mapa) {
    return ((mapa && mapa.filas) || []).filter((f) => !!f.aviso);
}

export default {
    ALIAS_CLIP, clipEfectivo, FASES, FASES_DEFECTO, buildClipMap, porId,
    indiceDe, vecino, faseEn, segundosDeFase, resumen, avisos
};
