/**
 * ============================================================================
 * SANPABLERA ENGINE · core/narrative/cuarteto.js
 * ----------------------------------------------------------------------------
 * EL CUARTETO DE CARIBE, CICLOS ROGUELIKE Y SIDEQUESTS
 * (Biblia Apex Primal, seccion 7).
 *
 * QUE HAY AQUI
 * ----------------------------------------------------------------------------
 *   - Cuatro amigos del roster que se encuentran, se miden y se juran alianza.
 *   - Un reparto DETERMINISTA entre quienes llegan a la final en el tatami y
 *     quienes defienden las afueras contra las bandas rivales.
 *   - Ciclos que cambian el reparto y escriben historia: la misma semilla
 *     cuenta siempre la misma partida, pero ganar en un lugar cambia el guion.
 *   - Secretos ligados a LUGARES/ZONAS que PERSISTEN entre campañas.
 *   - Misiones secundarias contadas desde un peleador del roster o desde una
 *     banda rival, con recompensa en Cobre o en reputacion.
 *
 * POR QUE ES UN MODULO PURO
 * ----------------------------------------------------------------------------
 *   La narrativa es una REGLA DEL JUEGO, no un efecto de pantalla. Si estuviera
 *   en la UI no se podria probar sin Babylon, y un reparto que dependiera del
 *   reloj no se podria repetir. Por eso aqui no hay DOM, ni BABYLON, ni fetch,
 *   ni fecha actual: solo datos, una semilla y texto serializable.
 * ============================================================================
 */
import { ROSTER, fullRoster } from '../roster.js';
import { LUGARES, ZONAS, siguiente, abiertos, lugar } from '../geo/margarita.js';
import { ARCHETYPES } from '../archetypes.js';

/** Version del texto guardado. Si cambia la forma, cambia esta numero. */
export const VERSION = 1;

/** Fases por las que pasa la historia. `ENCUENTRO` es el ciclo 0. */
export const FASE = Object.freeze({
    ENCUENTRO: 'ENCUENTRO',
    ALIANZA: 'ALIANZA',
    TATAMI: 'TATAMI',
    AFUERAS: 'AFUERAS',
    FINAL: 'FINAL',
    LEYENDA: 'LEYENDA'
});

/** Los dos frentes en que se parte el cuarteto (PDF: tatami y afueras). */
export const BANDO = Object.freeze({ TATAMI: 'TATAMI', AFUERAS: 'AFUERAS' });

/** Cobre (moneda del juego) o reputacion (lo que da una banda rival). */
export const RECOMPENSA = Object.freeze({
    COBRE: 'COBRE',
    REPUTACION: 'REPUTACION'
});

export const RESULTADO = Object.freeze({ EXITO: 'EXITO', FRACASO: 'FRACASO' });

/**
 * BANDAS RIVALES. Sus ids son los peleadores que `geo/margarita.js` ya pone en
 * cada lugar: no inventamos bandas nuevas, usamos la gente del mapa. Asi una
 * mision "desde las afueras" suena al mismo sitio donde se pelea.
 */
export const RIVALES = Object.freeze({
    GUARDIAN: Object.freeze({ id: 'GUARDIAN', nombre: 'El Guardián', lugar: 'EL_MORRO' }),
    PESCADOR: Object.freeze({ id: 'PESCADOR', nombre: 'El Pescador', lugar: 'PLAYA_AGUA' }),
    PANADERO: Object.freeze({ id: 'PANADERO', nombre: 'El Panadero', lugar: 'PUEBLO_PAN' }),
    CARGA: Object.freeze({ id: 'CARGA', nombre: 'El Cargador', lugar: 'PUERTO_AZUL' }),
    MECANICO: Object.freeze({ id: 'MECANICO', nombre: 'El Mecánico', lugar: 'PUERTO_AZUL' }),
    BAQUERO: Object.freeze({ id: 'BAQUERO', nombre: 'El Baquero', lugar: 'MIRADOR_SECO' }),
    MONTANERO: Object.freeze({ id: 'MONTANERO', nombre: 'El Montanero', lugar: 'SELVA_BORDE' }),
    MONJE: Object.freeze({ id: 'MONJE', nombre: 'El Monje', lugar: 'CRATERA' })
});

/**
 * SECRETOS. Uno por lugar, con su zona: un secreto que no diga DONDE se
 * encuentra no es una pista, es relleno. Los ids son estables para que una
 * partida pueda recordarlos en la siguiente.
 */
export const SECRETOS = Object.freeze({
    SECRETO_PLAYA: Object.freeze({
        id: 'SECRETO_PLAYA', nombre: 'La libreta mojada', lugar: 'PLAYA_AGUA', zona: 'COSTA',
        texto: 'En la playa donde aterriza el torneo alguien anoto quien pierde antes de subir al ring.'
    }),
    SECRETO_MORRO: Object.freeze({
        id: 'SECRETO_MORRO', nombre: 'La señal del Morro', lugar: 'EL_MORRO', zona: 'COSTA',
        texto: 'El Guardián enciende una luz hacia el mar cuando el tatami ya tiene finalista.'
    }),
    SECRETO_PAN: Object.freeze({
        id: 'SECRETO_PAN', nombre: 'El pan sin dueño', lugar: 'PUEBLO_PAN', zona: 'COSTA',
        texto: 'El Panadero deja un pan en cada esquina: es la cuenta de los que defendieron las afueras.'
    }),
    SECRETO_PUERTO: Object.freeze({
        id: 'SECRETO_PUERTO', nombre: 'El registro del puerto', lugar: 'PUERTO_AZUL', zona: 'SUR_SECO',
        texto: 'Los cascos varados esconden quien pago a las bandas para que cerraran el paso.'
    }),
    SECRETO_MIRADOR: Object.freeze({
        id: 'SECRETO_MIRADOR', nombre: 'La marca del risco', lugar: 'MIRADOR_SECO', zona: 'SUR_SECO',
        texto: 'Desde el risco se ve la isla entera, y tambien el sitio exacto donde se partio el cuarteto.'
    }),
    SECRETO_BORDE: Object.freeze({
        id: 'SECRETO_BORDE', nombre: 'La liana cortada', lugar: 'SELVA_BORDE', zona: 'MACIZO',
        texto: 'Alguien abrio paso en la selva antes del torneo: conocia el recorrido de memoria.'
    }),
    SECRETO_CANYON: Object.freeze({
        id: 'SECRETO_CANYON', nombre: 'El eco del cañon', lugar: 'CANYON_SECO', zona: 'MACIZO',
        texto: 'En la garganta se oyen dos golpes por cada pelea: uno en el tatami y otro en las afueras.'
    }),
    SECRETO_VILLA: Object.freeze({
        id: 'SECRETO_VILLA', nombre: 'La casa de piedra negra', lugar: 'VILLA_BASALTICA', zona: 'CERRO',
        texto: 'En la villa hay una casa que nadie alquila: alli duermen los que perdieron la alianza.'
    }),
    SECRETO_CRATERA: Object.freeze({
        id: 'SECRETO_CRATERA', nombre: 'El suelo hueco', lugar: 'CRATERA', zona: 'CERRO',
        texto: 'La final suena a hueco porque debajo de la cratera pasa el camino de las afueras.'
    })
});

/** Lista estable de secretos: para contarlos y para validar un guardado. */
export const SECRETO_IDS = Object.freeze(Object.keys(SECRETOS));

// ---------------------------------------------------------------------------
// DATOS Y UTILIDADES PEQUEÑAS
// ---------------------------------------------------------------------------

/** Numero seguro: un guardado corrupto no debe fabricar NaN ni negativos. */
function num(x) {
    return typeof x === 'number' && Number.isFinite(x) && x > 0 ? Math.floor(x) : 0;
}

/** PRNG lineal: la misma semilla da siempre la misma secuencia (sin Math.random). */
function rng(seed) {
    let s = (num(seed) >>> 0) || 1;
    return () => {
        // Math.imul evita perder precision al multiplicar semillas grandes.
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

/** Firma de los combates ganados, en orden de la ruta (no depende del orden del objeto). */
function firmaGanados(ganados = {}) {
    return LUGARES.reduce((acc, l, i) => acc + num(ganados[l.id]) * (i + 1), 0);
}

/** Lista en texto: "A, B y C", para que la historia se lea como persona. */
function lista(nombres) {
    if (nombres.length === 0) return 'nadie';
    if (nombres.length === 1) return nombres[0];
    return nombres.slice(0, -1).join(', ') + ' y ' + nombres[nombres.length - 1];
}

/** Nombre legible, tanto del roster como de una banda rival. */
export function nombreDe(id) {
    if (RIVALES[id]) return RIVALES[id].nombre;
    const slot = fullRoster().find((s) => s.id === id);
    return slot ? slot.name : String(id);
}

/** Estilo del peleador, para que el texto hable el idioma del roster. */
function estiloDe(id) {
    const slot = fullRoster().find((s) => s.id === id);
    const arq = slot && ARCHETYPES[slot.archetype];
    return arq ? arq.name : 'la calle';
}

/** Un id es valido si sale en el roster (incluido CUSTOM) o en las bandas. */
export function personajeValido(id) {
    if (RIVALES[id]) return true;
    return fullRoster().some((s) => s.id === id);
}

function esRival(id) {
    return !!RIVALES[id];
}

/** Cuarteto: cuatro ids distintos y conocidos. Un duplicado romperia el reparto. */
function validarCuarteto(ids) {
    if (!Array.isArray(ids) || ids.length !== 4) {
        throw new Error('[cuarteto] el cuarteto son cuatro peleadores');
    }
    if (new Set(ids).size !== ids.length) {
        throw new Error('[cuarteto] el cuarteto no puede repetir peleadores');
    }
    for (const id of ids) {
        // Las bandas no son amigos del cuarteto: solo pueden protagonizar misiones.
        if (!fullRoster().some((s) => s.id === id)) {
            throw new Error('[cuarteto] peleador desconocido: ' + id);
        }
    }
    return [...ids];
}

/**
 * REGLA DE EMPAREJAMIENTO (el corazon de la seccion 7).
 *
 * POR QUE UN SORTEO Y NO UNA LISTA FIJA
 *   El PDF dice que los caminos se separan por reglas de emparejamiento, pero
 *   no da numeros de fuerza. Inventar un ranking seria inventar una regla que
 *   el diseno no pidio. Lo que SI es verificable es un sorteo reproducible:
 *   se baraja una COPIA del cuarteto, suben los dos primeros al tatami y los
 *   otros dos defienden las afueras. Dos y dos porque el cuarteto tiene que
 *   seguir teniendo un frente dentro y otro fuera del ring.
 *
 * POR QUE ENTRAN SEMILLA, CICLO Y GANADOS
 *   Semilla: misma partida, mismo reparto (roguelike testeable).
 *   Ciclo: cada vuelta altera la historia, como pide el PDF.
 *   Ganados: conquistar un lugar cambia el sorteo, para que la ruta no sea
 *   decorativa. La firma se calcula en orden de LUGARES, no en orden de claves,
 *   para que dos objetos con los mismos datos den el mismo resultado.
 */
export function repartir(cuarteto, seed, ciclo, ganados = {}) {
    const baraja = [...cuarteto];
    const random = rng((num(seed) + num(ciclo) * 7919 + firmaGanados(ganados) * 104729) >>> 0);
    for (let i = baraja.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        const tmp = baraja[i];
        baraja[i] = baraja[j];
        baraja[j] = tmp;
    }
    const corte = Math.ceil(baraja.length / 2);
    return { tatami: baraja.slice(0, corte), afueras: baraja.slice(corte) };
}

/** Escenario que manda la ruta; con la isla entera abierta, la final. */
function escenarioDe(ganados) {
    return siguiente(ganados) || abiertos(ganados).slice(-1)[0] || LUGARES[0];
}

// ---------------------------------------------------------------------------
// CAMPAÑA
// ---------------------------------------------------------------------------

/**
 * Crea una campaña. `opts.desde` trae el texto de una partida anterior: los
 * secretos y la historia sobreviven, el resto del torneo vuelve a empezar. Eso
 * es lo que hace que descubrir un secreto "sirva para la siguiente partida".
 */
export function createCampaign(opts = {}) {
    const anterior = opts.desde ? deserialize(opts.desde) : null;
    const seed = opts.seed !== undefined ? num(opts.seed) : (anterior ? anterior.seed : 1);
    const cuarteto = opts.cuarteto !== undefined
        ? validarCuarteto(opts.cuarteto)
        : fullRoster().slice(0, 4).map((s) => s.id);
    const inicio = escenarioDe({});

    const historia = anterior ? [...anterior.historia] : [
        'Ciclo 0 · ' + inicio.nombre + ': ' + lista(cuarteto.map(nombreDe))
        + ' se encuentran. Primero se miden; al ver quien viene por las afueras, juran alianza.'
    ];

    return {
        seed,
        ciclo: 0,
        historia,
        secretoConocidos: anterior ? [...anterior.secretoConocidos] : [],
        cuarteto,
        bando: { tatami: [], afueras: [] },
        misiones: {},
        ganados: {},
        fase: FASE.ENCUENTRO,
        lugar: inicio.id,
        evento: null,
        cobre: 0,
        reputacion: 0
    };
}

/**
 * Avanza un ciclo. `ganados` es el contador acumulado por lugar, igual que en
 * `geo/margarita.js`; se COPIA dentro del estado para no tocar el objeto que
 * pasa el llamador. Devuelve el reparto y el texto del evento para la UI.
 */
export function nextCycle(state, ganados = {}) {
    state.ciclo += 1;
    if (ganados && typeof ganados === 'object') {
        for (const l of LUGARES) {
            if (ganados[l.id] !== undefined) state.ganados[l.id] = num(ganados[l.id]);
        }
    }

    const escenario = escenarioDe(state.ganados);
    state.lugar = escenario.id;

    const lados = repartir(state.cuarteto, state.seed, state.ciclo, state.ganados);
    state.bando = { tatami: [...lados.tatami], afueras: [...lados.afueras] };

    /*
     * POR QUE ESTA PROGRESION DE FASES
     *   El primer ciclo es la alianza del PDF: los cuatro dejan de pelearse.
     *   Despues se alternan tatami y afueras para que la historia no se quede
     *   mirando un solo frente. Si la isla ya esta entera, la historia entra en
     *   FINAL; si se sigue llamando, en LEYENDA (nunca se repite una fase
     *   pegada, que es lo que haria que el texto parezca congelado).
     */
    if (!siguiente(state.ganados)) {
        state.fase = state.fase === FASE.FINAL ? FASE.LEYENDA : FASE.FINAL;
    } else if (state.ciclo === 1) {
        state.fase = FASE.ALIANZA;
    } else {
        state.fase = state.ciclo % 2 === 0 ? FASE.TATAMI : FASE.AFUERAS;
    }

    const tatami = lados.tatami.map(nombreDe);
    const afueras = lados.afueras.map(nombreDe);
    const evento = 'Ciclo ' + state.ciclo + ' · ' + state.fase + ' en ' + escenario.nombre
        + ': ' + lista(tatami) + ' ' + (tatami.length === 1 ? 'sube' : 'suben') + ' al tatami ('
        + lista(lados.tatami.map(estiloDe)) + '); ' + lista(afueras) + ' '
        + (afueras.length === 1 ? 'defiende' : 'defienden') + ' las afueras.';
    state.evento = evento;
    state.historia.push(evento);

    if (state.ciclo === 1) {
        state.historia.push('Los cuatro dejaron de pelearse en ' + escenario.nombre
            + ': la alianza dura solo hasta que el tatami y las afueras eligen bando.');
    }

    return {
        ciclo: state.ciclo,
        tatami: [...lados.tatami],
        afueras: [...lados.afueras],
        evento
    };
}

/** Descubre un secreto. Solo la PRIMERA vez cuenta; asi no se duplica el lore. */
export function discoverSecret(state, id) {
    const secreto = SECRETOS[id];
    if (!secreto || state.secretoConocidos.includes(id)) return false;
    state.secretoConocidos.push(id);
    const where = lugar(secreto.lugar);
    // El texto largo del secreto vive en la tabla; la historia solo guarda
    // que se encontro, para que el guardado no repita lore dos veces.
    state.historia.push('Secreto de ' + (where ? where.nombre : secreto.lugar)
        + ': ' + secreto.nombre + '.');
    return true;
}

// ---------------------------------------------------------------------------
// MISIONES SECUNDARIAS
// ---------------------------------------------------------------------------

/** Objetivo por defecto: la zona del lugar manda lo que hay que hacer. */
function objetivoPor(personajeId, escenario) {
    const zona = ZONAS[escenario.zona];
    const nombre = nombreDe(personajeId);
    if (esRival(personajeId)) {
        return 'Detener a ' + nombre + ' en ' + escenario.nombre
            + ' antes de que cierre el paso de ' + (zona ? zona.nombre : escenario.zona) + '.';
    }
    return 'Cruzar ' + escenario.nombre + ' con ' + nombre
        + ' y aguantar el rasgo de ' + (zona ? zona.rasgo : 'la isla') + ' hasta la final.';
}

/**
 * POR QUE DOS MONEDAS DE RECOMPENSA
 *   Un amigo del cuarteto cobra en Cobre, como en el resto del juego. Una banda
 *   rival no lleva monedero: lo que puede dar es reputacion, que es lo que
 *   importa cuando peleas desde su perspectiva.
 */
function recompensaPor(definicion, personajeId, ciclo) {
    if (definicion === undefined || definicion === null) {
        return {
            tipo: esRival(personajeId) ? RECOMPENSA.REPUTACION : RECOMPENSA.COBRE,
            cantidad: 50 + num(ciclo) * 10
        };
    }
    if (typeof definicion === 'string' && RECOMPENSA[definicion]) {
        return { tipo: definicion, cantidad: 50 + num(ciclo) * 10 };
    }
    if (definicion && typeof definicion === 'object'
        && RECOMPENSA[definicion.tipo] && num(definicion.cantidad) > 0) {
        return { tipo: definicion.tipo, cantidad: num(definicion.cantidad) };
    }
    throw new Error('[cuarteto] recompensa desconocida');
}

/**
 * Abre una mision desde un peleador del roster o desde una banda rival. Nadie
 * mas puede contarla: el cuarteto no contrata a cualquiera.
 */
export function startSidequest(state, personajeId, opts = {}) {
    if (!personajeValido(personajeId)) {
        throw new Error('[cuarteto] personaje desconocido: ' + personajeId);
    }
    const numero = Object.keys(state.misiones).length + 1;
    const id = 'SQ' + state.ciclo + '_' + numero + '_' + personajeId;
    if (state.misiones[id]) throw new Error('[cuarteto] mision repetida: ' + id);

    let escenario = escenarioDe(state.ganados);
    if (opts.lugar !== undefined && opts.lugar !== null) {
        escenario = lugar(opts.lugar);
        if (!escenario) throw new Error('[cuarteto] lugar desconocido: ' + opts.lugar);
    }

    const mision = {
        id,
        personaje: personajeId,
        lugar: escenario.id,
        objetivo: opts.objetivo ? String(opts.objetivo) : objetivoPor(personajeId, escenario),
        recompensa: recompensaPor(opts.recompensa, personajeId, state.ciclo),
        estado: 'ABIERTA'
    };
    state.misiones[id] = mision;
    state.historia.push('Misión ' + id + ': ' + nombreDe(personajeId)
        + ' se encarga de ' + escenario.nombre + '.');
    return mision;
}

/** Interpreta el resultado sin exigir mayusculas al que llama desde la UI. */
function exitoDe(resultado) {
    if (resultado === true) return true;
    if (resultado === false) return false;
    if (typeof resultado !== 'string') return null;
    const r = resultado.trim().toUpperCase();
    if (['EXITO', 'ÉXITO', 'VICTORIA', 'GANADO', 'LOGRADO', 'SI', 'SÍ'].includes(r)) return true;
    if (['FRACASO', 'DERROTA', 'PERDIDO', 'NO'].includes(r)) return false;
    return null;
}

/**
 * Cierra una mision y paga UNA sola vez. El pago va detras del cambio de
 * estado: si se llama dos veces con el mismo id, la segunda no encuentra una
 * mision ABIERTA y no vuelve a sumar Cobre ni reputacion.
 */
export function resolveSidequest(state, misionId, resultado = RESULTADO.EXITO) {
    const mision = state.misiones[misionId];
    if (!mision) return { ok: false, motivo: 'mision desconocida' };
    if (mision.estado !== 'ABIERTA') return { ok: false, motivo: 'ya cerrada' };
    const exito = exitoDe(resultado);
    if (exito === null) return { ok: false, motivo: 'resultado desconocido' };

    mision.estado = 'CERRADA';
    mision.resultado = exito ? RESULTADO.EXITO : RESULTADO.FRACASO;
    mision.cobrado = false;
    let pagada = null;
    if (exito) {
        pagada = { ...mision.recompensa };
        if (mision.recompensa.tipo === RECOMPENSA.COBRE) {
            state.cobre += mision.recompensa.cantidad;
        } else {
            state.reputacion += mision.recompensa.cantidad;
        }
        mision.cobrado = true;
    }
    state.historia.push('Misión ' + mision.id + ' cerrada: ' + mision.resultado + '.');
    return { ok: true, resultado: mision.resultado, recompensa: pagada };
}

// ---------------------------------------------------------------------------
// GUARDADO Y TEXTO PARA LA UI
// ---------------------------------------------------------------------------

/**
 * Texto compacto. Las claves cortas no son un capricho: un guardado por
 * partida se escribe cada ciclo, y el costo de escribir kilobytes en un movil
 * se nota. `m` guarda las misiones como filas para no repetir sus claves.
 */
export function serialize(state) {
    return JSON.stringify({
        v: VERSION,
        s: state.seed,
        c: state.ciclo,
        h: state.historia,
        x: state.secretoConocidos,
        q: state.cuarteto,
        b: [state.bando.tatami, state.bando.afueras],
        m: Object.values(state.misiones).map((m) => [
            m.id, m.personaje, m.lugar, m.objetivo,
            m.recompensa.tipo, m.recompensa.cantidad,
            m.estado, m.resultado || '', m.cobrado ? 1 : 0
        ]),
        g: state.ganados,
        f: state.fase,
        l: state.lugar,
        e: state.evento,
        o: state.cobre,
        r: state.reputacion
    });
}

/** Lee un guardado. Una version que no conocemos se rechaza, nunca se adivina. */
export function deserialize(texto) {
    let o;
    try {
        o = JSON.parse(texto);
    } catch (err) {
        throw new Error('[cuarteto] texto de campaña invalido');
    }
    if (!o || typeof o !== 'object' || o.v !== VERSION) {
        throw new Error('[cuarteto] version de campaña desconocida: ' + (o && o.v));
    }

    const misiones = {};
    if (Array.isArray(o.m)) {
        for (const fila of o.m) {
            if (!Array.isArray(fila) || fila.length < 6 || !fila[0] || !lugar(fila[2])) continue;
            misiones[fila[0]] = {
                id: String(fila[0]),
                personaje: String(fila[1]),
                lugar: String(fila[2]),
                objetivo: String(fila[3] || ''),
                recompensa: {
                    tipo: RECOMPENSA[fila[4]] ? fila[4] : RECOMPENSA.COBRE,
                    cantidad: Math.max(1, num(fila[5]))
                },
                estado: fila[6] === 'CERRADA' ? 'CERRADA' : 'ABIERTA',
                resultado: fila[7] || undefined,
                cobrado: !!fila[8]
            };
        }
    }

    const secretos = [];
    if (Array.isArray(o.x)) {
        for (const id of o.x) {
            if (SECRETOS[id] && !secretos.includes(id)) secretos.push(id);
        }
    }
    const cuarteto = Array.isArray(o.q) ? o.q : [];
    const bandas = Array.isArray(o.b) ? o.b : [[], []];

    return {
        seed: num(o.s),
        ciclo: num(o.c),
        historia: Array.isArray(o.h) ? o.h.filter((h) => typeof h === 'string') : [],
        secretoConocidos: secretos,
        cuarteto: cuarteto.length === 4 ? [...cuarteto] : fullRoster().slice(0, 4).map((s) => s.id),
        bando: {
            tatami: Array.isArray(bandas[0]) ? [...bandas[0]] : [],
            afueras: Array.isArray(bandas[1]) ? [...bandas[1]] : []
        },
        misiones,
        ganados: o.g && typeof o.g === 'object' ? { ...o.g } : {},
        fase: FASE[o.f] ? o.f : FASE.ENCUENTRO,
        lugar: lugar(o.l) ? o.l : LUGARES[0].id,
        evento: typeof o.e === 'string' ? o.e : null,
        cobre: num(o.o),
        reputacion: num(o.r)
    };
}

/** Texto corto para la UI. Nombra el frente, el lugar y lo ya descubierto. */
export function resumen(state) {
    const abiertas = Object.values(state.misiones).filter((m) => m.estado === 'ABIERTA').length;
    const escenario = lugar(state.lugar);
    return 'Ciclo ' + state.ciclo + ' · ' + state.fase + ' · '
        + (escenario ? escenario.nombre : state.lugar) + '\n'
        + 'Tatami: ' + state.bando.tatami.map(nombreDe).join(', ') + ' | Afueras: '
        + state.bando.afueras.map(nombreDe).join(', ') + '\n'
        + 'Secretos ' + state.secretoConocidos.length + '/' + SECRETO_IDS.length
        + ' · Misiones abiertas ' + abiertas
        + ' · Cobre ' + state.cobre + ' · Reputación ' + state.reputacion;
}

export default {
    VERSION, FASE, BANDO, RECOMPENSA, RESULTADO, RIVALES, SECRETOS, SECRETO_IDS,
    createCampaign, nextCycle, discoverSecret, startSidequest, resolveSidequest,
    serialize, deserialize, resumen, repartir, personajeValido, nombreDe
};
