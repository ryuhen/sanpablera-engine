/**
 * ============================================================================
 * SANPABLERA ENGINE · core/anim/ClipEditor.js
 * ----------------------------------------------------------------------------
 * ESTADO EDITABLE del mapa de animaciones. Sin Babylon, sin DOM, sin azar.
 *
 * La biblioteca de clips y la tabla de animaciones son `Object.freeze`: no se
 * pueden tocar. Este modulo mantiene una COPIA editable y produce un PARCHE con
 * solo lo que cambio, para que la ventana pueda ajustar una animacion a la vez
 * y exportar el resultado sin ensuciar las tablas del motor.
 *
 * Las fases siempre suman 1: al subir una, las otras dos bajan proporcion-
 * almente. Si no, la barra del mapa mentiria y el scrubber marcaria una frase
 * que no existe.
 * ============================================================================
 */

import {
    FASES, buildClipMap, vecino, faseEn, segundosDeFase, clipEfectivo
} from './ClipMap.js';

const LIMITE = Object.freeze({
    dur: Object.freeze({ min: 0.05, max: 10, paso: 0.05 }),
    pes: Object.freeze({ min: 0, max: 20, paso: 1 }),
    fase: Object.freeze({ min: 0.02, max: 0.96, paso: 0.05 })
});

function num(v, defecto = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : defecto;
}

function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
}

/** Copia profunda de una fila (las fases son el unico objeto anidado). */
export function clonFila(f) {
    if (!f) return null;
    return Object.assign({}, f, { fases: Object.assign({}, f.fases || {}) });
}

/**
 * Crea el estado del editor.
 *
 * @param {object} [opts] Igual que `buildClipMap`, mas:
 *   mapa       mapa ya construido (tiene prioridad)
 *   seleccion  id de la animacion seleccionada al abrir
 */
export function createClipEditor(opts = {}) {
    const mapa = opts.mapa || buildClipMap(opts);
    const filas = mapa.filas.map(clonFila);
    const originales = Object.create(null);
    for (const f of filas) originales[f.id] = clonFila(f);
    return {
        filas,
        originales,
        nombresClip: Array.isArray(mapa.nombresClip) ? mapa.nombresClip.slice() : [],
        seleccionId: opts.seleccion || (filas[0] && filas[0].id) || null,
        faseActiva: 'STARTUP',
        t: 0,
        reproduciendo: false,
        velocidad: 1,
        undo: [],
        redo: []
    };
}

/** La fila seleccionada. */
export function seleccion(editor) {
    if (!editor) return null;
    return editor.filas.find((f) => f.id === editor.seleccionId) || null;
}

/** Selecciona por id. Devuelve la fila o null. */
export function seleccionar(editor, id) {
    if (!editor) return null;
    const f = editor.filas.find((x) => x.id === id);
    if (!f) return null;
    editor.seleccionId = id;
    editor.t = 0;
    editor.faseActiva = 'STARTUP';
    return f;
}

/** Mueve la seleccion con vuelta al otro extremo. */
export function mover(editor, delta = 1) {
    if (!editor || !editor.filas.length) return null;
    const mapa = { filas: editor.filas };
    const destino = vecino(mapa, editor.seleccionId, delta);
    return seleccionar(editor, destino && destino.id);
}

/** Cambia la frase que editan los botones +/-. */
export function ponerFaseActiva(editor, fase) {
    if (!editor || FASES.indexOf(fase) === -1) return false;
    editor.faseActiva = fase;
    return true;
}

/** Valor de un campo de la fila seleccionada. */
export function campoValor(editor, campo) {
    const f = seleccion(editor);
    if (!f || !campo) return null;
    if (campo === 'fase') return editor.faseActiva;
    if (campo.indexOf('fases.') === 0) {
        const fase = campo.slice(6);
        return num(f.fases && f.fases[fase], 0);
    }
    return f[campo] === undefined ? null : f[campo];
}

function guardar(editor) {
    const f = seleccion(editor);
    if (!f) return null;
    const copia = clonFila(f);
    editor.undo.push(copia);
    if (editor.undo.length > 100) editor.undo.shift();
    editor.redo.length = 0;
    return copia;
}

/**
 * Reparte el resto de las fases entre las otras dos, proporcionalmente, para
 * que la suma siga siendo 1. Si las dos estan a cero, se reparten a medias.
 */
function redistribuir(fases, faseEditada) {
    const otras = FASES.filter((f) => f !== faseEditada);
    const objetivo = 1 - num(fases[faseEditada], 0);
    const suma = otras.reduce((s, f) => s + Math.max(0, num(fases[f], 0)), 0);
    for (const f of otras) {
        fases[f] = suma > 0
            ? +(objetivo * Math.max(0, num(fases[f], 0)) / suma).toFixed(4)
            : +(objetivo / otras.length).toFixed(4);
    }
    // Redondeo: el ultimo recoge el centesimo que sobra para que la suma sea 1.
    const ultima = otras[otras.length - 1];
    fases[ultima] = +(fases[ultima] + (1 - FASES.reduce((s, f) => s + fases[f], 0))).toFixed(4);
}

/**
 * Ajusta un campo de la animacion seleccionada.
 *
 * @param {string} campo  `dur`, `pes`, `fase`, `fases.STARTUP`...
 * @param {number} delta  incremento (o valor absoluto con `abs:true`)
 * @returns {{ok:boolean, valor:*, campo:string}}
 */
export function ajustar(editor, campo, delta = 0, opciones = {}) {
    const f = seleccion(editor);
    if (!f || !campo) return { ok: false, valor: null, campo };

    if (campo === 'fase' || campo.indexOf('fases.') === 0) {
        const fase = campo === 'fase' ? editor.faseActiva : campo.slice(6);
        if (FASES.indexOf(fase) === -1) return { ok: false, valor: null, campo };
        guardar(editor);
        const limite = LIMITE.fase;
        const anterior = num(f.fases[fase], 0);
        const valor = clamp(opciones.abs ? num(delta, anterior)
            : anterior + num(delta, 0) * num(opciones.paso, limite.paso),
            limite.min, limite.max);
        f.fases[fase] = +valor.toFixed(4);
        redistribuir(f.fases, fase);
        return { ok: true, valor: f.fases[fase], campo: 'fases.' + fase };
    }

    const limite = LIMITE[campo];
    if (!limite) return { ok: false, valor: null, campo };
    guardar(editor);
    const anterior = num(f[campo], 0);
    const paso = num(opciones.paso, limite.paso);
    const valor = clamp(opciones.abs ? num(delta, anterior) : anterior + num(delta, 0) * paso,
        limite.min, limite.max);
    f[campo] = campo === 'dur' ? +valor.toFixed(3) : Math.round(valor);
    return { ok: true, valor: f[campo], campo };
}

/** Cambia el clip al que apunta la animacion seleccionada. */
export function ciclarClip(editor, delta = 1) {
    const f = seleccion(editor);
    const nombres = editor && editor.nombresClip;
    if (!f || !nombres || !nombres.length) return null;
    guardar(editor);
    const i = nombres.indexOf(f.clip);
    const n = nombres.length;
    const j = i < 0 ? (delta > 0 ? 0 : n - 1) : ((i + delta) % n + n) % n;
    f.clip = nombres[j];
    f.clipReal = clipEfectivo(f.clip);
    f.esAlias = f.clipReal !== f.clip;
    f.clipEnBiblioteca = true;
    f.aviso = null;
    return f;
}

/** deshacer / rehacer por instantaneas de la fila. */
export function deshacer(editor) {
    if (!editor || !editor.undo.length) return false;
    const actual = seleccion(editor);
    if (actual) editor.redo.push(clonFila(actual));
    const previa = editor.undo.pop();
    const i = editor.filas.findIndex((f) => f.id === previa.id);
    if (i >= 0) editor.filas[i] = clonFila(previa);
    editor.seleccionId = previa.id;
    return true;
}

export function rehacer(editor) {
    if (!editor || !editor.redo.length) return false;
    const actual = seleccion(editor);
    if (actual) editor.undo.push(clonFila(actual));
    const siguienteFila = editor.redo.pop();
    const i = editor.filas.findIndex((f) => f.id === siguienteFila.id);
    if (i >= 0) editor.filas[i] = clonFila(siguienteFila);
    editor.seleccionId = siguienteFila.id;
    return true;
}

/** Coloca el cabezal. Se acepta 0..1 y se recorta. */
export function tiempo(editor, t) {
    if (!editor) return 0;
    editor.t = clamp(num(t, 0), 0, 1);
    return editor.t;
}

/** Avanza el cabezal si esta reproduciendo. Devuelve la lectura actual. */
export function avanzar(editor, dt = 0) {
    if (!editor) return null;
    if (editor.reproduciendo) {
        const f = seleccion(editor);
        const dur = f && f.dur > 0 ? f.dur : 1;
        editor.t = (editor.t + (num(dt, 0) * num(editor.velocidad, 1) / dur)) % 1;
    }
    return lectura(editor);
}

/** Todo lo que la ventana necesita para pintar el instante actual. */
export function lectura(editor) {
    const f = seleccion(editor);
    if (!f) return null;
    return {
        id: f.id,
        nombre: f.nombre,
        clip: f.clip,
        clipReal: f.clipReal || clipEfectivo(f.clip),
        esAlias: !!f.esAlias,
        t: editor.t,
        fase: faseEn(f, editor.t),
        segundos: editor.t * f.dur,
        segundosFase: segundosDeFase(f, faseEn(f, editor.t)),
        dur: f.dur,
        reproduciendo: !!editor.reproduciendo
    };
}

/** Alterna reproduccion. */
export function togglePlay(editor) {
    if (!editor) return false;
    editor.reproduciendo = !editor.reproduciendo;
    return editor.reproduciendo;
}

function distinto(a, b) {
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) > 1e-6;
    return a !== b;
}

/** Cuantas animaciones tienen algun cambio. */
export function cambios(editor) {
    if (!editor) return 0;
    let n = 0;
    for (const f of editor.filas) {
        const o = editor.originales[f.id];
        if (!o) continue;
        if (distinto(f.clip, o.clip) || distinto(f.dur, o.dur) || distinto(f.pes, o.pes)
            || FASES.some((fase) => distinto(f.fases[fase], o.fases[fase]))) n++;
    }
    return n;
}

/** Solo lo que cambio, en forma de parche serializable. */
export function parche(editor) {
    const salida = { version: 1, animaciones: {} };
    if (!editor) return salida;
    for (const f of editor.filas) {
        const o = editor.originales[f.id];
        if (!o) continue;
        const cambio = {};
        if (distinto(f.clip, o.clip)) cambio.clip = f.clip;
        if (distinto(f.dur, o.dur)) cambio.dur = f.dur;
        if (distinto(f.pes, o.pes)) cambio.pes = f.pes;
        for (const fase of FASES) {
            if (distinto(f.fases[fase], o.fases[fase])) {
                cambio.fases = Object.assign({}, cambio.fases);
                cambio.fases[fase] = f.fases[fase];
            }
        }
        if (Object.keys(cambio).length) salida.animaciones[f.id] = cambio;
    }
    return salida;
}

/** El parche como texto, listo para el portapapeles o un fichero. */
export function exportar(editor) {
    return JSON.stringify(parche(editor), null, 2);
}

/** Aplica un parche (objeto o texto). Devuelve cuantas filas cambio. */
export function importar(editor, datos) {
    if (!editor) return 0;
    let obj = datos;
    if (typeof datos === 'string') {
        try { obj = JSON.parse(datos); } catch (_) { return 0; }
    }
    if (!obj || typeof obj !== 'object' || !obj.animaciones) return 0;
    let n = 0;
    for (const id of Object.keys(obj.animaciones)) {
        const f = editor.filas.find((x) => x.id === id);
        const cambio = obj.animaciones[id];
        if (!f || !cambio || typeof cambio !== 'object') continue;
        guardar(editor);
        if (typeof cambio.clip === 'string') {
            f.clip = cambio.clip;
            f.clipReal = clipEfectivo(f.clip);
            f.esAlias = f.clipReal !== f.clip;
        }
        if (cambio.dur !== undefined) f.dur = clamp(num(cambio.dur, f.dur), LIMITE.dur.min, LIMITE.dur.max);
        if (cambio.pes !== undefined) f.pes = clamp(num(cambio.pes, f.pes), LIMITE.pes.min, LIMITE.pes.max);
        if (cambio.fases) {
            for (const fase of FASES) {
                if (cambio.fases[fase] !== undefined) f.fases[fase] = num(cambio.fases[fase], f.fases[fase]);
            }
        }
        n++;
    }
    return n;
}

/** Problemas del mapa, para enseñarlos en la ventana. */
export function validar(editor) {
    const salida = [];
    if (!editor) return salida;
    for (const f of editor.filas) {
        if (!f.clip) salida.push({ id: f.id, mensaje: 'sin clip asignado' });
        else {
            const real = f.clipReal || clipEfectivo(f.clip);
            if (editor.nombresClip.indexOf(real) === -1 && !f.clipEnBiblioteca) {
                salida.push({ id: f.id, mensaje: 'clip desconocido: ' + f.clip });
            }
        }
        if (!(f.dur > 0)) salida.push({ id: f.id, mensaje: 'duracion no positiva' });
        const suma = FASES.reduce((s, fase) => s + num(f.fases[fase], 0), 0);
        if (Math.abs(suma - 1) > 1e-3) {
            salida.push({ id: f.id, mensaje: 'las fases suman ' + suma.toFixed(3) });
        }
    }
    return salida;
}

export default {
    LIMITE, createClipEditor, clonFila, seleccion, seleccionar, mover,
    ponerFaseActiva, campoValor, ajustar, ciclarClip, deshacer, rehacer,
    tiempo, avanzar, lectura, togglePlay, cambios, parche, exportar,
    importar, validar
};
