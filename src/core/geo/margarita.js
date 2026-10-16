/**
 * ============================================================================
 * SANPABLERA ENGINE · core/geo/margarita.js
 * ----------------------------------------------------------------------------
 * LA ISLA. El mapa del torneo.
 * ============================================================================
 *
 * QUE ES ESTO
 *   La cartografia de Isla de Margarita (Nueva Esparta, Venezuela) convertida
 *   en datos que el motor puede usar: el contorno de la isla, las zonas y los
 *   lugares donde se pelebra.
 *
 *   No es decoracion. El torneo juntan luchadores de todo el mundo en la isla,
 *   y cada recruit es una zona: el combate empieza en un sitio y la pelea se
 *   juega ahi. Este fichero es el mapa Y el catalogo de escenarios.
 *
 * LA ISLA REAL, PARA QUE NO SE INVENTE UN CONTINENTE ENTERO
 *   Margarita esta en el Caribe, unos 15 km al norte de Venezuela, en el
 *   archipielago de Nueva Esparta. Va de NOESTE a SUROESTE, con unos 35 km de
 *   largo por 15 de ancho. Su punto mas alto real es el Cerro El Copey (unos
 *   850 m), en la mitad oeste.
 *
 *   OJO, Y ESTO ES LO IMPORTANTE: **El Copey NO es un volcan**. Es un batolito,
 *   un afloramiento de granito del Cretacico. Este modulo pone un volcan porque
 *   el escenario lo pide, y se llama "Cerro Perdido" para que no se confunda con
 *   el relieve real. El mapa es un sitio verosimil, no un mapa topographic.
 *
 *   Y los lugares son FICTICIOS, pero estan repartidos como lo estarian de verdad:
 *   el turismo de playa en la costa norte, el puerto y las casas coloniales en
 *   el surfereste, el interior seco y caluroso al sur, y la selva cerrada en el
 *   macizo del oeste. El torneo puede ganar un negle al que no le haya pasado
 *   nada.
 *
 * ESPACIO
 *   `[x, y]` en km, con el origen en el NOROESTE de la isla y `x` hacia el
 *   estes y `y` hacia el sur. No son coordenadas geodesicas: son un plano, y es
 *   lo que necesita el motor para colocar capas y medir distancias. La escala
 *   es real (1 unidad = 1 km) para que "cruzar la isla" signifique lo que dice.
 * ============================================================================
 */

/**
 * EL CONTORNO.
 *
 * `anillo` son puntos del borde, en orden, y `costa` es lo que se dibuja. Se
 * han exagerado los entrantes y salientes para que la silueta se reconozca como
 * isla menorquina sin necesidad de un mapa real encima, y para que un combate
 * en la costa no sea un plano aburrido.
 *
 * @type {ReadonlyArray<readonly [number, number]>}
 */
export const CONTORNO = Object.freeze([
    // --- norte: la costa de las playas, la mas visitada -----------------------
    [0.0, 0.0], [2.4, -0.5], [4.8, -0.9], [7.4, -1.1], [10.0, -1.4],
    [12.6, -1.9], [15.2, -2.6], [17.8, -3.0], [20.4, -3.8], [23.0, -4.3],
    [25.4, -4.1], [27.6, -3.4],
    // --- este: la punta que mira a el punto mas al este ------------------------
    [29.4, -2.6], [30.6, -1.4], [30.2, 0.2], [29.0, 1.4],
    // --- surelyeste: puerto y casas de colon --------------------------------
    [27.4, 2.6], [25.2, 3.6], [22.6, 4.2], [19.8, 4.6], [16.8, 5.2],
    [13.6, 5.6], [10.4, 6.1],
    // --- sur: la costa seca, la que se asoma ----------------------------------
    [7.4, 6.8], [4.6, 7.4], [2.0, 7.6], [0.2, 7.2],
    // --- oeste: el macizo, el pie del cerro ----------------------------------
    [-1.4, 6.2], [-2.6, 4.6], [-3.2, 2.8], [-3.0, 1.0], [-1.8, 0.2]
]);

/** El punto mas al este y el mas al sur, para colocar camaras sin mirar. */
export const CAJAS = Object.freeze({
    minX: -3.2, maxX: 30.6, minY: -4.3, maxY: 7.6
});

/**
 * LAS ZONAS. No son climas: son las cuatro bandas que atraviesan la isla de
 * norte a sur, y cada una tiene su forma de moverse.
 *
 * POR QUE ESTAS CUATRO Y NO OCHO
 *   Un jugador tiene que leer la zona antes de que empiece, asi que cuatro
 *   bandas distinguibles son mejor que ocho: esta es la cuenta.
 *   distingue a un luchador de otro no es de donde viene, es COMO se mueve:
 *   el de la selva es agil, el del desierto es resistivo, el de la costa es
 *   largo. El bioma ES el moveset.
 */
export const ZONAS = Object.freeze({
    COSTA: Object.freeze({
        id: 'COSTA',
        nombre: 'La Costa de las Playas',
        // El norte, donde cae la gente: playa y mar.
        color: '#1f6fb2',
        suelo: 'arena',
        clima: 'tropical',
        // El viento de la mar: se corre bien y no hay donde esconderse.
        rasgo: 'velocidad',
        nota: 'Arena clara y agua turquesa. Nadie se oculta aqui: es donde se fights '
            + 'a la vista de todos y por eso es donde se reunen los que no tienen '
            + 'nada que esconder.'
    }),
    SUR_SECO: Object.freeze({
        id: 'SUR_SECO',
        nombre: 'El Sur Seco',
        color: '#b8873a',
        suelo: 'tierra',
        clima: 'calor',
        rasgo: 'resistencia',
        nota: 'Tras la cordillera, el agua se va. Tierra roja, matorral bajo y un '
            + 'sol quecastiga a quien se queda quieto. El combate mas largo de la '
            + 'isla: aqui no hay manera de que un golpe leve tumbe a nadie.'
    }),
    MACIZO: Object.freeze({
        id: 'MACIZO',
        nombre: 'El Macizo',
        color: '#2f5d3a',
        suelo: 'selva',
        clima: 'humedo',
        rasgo: 'agilidad',
        nota: 'El oeste, donde el terreno se levanta. Selva cerrada, sombra y '
            + 'liana. Es el unico sitio de la isla donde no se ve venir a nadie, '
            + 'y por eso es el que y por eso es el que menos_TRACE de fighters.'
    }),
    CERRO: Object.freeze({
        id: 'CERRO',
        nombre: 'El Cerro Perdido',
        color: '#5a3a2a',
        suelo: 'volcan',
        clima: 'altura',
        rasgo: 'altura',
        nota: 'La cima ficticia. Caldera humeante y roca negra. En el juego no '
            + 'importa que no exista: el jugador no va a mirar el relieve real.'
    })
});

/**
 * LOS LUGARES. Cada uno es un escenario jugable.
 *
 * QUE TIENE CADA UNO
 *   `zona`     en que banda cae (de ahi sale el color del suelo)
 *   `arena`    medidas del ring en km, en [x, z] y con la altura
 *   `peleadores` quien suele pelear alli, y CUANTOS caben
 *   `requisito` lo que hay que ganar para que se abra
 *
 * POR QUE ALGUNOS TIENEN REQUISITO
 *   El torneo tiene que avanzar. Si se puede pelear en todos a la vez, el mapa
 *   es decoracion; si hay que GANAR el cerro para que se abra, el mapa es el
 *   juego. El requisito es lo que hace que el jugador recorra la isla en vez
 *   de quedarse en la playa.
 *
 * Y OJO CON ESTO, QUE ES LA PARTE IMPORTANTE DEL FICHERO:
 *   Los peleadores de cada lugar NO son zonas de reserva: son los que TRASPASAN
 *   ese sitio. El del desierto no resiste porque lo digamos, resiste porque ha
 *   peleado en el desierto toda su vida. La `aptitud` de cada uno se deriva de
 *   su zona, no de un numero inventado en el escenario.
 */
export const LUGARES = Object.freeze([
    {
        id: 'PLAYA_AGUA',
        nombre: 'Playa del Agua',
        zona: 'COSTA',
        fundacion: 'La playa grande, al norte. Donde aterriza el tournament.',
        arena: Object.freeze({ x: 22.0, z: -1.2, ancho: 9, alto: 7, piso: 0 }),
        peleadores: Object.freeze(['GUARDIAN', 'PESCADOR']),
        aptitud: Object.freeze({ velocidad: 0.7, resistencia: 0.4, agilidad: 0.6, altura: 0.2 }),
        requisito: null
    },
    {
        id: 'EL_MORRO',
        nombre: 'El Morro',
        zona: 'COSTA',
        fundacion: 'El promontorio del norte, el que mira a las otras islas.',
        arena: Object.freeze({ x: 28.4, z: -0.6, ancho: 6, alto: 6, piso: 0 }),
        peleadores: Object.freeze(['GUARDIAN']),
        aptitud: Object.freeze({ velocidad: 0.9, resistencia: 0.3, agilidad: 0.8, altura: 0.1 }),
        requisito: { lugar: 'PLAYA_AGUA', combates: 1 }
    },
    {
        id: 'PUEBLO_PAN',
        nombre: 'El Pueblo de Pan',
        zona: 'COSTA',
        fundacion: 'Casas blancas contra el agua, callejones estrechos.',
        arena: Object.freeze({ x: 17.4, z: -0.6, ancho: 7, alto: 7, piso: 0 }),
        peleadores: Object.freeze(['PANADERO', 'PESCADOR']),
        aptitud: Object.freeze({ velocidad: 0.6, resistencia: 0.5, agilidad: 0.5, altura: 0.2 }),
        requisito: null
    },
    {
        id: 'PUERTO_AZUL',
        nombre: 'Puerto Azul',
        zona: 'SUR_SECO',
        fundacion: 'El puerto viejo del surelyeste, con los cascos varados.',
        arena: Object.freeze({ x: 24.0, z: 3.2, ancho: 10, alto: 8, piso: 0 }),
        peleadores: Object.freeze(['CARGA', 'MECANICO']),
        aptitud: Object.freeze({ velocidad: 0.5, resistencia: 0.8, agilidad: 0.3, altura: 0.3 }),
        requisito: { lugar: 'PLAYA_AGUA', combates: 2 }
    },
    {
        id: 'MIRADOR_SECO',
        nombre: 'Mirador Seco',
        zona: 'SUR_SECO',
        fundacion: 'Un risco de tierra roja sobre el sur. Se ve toda la isla.',
        arena: Object.freeze({ x: 11.8, z: 5.4, ancho: 8, alto: 8, piso: 0.4 }),
        peleadores: Object.freeze(['CARGA', 'BAQUERO']),
        aptitud: Object.freeze({ velocidad: 0.5, resistencia: 0.7, agilidad: 0.6, altura: 0.6 }),
        requisito: { lugar: 'PUERTO_AZUL', combates: 1 }
    },
    {
        id: 'SELVA_BORDE',
        nombre: 'Borde de Selva',
        zona: 'MACIZO',
        fundacion: 'Donde el monte se asoma al este y empieza el arbolado.',
        arena: Object.freeze({ x: 3.6, z: 2.4, ancho: 9, alto: 9, piso: 0.2 }),
        peleadores: Object.freeze(['MONTANERO', 'BAQUERO']),
        aptitud: Object.freeze({ velocidad: 0.6, resistencia: 0.6, agilidad: 0.9, altura: 0.4 }),
        requisito: { lugar: 'MIRADOR_SECO', combates: 1 }
    },
    {
        id: 'CANYON_SECO',
        nombre: 'Cañon Hondo',
        zona: 'MACIZO',
        fundacion: 'La garganta entre dos paredes de piedra. Estrecha y larga.',
        arena: Object.freeze({ x: 0.4, z: 3.2, ancho: 5, alto: 10, piso: 0.6 }),
        peleadores: Object.freeze(['MONTANERO']),
        aptitud: Object.freeze({ velocidad: 0.8, resistencia: 0.7, agilidad: 0.7, altura: 0.5 }),
        requisito: { lugar: 'SELVA_BORDE', combates: 1 }
    },
    {
        id: 'VILLA_BASALTICA',
        nombre: 'La Villa Basaltica',
        zona: 'CERRO',
        fundacion: 'La primera parada en el volcan. Aun hay suelo negro y casas.',
        arena: Object.freeze({ x: -1.4, z: 1.6, ancho: 8, alto: 8, piso: 1.1 }),
        peleadores: Object.freeze(['MONJE', 'MONTANERO']),
        aptitud: Object.freeze({ velocidad: 0.5, resistencia: 0.8, agilidad: 0.6, altura: 0.8 }),
        requisito: { lugar: 'CANYON_SECO', combates: 2 }
    },
    {
        id: 'CRATERA',
        nombre: 'La Cratera',
        zona: 'CERRO',
        fundacion: 'La final. El suelo suena a hueco y hace calor.',
        arena: Object.freeze({ x: -1.0, z: 3.6, ancho: 8, alto: 8, piso: 1.6 }),
        peleadores: Object.freeze(['MONJE']),
        aptitud: Object.freeze({ velocidad: 0.6, resistencia: 0.9, agilidad: 0.8, altura: 1.0 }),
        requisito: { lugar: 'VILLA_BASALTICA', combates: 2 }
    }
]);

// ===========================================================================
// CONSULTAS
// ===========================================================================

/**
 * El escenario por su identificador, o `null`.
 *
 * @param {string} id
 * @returns {object|null}
 */
export function lugar(id) {
    return LUGARES.find(l => l.id === id) || null;
}

/**
 * Los escenarios que ya estan abiertos: los que no tienen requisito, mas los
 * que cumplen el suyo. Es lo que la pantalla de mapa tiene que dibujar
 * abierto, y lo que impide que el jugador suba al volcan a base de pulsar.
 *
 * @param {Set<string>} ganados  lugares ya conquistados
 * @returns {Array<object>}
 */
/**
 * Los escenarios que ya estan abiertos.
 *
 * `ganados` es un CONTADOR por lugar: `{ PLAYA_AGUA: 2 }` quiere decir dos
 * combates ganados ahi. Y no es un `Set` a proposito: un conjunto no puede
 * contar repetidos, asi que con un conjunto el requisito "gana tres aqui" se
 * cumpliria con uno solo, y el torneo entero se pasaria en dos peleas.
 *
 * @param {Record<string, number>} [ganados]  combates ganados por lugar
 * @returns {Array<object>}
 */
export function abiertos(ganados = {}) {
    return LUGARES.filter(l => {
        if (!l.requisito) return true;
        const hechos = ganados[l.requisito.lugar] || 0;
        return hechos >= l.requisito.combates;
    });
}

/**
 * El siguiente peldaño: el escenario abierto mas cercano a cerrar, o `null` si
 * la isla esta entera.
 *
 * ES LO QUE LA PANTALLA DE MAPA TIENE QUE MARCAR. Sin esto el mapa es una lista
 * de sitios, y con esto es una ruta: se ve cual es el siguiente objetivo y el
 * torneo se recorre sin perderse.
 *
 * @param {Record<string, number>} [ganados]
 * @returns {object|null} la fila de LUGARES pendiente
 */
/**
 * El siguiente peldaño: el primer escenario de la lista que aun no esta
 * abierto, o `null` si la isla esta entera.
 *
 * ES LO QUE LA PANTALLA DE MAPA TIENE QUE MARCAR. Sin esto el mapa es una
 * lista de sitios; con esto es una RUTA, y el torneo se recorre sin perderse.
 *
 * Y POR QUE EL PRIMERO DE LA LISTA Y NO EL MAS CERCANO: `LUGARES` esta escrita
 * en orden de recorrido (de la playa al volcan), que es el orden en que el
 * torneo tiene quewalker. Ordenar por distancia daria un salto al otro lado de
 * la isla y el jugador acabaria en la cratera sin haber peleado en la playa.
 *
 * @param {Record<string, number>} [ganados]
 * @returns {object|null}
 */
export function siguiente(ganados = {}) {
    for (const l of LUGARES) {
        if (!abiertos(ganados).some(a => a.id === l.id)) return l;
    }
    return null;
}
/**
 * La aptitud de un luchador en un lugar: lo que el terreno le hace.
 *
 * SE DERIVA, NO SE INVENTA. Un peleador que viene de la selva llega al
 * desierto con la agilidad de la selva y la resistencia del desierto, que es
 * como pasa: el terreno te hace como eres mas fuerte en lo tuyo, pero no te
 * regala nada. Multiplicar por el `piso` y por la pendiente de la arena es lo
 * que hace que el cerro castigue de verdad a quien no esta acostumbrado.
 *
 * @param {object} l      el luchador, con `zona` y `aptitud`
 * @param {object} escenario  una fila de LUGARES
 * @returns {{velocidad:number,resistencia:number,agilidad:number,altura:number}}
 */
export function aptitudEn(l, escenario) {
    const base = l && l.aptitud ? l.aptitud : { velocidad: 0.5, resistencia: 0.5, agilidad: 0.5, altura: 0.2 };
    const Z = ZONAS[escenario.zona];
    const rasgo = Z ? Z.rasgo : null;
    // El rasgo de la zona REFUERZA lo suyo, no lo cambia. En el mar se corre
    // mejor; en el monte se es mas agil; en el desierto se aguanta mas.
    const bonif = rasgo === 'velocidad' ? 0.15
        : rasgo === 'resistencia' ? 0.2
            : rasgo === 'agilidad' ? 0.2
                : rasgo === 'altura' ? 0.25 : 0;
    // El piso alto no perdona: cada 100 m de altura resta algo a todo.
    const altura = (escenario.arena && escenario.arena.piso) || 0;
    const suelo = Math.max(0.6, 1 - altura * 0.18);
    const out = {};
    for (const k of ['velocidad', 'resistencia', 'agilidad', 'altura']) {
        let v = base[k] || 0;
        if (k === rasgo) v += bonif;
        out[k] = Math.max(0, Math.min(1, v * suelo));
    }
    return out;
}

/**
 * La isla como puntos, para dibujarla. Devuelve el contorno ya cerrado.
 *
 * @returns {Array<readonly [number, number]>}
 */
export function contornoCerrado() {
    return [...CONTORNO, CONTORNO[0]];
}
