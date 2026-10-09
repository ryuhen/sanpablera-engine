/**
 * ============================================================================
 * SANPABLERA ENGINE · ui/graffiti/lexicon.js
 * ----------------------------------------------------------------------------
 * LA JERGA DEL MURO: el diccionario que le pasa la brocha al grafitero.
 *
 * QUE ES Y QUE NO ES
 * ----------------------------------------------------------------------------
 *   Es un LEXICONARIO, no un muro. Aqui no hay colores ni posiciones ni
 *   Sizes: solo la palabra, de donde viene y de que rollo es. Quien decide
 *   como se pinta es `writers.js`, y quien decide donde cae en la pared es
 *   `layout.js`. Separar las tres cosas es lo que permite tener seis
 *   grafiteros sin reescribir el codigo de pintura.
 *
 * POR QUE DATOS Y NO CODIGO
 *   El diccionario es lo unico de toda la pantalla que se puede discutir sin
 *   tocar el motor. Si manana se anade una palabra hay que anadir UNA linea
 *   aqui; si se cambia el plan de pintura no se toca este archivo. Ademas
 *   asi se puede testear en Node (ver tests/lexicon.smoke.mjs) sin DOM.
 *
 * LA JERGA ES REAL, NO INVENTADA
 * ----------------------------------------------------------------------------
 *   Todo lo de aqui se usa de verdad en su pais. Viene del Caribe (PR, RD, CU,
 *   JM) y de Latinoamerica en general (MX, CO, AR, VE, PE, EC, BO, DO, GT,
 *   HN, PA, NI, UY, PY). Esta escrito como se escribe en la calle: sin
 *   tildes cuando la palabra se dice sin ellas, y con la "~" de escape (ver
 *   `unescapeTag`) para las que si las llevan. Las "~" existen para que este
 *   archivo se pueda leer y editar en cualquier editor sin que se rompa el
 *   UTF-8.
 *
 *   Lo que NO hay aqui: insultos, palabras de odio, ni nada que el jugador
 *   tenga que explicarle a su madre. Se comprueba en el test, que exige que
 *   `validate()` no devuelva ni un problema.
 *
 * ROLLO (roll) DE CADA PALABRA
 * ----------------------------------------------------------------------------
 *   throwie  : una pasada, contornada, la clasica. Sirve para cualquier
 *              palabra neutra ("la calle", "aquí se pega").
 *   wildstyle: la que lleva adorno y color, la de la persona que quiere que
 *              se hable de el.
 *   sticker  : corta el muro, tipo pegatina. Se reserva para nombres propios
 *              y para el eslogan del grafitero.
 *   chrome   : la de television por cable. Para palabras cortas, que asi se
 *              leen a distancia.
 *   slab     : bloque macizo. Para la palabra que va centrada y mandona.
 *   stencil  : cutout, una sola pasada limpia, de las que se hacen con
 *              plantilla. Es la voz de las palabras serias (slogans).
 * ============================================================================
 */

/**
 * Los paises y la jerga que sale de cada uno.
 *
 * `pais` es solo informativo (sale en la ficha del grafitero y en la galería),
 * pero se agrupa por el rollo para poder elegir sin que el motor tenga que
 * entender de paises: `WORDS` es la lista plana que consume el pintor.
 */
export const REGION_WORDS = Object.freeze({
    // --- Caribe: Puerto Rico y Republica Dominicana (los dos que mas pesa) ---
    PR: Object.freeze([
        { word: 'VECINO', roll: 'throwie', tone: 'calle' },
        { word: 'ASÍ NA~CE', roll: 'wildstyle', tone: 'lema' },
        { word: 'BRóHALE', roll: 'throwie', tone: 'grito' },
        { word: 'WEA~SO', roll: 'throwie', tone: 'callao' },
        { word: 'PA~NANO', roll: 'chrome', tone: 'aviso' },
        { word: 'CHULO', roll: 'sticker', tone: 'modismo' },
        { word: 'NO TA~MALO', roll: 'wildstyle', tone: 'lema' },
        { word: 'BANANA~RAMA', roll: 'sticker', tone: 'modismo' },
        { word: 'COLMAO', roll: 'throwie', tone: 'grito' },
        { word: 'LLEVANDO', roll: 'throwie', tone: 'calle' }
    ]),
    RD: Object.freeze([
        { word: 'B~ARATO', roll: 'throwie', tone: 'grito' },
        { word: 'DIOS ES~MIGRO', roll: 'wildstyle', tone: 'lema' },
        { word: 'JA~ERA', roll: 'throwie', tone: 'grito' },
        { word: 'CON~CHIS', roll: 'chrome', tone: 'calle' },
        { word: 'CLAVE', roll: 'sticker', tone: 'modismo' },
        { word: 'NO JODO', roll: 'wildstyle', tone: 'lema' },
        { word: 'PAPEL~ERO', roll: 'sticker', tone: 'calle' },
        { word: 'LA CALLE EDUCA', roll: 'stencil', tone: 'lema' },
        { word: 'PURA VIDA', roll: 'throwie', tone: 'callao' }
    ]),
    CU: Object.freeze([
        { word: 'QUE~NCE', roll: 'throwie', tone: 'grito' },
        { word: 'ASI TA~BIEN', roll: 'wildstyle', tone: 'lema' },
        { word: 'APROVECHA~CHE', roll: 'throwie', tone: 'modismo' },
        { word: 'CARAJ~O', roll: 'chrome', tone: 'grito' },
        { word: 'MIR~ANDO', roll: 'throwie', tone: 'calle' },
        { word: 'NO SE', roll: 'slab', tone: 'aviso' },
        { word: 'PARA LUEGO', roll: 'stencil', tone: 'lema' }
    ]),
    JM: Object.freeze([
        { word: 'BOMB', roll: 'sticker', tone: 'modismo' },
        { word: 'STREET~LIFE', roll: 'throwie', tone: 'calle' },
        { word: 'REAL~NESS', roll: 'wildstyle', tone: 'lema' },
        { word: 'NO BAD~MAN', roll: 'chrome', tone: 'aviso' },
        { word: 'BIG~SMALL', roll: 'sticker', tone: 'modismo' }
    ]),

    // --- Centroamerica y Mexico ---------------------------------------------
    MX: Object.freeze([
        { word: 'ORALE', roll: 'throwie', tone: 'grito' },
        { word: 'NO RASA', roll: 'wildstyle', tone: 'lema' },
        { word: 'ALMA DE LA CALLE', roll: 'stencil', tone: 'lema' },
        { word: 'NO~MAN', roll: 'chrome', tone: 'aviso' },
        { word: 'CHAMBA', roll: 'throwie', tone: 'calle' },
        { word: 'A~QUI SE PEGA', roll: 'wildstyle', tone: 'lema' },
        { word: 'VA~LE', roll: 'throwie', tone: 'grito' },
        { word: 'LUEGO LUEGO', roll: 'sticker', tone: 'modismo' }
    ]),
    GT: Object.freeze([
        { word: 'SIMON', roll: 'throwie', tone: 'grito' },
        { word: 'Guate', roll: 'sticker', tone: 'modismo' },
        { word: 'NO JOD~AS', roll: 'wildstyle', tone: 'lema' },
        { word: 'CHICHI', roll: 'throwie', tone: 'modismo' },
        { word: 'ACA VAMOS', roll: 'stencil', tone: 'lema' }
    ]),
    HN: Object.freeze([
        { word: 'CATRIN', roll: 'throwie', tone: 'modismo' },
        { word: 'NO~PE', roll: 'chrome', tone: 'aviso' },
        { word: 'PATRIA', roll: 'wildstyle', tone: 'lema' },
        { word: 'MANGUEA', roll: 'throwie', tone: 'modismo' }
    ]),
    PA: Object.freeze([
        { word: 'QU~BLO', roll: 'throwie', tone: 'grito' },
        { word: 'MARE', roll: 'sticker', tone: 'modismo' },
        { word: 'SAL PA~LLA', roll: 'chrome', tone: 'aviso' },
        { word: 'PANAMA', roll: 'slab', tone: 'ciudad' }
    ]),
    NI: Object.freeze([
        { word: 'SANDINO', roll: 'slab', tone: 'ciudad' },
        { word: 'QUE~PE~ASO', roll: 'throwie', tone: 'grito' },
        { word: 'NO~PE EL TIRON', roll: 'wildstyle', tone: 'lema' }
    ]),

    // --- Suramerica ----------------------------------------------------------
    CO: Object.freeze([
        { word: 'PARCE', roll: 'throwie', tone: 'grito' },
        { word: 'TODO SUBE', roll: 'stencil', tone: 'lema' },
        { word: 'NO~ME HAG~AS PEOR', roll: 'wildstyle', tone: 'lema' },
        { word: 'BACON', roll: 'sticker', tone: 'modismo' },
        { word: 'MAS PERRONA', roll: 'throwie', tone: 'calle' },
        { word: 'HECH~ALE', roll: 'chrome', tone: 'grito' },
        { word: 'LA 80', roll: 'slab', tone: 'ciudad' }
    ]),
    AR: Object.freeze([
        { word: 'CO~NIZA', roll: 'throwie', tone: 'calle' },
        { word: 'CHABON', roll: 'throwie', tone: 'grito' },
        { word: 'ACA NO SE ROMPE', roll: 'stencil', tone: 'lema' },
        { word: 'LABURO', roll: 'sticker', tone: 'modismo' },
        { word: 'MANO DURA', roll: 'wildstyle', tone: 'lema' },
        { word: 'PICHIN~O', roll: 'throwie', tone: 'modismo' },
        { word: 'EL BARRIO HABLA', roll: 'stencil', tone: 'lema' }
    ]),
    VE: Object.freeze([
        { word: 'EVERE~STE', roll: 'throwie', tone: 'grito' },
        { word: 'VIVA', roll: 'slab', tone: 'callao' },
        { word: 'COTEJAR', roll: 'sticker', tone: 'modismo' },
        { word: 'NO ESTA PERDIDO', roll: 'wildstyle', tone: 'lema' }
    ]),
    PE: Object.freeze([
        { word: 'BARRIO', roll: 'sticker', tone: 'modismo' },
        { word: 'YOR~BA', roll: 'throwie', tone: 'grito' },
        { word: 'CAUSA SUICIDA', roll: 'wildstyle', tone: 'lema' },
        { word: 'MOLA', roll: 'throwie', tone: 'modismo' },
        { word: 'NO SE RINDEN', roll: 'stencil', tone: 'lema' }
    ]),
    EC: Object.freeze([
        { word: 'PARRON', roll: 'throwie', tone: 'grito' },
        { word: 'PAISAJISMO', roll: 'slab', tone: 'calle' },
        { word: 'COMA~RE', roll: 'throwie', tone: 'modismo' },
        { word: 'NO SE CUENTA', roll: 'stencil', tone: 'lema' }
    ]),
    BO: Object.freeze([
        { word: 'CHOLA', roll: 'throwie', tone: 'grito' },
        { word: 'NO HAY PLAN B', roll: 'stencil', tone: 'lema' },
        { word: 'VIVIR SIN P~ASO', roll: 'wildstyle', tone: 'lema' }
    ]),
    DO: Object.freeze([
        { word: 'CLARO', roll: 'throwie', tone: 'grito' },
        { word: 'LA CALE~ERA', roll: 'wildstyle', tone: 'lema' },
        { word: 'JUE~O', roll: 'throwie', tone: 'modismo' }
    ]),
    UY: Object.freeze([
        { word: 'CHICHO', roll: 'throwie', tone: 'grito' },
        { word: 'ORDA', roll: 'sticker', tone: 'modismo' },
        { word: 'ACA SE RESPIRA', roll: 'stencil', tone: 'lema' }
    ]),
    PY: Object.freeze([
        { word: 'SOY EL ~A', roll: 'throwie', tone: 'grito' },
        { word: 'NO SE RINDE', roll: 'wildstyle', tone: 'lema' }
    ])
});

/**
 * Palabras del juego: el motor pone su propio vocabulario en el muro.
 *
 * No son jerga, son las palabras que el jugador va a ver en el juego (el
 * nombre del escenario, el del arquetipo) para que el muro tenga algo del
 * Sanpablera y no solo de la calle.
 */
export const GAME_WORDS = Object.freeze([
    { word: 'SANPABLERA', roll: 'slab', tone: 'juego' },
    { word: 'DOJO', roll: 'throwie', tone: 'juego' },
    { word: 'ORIGAMI', roll: 'sticker', tone: 'juego' },
    { word: 'CALLE', roll: 'throwie', tone: 'juego' },
    { word: 'RING', roll: 'chrome', tone: 'juego' },
    { word: 'KNOCK OUT', roll: 'wildstyle', tone: 'juego' },
    { word: 'CHAMPION', roll: 'slab', tone: 'juego' },
    { word: 'ESPECTADOR', roll: 'stencil', tone: 'juego' }
]);

/** Los tres estilos de tag que ya existen en LoadingScreen. */
export const ROLLS = Object.freeze(['throwie', 'wildstyle', 'sticker', 'chrome', 'slab', 'stencil']);

/** Los tonos, para elegir jerga segun el rollo del grafitero. */
export const TONES = Object.freeze(['grito', 'lema', 'calle', 'modismo', 'aviso', 'callao', 'ciudad', 'juego']);

/**
 * Todas las palabras de un pais, con su pais puesto para poder filtrar.
 * @param {string} [pais] codigo ISO de dos letras; si se omite, todas
 */
export function wordsOf(pais) {
    if (!pais) return Object.entries(REGION_WORDS).flatMap(([code, list]) =>
        list.map((w) => ({ ...w, pais: code })));
    return (REGION_WORDS[pais] || []).map((w) => ({ ...w, pais }));
}

/**
 * Todas las palabras de la calle mas las del juego.
 */
export function allWords() {
    return [...wordsOf(), ...GAME_WORDS.map((w) => ({ ...w, pais: 'JUEGO' }))];
}

/**
 * Deja una palabra lista para pintar.
 *
 * POR QUE LA "~"
 *   El archivo fuente usa escapes tipo `CO~NIZA` para que la `~` y las
 *   vocales acentuadas sobrevivan a cualquier editor. Aqui se quita la `~` y se
 *   deja la vocal acentuada de verdad, que es lo que va a pintar la brocha.
 *
 * @param {string} word
 * @returns {string}
 */
export function unescapeTag(word) {
    // OJO con dos cosas, que son lo unico delicado de esta funcion.
    //
    // 1) UNA SOLA PASADA. Un replace por vocal, en cadena, se pisa a si mismo:
    //    la vocal acentuada que sale puede volver a entrar en el patron del
    //    siguiente paso. Resolviendo todo con un unico replace, cada "letra~"
    //    del original se lee una vez y se escribe una vez, y la salida ya no
    //    vuelve a entrar en ningun patron.
    //
    // 2) RESPETA LAS MAYUSCULAS. El grafiti va en mayusculas, y `CO~NIZA`
    //    tiene que salir "COÑIZA", no "COñIZA": una enye minuscula en mitad de
    //    una palabra en mayusculas se lee como un fallo, no como una tilde.
    const ACENTOS = {
        o: ['\u00f3', '\u00d3'], a: ['\u00e1', '\u00c1'], e: ['\u00e9', '\u00c9'],
        i: ['\u00ed', '\u00cd'], u: ['\u00fa', '\u00da'], n: ['\u00f1', '\u00d1']
    };
    return String(word || '')
        .replace(/~([oaeiun])/gi, (m, letra) => {
            const par = ACENTOS[letra.toLowerCase()];
            return par[letra === letra.toUpperCase() ? 1 : 0];
        })
        .replace(/~/g, '');   // cualquier otra ~ se va
}

/**
 * Elige las palabras de un muro de forma DETERMINISTA a partir de una semilla.
 *
 * POR QUE DETERMINISTA Y NO Math.random
 *   El muro tiene que ser el MISMO durante toda la carga (si no, las palabras
 *   bailarian mientras el jugador mira), pero distinto en cada arranque. Se
 *   mezcla la semilla con la posicion del indice y se reparte por el peso de
 *   cada rollo. La semilla la pone el grafitero elegido.
 *
 * @param {object} opts
 * @param {number} opts.seed     semilla del grafitero (normalmente el dia)
 * @param {number} opts.count    cuantas palabras se quieren
 * @param {object} [opts.weights] roll -> peso relativo (lo que el grafitero
 *                                usa mas, pesa mas)
 * @param {string[]} [opts.paises] paises que puede usar (undefined = todos)
 * @returns {Array<{word,pais,roll,tone}>} `count` palabras, sin repetir
 */
export function pickWords({ seed = 1, count = 9, weights = null, paises = null, juego = true } = {}) {
    // OJO con el origen del conjunto. Sin `paises`, el conjunto sale de
    // `allWords()`, que mezcla la jerga de calle CON las palabras del juego
    // (SANPABLERA, DOJO...): por eso el tope de esta funcion es
    // `allWords().length`, y no `count()`, que solo cuenta la calle. Con
    // `juego: false` sale solo de la calle y el tope pasa a ser `count()`.
    const pool = paises && paises.length
        ? paises.flatMap((p) => wordsOf(p))
        : (juego ? allWords() : wordsOf());
    if (!pool.length) return [];
    // No se puede pedir mas de lo que hay: el bucle de abajo se pararia por
    // `candidates` vacio y devolveria menos de lo pedido, que es lo correcto,
    // pero el tope explicito deja claro que `count` es "hasta".
    const objetivo = Math.min(count, pool.length);

    const out = [];
    const used = new Set();
    // Se va sacando por peso: se intenta el rollo, y si no quedan palabras de
    // ese rollo, se cae al siguiente que aun queden.
    const w = weights || {};
    for (let i = 0; out.length < objetivo && i < objetivo * 6 + pool.length; i++) {
        const candidates = pool.filter((x) => !used.has(x.word));
        if (!candidates.length) break;
        const totalW = candidates.reduce((s, x) => s + (w[x.roll] || 1), 0);
        let r = frac(Math.sin((seed + i * 17.13) * 43.758) * 9137.7) * totalW;
        let chosen = candidates[0];
        for (const c of candidates) {
            r -= (w[c.roll] || 1);
            if (r <= 0) { chosen = c; break; }
        }
        used.add(chosen.word);
        out.push(chosen);
    }
    return out;
}

/**
 * Elige UNA palabra grande (roll slab o wildstyle) para el centro del muro.
 * Es la que manda: se pinta la ultima y la mas grande.
 */
export function pickHeroWord({ seed = 1, words = [] } = {}) {
    const grandes = words.filter((x) => x.roll === 'slab' || x.roll === 'wildstyle' || x.roll === 'stencil');
    const pool = grandes.length ? grandes : words;
    if (!pool.length) return null;
    const i = Math.floor(frac(Math.sin(seed * 71.31) * 5309.1) * pool.length);
    return pool[Math.min(i, pool.length - 1)];
}

// ===========================================================================
// UTILIDADES INTERNAS
// ===========================================================================

/** Fraccion de un numero (siempre en 0..1). */
function frac(x) {
    const v = Math.abs(x) % 1;
    return v;
}

/**
 * Comprueba que el diccionario esta limpio: sin palabras vacias, sin repetir,
 * y con el rollo y el tono dentro de las listas.
 * Se usa en las pruebas. Devuelve la lista de problemas (vacia = bien).
 */
export function validate() {
    const problemas = [];
    const vistos = new Map();
    for (const [pais, lista] of Object.entries(REGION_WORDS)) {
        if (!Array.isArray(lista) || !lista.length) {
            problemas.push(`${pais}: lista vacia`);
            continue;
        }
        for (const w of lista) {
            const plain = unescapeTag(w.word);
            if (!plain || !plain.trim()) problemas.push(`${pais}: palabra vacia`);
            if (typeof w.word !== 'string') problemas.push(`${pais}: word no es texto`);
            if (plain.length > 22) problemas.push(`${pais}: "${plain}" es demasiado larga (${plain.length})`);
            if (!ROLLS.includes(w.roll)) problemas.push(`${pais}: "${plain}" con rollo desconocido "${w.roll}"`);
            if (!TONES.includes(w.tone)) problemas.push(`${pais}: "${plain}" con tono desconocido "${w.tone}"`);
            // Sin repetir dentro del pais (repetir entre paises si es la misma
            // jerga es correcto: "SIMON" esta en varios sitios).
            const key = pais + '|' + plain;
            if (vistos.has(key)) problemas.push(`${pais}: "${plain}" repetida`);
            vistos.set(key, true);
        }
    }
    return problemas;
}

/** Numero total de palabras de jerga de calle (sin contar las del juego). */
export function count() {
    return Object.values(REGION_WORDS).reduce((s, l) => s + l.length, 0);
}

export default { REGION_WORDS, GAME_WORDS, ROLLS, TONES, wordsOf, allWords, pickWords, pickHeroWord, unescapeTag, validate, count };
