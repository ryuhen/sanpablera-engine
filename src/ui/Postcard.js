/**
 * ============================================================================
 * SANPABLERA ENGINE · ui/Postcard.js
 * ----------------------------------------------------------------------------
 * LO QUE SE VE MIENTRAS CARGA: VENEZUELA, Y DONDE ESTA MARGARITA.
 * ============================================================================
 *
 * POR QUE EL PAIS Y NO LA ISLA
 *   La primera version de esta tarjeta dibujaba la silueta de Margarita con
 *   `CONTORNO`, el mismo poligono del mapa del torneo. Se veia bien y era
 *   verdad, pero no decia nada: no situaba la isla en ningun sitio. Un jugador
 *   que no conozca Margarita veia una mancha con una palabra debajo.
 *
 *   Dibujando el PAIS, el sitio se entiende solo: la isla es este punto de la
 *   costa justa al norte, y la costa es este borde. El dibujo pasa a ser un mapa y no
 *   un adorno, sin cambiar nada del motor.
 *
 * DE DONDE SALE LA FRONTERA
 *   De Natural Earth (110m admin-0), generada UNA vez a `core/geo/venezuela.js`
 *   y guardada alli. No se dibuja de memoria: una frontera apurada de memoria
 *   es una forma que se parece a un pais, y en este motor la geografia es lo
 *   que coloca los escenarios. Ademas el mapa del torneo usa `CONTORNO`, en
 *   kilometros de la isla; este usa grados del pais. Son dos medidas y dos
 *   unidades, a proposito: no se mezclan.
 *
 * LO QUE VA DE MAQUETA
 *   Este es el hueco donde luego iran los clips de animacion y las reglas del
 *   juego, cambiando de tip cada cinco segundos. La estructura ya esta preparada
 *   (una tarjeta, un dibujo arriba, un texto abajo con dos lineas) y el contenu
 *   es lo primero que se cambia. `TIPS` esta vacio a proposito: no se inventa un
 *   tip que luego haya que quitar, y la funcion que lo recorreria ya esta.
 */
import { MARGARITA, camino, proyectar } from '../core/geo/venezuela.js';

const NS = 'http://www.w3.org/2000/svg';

/** Recuadro de la foto dentro de la tarjeta. */
const FOTO = { x: 4.2, y: 4.2, w: 91.6, h: 43 };

/**
 * LOS TIPS. VACIO A PROPOSITO.
 *
 * El plan es que aqui roten las reglas y los clips, uno cada cinco segundos.
 * No se escriben todavia porque un tip inventado es contenido falso que alguien
 * tendra que quitar cuando llegue el real, y porque la lista crece sola: cada
 * regla que se escriba en el motor es un tip mas.
 *
 * @type {Array<{titulo:string, texto:string}>}
 */
export const TIPS = Object.freeze([]);

/** Cada cuanto cambia. En milisegundos. */
export const CADA_TIP = 5000;

function el(nombre, attrs, ...hijos) {
    const n = document.createElementNS(NS, nombre);
    if (attrs) for (const k of Object.keys(attrs)) n.setAttribute(k, attrs[k]);
    for (const h of hijos) if (h) n.appendChild(h);
    return n;
}

function marco() {
    // `camino()` y `proyectar()` esperan `{ancho, alto, margen}` y el marco de
    // la foto se escribe `{x, y, w, h}`. Se traduce aqui, en UN sitio, porque
    // pasarle el marco tal cual hacia que la escala salga de `undefined`: la
    // division por `undefined` es NaN, y un `d` lleno de NaN no dibuja nada ni
    // avisa. El marco salia en negro con el pais dentro que no se veia.
    return { ancho: FOTO.w, alto: FOTO.h, margen: 0 };
}

/**
 * La grilla de grados.
 *
 * POR QUE ESTA
 *   Un contorno de pais dibujado solo es un ameba. Con lineas de latitud y
 *   longitud debajo se lee como un mapa, y el jugador puede preguntar "donde
 *   cae eso" con la mirada. Ademas da la escala de un vistazo: Venezuela mide
 *   unos 1200 km de este a oeste y aqui ocupa casi todo el ancho.
 */
function grilla(caja) {
    const g = el('g', { class: 'sp-pais-grilla' });
    // Meridianos cada 5 grados y paralelos cada 2, que es lo que se lee de un
    // vistazo sin ensuciar. Se dibujan sobre el mar y por detras de la
    // silueta, asi que solo se ven en el mar, que es donde deben verse.
    for (let lon = -70; lon <= -60; lon += 5) {
        const [x] = proyectar(lon, 0, caja);
        if (x < caja.x || x > caja.x + caja.w) continue;
        g.appendChild(el('line', { x1: x, y1: FOTO.y, x2: x, y2: FOTO.y + FOTO.h }));
    }
    for (let lat = 2; lat <= 12; lat += 2) {
        const [, y] = proyectar(0, lat, caja);
        if (y < FOTO.y || y > FOTO.y + FOTO.h) continue;
        g.appendChild(el('line', { x1: FOTO.x, y1: y, x2: FOTO.x + FOTO.w, y2: y }));
    }
    return g;
}

const CSS = `
.sp-postal{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-1.1deg);
width:min(76vmin,460px);aspect-ratio:100/74;z-index:10000;pointer-events:none;
filter:drop-shadow(0 14px 26px rgba(0,0,0,.6));opacity:0;transition:opacity .9s ease .25s}
.sp-postal.lista{opacity:1}
.sp-postal svg{display:block;width:100%;height:100%;border-radius:3px}
.sp-pais-marco{fill:#123a5c;stroke:#0a2238;stroke-width:1.2}
.sp-pais-grilla line{stroke:#2f6690;stroke-width:.28;opacity:.55}
.sp-pais-tierra{fill:#c9a86a;stroke:#6d5426;stroke-width:.8;stroke-linejoin:round}
.sp-pais-tierra-in{fill:none;stroke:#e8cf9a;stroke-width:.35;opacity:.7}
.sp-pais-etq{font-size:2.5px;fill:#a9cfe8;letter-spacing:.6px;opacity:.9}
.sp-pais-etq-m{font-size:2.3px;fill:#ffd77a}
.sp-marga-halo{fill:none;stroke:#ffd447;stroke-width:.5}
.sp-marga-punto{fill:#ffd447;stroke:#7a4a00;stroke-width:.7}
.sp-marga-latido{fill:none;stroke:#fff;stroke-width:.4}
@keyframes sp-latido{0%,55%{opacity:.8}56%,100%{opacity:0}}
.sp-marga-anim{animation:sp-latido 1.9s ease-out infinite}
.sp-postal-marco-papel{fill:#f4ead2;stroke:#8a6a3a;stroke-width:1.1}
.sp-postal-titulo{font-family:'Georgia',serif;font-size:5.4px;font-weight:700;
letter-spacing:1.1px;fill:#3b2a12}
.sp-postal-sub{font-family:'Georgia',serif;font-size:2.4px;letter-spacing:.8px;fill:#7a6236}
.sp-postal-destino{font-family:'Georgia',serif;font-size:3.2px;letter-spacing:.6px;fill:#3b2a12}
.sp-postal-nota{font-family:'Georgia',serif;font-size:2.15px;letter-spacing:.2px;fill:#6d5a38}
`;

/**
 * Monta la tarjeta. Devuelve 
ull` si no hay DOM: es adorno con un dato dentro
 * y no puede ser condicion para arrancar.
 */
export function montarPostal(opts = {}) {
    if (typeof document === 'undefined' || !document.body) return null;
    try {
        return construir(opts);
    } catch (err) {
        console.warn('[postal] no se pudo dibujar:', err && err.message);
        return null;
    }
}

function construir(opts) {
    const destino = opts.destino || null;

    if (!document.getElementById('sp-postal-style')) {
        const est = document.createElement('style');
        est.id = 'sp-postal-style';
        est.textContent = CSS;
        document.head.appendChild(est);
    }

    const caja = document.createElement('div');
    caja.className = 'sp-postal';
    const svg = el('svg', {
        viewBox: '0 0 100 74',
        role: 'img',
        'aria-label': 'Mapa de Venezuela con la Isla de Margarita marcada en la costa norte'
    });

    // --- el papel --------------------------------------------------------
    svg.appendChild(el('rect', { x: 0.9, y: 0.9, width: 98.2, height: 72.2, rx: 2, class: 'sp-postal-marco-papel' }));
    // El recorte de la foto: todo lo de dentro se dibuja en el y no se sale.
    const defs = el('defs', {});
    defs.appendChild(el('clipPath', { id: 'sp-pais-foto' },
        el('rect', { x: FOTO.x, y: FOTO.y, width: FOTO.w, height: FOTO.h })));
    svg.appendChild(defs);

    // --- el mar, la grilla y el pais, dentro del recorte ------------------
    const lienzo = marco();
    const dentro = el('g', { 'clip-path': 'url(#sp-pais-foto)' });
    dentro.appendChild(el('rect', { x: FOTO.x, y: FOTO.y, width: FOTO.w, height: FOTO.h, class: 'sp-pais-marco' }));
    dentro.appendChild(grilla(lienzo));
    dentro.appendChild(el('path', { d: camino(lienzo), class: 'sp-pais-tierra' }));

    // --- Margarita, marcada ----------------------------------------------
    const [mx, my] = proyectar(MARGARITA.lon, MARGARITA.lat, lienzo);
    const m = el('g', { class: 'sp-marga' });
    // El latido va DEBAJO del punto, o lo tapa. Y va en un grupo aparte sin
    // recorte: si no, la mitad del circulo se sale de la foto y parece roto.
    m.appendChild(el('circle', { cx: mx, cy: my, r: 1.4, class: 'sp-marga-latido sp-marga-anim' }));
    m.appendChild(el('circle', { cx: mx, cy: my, r: 3.1, class: 'sp-marga-halo' }));
    m.appendChild(el('circle', { cx: mx, cy: my, r: 1.35, class: 'sp-marga-punto' }));
    const etq = el('text', { x: mx + 2.4, y: my - 1.4, class: 'sp-pais-etq sp-pais-etq-m' });
    etq.textContent = 'MARGARITA';
    m.appendChild(etq);
    dentro.appendChild(m);

    svg.appendChild(dentro);

    // Las etiquetas de los grados van FUERA del recorte para que no se corten.
    for (const lat of [4, 8, 12]) {
        const [, y] = proyectar(0, lat, marco());
        const t = el('text', { x: FOTO.x + 1.2, y: y - 0.8, class: 'sp-pais-etq' });
        t.textContent = lat + '°';
        svg.appendChild(t);
    }

    // --- el texto ---------------------------------------------------------
    const titulo = el('text', { x: 6.5, y: 54.5, class: 'sp-postal-titulo' });
    titulo.textContent = 'VENEZUELA';
    svg.appendChild(titulo);

    const sub = el('text', { x: 6.5, y: 58.8, class: 'sp-postal-sub' });
    // Corta a proposito. La version larga ("... MAR DE CARIBE AL NORTE") se
    // salia de la tarjeta por la derecha: el texto no se recorta solo, y lo que
    // no cabe no se reduce, se acorta uno mismo. Aqui cabe entero.
    sub.textContent = 'REP\u00daBLICA BOLIVARIANA DE VENEZUELA';
    svg.appendChild(sub);

    const dest = el('text', { x: 6.5, y: 65, class: 'sp-postal-destino' });
    dest.textContent = destino
        ? 'DESTINO: ' + destino.nombre.toUpperCase()
        : 'DESTINO: LA ISLA ENTERA';
    svg.appendChild(dest);

    const nota = el('text', { x: 6.5, y: 69, class: 'sp-postal-nota' });
    nota.textContent = destino && destino.fundacion
        ? (destino.fundacion.length > 62
            ? destino.fundacion.slice(0, 60).trim() + '\u2026'
            : destino.fundacion)
        : (TIPS[0] ? TIPS[0].titulo : 'La isla esta en la costa norte, entre el mar y la montaña.');
    svg.appendChild(nota);

    caja.appendChild(svg);
    (opts.ancla || document.body).appendChild(caja);

    requestAnimationFrame(() => requestAnimationFrame(() => caja.classList.add('lista')));

    // La rueda de tips ya esta montada aunque la lista este vacia: cuando haya
    // contenido, no habra que tocar nada aqui para que empiece a girar.
    if (TIPS.length > 1) montarRueda(nota, svg);

    return caja;
}

/** Cambia el texto de abajo cada `CADA_TIP` ms. */
function montarRueda(nota, svg) {
    let i = 0;
    setInterval(() => {
        i = (i + 1) % TIPS.length;
        nota.textContent = TIPS[i].texto;
        const t = el('text', { x: 6.5, y: 60.6, class: 'sp-postal-sub' });
        t.textContent = TIPS[i].titulo.toUpperCase();
        // Se quita el anterior si lo hay, para que no se apilen.
        const viejo = svg.querySelector('[data-tip]');
        if (viejo) svg.removeChild(viejo);
        t.setAttribute('data-tip', '1');
        svg.appendChild(t);
    }, CADA_TIP);
}

export default montarPostal;
