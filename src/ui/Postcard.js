/**
 * ============================================================================
 * SANPABLERA ENGINE · ui/Postcard.js
 * ----------------------------------------------------------------------------
 * LA POSTAL DE MARGARITA. Lo que aparece mientras carga, y que dice a donde
 * vas.
 * ============================================================================
 *
 * POR QUE UNA POSTAL Y NO UN LOGO
 *   La pantalla de carga es el primer sitio donde el jugador decide si esto es
 *   un juego o una demo. Decirlo con el titulo no dice nada: "SANPABLERA /
 *   MOTOR DE LUCHA" es el nombre de una herramienta. Lo que engancha es ver
 *   DESTINO, y un destino se ensea con una postal, no con un logotipo.
 *
 *   Ademas resuelve una pregunta que el jugador se hace sin querer: si vale la
 *   pena esperar. Una barra al 40 % sin mas es tiempo perdido; una barra al
 *   40 % con una postal a medio revelar es "voy viendo donde me van a llevar".
 *
 * EL DIBUJO SALE DEL DATO, NO DE UNA ILUSTRACION
 *   La silueta de la isla es `CONTORNO`, el mismo poligono que usa el mapa del
 *   torneo y que el motor usa para colocar las cosas. Si aqui se dibujara una
 *   isla de adorno, seria la segunda geografia del juego y las dos se
 *   separarian sin que nada fallara. Con el mismo array no puede pasar: lo que
 *   ves en la postal es lo que luego encuentras en el mapa.
 *
 * LO QUE ES Y LO QUE NO
 *   Es decoracion con un dato dentro, no una pantalla. No recibe clics, no
 *   atrapa el raton, y si falla al dibujarse el juego carga igual: una postal
 *   rota tiene que dejarte jugar, no impedirte empezar.
 */
import { CONTORNO, CAJAS, ZONAS } from '../core/geo/margarita.js';

const NS = 'http://www.w3.org/2000/svg';

/** Tamano de la vista de la isla, en unidades sueltas (no km). */
const ANCHO = 100, ALTO = 46;

// --- LA GEOGRAFIA DE LA TARJETA -------------------------------------------
// LA PRIMERA VERSION FUE A PELO Y SE VIO. La escala salia de llenar el marco
// entero (`min((ANCHO-8)/anchoKm, ...)`), y con una isla de 33,8 km de ancho eso
// daba 92 unidades sobre 100: la isla se comia la foto entera, se salia por los
// lados y tapaba el sol. Ademas el borde sur se metia debajo de la linea de
// agua, asi que la isla parecia hundida en el mar en vez de apoyada en el.
//
// Ahora la isla se mide por el ANCHO que se le quiere dar y se apoya en la
// linea de agua por su punto mas bajo, que es lo que hace que una isla parezca
// una isla. Estas cuatro medidas son el ajuste entero; se cambian aqui y en
// ningun otro sitio, que es donde se pueden equivocar sin Enterarse.
const FOTO = { x: 3.4, y: 3.4, w: 93.2, h: 42.6 };
const AGUA_Y = 30;                 // donde empieza el mar
const ISLA_ANCHO = 54;            // ancho en unidades de dibujo
// POR QUE ESTA REFERIDO AL AGUA Y NO A UN NUMERO SUELTO
//   La primera version ponia ISLA_BASE en 38.5, un numero redondo, y el agua
//   empieza en 30. Con eso los ultimos 8,5 de la isla se quedaban BAJO el mar
//   y no se veia ni el agua ni las zonas: solo un contorno y el cielo
//   atravesandolo. La isla tiene que apoyarse en la linea de agua, y esa linea
//   es un dato, no una constante: si se mueve el mar, la isla le sigue.
const ISLA_BASE = AGUA_Y + 2.6;   // su punto mas bajo, un pelo hundido
const ISLA_PIE = 8;               // margen de aire por arriba

/**
 * La isla como una sola ruta cerrada, escalada a la tarjeta.
 *
 * POR QUE SE ESCALA POR EL ANCHO Y NO POR "LLENAR EL MARCO"
 *   La primera version hacia `min((ANCHO-8)/w, ...)` y con eso la isla salia
 *   a 92 de 100 unidades: se comia la foto, se salia del marco y tapaba el
 *   sol. Aqui la manda `ISLA_ANCHO`, que es una decision de composicion (que
 *   parte de la foto ocupa la isla), no una division. La division sale sola.
 *
 * Y POR QUE SE APOYA EN EL AGUA POR SU PUNTO MAS BAJO
 *   `oy` se calcula para que el sur de la isla quede en `ISLA_BASE`, o sea
 *   tocando la linea de agua. Centrarla en el marco la dejaba medio hundida en
 *   el mar, que es como se ven las islas mal dibujadas.
 *
 * La caja sale de `CAJAS`, que es la que declara el propio motor: si el mapa
 * se mueve, la postal se mueve con el. No hay segunda geografia.
 */
function escala() {
    const w = CAJAS.maxX - CAJAS.minX;
    const h = CAJAS.maxY - CAJAS.minY;
    const s = ISLA_ANCHO / w;
    return {
        s,
        x: (ANCHO - w * s) / 2 - CAJAS.minX * s,
        y: ISLA_BASE - CAJAS.maxY * s,
        alto: h * s
    };
}

function caminoIsla() {
    const e = escala();
    return 'M' + CONTORNO.map(p =>
        ((p[0] * e.s + e.x).toFixed(2)) + ',' + ((p[1] * e.s + e.y).toFixed(2))
    ).join('L') + 'Z';
}

/**
 * Crea un elemento del SVG.
 *
 * POR QUE ACEPTA HIJOS Y LA VERSION ANTERIOR NO
 *   Antes solo cogia `(nombre, attrs)`. Se llamaba asi:
 *
 *       el('clipPath', { id: 'recorte' }, el('path', { d: ... }))
 *
 *   con la HIJA en el tercer argumento, que se ignoraba sin decir nada: no
 *   hay error por pasar de argumentos de mas en JS. El `clipPath` salia VACIO,
 *   y un recorte vacio recorta todo. Las zonas de color no se veian, la isla
 *   era solo un contorno y no aparecia ni un aviso. Un fallo que parece de
 *   logica de dibujo y era una firma de funcion.
 *
 * @param {string} nombre
 * @param {object} [attrs]
 * @param {...Node} hijos  se anaden en orden
 */
function el(nombre, attrs, ...hijos) {
    const n = document.createElementNS(NS, nombre);
    if (attrs) for (const k of Object.keys(attrs)) n.setAttribute(k, attrs[k]);
    for (const h of hijos) if (h) n.appendChild(h);
    return n;
}

/**
 * EL Z-INDEX, QUE NO ES UN NUMERO DE ADORNO
 *   La pantalla de carga va en `z-index: 9999`. La postal iba en `3`, y salia
 *   montada, con su clase `lista`, con el destino escrito dentro... y no se
 *   veía. El DOM decia que estaba y los ojos decian que no, y las dos cosas
 *   eran verdad: estaba EN EL DOM y estaba DETRAS del muro.
 *
 *   Por eso va en `position:fixed` y no en `absolute`: cuelga del `body`, sin
 *   ancestro posicionado, y en ese caso `absolute` se resuelve contra la caja
 *   inicial de la pagina, que no es lo mismo que la ventana.
 */
const CSS = `
.sp-postal{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-1.6deg);
width:min(72vmin,430px);aspect-ratio:100/74;z-index:10000;pointer-events:none;
filter:drop-shadow(0 12px 22px rgba(0,0,0,.55));opacity:0;transition:opacity .9s ease .25s}
.sp-postal.lista{opacity:1}
.sp-postal svg{display:block;width:100%;height:100%;border-radius:3px}
.sp-postal-marco{fill:#f4ead2;stroke:#8a6a3a;stroke-width:1.1}
.sp-postal-marco-int{fill:none;stroke:#c9ad7a;stroke-width:.5}
.sp-postal-cielo{fill:#ffcf7a}
.sp-postal-sar{fill:none;stroke:#ff8a3d;stroke-width:.7;opacity:.75}
.sp-postal-sol{fill:#ff8a3d}
.sp-postal-foto{fill:none;stroke:#8a6a3a;stroke-width:1}
.sp-postal-mar{fill:#2a86b8}
.sp-postal-onda{fill:none;stroke:#a9e4ff;stroke-width:.5;opacity:.55}
.sp-postal-costa{fill:#e9d7a4;stroke:#7d6234;stroke-width:.8}
.sp-postal-marca{fill:none;stroke:rgba(0,0,0,.22);stroke-width:.45}
.sp-postal-sello{fill:#c8452f;opacity:.9}
.sp-postal-texto{font-family:'Georgia',serif;fill:#3b2a12}
.sp-postal-lugar{font-size:5.1px;font-weight:700;letter-spacing:.9px}
.sp-postal-pais{font-size:2.35px;letter-spacing:.7px;fill:#7a6236}
.sp-postal-destino{font-size:3.1px;letter-spacing:.7px;fill:#3b2a12}
.sp-postal-sello-txt{font-size:2.3px;fill:#f4ead2;letter-spacing:.6px;text-anchor:middle}
`;

/**
 * Dibuja la postal y la devuelve montada.
 *
 * @param {object} [opts]
 *   destino  { nombre, fundacion }  el sitio al que se va. Si no se pasa, sale
 *            la isla entera, que tambien es un destino.
 * @param {string} [opts.ancla]  el contenedor. Por defecto, `document.body`.
 * @returns {HTMLElement|null}  null si el navegador no soporta lo que hace falta
 */
export function montarPostal(opts = {}) {
    // Sin DOM no hay postal, y sin postal el juego carga: esto es adorno con
    // un dato dentro y no puede ser una condicion para arrancar.
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
        'aria-label': 'Postal de la Isla de Margarita'
            + (destino ? ', destino: ' + destino.nombre : '')
    });

    // --- el papel --------------------------------------------------------
    svg.appendChild(el('rect', { x: 0.9, y: 0.9, width: 98.2, height: 72.2, rx: 2, class: 'sp-postal-marco' }));
    svg.appendChild(el('rect', {
        x: FOTO.x, y: FOTO.y, width: FOTO.w, height: FOTO.h, class: 'sp-postal-marco-int'
    }));

    // --- el cielo, con el sol DETRAS y a la IZQUIERDA ---------------------
    // A la derecha antes. La isla se dibuja despues y la tapaba: el sol se
    // ve por el hueco que deja la silueta, que es como se ve en una litografia.
    svg.appendChild(el('rect', { x: FOTO.x, y: FOTO.y, width: FOTO.w, height: FOTO.h, class: 'sp-postal-cielo' }));
    svg.appendChild(el('circle', { cx: 82, cy: 14, r: 4.6, class: 'sp-postal-sol' }));
    for (let i = 0; i < 5; i++) {
        svg.appendChild(el('circle', {
            cx: 82, cy: 14, r: 6 + i * 2.2, class: 'sp-postal-sar'
        }));
    }

    // --- el mar ----------------------------------------------------------
    svg.appendChild(el('rect', {
        x: FOTO.x, y: AGUA_Y, width: FOTO.w, height: FOTO.y + FOTO.h - AGUA_Y, class: 'sp-postal-mar'
    }));
    for (let i = 0; i < 3; i++) {
        const y = AGUA_Y + 4 + i * 3.6;
        svg.appendChild(el('path', {
            d: 'M' + (FOTO.x + 1) + ',' + y.toFixed(1)
                + ' q5,-1 10,0 t10,0 t10,0 t10,0 t10,0 t10,0 t10,0 t10,0 t10,0 t10,0',
            class: 'sp-postal-onda'
        }));
    }

    // --- la isla: el MISMO poligono que el mapa --------------------------
    const defs = el('defs', {});
    defs.appendChild(el('clipPath', { id: 'sp-postal-recorte' }, el('path', { d: caminoIsla() })));
    svg.appendChild(defs);

    const gIsla = el('g', {});
    // Las zonas van DEBAJO de la arena y recortadas a la isla. Encima de la
    // arena no se veian: la arena es opaca y tapa lo que tenga debajo. Y el
    // recorte no es un adorno, sin el el verde de la selva pinta el oceano.
    const manchas = el('g', { 'clip-path': 'url(#sp-postal-recorte)' });
    const e = escala();
    const banda = e.alto / 4;
    for (const z of Object.values(ZONAS)) {
        manchas.appendChild(el('rect', {
            x: FOTO.x, y: (e.y + franjaDe(z.id) * banda).toFixed(2),
            width: FOTO.w, height: banda.toFixed(2),
            fill: z.color, opacity: 0.85
        }));
    }
    gIsla.appendChild(manchas);
    gIsla.appendChild(el('path', { d: caminoIsla(), fill: 'none', stroke: '#7d6234', 'stroke-width': 0.9 }));
    svg.appendChild(gIsla);

    // --- el marco de la foto, arriba de todo -----------------------------
    svg.appendChild(el('rect', {
        x: FOTO.x, y: FOTO.y, width: FOTO.w, height: FOTO.h, class: 'sp-postal-foto'
    }));

    // --- el texto ---------------------------------------------------------
    const lugar = el('text', { x: 6.5, y: 53.5, class: 'sp-postal-texto sp-postal-lugar' });
    lugar.textContent = 'ISLA DE MARGARITA';
    svg.appendChild(lugar);

    const pais = el('text', { x: 6.5, y: 58, class: 'sp-postal-texto sp-postal-pais' });
    pais.textContent = 'NUEVA ESPARTA \u00b7 VENEZUELA \u00b7 MAR DE CARIBE';
    svg.appendChild(pais);

    // LA FRASE DE DESTINO. Sin destino se dice la isla entera, que es verdad
    // y no es un relleno: el torneo empieza en la isla.
    const dest = el('text', { x: 6.5, y: 64.6, class: 'sp-postal-texto sp-postal-destino' });
    dest.textContent = destino
        ? 'DESTINO: ' + destino.nombre.toUpperCase()
        : 'DESTINO: LA ISLA ENTERA';
    svg.appendChild(dest);

    // El motivo se recorta a 68 caracteres porque en una postal el texto se
    // corta a lo que cabe, y lo que no cabe no se reduce hasta que se lee:
    // se termina en puntos suspensivos. La version anterior lo cortaba a 74 y
    // se salia del borde de la tarjeta.
    if (destino && destino.fundacion) {
        const raz = el('text', { x: 6.5, y: 68.6, class: 'sp-postal-texto sp-postal-pais' });
        const f = destino.fundacion;
        raz.textContent = f.length > 68 ? f.slice(0, 66).trim() + '\u2026' : f;
        svg.appendChild(raz);
    }

    // --- el sello, ARRIBA A LA DERECHA de la foto -------------------------
    // Abajo se comia el titulo: "ISLA DE MARGARITA" a 6,4 de cuerpo con
    // interletraje 1,6 se sale de 100 unidades, y el sello encima lo remataba.
    // Arriba a la derecha es donde va de verdad en una postal, y ademas queda
    // sobre el cielo, que esta vacio.
    const sello = el('g', { transform: 'translate(87 12)' });
    sello.appendChild(el('rect', { x: -6.6, y: -5.2, width: 13.2, height: 10.4, class: 'sp-postal-sello' }));
    const txt = el('text', { x: 0, y: -1.4, class: 'sp-postal-sello-txt' });
    txt.textContent = 'MARGARITA';
    sello.appendChild(txt);
    const txt2 = el('text', { x: 0, y: 2.4, class: 'sp-postal-sello-txt' });
    txt2.textContent = 'PDTE.';
    sello.appendChild(txt2);
    svg.appendChild(sello);

    caja.appendChild(svg);
    (opts.ancla || document.body).appendChild(caja);

    // Se revela un pelo despues de montarse, para que el giro se vea: si
    // aparece ya en su sitio final, la transicion no se nota y el efecto se
    // pierde.
    requestAnimationFrame(() => requestAnimationFrame(() => caja.classList.add('lista')));

    return caja;
}

/** En que franja va cada zona, de la costa al cerro. */
function franjaDe(id) {
    return { COSTA: 0, SUR_SECO: 1, MACIZO: 2, CERRO: 3 }[id] ?? 0;
}

export default montarPostal;
