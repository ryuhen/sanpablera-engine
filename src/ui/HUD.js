/**
 * ============================================================================
 * SANPABLERA ENGINE · ui/HUD.js
 * ----------------------------------------------------------------------------
 * HUD de combate estilo STREET FIGHTER II (Especificaciones, seccion 3):
 *  - Dos barras de vida arriba, una por luchador, que se vacian hacia el
 *    centro de la pantalla (P1 hacia la derecha, P2 hacia la izquierda).
 *  - El tiempo de round en el centro, entre las dos barras (cuenta atras).
 *  - Debajo del nombre de cada luchador, la barra de STAMINA: se consume al
 *    correr y en parkour (core/combat/Stamina.js) y se regenera al parar.
 *
 * POR QUE ES UN MODULO PROPIO Y NO PARTE DE UI.js
 *   UI.js es la capa de CONTROLES tactiles (dpad + botones) y habla con
 *   TouchControls. El HUD es una capa de PRESENTACION de datos de combate,
 *   se actualiza cada frame desde el render loop y no deberia mezclarse con
 *   la entrada. Asi los helpers puros (clampStat, barColor, formatTimer) se
 *   testean en Node sin navegador.
 *
 * COMO LO LEE EL MOTOR
 *   render() llama a update(id, { health, stamina }) con el estado actual de
 *   cada peleador y a tick(dt) una vez por frame. Las barras persiguen el
 *   valor objetivo con un lerp independiente del framerate (a 30 o 60 fps se
 *   ve igual). startRound(segundos) reinicia el tiempo del round.
 * ============================================================================
 */

export const MAX_STAT = 100;
export const LOW_HEALTH_THRESHOLD = 0.25;
export const DEFAULT_ROUND_SECONDS = 99;

export const STAMINA_COLOR = '#39d98a';
const STAMINA_GLOW = '0 0 8px rgba(57, 217, 138, 0.9)';

// Velocidad con la que la barra persigue su valor objetivo. Cuanto mas alto,
// mas inmediato; un valor bajo la hace "colgada" (mezcla entre valor objetivo
// y valor anterior), que es como se ve un HUD de lucha real.
const LERP_SPEED = 10;

// Umbral (en segundos) a partir del cual el tiempo parpadea en rojo.
const TIMER_WARNING_SECONDS = 10;

// ---------------------------------------------------------------------------
// Helpers puros (testables en Node)
// ---------------------------------------------------------------------------

export function clampStat(value, max = MAX_STAT) {
    // Sin dato (null/undefined/'') o NaN se lee como "barra llena", nunca
    // como 0: un luchador recien creado no deberia aparecer KO.
    if (value == null || value === '') return max;
    const v = Number(value);
    if (!Number.isFinite(v)) return max;
    return Math.max(0, Math.min(max, v));
}

// Color de la barra de vida segun la proporcion de salud que queda. No es
// solo estetica: el cambio de verde a rojo es la senal que parsea el ojo en
// un frame. Se expresa por umbrales, nunca entre grupos de frames.
export function barColor(ratio) {
    if (ratio <= 0) return '#5c1518';
    if (ratio <= LOW_HEALTH_THRESHOLD) return '#e0342c';
    if (ratio <= 0.5) return '#e8a41c';
    return '#43c46b';
}

// Formato del tiempo de round: segundos enteros, dos digitos minimo, como la
// cuenta atras del Street Fighter II ("99", "07").
export function formatTimer(seconds) {
    return String(Math.max(0, Math.floor(seconds))).padStart(2, '0');
}

function lerpValue(from, to, t) {
    return from + (to - from) * t;
}

// Factor de lerp independiente del framerate. `dt` esta en segundos.
function lerpFactor(dt) {
    return 1 - Math.exp(-dt * LERP_SPEED);
}

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------

const HUD_CSS = `\
.spf-hud{position:fixed;inset:0;pointer-events:none;z-index:50;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;user-select:none}\
.spf-hud-side{position:absolute;top:max(10px,env(safe-area-inset-top));width:min(46vw,470px)}\
.spf-hud-p1{left:max(10px,env(safe-area-inset-left))}\
.spf-hud-p2{right:max(10px,env(safe-area-inset-right));text-align:right}\
.spf-hud-name{font-size:clamp(12px,2.6vh,16px);letter-spacing:3px;font-weight:800;color:#f4f4f8;text-shadow:0 2px 0 rgba(0,0,0,.6)}\
.spf-hud-stamina{position:relative;height:clamp(6px,1.6vh,10px);width:52%;min-width:88px;margin-top:2px;margin-bottom:3px;background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.14);border-radius:2px;overflow:hidden}\
.spf-hud-p2 .spf-hud-stamina{margin-left:auto;margin-right:0}\
.spf-hud-health{position:relative;height:clamp(16px,4.4vh,26px);background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.22);border-radius:3px;overflow:hidden}\
.spf-hud-fill{position:absolute;top:0;bottom:0;width:100%;border-radius:2px;transition:width .12s linear}\
.spf-hud-p1 .spf-hud-fill{right:0}\
.spf-hud-p2 .spf-hud-fill{left:0}\
.spf-hud-fill.low{animation:spf-hud-pulse .5s steps(2,end) infinite}\
@keyframes spf-hud-pulse{0%{filter:brightness(1)}100%{filter:brightness(1.7)}}\
.spf-hud-timer{position:absolute;top:max(3px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);text-align:center;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.16);border-radius:6px;padding:2px 10px}\
.spf-hud-timer-cap{font-size:clamp(8px,1.6vh,11px);letter-spacing:4px;color:#cfd3e8;text-transform:uppercase}\
.spf-hud-timer-digits{font-size:clamp(22px,6vh,38px);font-weight:800;color:#fff;letter-spacing:2px;line-height:1;text-shadow:0 2px 0 rgba(0,0,0,.7)}\
.spf-hud-timer.warn .spf-hud-timer-digits{color:#ff4d3a;animation:spf-hud-pulse .6s steps(2,end) infinite}`;

let HUD_STYLE_TAG = null;

function ensureStyles() {
    if (HUD_STYLE_TAG) return;
    const tag = document.createElement('style');
    tag.id = 'spf-hud-style';
    tag.textContent = HUD_CSS;
    document.head.appendChild(tag);
    HUD_STYLE_TAG = tag;
}

function makeElement(className, parent) {
    const node = document.createElement('div');
    node.className = className;
    parent.appendChild(node);
    return node;
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

class HUD {
    /**
     * @param {object} opts
     * @param {Array}  opts.fighters      [{ id, label, color, health, stamina,
     *                                     maxHealth }]
     * @param {number} [opts.roundSeconds] duracion del round en segundos
     */
    constructor(opts = {}) {
        this.fighters = (opts.fighters || []).map(f => Object.assign({
            id: 'F',
            label: 'FIGHTER',
            color: '#ffffff',
            maxHealth: MAX_STAT
        }, f));

        this.panels = {};
        this.root = null;

        this.roundSeconds = opts.roundSeconds || DEFAULT_ROUND_SECONDS;
        this.timerSeconds = this.roundSeconds;
        this.timerActive = true;

        this.build();
    }

    build() {
        ensureStyles();
        this.root = makeElement('spf-hud', document.body);

        this.fighters.forEach((f, i) => {
            const side = i === 0 ? 'p1' : 'p2';
            const panel = makeElement('spf-hud-side spf-hud-' + side, this.root);

            const name = makeElement('spf-hud-name', panel);
            name.textContent = f.label;
            name.style.color = f.color;

            const staminaTrack = makeElement('spf-hud-track spf-hud-stamina', panel);
            const staminaFill = makeElement('spf-hud-fill', staminaTrack);

            const healthTrack = makeElement('spf-hud-track spf-hud-health', panel);
            const healthFill = makeElement('spf-hud-fill', healthTrack);

            const state = {
                health: clampStat(f.health, f.maxHealth),
                stamina: clampStat(f.stamina),
                displayHealth: 0,
                displayStamina: 0
            };
            this.panels[f.id] = {
                fighter: f,
                state,
                healthFill,
                staminaFill
            };

            // El primer render es con el valor ya aplicado (sin lerp), para
            // que el HUD no "arranque" desde cero al empezar el combate.
            this.apply(f.id, state.health, state.stamina, true);
        });

        // Tiempo de round en el centro, entre las dos barras.
        const timer = makeElement('spf-hud-timer', this.root);
        const cap = makeElement('spf-hud-timer-cap', timer);
        cap.textContent = 'time';
        const digits = makeElement('spf-hud-timer-digits', timer);
        this.timerEl = timer;
        this.timerDigits = digits;
        this.setTimer(this.timerSeconds, true);
    }

    /**
     * Objetivo de estado para un luchador. Lo llama render() con lo que el
     * juego sabe este frame. Tambien sirve como API de debug (consola).
     */
    update(id, stats = {}) {
        const panel = this.panels[id];
        if (!panel) return;
        const { fighter, state } = panel;
        if (stats.health != null) state.health = clampStat(stats.health, fighter.maxHealth);
        if (stats.stamina != null) state.stamina = clampStat(stats.stamina);
    }

    /**
     * Empuja las barras hacia el valor objetivo. `instant` salta directo sin
     * interpolar (arranque del round, reset).
     */
    apply(id, health, stamina, instant = false) {
        const panel = this.panels[id];
        if (!panel) return;
        const { fighter, state } = panel;
        state.health = clampStat(health, fighter.maxHealth);
        state.stamina = clampStat(stamina);
        if (instant) {
            state.displayHealth = state.health;
            state.displayStamina = state.stamina;
        }
    }

    /** Comienza (o reinicia) el tiempo de round. */
    startRound(seconds = this.roundSeconds) {
        this.roundSeconds = seconds;
        this.setTimer(seconds, true);
        this.timerActive = true;
    }

    /** Pone el tiempo del round; con `instant` se salta el descuento. */
    setTimer(seconds, instant = false) {
        this.timerSeconds = Math.max(0, Number(seconds) || 0);
        if (instant) this.timerDigits.textContent = formatTimer(this.timerSeconds);
        this.timerEl.classList.toggle('warn', this.timerSeconds <= TIMER_WARNING_SECONDS);
    }

    /** Detiene/arranca el descuento del round. */
    pauseTimer(active = false) {
        this.timerActive = !!active;
    }

    /** Un frame de animacion de barras y del tiempo. `dt` en segundos. */
    tick(dt = 1 / 60) {
        const t = lerpFactor(dt);

        if (this.timerActive) {
            this.timerSeconds = Math.max(0, this.timerSeconds - dt);
            this.timerDigits.textContent = formatTimer(this.timerSeconds);
            this.timerEl.classList.toggle('warn', this.timerSeconds <= TIMER_WARNING_SECONDS);
            if (this.timerSeconds <= 0) {
                // Round agotado: se reinicia solo (aun no hay logica de KO).
                this.timerSeconds = this.roundSeconds;
            }
        }

        for (const id in this.panels) {
            const { fighter, state, healthFill, staminaFill } = this.panels[id];

            state.displayHealth = lerpValue(state.displayHealth, state.health, t);
            state.displayStamina = lerpValue(state.displayStamina, state.stamina, t);

            const healthRatio = state.displayHealth / fighter.maxHealth;
            const staminaRatio = state.displayStamina / MAX_STAT;

            healthFill.style.width = (healthRatio * 100) + '%';
            healthFill.style.backgroundColor = barColor(healthRatio);
            healthFill.classList.toggle('low', healthRatio > 0 && healthRatio <= LOW_HEALTH_THRESHOLD);

            staminaFill.style.width = (staminaRatio * 100) + '%';
            staminaFill.style.backgroundColor = STAMINA_COLOR;
            const full = state.displayStamina >= MAX_STAT;
            staminaFill.classList.toggle('low', !full && staminaRatio > 0 && staminaRatio <= LOW_HEALTH_THRESHOLD);
            staminaFill.style.boxShadow = full ? STAMINA_GLOW : 'none';
        }
    }

    destroy() {
        if (this.root && this.root.parentNode) {
            this.root.parentNode.removeChild(this.root);
        }
        this.root = null;
        this.panels = {};
    }
}

export default HUD;