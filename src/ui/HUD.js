/**
 * ============================================================================
 * SANPABLERA ENGINE · ui/HUD.js
 * ----------------------------------------------------------------------------
 * HUD de combate (Especificaciones, seccion 3): barras de vida y de recurso en
 * tiempo real para cada luchador.
 *
 * QUE MUESTRA
 *   Por luchador, una etiqueta, una barra de vida y debajo una barra de
 *   recurso (energia / barra especial). El ancla de la barra de vida esta en
 *   el centro de la pantalla: P1 se vacia hacia la derecha y P2 hacia la
 *   izquierda, como en cualquier juego de lucha.
 *
 * POR QUE ES UN MODULO PROPIO Y NO PARTE DE UI.js
 *   UI.js es la capa de CONTROLES tactiles (dpad + botones) y habla con
 *   TouchControls. El HUD es una capa de PRESENTACION de datos de combate,
 *   se actualiza cada frame desde el render loop y no deberia mezclarse con
 *   la entrada. Ademas, asi se puede testear en Node: los helpers puros
 *   (clampStat, barColor) se importan y comprueban sin arrancar un navegador.
 *
 * COMO LO LEE EL MOTOR
 *   render() llama a update(id, { health, meter }) con el estado actual de
 *   cada peleador y a tick(dt) una vez por frame. Las barras persiguen el
 *   valor objetivo con un lerp independiente del framerate (el movil a 30 o
 *   60 fps se ve igual).
 * ============================================================================
 */

export const MAX_STAT = 100;
export const LOW_HEALTH_THRESHOLD = 0.25;

// Velocidad con la que la barra persigue su valor objetivo. Cuanto mas alto,
// mas inmediato; un valor bajo la hace "colgada" (mezcla entre valor objetivo
// y valor anterior), que es como se ve un HUD de lucha real.
const LERP_SPEED = 10;

const METER_COLOR = '#f7c93e';
const FULL_METER_GLOW = '0 0 10px rgba(247, 201, 62, 0.9)';

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
.spf-hud-side{position:absolute;top:max(12px,env(safe-area-inset-top));width:min(44vw,400px)}\
.spf-hud-p1{left:max(12px,env(safe-area-inset-left))}\
.spf-hud-p2{right:max(12px,env(safe-area-inset-right));text-align:right}\
.spf-hud-name{font-size:clamp(11px,2.2vh,14px);font-weight:700;letter-spacing:2px;color:#e8e8ee;margin-bottom:3px}\
.spf-hud-track{position:relative;height:clamp(13px,3.2vh,20px);background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.18);border-radius:3px;overflow:hidden}\
.spf-hud-fill{position:absolute;top:0;bottom:0;width:100%;border-radius:2px;transition:width .12s linear}\
.spf-hud-p1 .spf-hud-fill{right:0}\
.spf-hud-p2 .spf-hud-fill{left:0}\
.spf-hud-meter{height:clamp(7px,1.8vh,11px);margin-top:4px;width:70%;min-width:90px}\
.spf-hud-fill.low{animation:spf-hud-pulse .5s steps(2,end) infinite}\
@keyframes spf-hud-pulse{0%{filter:brightness(1)}100%{filter:brightness(1.7)}}`;

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
     * @param {Array}  opts.fighters  [{ id, label, color, health, meter,
     *                                 maxHealth, maxMeter }]
     */
    constructor(opts = {}) {
        this.fighters = (opts.fighters || []).map(f => Object.assign({
            id: 'F',
            label: 'FIGHTER',
            color: '#ffffff',
            maxHealth: MAX_STAT,
            maxMeter: MAX_STAT
        }, f));

        this.panels = {};
        this.root = null;
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

            const healthTrack = makeElement('spf-hud-track', panel);
            const healthFill = makeElement('spf-hud-fill', healthTrack);

            const meterTrack = makeElement('spf-hud-track spf-hud-meter', panel);
            const meterFill = makeElement('spf-hud-fill', meterTrack);

            const state = {
                health: clampStat(f.health, f.maxHealth),
                meter: clampStat(f.meter, f.maxMeter),
                displayHealth: 0,
                displayMeter: 0
            };
            this.panels[f.id] = {
                fighter: f,
                state,
                healthFill,
                meterFill
            };

            // El primer render es con el valor ya aplicado (sin lerp), para
            // que el HUD no "arranque" desde cero al empezar el combate.
            this.apply(f.id, state.health, state.meter, true);
        });
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
        if (stats.meter != null) state.meter = clampStat(stats.meter, fighter.maxMeter);
    }

    /**
     * Empuja las barras hacia el valor objetivo. `instant` salta directo sin
     * interpolar (arranque del round, reset).
     */
    apply(id, health, meter, instant = false) {
        const panel = this.panels[id];
        if (!panel) return;
        const { fighter, state } = panel;
        state.health = clampStat(health, fighter.maxHealth);
        state.meter = clampStat(meter, fighter.maxMeter);
        if (instant) {
            state.displayHealth = state.health;
            state.displayMeter = state.meter;
        }
    }

    /** Un frame de animacion de barras. `dt` en segundos. */
    tick(dt = 1 / 60) {
        const t = lerpFactor(dt);
        for (const id in this.panels) {
            const { fighter, state, healthFill, meterFill } = this.panels[id];

            state.displayHealth = lerpValue(state.displayHealth, state.health, t);
            state.displayMeter = lerpValue(state.displayMeter, state.meter, t);

            const healthRatio = state.displayHealth / fighter.maxHealth;
            const meterRatio = state.displayMeter / fighter.maxMeter;

            healthFill.style.width = (healthRatio * 100) + '%';
            healthFill.style.backgroundColor = barColor(healthRatio);
            healthFill.classList.toggle('low', healthRatio > 0 && healthRatio <= LOW_HEALTH_THRESHOLD);

            meterFill.style.width = (meterRatio * 100) + '%';
            meterFill.style.backgroundColor = METER_COLOR;
            const full = state.displayMeter >= fighter.maxMeter;
            meterFill.classList.toggle('full', full);
            meterFill.style.boxShadow = full ? FULL_METER_GLOW : 'none';
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