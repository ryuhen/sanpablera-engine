/**
 * ============================================================================
 * SANPABLERA ENGINE · CustomFighter.js
 * ----------------------------------------------------------------------------
 * EL PELEADOR DEL JUGADOR: un peleador hecho por el jugador que
 * se guarda en la memoria local DEL EQUIPO DONDE JUEGA
 * (localStorage del navegador). No necesita cuenta: el nombre,
 * el estilo base que hereda y los colores sobreviven a cerrar
 * el juego en esa misma máquina.
 *
 * EL MODELO "UN PERSONAJE DEL JUEGO CON TU NOMBRE"
 *   El peleador personalizado puede heredar el moveset de un
 *   peleador del juego (campo `baseId`): asi el jugador tiene
 *   "un personaje del juego con su nombre" mientras el editor
 *   de movesets propio llega. Con `baseId` vacío usa el set
 *   base del motor (los golpes comunes de CORE_MOVES).
 *
 * LA NUBE (FUTURO)
 *   El servicio en la nube lo hará subapase y será un sistema
 *   de membresía: la partida local es la que mientras tanto,
 *   y lo que se guarda aquí es lo que el jugador tiene sin
 *   pagar. Ver Specs.txt, sección de características técnicas.
 *
 * POR QUE ES UN MODULO aparte
 *   El roster es dato estático; el peleador del jugador es
 *   dato VIVO (se renombra, se guarda). Separarlo deja al
 *   roster puro y al guardado testeable (localStorage se
 *   puede stubear en Node).
 * ============================================================================
 */

const STORAGE_KEY = 'sanpablera.customFighter';

/** Nombre mas largo permitido (celda del panal). */
export const NAME_MAX = 24;

const DEFAULT_CUSTOM = Object.freeze({
    name: 'Mi Peleador',
    tag: 'Hecho por ti',
    // characterId del juego cuyo moveset hereda (null = base).
    baseId: null,
    rgb: [0.75, 0.55, 0.95],
    hex: '#bf8cf2',
    story: 'Aún no tiene historia: la escribe quien lo maneja. De momento viene con lo básico y muchas ganas.',
    style: 'Base del motor (por definir)'
});

/** ¿Hay almacenamiento local? (Node y algunos entornos: no). */
function storage() {
    try {
        if (typeof localStorage === 'undefined') return null;
        const probe = '__sanpablera_probe__';
        localStorage.setItem(probe, '1');
        localStorage.removeItem(probe);
        return localStorage;
    } catch (err) {
        return null;
    }
}

/**
 * Lee el peleador personalizado. Si no hay nada guardado (o no
 * hay almacenamiento), devuelve el defecto: el juego siempre
 * puede arrancar.
 */
export function loadCustomFighter() {
    const ls = storage();
    if (!ls) return { ...DEFAULT_CUSTOM };
    try {
        const raw = ls.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULT_CUSTOM };
        const data = JSON.parse(raw);
        return Object.assign({}, DEFAULT_CUSTOM, data, { baseId: data.baseId || null });
    } catch (err) {
        return { ...DEFAULT_CUSTOM };
    }
}

/** Guarda el peleador personalizado. Devuelve false si no hay dónde. */
export function saveCustomFighter(data) {
    const ls = storage();
    if (!ls) return false;
    try {
        ls.setItem(STORAGE_KEY, JSON.stringify(Object.assign({}, data, { id: 'CUSTOM' })));
        return true;
    } catch (err) {
        return false;
    }
}

/**
 * Renombra el peleador. Devuelve el peleador ya renombrado (y
 * guardado) o null si el nombre queda vacío.
 */
export function renameCustomFighter(name) {
    const clean = String(name == null ? '' : name).trim().slice(0, NAME_MAX);
    if (!clean) return null;
    const fighter = loadCustomFighter();
    fighter.name = clean;
    saveCustomFighter(fighter);
    return fighter;
}

/** Cambia el estilo base que hereda (characterId del juego o null). */
export function setCustomBase(characterId) {
    const fighter = loadCustomFighter();
    fighter.baseId = characterId || null;
    saveCustomFighter(fighter);
    return fighter;
}

/**
 * La entrada de roster del peleador personalizado: lo que la
 * pantalla de selección muestra. `custom: true` la distingue.
 */
export function customRosterSlot() {
    const data = loadCustomFighter();
    return {
        id: 'CUSTOM',
        name: data.name,
        tag: data.tag,
        characterId: data.baseId || 'CUSTOM',
        rgb: data.rgb,
        hex: data.hex,
        story: data.story,
        style: data.style,
        custom: true
    };
}

export default {
    loadCustomFighter, saveCustomFighter, renameCustomFighter,
    setCustomBase, customRosterSlot, NAME_MAX, STORAGE_KEY
};
