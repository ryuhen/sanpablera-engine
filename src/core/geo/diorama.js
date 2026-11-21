/**
 * ============================================================================
 * SANPABLERA ENGINE · core/geo/diorama.js
 * ----------------------------------------------------------------------------
 * LA MAQUETA. La isla de margarita.js convertida en datos de escenario.
 * ============================================================================
 *
 * QUE ES ESTO
 *   Un puente PURO entre la geografia (km) y el render (metros de escenario).
 *   Aqui no hay BABYLON ni DOM: solo numeros, colores y descriptores planos.
 *   El render/ lee esto y decide como dibujarlo; el core/ lee esto y decide
 *   a donde mirar. Como los dos salen del mismo sitio, el mapa y la camara
 *   nunca discuten sobre donde esta El Morro.
 *
 * POR QUE HAY UNA ESCALA
 *   margarita.js mide la isla en kilometros (1 unidad = 1 km), que es lo que
 *   necesita el mapa SVG. Un ring de pelea mide metros: si se dibujase la isla
 *   a tamaño real, el tatami seria un grano de arena. Esta maqueta es una
 *   miniaturesa: 0,35 m de escenario por cada km de isla, con el origen en el
 *   CENTRO de la caja para que la isla quede alrededor de (0, 0) y no a 30 m
 *   de distancia del ring.
 *
 * QUE SE DEVUELVE
 *   `buildDioramaData()` da contorno, zonas, hitos y caja ya escalados. Todo
 *   determinista: la misma entrada produce el MISMO objeto (incluido el orden
 *   de las claves), para poder compararlo en los tests con JSON.stringify.
 * ============================================================================
 */

import { CAJAS, LUGARES, ZONAS, abiertos, contornoCerrado, siguiente } from './margarita.js';

/** Metros de escenario por kilometro de isla. */
export const ESCALA_POR_DEFECTO = 0.35;

/** Radio de busqueda de `hitoEn`, en metros de escenario. */
export const RADIO_HITO = 1.2;

/** Color de la isla cuando una zona no dice lo contrario. */
const COLOR_BASE = '#e8d9a8';

/** Numero fijo de decimales: evita ruido de coma flotante en los datos. */
const REDONDEO = 6;

function redondear(n) {
    return +n.toFixed(REDONDEO);
}

/** La escala pedida, o la de defecto si viene rara (0, negativa, NaN...). */
function escalaDe(opts) {
    const e = opts && opts.escala;
    return typeof e === 'number' && Number.isFinite(e) && e > 0 ? e : ESCALA_POR_DEFECTO;
}

/** Un punto [x, y] de margarita.js a [x, z] de escenario, centrado. */
function aEscena(x, y, escala, centro) {
    return [redondear((x - centro.x) * escala), redondear((y - centro.y) * escala)];
}

/** Mezcla dos hexadecimosales. `t=0` devuelve a, `t=1` devuelve b. */
function mezclar(a, b, t) {
    const partes = (hex) => {
        const h = String(hex || '').replace('#', '');
        const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
        return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [255, 255, 255];
    };
    const ca = partes(a), cb = partes(b);
    const k = Math.max(0, Math.min(1, t));
    return '#' + ca.map((v, i) => Math.round(v + (cb[i] - v) * k)
        .toString(16).padStart(2, '0')).join('');
}

/**
 * Los datos planos de la maqueta.
 *
 * @param {object} [opts]
 *   escala   metros de escenario por km (0,35 por defecto)
 *   ganados  `{ LUGAR: combates }`, el contador del torneo
 * @returns {{caja:object, escala:number, isla:object, zonas:object[], hitos:object[], meta:object}}
 */
export function buildDioramaData(opts = {}) {
    const escala = escalaDe(opts);
    const ganados = opts.ganados && typeof opts.ganados === 'object' ? opts.ganados : {};
    // El origen de la maqueta es el centro de la isla, no su esquina: asi la
    // silueta queda colgada de (0,0) y la camara puede mirar al centro sin
    // saber nada de geografia.
    const centro = {
        x: (CAJAS.minX + CAJAS.maxX) / 2,
        y: (CAJAS.minY + CAJAS.maxY) / 2
    };
    const convertir = (x, y) => aEscena(x, y, escala, centro);

    // El contorno ya cierra (el ultimo punto repite al primero). Eso es justo
    // lo que CreateRibbon necesita para dibujar la silueta sin un hueco.
    const vertices = contornoCerrado().map(([x, y]) => convertir(x, y));

    const c0 = convertir(CAJAS.minX, CAJAS.minY);
    const c1 = convertir(CAJAS.maxX, CAJAS.maxY);
    const caja = {
        minX: c0[0], maxX: c1[0],
        minZ: c0[1], maxZ: c1[1],
        ancho: redondear(c1[0] - c0[0]),
        alto: redondear(c1[1] - c0[1]),
        centro: [0, 0]
    };

    // Las manchas de zona salen de los lugares de cada zona, como en IslandMap.
    // Nada de tablas de centros a mano: si se mueve un escenario, la mancha se
    // mueve sola.
    const zonas = Object.keys(ZONAS).map((id) => {
        const z = ZONAS[id];
        const propios = LUGARES.filter(l => l.zona === id);
        const pts = propios.map(l => convertir(l.arena.x, l.arena.z));
        const centroZ = pts.length
            ? [redondear(pts.reduce((s, p) => s + p[0], 0) / pts.length),
                redondear(pts.reduce((s, p) => s + p[1], 0) / pts.length)]
            : [0, 0];
        const radio = pts.length
            ? redondear(Math.max(...pts.map(p => Math.hypot(p[0] - centroZ[0], p[1] - centroZ[1]))) * 1.25 + escala)
            : escala * 4;
        return {
            id: z.id,
            nombre: z.nombre,
            color: z.color,
            centro: centroZ,
            radio,
            hitos: propios.map(l => l.id)
        };
    });

    const abiertas = new Set(abiertos(ganados).map(l => l.id));
    const sig = siguiente(ganados);
    const hitos = LUGARES.map((l) => {
        const [x, z] = convertir(l.arena.x, l.arena.z);
        const zona = ZONAS[l.zona];
        return {
            id: l.id,
            nombre: l.nombre,
            zona: l.zona,
            x,
            z,
            // piso se deja en km (fiel a margarita.js); `y` es su altura ya
            // escalada para que el render no tenga que repetir la cuenta.
            piso: l.arena.piso,
            y: redondear(l.arena.piso * escala),
            ancho: redondear(l.arena.ancho * escala),
            alto: redondear(l.arena.alto * escala),
            color: zona ? zona.color : COLOR_BASE,
            abierto: abiertas.has(l.id),
            siguiente: !!sig && sig.id === l.id
        };
    });

    const meta = {
        escala,
        unidades: 'm',
        origen: 'centro',
        cajaKm: { ...CAJAS },
        verticesContorno: vertices.length,
        totalHitos: hitos.length,
        totalZonas: zonas.length,
        abiertos: abiertas.size,
        siguiente: sig ? sig.id : null
    };

    return { caja, escala, isla: { vertices }, zonas, hitos, meta };
}

/**
 * El hito mas cercano a un punto, siempre que caiga dentro de `radio`.
 * Sin radio no hay pick: evitar marcar un sitio que el jugador no ha tocado.
 *
 * @param {object} data  lo que devuelve buildDioramaData()
 * @param {number} x     metros de escenario
 * @param {number} z     metros de escenario
 * @param {number} [radio]
 * @returns {object|null}
 */
export function hitoEn(data, x, z, radio = RADIO_HITO) {
    if (!data || !Array.isArray(data.hitos)) return null;
    let mejor = null;
    let mejorDistancia = Infinity;
    for (const h of data.hitos) {
        const d = Math.hypot(h.x - x, h.z - z);
        if (d < mejorDistancia) { mejorDistancia = d; mejor = h; }
    }
    if (!mejor || mejorDistancia > radio) return null;
    return mejor;
}

/** Los hitos ya conquistados (o al menos disponibles) en orden de ruta. */
export function hitosAbiertos(data) {
    if (!data || !Array.isArray(data.hitos)) return [];
    return data.hitos.filter(h => h.abierto);
}

/** El peldaño siguiente de la ruta, o `null` si ya se recorrio la isla. */
export function siguienteHito(data) {
    if (!data || !Array.isArray(data.hitos)) return null;
    return data.hitos.find(h => h.siguiente) || null;
}

/**
 * Datos de zoom para la camara. El motor decide como aplicarlos: aqui solo se
 * calculan el punto al que mirar y el radio que encuadra la arena.
 * Sin id se devuelve la vista general de la maqueta, para no dejar la camara
 * mirando al vacio cuando el goal todavia no existe.
 *
 * @param {object} data
 * @param {string} [hitoId]
 * @returns {{target:number[], radius:number}}
 */
export function zoomPara(data, hitoId) {
    const h = hitoId && data && Array.isArray(data.hitos)
        ? data.hitos.find(x => x.id === hitoId)
        : null;
    if (h) {
        const base = Math.max(h.ancho || 2, h.alto || 2);
        return {
            target: [h.x, redondear((h.y || 0) + 0.9), h.z],
            radius: redondear(base * 1.15 + 3.2)
        };
    }
    const caja = data && data.caja ? data.caja : { ancho: 12, alto: 5 };
    const general = Math.max(caja.ancho || 0, caja.alto || 0) * 0.62;
    return { target: [0, 0, 0], radius: general > 0 ? redondear(general) : 6 };
}

/**
 * La paleta del suelo al entrar en un hito. Se deriva de ZONAS, no se escribe
 * a mano: el color del tatami es el de la zona aclarado, y el borde es el mismo
 * oscurecido, asi que un cambio en la zona cambia toda la mesa de una vez.
 *
 * @param {object|string} hito  un hito de la maqueta (o un id de zona)
 * @returns {{zona:string, nombre:string, suelo:string, tatami:string, borde:string, acento:string, hito:string|null}}
 */
export function aPaleta(hito) {
    const id = typeof hito === 'string' ? hito : (hito && hito.zona);
    const z = ZONAS[id] || ZONAS.COSTA;
    const suelo = z.color;
    return {
        zona: z.id,
        nombre: z.nombre,
        suelo,
        tatami: mezclar(suelo, '#ffffff', 0.42),
        borde: mezclar(suelo, '#05070f', 0.72),
        acento: mezclar(suelo, '#ffd447', 0.62),
        hito: hito && typeof hito === 'object' ? hito.id : null
    };
}

export default buildDioramaData;
