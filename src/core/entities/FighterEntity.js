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
import * as FighterRig from './FighterRig.js';

const { State, StateGroup, Intent, TransitionSource, CONFIG } = SPF;

/** El abanico de estilos del boton multiple (action). */
export const STYLE_STANCES = Object.freeze(['IDLE', 'GUARD', 'PRESSING', 'DEFENSIVE', 'TAUNT']);

/** Siguiente estilo del abanico (ciclo). */
export function nextStance(style) {
    const i = STYLE_STANCES.indexOf(style);
    return STYLE_STANCES[(i + 1) % STYLE_STANCES.length];
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
        this.style = opts.stance || 'IDLE';

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

        // 4. Ataque aereo (doble arriba + delante/atras + puño/patada).
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

        // 10. Pose.
        this._pose(world);
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

        // Anillo: limite radial y separacion minima con el rival.
        const radius = Math.hypot(f.x, f.z);
        if (radius > world.ringLimit) {
            const s = world.ringLimit / radius;
            f.x *= s;
            f.z *= s;
        }
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
        // Golpe, caida, agarre, guardia: la animacion manda (LOCK_ROTATION).
        if (this._combatLocked()) return;

        // En combate el cuerpo siempre mira al rival (tambien de lado:
        // la guardia sigue arriba mientras se lateraliza).
        f.facing = Math.atan2(o.fighter.x - f.x, o.fighter.z - f.z);
    }

    _pose(world) {
        const fsm = this.fsm;
        const state = fsm.state;
        const o = world.opponentOf(this);
        const dist = o
            ? Math.hypot(o.fighter.x - this.fighter.x, o.fighter.z - this.fighter.z)
            : 1.5;
        const opts = {
            style: this.style, forward: 1, dist,
            time: this._time, loco: this.loco.state
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
                hitLevel: fsm.getData('hitLevel'),
                down: fsm.getData('knockdown')
            };
            res = FighterRig.poseFor(this.model.rig, snap, opts);
        }

        this.model.applyPose(res.pose, res.state);
        this.model.place(this.fighter.x, this.fighter.z, this.fighter.facing);
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
