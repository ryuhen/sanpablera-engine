/**
 * ============================================================================
 * SANPABLERA ENGINE · Entidades · InputMapper.js
 * ----------------------------------------------------------------------------
 * Del estado de la UI tactil al input de la FSM. PURO: no toca Babylon ni el
 * DOM, solo lee el `TouchControls` (un monton de booleanos) y devuelve el
 * objeto de input que la FSM espera, mas las detecciones de movimiento:
 *
 *   - Aristas de boton (pressed solo el frame del contacto, held mientras
 *     dura) -> intents de la FSM. El acorde ligero + pesado es la
 *     TECNICA (derribo / agarre).
 *   - Doble toque de direccion (dos pulsaciones del mismo eje en la ventana)
 *     -> DASH (o dash agachado / dash saltando segun el modificador).
 *   - Doble arriba (secuencia) -> ventana para ataque aereo.
 *   - Combos: accion + puño + (abajo+delante | abajo+atras) -> cuadrupedia
 *     / deslizamiento.
 *
 * El mapeo de ejes es RELATIVO A LA CAMARA (el mundo se mueve segun donde
 * mira la camara) y las flags forward/back son RELATIVAS AL RIVAL (la FSM
 * trabaja en el eje del combate).
 * ============================================================================
 */
import SPF from '../fsm/Constants.js';
// La cuantizacion de la cruceta vive en la matriz de direcciones y NO aqui.
// Tener el umbral en los dos sitios es como se acaba cuantizando dos veces
// con reglas distintas: `forward`/`back` usan uno y `dir8` usaria otro, y
// entonces "adelante" y "adelante-derecha" podrian no cuadrar en el mismo
// frame. Una sola constante, una sola verdad.
import { quantizeDirection, AXIS_EPS } from '../directionMatrix.js';

const { Intent } = SPF;

/** Ventana de doble toque (s). Dos pulsaciones del mismo eje dentro de
 *  esto activan el dash. */
export const DOUBLE_TAP_WINDOW = 0.26;

/** Ventana de la secuencia doble-arriba (s) para ataques aereos. */
export const AIR_SEQ_WINDOW = 0.34;

/** Cuanto despues de pulsar ACCION sigue siendo "recien pulsada" para
 *  los combos de movimiento (cuadripedia / deslizamiento). */
export const COMBO_WINDOW = 0.30;

/** Umbral de proyeccion para considerar que un eje esta pulsado.
 *  Viene de `core/directionMatrix.js`: es el mismo numero que usa
 *  `quantizeDirection`, y TIENE que serlo (ver la nota del import). */

/** D-pad -> plano de mundo usando la basis de la camara
 *  (f = hacia donde mira, r = derecha de pantalla). */
function dpadToWorld(d, cam) {
    let vx = 0;
    let vz = 0;
    if (d.up) { vx += cam.fx; vz += cam.fz; }
    if (d.down) { vx -= cam.fx; vz -= cam.fz; }
    if (d.right) { vx += cam.rx; vz += cam.rz; }
    if (d.left) { vx -= cam.rx; vz -= cam.rz; }
    let mag = Math.hypot(vx, vz);
    if (mag > 1e-4) { vx /= mag; vz /= mag; mag = 1; }
    else { mag = 0; }
    return { x: vx, z: vz, mag };
}

/** Nombre del eje pulsado (incluye diagonales), o null si no hay nada. */
function dirName(d) {
    let name = '';
    if (d.up) name += 'UP_';
    if (d.down) name += 'DOWN_';
    if (d.left) name += 'LEFT_';
    if (d.right) name += 'RIGHT_';
    return name ? name.slice(0, -1) : null;
}

export class InputMapper {
    constructor() {
        /** Reloj del mapper (avanza con `tick`, se congela con el hitstop
         *  porque el engine no llama a tick mientras dura). */
        this.time = 0;
        this.prev = { attack1: false, attack2: false, block: false, action: false, up: false, down: false };
        this.dirHistory = [];          // [{ dir, time }] ultimas pulsaciones de eje
        this._lastDirKey = null;
        this.lastUpEdge = -Infinity;
        this.airSeqReadyUntil = -Infinity;
        this.actionSince = null;       // momento de la ultima pulsacion de ACCION
        /** Ultimo snapshot (lo lee el engine para el boton ACCION). */
        this.lastSnapshot = null;
    }

    tick(dt) { this.time += dt; }

    /**
     * @param touch  el TouchControls (dpad + buttons)
     * @param cam    { fx, fz, rx, rz } basis de camara (ver Engine.cameraGroundBasis)
     * @param toOpp  { x, z } normalizado: direccion hacia el rival (para
     *               las flags forward/back y los combos)
     */
    snapshot(touch, cam, toOpp) {
        const b = touch.buttons;
        const d = touch.dpad;
        const t = this.time;
        const pressed = Object.create(null);
        const held = Object.create(null);

        // ---- botones -> intents (aristas y estado sostenido) ----
        if (b.attack1 && !this.prev.attack1) pressed[Intent.ATAQUE_LIGERO] = true;
        if (b.attack2 && !this.prev.attack2) pressed[Intent.ATAQUE_PESADO] = true;
        if (b.block) {
            if (!this.prev.block) pressed[Intent.GUARDIA] = true;
            held[Intent.GUARDIA] = true;
        }
        // Acorde ligero + pesado (los dos puños a la vez): TECNICA.
        // Es el mapeo clasico de los juegos de pelea: los dos
        // puños juntos = agarrar / derribar. La arista es cuando
        // se COMPLETA el acorde (uno se pulsa estando el otro
        // ya pulsado). Quien no tenga tecnica propia simplemente
        // hace su golpe pesado: la regla de la FSM no compite.
        if (b.attack1 && b.attack2
            && (!this.prev.attack1 || !this.prev.attack2)) {
            pressed[Intent.TECNICA] = true;
        }

        // ---- ejes: mundo (movimiento) y flags FSM ----
        const move = dpadToWorld(d, cam);
        const fwd = toOpp ? move.x * toOpp.x + move.z * toOpp.z : 0;
        const sideX = toOpp ? -toOpp.z : 0;   // "derecha" mirando al rival
        const sideZ = toOpp ? toOpp.x : 0;
        const side = toOpp ? move.x * sideX + move.z * sideZ : 0;

        const input = {
            x: side,
            y: fwd,
            forward: fwd > AXIS_EPS,
            back: fwd < -AXIS_EPS,
            up: !!(d.up || d.upLeft || d.upRight),
            down: !!(d.down || d.downLeft || d.downRight),
            left: !!(d.left || d.upLeft || d.downLeft),
            right: !!(d.right || d.upRight || d.downRight),
            pressed,
            held,
            moveX: move.x,
            moveZ: move.z,
            moveMag: move.mag,
            // ---- detecciones ----
            dash: null,          // { dir, kind, x, z }
            airSeqReady: false,  // dentro de la ventana de doble arriba
            quadEdge: false,     // combo de cuadripedia
            slideEdge: false,    // combo de deslizamiento
            actionEdge: false,
            actionHeld: !!b.action,
            actionFresh: false,
            crouch: !!(d.down || d.downLeft || d.downRight),
            dirEdge: null,
            // Las ocho direcciones de la cruceta, medidas en la base
            // (side, fwd) que ya se ha calculado arriba: `side` positivo es la
            // derecha del peleador y `fwd` positivo mira al rival. Es lo que
            // consume la matriz de golpes (`core/directionMatrix.js`).
            //
            // Se emite SIEMPRE, tambien con el stick suelto: entonces
            // sale 'N' y la matriz responde con el golpe base del boton.
            dir8: quantizeDirection(side, fwd),
            // La capa de guardia. `guard` es lo que convierte la cruceta de
            // 8 direcciones en un mando de 2 vias (arriba salta, abajo se
            // agacha) y lo que da a los botones su significado propio
            // (puno y patada dejan de ser la matriz y pasan a ser agarre o
            // tecnica). Se expone como booleano porque lo consultan varios
            // sitios y porque queda mas claro que `held[GUARDIA]`.
            guard: held[Intent.GUARDIA] === true,
            // Doble toque ABAJO: la senal de "tirarse al suelo". Va aparte
            // del `dash` a proposito (ver mas abajo).
            doubleDown: false
        };

        // ---- arista de direccion + doble toque (dash) ----
        const dirKey = dirName(d);
        if (dirKey && dirKey !== this._lastDirKey) {
            this.dirHistory.push({ dir: dirKey, time: t });
            if (this.dirHistory.length > 10) this.dirHistory.shift();
            let prevSame = null;
            for (let i = this.dirHistory.length - 2; i >= 0; i--) {
                if (this.dirHistory[i].dir === dirKey) { prevSame = this.dirHistory[i]; break; }
            }
            input.dirEdge = dirKey;
            if (prevSame && (t - prevSame.time) <= DOUBLE_TAP_WINDOW) {
                const kind = input.down ? 'CROUCH_DASH'
                    : (input.up ? 'JUMP_DASH' : 'DASH');
                input.dash = { dir: dirKey, kind, x: move.x, z: move.z };
            }
        }
        this._lastDirKey = dirKey;

        // ---- doble arriba: ventana de ataque aereo ----
        if (input.up && !this.prev.up) {
            if ((t - this.lastUpEdge) <= AIR_SEQ_WINDOW) {
                this.airSeqReadyUntil = t + AIR_SEQ_WINDOW;
            }
            this.lastUpEdge = t;
        }
        input.airSeqReady = t < this.airSeqReadyUntil;

        // ---- doble ABAJO: la senal de "tirarse al suelo" ----
        //
        // Se separa del `dash` a proposito. El doble toque de ABAJO no es un
        // dash: es una peticion de suelo (pecho a tierra, gateo, rodada), que
        // se combina con la guardia y la accion. Si compartiera camino con
        // el dash habria que decidir cual de los dos gana cuando coinciden, y
        // se perderian los dos.
        //
        // El reloj es propio (`lastDownEdge`) y no el del historial de ejes:
        // el historial guarda la ultima pulsacion de CADA direccion, asi que
        // el `dirHistory` no distingue "he vuelto a pulsar abajo" de "sigo
        // manteniendo abajo".
        if (input.down && !this.prev.down) {
            if ((t - this.lastDownEdge) <= DOUBLE_TAP_WINDOW) {
                input.doubleDown = true;
            }
            this.lastDownEdge = t;
        }

        // ---- ACCION: arista, sostenida y "recien pulsada" ----
        if (b.action && !this.prev.action) {
            input.actionEdge = true;
            this.actionSince = t;
        }
        input.actionFresh = this.actionSince != null && (t - this.actionSince) <= COMBO_WINDOW;

        // ---- combos de movimiento: ACCION (recien) + puño + diagonal ----
        // Cuadrupedia:  abajo + delante + puño  (reptar)
        // Deslizamiento: abajo + atras  + puño  (sliding)
        const punchEdge = b.attack1 && !this.prev.attack1;
        if (input.actionFresh && punchEdge && input.down) {
            if (input.forward) input.quadEdge = true;
            else if (input.back) input.slideEdge = true;
        }

        // ---- memoria de aristas ----
        // `down` TIENE que estar aqui. Si no, `this.prev.down` se queda en
        // false para siempre, `input.down && !this.prev.down` da verdad en
        // cada frame con abajo pulsado, y mantener el pulgar abajo se cuenta
        // como un doble toque: el peleador se tiraria al suelo solo.
        this.prev = {
            attack1: !!b.attack1, attack2: !!b.attack2,
            block: !!b.block, action: !!b.action,
            up: input.up, down: input.down
        };
        this.lastSnapshot = input;
        return input;
    }

    /** Reinicia la memoria de aristas (para cortes de escena / reinicio). */
    reset() {
        this.prev = {
            attack1: false, attack2: false, block: false, action: false,
            up: false, down: false
        };
        this.dirHistory.length = 0;
        this._lastDirKey = null;
        this.lastUpEdge = -Infinity;
        this.lastDownEdge = -Infinity;
        this.airSeqReadyUntil = -Infinity;
        this.actionSince = null;
    }
}

export default { InputMapper, DOUBLE_TAP_WINDOW, AIR_SEQ_WINDOW, COMBO_WINDOW };
