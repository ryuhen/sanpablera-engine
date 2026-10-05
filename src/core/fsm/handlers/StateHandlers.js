/**
 * ============================================================================
 * SANPABLERA ENGINE · FSM · handlers/StateHandlers.js
 * ----------------------------------------------------------------------------
 * COMPORTAMIENTO POR GRUPO DE ESTADOS: lo que la tabla de transiciones no puede
 * expresar porque es codigo, no un destino.
 *
 * La tabla dice "de GOLPEADO a NORMAL_A cuando pase el hitstun". El handler
 * dice "el hitstun son 12 frames, y al acabarse hay knockdown". Esa es la
 * division: transicion = a donde se va; handler = lo que pasa mientras esta ahi
 * y como se decide la salida.
 *
 * Se registra por StateGroup para no repetir el mismo codigo en los 4 estados
 * de ataque, ni en los 30 de agarre.
 * ============================================================================
 */
import SPF from '../Constants.js';

const {
    State, StateGroup, Phase, AttackPhase, Intent, TransitionSource,
    GrappleRole, GrappleAction, HitLevel, DownOrientation, FacingAxis,
    CONFIG, CANCEL_TIER_ORDER
} = SPF;

/**
 * Cuanto hitstun aplica un golpe cuando el estado de reaccion es dinamico.
 * Se guarda en la FSM con setTimer() al entrar por HIT.
 */
function hitstunFor(ctx) {
    const hit = ctx.hit || {};
    if (hit.hitstun != null && hit.hitstun > 0) return hit.hitstun;
    switch (hit.hitLevel) {
        case HitLevel.FUERTE: return 22;
        case HitLevel.BAJO: return 0;      // el barrido no da hitstun: derriba
        default: return 12;
    }
}

/**
 * Marca que este estado tiene que terminar en knockdown. Lo consulta la regla
 * TIMER del grupo IMPACT (knockdownOnEnd) para elegir el estado de caida.
 *
 * Se guarda el TRES datos que el combate necesita y que antes iban repartidos:
 *   - `state`       : en que estado de suelo se entra (de cara o de espaldas)
 *   - `orientation` : como queda el cuerpo (para el HUD y el rescuje)
 *   - `axis`        : hacia donde mira el cuerpo (0 cabeza, 180 pies, 45/135
 *                     diagonales). El barrido deja el cuerpo en un angulo
 *                     intermedio: por eso necesita su propio eje.
 */
function markKnockdown(ctx, orientation) {
    const fsm = ctx.fsm;
    const hit = ctx.hit || {};

    let axis;
    let bodyOrientation;
    if (hit.isLow) {
        // Barrido: cae de costado, cuerpo a 45 grados.
        axis = FacingAxis.DIAGONAL_135;
        bodyOrientation = DownOrientation.FLANCO_IZQUIERDO;
    } else if (hit.isBack) {
        // Golpe a la espalda: cae de cara, con la cabeza hacia el rival.
        axis = FacingAxis.CABEZA_A_RIVAL;
        bodyOrientation = DownOrientation.CABEZA_A_RIVAL;
    } else {
        // Golpe de frente: cae de espaldas, con los pies hacia el rival.
        axis = FacingAxis.PIES_A_RIVAL;
        bodyOrientation = DownOrientation.PIES_A_RIVAL;
    }
    if (orientation) bodyOrientation = orientation;

    // De cara = pecho tierra (BOCA_ABAJO). De costado tambien: lo que cambia
    // es el eje, no el estado.
    const prone = bodyOrientation === DownOrientation.CABEZA_A_RIVAL ||
        bodyOrientation === DownOrientation.FLANCO_IZQUIERDO ||
        bodyOrientation === DownOrientation.FLANCO_DERECHO;

    fsm.setData('knockdown', {
        orientation: bodyOrientation,
        axis,
        state: prone ? State.SUELO_TUMBADO_BOCA_ABAJO : State.SUELO_TUMBADO_BOCA_ARRIBA
    });
}

/** ¿Este golpe derriba? (ver States/GrappleStates.js: el clinch tampoco suma). */
function knockdownForced(hit) {
    const h = hit || {};
    if (h.knockdown === 'ALWAYS') return true;
    if (h.knockdown === 'LIGHT') return h.hitLevel === HitLevel.FUERTE;
    return h.hitLevel === HitLevel.BAJO;
}

/** Elegir el estado de caida segun lo que guarde markKnockdown(). */
function knockdownState(ctx) {
    const kd = ctx.fsm.getData('knockdown');
    if (!kd) return State.SUELO_TUMBADO_BOCA_ARRIBA;
    ctx.fsm.setBodyAxis(kd.axis);
    return kd.state;
}

/**
 * Devolucion a la base desde un ataque: el ultimo estado "estable" del que
 * salio el luchador. Guardarlo al entrar en el ataque es lo que hace que un
 * jabScaler en cuadrupeda devuelva a cuadrupeda y no a idle.
 */
function returnState(ctx) {
    const fsm = ctx.fsm;
    const previous = fsm.previousStableState;
    if (previous != null && fsm.profile.has(previous)) {
        const st = fsm.profile.get(previous);
        if (st.phase === Phase.GROUND && st.control.canAct) return previous;
    }
    return State.NORMAL_A;
}

/** Handlers agrupados. La FSM elige por el primer grupo que coincida. */
export const HANDLERS = [
    // =========================================================================
    // ATAQUES: fase del golpe derived de los frames + senal de hitbox
    // =========================================================================
    {
        group: StateGroup.ATTACKING,
        onEnter(ctx) {
            const fsm = ctx.fsm;
            const move = ctx.move;
            if (!move) return;

            fsm.setTimer(move.duration);

            // El contador de frames del golpe arranca aqui: getAttackPhase() lo
            // lee para saber si este frame es de startup, activo o recovery.
            fsm.setData('moveStartState', fsm.stateId);

            // La hitbox se "gasta" una sola vez por golpe. Se limpia al entrar,
            // no al salir, para que un segundo golpe del mismo key no herede el
            // flag del anterior.
            fsm.setData('hitboxResolved', false);
            fsm.setData('hitConsumed', false);
            fsm.setData('hitLevel', move.hitLevel);

            // El APC parte del frame data del golpe: cancelar antes del startup
            // no tiene sentido y por eso el guard mira framesIntoMove().
            fsm.setData('cancelTier', move.cancelTier);

            // El especial congela el tiempo: el super freeze lo lee la entidad.
            if (move.freeze) fsm.emitSignal('SUPER_FREEZE', move.freeze);
        },
        tick(ctx) {
            const fsm = ctx.fsm;
            const move = ctx.move;
            if (!move) return;

            const phase = fsm.getAttackPhase();
            // La hitbox solo existe en ACTIVE y solo una vez por golpe: sin el
            // flag de "consumido", un golpe de 6 framesActive haria 6 danios.
            if (phase === AttackPhase.ACTIVE && !fsm.getData('hitboxResolved')) {
                fsm.emitSignal('HITBOX_ACTIVE', { move, frame: fsm.frame });
            }
        }
    },

    // =========================================================================
    // IMPACTO: hitstun dinamico y eleccion de knockdown
    // =========================================================================
    {
        group: StateGroup.IMPACT,
        onEnter(ctx) {
            const fsm = ctx.fsm;
            if (ctx.source === TransitionSource.HIT) {
                fsm.setTimer(hitstunFor(ctx) || 12);

                // Knockdown segun el golpe: ALWAYS lo impone el frame data,
                // LIGHT solo si el golpe era fuerte. Los datos de la caida (eje
                // y estado de suelo) los dejo la FSM al recibir el golpe, para
                // que un barrido que derriba directo tambien los tenga.
                const heavy = knockdownForced(ctx.hit);
                fsm.setData('knockdownOnEnd', !!heavy);
                if (heavy && !fsm.getData('knockdown')) markKnockdown(ctx);
            }
        },
        tick(ctx) {
            // El mareado se queda mas: se renueva el timer cada frame mientras
            // el estado siga siendo MAREADO.
            if (ctx.fsm.stateId === State.MAREADO) ctx.fsm.setTimer(1);
        }
    },

    // =========================================================================
    // AIRE: contabilidad de juggle y de air recovery
    // =========================================================================
    {
        group: StateGroup.AIRBORNE,
        onEnter(ctx) {
            ctx.fsm.setData('airFrames', 0);
        },
        tick(ctx) {
            ctx.fsm.setData('airFrames', (ctx.fsm.getData('airFrames') || 0) + 1);
        }
    },

    // =========================================================================
    // SUELO: levantada con invulnerabilidad y ventana de wakeup
    // =========================================================================
    {
        group: StateGroup.DOWNED,
        onEnter(ctx) {
            const fsm = ctx.fsm;
            fsm.setData('downFrames', 0);
            fsm.setData('wakeupReadyAt', CONFIG.WAKEUP_INVULN_FRAMES);
            // La orientacion de caida que se guardo al entrar por HIT se
            // aplica aqui como eje del cuerpo: es lo que decide hacia donde
            // mira el primer frame de la levantada.
            const kd = fsm.getData('knockdown');
            if (kd) {
                fsm.setBodyAxis(kd.axis);
                fsm.setData('orientation', kd.orientation);
            }
        },
        tick(ctx) {
            ctx.fsm.setData('downFrames', (ctx.fsm.getData('downFrames') || 0) + 1);
        }
    },

    {
        group: StateGroup.WAKEUP,
        onEnter(ctx) {
            // La invulnerabilidad se aplica al entrar, no con un flag de estado,
            // porque el numero de frames sale de CONFIG y asi se puede tocar
            // desde el tuning sin tocar la FSM.
            ctx.fsm.setInvulnerable(CONFIG.WAKEUP_INVULN_FRAMES);
        }
    },

    // =========================================================================
    // AGARRE: la sesion manda; la FSM solo refleja el estado que toca
    // =========================================================================
    {
        group: StateGroup.GRAPPLE,
        onEnter(ctx) {
            const fsm = ctx.fsm;
            // El papel lo decide la sesion, no el estado pedido: si el UKE pide
            // el agarre, el que entra como UKE es el otro (el queAgarra).
            const session = ctx.api.getGrappleSession();
            fsm.setData('grappleRole', session ? session.roleOf(fsm.fighterId) : null);
            fsm.setData('grappleAction', null);
        },
        tick(ctx) {
            const fsm = ctx.fsm;
            const session = ctx.api.getGrappleSession();
            if (!session) return;

            // 1) Sincronizar el estado con la postura actual de la sesion. Si
            //    la sesion cambio de postura (p. ej. entro en SUMISION), ambos
            //    luchadores cambian de estado en el mismo frame.
            const target = session.stateIdFor(fsm.fighterId);
            if (target != null && target !== fsm.stateId) {
                fsm.changeState(target, { source: TransitionSource.CONTACT, reason: 'sesion' });
                return;
            }

            // 2) Traducir la accion de la sesion a animacion.
            if (session.action) {
                const def = session._actionDef(session.action);
                if (def && session.actor === fsm.getData('grappleRole')) {
                    fsm.setData('grappleAction', session.action);
                    fsm.emitSignal('GRAPPLE_ACTION', { action: session.action, def });
                }
            }

            // 3) Enviar las peticiones de este frame (una por rol y frame).
            const role = fsm.getData('grappleRole');
            const wanted = inputToGrappleAction(ctx.input);
            if (wanted && session.frame !== fsm.getData('sessionFrame')) {
                if (role === GrappleRole.UKE && wanted === GrappleAction.ESCAPE) {
                    session.mashEscape();
                }
                session.request(fsm.fighterId, wanted);
                fsm.setData('sessionFrame', session.frame);
            }
        }
    }
];

/** Mapea la intencion del frame a una accion de agarre. */
export function inputToGrappleAction(input) {
    if (!input) return null;
    if (input.pressed && input.pressed[Intent.ATAQUE_PESADO]) return GrappleAction.PROYECCION;
    if (input.pressed && input.pressed[Intent.ATAQUE_ESPECIAL]) return GrappleAction.SUMISION;
    if (input.pressed && input.pressed[Intent.ATAQUE_LIGERO]) return GrappleAction.ATACAR;
    if (input.pressed && input.pressed[Intent.GUARDIA]) return GrappleAction.ESCAPE;
    return null;
}

/**
 * Devuelve el handler aplicable a un estado: el del primer grupo registrado
 * que el estado pertenezca. El orden de HANDLERS es el orden de prioridad
 * (ATTACKING antes que GROUNDED, IMPACT antes que STUNNED...).
 */
export function handlerFor(state) {
    for (const h of HANDLERS) {
        if (state.groups.indexOf(h.group) !== -1) return h;
    }
    return null;
}

export { hitstunFor, markKnockdown, knockdownForced, knockdownState, returnState };