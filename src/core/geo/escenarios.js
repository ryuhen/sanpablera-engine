/**
 * ============================================================================
 * SANPABLERA ENGINE · core/geo/escenarios.js
 * ----------------------------------------------------------------------------
 * COMO ES UN ESCENARIO. Cuatro ejes, y el que de verdad cambia la partida es el
 * ultimo.
 * ============================================================================
 *
 * POR QUE CUATRO EJES Y NO UN SOLO "TIPO"
 *   Un escenario no es una decoracion con un nombre: es un CONJUNTO DE
 *   REGLAS. Y esas reglas se pueden cruzar. Un ring de Muay Thai en un callejon
 *   underground y sin ring out no es el mismo combate que ese mismo ring en un
 *   gimnasio oficial con ring out mortal, aunque los dos sean "el takedown".
 *
 *   Por eso son cuatro ejes independientes en vez de una lista de tipos. Si
 *   fueran tipos, habria que escribir 2 x 2 x 2 x 4 = 32 variantes a mano, y
 *   treinta y dos tablas a mano divergen en cuanto alguien toque una.
 *
 * LOS CUATRO EJES
 *
 *   1. LUGAR   DEPORTIVO  | CALLEJERO
 *      donde se pelea: un gimnasio con gradas, o una calle sin nadie.
 *      El deportivo tiene publico y luz; el callejero tiene publico y nada
 *      mas.
 *
 *   2. TIER    OFICIAL    | UNDERGROUND
 *      quien organiza y con que reglas. En el oficial hay arbitro, hay norma y
 *      se gana de la forma que manda el reglamento. En el underground las
 *      reglas las pone quien aposto.
 *
 *   3. ESPACIO CERRADO    | ABIERTO
 *      techo y muros, o cielo. Es lo que hace un escenario ABIERTO ruidoso y un
 *      cerrado opresivo, y cambia mas de lo que parece: al aire libre se oye
 *      caer a alguien desde tres calles.
 *
 *   4. RING OUT. ESTE ES EL QUE MANDA
 *      Que pasa cuando te sales. Y hay CUATRO respuestas, y son la diferencia
 *      entre "casi se cae" y "lo pierdes todo":
 *
 *        NINGUNO   no hay ring out. El ring es de los que no tienen fuera.
 *        PUNTOS    sales y pierdes puntos. Se vuelve a entrar y la pelea sigue.
 *        VIDA      sales y pierdes un trozo de vida. Es el que mas castiga sin
 *                  terminar la pelea de golpe.
 *        KO        sales y se acabó. El mas duro de los cuatro, y el unico que
 *                  no perdona.
 *
 * POR QUE EL RING OUT ES EL EJE IMPORTANTE
 *   Los otros tres ejes cambian el AMBIENTE. Este cambia el RIESGO. Un
 *   escenario con ring out KO es un escenario donde caerse es una decision que
 *   el jugador toma, no un accidente. Y es lo que hace que dos peleadores con
 *   el mismo moveset peleen distinto: uno juega por dentro y otro por fuera,
 *   y eso no sale de la postura, sale de la regla.
 *
 * DE DONDE SALEN ESTAS REGLAS
 *   Del ring (core/geo/rings.js), que NO tiene ring out propio: un ring de
 *   cuerdas de boxeo no mata a nadie por caerse, y el tatami no tiene fuera. Lo
 *   que decide el ring out es el ESCENARIO, y por eso es un eje aqui y no alla.
 *   Un escenario puede montar el tatami (que no tiene frontera) y aun asi tener
 *   ring out KO, porque lo que hay al otro lado del tatami lo decide el sitio.
 */

/** 1 · Donde se pelea. */
export const LUGAR = Object.freeze({
    DEPORTIVO: 'DEPORTIVO',
    CALLEJERO: 'CALLEJERO'
});

/** 2 · Quien organiza y con que normas. */
export const TIER = Object.freeze({
    OFICIAL: 'OFICIAL',
    UNDERGROUND: 'UNDERGROUND'
});

/** 3 · Techo y muros. */
export const ESPACIO = Object.freeze({
    CERRADO: 'CERRADO',
    ABIERTO: 'ABIERTO'
});

/** 4 · Que pasa al salirse. ESTE ES EL QUE MANDA. */
export const RING_OUT = Object.freeze({
    NINGUNO: 'NINGUNO',
    PUNTOS: 'PUNTOS',
    VIDA: 'VIDA',
    KO: 'KO'
});

/**
 * QUE PASA CONCRETAMENTE EN CADA MODO.
 *
 * `sangre` es lo que cuesta la primera vez, `extra` en cada repeticion. Esta
 * tabla es la que convierte "sale y pierde puntos" en numeros que el motor sepa
 * aplicar, y por eso `vida` y `puntos` son SECOS: la vida no se negocia.
 */
export const CASTIGO = Object.freeze({
    [RING_OUT.NINGUNO]: Object.freeze({
        puntos: 0, vida: 0, fin: false,
        nota: 'No hay fuera. Todo el combate ocurre dentro y salir no tiene coste.'
    }),
    [RING_OUT.PUNTOS]: Object.freeze({
        puntos: 25, vida: 0, fin: false,
        nota: 'Se pierden puntos y se vuelve a entrar. La pelea sigue: es el modo '
            + 'que mas se parece a no tener ring out, pero castiga el error.'
    }),
    [RING_OUT.VIDA]: Object.freeze({
        puntos: 0, vida: 18, fin: false,
        nota: 'Se pierde vida y se vuelve a entrar. Es el que mas castiga sin '
            + 'terminar la pelea de golpe, y el que hace que el jugador cuide '
            + 'la salida mas de lo que cuida el golpe.'
    }),
    [RING_OUT.KO]: Object.freeze({
        puntos: 0, vida: 0, fin: true,
        nota: 'Se acabó. El mas duro de los cuatro y el unico que no perdona. '
            + 'Aqui caerse no es un fallo, es una decision que el jugador toma.'
    })
});

/**
 * LOS ESCENARIOS. Cruzan los cuatro ejes y apuntan a un lugar de la isla.
 *
 * `ring` es el recinto de core/geo/rings.js, o `null` si el lugar no tiene ring
 * (aun asi se puede pelear, pero sin recinto: es una pelea en la calle).
 *
 * POR QUE ALGUNOS NO TIENEN RING
 *   Porque en un callejon no se monta una jaula. Y eso no es un fallo del
 *   catalogo: es el escenario. Peleas sin recinto son las mas rapidas y las mas
 *   sucias, y por eso son las de primer)).
 */
export const ESCENARIOS = Object.freeze([
    {
        id: 'GIMNASIO_NAUTICO',
        nombre: 'Gimnasio Nautico',
        lugar: LUGAR.DEPORTIVO,
        tier: TIER.OFICIAL,
        espacio: ESPACIO.CERRADO,
        ringOut: RING_OUT.PUNTOS,
        lugarIsla: 'PUEBLO_PAN',
        ring: 'RING_CUERDAS',
        postura: 'NEUTRAL',
        descripcion: 'Polideportivo con gradas, focos y arbitro. El ring de '
            + 'cuerdas de toda la vida, con las tres alturas. Salirse cuesta '
            + 'puntos y se vuelve: es donde se aprende a no tires de mas.'
    },
    {
        id: 'FEDERACION_NOCTURNA',
        nombre: 'Federacion Nocturna',
        lugar: LUGAR.DEPORTIVO,
        tier: TIER.OFICIAL,
        espacio: ESPACIO.CERRADO,
        ringOut: RING_OUT.VIDA,
        lugarIsla: 'PUERTO_AZUL',
        ring: 'JAULA_UFC',
        postura: 'NEUTRAL',
        descripcion: 'Evento sanctioned, jaula incluida, pero con la regla '
            + 'grande: caerse fuera cuesta VIDA y no puntos. Aqui no se compite '
            + 'por marcador, se compite por no caerse. Es el escenario donde el '
            + 'primer error se paga caro.'
    },
    {
        id: 'CANCHA_PUEBLO',
        nombre: 'La Cancha del Pueblo',
        lugar: LUGAR.CALLEJERO,
        tier: TIER.UNDERGROUND,
        espacio: ESPACIO.ABIERTO,
        ringOut: RING_OUT.NINGUNO,
        lugarIsla: 'PLAYA_AGUA',
        ring: 'TATAMI_KARATE',
        postura: 'NEUTRAL',
        descripcion: 'Cancha al lado de la playa, con la gente mirando desde la '
            + 'arena. Tatami atado al suelo y nada mas. No hay ring out: el '
            + 'tatami no tiene fuera y el de la playa tampoco. Es el combate '
            + 'mas limpio del torneo y el que mas gente ve.'
    },
    {
        id: 'AZOTEA_PUERTO',
        nombre: 'Azotea del Puerto',
        lugar: LUGAR.CALLEJERO,
        tier: TIER.UNDERGROUND,
        espacio: ESPACIO.ABIERTO,
        ringOut: RING_OUT.KO,
        lugarIsla: 'PUERTO_AZUL',
        ring: null,
        postura: 'NEUTRAL',
        descripcion: 'Sin ring, sin cuerdas, sin arbitro y con la ciudad '
            + 'abajo. Caerse no cuesta puntos ni vida: se acabó la pelea. Es el '
            + 'escenario donde el suelo es el rival mas duro del torneo.'
    },
    {
        id: 'NAVE_ALMACEN',
        nombre: 'La Nave del Almacen',
        lugar: LUGAR.CALLEJERO,
        tier: TIER.UNDERGROUND,
        espacio: ESPACIO.CERRADO,
        ringOut: RING_OUT.KO,
        lugarIsla: 'PUERTO_AZUL',
        ring: 'TAKEDOWN_MUAYTHAI',
        postura: 'NEUTRAL',
        descripcion: 'Nave vieja con las ventanas tapadas y luz de fluorescente. '
            + 'Takedown de 7 metros, suelo duro y ring out KO. El escenario mas '
            + 'duro de los cerrados: sin ventanas, sin nada fuera y sin normas.'
    },
    {
        id: 'SELVA_ABIERTO',
        nombre: 'Claro de la Selva',
        lugar: LUGAR.CALLEJERO,
        tier: TIER.UNDERGROUND,
        espacio: ESPACIO.ABIERTO,
        ringOut: RING_OUT.NINGUNO,
        lugarIsla: 'SELVA_BORDE',
        ring: 'ESTERILLA_JUDO',
        postura: 'NEUTRAL',
        descripcion: 'Un claro con la estera tendida entre las raices. Redonda, '
            + 'a ras, sin cuerdas y sin fuera. Se oye caer a alguien desde lejos '
            + 'y eso cambia como se pelea.'
    },
    {
        id: 'DOHYO_TORRE',
        nombre: 'El Dohyo de la Torre',
        lugar: LUGAR.CALLEJERO,
        tier: TIER.OFICIAL,
        espacio: ESPACIO.ABIERTO,
        // El dohyo no tiene barrera: tiene una LINEA. Cruzarla es acabar la
        // pelea igual que un KO, asi que el modo es KO; lo que lo hace
        // humillante es que la linea la dibuja el referee, no el suelo.
        ringOut: RING_OUT.KO,
        lugarIsla: 'VILLA_BASALTICA',
        ring: 'DOHYO_SUMO',
        postura: 'NEUTRAL',
        descripcion: 'Oficial, pero a cielo abierto y en el filo del volcan. El '
            + 'circulo de sumo, con la cena dibujada en la tierra. De los cuatro '
            + 'modos de ring out es el que tiene una sola linea y hay que '
            + 'cruzar. Es el mas humillante de perder.'
    },
    {
        id: 'SOTANO_MERCADO',
        nombre: 'El Sotano del Mercado',
        lugar: LUGAR.CALLEJERO,
        tier: TIER.UNDERGROUND,
        espacio: ESPACIO.CERRADO,
        ringOut: RING_OUT.PUNTOS,
        lugarIsla: 'PUEBLO_PAN',
        ring: null,
        postura: 'NEUTRAL',
        descripcion: 'Un sotano con la altura justa para dos y ni una mas. Sin '
            + 'ring, sin rojas, y con la regla de perder puntos al salirse. El '
            + 'mas pequeno del torneo: aqui no hay donde moverse y todo se decide '
            + 'a dos pasos.'
    }
]);

// ===========================================================================
// CONSULTAS
// ===========================================================================

/** El escenario por su identificador, o `null`. */
export function escenario(id) {
    return ESCENARIOS.find(e => e.id === id) || null;
}

/**
 * Lo que cuesta salirse en un escenario, con numeros aplicables.
 *
 * @param {object} e  una fila de ESCENARIOS
 * @returns {{puntos:number, vida:number, fin:boolean}}
 */
export function castigoSalida(e) {
    return CASTIGO[e ? e.ringOut : RING_OUT.NINGUNO] || CASTIGO[RING_OUT.NINGUNO];
}

/**
 * Los escenarios de una clase concreta: los de calle, los oficiales, los
 * abiertos, los de ring out mortal...
 *
 * @param {string} eje  LUGAR, TIER, ESPACIO o RING_OUT
 * @param {string} valor
 * @returns {Array<object>}
 */
export function porClase(eje, valor) {
    return ESCENARIOS.filter(e => e[eje] === valor);
}

/**
 * Que tan duro es un escenario, en un numero comparable.
 *
 * LA ESCALA, Y POR QUE ESTA ELEGIDA ASI
 *   No es "cuantos ejes dura" sino **cuanto cuesta caerse**, porque eso es lo
 *   que el jugador nota. Un ring out KO vale 3 (se acabó), quitar vida vale 2,
 *   perder puntos vale 1, y no tener ring out vale 0. Y se le suma 1 si el
 *   espacio es abierto, porque al aire libre caerse duele mas: hay altura, hay
 *   suelo duro y se oye desde lejos.
 *
 * Asi el numero ordena escenarios que son de ejes distintos, que es justo lo
 * que hace falta para ponerlos en una lista de dificultad.
 *
 * @param {object} e
 * @returns {number}
 */
export function dureza(e) {
    if (!e) return 0;
    const porRingOut = { NINGUNO: 0, PUNTOS: 1, VIDA: 2, KO: 3 }[e.ringOut] || 0;
    const porEspacio = e.espacio === ESPACIO.ABIERTO ? 1 : 0;
    return porRingOut + porEspacio;
}

/**
 * Los escenarios ordenados de mas duro a mas suave, para la pantalla de mapa.
 *
 * @returns {Array<object>}
 */
export function porDificultad() {
    return [...ESCENARIOS].sort((a, b) => dureza(b) - dureza(a));
}