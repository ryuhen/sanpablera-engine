/**
 * ============================================================================
 * SANPABLERA ENGINE · core/geo/rings.js
 * ----------------------------------------------------------------------------
 * LOS RINGS. Cinco recinto y un circulo, y donde encaja cada uno.
 * ============================================================================
 *
 * QUE ES ESTO, Y POR QUE NO SON TODOS IGUALES
 *   Un ring no es un rectangulo con una textura. Cada uno tiene una FORMA y una
 *   FRONTERA, y las dos cambian el combate:
 *
 *     - la jaula tiene MALLA. No hay escapatoria por arriba ni por el lado, y
 *       el alcance manda porque nadie se sale.
 *     - el ring de cuerdas tiene tres alturas de cuerda. En un clinch se pelea
 *       DENTRO y con las cuerdas agarradas, y se puede salir TOPADO.
 *     - el tatami NO TIENE FRONTERA. Esta elevado sobre el terreno, asi que
 *       caerse es salir de combate y no rebotar contra nada.
 *     - la esterilla de judo es redonda y esta EN EL SUELO, sin cuerdas. Redonda
 *       significa que no hay esquina donde esconder al rival.
 *     - el dohyo de sumo es un circulo de tierra, al nivel del suelo, con el
 *       borde dibujado en vez de construido: es unRing que se puede pisar.
 *
 *   O sea que la forma NO es decoracion: es la regla. Un peleador de suelo en
 *   la jaula se porta de otra manera que en el tatami.
 *
 * LA RELACION CON LA ISLA
 *   Un ring no esta en todas partes. `sitios` dice en que escenarios se puede
 *   levantar, y es lo que impide que aparezca un dohyo de sumo en medio de la
 *   selva sin que el jugador pregunte por que.
 *
 * ESPACIO
 *   Todo en metros, como el resto del motor: Y arriba, Z adelante. `ancho` es el
 *   lado (o el diametro) y `elevacion` lo alto que queda sobre el suelo.
 * ============================================================================
 */

/** Como es el recinto por dentro. */
export const FORMA = Object.freeze({
    JAULA: 'JAULA',        // malla de acero, sin cordas ni techo util
    CUADRADO: 'CUADRADO',  // cuatro lados, cuerdas a tres alturas
    TATAMI: 'TATAMI',      // cuadrado abierto, sin nada que frene
    REDONDA: 'REDONDA',    // circulo sin cuerdas, al nivel del suelo
    SUMO: 'SUMO'           // circulo de tierra, borde dibujado, sin barrera
});

/** Que frena al peleador, y como. */
export const FRONTERA = Object.freeze({
    MALLA: 'MALLA',        // no se sale de ninguna manera
    CUERDAS: 'CUERDAS',    // se sale topando, y en clinch se agarra
    NINGUNA: 'NINGUNA',    // el suelo acaba la pelea
    CENA: 'CENA'           // linea dibujada: cruzarla es perder
});

export const RINGS = Object.freeze([
    {
        id: 'JAULA_UFC',
        nombre: 'La Jaula',
        forma: FORMA.JAULA,
        frontera: FRONTERA.MALLA,
        ancho: 9.0,
        alto: 10.0,
        elevacion: 0.5,
        cuerdas: 0,
        techo: true,
        suelo: 'tela',
        descripcion: 'Malla de acero, ocho lados y un techo que nadie mira. '
            + 'Aqui el clinch no existe: si te empujan, chocas contra el hueco '
            + 'del muro y estas mas veces de pie que tumbado.',
        // La jaula va donde hay ciudad, dinero y unfighters con nombre.
        sitios: ['PUERTO_AZUL', 'PUEBLO_PAN', 'VILLA_BASALTICA'],
        rasgoDominante: 'resistencia'
    },
    {
        id: 'RING_CUERDAS',
        nombre: 'El Ring de Cuerdas',
        forma: FORMA.CUADRADO,
        frontera: FRONTERA.CUERDAS,
        ancho: 8.0,
        alto: 8.0,
        elevacion: 0.6,
        cuerdas: 3,
        techo: false,
        suelo: 'lona',
        descripcion: 'Cuadrado, tres cuerdas a tres alturas y la lona mas alta '
            + 'del suelo. Es el ring de toda la vida. Las cuerdas sirven para lo '
            + 'malo y para lo bueno: sujetar al rival contra la esquina y '
            + 'escaparse cuando toca.',
        sitios: ['PLAYA_AGUA', 'EL_MORRO', 'PUERTO_AZUL'],
        rasgoDominante: 'velocidad'
    },
    {
        id: 'TAKEDOWN_MUAYTHAI',
        nombre: 'El Takedown',
        forma: FORMA.CUADRADO,
        frontera: FRONTERA.CUERDAS,
        ancho: 7.0,
        alto: 7.0,
        elevacion: 0.6,
        cuerdas: 3,
        techo: false,
        suelo: 'lona',
        descripcion: 'Igual que el de cuerdas pero MAS PEQUEÑO y con el suelo '
            + 'duro: es el ring de Muay Thai, donde no hay sumision que valga '
            + 'y todo se decide a las piernas. En un ring grande un peleador '
            + 'te rodea; en este no cabe.',
        // Se nota: es el unico que cambia el ANCHO de verdad, y por eso obliga
        // a pelear distinto y no es "el mismo ring en otro sitio".
        nota: 'El unico cuyo ancho (7) obliga a cambiar la tactica: en los otros '
            + 'caben dos peleadores con holgura y aqui hay que entrar.',
        sitios: ['PLAYA_AGUA', 'PUERTO_AZUL', 'MIRADOR_SECO'],
        rasgoDominante: 'velocidad'
    },
    {
        id: 'TATAMI_KARATE',
        nombre: 'El Tatami',
        forma: FORMA.TATAMI,
        frontera: FRONTERA.NINGUNA,
        ancho: 8.0,
        alto: 8.0,
        // ESTA ELEVADO sobre el terreno. Es lo unico que esta en alto, y por eso
        // caerse fuera no es rebotar contra una cuerda: es pisar el suelo de al
        // lado y quedarse fuera del combate.
        elevacion: 0.9,
        cuerdas: 0,
        techo: false,
        suelo: 'tatami',
        descripcion: 'Cuadrado abierto, una plancha de lona clavada sobre el '
            + 'terreno. NADA frena al peleador. Aqui no hay cuerdas ni muro: o '
            + 'sales andando del tatami, o te llevas el suelo por delante y te '
            + 'quedas fuera.',
        nota: 'Sin frontera. El unico donde perder el suelo es perder el combate '
            + 'y no solo un punto del ring.',
        sitios: ['PLAYA_AGUA', 'EL_MORRO', 'PUEBLO_PAN', 'MIRADOR_SECO'],
        rasgoDominante: 'agilidad'
    },
    {
        id: 'ESTERILLA_JUDO',
        nombre: 'La Estera',
        forma: FORMA.REDONDA,
        frontera: FRONTERA.NINGUNA,
        ancho: 9.0,
        // AL NIVEL DEL SUELO, no elevada. Es la diferencia con el tatami.
        elevacion: 0.05,
        cuerdas: 0,
        techo: false,
        suelo: 'esterilla',
        descripcion: 'Circulo plano, tendido en el suelo, sin cuerdas ni nada. '
            + 'Redonda para que no haya esquina donde meter al rival, y a ras '
            + 'de suelo para que tumbarse sea rodar, no saltar.',
        nota: 'Redonda y a ras: no hay donde empujar al rival ni donde esconderse.',
        sitios: ['SELVA_BORDE', 'CANYON_SECO', 'PUEBLO_PAN', 'VILLA_BASALTICA'],
        rasgoDominante: 'agilidad'
    },
    {
        id: 'DOHYO_SUMO',
        nombre: 'El Dohyo',
        forma: FORMA.SUMO,
        frontera: FRONTERA.CENA,
        ancho: 5.4,
        // El circulo real del sumo mide 4,55 m de diameter y el dohyo entero
        // 6,7. Aqui se usa 5,4: el anillo de combate, que es lo que delimita.
        elevacion: 0.1,
        cuerdas: 0,
        techo: false,
        suelo: 'tierra',
        descripcion: 'Un circulo de tierra con el borde dibujado. No hay barrera '
            + 'que tocar: hay una CENA. Cruzar la linea es perder, y no te lo '
            + 'dice un muro, te lo dice el referee. Es el ring mas pequeno y el '
            + 'que menos margen deja.',
        nota: 'El mas pequeno (5,4 m) y el unico cuya frontera no se toca: es '
            + 'una linea en el suelo, y cruzarla es perder.',
        sitios: ['MIRADOR_SECO', 'SELVA_BORDE', 'VILLA_BASALTICA', 'CRATERA'],
        rasgoDominante: 'resistencia'
    }
]);

// ===========================================================================
// CONSULTAS
// ===========================================================================

/**
 * El ring por su identificador, o `null`.
 * @param {string} id
 */
export function ring(id) {
    return RINGS.find(r => r.id === id) || null;
}

/**
 * Los rings que se pueden levantar en un escenario.
 *
 * Un escenario con lista vacia no admite ring: no es un sitio donde pelear, es
 * un sitio donde mirar.
 *
 * @param {string} lugarId
 * @returns {Array<object>}
 */
export function ringsDe(lugarId) {
    return RINGS.filter(r => r.sitios.includes(lugarId));
}

/**
 * Si dos peleadores caben de verdad, o se estan pisando los pies antes de
 * empezar.
 *
 * OJO CON POR QUE ESTO EXISTE: `ancho` no es decorativo. El dohyo de sumo son
 * 5,4 m de diametro, y los peleadores miden 1,8 m de hombros mas los codos.
 * Un ring tan pequeno que no quepan dos NO es un ring pequeno: es un fallo de
 * diseno, y se nota en el primer frame.
 *
 * @param {object} r  una fila de RINGS
 * @param {number} [anchoCuerpo] medida de hombros con brazos, en metros
 * @returns {boolean}
 */
export function caben(r, anchoCuerpo = 1.15) {
    if (!r) return false;
    // El takedown y el tatami son los unicos que se pelean pegados y sin linea
    // que frene, asi que necesitan menos hueco que el resto.
    const holgura = r.forma === FORMA.TATAMI || r.forma === FORMA.REDONDA ? 0.95 : 1.0;
    return r.ancho * holgura >= anchoCuerpo * 2;
}

/**
 * Cuanto se puede alejar del centro sin salirse, en metros.
 *
 * Es el numero que de verdad manda en el combate: el alcance util. En el dohyo
 * son 2,7 m y no hay mas; en el takedown, 3,5 y tampoco; en la esterilla,
 * 4,5 redondos. Un peleador de alcance largo en el dohyo no tiene donde ir.
 *
 * @param {object} r
 * @returns {number}
 */
export function alcanceUtil(r) {
    if (!r) return 0;
    return r.forma === FORMA.REDONDA || r.forma === FORMA.SUMO
        ? r.ancho / 2
        : r.ancho / 2;
}

/**
 * Si al peleador se le puede sacar del ring empujandole, o no.
 *
 * ES LA DIFERENCIA ENTRE PERDER Y REBOTAR. Contra las cuerdas se topa y vuelve
 * (mientras tenga cuerda que agarrar). En el tatami y en la estera no hay nada:
 * sale andando. Y en el dohyo hay linea, que no frena, pero decide el combate.
 *
 * @param {object} r
 * @returns {'TOPA'|'SALE'|'LINEA'}
 */
export function comoSale(r) {
    if (!r) return 'TOPA';
    if (r.frontera === FRONTERA.MALLA) return 'TOPA';
    if (r.frontera === FRONTERA.CUERDAS) return 'TOPA';
    if (r.frontera === FRONTERA.CENA) return 'LINEA';
    return 'SALE';
}