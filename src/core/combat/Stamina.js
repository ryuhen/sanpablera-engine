/**
 * ============================================================================
 * SANPABLERA ENGINE · combat/Stamina.js
 * ----------------------------------------------------------------------------
 * La barra de stamina de un luchador (el HUD la dibuja bajo su nombre).
 *
 * REGLA DE CONSUMO AL CORRER
 *   Quien corre gasta stamina; quien no corre la regenera. Pero no todo correr
 *   cuesta lo mismo: la direccion del movimiento RESPECTO AL RIVAL decide la
 *   tasa (Especificaciones, seccion 3):
 *
 *     - Correr HACIA el rival ............... 1x   (perseguir es gratis-ish)
 *     - Correr ALEJANDOSE del rival .......... 1.5x (huir cansa mas rapido)
 *     - Correr LATERAL / en paralelo ......... 0x   (movimiento tactico)
 *
 *   El resultado es el de cualquier juego de lucha con escapatoria: a igual
 *   velocidad, el que persigue aguanta mas tiempo corriendo que el que huye, y
 *   el que lateraliza se guarda el aire. Con la tasa base de 18/s, correr de
 *   frente dura ~5,5 s, huir ~3,7 s, y correr en paralelo puede durar todo el
 *   round (no cuesta nada).
 *
 * PARKOUR
 *   Desplazarse usando el escenario (rebotar, deslizarse) tambien sale de
 *   aqui: cada maniobra tiene un coste fijo (PARKOUR_COST) que se descuenta al
 *   ejecutarla. spendParkour() devuelve false si no hay stamina, que es quien
 *   decide si la maniobra SE PUEDE hacer.
 *
 * POR QUE ES UN MODULO PURO
 *   No toca Babylon ni el DOM: solo numeros. El motor lo usa cada frame con el
 *  vector de movimiento y la direccion al rival, y se testea en Node.
 * ============================================================================
 */

export const STAMINA_MAX = 100;
export const RUN_BASE_DRAIN_PER_SEC = 18;
export const RUN_AWAY_MULTIPLIER = 1.5;
export const STAMINA_REGEN_PER_SEC = 24;

// Umbral del coseno del angulo entre el movimiento y la direccion al rival.
// |dot| above => se trata como HACIA / ALEJANDOSE; el resto es LATERAL.
export const LATERAL_COS = 0.35;

export const MOVE_CLASS = Object.freeze({
    TOWARD: 'TOWARD',
    AWAY: 'AWAY',
    LATERAL: 'LATERAL'
});

// Coste fijo (en puntos) de cada maniobra de parkour. SE EJECUTA cuando
// spendParkour la devuelve true; si no hay stamina, la maniobra no sale.
export const PARKOUR_COST = Object.freeze({
    REBOTE: 8,       // rebotar contra el escenario
    DESLIZAR: 14     // deslizarse por una rampa/obstaculo
});

// ---------------------------------------------------------------------------
// Helpers puros
// ---------------------------------------------------------------------------

function clampStat(value, max = STAMINA_MAX) {
    if (value == null || value === '') return max;
    const v = Number(value);
    if (!Number.isFinite(v)) return max;
    return Math.max(0, Math.min(max, v));
}

/**
 * Clasifica un movimiento respecto al rival en TOWARD / AWAY / LATERAL.
 *
 * @param {number} mx, mz   vector de movimiento (velocidad)
 * @param {number} ox, oz   vector del corredor hacia el rival
 * @returns {string|null}   MOVE_CLASS.* o null si algun vector es ~0
 */
export function classifyMove(mx, mz, ox, oz) {
    const moveLen = Math.hypot(mx, mz);
    const oppLen = Math.hypot(ox, oz);
    if (moveLen < 1e-4 || oppLen < 1e-4) return null;

    const dot = (mx * ox + mz * oz) / (moveLen * oppLen);
    if (dot >= LATERAL_COS) return MOVE_CLASS.TOWARD;
    if (dot <= -LATERAL_COS) return MOVE_CLASS.AWAY;
    return MOVE_CLASS.LATERAL;
}

// ---------------------------------------------------------------------------
// Gauge
// ---------------------------------------------------------------------------

export class StaminaGauge {
    /**
     * @param {object} [opts] { max, value }
     */
    constructor(opts = {}) {
        this.max = opts.max || STAMINA_MAX;
        this.value = clampStat(opts.value, this.max);
    }

    /** Proporcion 0..1 para el HUD. */
    ratio() {
        return this.value / this.max;
    }

    /** True si aun queda stamina para arrancar una carrera. */
    canRun() {
        return this.value > 0;
    }

    reset(v = this.max) {
        this.value = clampStat(v, this.max);
    }

    /** Descuenta `amount` (puntos). Devuelve cuanto se dreno realmente. */
    drain(amount) {
        const before = this.value;
        this.value = Math.max(0, this.value - amount);
        return before - this.value;
    }

    /** regen: solo se regenera cuando NO se corre (incluye lateral caminando). */
    regen(dt) {
        this.value = Math.min(this.max, this.value + STAMINA_REGEN_PER_SEC * dt);
    }

    /**
     * Un paso de simulacion. Devuelve `{ drain, move }` (drain en puntos y la
     * clase de movimiento detectada) para tests y logs.
     *
     * @param {number} dt          segundos del paso
     * @param {object} ctx
     *   { running:boolean, moveX, moveZ, toOppX, toOppZ,
     *     drainPerSec?:number, awayMultiplier?:number }
     */
    update(dt, ctx = {}) {
        if (!ctx.running) {
            this.regen(dt);
            return { drain: 0, move: null };
        }
        if (ctx.moveX === 0 && ctx.moveZ === 0) {
            // "Corriendo" en el sitio: no cuesta, no regenera.
            return { drain: 0, move: null };
        }

        const move = classifyMove(ctx.moveX, ctx.moveZ, ctx.toOppX, ctx.toOppZ);
        if (!move || move === MOVE_CLASS.LATERAL) {
            return { drain: 0, move };
        }

        const rate = (ctx.drainPerSec || RUN_BASE_DRAIN_PER_SEC)
            * (move === MOVE_CLASS.AWAY ? (ctx.awayMultiplier || RUN_AWAY_MULTIPLIER) : 1);
        const drained = this.drain(rate * dt);
        return { drain: drained, move };
    }

    /**
     * Intenta pagar una maniobra de parkour. Devuelve true y descuenta el
     * coste si hay stamina; false si no se puede.
     */
    spendParkour(kind) {
        const cost = PARKOUR_COST[kind];
        if (cost == null) return false;   // maniobra desconocida
        if (this.value < cost) return false;
        this.value -= cost;
        return true;
    }

    /** Coste generico (para maniobras fuera del catalogo de parkour). */
    spend(amount) {
        return this.drain(amount);
    }
}

export default StaminaGauge;