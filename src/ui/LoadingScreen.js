/**
 * ============================================================================
 * SANPABLERA ENGINE · ui/LoadingScreen.js
 * ----------------------------------------------------------------------------
 * Pantalla de carga: un MURO de grafiti urbano (estilo Jet Set Radio) donde las
 * palabras se van pintando de abajo arriba segun avanza la carga real del juego.
 *
 * QUE HACE Y POR QUE ESTA HECHA ASI
 * ----------------------------------------------------------------------------
 * 1. EL RELLENO ES REAL, NO UN BARRO DE TIEMPO. Cada tag tiene su momento de
 *    entrada (`at`) y su duracion de pintado (`span`), y todos persiguen al
 *    progreso que le pasa el motor (escena, fisicas, luchadores, interfaz). Si
 *    algo tarda 5 segundos, el muro tarda 5 segundos. Un `setTimeout` de 3
 *    segundos es una mentira que se nota en cuanto el movil se atasca.
 *
 * 2. EL CONTORNO SE DIBUJA ENTERO DESDE EL PRINCIPIO y la pintura va por dentro.
 *    Es como se pinta de verdad: primero la linea negra, luego el relleno. Asi
 *    el jugador ve el muro desde el frame 0 y la pintura es la que comunica
 *    "¿cuanto falta?".
 *
 * 3. CADA PALABRA TIENE SU PROPIO RELLENADO, no una mascara comun. El efecto
 *    "se van llenando de colores" sale de que cada tag se pinte con su propia
 *    brocha, con su propio degradado y en su propio momento. Un solo recorte
 *    para todo el muro se lee como "una barra con letras", no como Pintura.
 *
 * 4. NINGUNA PALABRA SE SOBREPONE CON OTRA. Las posiciones estan en dos
 *   entionals (apaisado y vertical) escritas a mano, y cada tag lleva
 *    `textLength` para ocupar EXACTAMENTE el ancho que se le reserves. Asi el
 *    mural se lee igual aunque el sistema no tenga las fuentes del estilo: si
 *    la fuente sale mas ancha o mas estrecha, el texto se estira o se comprime
 *    dentro de su caja y no invade al vecino. Es lo que hace que esto se vea
 *    igual en un movil de gama baja, en un portatil y en un monitor 4K.
 *
 * 5. NO HAY FUENTES NI IMAGENES externas. Todo es SVG generado por codigo con
 *    una pila de fuentes de sistema: la pantalla aparece en el primer frame sin
 *    esperar ninguna descarga.
 *
 * 6. LA PANTALLA COMPLETA NECESITA UN GESTO. Ni mobil ni PC dejan entrar en
 *    fullscreen solo (por seguridad), asi que al terminar hay un boton de
 *    "TOCA PARA JUGAR": ese toque es el gesto que vale para las dos cosas
 *    (fullscreen + arranque). En movil se pide ademas el bloqueo a horizontal
 *    dentro del fullscreen; si el navegador no lo permite (iOS, por ejemplo) se
 *    arranca igualmente y no se bloquea al jugador con un error.
 * ============================================================================
 */

/** Marca de la hoja de estilos para no duplicarla si se crea dos veces. */
const STYLE_ID = 'sanpablera-loading-style';

/** Namespace SVG, para no escribirlo en cada elemento. */
const SVGNS = 'http://www.w3.org/2000/svg';

/** Pesos de las fases: el progreso total es la fraccion completada de esta lista. */
const DEFAULT_STEPS = [
    { key: 'motor', label: 'Arrancando motor', weight: 10 },
    { key: 'escena', label: 'Montando la escena', weight: 20 },
    { key: 'fisicas', label: 'Calibrando fisicas', weight: 15 },
    { key: 'luchadores', label: 'Vistiendo luchadores', weight: 25 },
    { key: 'interfaz', label: 'Dibujando la interfaz', weight: 15 },
    { key: 'listo', label: 'Listo', weight: 15 }
];

/**
 * Codigos de los estilos de tag. Cada uno es una combinacion de capas
 * (sombra, contorno gordo, contorno fino, relleno, halo) y es lo que da que dos
 * palabras del mismo muro no parezcan la misma palabra puesta dos veces.
 *
 *   THROWIE  : el clasico de una pasada, contorno negro limpio.
 *   WILDSTYLE: capas de contorno de colores + flecha: el que dice "aqui pinto
 *              el que sabe".
 *   STICKER  : halo blanco de pegatina. Corta el muro como un cartel pegado.
 *   CHROME   : aberracion cromatica (cian y magenta desfasados). Es la señal
 *              visual de "radio": television por cable, grafiti de los 90.
 *   SLAB     : bloque macizo, sin adornos, para el que va centrado.
 */
const TAG_STYLE = Object.freeze({
    THROWIE: 'THROWIE',
    WILDSTYLE: 'WILDSTYLE',
    STICKER: 'STICKER',
    CHROME: 'CHROME',
    SLAB: 'SLAB'
});

/**
 * Las palabras del muro.
 *
 * Campos de cada tag:
 *   word  : lo que se pinta. Sin acentos salvo los que son parte de la palabra
 *           (las "~" son escapes unicode para que el archivo se lea igual se lea
 *           como se lea: "~n" es la enye y "~o" la oe con virgulilla).
 *   x, y  : centro de la caja del tag, en unidades del lienzo (NO del pixel).
 *   w, h  : ancho y alto que se le RESERVAN. El texto se estira para ocuparlos.
 *   rot   : giro en grados. El grafiti urbano nunca esta recto.
 *   skew  : inclinacion extra. El rollo de "tag" viene de aqui, no del giro.
 *   from/to: degradado de la pintura, de abajo a arriba.
 *   at    : progreso (0..1) en el que la brocha empieza a pintar este tag.
 *   span  : fraccion de progreso que tarda en pintarse entero.
 *   style : ver TAG_STYLE.
 *   decor : adorno extra que se dibuja junto a la palabra.
 */
const TAGS = Object.freeze([
    {
        word: 'PI~NA', x: 168, y: 168, w: 232, h: 74,
        rot: -9, skew: -6, style: TAG_STYLE.THROWIE,
        from: '#00e5ff', to: '#0aff9d', at: 0.02, span: 0.14,
        decor: 'arrow'
    },
    {
        word: 'KO', x: 600, y: 128, w: 128, h: 62,
        rot: 5, skew: -10, style: TAG_STYLE.CHROME,
        from: '#ff9d00', to: '#ffe600', at: 0.10, span: 0.12,
        decor: 'burst'
    },
    {
        word: 'BULULU', x: 1052, y: 320, w: 150, h: 232,
        rot: 88, skew: -4, style: TAG_STYLE.STICKER,
        from: '#ff2d95', to: '#ff7a00', at: 0.18, span: 0.16,
        decor: 'none'
    },
    {
        word: 'CO~NIZA', x: 1010, y: 150, w: 306, h: 82,
        rot: 7, skew: -7, style: TAG_STYLE.WILDSTYLE,
        from: '#8dff3b', to: '#00e05a', at: 0.26, span: 0.18,
        decor: 'arrow'
    },
    {
        // El centro del muro. Entra el ultimo de los grandes y tarda mas que
        // todos: es el que el jugador se queda mirando mientras carga.
        word: 'SANPABLERA', x: 600, y: 430, w: 760, h: 176,
        rot: -2, skew: -8, style: TAG_STYLE.SLAB,
        from: '#ff2d6f', to: '#ffd23f', at: 0.34, span: 0.62,
        decor: 'crown'
    },
    {
        word: 'CULEBRA', x: 646, y: 664, w: 352, h: 88,
        rot: -4, skew: -6, style: TAG_STYLE.THROWIE,
        from: '#00d4ff', to: '#7b5bff', at: 0.46, span: 0.18,
        decor: 'arrow'
    },
    {
        word: 'PICAO', x: 158, y: 556, w: 252, h: 84,
        rot: 6, skew: -8, style: TAG_STYLE.CHROME,
        from: '#ff4d00', to: '#ffe600', at: 0.56, span: 0.16,
        decor: 'burst'
    },
    {
        word: 'ESCO~NETAO', x: 470, y: 762, w: 470, h: 76,
        rot: 3, skew: -5, style: TAG_STYLE.WILDSTYLE,
        from: '#b14bff', to: '#ff3d7f', at: 0.64, span: 0.20,
        decor: 'arrow'
    },
    {
        word: 'MOTOR DE LUCHA', x: 600, y: 540, w: 360, h: 40,
        rot: 0, skew: -4, style: TAG_STYLE.STICKER,
        from: '#f4f1e8', to: '#9ad9ff', at: 0.86, span: 0.12,
        decor: 'none'
    }
]);

/**
 * Lienzo de cada orientacion. El grafiti se reparte a mano en dos para que
 * quede equilibrado: en apaisado las palabras se colocan alrededor del centro
 * Left y right, y en vertical se apilan alrededor del centro vertical porque
 * el ancho es el recurso escaso.
 */
const CANVAS = Object.freeze({
    landscape: Object.freeze({ w: 1200, h: 800 }),
    portrait: Object.freeze({ w: 780, h: 1180 })
});

/**
 * Reacomodo de las palabras cuando el lienzo es vertical.
 *
 * POR QUE NO SE RESCALA EL DE APAISADO
 *   Escalado y ya, las palabras se crushed unas contra otras (en vertical el
 *   ancho es la mitad) y el hero se sale por los lados. Replantear las posiciones
 *   para el vertical es lo unico que conserva "nadie tapa a nadie".
 */
function layoutFor(canvas) {
    if (canvas.w >= canvas.h) return TAGS;
    // Vertical: mismo criterio (posiciones y anchos) reescrito para 780x1180.
    const V = [
        { ...TAGS[0], x: 168, y: 132, w: 208 },
        { ...TAGS[1], x: 392, y: 104, w: 116 },
        { ...TAGS[2], x: 686, y: 236, w: 104, h: 168 },
        { ...TAGS[3], x: 396, y: 300, w: 300 },
        { ...TAGS[4], x: 390, y: 616, w: 700 },
        { ...TAGS[5], x: 388, y: 812, w: 330 },
        { ...TAGS[6], x: 176, y: 908, w: 232 },
        { ...TAGS[7], x: 392, y: 1032, w: 440 },
        { ...TAGS[8], x: 390, y: 700, w: 320 }
    ];
    return V;
}

/**
 * Cromos del grafiti. Se centralizan para poder cambiar el rollo del juego
 * (colores) sin tocar la logica del relleno.
 */
const PALETTE = {
    wall: '#15151a',
    wallLight: '#2a2a33',
    outline: '#08080b',
    ink: '#f4f1e8',
    hud: '#ffd23f',
    accent: '#00e5ff',
    // Desfasados de la aberracion cromatica (estilo CHROME).
    chromaA: '#00e5ff',
    chromaB: '#ff2d95',
    drips: '#ff2d6f'
};

/**
 * Estilo de la pantalla. Va como hoja inyectada y no como atributos sueltos
 * porque son muchas reglas (clip, animaciones, media queries) y por inline
 * serian ilegibles.
 */
const CSS = `
#sanpablera-loading {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: clamp(10px, 2vh, 20px);
    padding: env(safe-area-inset-top) env(safe-area-inset-right)
             env(safe-area-inset-bottom) env(safe-area-inset-left);
    background:
        radial-gradient(120% 80% at 50% 12%, ${PALETTE.wallLight} 0%, ${PALETTE.wall} 70%),
        ${PALETTE.wall};
    color: ${PALETTE.ink};
    font-family: 'Bangers', 'Permanent Marker', 'Impact', 'Haettenschweiler',
                 'Arial Black', system-ui, sans-serif;
    overflow: hidden;
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    transition: opacity .45s ease, visibility .45s ease;
}
#sanpablera-loading[hidden] { display: none; }
#sanpablera-loading.spl-leaving {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
}

/* --- LA PARED: cemento, manchas de humedad y puntos de semitono ------------ */
/* Sin imagenes: el textureado sale de gradientes y de un patron SVG. Es lo que
   separa "diseño" de "rect de color plano" sin descargar ni un byte. */
#sanpablera-loading .spl-wall {
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: .55;
    background:
        radial-gradient(90% 60% at 22% 18%, rgba(255,255,255,.06) 0%, transparent 60%),
        radial-gradient(70% 50% at 82% 78%, rgba(0,0,0,.45) 0%, transparent 65%),
        repeating-linear-gradient(0deg,
            rgba(255,255,255,.035) 0 1px, transparent 1px 3px);
}
#sanpablera-loading .spl-halftone {
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: .16;
    background-image:
        radial-gradient(circle at 50% 50%, ${PALETTE.ink} 0 1.4px, transparent 1.8px);
    background-size: 9px 9px;
    mask-image: radial-gradient(70% 60% at 50% 40%, #000 0%, transparent 78%);
    -webkit-mask-image: radial-gradient(70% 60% at 50% 40%, #000 0%, transparent 78%);
}

#sanpablera-loading .spl-canvas {
    position: relative;
    width: 100%;
    max-width: min(98vw, 1400px);
    height: auto;
    max-height: 78vh;
    overflow: visible;
    filter: drop-shadow(0 12px 0 rgba(0,0,0,.30));
}

/* --- CAPAS DE UN TAG ------------------------------------------------------ */
/* Cada tag es un <g> con este clip y estas capas, en este orden:
   sombra -> croma -> halos/contornos (enteros) -> relleno (recortado) ->
   linea fina encima -> chorrone -> adorno.
   El relleno va RECORTADO por el borde de la brocha, que sube con el progreso;
   los contornos no, y por eso se ve la linea negra desde el frame 0. */
#sanpablera-loading .spl-tag text {
    text-anchor: middle;
    font-weight: 900;
    letter-spacing: 1px;
    paint-order: stroke fill;
}
#sanpablera-loading .spl-shadow  { fill: rgba(0,0,0,.55); }
#sanpablera-loading .spl-chroma-a { fill: ${PALETTE.chromaA}; }
#sanpablera-loading .spl-chroma-b { fill: ${PALETTE.chromaB}; }
#sanpablera-loading .spl-halo    { fill: none; stroke-linejoin: round; stroke-linecap: round; }
#sanpablera-loading .spl-fill    { }
#sanpablera-loading .spl-line    { fill: none; stroke-linejoin: round; }
#sanpablera-loading .spl-drip    { opacity: 0; }
#sanpablera-loading .spl-mist    { fill: #ffffff; opacity: 0; }
#sanpablera-loading .spl-decor   { opacity: .92; }

/* --- HUD ----------------------------------------------------------------- */
/* BARRA DE PROGRESO: se usa la misma pintura que el muro. */
#sanpablera-loading .spl-meter {
    position: relative;
    width: min(86vw, 620px);
    height: 20px;
    border: 3px solid ${PALETTE.ink};
    border-radius: 2px;
    background: rgba(0,0,0,.55);
    overflow: hidden;
    transform: skewX(-12deg);
    box-shadow: 4px 4px 0 ${PALETTE.outline};
}
#sanpablera-loading .spl-meter i {
    display: block;
    height: 100%;
    width: 0%;
    background: linear-gradient(90deg, ${PALETTE.drips}, ${PALETTE.hud} 70%, #fff3b0);
    transition: width .18s linear;
}

#sanpablera-loading .spl-meta {
    display: flex;
    align-items: baseline;
    gap: 12px;
    font-family: 'Courier New', ui-monospace, monospace;
    font-size: clamp(12px, 2.6vw, 16px);
    letter-spacing: 2px;
    text-transform: uppercase;
    opacity: .95;
    text-shadow: 2px 2px 0 ${PALETTE.outline};
}
#sanpablera-loading .spl-pct { min-width: 4ch; text-align: right; color: ${PALETTE.hud}; }
#sanpablera-loading .spl-label { min-width: 22ch; }

/* BOTON DE ARRANQUE: el gesto que pide la pantalla completa. */
#sanpablera-loading .spl-start {
    appearance: none;
    border: 4px solid ${PALETTE.ink};
    border-radius: 4px;
    padding: clamp(12px, 2.4vh, 20px) clamp(22px, 5vw, 44px);
    background: ${PALETTE.hud};
    color: ${PALETTE.outline};
    font: inherit;
    font-size: clamp(18px, 4.6vw, 30px);
    letter-spacing: 2px;
    text-transform: uppercase;
    transform: skewX(-8deg);
    cursor: pointer;
    touch-action: manipulation;
    box-shadow: 6px 6px 0 ${PALETTE.outline};
    animation: splPulse 1.5s ease-in-out infinite;
}
#sanpablera-loading .spl-start:focus-visible { outline: 4px dashed ${PALETTE.ink}; outline-offset: 6px; }
@keyframes splPulse {
    0%, 100% { transform: skewX(-8deg) scale(1); }
    50%      { transform: skewX(-8deg) scale(1.05); }
}
#sanpablera-loading .spl-hint {
    max-width: 34ch;
    margin: 0;
    text-align: center;
    font-family: 'Courier New', ui-monospace, monospace;
    font-size: clamp(11px, 2.4vw, 14px);
    line-height: 1.4;
    opacity: .72;
}

/* MOVIL: la pantalla es pequena y el pulgar tapa el centro, asi que el muro
   sube y la barra baja. */
@media (max-width: 560px), (orientation: portrait) {
    #sanpablera-loading { justify-content: flex-start; padding-top: 6vh; }
    #sanpablera-loading .spl-canvas { max-height: 74vh; }
}

@media (prefers-reduced-motion: reduce) {
    #sanpablera-loading .spl-start { animation: none; }
}
`;

/** Ruido determinista: el borde de la pintura tiene que ser irregular siempre
 *  igual (misma semilla, mismo dibujo) o el muro "parpadearia" entre cargas. */
function noise(seed) {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
}

/** Crea un elemento SVG con atributos, en una linea. */
function svgEl(name, attrs) {
    const el = document.createElementNS(SVGNS, name);
    if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
}

/** Atajo de <text> con el ancho reservado: el texto ocupa EXACTAMENTE `w`. */
function svgText(cls, word, w) {
    const t = svgEl('text', {
        'class': cls,
        x: 0, y: 0,
        textLength: w,
        lengthAdjust: 'spacingAndGlyphs'
    });
    t.textContent = word;
    return t;
}

export class LoadingScreen {
    /**
     * @param {object} [opts]
     * @param {string} [opts.title]      texto del tag central
     * @param {string} [opts.subtitle]   ratico de abajo ("motor de lucha")
     * @param {(started: {fullscreen: boolean}) => void} [opts.onStart]
     *        se llama cuando el jugador ya ha pulsado y la pantalla se va
     * @param {string[]} [opts.steps]    claves de las fases, en orden
     * @param {boolean} [opts.fullscreen=true] pedir pantalla completa al empezar
     */
    constructor(opts = {}) {
        this.opts = opts;
        this.title = opts.title || 'SANPABLERA';
        this.subtitle = opts.subtitle || 'MOTOR DE LUCHA';
        this.wantFullscreen = opts.fullscreen !== false;
        this.steps = (opts.steps || DEFAULT_STEPS.map((s) => s.key))
            .map((key) => DEFAULT_STEPS.find((s) => s.key === key) || { key, label: key, weight: 10 });
        this.totalWeight = this.steps.reduce((sum, s) => sum + s.weight, 0);
        this.doneWeight = 0;
        this.stepIndex = 0;
        this.progress = 0;          // progreso real (0..1)
        this.paint = 0;             // relleno visible del muro (0..1)
        this.ready = false;
        this.started = false;
        this.destroyed = false;
        this.fullscreenOk = false;
        this._tags = [];            // tags construidos en el DOM
        this._uid = 0;              // contador de ids unicos (degradados/clip)
        this._raf = 0;
        this._lastTime = 0;
        this._orientation = null;
        this._startedPromise = new Promise((resolve) => { this._resolveStarted = resolve; });

        this._injectStyle();
        this._buildDom();
        this._bindEvents();
        this._loop = this._loop.bind(this);
        this._onResize = this._onResize.bind(this);
        window.addEventListener('resize', this._onResize);
        window.addEventListener('orientationchange', this._onResize);
        this._applyLayout();
        this._lastTime = (typeof performance !== 'undefined' ? performance.now() : 0);
        this._raf = requestAnimationFrame(this._loop);
    }

    // =========================================================================
    // DOM
    // =========================================================================

    _injectStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = CSS;
        document.head.appendChild(style);
    }

    _buildDom() {
        const root = document.createElement('div');
        root.id = 'sanpablera-loading';
        root.setAttribute('role', 'progressbar');
        root.setAttribute('aria-label', 'Cargando ' + this.title);
        root.setAttribute('aria-valuemin', '0');
        root.setAttribute('aria-valuemax', '100');
        root.setAttribute('aria-valuenow', '0');

        root.innerHTML = `
            <div class="spl-wall"></div>
            <div class="spl-halftone"></div>
            <svg class="spl-canvas" id="splCanvas" role="img" aria-label="${this.title}">
                <defs id="splDefs"></defs>
                <g id="splDecorBack"></g>
                <g id="splTags"></g>
                <g id="splDecorFront"></g>
            </svg>
            <div class="spl-meter"><i id="splBar"></i></div>
            <div class="spl-meta">
                <span class="spl-pct" id="splPct">0%</span>
                <span class="spl-label" id="splLabel">${this.steps[0].label}</span>
            </div>
            <button class="spl-start" id="splStart" type="button" hidden></button>
            <p class="spl-hint" id="splHint" hidden></p>
        `;
        document.body.appendChild(root);

        this.root = root;
        this.canvas = root.querySelector('#splCanvas');
        this.defs = root.querySelector('#splDefs');
        this.tagGroup = root.querySelector('#splTags');
        this.decorBack = root.querySelector('#splDecorBack');
        this.decorFront = root.querySelector('#splDecorFront');
        this.bar = root.querySelector('#splBar');
        this.pct = root.querySelector('#splPct');
        this.label = root.querySelector('#splLabel');
        this.startButton = root.querySelector('#splStart');
        this.hint = root.querySelector('#splHint');
    }

    /**
     * Reparte el mural segun la orientacion de la pantalla y construye los
     * tags. Se vuelve a llamar al rotar el movil: por eso es idempotente
     * (borra lo anterior antes de rehacerlo).
     */
    _applyLayout() {
        const rect = this.root.getBoundingClientRect();
        const portrait = rect.height > rect.width * 1.05;
        const key = portrait ? 'portrait' : 'landscape';
        if (key === this._orientation) return;
        this._orientation = key;

        this.canvas = this.canvas || this.root.querySelector('#splCanvas');
        const canvas = key === 'portrait' ? CANVAS.portrait : CANVAS.landscape;
        this.canvas.setAttribute('viewBox', `0 0 ${canvas.w} ${canvas.h}`);

        this.tagGroup.textContent = '';
        this.defs.textContent = '';
        this.decorBack.textContent = '';
        this.decorFront.textContent = '';
        this._tags = [];

        const tags = layoutFor(canvas).map((t) => (t.word === this.title.toUpperCase() ? t : t));
        tags.forEach((spec, i) => this._buildTag(spec, i, canvas));
    }

    /**
     * Un tag completo: capas de contorno + relleno recortado + chorrone +
     * adorno. El recorte (`clipPath`) es lo que se mueve con el progreso.
     */
    _buildTag(spec, index, canvas) {
        const uid = this._uid++;
        const gradientId = `splPaint${uid}`;
        const clipId = `splClip${uid}`;
        const seed = index * 7 + 2;

        // --- Degradado de la pintura de ESTE tag. objectBoundingBox para que
        //     escale solo con el texto, sin importar el ancho reservado. ---
        const grad = svgEl('linearGradient', {
            id: gradientId, x1: '0', y1: '1', x2: '0', y2: '0'
        });
        grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': spec.from }));
        grad.appendChild(svgEl('stop', { offset: '62%', 'stop-color': spec.to }));
        grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': '#ffffff' }));
        this.defs.appendChild(grad);

        // --- Recorte del relleno: el borde de la brocha. Se regenera cada
        //     frame en _paint(). ---
        const clip = svgEl('clipPath', { id: clipId, clipPathUnits: 'userSpaceOnUse' });
        const edge = svgEl('path', { d: '' });
        clip.appendChild(edge);
        this.defs.appendChild(clip);

        const g = svgEl('g', {
            'class': 'spl-tag',
            transform: `translate(${spec.x} ${spec.y}) rotate(${spec.rot}) skewX(${spec.skew || 0})`
        });

        // 1) Sombra proyectada: separa la palabra de la pared.
        g.appendChild(svgText('spl-shadow', spec.word, spec.w));
        g.lastChild.setAttribute('transform', 'translate(6 10)');
        g.lastChild.setAttribute('stroke', PALETTE.outline);
        g.lastChild.setAttribute('stroke-width', 10);

        // 2) Aberracion cromatica (estilo CHROME): dos copias del mismo texto
        //    desfasadas en cian y magenta. Es la firma de la television por
        //    cable, y hace que la palabra parezca "emitida".
        if (spec.style === TAG_STYLE.CHROME) {
            const a = svgText('spl-chroma-a', spec.word, spec.w);
            a.setAttribute('transform', 'translate(-5 0)');
            a.setAttribute('stroke', PALETTE.outline);
            a.setAttribute('stroke-width', 16);
            g.appendChild(a);
            const b = svgText('spl-chroma-b', spec.word, spec.w);
            b.setAttribute('transform', 'translate(5 0)');
            b.setAttribute('stroke', PALETTE.outline);
            b.setAttribute('stroke-width', 16);
            g.appendChild(b);
        }

        // 3) Halos de contorno: van ENCIMA de la sombra, DEBAJO del relleno.
        //    Es el "doble trazo" del grafiti: sin esto las letras se leen como
        //    una tipografia cualquiera y no como un spray.
        const halos = this._halosFor(spec.style, spec.h);
        for (const halo of halos) {
            const t = svgText('spl-halo', spec.word, spec.w);
            t.setAttribute('stroke', halo.color);
            t.setAttribute('stroke-width', halo.width);
            if (halo.opacity) t.setAttribute('opacity', halo.opacity);
            g.appendChild(t);
        }

        // 4) Relleno recortado por la brocha. Es la unica capa que "se llena".
        const clipped = svgEl('g', { 'clip-path': `url(#${clipId})` });
        const fill = svgText('spl-fill', spec.word, spec.w);
        fill.setAttribute('fill', `url(#${gradientId})`);
        clipped.appendChild(fill);

        // Neblina de spray en el mismo recorte: se ve por donde esta pintando.
        const mist = svgEl('rect', {
            'class': 'spl-mist',
            x: -spec.w / 2 - 20, y: 0, width: spec.w + 40, height: 26,
            rx: 10
        });
        clipped.appendChild(mist);
        g.appendChild(clipped);

        // 5) Linea fina por encima del relleno: separa el color del borde.
        const line = svgText('spl-line', spec.word, spec.w);
        line.setAttribute('stroke', this._lineColorFor(spec.style));
        line.setAttribute('stroke-width', 4);
        line.setAttribute('opacity', 0.55);
        g.appendChild(line);

        // 6) Chorrone colgando de las letras.
        const drips = [];
        const dripCount = spec.style === TAG_STYLE.SLAB ? 4 : 2;
        for (let i = 0; i < dripCount; i++) {
            const fx = spec.w * (0.18 + 0.64 * noise(seed + i * 3.1));
            const w = 7 + Math.round(noise(seed + i * 5.7) * 9);
            const max = spec.h * (0.22 + 0.5 * noise(seed + i * 7.3));
            const rect = svgEl('rect', {
                'class': 'spl-drip',
                'fill': `url(#${gradientId})`,
                x: fx.toFixed(1), y: 0, width: w, height: 0, rx: w / 2
            });
            g.appendChild(rect);
            drips.push({ el: rect, at: 0.25 + 0.6 * noise(seed + i * 11.3), max, grow: 0 });
        }

        // 7) Adorno.
        if (spec.decor && spec.decor !== 'none') {
            const decor = this._buildDecor(spec, seed);
            if (decor) g.appendChild(decor);
        }

        this.tagGroup.appendChild(g);
        this._tags.push({ spec, edge, mist, drips, index });
    }

    /** Capas de contorno de cada estilo, de fuera hacia dentro. */
    _halosFor(style, h) {
        switch (style) {
            case TAG_STYLE.STICKER:
                // Halo blanco de pegatina: el que hace que "corte" el muro.
                return [
                    { color: PALETTE.ink, width: Math.round(h * 0.55) },
                    { color: PALETTE.outline, width: Math.round(h * 0.30) },
                    { color: PALETTE.accent, width: Math.round(h * 0.12), opacity: 0.9 }
                ];
            case TAG_STYLE.WILDSTYLE:
                // Varias capas de color: el relleno se ve "dentro" de un borde
                // que tiene su propio borde, como las flechas de los tags.
                return [
                    { color: PALETTE.outline, width: Math.round(h * 0.42) },
                    { color: PALETTE.ink, width: Math.round(h * 0.20) },
                    { color: PALETTE.accent, width: Math.round(h * 0.09), opacity: 0.85 }
                ];
            case TAG_STYLE.SLAB:
                return [
                    { color: PALETTE.outline, width: Math.round(h * 0.46) },
                    { color: PALETTE.ink, width: Math.round(h * 0.20) }
                ];
            case TAG_STYLE.CHROME:
                return [
                    { color: PALETTE.outline, width: Math.round(h * 0.38) },
                    { color: PALETTE.ink, width: Math.round(h * 0.16) }
                ];
            case TAG_STYLE.THROWIE:
            default:
                return [
                    { color: PALETTE.outline, width: Math.round(h * 0.34) },
                    { color: PALETTE.ink, width: Math.round(h * 0.10), opacity: 0.8 }
                ];
        }
    }

    /** Color de la linea fina que va por encima del relleno. */
    _lineColorFor(style) {
        if (style === TAG_STYLE.CHROME) return PALETTE.ink;
        return PALETTE.outline;
    }

    /** Adorno geometrico segun el tipo (flecha, explosion, corona). */
    _buildDecor(spec, seed) {
        const w = spec.w;
        const h = spec.h;
        let el = null;

        if (spec.decor === 'arrow') {
            // Flecha que "sale" de la palabra hacia el lado que mira el tag.
            const dir = spec.rot > 4 ? -1 : 1;
            const tipX = dir * (w / 2 + h * 0.55);
            const baseX = dir * (w / 2 + 2);
            const s = h * 0.30;
            el = svgEl('path', {
                'class': 'spl-decor',
                d: `M ${baseX} 0 L ${tipX} ${-s} L ${tipX - dir * s * 0.8} 0 L ${tipX} ${s} Z`,
                fill: PALETTE.hud
            });
        } else if (spec.decor === 'burst') {
            // Explosion de lineas: el "destello" de un KO.
            const rays = 9;
            let d = '';
            for (let i = 0; i < rays; i++) {
                const a = (i / rays) * Math.PI * 2 + seed;
                const r0 = h * 0.62;
                const r1 = h * (0.85 + 0.35 * noise(seed + i));
                d += `M ${(Math.cos(a) * r0).toFixed(1)} ${(Math.sin(a) * r0).toFixed(1)} ` +
                    `L ${(Math.cos(a) * r1).toFixed(1)} ${(Math.sin(a) * r1).toFixed(1)} `;
            }
            el = svgEl('path', { 'class': 'spl-decor', d, fill: 'none', stroke: PALETTE.hud, 'stroke-width': 6, 'stroke-linecap': 'round' });
        } else if (spec.decor === 'crown') {
            // Corona encima del tag central: es el que manda en el muro.
            const y = -h * 0.62;
            const s = w * 0.10;
            el = svgEl('path', {
                'class': 'spl-decor',
                d: `M ${-s} ${y} L ${-s} ${y - s * 0.7} L ${-s * 0.5} ${y - s * 0.25} ` +
                    `L 0 ${y - s} L ${s * 0.5} ${y - s * 0.25} L ${s} ${y - s * 0.7} L ${s} ${y} Z`,
                fill: PALETTE.hud,
                stroke: PALETTE.outline,
                'stroke-width': 6,
                'stroke-linejoin': 'round'
            });
        }

        return el;
    }

    _onResize() {
        // El mural se rehace al cambiar de orientacion, no en cada pixel de un
        // redimensionado de ventana.
        this._applyLayout();
    }

    _bindEvents() {
        this._onStartClick = (ev) => {
            ev.preventDefault();
            this.start();
        };
        this.startButton.addEventListener('click', this._onStartClick);

        // Pausa el pintado cuando la pestana no esta delante: en un movil en
        // segundo plano sigue sonando el rAF y eso se nota en la bateria.
        this._onVisibility = () => {
            if (document.hidden) {
                cancelAnimationFrame(this._raf);
                this._raf = 0;
            } else if (!this._raf && !this.destroyed) {
                this._lastTime = performance.now();
                this._raf = requestAnimationFrame(this._loop);
            }
        };
        document.addEventListener('visibilitychange', this._onVisibility);
    }

    // =========================================================================
    // API publica
    // =========================================================================

    /**
     * Avanza de fase. Cada fase aporta un peso fijo al progreso total, asi que
     * el jugador ve el avance real (no una barra que miente).
     * @param {string} key clave de fase (ver DEFAULT_STEPS)
     */
    step(key) {
        let index = this.steps.findIndex((s) => s.key === key);
        if (index === -1) index = this.stepIndex;
        // Puede llamarse dos veces la misma fase (p. ej. un recalentado): no
        // se cuenta doble.
        while (this.stepIndex < index) {
            this.doneWeight += this.steps[this.stepIndex].weight;
            this.stepIndex++;
        }
        this._refreshProgress();
        this.label.textContent = this.steps[Math.min(this.stepIndex, this.steps.length - 1)].label;
        return this.progress;
    }

    /** Progreso fino dentro de la fase (cargas de texturas, etc). */
    setProgress(fraction) {
        const partial = Math.max(0, Math.min(1, fraction));
        this.doneWeight = this._baseWeight() +
            (this.steps.length ? this.steps[Math.min(this.stepIndex, this.steps.length - 1)].weight * partial : 0);
        this._refreshProgress();
        return this.progress;
    }

    /** Fase actual + fraccion de esa fase. Es lo que pinta el grafiti. */
    _baseWeight() {
        return this.steps.slice(0, this.stepIndex)
            .reduce((sum, s) => sum + s.weight, 0);
    }

    _refreshProgress() {
        const p = this.totalWeight ? this.doneWeight / this.totalWeight : 0;
        // El progreso jamas retrocede: una recarga de textura no puede hacer
        // que la barra vaya hacia atras.
        this.progress = Math.max(this.progress, Math.max(0, Math.min(1, p)));
        const shown = Math.round(this.progress * 100);
        this.bar.style.width = shown + '%';
        this.pct.textContent = shown + '%';
        this.root.setAttribute('aria-valuenow', String(shown));
    }

    /**
     * Carga terminada: la pintura llega arriba y aparece el boton de arranque.
     * @param {boolean} [autoStart] arrancar sin pedir gesto (solo para pruebas)
     */
    finish(autoStart = false) {
        if (this.ready) return;
        this.ready = true;
        this.progress = 1;
        this.doneWeight = this.totalWeight;
        this._refreshProgress();
        this.label.textContent = 'Listo';

        const touchy = matchMedia('(pointer: coarse)').matches;
        this.startButton.textContent = touchy ? 'Toca para jugar' : 'Pulsa para jugar';
        this.startButton.hidden = false;

        if (!this.wantFullscreen) {
            this.startButton.hidden = true;
            this.start();
            return;
        }
        if (!Fullscreen.isSupported()) {
            this.hint.hidden = false;
            this.hint.textContent = Fullscreen.unsupportedHint();
            // En iOS el "fullscreen" real es instalar la web como app, pero el
            // juego se juega igual: se arranca sin bloquear.
        }
        if (autoStart) this.start();
    }

    /** Promesa que se resuelve cuando el jugador ha pulsado y se va la pantalla. */
    whenStarted() {
        return this._startedPromise;
    }

    /**
     * Arranque: pide la pantalla completa (mobil y PC), suelta el bloqueo de
     * horizontal si el navegador lo permite y se va.
     */
    async start() {
        if (this.started || this.destroyed) return false;
        this.started = true;
        this.startButton.disabled = true;

        if (this.wantFullscreen) {
            this.fullscreenOk = await Fullscreen.request();
            // El horizontal solo existe dentro del fullscreen (y solo en unos
            // pocos navegadores). Es una mejora, no un requisito.
            if (this.fullscreenOk) await Fullscreen.lockLandscape();
        }

        this.root.classList.add('spl-leaving');
        const done = () => this.destroy();
        // Se espera a que termine el fundido antes de quitar el nodo: si se
        // quita de golpe, en muchos moviles aparece un destello blanco.
        setTimeout(done, 480);
        if (this.opts.onStart) this.opts.onStart({ fullscreen: this.fullscreenOk });
        this._resolveStarted({ fullscreen: this.fullscreenOk });
        return this.fullscreenOk;
    }

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        cancelAnimationFrame(this._raf);
        this._raf = 0;
        document.removeEventListener('visibilitychange', this._onVisibility);
        window.removeEventListener('resize', this._onResize);
        window.removeEventListener('orientationchange', this._onResize);
        this.startButton.removeEventListener('click', this._onStartClick);
        if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
        const style = document.getElementById(STYLE_ID);
        if (style && style.parentNode) style.parentNode.removeChild(style);
    }

    // =========================================================================
    // Bucle de pintado del muro
    // =========================================================================

    _loop(now) {
        if (this.destroyed) return;
        this._raf = requestAnimationFrame(this._loop);

        const dt = Math.min(64, now - this._lastTime);   // ms, acotado tras un cambio de pestana
        this._lastTime = now;

        // La pintura "persigue" al progreso real: nunca adelanta lo que se ha
        // cargado, y al cargar lento alcanza la barra sin saltos.
        const target = this.ready ? 1 : this.progress;
        const speed = dt / (this.ready ? 420 : 900);
        if (this.paint < target) {
            this.paint = Math.min(target, this.paint + speed);
        } else if (this.paint > target) {
            this.paint = Math.max(target, this.paint - speed * 0.5);
        }

        this._paint(dt);
    }

    /**
     * Dibuja un frame del muro a partir de `this.paint`.
     *
     * Cada tag tiene su propio progreso `q`: entra en su momento (`at`) y tarda
     * `span` en llenarse. Los tags que aun no han empezado se dibujan SOLO con
     * el contorno (la "linea negra" del grafiti), que es justo lo que se ve en
     * un muro donde el pintor va a pintar pero todavia no ha pintado.
     */
    _paint(dt) {
        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        const p = reduced ? this.progress : this.paint;
        const t = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;

        for (const tag of this._tags) {
            const spec = tag.spec;
            const span = spec.span || 0.15;
            const q = clamp01((p - spec.at) / span);

            // Rango vertical del tag: de abajo (lleno) a arriba (vacio).
            const pad = spec.h * 0.14;
            const bottom = pad;
            const top = -(spec.h + pad);
            const edgeY = bottom - (bottom - top) * q;

            // Borde ondulado: 7 tramos con amplitudes fijas (semilla estable) y
            // una respiracion lenta, para que el trazo se mueva como una brocha.
            const seed = tag.index * 7 + 2;
            const steps = 7;
            const halfW = spec.w / 2 + spec.h * 0.10;
            let d = `M ${(-halfW).toFixed(1)} ${edgeY.toFixed(1)}`;
            for (let i = 0; i <= steps; i++) {
                const x = -halfW + (2 * halfW * i) / steps;
                const n = noise(seed + i);
                const wobble = (reduced || q <= 0 || q >= 1) ? 0 : Math.sin(t * 2.4 + i * 1.7) * spec.h * 0.05;
                const y = edgeY + (n - 0.5) * spec.h * 0.18 + wobble;
                const cx = x - halfW / steps;
                const cy = edgeY + (n - 0.5) * spec.h * 0.34 + wobble * 1.6;
                d += ` Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
            }
            d += ` L ${halfW.toFixed(1)} ${(bottom + spec.h * 0.2).toFixed(1)} L ${(-halfW).toFixed(1)} ${(bottom + spec.h * 0.2).toFixed(1)} Z`;
            tag.edge.setAttribute('d', d);

            // Neblina de spray justo en el borde: el punto por donde esta pintando.
            const painting = q > 0.02 && q < 0.999;
            tag.mist.setAttribute('y', (edgeY - spec.h * 0.13).toFixed(1));
            tag.mist.setAttribute('opacity', painting ? '0.16' : '0');

            // Chorrone: crecen cuando la pintura pasa por debajo de su letra.
            for (const drip of tag.drips) {
                if (q >= drip.at) drip.grow = Math.min(1, drip.grow + dt / 520);
                const hgt = drip.max * easeOut(drip.grow);
                drip.el.setAttribute('y', (-hgt).toFixed(1));
                drip.el.setAttribute('height', hgt.toFixed(1));
                drip.el.setAttribute('opacity', drip.grow > 0 ? '1' : '0');
            }
        }
    }
}

function clamp01(x) {
    return x < 0 ? 0 : x > 1 ? 1 : x;
}

function easeOut(t) {
    const x = clamp01(t);
    return 1 - (1 - x) * (1 - x);
}

/**
 * Pantalla completa para movil y PC. Todo el quirido de API (webkit, ms, sin
 * estandar) vive aqui: el resto del juego pregunta solo "ponlo a pantalla
 * completa" y no sabe en que navegador esta.
 */
export const Fullscreen = {
    /** ¿Hay alguna variante de pantalla completa disponible? */
    isSupported() {
        const el = document.documentElement;
        return !!(
            el.requestFullscreen || el.webkitRequestFullscreen ||
            el.msRequestFullscreen || el.mozRequestFullScreen
        );
    },

    /**
     * Pide pantalla completa. El navegador exige que venga de un gesto del
     * usuario: por eso el boton de "toca para jugar" es obligatorio y no un
     * detalle de estilo.
     * @returns {Promise<boolean>} si el fullscreen quedo activo
     */
    async request() {
        const el = document.documentElement;
        const method = el.requestFullscreen || el.webkitRequestFullscreen ||
            el.msRequestFullscreen || el.mozRequestFullScreen;
        if (!method) return false;
        try {
            await method.call(el, { navigationUI: 'hide' });
            // Algunos navegadores devuelven la promesa resuelta aunque el modo no
            // se haya activado: se comprueba el estado real.
            await Promise.resolve();
            return Fullscreen.isActive() || !!document.fullscreenElement ||
                !!document.webkitFullscreenElement;
        } catch (err) {
            // Sin gesto valido o bloqueado por politica: no es fatal.
            return false;
        }
    },

    isActive() {
        return !!(document.fullscreenElement || document.webkitFullscreenElement ||
            document.mozFullScreenElement || document.msFullscreenElement);
    },

    /** Horizontal bloqueado: solo funciona dentro del fullscreen y en algunos
     *  navegadores. Se ignora cualquier fallo (vertical es perfectly jugable).*/
    async lockLandscape() {
        try {
            const orientation = screen.orientation;
            if (orientation && typeof orientation.lock === 'function') {
                await orientation.lock('landscape');
                return true;
            }
        } catch (err) {
            /* no soportado */
        }
        return false;
    },

    /** Aviso para los navegadores donde no se puede forzar (sobre todo iOS). */
    unsupportedHint() {
        const ua = navigator.userAgent || '';
        const iOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
        return iOS
            ? 'En iPhone/iPad la pantalla completa se consigue anadiendo el juego a la pantalla de inicio.'
            : 'Este navegador no permite forzar pantalla completa: se juega en ventana.';
    }
};

export default LoadingScreen;