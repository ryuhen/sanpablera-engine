/**
 * ============================================================================
 * SANPABLERA ENGINE · ui/ControlsSettings.js
 * ----------------------------------------------------------------------------
 * MAPEO DE TECLADO Y MANDO, CON GUARDADO.
 *
 * QUE HAY AQUI
 * ----------------------------------------------------------------------------
 *   Un unico sitio donde vive "que tecla hace que". Por defecto es un layout
 *   de pelea (WASD para moverse, J/K de golpes, L de guardia, U de accion),
 *   pero TODO es reconfigurable y se guarda en localStorage, asi que cada
 *   quien juega con su teclado.
 *
 *   El mapa se expresa como ACCIONES -> lista detecodes. La direccion se
 *   guarda en el mismo plano que el InputMapper ya entiende: up/down/left/
 *   right mas las diagonales, de modo que teclado y mando escriben en la
 *   MISMA estructura y el router no tiene que distinguirlos.
 *
 *   Se guarda bajo 'sanpablera.controles.v1' con merge superficial: si una
 *   version futura anade acciones, un guardado viejo no las pisa.
 * ============================================================================
 */

/** Acciones de movimiento (las diagonales las deriva el router). */
export const MOVE_ACTIONS = ['up', 'down', 'left', 'right'];

/** Acciones de combate. */
export const FIGHT_ACTIONS = ['attack1', 'attack2', 'block', 'action'];

/** Todas las acciones, en el orden en que se muestran en el menu. */
export const ALL_ACTIONS = [...MOVE_ACTIONS, ...FIGHT_ACTIONS];

/** Etiquetas en espanol para el menu de configuracion. */
export const ACTION_LABELS = {
    up: 'Arriba',
    down: 'Abajo',
    left: 'Izquierda',
    right: 'Derecha',
    attack1: 'Golpe ligero',
    attack2: 'Golpe pesado',
    block: 'Guardia',
    action: 'Accion'
};

/**
 * Layout por defecto. Peleador, no WASD de RPG: los golpes estan juntos en la
 * fila J/K/L/U para que la mano derecha no se mueva.
 */
export const DEFAULT_BINDINGS = {
    up: ['KeyW', 'ArrowUp'],
    down: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    attack1: ['KeyJ'],
    attack2: ['KeyK'],
    block: ['KeyL'],
    action: ['KeyU']
};

/** Layout por defecto del MANDO (botones estandar del Gamepad API). */
export const DEFAULT_PAD = {
    up: [12],              // dpad arriba
    down: [13],
    left: [14],
    right: [15],
    attack1: [0],          // A / cruz
    attack2: [2],          // X / cuadrado
    block: [6],            // LT / gatillo izquierdo
    action: [1]            // B / circulo
};

/**
 * Empareja cada codigo de teclado con la etiqueta que lo describe. Para leer
 * event.code ('KeyJ') esto es lo unico que hay; el `key` puede depender del
 * idioma del teclado.
 */
export function keyLabel(code) {
    if (!code) return '--';
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
    switch (code) {
        case 'ArrowUp': return 'Arriba';
        case 'ArrowDown': return 'Abajo';
        case 'ArrowLeft': return 'Izq';
        case 'ArrowRight': return 'Der';
        case 'Space': return 'Espacio';
        case 'ShiftLeft': case 'ShiftRight': return 'Shift';
        case 'ControlLeft': case 'ControlRight': return 'Ctrl';
        case 'AltLeft': case 'AltRight': return 'Alt';
        case 'Enter': return 'Enter';
        case 'Tab': return 'Tab';
        case 'Escape': return 'Esc';
        case 'Backspace': return 'Borrar';
        default: return code;
    }
}

/** Etiqueta de un boton del mando por su indice. */
export function padLabel(index) {
    const standard = {
        0: 'A', 1: 'B', 2: 'X', 3: 'Y',
        4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT',
        8: 'Select', 9: 'Start',
        10: 'L3', 11: 'R3', 12: 'Dpad ^', 13: 'Dpad v',
        14: 'Dpad <', 15: 'Dpad >'
    };
    return standard[index] != null ? standard[index] : 'B' + index;
}

const STORAGE_KEY = 'sanpablera.controles.v1';

function safeStorage() {
    try {
        if (typeof localStorage === 'undefined') return null;
        const probe = '__spf_probe__';
        localStorage.setItem(probe, '1');
        localStorage.removeItem(probe);
        return localStorage;
    } catch (e) {
        // Modo privado de algunos navegadores: se juega igual, sin guardar.
        return null;
    }
}

/** Clona el layout por defecto sin que el llamante pueda tocar el original. */
function freshDefaults() {
    const out = {};
    for (const a of ALL_ACTIONS) out[a] = DEFAULT_BINDINGS[a].slice();
    return out;
}

/**
 * Carga los mapeos guardados. Si no hay nada, devuelve los de por defecto.
 * Cualquier guardado corrupto (no-objeto, accion desconocida) se descarta y
 * se vuelve al layout bueno: es preferible un mapeo raro a una pantalla rota.
 */
export function loadBindings() {
    const defs = freshDefaults();
    const store = safeStorage();
    if (!store) return defs;

    let raw = null;
    try { raw = store.getItem(STORAGE_KEY); } catch (e) { return defs; }
    if (!raw) return defs;

    let data;
    try { data = JSON.parse(raw); } catch (e) { return defs; }
    if (!data || typeof data !== 'object') return defs;

    const out = {};
    for (const a of ALL_ACTIONS) {
        const saved = data[a];
        out[a] = (Array.isArray(saved) && saved.every(c => typeof c === 'string'))
            ? saved.slice()
            : defs[a];
    }
    return out;
}

/** Guarda el mapa. Devuelve false si no se pudo (sin localStorage). */
export function saveBindings(map) {
    const store = safeStorage();
    if (!store) return false;
    const clean = {};
    for (const a of ALL_ACTIONS) {
        clean[a] = Array.isArray(map[a]) ? map[a].slice() : [];
    }
    try {
        store.setItem(STORAGE_KEY, JSON.stringify(clean));
        return true;
    } catch (e) {
        return false;
    }
}

/** Vuelve al layout de por defecto. No guarda: solo devuelve el mapa. */
export function defaultBindings() {
    return freshDefaults();
}

/**
 * Invierte el mapa para consultar "que accion dispara este codigo" en O(1) al
 * montar los listeners, en vez de recorrer 8 listas en cada tecla.
 * @returns {Map<string, string[]>} codigo -> acciones
 */
export function buildCodeIndex(map) {
    const idx = new Map();
    for (const action of ALL_ACTIONS) {
        for (const code of (map[action] || [])) {
            if (!idx.has(code)) idx.set(code, []);
            idx.get(code).push(action);
        }
    }
    return idx;
}

/** Lo mismo para el mando: indice de boton -> acciones. */
export function buildPadIndex(map) {
    const idx = new Map();
    for (const action of ALL_ACTIONS) {
        for (const btn of (map[action] || [])) {
            if (!idx.has(btn)) idx.set(btn, []);
            idx.get(btn).push(action);
        }
    }
    return idx;
}

/**
 * Quita una tecla de todas las acciones donde ya este. Hace que el menu sea
 * "una tecla, una accion" sin dejar duplicados silenciosos.
 * @returns el mapa mutado, para encadenar
 */
export function claimCode(map, code, forAction) {
    for (const a of ALL_ACTIONS) {
        if (a === forAction) continue;
        const i = map[a].indexOf(code);
        if (i !== -1) map[a].splice(i, 1);
    }
    // Esta accion se queda SOLO con esa tecla.
    map[forAction] = [code];
    return map;
}

export default {
    MOVE_ACTIONS, FIGHT_ACTIONS, ALL_ACTIONS, ACTION_LABELS,
    DEFAULT_BINDINGS, DEFAULT_PAD, keyLabel, padLabel,
    loadBindings, saveBindings, defaultBindings,
    buildCodeIndex, buildPadIndex, claimCode
};
