/**
 * ============================================================================
 * SANPABLERA ENGINE · FSM · GrappleSession.js
 * ----------------------------------------------------------------------------
 * LA SESION DE AGARRE: el arbitro que comparten los dos luchadores agarrados.
 *
 * Por que NO se resuelve dentro de la FSM de cada uno:
 *   Un agarre es un dialogue, no dos maquinas de estados independientes. Quien
 *   gana depende de los DOS (si el UKE escapa antes de que el TORI sume) y el
 *   resultado tiene que ser identico en las dos maquinas o se desincronizan.
 *   Por eso hay UN objeto de sesion con UN contador de frames, y las dos FSM
 *   solo lo consultan.
 *
 * El reparto de poderes:
 *   TORI: ATACAR, PROYECCION, SUMISION.   UKE: ESCAPE.
 *   Cuando ambos pulsan en el mismo frame gana segun GRAPPLE_PRIORITY
 *   (sumision > proyeccion > atemi > escape): el TORI tiene ventaja, y por eso
 *   el UKE tiene la ventana de escape y la mecanica de presion para competir.
 *
 * Determinismo: la sesion solo avanza con step(frame) y guarda el ultimo frame
 * que proceso. Dos luchadores llamando a step() en el mismo frametick hace un
 * unico avance (idempotente), asi que da igual el orden de actualizacion.
 * ============================================================================
 */
import SPF from './Constants.js';

const {
    CONFIG, GrappleRole, GrappleStance, GrappleAction, GRAPPLE_PRIORITY, State
} = SPF;

/** Frames que el UKE queda tras resolver el agarre (castigo del TORI). */
const TORI_PUNISH_FRAMES = 26;
const UKE_RECOVER_FRAMES = 10;

export class GrappleSession {
    /**
     * @param {object} opts
     * @param {string} opts.tori  id del luchador que aplica (fighter ref)
     * @param {string} opts.uke   id del luchador que recibe
     * @param {string} opts.stance   postura inicial de agarre
     * @param {string} opts.surface  'VERTICAL' | 'SUELO'
     * @param {object} opts.api       utilidades del combate (damage, meter...)
     */
    constructor(opts) {
        this.tori = opts.tori;
        this.uke = opts.uke;
        this.stance = opts.stance || GrappleStance.PIE;
        this.baseStance = this.stance;
        this.surface = opts.surface || 'VERTICAL';
        this.api = opts.api || {};

        this.frame = 0;
        this.pressure = 0;          // presion que accumulates sobre el UKE
        this.escapeMash = 0;        // pulsaciones de escape acumuladas
        this.action = null;         // accion en curso (o null = mantener)
        this.actionFrame = 0;
        this.active = true;
        this.result = null;         // 'ESCAPE' | 'THROW' | 'SUBMIT' | 'BREAK'
        this.lastExit = null;       // estado de salida de cada papel (lo lee la FSM)
        this.lastStepFrame = -1;
        this._mashCooldown = 0;

        // Peticiones de este frame. Cada rol deja UNA y se resuelve al final.
        this._requests = new Map();
        this._listeners = [];
    }

    /** Quien de los dos es este luchador. */
    roleOf(fighterId) {
        if (fighterId === this.tori) return GrappleRole.TORI;
        if (fighterId === this.uke) return GrappleRole.UKE;
        return null;
    }

    isTori(fighterId) {
        return fighterId === this.tori;
    }

    /** Peticion de accion de este frame. Se ignora si no es su turno. */
    request(fighterId, action) {
        const role = this.roleOf(fighterId);
        if (!role || !this.active) return false;

        // El UKE solo puede escapar; el TORI solo puede atacar/proyectar/sumir.
        const allowed = role === GrappleRole.UKE
            ? [GrappleAction.ESCAPE]
            : [GrappleAction.ATACAR, GrappleAction.PROYECCION, GrappleAction.SUMISION];
        if (allowed.indexOf(action) === -1) return false;

        this._requests.set(role, { action, order: this.frame });
        return true;
    }

    /** Estado que le toca a este luchador segun la postura actual. */
    stateIdFor(fighterId) {
        const role = this.roleOf(fighterId);
        return role ? SPF.grappleState(this.stance, role) : null;
    }

    /** Acciones disponibles en la postura actual (para los guards). */
    availableActions() {
        const row = SPF.GRAPPLE_STATES[this.stance];
        return row ? Object.keys(row) : [];
    }

    onResolve(fn) {
        this._listeners.push(fn);
        return () => {
            const i = this._listeners.indexOf(fn);
            if (i !== -1) this._listeners.splice(i, 1);
        };
    }

    _emit(event) {
        for (const fn of this._listeners) fn(event, this);
    }

    /**
     * Avanza un frame de agarre.
     * @param {number} frame Numero de frame ABSOLUTO de la simulacion. La
     *        sesion es idempotente con respecto a ese numero: si los dos
     *        luchadores llaman a step() en el mismo frame, solo avanza una vez.
     * @returns {boolean} true si este frame realmente avanzo
     */
    step(frame) {
        if (!this.active) return false;
        if (this.lastStepFrame === frame) return false;
        this.lastStepFrame = frame;
        this.frame++;

        // 1) Presion: la sube el TORI frame a frame mientras mantiene el agarre.
        const perFrame = this._pressurePerFrame();
        if (perFrame) {
            this.pressure = Math.min(CONFIG.GRAPPLE_PRESSURE_MAX, this.pressure + perFrame);
        } else if (this.action === null) {
            // Sin accion en curso la presion baja: hay que actively presionar.
            this.pressure = Math.max(0, this.pressure - CONFIG.GRAPPLE_PRESSURE_DECAY);
        }

        // 2) Accion en curso
        if (this.action) {
            this.actionFrame++;
            const def = this._actionDef(this.action);
            if (def && this.actionFrame >= def.frames) {
                this._finishAction(def);
            }
            this._clearRequests();
            return true;
        }

        // 3) Resolucion de peticiones de este frame
        const winner = this._resolveRequests();
        if (winner) {
            this._beginAction(winner.action, winner.role);
            this._clearRequests();
            return true;
        }

        // 4) Escape por machaqueo: el UKE puede romper el agarre sin que el
        //    TORI este haciendo nada. Es el escape "gratis" y el que hace que
        //    mantener el agarre sin presion sea mala idea.
        if (this._escapeByMash()) {
            this._end(GrappleAction.ESCAPE, 'mash');
            this._clearRequests();
            return true;
        }

        // 5) El UKE se libera solo si la presion llega al tope (fallo del TORI)
        if (this.pressure >= CONFIG.GRAPPLE_PRESSURE_MAX) {
            this._end(GrappleAction.ESCAPE, 'presion');
            this._clearRequests();
            return true;
        }

        // 6) La cuenta de escape se enfría: hay que MACHACAR de verdad, no dar
        //    cuatro toques y esperar.
        if (this.escapeMash > 0 && ++this._mashCooldown >= 4) {
            this._mashCooldown = 0;
            this.escapeMash--;
        }

        this._clearRequests();
        return true;
    }

    /**
     * Descarta las peticiones de este frame.
     *
     * POR QUE HACE FALTA EXPLICITA: las peticiones se acumulan en `request()` y
     * se resuelven UNA vez al final de `step()`. Si no se limpiaran, una peticion
     * se resolveria otra vez en todos los frames siguientes y el TORI mantendria
     * el atemi para siempre. Se llama en TODAS las salidas de `step()`.
     */
    _clearRequests() {
        this._requests.clear();
    }

    /** Metodo del UKE: una pulsacion de escape suma a la cuenta. */
    mashEscape() {
        this.escapeMash++;
        return this.escapeMash;
    }

    // -----------------------------------------------------------------------
    // Internos
    // -----------------------------------------------------------------------

    _pressurePerFrame() {
        const row = SPF.GRAPPLE_STATES[this.stance];
        if (!row) return 0;
        // La presion la genera el estado TORI de la postura actual.
        const def = this._stateDef(row[GrappleRole.TORI]);
        return def && def.grapple ? (def.grapple.pressurePerFrame || 0) : 0;
    }

    _stateDef(stateId) {
        return this.api.getState ? this.api.getState(stateId) : null;
    }

    /** Definicion de la accion pedida en la postura actual (puede ser null). */
    _actionDef(action) {
        const row = SPF.GRAPPLE_STATES[this.stance];
        if (!row) return null;
        const def = this._stateDef(row[GrappleRole.TORI]);
        if (!def || !def.grapple || !def.grapple.actions) return null;
        return def.grapple.actions[action] || null;
    }

    _beginAction(action, role) {
        const def = this._actionDef(action);
        if (!def) return;
        this.action = action;
        this.actionFrame = 0;
        this.actor = role;
        this._emit({ type: 'ACTION_START', action, role });
    }

    _finishAction(def) {
        const action = this.action;
        this.action = null;
        this.actionFrame = 0;

        // Dano y presion los recibe el UKE
        if (def.damage && this.api.damageUke) this.api.damageUke(def.damage, action);
        if (def.pressure) this.pressure = Math.min(CONFIG.GRAPPLE_PRESSURE_MAX, this.pressure + def.pressure);
        if (def.meterGain && this.api.addToriMeter) this.api.addToriMeter(def.meterGain);

        if (def.resolves === 'ESCAPE') {
            this._end(GrappleAction.ESCAPE, 'accion');
        } else if (def.resolves === 'THROW') {
            this._end(GrappleAction.PROYECCION, 'accion');
        } else if (def.resolves === 'SUBMIT') {
            // La sumision NO cierra el agarre: pasa a la postura de sumision y
            // el UKE tiene que romper la presion para salir.
            this.stance = GrappleStance.SUMISION;
            this.escapeMash = 0;
            this._emit({ type: 'SUBMITTED' });
        } else {
            // HOLD: se vuelve al agarre base y se reinicia la cuenta de escape.
            this.stance = this.baseStance;
            this.escapeMash = 0;
        }
    }

    /**
     * Ganador de este frame si ambos pulsaron. Prioridad por GRAPPLE_PRIORITY
     * y, a igualdad, el primero que pidio (menor frame de peticion).
     */
    _resolveRequests() {
        if (this._requests.size === 0) return null;

        // Fuera de la ventana de escape, las peticiones del UKE se ignoran.
        if (this._requests.has(GrappleRole.UKE) &&
            (this.frame < CONFIG.GRAPPLE_ESCAPE_WINDOW_START ||
                this.frame > CONFIG.GRAPPLE_ESCAPE_WINDOW_END)) {
            this._requests.delete(GrappleRole.UKE);
        }
        if (this._requests.size === 0) return null;

        const candidates = [];
        for (const [role, req] of this._requests) {
            const def = this._actionDef(req.action);
            // Si la postura actual no admite la accion, no cuenta (una
            // sumision desde clinch no existe).
            if (!def) continue;
            candidates.push({ role, action: req.action, order: req.order });
        }
        if (candidates.length === 0) return null;

        candidates.sort((a, b) => {
            const pa = GRAPPLE_PRIORITY.indexOf(a.action);
            const pb = GRAPPLE_PRIORITY.indexOf(b.action);
            if (pa !== pb) return pa - pb;
            return a.order - b.order;
        });
        return candidates[0];
    }

    _escapeByMash() {
        return this.escapeMash >= CONFIG.GRAPPLE_ESCAPE_MASH_FRAMES;
    }

    /** Cierra el agarre y avisa a los dos. */
    _end(result, why) {
        if (!this.active) return;
        this.active = false;
        this.result = result;

        // Estado de salida de cada uno. El UKE sale lanzado si hubo proyeccion;
        // si escapo, el castigo es para el TORI (de rodillas) y el UKE solo
        // lleva un tropezon corto. Es el equilibrio del sistema: si el UKE
        // ganara siempre, no habria agarre posible.
        const exit = {
            [GrappleRole.TORI]: {
                [GrappleAction.PROYECCION]: State.AGACHADO,
                [GrappleAction.ESCAPE]: State.DE_RODILLAS,
                [GrappleAction.SUMISION]: State.AGACHADO_GUARDIA_ALTA
            }[result] || State.DE_RODILLAS,
            [GrappleRole.UKE]: {
                [GrappleAction.PROYECCION]: State.JUGGLER,
                [GrappleAction.ESCAPE]: this.surface === 'SUELO'
                    ? State.SUELO_TUMBADO_BOCA_ABAJO
                    : State.TROPEZON,
                [GrappleAction.SUMISION]: State.TROPEZON
            }[result] || State.TROPEZON
        };

        this.lastExit = exit;

        this._emit({
            type: 'RESOLVED',
            result,
            why,
            exit,
            punishFrames: TORI_PUNISH_FRAMES,
            recoverFrames: UKE_RECOVER_FRAMES
        });
    }
}

export default GrappleSession;