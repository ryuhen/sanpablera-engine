/**
 * ============================================================================
 * SANPABLERA ENGINE · FSM · StateMachine.js
 * ----------------------------------------------------------------------------
 * LA MAQUINA DE ESTADOS. Clase generica: no sabe nada de luchadores concretos
 * ni de Babylon. Habla con el exterior por dos puertos:
 *
 *   - `api`  (in): lo que la FSM necesita del mundo (vida, recurso, suelo,
 *           rival, sesion de agarre...). Lo implementa la entidad Fighter.
 *   - `motion` (out): lo que la FSM decide este frame (perfil fisico, pose,
 *           clip, hitbox activa). Lo consume la entidad.
 *
 * Todo el frame data esta en FRAMES (ver Constants.js). El update() acumula
 * el tiempo real y ejecuta pasos fijos de 1/60: si el movil va a 30 fps, la
 * FSM da dos pasos por frame y el combate se comporta igual.
 *
 * Lo que esta clase NO hace (a proposito):
 *   - No integra la gravedad ni mueve el mesh: eso es de la entidad, usando
 *     `motion`. Asi la FSM se puede testear en Node sin motor grafico.
 *   - No decide transiciones con ifs: las decide Transitions.resolve().
 *   - No conoce los estados concretos: usa `profile` (el catalogo).
 * ============================================================================
 */
import SPF from './Constants.js';
import Transitions from './Transitions.js';
import { getMoves, getMove } from './MoveTable.js';
import { handlerFor, returnState, knockdownState, markKnockdown, knockdownForced } from './handlers/StateHandlers.js';
import './states/index.js';   // registra el catalogo base
import { createProfile } from './StateCatalog.js';
import { GrappleSession } from './GrappleSession.js';

const {
    CONFIG, State, StateGroup, Phase, AttackPhase, Intent, TransitionSource,
    VisualFacing, GuardHeight, CANCEL_TIER_ORDER, CANCEL_TARGET_STATE, FacingAxis,
    HitLevel, GrappleRole, GrappleAction, GrappleStance
} = SPF;

export class StateMachine {
    /**
     * @param {object} opts
     * @param {string} opts.fighterId
     * @param {object} opts.api        Puerto hacia el mundo (Fighter)
     * @param {number} [opts.initial]  Estado inicial
     * @param {object} [opts.profile]  Catalogo (createProfile). Por defecto el
     *        catalogo base compartido.
     */
    constructor(opts) {
        const o = opts || {};
        this.fighterId = o.fighterId || 'F1';
        this.api = o.api || {};
        this.profile = o.profile || createProfile('BASE');
        this.moves = o.moves || getMoves(o.characterId);

        // --- estado de la maquina ---
        this.stateId = null;
        this.previousStateId = null;
        this.frame = 0;                 // frames vividos en el estado actual
        this.timer = null;              // frames que faltan para el TIMEOUT
        this.invulnFrames = 0;

        // --- datos de combate que la FSM lleva (no son del mundo) ---
        this._data = Object.create(null);
        this.previousStableState = null;  // de donde volver tras un ataque
        this.bodyAxis = FacingAxis.CABEZA_A_RIVAL;
        this.visualFacing = VisualFacing.ESPALDA_A_CAMARA;
        this.downOrientation = null;

        // --- acumulador de paso fijo ---
        this._accumulator = 0;

        // --- senales para la entidad (hitbox, freeze, aterrizaje...) ---
        this.signals = [];

        // --- sesion de agarre ---
        this.grappleSession = null;

        // --- historial (netcode / debug) ---
        this.history = [];
        this.historyLimit = o.historyLimit || 120;

        this._input = emptyInput();
        this.changeState(o.initial != null ? o.initial : State.NORMAL_A, {
            source: TransitionSource.SYSTEM,
            reason: 'init'
        });
    }

    // =========================================================================
    // Consultas de estado
    // =========================================================================

    get state() {
        return this.profile.get(this.stateId) || this.profile.get(State.NORMAL_A);
    }

    get name() {
        return SPF.stateName(this.stateId);
    }

    get phase() {
        return this.state.phase;
    }

    get inGroup() {
        const self = this;
        return (group) => self.state.groups.indexOf(group) !== -1;
    }

    isInvulnerable() {
        return this.invulnFrames > 0 || this.state.control.invulnerable;
    }

    // =========================================================================
    // Cambio de estado
    // =========================================================================

    /**
     * Transicion controlada: sale del estado actual, entra en el nuevo y deja
     * constancia. Es el UNICO punto donde this.stateId cambia, que es lo que
     * permite filmar el cambio en un log y reproducirlo.
     */
    changeState(nextId, opts = {}) {
        if (nextId == null || !this.profile.has(nextId)) {
            this.signals.push({ type: 'INVALID_STATE', id: nextId });
            return false;
        }
        if (nextId === this.stateId && !opts.force) return false;

        const from = this.stateId;
        const fromState = this.state;
        this.stateId = nextId;
        this.previousStateId = from;
        this.frame = 0;
        this.timer = this.state.durationFrames;

        // Los estados "estables" son el destino al que se vuelve tras un
        // ataque: se memoriza el ultimo, no el actual.
        if (fromState && fromState.phase === Phase.GROUND &&
            fromState.groups.indexOf(StateGroup.ATTACKING) === -1) {
            this.previousStableState = from;
        }

        this.history.push({ from, to: nextId, reason: opts.reason || '', frame: this.api.now ? this.api.now() : 0 });
        if (this.history.length > this.historyLimit) this.history.shift();

        // Entrada: el handler del grupo ejecuta su onEnter y prepara el timer
        // dinamico (hitstun, duracion de golpe, frames de invulnerabilidad).
        // El payload de la transicion (el golpe que la ha provocado) VIAJA con
        // ella: sin esto el handler de IMPACTO no ve el hit y se queda con los
        // valores por defecto (hitstun fijo, sin derribo al final).
        const handler = handlerFor(this.state);
        if (handler && handler.onEnter) {
            handler.onEnter(this._ctx({
                source: opts.source || TransitionSource.SYSTEM,
                hit: opts.hit,
                payload: opts.payload
            }));
        }

        this.emitSignal('STATE_CHANGED', { from, to: nextId, reason: opts.reason });
        return true;
    }

    // =========================================================================
    // Entrada: el juego pregunta "¿que hago con esto?"
    // =========================================================================

    /**
     * Traduce un snapshot de input en una peticion de transicion. No decide
     * nada: se limita a ofrecer los eventos a la tabla, de mas prioritario a
     * menos, y aplica el primer destino que exista.
     *
     * @param {object} input {x, y, forward, back, up, down, pressed:{}, held:{}}
     */
    setInput(input) {
        this._input = input || emptyInput();

        // Si esta agarrado, las acciones van a la sesion de agarre, no a la
        // tabla normal (el handler GRAPPLE las traduce).
        if (this.inGroup(StateGroup.GRAPPLE)) return;

        // Un estado que no puede actuar (tumbado, en hitstun) aun asi tiene que
        // poder RECIBIR los intents que el propio estado declara: el unico
        // legal ahi es la levantada. Sin esta excepcion el luchador nunca se
        // levanta, porque canAct bloquea el unico evento que lo saca de ahi.
        // Que sea legal de verdad lo decide la tabla (guard wakeupReady), no
        // este if.
        if (!this.state.control.canAct && !this.state.down) return;

        for (const intent of INTENT_PRIORITY) {
            if (!pressedIntent(this._input, intent)) continue;

            const found = Transitions.resolve(this.state, intent, TransitionSource.INPUT, this._ctx({
                event: intent,
                source: TransitionSource.INPUT
            }));
            if (found) {
                this._enterVia(found, intent, TransitionSource.INPUT);
                return;
            }
        }
    }

    /** El combate dice "le has dado". */
    onHit(hit) {
        const h = hit || {};

        // Los datos del golpe se guardan ANTES de resolver la transicion: el
        // estado de caida (de cara o de espaldas, y su eje) lo decide el
        // golpe, no la regla. Asi un barrido que derriba directo y un
        // knockdown al final de un hitstun guardan exactamente lo mismo.
        this.setData('lastHit', h);
        this.setData('hitLevel', h.hitLevel || null);
        if (knockdownForced(h)) {
            markKnockdown(this._ctx({
                event: 'HIT',
                source: TransitionSource.HIT,
                hit: h
            }));
        }

        const found = Transitions.resolve(this.state, 'HIT', TransitionSource.HIT, this._ctx({
            event: 'HIT',
            source: TransitionSource.HIT,
            hit: h
        }));
        if (found) this._enterVia(found, 'HIT', TransitionSource.HIT, h);
    }

    /** El mundo dice "tocaste el suelo / la pared". */
    onContact(kind) {
        const found = Transitions.resolve(this.state, kind, TransitionSource.CONTACT, this._ctx({
            event: kind,
            source: TransitionSource.CONTACT
        }));
        if (found) this._enterVia(found, kind, TransitionSource.CONTACT);
    }

    /** El sistema anuncia algo (round start, KO, reset). */
    onSystem(event, payload) {
        const found = Transitions.resolve(this.state, event, TransitionSource.SYSTEM, this._ctx({
            event,
            source: TransitionSource.SYSTEM,
            payload
        }));
        if (found) this._enterVia(found, event, TransitionSource.SYSTEM);
    }

    /** Peticion de cancel (Any-Point Cancel) con su tier de cancelacion. */
    requestCancel(tier) {
        const target = CANCEL_TARGET_STATE[tier];
        if (target == null) return false;

        // El destino del cancel se guarda ANTES de transicionar: el estado
        // puente ANY_POINT_CANCEL lo leera en su TIMEOUT. Si se guardase al
        // entrar en el puente, el puente seria su propio destino.
        this._data.apcTarget = target;

        const found = Transitions.resolve(this.state, 'APC', TransitionSource.CANCEL, this._ctx({
            event: 'APC',
            source: TransitionSource.CANCEL,
            tier
        }));
        if (found) this._enterVia(found, 'APC', TransitionSource.CANCEL);
        return found != null;
    }

    /** Ventana tecnica: el jugador pide la derivada en el "just frame". */
    requestTechnique() {
        const found = Transitions.resolve(this.state, 'TECH', TransitionSource.CANCEL, this._ctx({
            event: 'TECH',
            source: TransitionSource.CANCEL
        }));
        if (found) this._enterVia(found, 'TECH', TransitionSource.CANCEL);
    }

    /**
     * Aplica una transicion resuelta y ejecuta su puente: el estado puente
     * ANY_POINT_CANCEL sabe a donde tiene que ir cuando se acaba.
     */
    _enterVia(found, event, source, hit) {
        const ok = this.changeState(found.to, { source, reason: found.rule.debug || event, hit });

        // El APC solo se gasta si la transicion es real.
        if (source === TransitionSource.CANCEL && ok) {
            this._data.apcCooldown = CONFIG.APC_COOLDOWN_FRAMES;
            this._data.recoveryDebt = (this._data.recoveryDebt || 0) + CONFIG.APC_FRAME_PENALTY;
        }
        return ok;
    }

    // =========================================================================
    // Bucle de simulacion (paso fijo)
    // =========================================================================

    /**
     * Avanza la maquina con el tiempo real. Acumula y ejecuta pasos de 1/60.
     * @param {number} dtSeconds delta real del render
     */
    update(dtSeconds) {
        this._accumulator += Math.min(dtSeconds, 0.25);
        let steps = 0;
        while (this._accumulator >= CONFIG.FIXED_DT && steps < CONFIG.MAX_STEPS_PER_UPDATE) {
            this._accumulator -= CONFIG.FIXED_DT;
            this.step();
            steps++;
        }
        return steps;
    }

    /** Un paso de simulacion (1/60 s). */
    step() {
        this.frame++;
        if (this.invulnFrames > 0) this.invulnFrames--;
        if (this._data.apcCooldown > 0) this._data.apcCooldown--;

        // 1) Comportamiento del estado (handlers)
        const handler = handlerFor(this.state);
        if (handler && handler.tick) handler.tick(this._ctx());

        // 2) Sesion de agarre: avanza una vez por frame, sea quien sea
        if (this.grappleSession) {
            this.grappleSession.step(this.frame + (this.api.simFrame ? this.api.simFrame() : 0));
            if (!this.grappleSession.active) {
                // La sesion ya decidio: se sale por la MISMA regla que cualquier
                // otro fin de agarre (TIMEOUT), para que los dos luchadores
                // terminen en el estado que les toca y no en un reset generico.
                const g = this.grappleSession;
                this.emitSignal('GRAPPLE_RESOLVED', { result: g.result, exit: g.lastExit });
                const found = Transitions.resolve(this.state, 'TIMEOUT', TransitionSource.TIMER, this._ctx({
                    event: 'TIMEOUT',
                    source: TransitionSource.TIMER
                }));
                if (found) this._enterVia(found, 'GRAPPLE_RESOLVED', TransitionSource.TIMER);
                this.grappleSession = null;
                this._data.grappleAction = null;
            }
        }

        // 3) Timer del estado
        if (this.timer != null) {
            this.timer--;
            if (this.timer <= 0) {
                this.timer = null;
                const found = Transitions.resolve(this.state, 'TIMEOUT', TransitionSource.TIMER, this._ctx({
                    event: 'TIMEOUT',
                    source: TransitionSource.TIMER
                }));
                if (found) this._enterVia(found, 'TIMEOUT', TransitionSource.TIMER);
            }
        }

        // 4) Sincronizacion con la sesion de agarre (estado espejo)
        return this.frame;
    }

    // =========================================================================
    // Datos, timers, axes y animacion
    // =========================================================================

    setData(key, value) {
        this._data[key] = value;
    }

    getData(key) {
        return this._data[key];
    }

    setTimer(frames) {
        this.timer = frames;
    }

    setInvulnerable(frames) {
        this.invulnFrames = Math.max(this.invulnFrames, frames || 0);
    }

    setBodyAxis(axis) {
        this.bodyAxis = axis;
    }

    /**
     * Orientacion visual respecto a la camara. Se resuelve aqui (y no como
     * estado) porque depende de dos cosas que cambian cada frame: hacia donde
     * mira el cuerpo y desde donde mira la camara.
     */
    updateVisualFacing(cameraForward, forwardX, forwardZ) {
        const dot = forwardX * cameraForward.x + forwardZ * cameraForward.z;
        this.visualFacing = dot > 0
            ? VisualFacing.FRENTE_A_CAMARA     // mira hacia donde mira la camara
            : VisualFacing.ESPALDA_A_CAMARA;
        return this.visualFacing;
    }

    /** Clip concreto de este frame, con su variante de camara ya resuelta. */
    getAnimationKey() {
        // Los momentos de agarre tienen clips por accion.
        const action = this._data.grappleAction;
        if (this.state.grapple && action) {
            const def = this.state.grapple.actions && this.state.grapple.actions[action];
            if (def) return def.clips[this.visualFacing];
        }
        const clip = this.state.animation.clip;
        if (!clip) return null;
        return this.state.animation.facingAware
            ? SPF.animationKey(clip, this.visualFacing)
            : clip;
    }

    /** Fase del golpe (STARTUP / ACTIVE / RECOVERY) y frames dentro del golpe. */
    getAttackPhase() {
        const move = this.move;
        if (!move) return null;
        const into = this.framesIntoMove();
        if (into < move.activeStart) return AttackPhase.STARTUP;
        if (into <= move.activeEnd) return AttackPhase.ACTIVE;
        return AttackPhase.RECOVERY;
    }

    /** Frames que lleva dentro del golpe actual (contador propio). */
    framesIntoMove() {
        // Solo cuenta si sigue en el mismo estado de golpe en el que empezo:
        // si el luchador canea, el contador se reinicia.
        if (this._data.moveStartState == null) return 0;
        if (this.stateId !== this._data.moveStartState) return 0;
        return this.frame;
    }

    /** Golpe activo: la entidad usa esto para decidir si hay hitbox. */
    isHitboxActive() {
        const move = this.move;
        if (!move) return false;
        return this.getAttackPhase() === AttackPhase.ACTIVE && !this.getData('hitboxResolved');
    }

    markHitboxResolved() {
        this.setData('hitboxResolved', true);
    }

    // =========================================================================
    // Ciclo de vida del agarre
    // =========================================================================

    /** Abre un agarre: este luchador agarra a `opponentId`. */
    startGrapple(opponentId, stance, surface, api) {
        const id = stance || (this.state.hull.height < 1.3 ? GrappleStance.AGACHADO : GrappleStance.PIE);
        this.grappleSession = new GrappleSession({
            tori: this.fighterId,
            uke: opponentId,
            stance: id,
            surface: surface || 'VERTICAL',
            api
        });
        const target = this.grappleSession.stateIdFor(this.fighterId);
        this.changeState(target, { source: TransitionSource.INPUT, reason: 'agarre' });
        return this.grappleSession;
    }

    hasGrappleSession() {
        return !!this.grappleSession;
    }

    grappleRole() {
        return this.grappleSession ? this.grappleSession.roleOf(this.fighterId) : null;
    }

    // =========================================================================
    // Contexto para la tabla de transiciones y los handlers
    // =========================================================================

    /**
     * Construye el contexto que recibe la tabla. Los guards deben ser funciones
     * PURAS sobre este contexto: leen estado y api, nunca escriben. Si un guard
     * muta el estado, la transicion deja de ser depurable.
     */
    _ctx(extra) {
        const fsm = this;
        const state = this.state;

        return {
            fsm,
            state,
            input: this._input,
            hit: (extra && extra.hit) || {},
            move: this.move,
            tier: this._data.cancelTier,
            // Tier que el jugador PIDIO en este cancel. `tier` es el del golpe
            // en curso: son dos cosas distintas y confundirlas hacia que un
            // especial se pudiera cancelar con un jab.
            requestedTier: (extra && extra.tier) || null,
            event: extra && extra.event,
            source: extra && extra.source,

            role: this.grappleRole(),

            /** Guards de Convenience sobre la sesion de agarre. */
            actionAvailable: (action) => {
                const g = this.grappleSession;
                if (!g) return false;
                const row = SPF.GRAPPLE_STATES[g.stance];
                if (!row) return false;
                const stanceState = this.profile.get(row[GrappleRole.TORI]);
                return !!(stanceState && stanceState.grapple && stanceState.grapple.actions[action]);
            },
            grappleStance: () => {
                const h = state.hull.height;
                return h < 1.3 ? GrappleStance.AGACHADO : GrappleStance.PIE;
            },

            /** True si se puede pagar el recurso de un golpe por su clave. */
            affordable: (moveKey) => {
                const def = moveKey ? this.moves[moveKey] : null;
                const cost = def ? (def.meterCost || 0) : 0;
                return this._api().hasMeter(cost);
            },

            /** Puente con el mundo (la entidad Fighter). */
            api: this._api()
        };
    }

    /** Adaptador del puerto de mundo. Cada guard llama a un metodo concreto. */
    _api() {
        const fsm = this;
        const ext = this.api || {};
        return {
            phase: () => fsm.state.phase,
            framesInState: () => fsm.frame,
            juggleCount: () => ext.juggleCount ? ext.juggleCount() : 0,
            framesIntoMove: () => fsm.framesIntoMove(),
            canAirRecover: () => (!ext.juggleCount || ext.juggleCount() < CONFIG.JUGGLE_MAX),
            canBreakCombo: () => (ext.canBreakCombo ? ext.canBreakCombo() : false),
            hasMeter: (cost) => (ext.hasMeter ? ext.hasMeter(cost) : true),
            canPay: (cost) => (ext.hasMeter ? ext.hasMeter(cost) : true),
            canGrapple: () => (ext.canGrapple ? ext.canGrapple() : false),
            isDownAttack: () => (ext.isDownAttack ? ext.isDownAttack() : false),
            knockdownOnEnd: () => !!fsm.getData('knockdownOnEnd'),
            knockdownState: () => knockdownState(fsm._ctx()),
            wakeupReady: () => (ext.wakeupReady ? ext.wakeupReady() : false),
            returnState: () => returnState(fsm._ctx()),
            apcTarget: () => fsm.getData('apcTarget') || State.NORMAL_A,
            canCancelInto: (tier) => {
                const cooldown = fsm.getData('apcCooldown') || 0;
                if (cooldown > 0) return false;
                const from = CANCEL_TIER_ORDER[fsm.getData('cancelTier')] || 0;
                const to = CANCEL_TIER_ORDER[tier];
                return to != null && to >= from;
            },
            getGrappleSession: () => fsm.grappleSession,
            grappleOver: () => !!(fsm.grappleSession && !fsm.grappleSession.active),
            grappleExitState: () => {
                const s = fsm.grappleSession;
                if (!s) return State.NORMAL_A;
                const role = s.roleOf(fsm.fighterId);
                const resolved = s.lastExit;
                return (resolved && resolved[role]) || State.NORMAL_A;
            }
        };
    }

    // =========================================================================
    // Golpe actual
    // =========================================================================

    get move() {
        const key = this.state.attack;
        if (!key) return null;
        // EL MOVESET DE LA POSTURA MANDA (core/boxing.js): si el
        // arquetipo tiene una postura activa con golpe propio para
        // este boton, ese es el golpe. Mismo estado, distinta
        // lectura: por eso las estancias se resuelven AQUI y no
        // con una tabla de transiciones nueva.
        const stanceKey = this.api.stanceAttack ? this.api.stanceAttack(key) : null;
        return getMove(this.api.characterId, stanceKey || key) || null;
    }

    // =========================================================================
    // Senales
    // =========================================================================

    emitSignal(type, payload) {
        this.signals.push({ type, payload });
    }

    /** Consume (y borra) las senales de este frame. */
    drainSignals() {
        const out = this.signals;
        this.signals = [];
        return out;
    }

    // =========================================================================
    // Debug
    // =========================================================================

    /** "Por que estoy en este estado?" — volcado para el panel de debug. */
    explain(event, source) {
        const ctx = this._ctx({ event, source });
        return {
            state: this.name,
            id: this.stateId,
            frame: this.frame,
            phase: this.state.phase,
            timer: this.timer,
            data: Object.assign({}, this._data),
            candidates: Transitions.explain(this.state, event, source, ctx)
        };
    }

    /** Instantanea minima para lockstep / rollback. */
    snapshot() {
        return {
            stateId: this.stateId,
            frame: this.frame,
            timer: this.timer,
            invulnFrames: this.invulnFrames,
            bodyAxis: this.bodyAxis,
            data: Object.assign(Object.create(null), this._data)
        };
    }

    restore(snap) {
        if (!snap) return;
        this.stateId = snap.stateId;
        this.frame = snap.frame;
        this.timer = snap.timer;
        this.invulnFrames = snap.invulnFrames;
        this.bodyAxis = snap.bodyAxis;
        this._data = Object.assign(Object.create(null), snap.data);
    }

    /** El luchador publica aqui lo que la entidad debe hacer este frame. */
    get motion() {
        const s = this.state;
        return {
            stateId: this.stateId,
            name: s.name,
            phase: s.phase,
            tags: s.groups,
            posture: s.posture,
            physics: s.physics,
            animation: this.getAnimationKey(),
            visualFacing: this.visualFacing,
            bodyAxis: this.bodyAxis,
            hitLevel: this._data.hitLevel || null,
            hitboxActive: this.isHitboxActive(),
            canAct: s.control.canAct,
            invulnerable: this.isInvulnerable()
        };
    }
}

/** Orden en el que se ofrecen las intenciones a la tabla. */
const INTENT_PRIORITY = [
    Intent.TECNICA,
    Intent.ATAQUE_ESPECIAL,
    Intent.ATAQUE_PESADO,
    Intent.ATAQUE_LIGERO,
    Intent.AGACHARSE,
    Intent.GUARDIA,
    Intent.SALTAR,
    Intent.DASH,
    Intent.ACROBACIA,
    Intent.SPRINT,
    Intent.LEVANTARSE
];

function pressedIntent(input, intent) {
    if (!input || !input.pressed) return false;
    return !!input.pressed[intent];
}

function emptyInput() {
    return {
        x: 0, y: 0,
        forward: false, back: false, up: false, down: false,
        left: false, right: false,
        pressed: Object.create(null),
        held: Object.create(null)
    };
}

export default StateMachine;