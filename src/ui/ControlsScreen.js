/**
 * ============================================================================
 * SANPABLERA ENGINE · ui/ControlsScreen.js
 * ----------------------------------------------------------------------------
 * MENU PARA CONFIGURAR TECLADO Y MANDO.
 *
 * QUE HAY AQUI
 * ----------------------------------------------------------------------------
 *   Una pantalla con las ocho acciones de combate. Pulsas una fila, pulsa la
 *   tecla (o el boton del mando) y queda asignada. Como una tecla no puede
 *   hacer dos cosas a la vez, asignarla la QUITA de donde estuviera: no hay
 *   silencios raros por duplicados.
 *
 *   Abajo: detecta el mando (asi se ve el nombre del mando por Bluetooth que
 *   tenga conectado), un boton para probarlo y otro para volver al layout de
 *   fabrica.
 *
 *   Se usa como promesa, igual que las demas pantallas:
 *     await new ControlsScreen(router).open();
 * ============================================================================
 */

import {
    ALL_ACTIONS, MOVE_ACTIONS, ACTION_LABELS,
    keyLabel, padLabel, defaultBindings, claimCode, saveBindings
} from './ControlsSettings.js';

const CSS = `\
.spf-ctl{position:fixed;inset:0;z-index:120;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:clamp(10px,2vh,18px);background:radial-gradient(1100px 650px at 50% 25%,#1d2230 0%,#0b0e14 72%);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#e8e8ee;user-select:none;padding:18px;overflow:auto}\
.spf-ctl-title{font-size:clamp(15px,3.4vh,24px);letter-spacing:5px;font-weight:800;text-shadow:0 2px 0 rgba(0,0,0,.6)}\
.spf-ctl-sub{font-size:clamp(9px,1.9vh,12px);letter-spacing:2px;color:#8c93ad;text-transform:uppercase;text-align:center;line-height:1.6;max-width:min(620px,92vw)}\
.spf-ctl-grid{display:grid;grid-template-columns:1fr 1fr;gap:clamp(6px,1.4vh,11px);width:min(660px,94vw)}\
.spf-ctl-col{display:flex;flex-direction:column;gap:clamp(4px,1vh,8px)}\
.spf-ctl-head{font-size:clamp(9px,1.8vh,11px);letter-spacing:2px;color:#7d84a3;text-transform:uppercase;padding:2px 4px}\
.spf-ctl-row{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#171b26;border:1px solid #262c3d;border-radius:5px;padding:clamp(6px,1.3vh,10px) 12px;cursor:pointer;font:inherit;color:#dfe2ee;text-align:left}\
.spf-ctl-row:hover{border-color:#4d8cff;background:#1c2230}\
.spf-ctl-row:focus-visible{outline:3px solid #f2de8c;outline-offset:2px}\
.spf-ctl-row.listening{border-color:#f2de8c;background:#2a2718;animation:spf-pulse .7s ease-in-out infinite alternate}\
@keyframes spf-pulse{from{box-shadow:0 0 0 rgba(242,222,140,0)}to{box-shadow:0 0 14px rgba(242,222,140,.45)}}\
.spf-ctl-name{font-size:clamp(11px,2.2vh,14px);letter-spacing:.5px}\
.spf-ctl-key{font-size:clamp(10px,2vh,13px);font-weight:700;color:#0f1219;background:linear-gradient(180deg,#f2de8c,#d9b84a);border-radius:3px;padding:.25em .7em;min-width:3.2em;text-align:center;white-space:nowrap}\
.spf-ctl-key.empty{background:#2c3242;color:#7d84a3}\
.spf-ctl-row.listening .spf-ctl-key{background:linear-gradient(180deg,#ffe9a3,#f2c94c)}\
.spf-ctl-foot{display:flex;gap:clamp(8px,1.6vw,16px);flex-wrap:wrap;justify-content:center;align-items:center;margin-top:clamp(4px,1vh,10px)}\
.spf-ctl-btn{font:inherit;font-size:clamp(10px,2vh,13px);letter-spacing:2px;font-weight:700;color:#e8e8ee;background:#232838;border:1px solid #3a4258;border-radius:5px;padding:.6em 1.5em;cursor:pointer}\
.spf-ctl-btn:hover{border-color:#4d8cff;background:#2a3145}\
.spf-ctl-btn.primary{color:#10131a;background:linear-gradient(180deg,#f2de8c,#d9b84a);border-color:#8f7a2a;font-weight:800}\
.spf-ctl-btn:active{transform:translateY(1px)}\
.spf-ctl-pad{font-size:clamp(9px,1.8vh,12px);color:#9aa1bd;letter-spacing:1px;text-align:center;min-height:1.5em;line-height:1.6}\
.spf-ctl-pad b{color:#7fe0a0}\
.spf-ctl-msg{font-size:clamp(10px,2vh,13px);letter-spacing:1px;color:#f2de8c;min-height:1.4em;text-align:center}`;

let STYLE = null;
function ensureStyles() {
    if (STYLE) return;
    STYLE = document.createElement('style');
    STYLE.id = 'spf-ctl-style';
    STYLE.textContent = CSS;
    document.head.appendChild(STYLE);
}

export class ControlsScreen {
    /**
     * @param router  el InputRouter vivo: se reconfigura en caliente
     */
    constructor(router) {
        this.router = router;
        this.map = router.bindings;
        this.mapPad = router.padMap;
        /** Fila esperando pulsacion, o null. */
        this.listening = null;
        this.element = null;
        this._rows = new Map();
        this._keyEl = null;
        this._padEl = null;
        this._msgEl = null;
        this._keyHandler = null;
        this._padHandler = null;
        this._padTimer = null;
        this._onPadChange = null;
    }

    /** Muestra la pantalla y resuelve cuando el usuario la cierra. */
    open() {
        ensureStyles();
        this.build();

        return new Promise((resolve) => {
            this._onPadChange = () => this.updatePadLabel();
            this.router.setEnabled(false);
            this.router.releaseAll();

            this.keyHandler = (e) => {
                if (this.listening) return;      // el foco esta en una fila
                if (e.code === 'Escape') { e.preventDefault(); this.close(resolve); return; }
                if (e.code === 'Enter') { e.preventDefault(); this.close(resolve); return; }
            };
            window.addEventListener('keydown', this.keyHandler, true);

            this._padTimer = setInterval(() => this.pollPad(), 120);
            this.pollPad();
            this.updatePadLabel();
        });
    }

    close(resolve) {
        clearInterval(this._padTimer);
        if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler, true);
        if (this._padEl) {
            this._padEl.removeEventListener('gamepadconnected', this._onPadChange);
            this._padEl.removeEventListener('gamepaddisconnected', this._onPadChange);
        }
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        this._bound = false;
        this.router.setEnabled(true);
        if (typeof resolve === 'function') resolve();
    }

    // =======================================================================
    // CONSTRUCCION
    // =======================================================================

    build() {
        const root = document.createElement('div');
        root.className = 'spf-ctl';
        this.element = root;

        const title = document.createElement('div');
        title.className = 'spf-ctl-title';
        title.textContent = 'CONTROLES';
        root.appendChild(title);

        const sub = document.createElement('div');
        sub.className = 'spf-ctl-sub';
        sub.textContent = 'Pulsa una accion y luego la tecla. ' +
            'Las flechas y WASD tambien sirven.';
        root.appendChild(sub);

        // ---- rejilla de acciones ----
        const grid = document.createElement('div');
        grid.className = 'spf-ctl-grid';

        const colMove = document.createElement('div');
        colMove.className = 'spf-ctl-col';
        colMove.appendChild(this.head('Movimiento'));

        const colFight = document.createElement('div');
        colFight.className = 'spf-ctl-col';
        colFight.appendChild(this.head('Combate'));

        this._rows.clear();
        for (const action of ALL_ACTIONS) {
            const row = this.row(action);
            (MOVE_ACTIONS.includes(action) ? colMove : colFight).appendChild(row);
        }

        grid.appendChild(colMove);
        grid.appendChild(colFight);
        root.appendChild(grid);

        // ---- mando ----
        this._padEl = document.createElement('div');
        this._padEl.className = 'spf-ctl-pad';
        this._padEl.textContent = 'Mando: buscando...';
        root.appendChild(this._padEl);
        this._padEl.addEventListener('gamepadconnected', this._onPadChange);
        this._padEl.addEventListener('gamepaddisconnected', this._onPadChange);

        // ---- aviso ----
        this._msgEl = document.createElement('div');
        this._msgEl.className = 'spf-ctl-msg';
        root.appendChild(this._msgEl);

        // ---- botones ----
        const foot = document.createElement('div');
        foot.className = 'spf-ctl-foot';

        const defaults = document.createElement('button');
        defaults.className = 'spf-ctl-btn';
        defaults.textContent = 'RESTABLECER';
        defaults.addEventListener('click', () => {
            this.map = defaultBindings();
            this.router.setBindings(this.map);
            saveBindings(this.map);
            this.refreshAll();
            this.say('Mapeo de fabrica restaurado.');
        });
        foot.appendChild(defaults);

        const back = document.createElement('button');
        back.className = 'spf-ctl-btn primary';
        back.textContent = 'GUARDAR Y VOLVER';
        back.addEventListener('click', () => {
            saveBindings(this.map);
            this.close(this._resolve);
        });
        foot.appendChild(back);

        root.appendChild(foot);

        document.body.appendChild(root);
        back.focus();
    }

    head(text) {
        const h = document.createElement('div');
        h.className = 'spf-ctl-head';
        h.textContent = text;
        return h;
    }

    row(action) {
        const el = document.createElement('button');
        el.className = 'spf-ctl-row';
        el.type = 'button';

        const name = document.createElement('span');
        name.className = 'spf-ctl-name';
        name.textContent = ACTION_LABELS[action] || action;

        const key = document.createElement('span');
        key.className = 'spf-ctl-key';

        el.appendChild(name);
        el.appendChild(key);
        this._rows.set(action, { el, key });
        this.updateRow(action);

        el.addEventListener('click', () => this.startListening(action));
        return el;
    }

    // =======================================================================
    // ASIGNACION
    // =======================================================================

    startListening(action) {
        this.stopListening();
        this.listening = action;
        const row = this._rows.get(action);
        row.el.classList.add('listening');
        row.key.textContent = 'pulsar...';
        row.el.focus();

        // El teclado lo captura el router, asi que le pedimos que nos pase la
        // proxima tecla en vez de advertiserla en el estado de juego.
        this._capturing = this.router.captureNextKey((code) => {
            this.assign(action, code);
            return true;
        });

        this.say('Esperando tecla para ' + (ACTION_LABELS[action] || action) + '...');
    }

    stopListening() {
        if (this._capturing) { this._capturing(); this._capturing = null; }
        if (this.listening) {
            const row = this._rows.get(this.listening);
            if (row) row.el.classList.remove('listening');
            this.updateRow(this.listening);
        }
        this.listening = null;
    }

    assign(action, code) {
        // Escape mientras escucha significa "dejarlo como estaba".
        if (code === 'Escape') {
            this.say('Asignacion cancelada.');
            this.stopListening();
            return;
        }
        claimCode(this.map, code, action);
        this.router.setBindings(this.map);
        saveBindings(this.map);
        this.updateAll();
        this.say((ACTION_LABELS[action] || action) + ' = ' + keyLabel(code));
        this.stopListening();
    }

    // =======================================================================
    // LECTURA DEL MANDO
    // =======================================================================

    pollPad() {
        if (this.listening) {
            // Al esperar un boton, cualquier pulsacion nueva del mando manda.
            const pads = navigator.getGamepads ? navigator.getGamepads() : [];
            const pad = pads && pads[0];
            if (pad && pad.connected) {
                for (let i = 0; i < pad.buttons.length; i++) {
                    const b = pad.buttons[i];
                    const was = this._padPrev[i];
                    if (b && b.pressed && !was) {
                        const action = this.listening;
                        this.assignPad(action, i);
                        return;
                    }
                }
                this._padPrev = pad.buttons.map(b => !!(b && b.pressed));
            }
        }
    }

    assignPad(action, index) {
        if (index < 4 || (index >= 12 && index <= 15)) {
            // Cruceta y cara: son direcciones, no acciones de combate.
            const dirs = { 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
            if (action === 'up' || action === 'down' || action === 'left' || action === 'right') {
                const code = dirs[index];
                if (code) { this.assign(action, code); return; }
            }
        }
        this.mapPad[action] = [index];
        this.router.setPadMap(this.mapPad);
        this.updatePadRow(action);
        this.say((ACTION_LABELS[action] || action) + ' = ' + padLabel(index) + ' (mando)');
        this.stopListening();
    }

    // =======================================================================
    // PINTADO
    // =======================================================================

    updateRow(action) {
        const row = this._rows.get(action);
        if (!row) return;
        const codes = this.map[action] || [];
        row.key.textContent = codes.length ? codes.map(keyLabel).join(' / ') : '--';
        row.key.classList.toggle('empty', codes.length === 0);
    }

    updatePadRow(action) {
        const row = this._rows.get(action);
        if (!row) return;
        const btns = this.mapPad[action] || [];
        row.el.title = 'Mando: ' + (btns.length ? btns.map(padLabel).join(' / ') : '--');
    }

    updateAll() {
        for (const action of ALL_ACTIONS) {
            this.updateRow(action);
            this.updatePadRow(action);
        }
    }

    refreshAll() { this.updateAll(); }

    updatePadLabel() {
        if (!this._padEl) return;
        const pad = this.router.detectPad();
        if (pad) {
            const short = String(pad.id).slice(0, 46);
            this._padEl.innerHTML = 'Mando: <b>conectado</b> · ' + escapeHtml(short) +
                ' <br>Pulsa una accion y luego un boton del mando para asignarlo.';
        } else {
            this._padEl.innerHTML = 'Mando: <b>ninguno</b> · pulsa A para emparejarlo, ' +
                'luego pulsalo otra vez.<br>El teclado funciona siempre.';
        }
    }

    say(text) {
        if (this._msgEl) this._msgEl.textContent = text;
    }
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

export default ControlsScreen;
