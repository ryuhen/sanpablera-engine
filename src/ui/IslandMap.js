/**
 * ============================================================================
 * SANPABLERA ENGINE Â· ui/IslandMap.js
 * ----------------------------------------------------------------------------
 * EL MAPA. La isla dibujada, con los nueve escenarios encima.
 * ============================================================================
 *
 * QUE SE VE Y POR QUE ESTA HECHO ASI
 *   Un SVG y nada mas. No hay texturas, ni renders, ni mapa importado: el
 *   contorno sale del mismo dato que el motor usa para colocar cosas, y los
 *   marcadores salen de la misma tabla de escenarios. Si se dibuja un sitio que
 *   el motor no tiene, o al reves, es que la tabla esta mal, y por eso las dos
 *   cosas salen del MISMO sitio.
 *
 *   SVG y no canvas porque hace falta: los marcadores son DOM de verdad, se
 *   pueden tabular con el teclado y se leen como texto. En un mapa de nueve
 *   puntos eso vale mas que el rendimiento.
 *
 * LA ISLA ESTA TUMBADA A proposito
 *   La geometria real va de noreste a suroeste, y en pantalla eso sale como una
 *   diagonal. Se rota para que la larga quede horizontal: es mas facil de leer
 *   de un vistazo donde esta el mar y donde el monte, que es lo que el jugador
 *   necesita para decidir a donde ir. Los datos NO se tocan; solo se dibujan
 *   girados, y por eso el mapa y la simulacion siguen hablando el mismo idioma.
 *
 * LO QUE NO HACE TODAVIA
 *   No hay tabla de peleadores debajo ni cuadrÃ­cula de escenarios: son
 *   IslandMap / FighterRow / ScenarioGrid, y aqui solo el primero.
 * ============================================================================
 */

import { CONTORNO, LUGARES, ZONAS, abiertos, siguiente } from '../core/geo/margarita.js';

const CSS = `
.spf-isla{position:fixed;inset:0;z-index:92;display:flex;flex-direction:column;
align-items:center;justify-content:center;gap:clamp(6px,1.4vh,14px);overflow:hidden;
font-family:'Arial Black',Impact,system-ui,sans-serif;color:#fff;user-select:none;
padding:clamp(8px,2vh,18px);
background:radial-gradient(120% 90% at 50% 18%,#12307a 0%,#0a1a4a 48%,#03071c 100%)}
.spf-isla::before{content:'';position:absolute;inset:0;pointer-events:none;
background:repeating-linear-gradient(0deg,rgba(255,255,255,.05) 0 2px,transparent 2px 7px)}
.spf-isla-title{position:relative;z-index:1;font-size:clamp(15px,4.2vh,32px);
letter-spacing:2px;font-style:italic;font-weight:900;line-height:1;background:
linear-gradient(180deg,#fff7cf 0%,#ffd447 42%,#e09a12 100%);-webkit-background-clip:text;
background-clip:text;color:transparent;-webkit-text-stroke:clamp(1.5px,.4vh,3px) #7a1200;
paint-order:stroke fill;text-shadow:0 3px 0 #7a1200}
.spf-isla-sub{position:relative;z-index:1;font-size:clamp(8px,1.7vh,11px);letter-spacing:4px;
color:#7ea6ff;text-transform:uppercase;text-shadow:0 2px 0 #001038}
.spf-isla-marco{position:relative;z-index:1;border:4px solid #101a3a;
box-shadow:0 6px 0 #001038,inset 0 0 0 2px #fff;background:#0a2a6b;max-width:min(96vw,1000px)}
.spf-isla-svg{display:block;width:100%;height:auto;max-height:64vh}
.spf-isla-agua{fill:#1f6fb2}
.spf-isla-onda{fill:none;stroke:#7fd4ff;stroke-width:.35;opacity:.55}
.spf-isla-costa{fill:#e8d9a8;stroke:#7a5f2a;stroke-width:1.2}
.spf-isla-zona{stroke:#000;stroke-width:.6;stroke-opacity:.35}
.spf-isla-hito{cursor:pointer}
.spf-isla-hito:focus{outline:none}
.spf-isla-hito:focus-visible .spf-isla-aro{stroke:#ffd447;stroke-width:3}
.spf-isla-aro{fill:none;stroke:#101a3a;stroke-width:1.6}
.spf-isla-hito.cerrado .spf-isla-punto{fill:#5a6480;stroke:#2b3350;stroke-width:1.4}
.spf-isla-hito.abierto .spf-isla-punto{fill:#ffc72c;stroke:#7a1200;stroke-width:1.6}
.spf-isla-hito.siguiente .spf-isla-punto{fill:#ff3b30;stroke:#fff;stroke-width:2.4}
.spf-isla-hito.siguiente .spf-isla-latido{animation:spf-latido 1s steps(1,end) infinite}
.spf-isla-latido{fill:none;stroke:#fff;stroke-width:1;opacity:.75}
@keyframes spf-latido{0%,60%{opacity:.75;r:3.4}61%,100%{opacity:0;r:7}}
.spf-isla-texto{font-size:1.9px;font-weight:900;fill:#fff;paint-order:stroke fill;
stroke:#000;stroke-width:.55;stroke-linejoin:round;text-anchor:middle}
.spf-isla-nombre{font-size:2.4px;font-weight:900;fill:#fff6cf;paint-order:stroke fill;
stroke:#101a3a;stroke-width:.8;stroke-linejoin:round;text-anchor:middle}
.spf-isla-hito.cerrado .spf-isla-nombre{fill:#8d97ad}
.spf-isla-leyenda{position:relative;z-index:1;display:flex;gap:clamp(8px,2vw,26px);
flex-wrap:wrap;justify-content:center;font-size:clamp(8px,1.6vh,11px);letter-spacing:1px}
.spf-isla-leyenda span{display:flex;align-items:center;gap:5px;color:#c3d2ff}
.spf-isla-leyenda i{width:11px;height:11px;border-radius:50%;border:2px solid #000;
display:inline-block}
.spf-isla-pie{position:relative;z-index:1;font-size:clamp(9px,1.9vh,13px);font-weight:900;
letter-spacing:2px;color:#ffd447;text-shadow:0 2px 0 #001038;text-align:center;
min-height:1.3em;max-width:min(90vw,760px)}
`;

/** El grafo SVG. Todo en unidades de kilometro, y la vista los escala. */
const NS = 'http://www.w3.org/2000/svg';

/**
 * Cuantos grados se gira la isla para que la larga quede horizontal.
 * La diagonal real va de noreste a suroeste; aqui se deja en cero porque el
 * `viewBox` ya se estrecha y el mar queda a los lados, que es mas legible que
 * girar el mapa y obligar a inclinar la cabeza.
 */
const GIRO = 0;

/** Margen en km alrededor del contorno, para que no toque el borde. */
const MARGEN = 1.2;

let estilo = null;
function asegurarEstilo() {
    if (estilo) return estilo;
    estilo = document.createElement('style');
    estilo.id = 'spf-isla-style';
    estilo.textContent = CSS;
    document.head.appendChild(estilo);
    return estilo;
}

function el(nombre, attrs = {}) {
    const n = document.createElementNS(NS, nombre);
    for (const k of Object.keys(attrs)) n.setAttribute(k, attrs[k]);
    return n;
}

/** El `viewBox` que abarca el contorno con margen. */
function vista() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of CONTORNO) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x);
        y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    return { x: x0 - MARGEN, y: y0 - MARGEN, w: (x1 - x0) + MARGEN * 2, h: (y1 - y0) + MARGEN * 2 };
}

/** El contorno como una sola ruta cerrada. */
function caminoIsla() {
    return 'M' + CONTORNO.map(p => p[0].toFixed(2) + ',' + p[1].toFixed(2)).join('L') + 'Z';
}

/**
 * La pantalla del mapa.
 *
 * ESTADO
 *   ganados   `{ LUGAR: combates }`, el contador del torneo (NO un `Set`: un
 *             conjunto no puede contar repetidos y el requisito de "gana tres
 *             aqui" se cumpliria con una sola pelea).
 *   alElegir  se llama con la fila de LUGARES al confirmar uno.
 */
export class IslandMap {
    constructor(opts = {}) {
        this.ganados = opts.ganados || {};
        this.alElegir = opts.alElegir || (() => {});
        this.alVolver = opts.alVolver || null;
        this.marcas = [];
        this.root = null;
    }

    /** Abre el mapa y devuelve una promesa con el escenario elegido. */
    pick() {
        asegurarEstilo();
        return new Promise(resolve => { this.resolve = resolve; this.build(); });
    }

    build() {
        const root = document.createElement('div');
        root.className = 'spf-isla';

        const titulo = document.createElement('div');
        titulo.className = 'spf-isla-title';
        titulo.textContent = 'ISLA DE MARGARITA';

        const sub = document.createElement('div');
        sub.className = 'spf-isla-sub';
        sub.textContent = 'nueva esparta \u00b7 venezuela \u00b7 donde se juntan';

        // --- el mapa -----------------------------------------------------
        const marco = document.createElement('div');
        marco.className = 'spf-isla-marco';
        const v = vista();
        const svg = el('svg', {
            class: 'spf-isla-svg',
            viewBox: `${v.x} ${v.y} ${v.w} ${v.h}`,
            preserveAspectRatio: 'xMidYMid meet',
            role: 'group',
            'aria-label': 'Mapa de Isla de Margarita con nueve escenarios'
        });

        // El mar: un rectangulo del color del agua, y encima unas ondas que
        // dicen "esto es agua" sin necesidad de una textura.
        svg.appendChild(el('rect', { x: v.x, y: v.y, width: v.w, height: v.h, class: 'spf-isla-agua' }));
        for (let i = 0; i < 7; i++) {
            const yy = v.y + (v.h * (i + 0.5)) / 7;
            svg.appendChild(el('path', {
                class: 'spf-isla-onda',
                d: `M${v.x},${yy.toFixed(2)} q${(v.w / 14).toFixed(2)},-1 ${(v.w / 7).toFixed(2)},0 t${(v.w / 7).toFixed(2)},0`
            }));
        }

        // La isla y, encima, el color de cada zona.
        svg.appendChild(el('path', { d: caminoIsla(), class: 'spf-isla-costa' }));
        svg.appendChild(el('clipPath', { id: 'spf-recorte-isla' },
            el('path', { d: caminoIsla() })));
        const zonas = el('g', { 'clip-path': 'url(#spf-recorte-isla)' });
        for (const z of Object.values(ZONAS)) {
            const c = centroDe(z.id);
            zonas.appendChild(el('circle', {
                cx: c.x.toFixed(2), cy: c.y.toFixed(2), r: c.r.toFixed(2),
                fill: z.color, class: 'spf-isla-zona'
            }));
        }
        svg.appendChild(zonas);

        // --- los nueve escenarios ---------------------------------------
        const abiertosAhora = new Set(abiertos(this.ganados).map(l => l.id));
        const sig = siguiente(this.ganados);
        for (const l of LUGARES) {
            svg.appendChild(this.marca(l, abiertosAhora.has(l.id), sig && sig.id === l.id));
        }

        marco.appendChild(svg);

        // --- leyenda y pie ----------------------------------------------
        const leyenda = document.createElement('div');
        leyenda.className = 'spf-isla-leyenda';
        for (const [etiqueta, color] of [
            ['abierto', '#ffc72c'], ['siguiente', '#ff3b30'], ['cerrado', '#5a6480']
        ]) {
            const s = document.createElement('span');
            const i = document.createElement('i');
            i.style.background = color;
            s.appendChild(i);
            s.appendChild(document.createTextNode(etiqueta));
            leyenda.appendChild(s);
        }

        const pie = document.createElement('div');
        pie.className = 'spf-isla-pie';
        this.pie = pie;
        this.textoPie(sig);

        root.appendChild(titulo);
        root.appendChild(sub);
        root.appendChild(marco);
        root.appendChild(leyenda);
        root.appendChild(pie);

        document.body.appendChild(root);
        this.root = root;

        this._onKey = (e) => this.tecla(e);
        document.addEventListener('keydown', this._onKey);
    }

    /**
     * Un marcador: aro, punto, latido y nombre.
     *
     * ES UN `<g>` CON TABINDEX, NO UN DIV. Con nueve elementos y teclado, hace
     * falta que el navegador sepa cual esta enfocado; eso es lo que `tabindex`
     * da y lo que hace que la pantalla se pueda usar sin raton.
     */
    marca(l, abierto, esSiguiente) {
        const g = el('g', {
            class: 'spf-isla-hito ' + (abierto ? 'abierto' : 'cerrado') + (esSiguiente ? ' siguiente' : ''),
            tabindex: '0',
            role: 'button',
            'data-id': l.id,
            'aria-label': l.nombre + (abierto ? '' : ' (cerrado)')
        });
        // El latido va DEBAJO del punto, para que no lo tape.
        g.appendChild(el('circle', { cx: l.arena.x, cy: l.arena.z, r: 3.4, class: 'spf-isla-latido' }));
        g.appendChild(el('circle', {
            cx: l.arena.x, cy: l.arena.z, r: 1.9, class: 'spf-isla-aro'
        }));
        g.appendChild(el('circle', { cx: l.arena.x, cy: l.arena.z, r: 1.5, class: 'spf-isla-punto' }));

        const t = el('text', { x: l.arena.x, y: l.arena.z - 3.4, class: 'spf-isla-nombre' });
        t.textContent = l.nombre;
        g.appendChild(t);

        g.addEventListener('click', () => this.elegir(l));
        g.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.elegir(l); }
        });
        this.marcas.push(g);
        return g;
    }

    /** Elige un escenario. Los cerrados no se pueden elegir: hay que llegar. */
    elegir(l) {
        const abierto = abiertos(this.ganados).some(a => a.id === l.id);
        if (!abierto) {
            this.textoPie(null, l.nombre + ' todavia no: hay que ganar antes ahi.');
            return;
        }
        const r = l;
        this.cerrar();
        this.alElegir(r);
        if (this.resolve) this.resolve(r);
    }

    /** El texto de abajo: dice cual es el siguiente y por que. */
    textoPie(sig, aviso) {
        if (!this.pie) return;
        this.pie.textContent = aviso || (sig
            ? 'SIGUIENTE: ' + sig.nombre + ' \u00b7 ' + sig.fundacion
            : 'Isla entera abierta. No queda nadie a quien retar.');
    }

    /** Teclado: flechas mueven el foco por la rejilla de nueve. */
    tecla(e) {
        const COLS = 3;
        const i = this.marcas.findIndex(m => m === document.activeElement);
        if (i < 0) return;
        let n = -1;
        if (e.key === 'ArrowRight') n = Math.min(this.marcas.length - 1, i + 1);
        else if (e.key === 'ArrowLeft') n = Math.max(0, i - 1);
        else if (e.key === 'ArrowDown') n = Math.min(this.marcas.length - 1, i + COLS);
        else if (e.key === 'ArrowUp') n = Math.max(0, i - COLS);
        else return;
        e.preventDefault();
        this.marcas[n].focus();
        const l = LUGARES.find(x => x.id === this.marcas[n].dataset.id);
        if (l) this.textoPie(siguiente(this.ganados), l.nombre + ' \u00b7 ' + l.fundacion);
    }

    cerrar() {
        document.removeEventListener('keydown', this._onKey);
        if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
        this.root = null;
    }
}

/**
 * Donde se pinta cada zona: el CENTRO DE SUS LUGARES, no una tabla a mano.
 *
 * POR QUE SE DERIVA Y NO SE ESCRIBE
 *   `ZONAS` no trae coordenadas (trae color, clima y rasgo, que es lo que el
 *   motor usa), asi que hay que sacarlas de algun sitio. La opcion obvia es
 *   escribir una tabla de centros aqui, y eso es una segunda copia de la
 *   geografia: el dia que se mueva un escenario, la mancha de color se queda
 *   donde estaba y el mapa miente sin que nada falle.
 *
 *   El punto medio de los lugares de cada zona SI es la zona: cuatro manchas, y
 *   cada una cae donde de verdad esta su gente. Si alguien anade un lugar, la
 *   mancha se mueve sola.
 */
function centroDe(id) {
    const pts = LUGARES.filter(l => l.zona === id).map(l => [l.arena.x, l.arena.z]);
    if (!pts.length) return { x: 0, y: 0, r: 4 };
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    // El radio llega al punto mas lejano, para que la mancha abarque a los
    // suyos. Un pelo de margen, que si no el borde del color se ve justo.
    const r = Math.max(...pts.map(p => Math.hypot(p[0] - cx, p[1] - cy))) * 1.25 + 1;
    return { x: cx, y: cy, r };
}

export default IslandMap;