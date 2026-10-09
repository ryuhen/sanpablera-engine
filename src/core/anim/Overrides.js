/**
 * ============================================================================
 * SANPABLERA ENGINE · anim/Overrides.js
 * ----------------------------------------------------------------------------
 * LA CAPA DE OVERRIDE: la capa que hace que las tablas congeladas se puedan
 * editar en caliente desde el navegador.
 * ----------------------------------------------------------------------------
 * POR QUE ESTE ARCHIVO EXISTE
 *   Las tablas de animacion son `Object.freeze` a proposito: son datos puros,
 *   se testean en Node y no se tocan en runtime. Eso las hace seguras... y
 *   tambien las hace ineditables desde fuera. Para probar "y si el jab llega
 *   4 cm mas" habia que abrir el fichero, cambiar un numero, recargar y
 *   repetir, unas veinte veces por ajuste.
 *
 * QUE HACE
 *   Guarda un parche (`ruta -> valor`) y ofrece `merge()`, que devuelve una
 *   COPIA de la tabla original con el parche aplicado. La tabla original no se
 *   toca: el parche vive encima.
 *
 * POR QUE UNA COPIA Y NO MUTAR LA TABLA
 *   Las tablas estan deeply frozen. Descongelarlas en runtime significaria que
 *   el mismo objeto depende de si abriste el inspector o no, y un fallo en
 *   produccion seria irreproducible. Con la copia, si el inspector no se ha
 *   abierto nunca, `merge()` devuelve la tabla intacta y el motor se comporta
 *   exactamente igual que en las pruebas.
 *
 * MEMORIZACION
 *   `merge()` se llama UNA VEZ POR FRAME y por peleador. Sin cache, eso
 *   serían cientos de clones profundos por segundo. Se cachea por version: solo
 *   se vuelve a clonar cuando algo del parche ha cambiado de verdad.
 *
 * RUTAS
 *   Cadenas con puntos, sobre el nombre logico de la tabla:
 *     `ATTACK_SILHOUETTES.JAB.STAND.armL.active.2`
 *     `HIT_REACTIONS.ALTO.MEDIO.recover`
 *   Se leen de izquierda a derecha y el ultimo numero es el indice de un array
 *   (`active.2` = la tercera componente del objetivo).
 * ============================================================================
 */

// ===========================================================================
// EL PARCHE
// ===========================================================================

/**
 * ruta -> valor. Objeto plano a proposito: `Object.keys` da las rutas
 * modificadas en el orden en que se tocaron, que es lo que quiere ver quien
 * esta ajustando.
 */
const PATCH = Object.create(null);

/** Version del parche. Solo cambia cuando algo cambia de verdad. */
let VERSION = 0;

/** Tablas ya fusionadas, por nombre logico. */
const CACHE = Object.create(null);

/** Tablas originales, por nombre logico (se registran la primera vez). */
const BASE = Object.create(null);

// ===========================================================================
// ESCRIBIR
// ===========================================================================

/**
 * Fija un valor en una ruta. `undefined` la borra (vuelve al original).
 *
 * @param {string} path  `TABLA.clave.clave[.indice]`
 * @param {*} value
 * @returns {boolean} si el valor cambio de verdad
 */
export function setOverride(path, value) {
    if (typeof path !== 'string' || !path) return false;
    if (value === undefined) return clearOverride(path);
    const antes = PATCH[path];
    if (antes === value) return false;
    PATCH[path] = value;
    VERSION++;
    return true;
}

/** Borra una entrada del parche: el valor vuelve al de la tabla. */
export function clearOverride(path) {
    if (!(path in PATCH)) return false;
    delete PATCH[path];
    VERSION++;
    return true;
}

/** Borra todo el parche. */
export function clearAll() {
    const n = Object.keys(PATCH).length;
    if (!n) return 0;
    for (const k of Object.keys(PATCH)) delete PATCH[k];
    VERSION++;
    return n;
}

/** Reemplaza el parche entero (lo usa el `importar` del inspector). */
export function applyPatch(obj) {
    clearAll();
    if (!obj || typeof obj !== 'object') return 0;
    let n = 0;
    for (const k of Object.keys(obj)) {
        if (typeof obj[k] === 'number' || typeof obj[k] === 'string' || typeof obj[k] === 'boolean') {
            PATCH[k] = obj[k];
            n++;
        }
    }
    if (n) VERSION++;
    return n;
}

// ===========================================================================
// LEER
// ===========================================================================

/** Las rutas tocadas, en el orden en que se tocaron. */
export function listOverrides() {
    return Object.keys(PATCH).map((path) => ({ path, value: PATCH[path] }));
}

/** Cuantas rutas hay modificadas. */
export function overrideCount() {
    return Object.keys(PATCH).length;
}

/** El valor del parche en una ruta, o undefined si no hay. */
export function overrideAt(path) {
    return PATCH[path];
}

/** La version actual del parche (para cachear). */
export function version() {
    return VERSION;
}

/**
 * Parte una ruta en trozos. `active.2` son dos trozos: 'active' y '2'.
 * Un indice numerico se reconoce porque NO es un identificador valido.
 */
export function splitPath(path) {
    return String(path).split('.').filter((s) => s !== '');
}

// ===========================================================================
// FUSION
// ===========================================================================

/**
 * Copia profunda con un detalle importante.
 *
 * Se escribe a mano en vez de usar `structuredClone` o JSON por una razon
 * concreta: aqui solo hay numeros, cadenas y arrays, y esta copia conserva los
 * `undefined` (JSON no los conserva: un `hip: undefined` se COME la clave, y
 * una fila de la tabla a la que le falta un numero es un `NaN` que aparece tres
 * frames mas tarde).
 */
function deepClone(v) {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) {
        const out = new Array(v.length);
        for (let i = 0; i < v.length; i++) out[i] = deepClone(v[i]);
        return out;
    }
    const out = {};
    for (const k of Object.keys(v)) out[k] = deepClone(v[k]);
    return out;
}

/** Escribe `value` en la ruta de un objeto (creando lo que falte). */
function writePath(root, parts, value) {
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
        const k = parts[i];
        if (cur[k] === undefined || cur[k] === null || typeof cur[k] !== 'object') {
            cur[k] = /^\d+$/.test(parts[i + 1]) ? [] : {};
        }
        cur = cur[k];
    }
    cur[parts[parts.length - 1]] = value;
}

/** Lee el valor en la ruta de un objeto, o `undefined` si no llega. */
export function readPath(root, path) {
    const parts = splitPath(path);
    let cur = root;
    for (const k of parts) {
        if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
        cur = cur[k];
    }
    return cur;
}

/**
 * Registra una tabla con su nombre logico para poder parchearla.
 *
 * Se llama UNA vez por tabla, al importarla. Solo guarda la referencia: no la
 * clona todavia (el clon sale en el primer `merge`).
 */
export function registerTable(name, table) {
    if (BASE[name]) return false;
    BASE[name] = table;
    return true;
}

/**
 * La tabla con el parche aplicado. Cacheada por version.
 *
 * @param {string} name  nombre logico ('ATTACK_SILHOUETTES', ...)
 * @returns {object} la tabla (la ORIGINAL si no hay parche para ella)
 */
export function merge(name) {
    const base = BASE[name];
    if (!base) return null;

    // Cache: si la version no ha cambiado, se devuelve lo de antes. Es lo que
    // hace esto barato: sin parche, el primer merge clona y los siguientes son
    // un `return`.
    const c = CACHE[name];
    if (c && c.version === VERSION) return c.table;

    const MYPREFIX = name + '.';
    let hayAlgo = false;
    for (const path of Object.keys(PATCH)) {
        if (path.startsWith(MYPREFIX)) { hayAlgo = true; break; }
    }

    // Sin parche para esta tabla: se devuelve la original tal cual. Es lo que
    // mantiene el motor EXACTAMENTE igual que en las pruebas cuando el
    // inspector no esta abierto.
    const table = hayAlgo ? deepClone(base) : base;
    if (hayAlgo) {
        for (const path of Object.keys(PATCH)) {
            if (!path.startsWith(MYPREFIX)) continue;
            writePath(table, splitPath(path.slice(MYPREFIX.length)), PATCH[path]);
        }
    }
    CACHE[name] = { version: VERSION, table };
    return table;
}

/** Forget de la cache (solo para los tests). */
export function resetCache() {
    for (const k of Object.keys(CACHE)) delete CACHE[k];
    for (const k of Object.keys(BASE)) delete BASE[k];
    clearAll();
}

// ===========================================================================
// RANGOS Y UNIDADES (lo que necesita el inspector para poner los sliders)
// ===========================================================================

/**
 * El rango de un campo, por el NOMBRE del ultimo trozo de la ruta.
 *
 * POR QUE SE ADIVINA POR EL NOMBRE Y NO POR EL TIPO
 *   Todos los campos de estas tablas son numeros, asi que el tipo no dice nada.
 *   Lo que dice es para que sirve: una altura de cadera va de 0,2 a 1,0 m y
 *   un giro de 0 a 1,6 rad. Poner sliders de 0 a 1 para todo haria que
 *   ajustar la cadera fuera imposible (todo lo que hay por encima de 1 m es
 *   inalcanzable) y que un giro fuera mas preciso de lo que hace falta.
 *
 * `soft: true` marca los limites como DE REFERENCIA, no duros: el valor puede
 * salirse (a proposito, para explorar), pero el inspector avisa.
 */
export function rangeFor(path) {
    const parts = splitPath(path);
    const leaf = parts[parts.length - 1];
    const key = parts.length > 1 ? parts[parts.length - 2] : '';
    const esIndice = /^\d+$/.test(leaf);
    const campo = esIndice ? key : leaf;

    // --- EL MISMO NOMBRE, DOS UNIDADES -----------------------------------
    // `lean` es el unico nombre que significa dos cosas distintas:
    //   - dentro de un `spec` de silueta (Stances.js, boxing.js) son GRADOS:
    //     `lean: 6` son seis grados de inclinacion de torso, porque asi lo
    //     escribieron los que hicieron los stances y asi se lee en el papel.
    //   - dentro de los mods de locomocion (WALK/RUN/DASH) son RADIANES que se
    //     suman al `pitch` del golpe.
    // Un rango unico para las dos cosas haria que uno de los dos sea inusable:
    // con rango de grados, un radian ocupa medio pixel; con rango de radianes,
    // un grado se redondea a cero y el campo parece no hacer nada.
    //
    // Se distinguen por la RUTA, no por el valor, porque decidir por la
    // magnitud seria adivinar.
    if (campo === 'lean') {
        const enSpec = parts.indexOf('spec') !== -1;
        return enSpec
            ? { min: -20, max: 30, step: 0.5, unit: 'grados' }
            : { min: -0.6, max: 0.6, step: 0.005, unit: 'rad' };
    }

    switch (campo) {
        // --- alturas absolutas en metros ---
        case 'hip': return { min: 0.15, max: 1.05, step: 0.005, unit: 'm', soft: true };
        case 'hipY': return { min: 0.15, max: 1.05, step: 0.005, unit: 'm' };
        // --- objetivos de miembro: x lateral, y alto, z adelante ---
        case 'home': case 'startup': case 'active':
            if (esIndice) {
                const eje = ['x', 'y', 'z'][Number(leaf)] || 'x';
                return eje === 'y'
                    ? { min: -0.2, max: 1.7, step: 0.01, unit: 'm', soft: true }
                    : eje === 'z'
                        ? { min: -0.4, max: 1.3, step: 0.01, unit: 'm', soft: true }
                        : { min: -0.9, max: 0.9, step: 0.01, unit: 'm', soft: true };
            }
            return { min: -0.9, max: 1.7, step: 0.01, unit: 'm', soft: true };
        // --- objetivos de pie (en el suelo): la y baja de todo ---
        case 'legs':
            if (esIndice) {
                const eje = ['x', 'y', 'z'][Number(leaf)] || 'x';
                return eje === 'y'
                    ? { min: -0.1, max: 0.9, step: 0.01, unit: 'm' }
                    : { min: -0.9, max: 0.9, step: 0.01, unit: 'm' };
            }
            return { min: -0.9, max: 0.9, step: 0.01, unit: 'm' };
        // --- rotaciones en radianes ---
        case 'twist': case 'pitch': case 'yaw': case 'sp': case 'sy': case 'sr':
        case 'hp': case 'hy':
        case 'headPitch': case 'headPitchTarget': case 'spinePitch':
            return { min: -1.6, max: 1.6, step: 0.01, unit: 'rad' };
        case 'hipLift': case 'hipDrop':
            return { min: 0, max: 0.4, step: 0.005, unit: 'm' };
        // --- quanto tarda en recuperarse ---
        case 'recover': return { min: 0, max: 1, step: 0.01, unit: '' };
        // --- medidas de la tela ---
        case 'width': return { min: 0.05, max: 1.2, step: 0.01, unit: 'm' };
        case 'length': return { min: 0.05, max: 2.5, step: 0.01, unit: 'm' };
        case 'seedY': return { min: 0.3, max: 2, step: 0.01, unit: 'm' };
        case 'seedZ': return { min: -0.6, max: 0, step: 0.005, unit: 'm' };
        case 'back': return { min: 0, max: 0.5, step: 0.005, unit: 'm' };
        // --- propagacion del movimiento: amortiguacion y rigidez ---
        case 'damping': case 'stiffness': case 'bend': case 'shear':
        case 'drag': case 'groundFriction':
            return { min: 0, max: 1, step: 0.005, unit: '' };
        case 'iterations': case 'substeps':
            return { min: 1, max: 16, step: 1, unit: '' };
        case 'mass': return { min: 0.001, max: 0.5, step: 0.001, unit: 'kg' };
        // --- medidas del maniqui ---
        case 'r': case 'w': case 'h': case 'd':
            return { min: 0.005, max: 0.8, step: 0.005, unit: 'm' };
        // --- apertura y guardia -------------------------------------------
        // `guard` es un FACTOR (1 = guardia completa, 0 = manos en el suelo),
        // no una distancia: por eso va de 0 a 1,5 y no en metros. Los valores
        // reales llegan a 1,20 (SHELL), asi que el techo de 0,8 anterior dejaba
        // al slider de SHELL pegado al extremo con su valor real fuera de vista.
        case 'guard': return { min: 0, max: 1.5, step: 0.01, unit: 'x' };
        case 'spread': return { min: 0.1, max: 0.9, step: 0.005, unit: 'm' };
        case 'lead': return { min: -0.15, max: 0.6, step: 0.005, unit: 'm' };
        case 'open': return { min: -0.2, max: 0.8, step: 0.005, unit: '' };
        case 'crouch':
            // Cuanto se hunde la cadera respecto al reposo, en metros. El tope
            // es 0,7 porque la pierna mide 0,87: mas abajo de eso el personaje
            // esta sentado en el suelo.
            return { min: 0, max: 0.7, step: 0.005, unit: 'm' };
        default:
            return { min: -2, max: 2, step: 0.01, unit: '', soft: true };
    }
}

/**
 * Todas las rutas NUMERICAS de una tabla, para que el inspector sepa que
 * sliders ofrecer sin que haya que escribirlos a mano.
 *
 * Se recorren con un tope de profundidad: en estas tablas no hace falta bajar
 * mas de 5 niveles, y un tope evita que un descuido con un objeto ciclico
 * colgara el inspector.
 *
 * @returns {string[]} rutas con puntos
 */
export function numericPaths(root, prefix = '', depth = 0, out = []) {
    if (depth > 5 || root === null || typeof root !== 'object') return out;
    for (const k of Object.keys(root)) {
        const v = root[k];
        const path = prefix ? prefix + '.' + k : k;
        if (typeof v === 'number') {
            if (Number.isFinite(v)) out.push(path);
        } else if (typeof v === 'object') {
            numericPaths(v, path, depth + 1, out);
        }
    }
    return out;
}

// ===========================================================================
// EXPORTAR
// ===========================================================================

/**
 * El parche como objeto plano, listo para `applyPatch` o para descargarlo.
 */
export function exportPatch() {
    const out = {};
    for (const path of Object.keys(PATCH)) out[path] = PATCH[path];
    return out;
}

/**
 * El parche como codigo JS pegable en el fichero de origen.
 *
 * POR QUE TEXTO Y NO JSON
 *   El destino es un `.js` con los numeros puestos a mano entre lineas de
 *   comentario. Un JSON.stringify daria una linea de 4.000 caracteres que no se
 *   puede ni leer ni comparar en un diff. Aqui sale una linea por numero, con
 *   la ruta de comentario, que es justo como esta escrito el fichero.
 */
export function exportAsSource(header) {
    const rutas = Object.keys(PATCH);
    if (!rutas.length) return '// sin overrides\n';
    const out = [];
    if (header) out.push(header);
    let tablaActual = '';
    for (const r of rutas) {
        const tabla = r.split('.')[0];
        if (tabla !== tablaActual) {
            tablaActual = tabla;
            out.push('');
            out.push(`    // --- ${tabla} ---`);
        }
        out.push(`    // ${r}`);
        out.push(`    setOverride('${r}', ${PATCH[r]});`);
    }
    return out.join('\n') + '\n';
}

/** Serializa el parche a un fichero .json y lo descarga. */
export function downloadPatch(filename = 'sanpablera-overrides.json') {
    const texto = JSON.stringify(exportPatch(), null, 2);
    const blob = new Blob([texto], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Se revoca despues de un instante: si se revoca ya, algunos navegadores
    // cancelan la descarga.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return texto;
}

// ===========================================================================
// CONGELAR DE VERDAD
// ===========================================================================

/**
 * Congela un objeto y TODO lo que cuelga de el.
 *
 * POR QUE NO BASTA CON `Object.freeze(OBJETO)`
 *   `Object.freeze` solo congela las PROPIEDADES PROPIAS del objeto al que se
 *   le llama. Un `Object.freeze({ active: [1, 2, 3] })` deja el array
 *   perfectamente escribible: `t.active[2] = 99` funciona, en silencio, y
 *   cambia el comportamiento del motor para el resto del proceso.
 *
 *   Eso no es un detalle teorico: es exactamente lo que paso al escribir las
 *   primeras pruebas del inspector. Una prueba que "comprueba que la tabla esta
 *   congelada" escribio 99 en un array y las siguientes pruebas midieron una
 *   tabla corrompida en lugar de medir lo que creian. Un fallo de este tipo no
 *   sale en el log: sale en un numero raro tres pruebas mas alla.
 *
 * LA GUARDA DE SALIDA (POR QUE NO ES `isFrozen`)
 *   La version de esta funcion que se escribio primero hacia
 *       if (Object.isFrozen(v)) return v;
 *   para no recorrer dos veces el mismo objeto. Funcionaba... salvo que las
 *   tres tablas ya venían con un `Object.freeze` PUESTO EN EL CODIGO en su
 *   primer nivel, asi que la guarda cortaba la recursion en la raiz y los
 *   arrays de dentro seguian sin congelar. Justamente el agujero que venia a
 *   tapar. La guarda correcta es la de los VISTOS, que ademas cubre los
 *   ciclos.
 *
 * @param {*} v
 * @param {Set} [vistos]  objetos ya recorridos (para ciclos)
 * @returns {*} la misma cosa, congelada
 */
export function deepFreeze(v, vistos) {
    if (v === null || typeof v !== 'object') return v;
    const vistosSet = vistos || new Set();
    if (vistosSet.has(v)) return v;
    vistosSet.add(v);
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze(v[k], vistosSet);
    return v;
}

export default {
    registerTable, merge, setOverride, clearOverride, clearAll, applyPatch,
    listOverrides, overrideCount, overrideAt, version, resetCache,
    readPath, splitPath, numericPaths, rangeFor, deepFreeze,
    exportPatch, exportAsSource, downloadPatch
};