/**
 * ============================================================================
 * SANPABLERA ENGINE · core/geo/venezuela.js
 * ----------------------------------------------------------------------------
 * LA FRONTERA DE VENEZUELA. DATO, NO DIBUJO.
 * ============================================================================
 *
 * DE DONDE SALE
 *   Natural Earth, 110m admin-0 countries, la geometria oficial de Venezuela,
 *   simplificada con Douglas-Peucker (tolerancia 0.09 grados) y recortada al
 *   anillo exterior. Islas: 0 (no se guardan; a esta escala son
 *   invisibles y Margarita se dibuja aparte, marcada).
 *
 * POR QUE SE GENERA Y NO SE ESCRIBE A MANO
 *   Un pais dibujado de memoria no es un pais: es una forma que se parece. Y en
 *   este motor la geografia no es decoracion, es lo que coloca los escenarios.
 *   Si la frontera de Venezuela se aparta de la real, el mapa miente. Este
 *   fichero sale de una fuente con nombre, con la tolerancia escrita, y se puede
 *   regenerar.
 *
 * QUE NO ES
 *   No es el mapa del torneo. El del torneo es Margarita (margarita.js), en
 *   kilometros reales de la isla. Este es el PAIS, en grados, y sirve para
 *   encuadrar y para decir donde cae la isla dentro del continente.
 *
 * UN AVISO QUE IMPORTA
 *   Natural Earth simplify fronterasPoliticas a proposito: el limites con
 *   Guyana dispute sigue siendo el dibujado por la ONU. Aqui no se toma
 *   partido a nada, se dibuja una linea y ya esta.
 */

/** Grados. El anillo exterior, cerrado, simplificado. */
export const FRONTERA = Object.freeze([
    [-60.734, 5.2],
    [-60.601, 4.918],
    [-60.967, 4.536],
    [-62.085, 4.162],
    [-62.805, 4.007],
    [-63.093, 3.771],
    [-63.888, 4.021],
    [-64.629, 4.148],
    [-64.816, 4.056],
    [-64.368, 3.797],
    [-64.409, 3.127],
    [-64.27, 2.497],
    [-63.423, 2.411],
    [-63.369, 2.201],
    [-64.083, 1.916],
    [-64.199, 1.493],
    [-64.611, 1.329],
    [-65.355, 1.095],
    [-65.548, 0.789],
    [-66.326, 0.724],
    [-66.876, 1.253],
    [-67.181, 2.251],
    [-67.447, 2.6],
    [-67.81, 2.821],
    [-67.303, 3.318],
    [-67.823, 4.504],
    [-67.745, 5.221],
    [-67.522, 5.557],
    [-67.341, 6.095],
    [-67.695, 6.267],
    [-69.389, 6.1],
    [-70.093, 6.96],
    [-70.674, 7.088],
    [-71.96, 6.992],
    [-72.198, 7.34],
    [-72.444, 7.424],
    [-72.44, 8.405],
    [-72.66, 8.625],
    [-72.789, 9.085],
    [-73.305, 9.152],
    [-73.028, 9.737],
    [-72.905, 10.45],
    [-72.615, 10.822],
    [-72.228, 11.109],
    [-71.974, 11.609],
    [-71.332, 11.776],
    [-71.36, 11.54],
    [-71.947, 11.423],
    [-71.621, 10.969],
    [-71.633, 10.446],
    [-72.074, 9.866],
    [-71.696, 9.072],
    [-71.265, 9.137],
    [-71.04, 9.86],
    [-71.35, 10.212],
    [-71.401, 10.969],
    [-70.155, 11.375],
    [-70.294, 11.847],
    [-69.943, 12.162],
    [-69.584, 11.46],
    [-68.883, 11.443],
    [-68.233, 10.886],
    [-68.194, 10.555],
    [-67.296, 10.546],
    [-66.228, 10.649],
    [-65.655, 10.201],
    [-64.89, 10.077],
    [-64.329, 10.39],
    [-64.318, 10.641],
    [-63.079, 10.702],
    [-61.881, 10.716],
    [-62.73, 10.42],
    [-62.389, 9.948],
    [-61.589, 9.873],
    [-60.831, 9.381],
    [-60.671, 8.58],
    [-60.15, 8.603],
    [-59.758, 8.367],
    [-60.551, 7.78],
    [-60.638, 7.415],
    [-60.296, 7.044],
    [-60.544, 6.857],
    [-61.159, 6.696],
    [-61.139, 6.234],
    [-61.41, 5.959]
]);

/** La caja que encuadra el dibujo. */
export const CAJA = Object.freeze({
    minX: -73.305, maxX: -59.758,
    minY: 0.724, maxY: 12.162
});

/** Margarita, en grados, para marcarla sobre el pais. */
export const MARGARITA = Object.freeze({ lon: -63.85, lat: 11 });

/**
 * La frontera como UNA ruta SVG, ya escalada al recuadro que se le pase.
 *
 * @param {{ancho:number, alto:number, margen?:number}} caja  el recuadro destino
 * @returns {string}  el atributo d
 */
export function camino(caja) {
    const m = caja.margen == null ? 4 : caja.margen;
    const w = CAJA.maxX - CAJA.minX, h = CAJA.maxY - CAJA.minY;
    const s = Math.min((caja.ancho - m * 2) / w, (caja.alto - m * 2) / h);
    const ox = (caja.ancho - w * s) / 2 - CAJA.minX * s;
    const oy = (caja.alto - h * s) / 2 - CAJA.minY * s;
    return 'M' + FRONTERA.map(p => (p[0] * s + ox).toFixed(2) + ',' + (p[1] * s + oy).toFixed(2)).join('L') + 'Z';
}

/** Un punto (lon, lat) en el mismo sistema que `camino()`. */
export function proyectar(lon, lat, caja) {
    const m = caja.margen == null ? 4 : caja.margen;
    const w = CAJA.maxX - CAJA.minX, h = CAJA.maxY - CAJA.minY;
    const s = Math.min((caja.ancho - m * 2) / w, (caja.alto - m * 2) / h);
    const ox = (caja.ancho - w * s) / 2 - CAJA.minX * s;
    const oy = (caja.alto - h * s) / 2 - CAJA.minY * s;
    return [lon * s + ox, lat * s + oy];
}
