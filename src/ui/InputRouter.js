/**
 * ============================================================================
 * SANPABLERA ENGINE · ui/InputRouter.js
 * ----------------------------------------------------------------------------
 * UNIFICA LAS TRES FUENTES DE CONTROL en el estado que el motor ya consume.
 *
 * QUE HAY AQUI
 * ----------------------------------------------------------------------------
 *   El motor (Engine.js) leia antes `ui.touchControls`, que solo conocia el
 *   raton y el dedo. Aqui se le da un objeto con la MISMA forma pero alimentado
 *   por tres fuentes a la vez:
 *
 *     - TECLADO : el mapa de ControlsSettings (configurable y guardado).
 *     - MANDO    : la Gamepad API, que es como llega un mando por Bluetooth
 *                  (y tambien uno por USB sin cambiar nada). Se lee con
 *                  navigator.getGamepads(), sin pedir permisos ni instalar
 *                  nada.
 *     - TACTIL   : los botones de la pantalla, tal cual.
 *
 *   Las tres se ORRAN, no se pelean: puedes mover con el teclado y pegar con el
 *   dedo, que es como se juega de verdad.
 *
 * POR QUE LAS DIAGONALES SE CALCULAN AQUI
 * ----------------------------------------------------------------------------
 *   El dpad tactil guarda 8 casillas sueltas (upLeft, downRight...). El
 *   InputMapper solo mira up/down/left/right, asi que una diagonal tactil
 *   llegaba con movimiento cero. Aqui se derivan las diagonales A PARTIR de las
 *   cuatro basicas: una sola fuente de verdad para todos.
 * ============================================================================
 */

import {
    ALL_ACTIONS, MOVE_ACTIONS,
    loadBindings, buildCodeIndex, buildPadIndex,
    DEFAULT_PAD
} from './ControlsSettings.js';

/** Umbral del stick para contar como pulsado (evita la deriva del reposo). */
const STICK_DEADZONE = 0.35;

/** Botones del mando que mapeamos por defecto. */
const DEFAULT_PAD_MAP = DEFAULT_PAD;

export class InputRouter {
    /**
     * @param touchControls  el TouchControls existente (raton / dedo)
     */
    constructor(touchControls) {
        this.touch = touchControls;

        /** Mapa de teclado vivo (se puede cambiar en caliente). */
        this.bindings = loadBindings();
        this.codeIndex = buildCodeIndex(this.bindings);
        this.padMap = DEFAULT_PAD_MAP;
        this.padIndex = buildPadIndex(this.padMap);

        /** Estado unificado que lee el motor. */
        this.dpad = {
            up: false, down: false, left: false, right: false,
            upLeft: false, upRight: false, downLeft: false, downRight: false
        };
        this.buttons = {
            attack1: false, attack2: false, block: false, action: false
        };

        /** Estado crudo por fuente, para el menu de configuracion. */
        this._keys = new Set();
        this._pad = { attack1: false, attack2: false, block: false, action: false };
        this._padDpad = { up: false, down: false, left: false, right: false };

        /** Mando detectado: { index, id } o null. */
        this.pad = null;
        /** Estado del pad en el poll anterior, para detectar que se solto. */
        this._padPrevButtons = [];

        this._enabled = true;
        this._bound = false;
        /** Ultima tecla fisica vista, para el prompt del menu. */
        this.lastKeyCode = null;
    }

    // =======================================================================
    // CICLO DE VIDA EN EL DOM
    // =======================================================================

    /** Conecta los listeners. Idempotente. */
    attach() {
        if (this._bound) return this;
        this._bound = true;

        // Teclas: en keydown para la arista, en keyup para soltar. Se escucha
        // en window con capture para que el menu de configuracion (que
        // tambien captura teclas) no se coma la pulsacion de juego.
        window.addEventListener('keydown', (e) => this._onKey(e, true), true);
        window.addEventListener('keyup', (e) => this._onKey(e, false), true);

        // Si se pierde el foco con una tecla pulsada, keyup no llega y el
        // personaje se queda andando solo. Se limpia al cambiar de ventana.
        window.addEventListener('blur', () => this.releaseAll());
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.releaseAll();
        });

        // El Gamepad API solo entrega datos si se consulta; el evento
        // 'gamepadconnected' es la pista de que hay uno.
        window.addEventListener('gamepadconnected', (e) => {
            this.pad = { index: e.gamepad.index, id: e.gamepad.id };
        });
        window.addEventListener('gamepaddisconnected', () => {
            this.pad = null;
            this._resetPad();
        });

        return this;
    }

    detach() {
        if (!this._bound) return this;
        this._bound = false;
        this._keys.clear();
        this.releaseAll();
        return this;
    }

    /** Apaga el teclado sin tocar el DOM (pausa, menu abierto...). */
    setEnabled(on) {
        this._enabled = !!on;
        if (!this._enabled) this._keys.clear();
        return this;
    }

    /** Cambia el mapa de teclado en caliente (lo llama el menu). */
    setBindings(map) {
        this.bindings = map;
        this.codeIndex = buildCodeIndex(map);
        this._keys.clear();
        return this;
    }

    /** Cambia el mapa del mando en caliente. */
    setPadMap(map) {
        this.padMap = map;
        this.padIndex = buildPadIndex(map);
        return this;
    }

    /** Mando conectado segun la Gamepad API, o null. */
    detectPad() {
        if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
        const pads = navigator.getGamepads();
        if (!pads) return null;
        for (let i = 0; i < pads.length; i++) {
            if (pads[i] && pads[i].connected) {
                this.pad = { index: i, id: pads[i].id };
                return this.pad;
            }
        }
        this.pad = null;
        return null;
    }

    // =======================================================================
    // TECLADO
    // =======================================================================

    _onKey(e, down) {
        this.lastKeyCode = e.code;

        // El menu de configuracion captura la tecla antes de llegar aqui.
        if (this._capturing) return;

        // Flechas y espacio mueven la pagina si no se absorben.
        if (down && (e.code.startsWith('Arrow') || e.code === 'Space')) {
            e.preventDefault();
        }

        if (down) this._keys.add(e.code);
        else this._keys.delete(e.code);
    }

    /**
     * Para que el menu de configuracion intercepte la proxima tecla.
     * @param fn  recibe el code y devuelve true si la consume
     */
    captureNextKey(fn) {
        this._capturing = fn;
        return () => { this._capturing = null; };
    }

    // =======================================================================
    // MANDO
    // =======================================================================

    _pollPad() {
        if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
        const pads = navigator.getGamepads();
        if (!pads) return;

        const pad = this.pad ? pads[this.pad.index] : null;
        if (!pad || !pad.connected) {
            this._resetPad();
            return;
        }

        const b = pad.buttons;
        const on = i => !!(b[i] && b[i].pressed);

        // Botones de combate por indice.
        for (const action of ['attack1', 'attack2', 'block', 'action']) {
            const idxs = this.padMap[action] || [];
            this._pad[action] = idxs.some(on);
        }

        // Cruceta: primero los botones digitales, y si no hay cruceta en el
        // mando, el stick izquierdo. Asi funcionan ambos tipos de mando.
        const dpad = this._padDpad;
        dpad.up = (this.padMap.up || []).some(on);
        dpad.down = (this.padMap.down || []).some(on);
        dpad.left = (this.padMap.left || []).some(on);
        dpad.right = (this.padMap.right || []).some(on);

        const ax = pad.axes[0] || 0;
        const ay = pad.axes[1] || 0;
        if (!dpad.left && ax < -STICK_DEADZONE) dpad.left = true;
        if (!dpad.right && ax > STICK_DEADZONE) dpad.right = true;
        if (!dpad.up && ay < -STICK_DEADZONE) dpad.up = true;
        if (!dpad.down && ay > STICK_DEADZONE) dpad.down = true;
    }

    _resetPad() {
        for (const k of ['attack1', 'attack2', 'block', 'action']) this._pad[k] = false;
        for (const k of ['up', 'down', 'left', 'right']) this._padDpad[k] = false;
    }

    // =======================================================================
    // ESTADO UNIFICADO
    // =======================================================================

    /**
     * Actualiza `dpad` y `buttons` con la OR de las tres fuentes.
     * Se llama una vez por frame, justo antes de leer el estado.
     */
    sync() {
        this._pollPad();

        const t = this.touch;

        // ---- teclado -> acciones ----
        const kUp = this._pressedAny(['up']);
        const kDown = this._pressedAny(['down']);
        const kLeft = this._pressedAny(['left']);
        const kRight = this._pressedAny(['right']);

        // ---- union de movimiento ----
        const up = kUp || this._padDpad.up || t.dpad.up || t.dpad.upLeft || t.dpad.upRight;
        const down = kDown || this._padDpad.down || t.dpad.down || t.dpad.downLeft || t.dpad.downRight;
        const left = kLeft || this._padDpad.left || t.dpad.left || t.dpad.upLeft || t.dpad.downLeft;
        const right = kRight || this._padDpad.right || t.dpad.right || t.dpad.upRight || t.dpad.downRight;

        const d = this.dpad;
        d.up = up; d.down = down; d.left = left; d.right = right;

        // Diagonales DERIVADAS de las cuatro basicas. Asi el InputMapper ve
        // una diagonal de verdad venga de donde venga, y las ocho casillas
        // del dpad tactil siguen funcionando.
        d.upLeft = up && left;
        d.upRight = up && right;
        d.downLeft = down && left;
        d.downRight = down && right;

        // ---- union de combate ----
        const bt = this.buttons;
        bt.attack1 = this._pressedAny(['attack1']) || this._pad.attack1 || t.buttons.attack1;
        bt.attack2 = this._pressedAny(['attack2']) || this._pad.attack2 || t.buttons.attack2;
        bt.block = this._pressedAny(['block']) || this._pad.block || t.buttons.block;
        bt.action = this._pressedAny(['action']) || this._pad.action || t.buttons.action;

        return this;
    }

    _pressedAny(actions) {
        for (const action of actions) {
            for (const code of (this.bindings[action] || [])) {
                if (this._keys.has(code)) return true;
            }
        }
        return false;
    }

    /** Suelta todo (blur, pausa, cambio de round). */
    releaseAll() {
        this._keys.clear();
        this._resetPad();
        for (const k of ALL_ACTIONS) {
            this.dpad[k] = false;
        }
        for (const k of ['attack1', 'attack2', 'block', 'action']) {
            this.buttons[k] = false;
        }
    }

    /**
     * Suelta tambien el tactil: al perder el foco con el dedo encima, el
     * pointerup no se dispara y el boton se queda pulsado.
     */
    releaseTouch() {
        if (!this.touch) return this;
        for (const k of Object.keys(this.touch.dpad)) this.touch.dpad[k] = false;
        for (const k of Object.keys(this.touch.buttons)) this.touch.buttons[k] = false;
        return this;
    }

    /**
     * Objeto con la forma que espera `InputMapper.snapshot`. Se mantiene
     * `touchControls` como alias por si algo todavia lo usa.
     */
    get touchControls() {
        return this;
    }
}

export default InputRouter;
