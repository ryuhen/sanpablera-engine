/**
 * ============================================================================
 * SANPABLERA ENGINE · ui/graffiti/writers.js
 * ----------------------------------------------------------------------------
 * LOS GRAFITEROS: quien pinta el muro en cada arranque.
 *
 * LA IDEA
 * ----------------------------------------------------------------------------
 *   El jugador arranca el juego y el muro ya tiene a alguien pintando. Que sea
 *   una persona distinta cada vez es lo que hace que se sienta un callejon y no
 *   un menu: uno entra, ve quien esta trabajando ahi y sabe que el de manana
 *   sera otro.
 *
 *   Cada grafitero es un ROLLO, no un personaje con cara. Lo que cambia de uno a
 *   otro son cuatro cosas y solo cuatro, que son las que de verdad se ven en
 *   una pared:
 *
 *     1. La PALETA     : que colores usa y como los mezcla.
 *     2. El ROLLO      : que estilo de tag hace (solo throwies, solo wildstyle,
 *                        stickercutero, el del chrome...).
 *     3. LA JERGA      : de que pais saca las palabras. Un del Caribe con
 *                        uno de Mexico no suenan a la misma persona.
 *     4. EL GESTO      : como mueve la brocha (rapido y nervioso, lento y
 *                        gotoso, con Sprayiter y pauses).
 *
 *   Y hay un quinto campo, `firma`, que es la palabra con la que se firma. Es
 *   la que se lee en la etiqueta del grafiti y la que aparece en la galeria.
 *
 * POR QUE SON DATOS Y NO CODIGO
 *   Son seis objetos planos. Se pueden testear en Node, se pueden tunear sin
 *   tocar el motor de pintura, y anadir un grafitero nuevo es anadir un objeto.
 *   La pintura de verdad la hace LoadingScreen, que solo recibe estos campos.
 *
 * POR QUE NO HAY NOMBRES DE PERSONA REALES
 *   Los nombres son apodos inventados, de la zona pero no de nadie. La ficha
 *   del grafiti dice de donde viene y que rollo hace, y su firma. Nada mas.
 * ============================================================================
 */

/**
 * Paleta de un grafitero.
 *
 *   from/to   : degradado de la pintura (abajo -> arriba).
 *   halo      : color del contorno fino interior.
 *   accent    : color de los adornos (flechas, destellos, corona).
 *   bg        : tinte del fondo del muro, para que cada grafitero pinte en una
 *               pared distinta y no solo con otras letras.
 *   drips     : color de los chorrone.
 */
const PALETTES = Object.freeze({
    neon: Object.freeze({
        bg: '#0b1020', bgLight: '#1b2340',
        from: '#00e5ff', to: '#7b5bff', halo: '#ffffff',
        accent: '#00ffa3', drips: '#00e5ff'
    }),
    calor: Object.freeze({
        bg: '#1a0c06', bgLight: '#3a1a0c',
        from: '#ff4d00', to: '#ffd23f', halo: '#fff2c4',
        accent: '#ff2d6f', drips: '#ff4d00'
    }),
    foto: Object.freeze({
        bg: '#0d0d0d', bgLight: '#222222',
        from: '#f4f1e8', to: '#9ad9ff', halo: '#ffffff',
        accent: '#ff2d95', drips: '#f4f1e8'
    }),
    organico: Object.freeze({
        bg: '#07140f', bgLight: '#0f2a20',
        from: '#8dff3b', to: '#00e05a', halo: '#e8ffd4',
        accent: '#ffd23f', drips: '#8dff3b'
    }),
    ocre: Object.freeze({
        bg: '#14100a', bgLight: '#2c2314',
        from: '#b14bff', to: '#ff3d7f', halo: '#ffe6f4',
        accent: '#00d4ff', drips: '#b14bff'
    }),
    costa: Object.freeze({
        bg: '#04121a', bgLight: '#0a2436',
        from: '#ffb347', to: '#00d4ff', halo: '#fff6e0',
        accent: '#ff2d6f', drips: '#ffb347'
    })
});

/**
 * Los seis grafiteros.
 *
 *   id       : identificador estable (se guarda en la galeria).
 *   nombre   : el apodo, como lo firmaria.
 *   de       : de donde es / que jerga usa (sale en la ficha).
 *   bio      : una linea de su rollo, para la ficha y la galeria.
 *   paleta   : clave de PALETTES.
 *   rolls    : que estilos de tag usa, con el peso de cada uno. Un rollo que
 *              no aparece es un rollo que no hace nunca.
 *   paises   : de que paises saca la jerga. Si se omite, usa de todos.
 *   brocha   : gesto de pintado (ver `brushFor`).
 *   firma    : la palabra con la que firma el muro.
 *   capa     : 'encima' = pinta encima de los anteriores; 'debajo' = de los
 *              que ya estaban. Es lo que hace que suene a que REEMPLAZA al
 *              grafiti anterior y no a que los dos pintan a la vez.
 */
export const WRITERS = Object.freeze([
    {
        id: 'ZURDO',
        nombre: 'ZURDO',
        de: 'del barrio, pinta de noche y a pulso',
        bio: 'Solo throwies. Contorno limpio, una pasada, sin adornos. '
            + 'Dice poco y lo que dice se entiende.',
        paleta: 'foto',
        rolls: { throwie: 10, slab: 2, sticker: 1 },
        paises: ['PR', 'RD'],
        brocha: 'rapida',
        firma: 'ZURDO',
        capa: 'encima'
    },
    {
        id: 'FLORA',
        nombre: 'FLORA',
        de: 'del centroamerica, le gusta el color',
        bio: 'Wildstyle de manual: flechas, doble contorno y degradados. '
            + 'Cada tag es un sollo y se le reconoce a tres cuadras.',
        paleta: 'neon',
        rolls: { wildstyle: 10, throwie: 3, slab: 2 },
        paises: ['MX', 'GT', 'HN', 'NI'],
        brocha: 'lenta',
        firma: 'FLORA',
        capa: 'encima'
    },
    {
        id: 'BLOCKO',
        nombre: 'BLOCKO',
        de: 'de la isla, pinta con plantilla',
        bio: 'Stencils y stickercutero. Nada de brocha libre: corta, pega y '
            + 'aparece el muro con frases limpias encima de todo.',
        paleta: 'organico',
        rolls: { stencil: 10, sticker: 6, throwie: 2 },
        paises: ['CU', 'PR', 'JM', 'DO'],
        brocha: 'plantilla',
        firma: 'BLOCKO',
        capa: 'encima'
    },
    {
        id: 'CANAL',
        nombre: 'CANAL',
        de: 'de la television por cable, 90',
        bio: 'Aberracion cromatica y palabras cortas. Pintado que se ve como '
            + 'si lo emitieran: cian y magenta desfasados.',
        paleta: 'costa',
        rolls: { chrome: 10, throwie: 4, sticker: 2 },
        paises: ['DO', 'JM', 'MX'],
        brocha: 'rapida',
        firma: 'CANAL',
        capa: 'encima'
    },
    {
        id: 'MURO',
        nombre: 'MURO',
        de: 'del cono sur, pesado y lento',
        bio: 'Bloques macizos, sin adornos, muy gorros. Pinta lo que tiene '
            + 'que decir y encima lo repite mas grande.',
        paleta: 'ocre',
        rolls: { slab: 10, throwie: 4, wildstyle: 2 },
        paises: ['AR', 'CO', 'VE', 'UY', 'PY'],
        brocha: 'lenta',
        firma: 'MURO',
        capa: 'debajo'
    },
    {
        id: 'CHISPA',
        nombre: 'CHISPA',
        de: 'de la costa, no para quieto',
        bio: 'Mezcla de todo y con prisa: le da igual el rollo, lo que quiere '
            + 'es que el muro quede lleno antes de que se cansen de mirar.',
        paleta: 'calor',
        rolls: { throwie: 4, wildstyle: 4, sticker: 3, chrome: 3, slab: 2, stencil: 2 },
        paises: ['PE', 'EC', 'BO', 'CO', 'DO'],
        brocha: 'nerviosa',
        firma: 'CHISPA',
        capa: 'encima'
    }
]);

/**
 * La paleta de un grafitero, ya resuelta.
 *
 * POR QUE NO HAY SILENCIO SI LA CLAVE NO EXISTE
 *   Antes esto caia a la paleta 'foto' cuando la clave no estaba, y eso
 *   escondio un typo ('organimo' por 'organico') durante una sesion entera:
 *   BLOCKO salia con la paleta de otro grafitero sin ningun error en consola.
 *   Un nombre mal escrito en los datos es un error de datos, y aqui se ve.
 */
export function paletteOf(idOrWriter) {
    const w = typeof idOrWriter === 'string' ? byId(idOrWriter) : idOrWriter;
    const key = w && w.paleta;
    const p = key && PALETTES[key];
    if (!p) {
        if (typeof console !== 'undefined') {
            console.error('[graffiti] paleta inexistente: "' + key + '" (grafitero ' + ((w && w.id) || '?') + ')');
        }
        return null;
    }
    return Object.assign({}, p, { key });
}

/** El objetco del rollo de un grafitero, tal cual. */
export function byId(id) {
    return WRITERS.find((w) => w.id === id) || null;
}

/**
 * Los parametros de brocha segun el gesto.
 *
 *   speed : cuanto avanza el relleno por segundo (fraccion de la palabra).
 *   hold  : pausa que se hace al empezar cada palabra (ms), para que se note
 *           donde empieza a pintar cada una.
 *   jitter: cuanto tiembla el borde de la brocha (0 = limpio, 1 = nervioso).
 *   drip  : cada cuanto sale un chorrone (ms).
 *   spray : intensidad de la neblina de spray.
 */
const BRUSHES = Object.freeze({
    rapida: Object.freeze({ speed: 1.25, hold: 90, jitter: 0.55, drip: 260, spray: 0.22 }),
    lenta: Object.freeze({ speed: 0.62, hold: 220, jitter: 0.28, drip: 520, spray: 0.14 }),
    plantilla: Object.freeze({ speed: 1.6, hold: 40, jitter: 0.05, drip: 999999, spray: 0.05 }),
    nerviosa: Object.freeze({ speed: 1.05, hold: 30, jitter: 0.85, drip: 150, spray: 0.30 })
});

/** Los parametros de brocha de un grafitero (con valores por defecto si falta). */
export function brushFor(idOrWriter) {
    const w = typeof idOrWriter === 'string' ? byId(idOrWriter) : idOrWriter;
    const b = BRUSHES[(w && w.brocha) || 'rapida'] || BRUSHES.rapida;
    return Object.assign({ name: (w && w.brocha) || 'rapida' }, b);
}

/**
 * Elige el grafitero del dia.
 *
 * POR QUE EL DIA Y NO Math.random
 *   Si sale al azar puro, dos arranques seguidos pueden dar el mismo muro y
 *   el jugador no percibe el cambio. Con el dia como semilla, cada arranque del
 *   mismo dia da el MISMO grafitero (es coherente: el del barrio no cambia de
 *   la noche a la mañana) pero cambia en cuanto pasa el dia. Para forzar un
 *   cambio en la misma sesion se pasa `seed` a mano.
 *
 * @param {number} [seed] si se omite, se usa la fecha local (dia y ano)
 * @returns {object} el Writer elegido
 */
export function writerOfTheDay(seed) {
    const s = seed === undefined ? daySeed() : seed;
    const i = Math.abs(Math.floor(Math.sin(s * 12.9898) * 43758.5453)) % WRITERS.length;
    return WRITERS[i];
}

/** Semilla del dia: cambia en cuanto cambia el dia, no en cada arranque. */
export function daySeed(now) {
    const d = now ? new Date(now) : new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/** Todos los ids, para la galeria. */
export function writerIds() {
    return WRITERS.map((w) => w.id);
}

export default { WRITERS, paletteOf, brushFor, byId, writerOfTheDay, daySeed, writerIds };
