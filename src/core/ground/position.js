/**
 * ============================================================================
 * SANPABLERA ENGINE · core/ground/position.js
 * ----------------------------------------------------------------------------
 * EL MODELO POSICIONAL DE SUELO: quien esta donde, y como se cambia de sitio.
 *
 * QUE RESUELVE Y QUE NO
 * ----------------------------------------------------------------------------
 *   La FSM ya tiene los estados: de pie, agachado, pecho tierra, caido de
 *   espaldas, caido de cara, y los treinta de agarre. Lo que NO tiene es el
 *   modelo por encima de ellos, que es la pregunta que decide el combate en
 *   el suelo: **este de arriba ha Llegado a donde queria o no**. Un estado dice
 *   en que animacion esta el peleador; una posicion dice quien manda.
 *
 *   Un unico dato responde a todo: la POSICION. Los dos peleadores comparten
 *   la misma posicion, y de ella sale quien esta arriba y quien abajo. No hay
 *   dos variables que se puedan desincronizar ni una referencia cruzada entre
 *   los dos estados de la FSM.
 *
 * LA ESCALERA NO ES UNA LISTA ORDENADA, Y ESO ES LO IMPORTANTE
 * ----------------------------------------------------------------------------
 *   Un principiante pone los estados en una fila de "mejor" a "peor":
 *   monteja > espalda > control lateral > media guardia > guardia > suelo. Y es
 *   mentira: **la guardia cerrada es la MEJOR posicion del de abajo**, porque
 *   el de arriba se queda atrapado entre las piernas sin poder golpear.
 *
 *   Por eso hay dos numeros y no una escalera:
 *
 *     peligro  que tan mal lo lleva el de ABAJO (0..10)
 *     presion  cuanto tiene el de ARRIBA atado (0..10)
 *
 *   La guardia cerrada sale con peligro 2 (el de abajo esta a salvo) y
 *   presion 8 (el de arriba atrapado). La monteja sale con peligro 9 y
 *   presion 0. Ninguna de las dos es "la mejor posicion": depende de quien
 *   eres. Comparar solo con `peligro` seria exactamente el error de la
 *   escalera.
 *
 * LA VENTANA DE ESCAPE, QUE ES EL MOTOR DE TODO
 * ----------------------------------------------------------------------------
 *   Al llegar a una posicion, el de abajo tiene una ventana de unos frames
 *   para escapar o invertir. Pasada la ventana, ya no puede: solo puede
 *   accumulate. Y la ventana se ACORTA conforme sube el peligro:
 *
 *       guardia abierta .... 60 frames     control lateral .... 25
 *       guardia cerrada .... 90            crucifijo .......... 20
 *       media guardia ...... 40            monteja ............ 18
 *       pasado ............. 30            espalda ............ 12
 *       tortuga ............  0             espalda con gancho .  0
 *
 *   Esos numeros son el juego entero. Con una ventana de 25 frames, un
 *   control lateral se puede revertir. Con 18, cuesta. Con 0, estas montado y
 *   no hay mash que te saque: toca buscar la sumision. Por eso entrar y
 *   quedarse es una decision, no un premio. La ventana se cierra.
 *
 *   El `PASADO` tiene la ventana mas curta de laspositions de abajo (30) y el
 *   peligro mas alto de las de transicion (7) a proposito: es el momento de la
 *   inversion, el mas peligroso y el unico donde merece la pena arriesgar.
 *
 * ROLES COMPARTIDOS CON EL AGARRE
 * ----------------------------------------------------------------------------
 *   `ROL.ARRIBA` es la cadena "TORI" y `ROL.ABAJO` es "UKE", las mismas de
 *   `SPF.GrappleRole`. A proposito: cuando el suelo se una con el agarre, el
 *   papel no hay que traducirlo, ya es el mismo.
 * ============================================================================
 */

/**
 * Quien esta arriba y quien abajo. Las cadenas son las de SPF.GrappleRole:
 * TORI aplica la tecnica (arriba), UKE la recibe (abajo).
 */
export const ROL = Object.freeze({
    ARRIBA: 'TORI',
    ABAJO: 'UKE'
});

/** Lo que puede hacer el de abajo para salirse. */
export const GEV = Object.freeze({
    AVANZAR: 'AVANZAR',   // el de arriba sube un escalon
    RETIRAR: 'RETIRAR',   // el de arriba se retira a una peor (concede terreno)
    ESCAPAR: 'ESCAPAR',   // el de abajo sale hacia una mejor suya
    REVERSAR: 'REVERSAR', // INVERSION: el de abajo pasa a estar ARRIBA
    GUARDAR: 'GUARDAR',   // el de abajo se enrosca / cierra guardia
    LEVANTAR: 'LEVANTAR'  // el de abajo se pone de pie
});

/** Por que una accion no se ha podido hacer. */
export const MOTIVO = Object.freeze({
    LEGAL: 'LEGAL',
    ROL_INCORRECTO: 'ROL_INCORRECTO', // el de arriba no puede escaparse
    SIN_SALIDA: 'SIN_SALIDA',         // desde aqui ese evento no lleva a nada
    FUERA_DE_VENTANA: 'FUERA_DE_VENTANA', // se paso el tiempo: ya no puede
    YA_ESTA: 'YA_ESTA'                // ya estaba en la posicion pedida
});

/** Las posiciones. El nombre dice donde esta el de ABAJO y quien lo tiene. */
export const POS = Object.freeze({
    DE_PIE: 'DE_PIE',
    CAIDO_LIBRE: 'CAIDO_LIBRE',
    GUARDIA_ABIERTA: 'GUARDIA_ABIERTA',
    GUARDIA_CERRADA: 'GUARDIA_CERRADA',
    MEDIA_GUARDIA: 'MEDIA_GUARDIA',
    TORTUGA: 'TORTUGA',
    PASADO: 'PASADO',
    CONTROL_LATERAL: 'CONTROL_LATERAL',
    CRUCIFIX: 'CRUCIFIX',
    MONTEJA: 'MONTEJA',
    MEDIA_MONTEJA: 'MEDIA_MONTEJA',
    ESPALDA: 'ESPALDA',
    ESPALDA_GANCHO: 'ESPALDA_GANCHO'
});

/**
 * Que zonas del cuerpo controla el de arriba. Es lo que decide que castigos y
 * que sumisiones hay disponibles despues (ver `punish.js`), asi que la tabla
 * de posiciones y la de castigos no se pueden desincronizar.
 */
export const ZONA = Object.freeze({
    CABEZA: 'CABEZA',
    TORSO: 'TORSO',
    COSTILLAS: 'COSTILLAS',
    BRAZO: 'BRAZO',
    ESPALDA: 'ESPALDA',
    PIERNAS: 'PIERNAS'
});

/**
 * La tabla. Freeze profunda a proposito: es la verdad del juego y si alguien
 * la muta en caliente, el fallo sale tres frames mas tarde y en otro sitio.
 *
 * peligro .... 0..10, cuanto peor lo lleva el de abajo
 * presion ... 0..10, cuanto tiene el de arriba atado
 * ventana .... frames en los que el de abajo puede escapar o invertir
 * ataca ..... zonas que puede castigar el de arriba
 * sumision .. sumisiones disponibles desde aqui
 * sube ...... posiciones a las que puede avanzar el de arriba
 * baja ...... posiciones a las que puede retirarse el de arriba
 * escapa .... a donde puede salir el de abajo sin invertir
 * invierte .. a donde puede INVERTIR el de abajo (y pasar a ser el de arriba)
 * rosca ..... a donde puede enroscarse el de abajo (tortuga, guardias)
 */
const T = Object.freeze({
    // --- los dos de pie: el suelo todavia no ha empezado ------------------
    // OJO con `sube`: desde los dos de pie NO hay "de arriba", y sin embargo
    // poner `sube` es lo que deja el grafo entero conectado. Se lee asi:
    // AVANZAR aqui es el DERRIBO que sale bien, y el que lo ejecuta se queda
    // arriba. Sin esta linea el suelo no se puede empezar nunca: desde DE_PIE
    // todas las listas estan vacias y el combate se queda en pie para siempre.
    //
    // El primero es CAIDO_LIBRE y no la guardia porque el PRIMER destino es el
    // que devuelve `resolverSuelo`: un derribo te deja tirado en la lona, y a
    // la guardia abierta se llega desde ahi agarrando despues.
    DE_PIE: Object.freeze({
        nombre: 'Los dos de pie',
        rango: 0,
        arriba: false, // todavia no hay "de arriba"
        peligro: 0, presion: 0, ventana: 0,
        ataca: [], sumision: [],
        sube: [POS.CAIDO_LIBRE, POS.GUARDIA_ABIERTA],
        baja: [], escapa: [], invierte: [], rosca: []
    }),

    // --- UNO TIRADO EN LA LONA Y EL OTRO DE PIE, SIN AGARRE ---------------
    //
    // Esta posicion es la que une el DERRIBO con el suelo, y sin ella el
    // modelo tenia un agujero: caes, y lo primero que decia era "guardia
    // abierta", que no es verdad. Un derribo te deja tumbado en la lona con el
    // otro de pie encima, sin que os hayais cogido. Agarre cero.
    //
    // Es tambien la que hace que la STANCE tenga trabajo (stance.js): aqui el
    // de abajo puede levantarse, enroscarse o cerrar guardia, y el de arriba
    // puede castigar o subirse encima. Sin esta posicion, `LEVANTARSE` no
    // tendria sentido en ningun sitio del modelo.
    CAIDO_LIBRE: Object.freeze({
        rango: 1,
        nombre: 'Tirado en la lona, el otro de pie',
        arriba: true,
        peligro: 4, presion: 2, ventana: 45,
        ataca: [ZONA.CABEZA, ZONA.TORSO],
        sumision: [],
        // Solo a la guardia abierta: antes de pasar las piernas hay que agarrar
        // algo. Con `PASADO` aqui el salto seria de +5 rangos, de "tirado en
        // la lona" a "pasando las piernas" sin pasar por delante, y eso no es un
        // paso, es un teletransporte. La escalera se sube de uno en uno.
        sube: [POS.GUARDIA_ABIERTA],
        baja: [POS.DE_PIE],
        escapa: [POS.GUARDIA_ABIERTA, POS.GUARDIA_CERRADA],
        invierte: [POS.DE_PIE],
        rosca: [POS.TORTUGA]
    }),

    // --- el de abajo con las piernas fuera, sin atrapar nada --------------
    GUARDIA_ABIERTA: Object.freeze({
        rango: 2,
        nombre: 'Guardia abierta',
        arriba: true,
        peligro: 3, presion: 4, ventana: 60,
        ataca: [ZONA.TORSO],
        sumision: [],
        sube: [POS.PASADO],
        baja: [],
        escapa: [POS.GUARDIA_CERRADA, POS.MEDIA_GUARDIA],
        invierte: [POS.PASADO],
        rosca: [POS.TORTUGA]
    }),

    // --- LA TRAMPA: el de arriba se queda dentro de las piernas ------------
    GUARDIA_CERRADA: Object.freeze({
        rango: 3,
        nombre: 'Guardia cerrada',
        arriba: true,
        peligro: 2, presion: 8, ventana: 90,
        ataca: [],
        sumision: [],
        sube: [POS.MEDIA_GUARDIA],
        baja: [],
        escapa: [POS.GUARDIA_ABIERTA],
        invierte: [POS.PASADO],
        rosca: [POS.TORTUGA]
    }),

    // --- una rodilla dentro: el de arriba pasa pero no sin trabajo -------
    MEDIA_GUARDIA: Object.freeze({
        rango: 4,
        nombre: 'Media guardia',
        arriba: true,
        peligro: 4, presion: 5, ventana: 40,
        ataca: [ZONA.TORSO],
        sumision: [],
        sube: [POS.PASADO],
        baja: [POS.GUARDIA_ABIERTA, POS.GUARDIA_CERRADA],
        escapa: [POS.GUARDIA_CERRADA, POS.GUARDIA_ABIERTA],
        invierte: [POS.MONTEJA],
        rosca: [POS.TORTUGA]
    }),

    // --- el de abajo se enrosca. No offensive, pero tampoco se le hace nada -
    TORTUGA: Object.freeze({
        rango: 5,
        nombre: 'Tortuga',
        arriba: true,
        peligro: 2, presion: 6, ventana: 0, // 0: el mismo la ha elegido
        ataca: [],
        sumision: [],
        sube: [POS.PASADO],
        baja: [],
        escapa: [],
        invierte: [POS.DE_PIE],
        rosca: [POS.TORTUGA]
    }),

    // --- EL MOMENTO. El de arriba se ha comprometido a pasar las piernas ---
    PASADO: Object.freeze({
        rango: 6,
        nombre: 'Pasando las piernas',
        arriba: true,
        peligro: 7, presion: 9, ventana: 30, // la ventana mas corta de abajo
        ataca: [],
        sumision: [],
        sube: [POS.CONTROL_LATERAL],
        baja: [POS.GUARDIA_ABIERTA, POS.GUARDIA_CERRADA, POS.MEDIA_GUARDIA],
        escapa: [POS.GUARDIA_CERRADA, POS.MEDIA_GUARDIA],
        invierte: [POS.MONTEJA], // el barrido clasico
        rosca: [POS.TORTUGA]
    }),

    // --- de costado, torso y un brazo atados ------------------------------
    CONTROL_LATERAL: Object.freeze({
        rango: 7,
        nombre: 'Control lateral',
        arriba: true,
        peligro: 6, presion: 1, ventana: 25,
        ataca: [ZONA.CABEZA, ZONA.TORSO, ZONA.COSTILLAS],
        sumision: ['PAJITAS', 'CODO'],
        // El ORDEN de esta lista es el orden de PREFERENCIA, y no es cosmetico:
        // `resolverSuelo` devuelve el primero de la lista. La linea natural es
        // montaja -> media montaja -> espalda; el crucifijo va el ultimo
        // porque es la VARIACION (la trampa al brazo), no el camino de
        // siempre. Si se invirtiera, el de arriba acabaria en el crucifijo
        // siempre y el remate del spec (costillas que giran la espalda) dejaria
        // de funcionar, porque el crucifijo no deja castigar las costillas.
        sube: [POS.MONTEJA, POS.MEDIA_MONTEJA, POS.ESPALDA, POS.CRUCIFIX],
        baja: [POS.MEDIA_GUARDIA],
        escapa: [POS.MEDIA_GUARDIA, POS.GUARDIA_ABIERTA],
        invierte: [POS.MONTEJA],
        rosca: [POS.TORTUGA]
    }),

    // --- brazo y cuello atrapados: el remate de las costillas -------------
    CRUCIFIX: Object.freeze({
        rango: 8,
        nombre: 'Crucifix',
        arriba: true,
        peligro: 8, presion: 1, ventana: 20,
        ataca: [ZONA.CABEZA, ZONA.BRAZO],
        sumision: ['PAJITAS', 'TRICOLOQUEO'],
        sube: [POS.ESPALDA],
        baja: [POS.CONTROL_LATERAL],
        escapa: [POS.CONTROL_LATERAL, POS.MEDIA_GUARDIA],
        invierte: [],
        rosca: [POS.TORTUGA]
    }),

    // --- sentado encima ----------------------------------------------------
    MONTEJA: Object.freeze({
        rango: 9,
        nombre: 'Monteja',
        arriba: true,
        peligro: 9, presion: 0, ventana: 18,
        // Las costillas SI se castigan desde la monteja, y tienen que poder: es
        // donde mas se castiga. Sin esta zona, el remate del spec (las
        // costillas obligan a girar la espalda) se anula justo en la posicion
        // desde la que mas se llega a la espalda, y el sistema entero pierde
        // su razon de ser a media partida.
        ataca: [ZONA.CABEZA, ZONA.TORSO, ZONA.COSTILLAS, ZONA.ESPALDA],
        sumision: ['PAJITAS', 'CODO', 'MATRACA'],
        sube: [POS.MEDIA_MONTEJA],
        baja: [POS.CONTROL_LATERAL],
        escapa: [POS.CONTROL_LATERAL, POS.MEDIA_GUARDIA, POS.TORTUGA],
        invierte: [],
        rosca: [POS.TORTUGA]
    }),

    // --- monteja girada: torso contra rostro -------------------------------
    MEDIA_MONTEJA: Object.freeze({
        rango: 10,
        nombre: 'Media monteja',
        arriba: true,
        peligro: 9, presion: 0, ventana: 16,
        ataca: [ZONA.CABEZA, ZONA.COSTILLAS],
        sumision: ['PAJITAS', 'MATRACA'],
        sube: [POS.ESPALDA],
        baja: [POS.MONTEJA],
        escapa: [POS.MONTEJA, POS.CONTROL_LATERAL],
        invierte: [],
        rosca: [POS.TORTUGA]
    }),

    // --- espalda sin ganchos: se sostiene, pero le falta uno para acabar --
    ESPALDA: Object.freeze({
        rango: 11,
        nombre: 'Espalda (sin gancho)',
        arriba: true,
        peligro: 9, presion: 0, ventana: 12,
        ataca: [ZONA.CABEZA, ZONA.TORSO],
        sumision: ['PAJITAS', 'TRICOLOQUEO'],
        sube: [POS.ESPALDA_GANCHO],
        baja: [POS.MONTEJA, POS.CONTROL_LATERAL],
        escapa: [POS.MONTEJA, POS.CONTROL_LATERAL, POS.TORTUGA],
        invierte: [POS.DE_PIE], // rodar y ponerse de pie: el escape clasico
        rosca: [POS.TORTUGA]
    }),

    // --- espalda con los dos ganchos. Ahi se acaba el suelo --------------
    ESPALDA_GANCHO: Object.freeze({
        rango: 12,
        nombre: 'Espalda con gancho',
        arriba: true,
        peligro: 10, presion: 0, ventana: 0, // 0: no hay salida
        ataca: [ZONA.CABEZA, ZONA.TORSO],
        sumision: ['PAJITAS', 'TRICOLOQUEO', 'MATRACA'],
        sube: [],
        baja: [POS.ESPALDA],
        escapa: [],
        invierte: [],
        rosca: []
    })
});

/** Todas las posiciones, en el orden en que se declararon. */
export const POSICIONES = Object.freeze(Object.keys(T));

/** Cuantos frames cuesta cada tipo de avance, segun lo lejos que se va. */
const COSTE = Object.freeze({
    SUBIR: 18,    // subir un escalon siendo el de arriba
    RETIRAR: 12,  // conceder terreno: es rapido y por eso se hace a proposito
    ESCAPAR: 22,  // salir de pie desde abajo
    INVERTIR: 26, // la inversion: la jugada mas cara y la mas arriesgada
    ROSCAR: 10    // enroscarse: lo mas barato que puede hacer el de abajo
});

/** Info de una posicion. Null si no existe (preferible a inventar una). */
export function info(pos) {
    return Object.prototype.hasOwnProperty.call(T, pos) ? T[pos] : null;
}

/** Que tan mal lo lleva el de abajo: 0..10. 0 si la posicion no existe. */
export function peligroDe(pos) {
    const i = info(pos);
    return i ? i.peligro : 0;
}

/** Cuanto tiene el de arriba atado: 0..10. */
export function presionDe(pos) {
    const i = info(pos);
    return i ? i.presion : 0;
}

/** Frames en los que el de abajo todavia puede escapar o invertir. */
export function ventanaDe(pos) {
    const i = info(pos);
    return i ? i.ventana : 0;
}

/** Cuantas posiciones tienen un "de arriba" (todo menos los dos de pie). */
export function hayArriba(pos) {
    const i = info(pos);
    return !!(i && i.arriba);
}

/**
 * ¿Es `a` peor para el de abajo que `b`?
 *
 * Solo compara por `peligro`. La `presion` va aparte a proposito: la guardia
 * cerrada tiene peligro 2 y presion 8, y una sola pregunta "quien esta mejor"
 * no tiene respuesta. Por eso hay dos funciones y no una.
 */
export function esPeor(a, b) {
    return peligroDe(a) > peligroDe(b);
}

/** El rol contrario. Si el de arriba hace algo, lo hace el de abajo. */
export function otroRol(rol) {
    return rol === ROL.ARRIBA ? ROL.ABAJO : ROL.ARRIBA;
}

/**
 * Las posiciones ordenadas de menos a mas peligro. Copia, no la tabla: si el
 * llamante la ordena se lleva la lista de dentro y rompe la tabla.
 */
export function porPeligro() {
    return POSICIONES.slice().sort((a, b) => peligroDe(a) - peligroDe(b));
}

/**
 * Las posiciones ordenadas por ESCALON, que es el orden real de la escalera
 * (de pie -> guardia -> pasado -> control lateral -> monteja -> espalda).
 *
 * No es lo mismo que `porPeligro`, y la diferencia importa: el peligro se
 * desordena a proposito porque la guardia cerrada es segura para el de abajo y
 * es una posicion baja en la escalera de todas formas. La escalera cuenta
 * CUANTOS pasos hay; el peligro cuenta CUANTO te queda.
 */
export function porRango() {
    return POSICIONES.slice().sort((a, b) => rangoDe(a) - rangoDe(b));
}

/** Eventos de ARRIBA: el de abajo no sube ni retrocede. */
const ARRIBA_EVENTOS = Object.freeze({ [GEV.AVANZAR]: 1, [GEV.RETIRAR]: 1 });

/** Eventos de ABAJO. */
const ABAJO_EVENTOS = Object.freeze({
    [GEV.ESCAPAR]: 1, [GEV.REVERSAR]: 1, [GEV.GUARDAR]: 1, [GEV.LEVANTAR]: 1
});

/**
 * El nucleo: dado donde se esta y quien lo intenta, a donde se acaba y en
 * cuantos frames.
 *
 * @param {string} pos    posicion actual
 * @param {string} rol    ROL.ARRIBA o ROL.ABAJO (quien lo intenta)
 * @param {string} evento una clave de GEV
 * @param {number} framesInside  frames que lleva en esta posicion
 * @returns {object} { ok, to, rol, frames, motivo, ventanaRestante }
 */
export function resolverSuelo(pos, rol, evento, framesInside = 0) {
    const i = info(pos);

    // Posicion que no existe: se dice, no se adivina. Devolver la de pie
    // enmascararia el fallo y el combate seguiria con datos inventados.
    if (!i) {
        return {
            ok: false, to: null, rol: rol, frames: 0,
            motivo: MOTIVO.SIN_SALIDA, ventanaRestante: 0
        };
    }

    // EL EVENTO SE COMPRUEBA ANTES QUE EL ROL, y el orden importa.
    //
    // Un evento que no existe no es un problema de rol. Si se mirase el rol
    // primero, un evento inventado devolveria "ROL_INCORRECTO", y el que
    // este leyendo el motivo iria a buscar un fallo de permisos donde lo que
    // hay es una llamada a un evento inexistente: culpar a quien no es, y en
    // un motor asi cada error se "arregla" en el sitio equivocado.
    if (!ARRIBA_EVENTOS[evento] && !ABAJO_EVENTOS[evento]) {
        return {
            ok: false, to: null, rol: rol, frames: 0,
            motivo: MOTIVO.SIN_SALIDA, ventanaRestante: i.ventana
        };
    }

    // Ahora si: el evento tiene que ser del rol que puede hacerlo. El de
    // arriba no se escapa y el de abajo no sube. Sin este filtro un cambio de
    // estado equivocado se cuela por un lado y rompe la escalera entera.
    const esArriba = rol === ROL.ARRIBA;
    if (!!ARRIBA_EVENTOS[evento] !== esArriba) {
        return {
            ok: false, to: null, rol: rol, frames: 0,
            motivo: MOTIVO.ROL_INCORRECTO, ventanaRestante: i.ventana
        };
    }

    // Que destinos permite esta posicion para ese evento.
    let destinos;
    let coste;
    let ventanaRestante = i.ventana;

    if (evento === GEV.AVANZAR) {
        destinos = i.sube;
        coste = COSTE.SUBIR;
    } else if (evento === GEV.RETIRAR) {
        destinos = i.baja;
        coste = COSTE.RETIRAR;
    } else if (evento === GEV.ESCAPAR) {
        destinos = i.escapa;
        coste = COSTE.ESCAPAR;
    } else if (evento === GEV.REVERSAR) {
        destinos = i.invierte;
        coste = COSTE.INVERTIR;
    } else if (evento === GEV.GUARDAR) {
        destinos = i.rosca;
        coste = COSTE.ROSCAR;
    } else if (evento === GEV.LEVANTAR) {
        // Ponerse de pie se puede desde cualquier posicion donde quede margen, y
        // NO se puede desde las que tienen la ventana a cero (espalda con
        // gancho, tortuga): ahi ya no hay manera de levantarse. Con esto
        // `LEVANTARSE` es de verdad la salida de emergencia y no un boton
        // muerto que nunca sale.
        destinos = i.ventana > 0 ? [POS.DE_PIE] : [];
        coste = COSTE.ESCAPAR;
    }

    if (!destinos.length) {
        return {
            ok: false, to: null, rol: rol, frames: 0,
            motivo: MOTIVO.SIN_SALIDA, ventanaRestante: i.ventana
        };
    }

    // LA VENTANA. Solo afecta a lo que hace el de abajo para salvarse
    // (escapar, invertir, levantarse): el de arriba puede avanzar cuando
    // quiera y el de abajo puede ROSCARSE siempre, porque enroscarse no es
    // salir de nada, es cambiar de postura a cubierto.
    const esSalida = evento === GEV.ESCAPAR || evento === GEV.REVERSAR || evento === GEV.LEVANTAR;
    if (esSalida && !esArriba) {
        ventanaRestante = Math.max(0, i.ventana - Math.max(0, framesInside));
        if (ventanaRestante <= 0) {
            return {
                ok: false, to: null, rol: rol, frames: 0,
                motivo: MOTIVO.FUERA_DE_VENTANA, ventanaRestante: 0
            };
        }
    }

    // Al subir o retirarse el rol se mantiene; al invertir, se da la vuelta.
    const rolFinal = evento === GEV.REVERSAR ? ROL.ARRIBA : rol;

    return {
        ok: true,
        to: destinos[0],
        alternativas: destinos.slice(1),
        rol: rolFinal,
        frames: coste,
        motivo: MOTIVO.LEGAL,
        ventanaRestante: ventanaRestante,
        peligroAntes: i.peligro,
        peligroDespues: peligroDe(destinos[0])
    };
}

/**
 * El peor caso: ¿esta posicion metida en el FINAL en los proximos frames?
 *
 * La segunda mitad de la pregunta es la que hace que valga: se acaba la
 * ventana cuando el de abajo ya no puede salir, pero eso solo es malo si el de
 * arriba NO esta atrapado. En guardia cerrada el de arriba tiene presion 8 y
 * no puede hacer nada aunque se le acabe la ventana: perder la salida no es
 * perder el suelo. Por eso el segundo termino lleva `presion` en la
 * condicion.
 */
export function estaEnPeligro(pos, framesInside) {
    const i = info(pos);
    if (!i) return false;
    if (i.peligro >= 8) return true;
    const sinRemedio = i.ventana > 0 && framesInside >= i.ventana * 0.75;
    return sinRemedio && i.presion < 7;
}

/** El escalon en la escalera. 0 = los dos de pie, 11 = espalda con gancho. */
export function rangoDe(pos) {
    const i = info(pos);
    return i ? i.rango : -1;
}

/**
 * La APROXIMACION al suelo (spec 8, "aproximacion de suelo"): correr hacia el
 * rival derribado o deslizarse en lona. No es una posicion: es como se entra
 * en el combate de suelo.
 */
export const ACERCAMIENTO = Object.freeze({
    CORRER: Object.freeze({ frames: 34, alcance: 2.6, carrera: true, nombre: 'Correr hacia el rival' }),
    DESLIZAR: Object.freeze({ frames: 22, alcance: 3.1, carrera: false, nombre: 'Deslizamiento en lona' }),
    RODAR: Object.freeze({ frames: 26, alcance: 1.8, carrera: false, nombre: 'Rodar hasta el rival' })
});

/**
 * Con que uno se entra al suelo desde el lado del rival caido. El mas rapido
 * es el deslizamiento, y el que mas lejos llega: por eso es el que se usa
 * cuando el rival se ha caido lejos y hay que llegar antes de que se levante.
 */
export function mejorAcercamiento(alcanceNecesario) {
    if (!alcanceNecesario || alcanceNecesario <= 0) return ACERCAMIENTO.RODAR;
    let mejor = ACERCAMIENTO.RODAR;
    for (const k of Object.keys(ACERCAMIENTO)) {
        const a = ACERCAMIENTO[k];
        // Mas rapido Y que llegue vale mas que lento y que no llegue.
        if (a.alcance >= alcanceNecesario && a.frames < mejor.frames) mejor = a;
    }
    return mejor;
}

/**
 * Que hace falta para que una accion de suelo tenga sentido: el de arriba
 * sigue arriba y la posicion no esta ya cerrada.
 * Devuelve la razon si no, que es lo que se enseña en el HUD de depuracion.
 */
export function puedeCastigar(pos, zona) {
    const i = info(pos);
    if (!i || !i.arriba) return { ok: false, motivo: 'NO_HAY_ARRIBA' };
    if (i.presion >= 7) return { ok: false, motivo: 'ATRAPADO' };
    if (i.ataca.indexOf(zona) === -1) return { ok: false, motivo: 'ZONA_NO_ALCANZABLE' };
    return { ok: true, motivo: 'LEGAL' };
}

/** Sumisiones disponibles desde una posicion. */
export function sumisionesDe(pos) {
    const i = info(pos);
    return i && i.arriba ? i.sumision.slice() : [];
}

export default {
    ROL, GEV, MOTIVO, POS, ZONA, POSICIONES,
    COSTE, ACERCAMIENTO,
    info, peligroDe, presionDe, ventanaDe, rangoDe, hayArriba,
    esPeor, otroRol, porPeligro, porRango, resolverSuelo, estaEnPeligro,
    mejorAcercamiento, puedeCastigar, sumisionesDe
};