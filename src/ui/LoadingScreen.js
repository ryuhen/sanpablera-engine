/**
 * ============================================================================
 * SANPABLERA ENGINE · ui/LoadingScreen.js
 * ----------------------------------------------------------------------------
 * Pantalla de carga: el logo "SANPABLERA" pintado a modo de grafiti que se va
 * llenando de pintura de abajo arriba segun avanza la carga real del juego.
 *
 * QUE HACE Y POR QUE ESTA HECHA ASI
 * ----------------------------------------------------------------------------
 * 1. EL RELLENO ES REAL, NO UN BARRO DE TIEMPO. La pintura sube a la velocidad
 *    que marca el progreso que le pasa el motor (escena, fisicas, luchadores,
 *    interfaz), asi que si algo tarda 5 segundos, el grafiti tarda 5 segundos.
 *    Un `setTimeout` de 3 segundos es una mentira que se nota en cuanto el
 *    movil se atasca.
 *
 * 2. EL CONTORNO SE DIBUJA ENTERO DESDE EL PRINCIPIO y la pintura va por dentro.
 *    Es como se pinta de verdad: primero la linea negra, luego el relleno. Asi
 *    el jugador ve la marca del juego desde el frame 0 y la pintura es la que
 *    comunica "¿cuanto falta?".
 *
 * 3. LA PANTALLA COMPLETA NECESITA UN GESTO. Ni mobil ni PC dejan entrar en
 *    fullscreen solo (por seguridad), asi que al terminar hay un boton de
 *    "TOCA PARA JUGAR": ese toque es el gesto que vale para las dos cosas
 *    (fullscreen + arranque). En movil se pide ademas el bloqueo a horizontal
 *    dentro del fullscreen; si el navegador no lo permite (iOS,Por ejemplo) se
 *    arranca igualmente y no se bloquea al jugador con un error.
 *
 * 4. NO HAY FUENTES NI IMAGENES externas. El logo es SVG con una pila de
 *    fuentes de sistema y el trazo se genera por codigo, asi que la pantalla
 *    aparece en el primer frame sin esperar ninguna descarga y se ve igual en
 *    un movil de gama baja.
 * ============================================================================
 */

/** Marca de la hoja de estilos para no duplicarla si se crea dos veces. */
const STYLE_ID = 'sanpablera-loading-style';

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
 * Cromos del grafiti. Se centralizan para poder cambiar el rollo del juego
 * (colores) sin tocar la logica del relleno.
 */
const PALETTE = {
    wall: '#1b1b20',
    wallLight: '#2c2c34',
    outline: '#0b0b0e',
    paintTop: '#ffd23f',
    paintBottom: '#ff5e3a',
    shadow: '#3a2a6b',
    splat: '#ffd23f',
    ink: '#f4f1e8'
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
    gap: clamp(14px, 3vh, 28px);
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

/* PUNTOS DE LA PARED: el "espray" que hace que no sea un rect plano. */
#sanpablera-loading .spl-grain {
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: .18;
    background-image:
        radial-gradient(circle at 12% 22%, rgba(255,255,255,.5) 0 1px, transparent 1.6px),
        radial-gradient(circle at 63% 71%, rgba(255,255,255,.4) 0 1px, transparent 1.6px),
        radial-gradient(circle at 84% 34%, rgba(255,255,255,.35) 0 1px, transparent 1.6px),
        radial-gradient(circle at 34% 86%, rgba(255,255,255,.45) 0 1px, transparent 1.6px);
    background-size: 180px 180px, 240px 240px, 200px 200px, 260px 260px;
}

#sanpablera-loading .spl-logo {
    width: min(92vw, 1000px);
    height: auto;
    overflow: visible;
    filter: drop-shadow(0 10px 0 rgba(0,0,0,.35));
}

#sanpablera-loading .spl-word {
    font-size: 190px;
    font-weight: 900;
    letter-spacing: 2px;
    text-anchor: middle;
    paint-order: stroke fill;
}
#sanpablera-loading .spl-outline {
    fill: none;
    stroke: ${PALETTE.outline};
    stroke-width: 26;
    stroke-linejoin: round;
    font-style: italic;
}
#sanpablera-loading .spl-shadow { fill: ${PALETTE.shadow}; }
#sanpablera-loading .spl-fill { fill: url(#splPaint); }
#sanpablera-loading .spl-sheen { fill: url(#splSheen); }

/* CHORRONES: cuelgan de las letras cuando la pintura pasa por debajo. */
#sanpablera-loading .spl-drip { fill: url(#splPaint); opacity: 0; }
#sanpablera-loading .spl-splat { fill: ${PALETTE.splat}; opacity: 0; }

/* BARRA DE PROGRESO: se usa la misma pintura que el logo. */
#sanpablera-loading .spl-meter {
    width: min(86vw, 560px);
    height: 16px;
    border: 3px solid ${PALETTE.ink};
    border-radius: 2px;
    background: rgba(0,0,0,.45);
    overflow: hidden;
    transform: skewX(-12deg);
}
#sanpablera-loading .spl-meter i {
    display: block;
    height: 100%;
    width: 0%;
    background: linear-gradient(90deg, ${PALETTE.paintBottom}, ${PALETTE.paintTop});
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
    opacity: .92;
}
#sanpablera-loading .spl-pct { min-width: 4ch; text-align: right; color: ${PALETTE.paintTop}; }
#sanpablera-loading .spl-label { min-width: 22ch; }

/* BOTON DE ARRANQUE: el gesto que pide la pantalla completa. */
#sanpablera-loading .spl-start {
    appearance: none;
    border: 4px solid ${PALETTE.ink};
    border-radius: 4px;
    padding: clamp(12px, 2.4vh, 20px) clamp(22px, 5vw, 44px);
    background: ${PALETTE.paintTop};
    color: ${PALETTE.outline};
    font: inherit;
    font-size: clamp(18px, 4.6vw, 30px);
    letter-spacing: 2px;
    text-transform: uppercase;
    transform: skewX(-8deg);
    cursor: pointer;
    touch-action: manipulation;
    animation: splPulse 1.5s ease-in-out infinite;
}
#sanpablera-loading .spl-start:focus-visible { outline: 4px dashed ${PALETTE.ink}; outline-offset: 6px; }
@keyframes splPulse {
    0%, 100% { transform: skewX(-8deg) scale(1); }
    50%      { transform: skewX(-8deg) scale(1.05); }
}
#sanpablera-loading .spl-hint {
    max-width: 34ch;
    text-align: center;
    font-family: 'Courier New', ui-monospace, monospace;
    font-size: clamp(11px, 2.4vw, 14px);
    line-height: 1.4;
    opacity: .72;
}
#sanpablera-loading .spl-rotate { transform: rotate(-2deg); }

/* MOVIL: la pantalla es pequena y el pulgar tapa el centro, asi que el logo
   sube y la barra baja. */
@media (max-width: 560px), (orientation: portrait) {
    #sanpablera-loading { justify-content: flex-start; padding-top: 12vh; }
    #sanpablera-loading .spl-word { font-size: 150px; }
    #sanpablera-loading .spl-logo { width: 96vw; }
}

@media (prefers-reduced-motion: reduce) {
    #sanpablera-loading .spl-start { animation: none; }
}
`;

/** Ruido determinista: el borde de la pintura tiene que ser irregular siempre
 *  igual (misma semilla, mismo dibujo) o el logo "parpadearia" entre cargas. */
function noise(seed) {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
}

export class LoadingScreen {
    /**
     * @param {object} [opts]
     * @param {string} [opts.title]      texto del logo
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
        this.paint = 0;             // relleno visible del grafiti (0..1)
        this.ready = false;
        this.started = false;
        this.destroyed = false;
        this.fullscreenOk = false;
        this._drips = [];
        this._splats = [];
        this._raf = 0;
        this._lastTime = 0;
        this._startedPromise = new Promise((resolve) => { this._resolveStarted = resolve; });

        this._injectStyle();
        this._buildDom();
        this._buildDripsAndSplats();
        this._bindEvents();
        this._loop = this._loop.bind(this);
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

        // El borde de la pintura: un path cuyo borde superior se regenera cada
        // frame con ondulaciones distintas, para que parezca pintado a brocha
        // y no un recorte recto.
        root.innerHTML = `
            <div class="spl-grain"></div>
            <svg class="spl-logo" viewBox="0 0 1200 420" role="img" aria-label="${this.title}">
                <defs>
                    <linearGradient id="splPaint" x1="0" y1="1" x2="0" y2="0">
                        <stop offset="0%" stop-color="${PALETTE.paintBottom}"/>
                        <stop offset="55%" stop-color="${PALETTE.paintTop}"/>
                        <stop offset="100%" stop-color="#fff3b0"/>
                    </linearGradient>
                    <linearGradient id="splSheen" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#ffffff" stop-opacity="0"/>
                        <stop offset="50%" stop-color="#ffffff" stop-opacity=".38"/>
                        <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
                    </linearGradient>
                    <clipPath id="splPaintClip">
                        <path id="splPaintEdge" d="M -60 440 L 1260 440 L 1260 440 L -60 440 Z"/>
                    </clipPath>
                </defs>
                <g class="spl-rotate">
                    <text class="spl-word spl-shadow" x="600" y="300">${this.title}</text>
                    <g clip-path="url(#splPaintClip)">
                        <text class="spl-word spl-fill" x="600" y="300">${this.title}</text>
                        <rect class="spl-sheen" id="splSheenRect" x="-80" y="-200" width="1360" height="120"/>
                        <rect class="spl-mist" id="splMistRect" x="-60" y="0" width="1320" height="46"
                              fill="#ffffff" opacity=".10"/>
                    </g>
                    <text class="spl-word spl-outline" x="600" y="300">${this.title}</text>
                    <g id="splDrips"></g>
                    <g id="splSplats"></g>
                </g>
                <text x="600" y="392" text-anchor="middle"
                      fill="${PALETTE.ink}" opacity=".7"
                      font-family="'Courier New', ui-monospace, monospace"
                      font-size="34" letter-spacing="10">${this.subtitle}</text>
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
        this.edgePath = root.querySelector('#splPaintEdge');
        this.sheenRect = root.querySelector('#splSheenRect');
        this.mistRect = root.querySelector('#splMistRect');
        this.bar = root.querySelector('#splBar');
        this.pct = root.querySelector('#splPct');
        this.label = root.querySelector('#splLabel');
        this.startButton = root.querySelector('#splStart');
        this.hint = root.querySelector('#splHint');
        this.dripGroup = root.querySelector('#splDrips');
        this.splatGroup = root.querySelector('#splSplats');
    }

    /**
     * Chorrosones y salpicaduras. Se crean con posiciones y grosores fijos
     * (semilla estable)Colocados bajo las letras y alrededor del logo.
     */
    _buildDripsAndSplats() {
        const drips = [
            { x: 210, w: 16, max: 150, at: 0.18 },
            { x: 355, w: 11, max: 96, at: 0.34 },
            { x: 640, w: 19, max: 186, at: 0.46 },
            { x: 880, w: 13, max: 120, at: 0.62 },
            { x: 1010, w: 9, max: 70, at: 0.78 }
        ];
        for (const d of drips) {
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('class', 'spl-drip');
            rect.setAttribute('x', d.x);
            rect.setAttribute('width', d.w);
            rect.setAttribute('y', 300);
            rect.setAttribute('height', 0);
            rect.setAttribute('rx', d.w / 2);
            this.dripGroup.appendChild(rect);
            this._drips.push({ el: rect, at: d.at, max: d.max, grow: 0 });
        }

        const splats = [
            { x: 120, y: 250, r: 16, at: 0.30 },
            { x: 1090, y: 285, r: 12, at: 0.52 },
            { x: 168, y: 330, r: 9, at: 0.70 },
            { x: 1040, y: 200, r: 7, at: 0.86 }
        ];
        for (const s of splats) {
            const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            dot.setAttribute('class', 'spl-splat');
            dot.setAttribute('cx', s.x);
            dot.setAttribute('cy', s.y);
            dot.setAttribute('r', s.r);
            dot.setAttribute('opacity', '0');
            this.splatGroup.appendChild(dot);
            this._splats.push({ el: dot, at: s.at, r: s.r });
        }
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
        this.startButton.removeEventListener('click', this._onStartClick);
        if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
        const style = document.getElementById(STYLE_ID);
        if (style && style.parentNode) style.parentNode.removeChild(style);
    }

    // =========================================================================
    // Bucle de pintado del grafiti
    // =========================================================================

    _loop(now) {
        if (this.destroyed) return;
        this._raf = requestAnimationFrame(this._loop);

        const dt = Math.min(64, now - this._lastTime);   // ms, acotado tras un cambio de pestana
        this._lastTime = now;

        // La pintura "persigue" al progreso real: nunca adelanta lo que se ha
        // cargado, y aloload lento alcanza la barra sin saltos.
        const target = this.ready ? 1 : this.progress;
        const speed = dt / (this.ready ? 420 : 900);
        if (this.paint < target) {
            this.paint = Math.min(target, this.paint + speed);
        } else if (this.paint > target) {
            this.paint = Math.max(target, this.paint - speed * 0.5);
        }

        this._paint();
    }

    /** Dibuja un frame del grafiti a partir de `this.paint`. */
    _paint() {
        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        const p = reduced ? this.progress : this.paint;

        // Rango vertical del logo: de abajo (lleno) a arriba (vacio).
        const bottom = 330;
        const top = 120;
        const edgeY = bottom - (bottom - top) * p;

        // Borde ondulado: 9 tramos con amplitudes fijas (semilla estable) y
        // una respiracion lenta, para que el trazo se mueva como una brocha.
        const t = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;
        const steps = 9;
        let d = 'M -60 ' + edgeY.toFixed(1);
        for (let i = 0; i <= steps; i++) {
            const x = -60 + (1320 * i) / steps;
            const seed = noise(i + 3);
            const wobble = reduced ? 0 : Math.sin(t * 2.2 + i * 1.7) * 6;
            const y = edgeY + (seed - 0.5) * 16 + wobble;
            const cx = x - (1320 / steps) / 2;
            const cy = edgeY + (seed - 0.5) * 34 + wobble * 1.6;
            d += ' Q ' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ' ' + x.toFixed(1) + ' ' + y.toFixed(1);
        }
        d += ' L 1260 440 L -60 440 Z';
        this.edgePath.setAttribute('d', d);

        // Brillo que recorre la pintura: hace que se vea "fresca".
        const sheenY = bottom - (bottom - top) * ((p * 1.6) % 1) - 60;
        this.sheenRect.setAttribute('y', sheenY.toFixed(1));

        // Neblina de spray justo en el borde: el punto por donde esta pintando.
        this.mistRect.setAttribute('y', (edgeY - 23).toFixed(1));
        this.mistRect.setAttribute('opacity', p > 0.02 && p < 0.999 ? '0.1' : '0');

        // Chorrosones: crecen cuando la pintura pasa por debajo de su letra.
        for (const drip of this._drips) {
            if (p >= drip.at) {
                drip.grow = Math.min(1, drip.grow + dt / 520);
            }
            const h = drip.max * easeOut(drip.grow);
            drip.el.setAttribute('y', (300 - h).toFixed(1));
            drip.el.setAttribute('height', h.toFixed(1));
            drip.el.setAttribute('opacity', drip.grow > 0 ? '1' : '0');
        }

        // Salpicaduras: aparecen de golpe cuando la pintura las alcanza.
        for (const splat of this._splats) {
            const shown = p >= splat.at;
            splat.el.setAttribute('opacity', shown ? '1' : '0');
            splat.el.setAttribute('r', shown ? splat.r.toFixed(1) : '0');
        }
    }
}

function easeOut(t) {
    const x = Math.max(0, Math.min(1, t));
    return 1 - (1 - x) * (1 - x);
}

/**
 * Pantalla completa para movil y PC. Todo elquirido de API (webkit, ms, sin
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
     * @returns {Promise<boolean>} si se/fullscreen quedo activo
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