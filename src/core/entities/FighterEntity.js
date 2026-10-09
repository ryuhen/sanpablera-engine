/**
 * ============================================================================
 * SANPABLERA ENGINE · entities/FighterEntity.js
 * ----------------------------------------------------------------------------
 * EL PELEADOR. Todo lo que la FSM no debe saber (y por eso no sabe):
 *
 *   - Donde esta (x, z), a donde mira (facing) y como se mueve
 *     (velocidad de knockback, maquina de locomocion).
 *   - LA MAQUINA DE LOCOMOCION (spec: movimiento estilo Soulcalibur):
 *       IDLE -> PASO -> CAMINAR -> CORRER
 *       doble toque -> DASH (agachado: corto y esquiva altos;
 *       saltando: esquiva golpes de suelo)
 *       accion + puño + (abajo+delante | abajo+atras) -> CUADRUPEDA /
 *       DESLIZAMIENTO
 *     El PASO es la animacion inicial de cualquier movimiento: toca
 *     una direccion, el maniqui da UN paso (movimiento minimo) y
 *     durante unos frames ESQUIEVA ataques lineales. Mantener la
 *     direccion pasa a caminar y, un segundo despues, a correr.
 *   - Las VENTANAS DE ESQUIVE y la regla de oro del movimiento:
 *       LINEAL  -> se esquiva moviendose (paso, dash)
 *       AREA    -> caza a quien se mueve: stun o derribo
 *   - El puerto `api` hacia la FSM (vida, recurso, juggle...).
 *
 * POR QUE ES PURO (salvo el modelo, que es un stub testeable)
 *   No importa Babylon: `model` solo exige { rig, applyPose, place }.
 *   El mundo (`world`) es un objeto plano que le pasa el engine.
 *   Asi el ciclo completo input -> FSM -> pose se testea en Node.
 * ============================================================================
 */
import { StateMachine } from '../fsm/StateMachine.js';
import SPF from '../fsm/Constants.js';
import { getMoves } from '../fsm/MoveTable.js';
import { createProfile, defineState } from '../fsm/StateCatalog.js';
import { registerCharacterStances } from '../fsm/states/CharacterStates.js';
import * as Boxer from '../boxing.js';
import * as FighterRig from './FighterRig.js';

const { State, StateGroup, Intent, TransitionSource, CONFIG } = SPF;

/**
 * EL SISTEMA DE ESTANCIAS (core/boxing.js).
 *
 * Antes habia aqui un abanico de estilos cosméticos (IDLE,
 * GUARD, TAUNT...) que solo cambiaba la pose. Ahora la postura
 * es una DECISION DE COMBATE: cada una declara su guardia, su
 * silueta y, sobre todo, SU MOVESET EXCLUSIVO (stanceAttack),
 * asi que el mismo boton golpea distinto segun la postura.
 *
 * Las tres base rotan con el boton ACCION; las tres de comando
 * son inputs especiales. El boton tambien trae el "baile" de
 * posturas (tilt a una direccional), el mantenimiento que
 * dirige la postura a un vector, y la fijacion de objetivo
 * (TARGET ACTION) tras conectar un golpe.
 */
export const STANCES = Boxer.STANCES;
export const STANCE_CYCLE = Boxer.STANCE_CYCLE;
export const COMMAND_STANCES = Boxer.COMMAND_STANCES;

/** Siguiente postura del abanico; `inverse` la invierte (accion + atras). */
export function nextStance(stanceId, inverse) {
    return Boxer.nextStance(stanceId, inverse);
}

// --- Ventanas de esquive (frames a 60 Hz) --------------------------------
/** El paso inicial esquiva golpes LINEALES. */
export const STEP_DODGE_FRAMES = 7;
/** El dash arranca invulnerable (golpes LINEALES). */
export const DASH_IFRAMES = 9;
/** El dash agachado esquiva golpes ALTOS. */
export const CROUCH_DASH_IFRAMES = 11;
/** El dash saltando esquiva golpes BAJOS / de SUELO. */
export const JUMP_DASH_IFRAMES = 12;

// --- Duraciones de la locomocion (segundos) ------------------------------
export const STEP_DURATION = 0.15;      // el paso: breve y minimo
export const RUN_AFTER = 1.0;           // un segundo de caminata -> carrera
export const DASH_DURATION = 0.30;
export const CROUCH_DASH_DURATION = 0.22;   // mas corto...
export const JUMP_DASH_DURATION = 0.28;     // ...pero el agachado es mas rapido
export const SLIDE_DURATION = 26 / 60;      // el DESLIZAMIENTO de la FSM: 26 frames
export const QUAD_DURATION = 1.4;

// --- Velocidades (m/s) ----------------------------------------------------
export const SPEEDS = Object.freeze({
    STEP: 2.4, WALK: 1.7, RUN: 3.3,
    DASH: 6.6, CROUCH_DASH: 5.2, JUMP_DASH: 5.6,
    QUAD: 1.2, SLIDE: 5.2
});

/** Coste de stamina de un dash (puntos). */
export const DASH_COST = 5;

/** Un solo registro de stances por id de personaje (defineState tira si se
 *  duplica). */
const registeredCharacters = new Set();

function dashDurationOf(state) {
    return state === 'CROUCH_DASH' ? CROUCH_DASH_DURATION
        : state === 'JUMP_DASH' ? JUMP_DASH_DURATION
        : DASH_DURATION;
}

/** Progreso 0..1 de la fase actual del golpe (para la pose). */
function attackProgress(fsm) {
    const move = fsm.move;
    if (!move) return 0;
    const into = fsm.framesIntoMove();
    const phase = fsm.getAttackPhase();
    let start, end;
    if (phase === 'STARTUP') { start = 0; end = move.activeStart; }
    else if (phase === 'ACTIVE') { start = move.activeStart; end = move.activeEnd + 1; }
    else { start = move.activeEnd + 1; end = move.duration; }
    return Math.max(0, Math.min(1, (into - start) / Math.max(1, end - start)));
}

export class FighterEntity {
    /**
     * @param {object} opts
     * @param {object} opts.fighter   { name, x, z, facing, health, gauge }
     * @param {object} opts.model     { rig, applyPose(pose, fk), place(x, z, facing) }
     * @param {string} [opts.characterId]  'BASE' | 'SAN_PABLO' | 'MALON'
     * @param {string} [opts.id]
     * @param {string} [opts.stance]  estilo inicial del abanico
     */
    constructor(opts) {
        this.fighter = opts.fighter;
        this.model = opts.model;
        this.characterId = opts.characterId || 'BASE';
        this.id = opts.id || this.fighter.name || 'F';

        // --- EL SISTEMA DE ESTANCIAS (arquetipo YUGO) ---
        // La postura activa y su estado de transicion. `dance` es el
        // "baile de posiciones": la entity va interpolando la
        // silueta entre dos posturas sin salir de combate.
        this.stance = {
            id: (opts.stance && Boxer.STANCES[opts.stance]) ? opts.stance : 'SHELL',
            time: 0,
            dance: null,          // { from, to, t, dur }
            absorb: 0,            // impactos directos que le quedan por absorber
            target: false,        // fijacion activa (TARGET ACTION)
            targetTimer: 0,       // reloj del encadenado automatico
            targetNext: Intent.ATAQUE_PESADO,
            impactAt: -Infinity,  // momento del ultimo impacto propio
            impactPoint: null,    // donde golpeo (para dirigir los siguientes)
            directed: null,       // vector al que dirige la postura
            usedPress: false,     // la pulsacion actual ya sirvio (comando/target)
            wasHeld: false,       // ACCION estaba pulsado el frame anterior
            lastRelease: -Infinity   // para el doble toque del especial
        };

        // --- combate ---
        this.targetLock = false;
        this.juggle = 0;
        this.vx = 0;                    // velocidad de knockback (m/s)
        this.vz = 0;
        this._time = 0;                 // reloj de la entidad (se congela con el hitstop)
        this._moving = false;           // se esta moviendo (propio o empuje)
        this._moveSpeed = 0;
        this._justAttacked = false;     // encarar al rival al salir el golpe
        this._lastInput = null;
        this.pendingAirAttack = null;   // intent de ataque aereo en el aire

        // El golpe que entro por ultima vez (para la matriz de reacciones) y
        // la tela del peleador, si el engine le ha dado una.
        this._hitMove = null;
        this.cape = null;

        if (!registeredCharacters.has(this.characterId)) {
            registerCharacterStances(this.characterId, defineState);
            registeredCharacters.add(this.characterId);
        }

        const self = this;
        this.fsm = new StateMachine({
            fighterId: this.id,
            characterId: this.characterId,
            profile: createProfile(this.characterId),
            moves: getMoves(this.characterId),
            api: {
                characterId: this.characterId,
                juggleCount: () => self.juggle,
                hasMeter: (cost) => self.fighter.gauge.value >= (cost || 0),
                canPay: (cost) => self.fighter.gauge.value >= (cost || 0),
                canGrapple: () => false,
                canBreakCombo: () => true,
                wakeupReady: () => true,
                isDownAttack: () => false,
                // El golpe de la postura activa sustituye al del
                // estado mientras la postura siga viva (ver el getter
                // `move` de la FSM).
                stanceAttack: (stateKey) => self.stanceAttackKey(stateKey),
                now: () => self._time,
                simFrame: () => (self.fsm ? self.fsm.frame : 0)
            }
        });

        // --- maquina de locomocion ---
        this.loco = {
            state: 'IDLE',              // IDLE | STEP | WALK | RUN | DASH |
                                        // CROUCH_DASH | JUMP_DASH | QUAD | SLIDE
            stateTime: 0,               // segundos en el estado
            holdTime: 0,                // segundos con la direccion actual
            dir: { x: 0, z: 0 },        // direccion de movimiento (mundo)
            dodgeUntil: -1,             // esquiva LINEALES hasta este reloj
            dodgeHighUntil: -1,         // esquiva ALTOS (dash agachado)
            dodgeLowUntil: -1,          // esquiva BAJOS/SUELO (dash saltando)
            dashUsed: false             // un dash por pulsacion de eje
        };
    }

    // =========================================================================
    // Ciclo principal
    // =========================================================================

    /**
     * @param {number} dt        segundos (ya escalados por el engine)
     * @param {object} input     snapshot del InputMapper
     * @param {object} world     { hitstop, props, ringLimit, minSpacing,
     *                             opponentOf(e), tryHit(attacker) }
     */
    update(dt, input, world) {
        this._time += dt;
        this._lastInput = input;

        /** Intents y flags inyectados por la entidad (dash, salto,
         *  levantada, ataque aereo). */
        const extra = { pressed: Object.create(null), flags: Object.create(null) };

        // 0. Senales del sistema: levantada automatica y ataque aereo
        //    pendiente (el salto ya se pidio; el golgo sale en el aire).
        this._systemIntents(extra);

        // 1. Fin de la guardia: la FSM no modela "soltar boton".
        if (!input.held[Intent.GUARDIA] && this.fsm.state.tag === 'GUARDIA') {
            this.fsm.changeState(State.NORMAL_A, {
                source: TransitionSource.SYSTEM, reason: 'guardia soltada'
            });
        }

        // 2. Maquina de locomocion (puede pedir el intent DASH).
        this._locomotion(dt, input, world, extra);

        // 3. Combos de movimiento (cuadripedia / deslizamiento).
        this._combos(input, world);

        // 4. Estancias de boxeo (rotacion, baile, fijacion) + objetivo.
        this._stances(dt, input, world, extra);

        // 5. Ataque aereo (doble arriba + delante/atras + puño/patada).
        this._airAttack(input, extra);

        // 5. Input final a la FSM.
        const finalInput = (Object.keys(extra.pressed).length || Object.keys(extra.flags).length)
            ? Object.assign({}, input, extra.flags, {
                pressed: Object.assign(Object.create(null), input.pressed, extra.pressed)
            })
            : input;
        this.fsm.setInput(finalInput);

        // 6. Avanzar la maquina.
        const prevId = this.fsm.stateId;
        this.fsm.update(dt);
        if (this.fsm.stateId !== prevId) this._onStateEnter(prevId);

        // 7. Hitbox activa: el mundo decide si conecta (y contra quien).
        if (this.fsm.isHitboxActive()) world.tryHit(this);

        // 8. Movimiento en el mundo.
        this._moveWorld(dt, input, world);

        // 9. Orientacion.
        this._face(world);

        // 10. Pose (y tela, si la tiene).
        this._pose(world, dt);
    }

    // =========================================================================
    // Inyecciones de la entidad sobre el input
    // =========================================================================

    _systemIntents(extra) {
        // Levantada automatica: tras la invulnerabilidad de wakeup el
        // cuerpo se incorpora solo (el rival pasivo no se queda tirado).
        if (this.fsm.inGroup(StateGroup.DOWNED) &&
            this.fsm.frame >= CONFIG.WAKEUP_INVULN_FRAMES) {
            extra.pressed[Intent.LEVANTARSE] = true;
        }
        // Ataque aereo pendiente: el salto ya esta en curso; cuando el
        // cuerpo esta en el aire se suelta el golpe.
        if (this.pendingAirAttack) {
            if (this.fsm.inGroup(StateGroup.AIRBORNE) && this.fsm.state.control.canAct) {
                extra.pressed[this.pendingAirAttack] = true;
                this.pendingAirAttack = null;
            }
        }
    }

    /**
     * Maquina de locomocion. Devuelve en `extra` los intents que pidan
     * las transiciones (el DASH, que la tabla traduce a SPRINT_FRONTAL
     * o SPRINT_ATRAS con su duracion propia).
     */
    _locomotion(dt, input, world, extra) {
        const L = this.loco;
        L.stateTime += dt;

        const canAct = this.fsm.state.control.canAct &&
            this.fsm.inGroup(StateGroup.GROUNDED) &&
            !this._combatLocked();

        // --- dash por doble toque --------------------------------------
        if (input.dash && !L.dashUsed && canAct &&
            this.fighter.gauge.value >= DASH_COST) {
            const kind = input.dash.kind;
            this.fighter.gauge.spend(DASH_COST);
            L.state = kind;
            L.stateTime = 0;
            L.dir = { x: input.dash.x, z: input.dash.z };
            L.dashUsed = true;
            // Ventana de esquive del dash:
            //   DASH ......... invulnerable al principio (lineales)
            //   CROUCH_DASH .. esquiva golpes ALTOS (corto y rapido)
            //   JUMP_DASH .... esquiva golpes de SUELO / bajos
            const frames = kind === 'CROUCH_DASH' ? CROUCH_DASH_IFRAMES
                : kind === 'JUMP_DASH' ? JUMP_DASH_IFRAMES : DASH_IFRAMES;
            const until = this._time + frames / 60;
            if (kind === 'CROUCH_DASH') L.dodgeHighUntil = until;
            else if (kind === 'JUMP_DASH') L.dodgeLowUntil = until;
            else L.dodgeUntil = until;
            extra.pressed[Intent.DASH] = true;
        }

        // --- progreso --------------------------------------------------
        const mag = input.moveMag;
        const burst = L.state === 'DASH' || L.state === 'CROUCH_DASH' ||
            L.state === 'JUMP_DASH' || L.state === 'SLIDE';

        if (mag < 0.08 && !burst && L.state !== 'QUAD') {
            // Sin direccion: reposo (los estallidos siguen su curso).
            if (L.state !== 'IDLE') { L.state = 'IDLE'; L.stateTime = 0; }
            L.holdTime = 0;
            L.dir = { x: 0, z: 0 };
            L.dashUsed = false;
            return;
        }

        const dirChanged = mag > 0.08 && (
            Math.abs(L.dir.x - input.moveX) > 0.5 ||
            Math.abs(L.dir.z - input.moveZ) > 0.5);

        switch (L.state) {
            case 'IDLE':
                if (mag > 0.08 && dirChanged) {
                    // PASO: el primer frame de cualquier movimiento.
                    // Movimiento minimo que, durante unos frames, esquiva.
                    this._enterStep(input.moveX, input.moveZ);
                }
                break;
            case 'STEP':
                if (L.stateTime >= STEP_DURATION) {
                    L.state = 'WALK'; L.stateTime = 0;   // paso -> caminar
                }
                break;
            case 'WALK':
                if (dirChanged) {
                    // Cambiar de direccion es otro paso (y otra ventana
                    // de esquive): el 8-way run es una cadena de pasos.
                    this._enterStep(input.moveX, input.moveZ);
                } else if (L.holdTime >= RUN_AFTER) {
                    L.state = 'RUN'; L.stateTime = 0;    // caminar -> correr
                }
                break;
            case 'RUN':
                if (dirChanged) {
                    this._enterStep(input.moveX, input.moveZ);
                }
                break;
            case 'DASH':
            case 'CROUCH_DASH':
            case 'JUMP_DASH':
                if (L.stateTime >= dashDurationOf(L.state)) {
                    // La FSM lleva el sprint del dash con su propio timer;
                    // la entidad lo corta limpio al acabar su ventana.
                    this._endDash();
                    L.state = mag > 0.08 ? 'WALK' : 'IDLE';
                    L.stateTime = 0;
                }
                break;
            case 'SLIDE':
                if (L.stateTime >= SLIDE_DURATION) {
                    L.state = 'IDLE'; L.stateTime = 0;
                    L.dir = { x: 0, z: 0 };
                }
                break;
            case 'QUAD':
                if (L.stateTime >= QUAD_DURATION) {
                    this._exitQuad();
                    L.state = 'IDLE'; L.stateTime = 0;
                    L.dir = { x: 0, z: 0 };
                }
                break;
        }

        if (mag > 0.08) L.holdTime += dt;
    }

    _enterStep(x, z) {
        const L = this.loco;
        L.state = 'STEP';
        L.stateTime = 0;
        L.holdTime = 0;
        L.dir = { x, z };
        L.dashUsed = false;   // nueva direccion: el dash vuelve a estar libre
        // El paso esquiva ataques lineales durante sus primeros frames.
        L.dodgeUntil = this._time + STEP_DODGE_FRAMES / 60;
    }

    _endDash() {
        const id = this.fsm.stateId;
        if (id === State.SPRINT_FRONTAL || id === State.SPRINT_ATRAS || id === State.DASH_LATERAL) {
            this.fsm.changeState(State.NORMAL_A, {
                source: TransitionSource.SYSTEM, reason: 'dash fin'
            });
        }
    }

    _exitQuad() {
        this.fsm.changeState(State.NORMAL_A, {
            source: TransitionSource.SYSTEM, reason: 'cuadrupedia fin'
        });
    }

    /** Combos de movimiento: ACCION (recien pulsada) + puño + diagonal. */
    _combos(input, world) {
        if (!input.actionFresh) return;
        if (!input.pressed[Intent.ATAQUE_LIGERO]) return;
        if (!this.fsm.state.control.canAct || !this.fsm.inGroup(StateGroup.GROUNDED)) return;

        if (input.quadEdge) {
            // CUADRUPEDIA: reptar (abajo + delante + puño + accion).
            this.fsm.changeState(State.CUADRUPEDA, {
                source: TransitionSource.INPUT, reason: 'cuadrupedia'
            });
            this.loco.state = 'QUAD';
            this.loco.stateTime = 0;
            this.loco.dir = { x: input.moveX, z: input.moveZ };
        } else if (input.slideEdge) {
            // DESLIZAMIENTO: (abajo + atras + puño + accion). Desliza
            // hacia delante, hacia el rival.
            this.fsm.changeState(State.DESLIZAMIENTO, {
                source: TransitionSource.INPUT, reason: 'deslizamiento'
            });
            this.loco.state = 'SLIDE';
            this.loco.stateTime = 0;
            const o = world.opponentOf(this);
            if (o) {
                const dx = o.fighter.x - this.fighter.x;
                const dz = o.fighter.z - this.fighter.z;
                const d = Math.hypot(dx, dz) || 1;
                this.loco.dir = { x: dx / d, z: dz / d };
            }
        }
    }

    // =========================================================================
    // EL SISTEMA DE ESTANCIAS (arquetipo YUGO · core/boxing.js)
    // -------------------------------------------------------------------------
    // El boton ACCION es el boton de las posturas. Solo decide el MANDO:
    // que postura hay, que silueta lleva la pose y que golpe sustituye
    // al del estado (stanceAttackKey). Las tablas son de boxing.js.
    // =========================================================================

    /** Doble toque del boton: el ESPECIAL (el golpe de recurso). */
    static ACTION_DOUBLE_TAP = 0.26;

    /**
     * La postura manda en el golpe: si la postura activa declara un
     * golpe propio para ese boton, ese es el que sale. Si el peleador
     * no lo tiene en su moveset, gana el golpe del estado.
     * @param {string} stateKey  clave de ataque del estado (ATAQUE_LIGERO...)
     */
    stanceAttackKey(stateKey) {
        const S = this.stance;
        if (!S || !S.id) return null;
        const key = Boxer.stanceMove(S.id, stateKey);
        if (!key || key === stateKey) return null;
        return getMoves(this.characterId)[key] ? key : null;
    }

    /** Adopta una postura de golpe (sin transicion). */
    _adopt(id) {
        const S = this.stance;
        S.id = id;
        S.dance = null;
        S.time = 0;
        S.absorb = Boxer.stanceAbsorb(id);   // recarga la absorcion
        S.directed = null;
    }

    /** Empieza una transicion fluida (baile) pasando por `path`. */
    _startDance(path, dur) {
        if (!path || !path.length) return;
        this.stance.dance = {
            path: [this.stance.id, ...path],
            t: 0,
            dur: dur || Boxer.DANCE_DURATION
        };
    }

    /** La fijacion post-golpe: los siguientes golpes van al impacto. */
    _startTarget() {
        const S = this.stance;
        S.target = true;
        S.targetTimer = Boxer.TARGET_CHAIN_STEP * 0.35;   // el primero sale ya
        S.targetNext = Intent.ATAQUE_PESADO;
        this.targetLock = true;
    }

    /** ¿Puede actuar ahora mismo (para el encadenado automatico)? */
    _canAct() {
        return this.fsm.state.control.canAct && !this._combatLocked();
    }

    /** La postura que "apunta" hacia este vector (mantenimiento). */
    _stanceForVector(x, z) {
        // Hacia delante: Lead (el jab al frente). Hacia atras o de lado:
        // Shell (compacta, se protege). Hacia abajo/diagonal baja: Relax.
        if (z > 0.4) return 'LEAD';
        if (z < -0.4) return 'SHELL';
        if (Math.abs(x) > 0.5) return 'SHELL';
        return 'RELAX';
    }

    /** Mi golpe conecto: se apunta donde y cuando (para la fijacion). */
    onHitLanded(move, world) {
        const S = this.stance;
        S.impactAt = this._time;
        const o = world && world.opponentOf ? world.opponentOf(this) : null;
        S.impactPoint = o
            ? { x: o.fighter.x, z: o.fighter.z }
            : (move && move.hitbox ? { x: this.fighter.x, z: this.fighter.z + 1 } : null);
    }

    /**
     * El motor de las posturas. Corre en cada frame y devuelve en
     * `extra` los intents que el jugador ha pedido (el especial del
     * doble toque, el encadenado de la fijacion).
     */
    _stances(dt, input, world, extra) {
        const S = this.stance;
        S.time += dt;

        // --- el baile sigue su curso --------------------------------
        if (S.dance) {
            S.dance.t += dt;
            if (S.dance.t >= S.dance.dur) {
                const path = S.dance.path;
                S.id = path[path.length - 1];
                S.dance = null;
                S.absorb = Boxer.stanceAbsorb(S.id);
            }
        }

        // --- pulsacion de ACCION: comando de postura ------------------
        if (input.actionEdge) {
            S.usedPress = false;
            const cmd = Boxer.commandStance(input, true);
            if (cmd) {
                this._adopt(cmd);            // abajo+delante, guardia, ...
                S.usedPress = true;
                return;
            }
            // Fijacion post-golpe: si conecto hace nada, ACCION fija.
            if (S.impactPoint && this._time - S.impactAt <= Boxer.TARGET_WINDOW) {
                this._startTarget();
                S.usedPress = true;
                return;
            }
        }

        // --- cancelacion del baile con GUARDIA -----------------------
        if (S.dance && input.pressed[Intent.GUARDIA]) {
            S.id = S.dance.path[0];          // vuelve a la postura inicial
            S.dance = null;
            S.absorb = Boxer.stanceAbsorb(S.id);
            return;
        }

        // --- tilt a una direccional: el "baile de posiciones" --------
        if (input.actionHeld && input.dirEdge && !S.target) {
            const pair = Boxer.dancePair(input.dirEdge);
            this._startDance([pair[0], pair[1]]);
            return;
        }

        // --- mantenimiento: adoptar y dirigir la postura -------------
        if (input.actionHeld && input.moveMag > 0.08 && !S.dance && !S.target) {
            this._adopt(this._stanceForVector(input.moveX, input.moveZ));
            S.directed = { x: input.moveX, z: input.moveZ };
            return;
        }

        // --- encadenado automatico (TARGET ACTION) -------------------
        if (S.target) {
            S.targetTimer -= dt;
            if (S.targetTimer <= 0 && this._canAct() && !S.dance) {
                extra.pressed[S.targetNext] = true;
                // Alterna golpe pesado y ligero: la "rafaga" al punto.
                S.targetNext = S.targetNext === Intent.ATAQUE_PESADO
                    ? Intent.ATAQUE_LIGERO : Intent.ATAQUE_PESADO;
                S.targetTimer = Boxer.TARGET_CHAIN_STEP;
            }
        }

        // --- soltar ACCION: rotar la postura, o el ESPECIAL si es
        //     doble toque (el golpe de recurso del peleador) --------
        if (!input.actionHeld && S.wasHeld) {
            if (!S.usedPress && !input.consumedByProp) {
                if (this._time - S.lastRelease <= FighterEntity.ACTION_DOUBLE_TAP) {
                    extra.pressed[Intent.ATAQUE_ESPECIAL] = true;
                } else {
                    // Rotacion simple; con atras, invertida.
                    this._startDance([nextStance(S.id, !!input.back)]);
                }
                S.lastRelease = this._time;
            }
            S.target = false;
            this.targetLock = false;
        }
        S.wasHeld = !!input.actionHeld;
    }

    /**
     * La silueta que lleva la pose: la de la postura activa, o la
     * que resulta de interpolar el baile en curso.
     */
    stanceSilhouette() {
        const S = this.stance;
        const def = Boxer.STANCES[S.id];
        if (!def) return null;
        if (!S.dance) return { silhouette: def.silhouette, arms: def.arms };

        const path = S.dance.path;
        const segs = Math.max(1, path.length - 1);
        const k = Math.min(0.999, S.dance.t / S.dance.dur) * segs;
        const i = Math.floor(k);
        const u = k - i;
        const a = (Boxer.STANCES[path[i]] || def);
        const b = (Boxer.STANCES[path[i + 1]] || a);
        const sa = a.silhouette;
        const sb = b.silhouette;
        const silhouette = {
            spread: sa.spread + (sb.spread - sa.spread) * u,
            lead: sa.lead + (sb.lead - sa.lead) * u,
            lean: sa.lean + (sb.lean - sa.lean) * u,
            guard: sa.guard + (sb.guard - sa.guard) * u,
            crouch: sa.crouch + (sb.crouch - sa.crouch) * u
        };
        return { silhouette, arms: u < 0.5 ? a.arms : b.arms };
    }

    /**
     * Ataque aereo: doble arriba + (delante | atras) + puño/patada.
     * Se pide el SALTO ahora; el golpe se dispara cuando el cuerpo
     * esta en el aire (ver _systemIntents).
     */
    _airAttack(input, extra) {
        if (!input.airSeqReady || !(input.forward || input.back)) return;
        const punch = input.pressed[Intent.ATAQUE_LIGERO];
        const kick = input.pressed[Intent.ATAQUE_PESADO];
        if (!punch && !kick) return;
        if (!this.fsm.state.control.canAct || !this.fsm.inGroup(StateGroup.GROUNDED)) return;

        this.pendingAirAttack = punch ? Intent.ATAQUE_LIGERO : Intent.ATAQUE_PESADO;
        extra.pressed[Intent.SALTAR] = true;
        extra.flags.up = true;   // el salto necesita la flag arriba
    }

    // =========================================================================
    // Mundo: movimiento, orientacion, pose
    // =========================================================================

    _combatLocked() {
        const fsm = this.fsm;
        return fsm.inGroup(StateGroup.ATTACKING) ||
            fsm.inGroup(StateGroup.IMPACT) ||
            fsm.inGroup(StateGroup.STUNNED) ||
            fsm.inGroup(StateGroup.DOWNED) ||
            fsm.inGroup(StateGroup.WAKEUP) ||
            fsm.inGroup(StateGroup.AIRBORNE) ||
            fsm.inGroup(StateGroup.GRAPPLE) ||
            fsm.state.tag === 'GUARDIA';
    }

    _moveWorld(dt, input, world) {
        const f = this.fighter;
        const o = world.opponentOf(this);
        const L = this.loco;
        const locked = this._combatLocked();
        let speed = SPEEDS[L.state] || 0;

        let mvx = 0;
        let mvz = 0;
        if (!locked && speed > 0) {
            // La stamina solo consume en caminata y carrera: el paso es
            // gratis (es la herramienta de esquive) y el dash ya se pago.
            if (L.state === 'WALK' || L.state === 'RUN') {
                f.gauge.update(dt, {
                    running: true,
                    moveX: L.dir.x * speed,
                    moveZ: L.dir.z * speed,
                    toOppX: o ? o.fighter.x - f.x : 0,
                    toOppZ: o ? o.fighter.z - f.z : 0
                });
                if (L.state === 'RUN' && !f.gauge.canRun()) {
                    L.state = 'WALK'; L.stateTime = 0;   // sin aire: a caminar
                    speed = SPEEDS.WALK;
                }
            }
            mvx = L.dir.x * speed;
            mvz = L.dir.z * speed;
        } else {
            f.gauge.update(dt, { running: false });
        }

        // Knockback: decae exponencialmente.
        f.x += this.vx * dt;
        f.z += this.vz * dt;
        const decay = Math.exp(-dt * 5);
        this.vx *= decay;
        this.vz *= decay;

        // Movimiento propio.
        f.x += mvx * dt;
        f.z += mvz * dt;

        this._moveSpeed = Math.hypot(mvx, mvz);
        this._moving = this._moveSpeed > 0.05 || Math.hypot(this.vx, this.vz) > 0.3;

        // Anillo: separacion minima con el rival. El LIMITE DEL RING ya no se
        // aplica aqui como pared: salirse es una falta que se penaliza (ver
        // world.ringOut), asi que el limite se comprueba DESPUES de mover, en el
        // bucle del engine. Si se recortase aqui, nadie podria salirse nunca y
        // la regla no tendria sentido.
        if (o) {
            const dox = o.fighter.x - f.x;
            const doz = o.fighter.z - f.z;
            const d = Math.hypot(dox, doz);
            if (d < world.minSpacing && d > 1e-4) {
                f.x = o.fighter.x - (dox / d) * world.minSpacing;
                f.z = o.fighter.z - (doz / d) * world.minSpacing;
            }
        }
    }

    _face(world) {
        const f = this.fighter;
        const o = world.opponentOf(this);
        if (!o) return;

        // Al salir el golpe, el cuerpo se encara al rival de golpe.
        if (this._justAttacked) {
            f.facing = Math.atan2(o.fighter.x - f.x, o.fighter.z - f.z);
            this._justAttacked = false;
            return;
        }
        // Al encarar al rival: si hay fijacion (TARGET ACTION), los
        // siguientes golpes van al punto donde conecto el ultimo.
        if (this.stance.target && this.stance.impactPoint) {
            f.facing = Math.atan2(
                this.stance.impactPoint.x - f.x,
                this.stance.impactPoint.z - f.z
            );
            return;
        }
        // Golpe, caida, agarre, guardia: la animacion manda (LOCK_ROTATION).
        if (this._combatLocked()) return;

        // En combate el cuerpo siempre mira al rival (tambien de lado:
        // la guardia sigue arriba mientras se lateraliza).
        f.facing = Math.atan2(o.fighter.x - f.x, o.fighter.z - f.z);
    }

    _pose(world, dt) {
        const fsm = this.fsm;
        const state = fsm.state;
        const o = world.opponentOf(this);
        const dist = o
            ? Math.hypot(o.fighter.x - this.fighter.x, o.fighter.z - this.fighter.z)
            : 1.5;
        const opts = {
            style: 'IDLE', forward: 1, dist,
            time: this._time, loco: this.loco.state,
            // La postura activa (arquetipo YUGO) o la silueta
            // interpolada del baile en curso.
            stance: this.stanceSilhouette()
        };

        // Estados de combate (golpe, impacto, guardia, suelo, aire,
        // agarre): la FSM manda. En cualquier otro estado (de pie),
        // la maquina de locomocion decide la pose.
        const combat =
            fsm.inGroup(StateGroup.ATTACKING) ||
            fsm.inGroup(StateGroup.IMPACT) ||
            fsm.inGroup(StateGroup.STUNNED) ||
            fsm.inGroup(StateGroup.DOWNED) ||
            fsm.inGroup(StateGroup.WAKEUP) ||
            fsm.inGroup(StateGroup.AIRBORNE) ||
            fsm.inGroup(StateGroup.GRAPPLE) ||
            state.tag === 'GUARDIA';

        let res;
        if (!combat) {
            res = FighterRig.locoPose(this.model.rig, this.loco.state, opts);
        } else {
            const snap = {
                phase: state.phase,
                groups: state.groups,
                posture: state.posture,
                attack: fsm.move ? fsm.move.key : null,
                attackPhase: fsm.getAttackPhase(),
                attackT: attackProgress(fsm),
                // --- lo que necesita la matriz de reacciones ------------------
                // El GOLPE que ha entrado, no solo su nivel: la altura (cabeza,
                // torso, pierna) y la potencia salen del frame data, y sin
                // ellas la reaccion seria siempre la misma.
                move: fsm.getData('lastHit') ? this._hitMove : null,
                hitLevel: fsm.getData('hitLevel'),
                hitT: this._hitProgress(fsm),
                // --- levantada y castigo al del suelo -------------------------
                down: fsm.getData('knockdown'),
                wakeT: this._wakeProgress(fsm),
                downAttack: this._downAttack(o)
            };
            res = FighterRig.poseFor(this.model.rig, snap, opts);
        }

        this.model.applyPose(res.pose, res.state);
        this.model.place(this.fighter.x, this.fighter.z, this.fighter.facing);

        // La tela va DESPUES de la pose: la costura se ata a los huesos con la
        // FK ya escrita, que es la unica forma de que la capa no vaya un frame
        // por detras del cuerpo.
        if (this.cape) this.cape.update(dt, res.state);
    }

    /**
     * Progreso dentro del hitstun (0..1): donde va la reaccion.
     *
     * POR QUE SE CALCULA AQUI Y NO EN LA FSM
     *   El hitstun lo lleva el estado de impacto, pero el progreso sale de su
     *   timer, y el `timer` de la FSM es un contador de frames internos que la
     *   entidad no ve. Se reconstruye con el frame del estado y el limite del
     *   golpe: es la misma cuenta que hace attackProgress para los ataques.
     */
    _hitProgress(fsm) {
        if (!fsm.inGroup(StateGroup.IMPACT) && !fsm.inGroup(StateGroup.STUNNED)) return 0;
        const total = fsm.getData('lastHit') && fsm.getData('lastHit').hitstun;
        if (!total) return 0;
        return Math.max(0, Math.min(1, fsm.frame / total));
    }

    /** Progreso de la levantada (0..1). */
    _wakeProgress(fsm) {
        if (!fsm.inGroup(StateGroup.WAKEUP)) return 0;
        const st = fsm.state;
        if (!st.durationFrames) return 0;
        return Math.max(0, Math.min(1, fsm.frame / st.durationFrames));
    }

    /**
     * Que clase de golpe contra el suelo es este, o null.
     *
     * SOLO CUANDO EL RIVAL ESTA TUMBADo. Antes `isDownAttack` devolvia false
     * fijo y por eso el castigo al del suelo no existia (biblia 8). Aqui se
     * decide por la postura del RIVAL: si esta en DOWNED, el golpe cambia de
     * silueta y lo que sale es el montaje (un pie encima / manos al suelo /
     * patada descendente), no el jab de siempre.
     */
    _downAttack(opponent) {
        if (!opponent) return null;
        if (!this.fsm.inGroup(StateGroup.ATTACKING)) return null;
        if (!opponent.fsm.inGroup(StateGroup.DOWNED)) return null;
        const move = this.fsm.move;
        if (!move) return null;
        // El golpe ALTO contra un cuerpo tumbado es el que pisa; el BAJO es
        // inútil contra alguien que ya esta en el suelo.
        // OJO: `move.height` es elvocabulario de ALTURA ('ALTO'/'MEDIO'/'BAJO'/
        // 'SUELO'), que NO es SPF.HitLevel (el nivel del impacto). Son dos
        // cosas distintas y confundirlas aqui haria que el barrido se tratara
        // como un golpe a la cabeza.
        if (move.height === 'BAJO' || move.height === 'SUELO') return null;
        const damage = move.damage || 0;
        if (damage >= 14) return 'PESADO';
        if (move.hitLevel === SPF.HitLevel.FUERTE) return 'SALTAR';
        if (move.height === 'ALTO' || move.key === 'UPPERCUT') return 'MANOS';
        return 'PIE';
    }

    _onStateEnter(prevId) {
        // Coste de recurso del golpe al que se entra.
        const move = this.fsm.move;
        if (move && move.meterCost) this.fighter.gauge.spend(move.meterCost);
        // Al arrancar un ataque: encarar al rival en la siguiente pose.
        if (this.fsm.inGroup(StateGroup.ATTACKING)) this._justAttacked = true;
    }

    // =========================================================================
    // Resolucion de golpes: el corazon de la especificacion de movimiento
    // =========================================================================

    /**
     * Defensa: decide si un golpe conecta y con que bonus.
     *
     *   LINEAL  -> se esquiva moviendose (paso, dash): en ventana de
     *              esquive, el golpe pasa de largo.
     *   AREA    -> caza a quien se mueve. Si el objetivo esta en
     *              movimiento, conecta con ATURDIMIENTO (stun); si está
     *              intentando esquivar, con DERIBO seguro. Por eso el
     *              area es el castigo a la movilidad.
     *
     * @returns {{ hit:boolean, blocked?:boolean, dodged?:boolean,
     *             bonus?:'HUNT'|'PUNISH', how?:string }}
     */
    defend(move, attacker, world) {
        const evading = this.evadeStateFor(move);

        // --- ESTANCIAS DE BOXEO (arquetipo YUGO) ---------------------
        // ABSORB: la postura se come uno o dos impactos DIRECTOS con
        // un brazo mientras la otra mano responde (su moveset ya es
        // la respuesta). Los golpes FUERTES rompen la absorcion.
        if (this.stance.absorb > 0 && move.hitLevel !== SPF.HitLevel.FUERTE) {
            this.stance.absorb -= 1;
            return { hit: false, blocked: true, how: 'ABSORB' };
        }
        // CATCH: la postura ATRAPA patadas bajas del rival.
        if (Boxer.catchesLowKicks(this.stance.id) &&
            move.height === 'BAJO') {
            return { hit: false, dodged: true, how: 'ATRAPADA' };
        }

        // Guardia: la altura de la guardia cubre la del golpe.
        if (this.fsm.state.tag === 'GUARDIA' && !evading) {
            const highGuard = this.fsm.stateId === State.AGACHADO_GUARDIA_ALTA;
            const need = move.breaksGuardHeight;
            // La guardia alta cubre ALTA y MEDIA; la baja, BAJA y MEDIA.
            const covers = highGuard ? (need !== SPF.GuardHeight.BAJA)
                : (need !== SPF.GuardHeight.ALTA);
            if (covers) return { blocked: true, hit: false };
        }

        if (move.type === 'AREA') {
            if (evading) {
                // Intentar esquivar un golpe de area es lo peor que se
                // puede hacer: lo caza y derriba.
                return { hit: true, bonus: 'PUNISH' };
            }
            if (this._moving) {
                // Caza al que se mueve: aturdimiento (stun).
                return { hit: true, bonus: 'HUNT' };
            }
            return { hit: true };
        }

        // LINEAL: las ventanas de esquive lo evaden.
        if (evading) {
            return { hit: false, dodged: true, how: evading };
        }
        return { hit: true };
    }

    /**
     * Ventana de esquive activa para este golpe, o null:
     *   PASO ..... el paso inicial de cualquier movimiento
     *   AGACHADO . el dash agachado (golpes ALTOS)
     *   SALTO .... el dash saltando (golpes BAJOS / de SUELO)
     */
    evadeStateFor(move) {
        const t = this._time;
        if (t < this.loco.dodgeUntil) return 'PASO';
        if (t < this.loco.dodgeHighUntil && move.height === 'ALTO') return 'AGACHADO';
        if (t < this.loco.dodgeLowUntil &&
            (move.height === 'BAJO' || move.height === 'SUELO')) return 'SALTO';
        return null;
    }

    /** Recibe un golpe que ya conecto (ver dictamen de defend). */
    takeHit(move, from, world, bonus) {
        const f = this.fighter;
        const wasAir = this.fsm.inGroup(StateGroup.AIRBORNE);
        // Un golpe FUERTE que sale de la posicion delata la capa: la tela
        // sale despedida para atras con el cuerpo. Sin esto la capa se queda
        // pegada al pecho mientras el peleador vuela, que es de lo mas
        // desconcertante que se puede ver en un juego de pelea.
        if (this.cape && move.damage >= 10) {
            const dir = from.fighter.facing;
            // La capa sale despedida en la direccion del golpe (hacia el
            // atacante es -Z en el espacio del que lo recibe). La velocidad es
            // en m/s y escala con el dano: un golpe fuerte tira mas.
            this.cape.gust([-Math.sin(dir), 0, -Math.cos(dir)], 1.4 + (move.damage || 10) * 0.12);
        }

        f.health = Math.max(0, f.health - move.damage);

        const dir = from.fighter.facing;
        let power = move.knockdown === 'ALWAYS' ? 1.9
            : (move.launch.x > 0 ? 1.1 : 0.45);

        const hit = {
            hitLevel: move.hitLevel,
            knockdown: move.knockdown,
            launchX: move.launch.x,
            launchY: move.launch.y,
            hitstun: move.hitstun,
            isLow: move.hitLevel === SPF.HitLevel.BAJO
        };

        if (bonus === 'HUNT') {
            // El area caza al que se mueve: aturdimiento.
            hit.dizzy = true;
            power *= 1.4;
        } else if (bonus === 'PUNISH') {
            // Esquivar un area: derribo seguro.
            hit.knockdown = 'ALWAYS';
            hit.hitLevel = SPF.HitLevel.FUERTE;
            power = 2.2;
        }

        this.vx += Math.sin(dir) * power;
        this.vz += Math.cos(dir) * power;

        if (wasAir || move.launch.y > 0) this.juggle += (move.juggleAdd || 1);
        else this.juggle = 0;

        // El golpe se guarda para la animacion: la matriz de reacciones necesita su
        // ALTURA (cabeza / torso / pierna) y su potencia, que no estan en el
        // `hitLevel` que guarda la FSM.
        this._hitMove = move;

        this.fsm.onHit(hit);
        world.hitstop = Math.max(world.hitstop, move.hitstop / 60);
    }

    /** Bloqueo: sin dano, empuje pequeno y micro-congelacion. */
    onBlocked(move, attacker, world) {
        const dir = attacker.fighter.facing;
        this.vx += Math.sin(dir) * 0.55;
        this.vz += Math.cos(dir) * 0.55;
        world.hitstop = Math.max(world.hitstop, (move.hitstop / 2) / 60);
    }

    // =========================================================================
    // Debug / IA
    // =========================================================================

    /** Dispara un intent "a mano" (debug, IA): la tabla decide el destino. */
    tryIntent(intent) {
        const pressed = Object.create(null);
        pressed[intent] = true;
        const base = this._lastInput || {};
        this.fsm.setInput(Object.assign({}, base, {
            pressed: Object.assign(Object.create(null), base.pressed, pressed)
        }));
    }
}

export default FighterEntity;
