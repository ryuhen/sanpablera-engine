/**
 * ============================================================================
 * SANPABLERA ENGINE · ui/ModeSelect.js
 * ----------------------------------------------------------------------------
 * MENU DE MODO, justo despues de elegir peleadores.
 *
 *   const { modo } = await new ModeSelect().pick();
 *
 * Los cuatro modos son los que pide la Biblia Apex Primal: pelea suelta,
 * maqueta del Caribe, Battle Royale local y campana del Cuarteto. La pantalla
 * solo decide el MODO; las reglas viven en core/ y se testsan en Node.
 * ============================================================================
 */

export const MODES = Object.freeze([
    Object.freeze({
        id: 'CLASICO', nombre: 'PELEA CLASICA',
        nota: 'Un duelo en el dojo. Como siempre se ha jugado.'
    }),
    Object.freeze({
        id: 'DIORAMA', nombre: 'MAQUETA DEL CARIBE',
        nota: 'La isla en miniatura: elige un pueblo y salta a su tatami.'
    }),
    Object.freeze({
        id: 'ROYALE', nombre: 'BATTLE ROYALE',
        nota: 'Hasta cuatro peleadores, relevos y botin. Ultimo en pie gana.'
    }),
    Object.freeze({
        id: 'CAMPAÑA', nombre: 'EL CUARTETO DE CARIBE',
        nota: 'Ciclos que cambian la historia. Secretos que quedan guardados.'
    })
]);

const CSS = `\
.spf-mode{position:fixed;inset:0;z-index:94;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:clamp(8px,2vh,16px);background:radial-gradient(900px 620px at 50% 32%,#17233d 0%,#070a12 78%);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#f2ead4;user-select:none;padding:14px}\
.spf-mode-title{font-size:clamp(16px,4vh,26px);letter-spacing:6px;font-weight:800;text-shadow:0 2px 0 #000}\
.spf-mode-sub{font-size:clamp(9px,1.8vh,12px);letter-spacing:3px;color:#9fb0d0;text-transform:uppercase;text-align:center}\
.spf-mode-list{display:flex;flex-direction:column;gap:8px;width:min(560px,90vw)}\
.spf-mode-row{display:flex;flex-direction:column;gap:3px;text-align:left;background:#111a2e;border:2px solid #31405e;border-radius:6px;color:#e8dfc8;padding:.7em 1em;font:inherit;cursor:pointer}\
.spf-mode-row:hover{border-color:#f2de8c}\
.spf-mode-row.on{border-color:#ffc72c;background:#1b2947;box-shadow:0 0 18px rgba(255,199,44,.25)}\
.spf-mode-name{font-size:clamp(12px,2.6vh,16px);letter-spacing:3px;font-weight:800}\
.spf-mode-note{font-size:clamp(9px,1.7vh,11px);color:#9fb0d0}\
.spf-mode-go{font-size:clamp(12px,2.6vh,15px);letter-spacing:4px;font-weight:800;color:#10131a;background:#f2de8c;border:none;border-radius:6px;padding:.65em 2em;cursor:pointer;font-family:inherit}\
.spf-mode-key{font-size:10px;color:#7d8ba6;letter-spacing:2px}`;

let STYLE = null;
function ensureStyles() {
    if (STYLE) return;
    const tag = document.createElement('style');
    tag.id = 'spf-mode-style';
    tag.textContent = CSS;
    document.head.appendChild(tag);
    STYLE = tag;
}

export class ModeSelect {
    constructor(opts = {}) {
        this.modos = opts.modos || MODES;
        this.root = null;
        this.index = 0;
        this.resolve = null;
        this.onKey = null;
    }

    /** Muestra el menu y resuelve { modo, indice }. */
    pick() {
        // El resolve se guarda ANTES de construir: si un build() llegara a
        // confirmar de forma sincrona, la promesa ya tiene quien la cierre.
        return new Promise((resolve) => {
            this.resolve = resolve;
            ensureStyles();
            this.build();
            this.onKey = (e) => this._key(e);
            window.addEventListener('keydown', this.onKey);
        });
    }

    build() {
        const root = document.createElement('div');
        root.className = 'spf-mode';

        const title = document.createElement('div');
        title.className = 'spf-mode-title';
        title.textContent = 'ELIGE EL MODO';
        root.appendChild(title);

        const sub = document.createElement('div');
        sub.className = 'spf-mode-sub';
        sub.textContent = 'Apex Primal · Biblia de Diseno y Combate';
        root.appendChild(sub);

        const list = document.createElement('div');
        list.className = 'spf-mode-list';
        this.rows = [];
        this.modos.forEach((m, i) => {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'spf-mode-row' + (i === this.index ? ' on' : '');
            const name = document.createElement('span');
            name.className = 'spf-mode-name';
            name.textContent = m.nombre;
            const note = document.createElement('span');
            note.className = 'spf-mode-note';
            note.textContent = m.nota;
            row.appendChild(name);
            row.appendChild(note);
            row.addEventListener('click', () => { this.index = i; this.paint(); this.confirm(); });
            row.addEventListener('pointerenter', () => { this.index = i; this.paint(); });
            list.appendChild(row);
            this.rows.push(row);
        });
        root.appendChild(list);

        const go = document.createElement('button');
        go.className = 'spf-mode-go';
        go.type = 'button';
        go.textContent = 'EMPEZAR';
        go.addEventListener('click', () => this.confirm());
        root.appendChild(go);

        const key = document.createElement('div');
        key.className = 'spf-mode-key';
        key.textContent = 'SUBIR / BAJAR · ENTER · ESC = PELEA CLASICA';
        root.appendChild(key);

        document.body.appendChild(root);
        this.root = root;
        go.focus();
    }

    paint() {
        if (!this.rows) return;
        this.rows.forEach((r, i) => r.classList.toggle('on', i === this.index));
    }

    _key(e) {
        if (e.code === 'ArrowDown' || e.code === 'KeyS') {
            this.index = (this.index + 1) % this.modos.length;
            this.paint();
            e.preventDefault();
        } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
            this.index = (this.index - 1 + this.modos.length) % this.modos.length;
            this.paint();
            e.preventDefault();
        } else if (e.code === 'Enter' || e.code === 'Space') {
            this.confirm();
            e.preventDefault();
        } else if (e.code === 'Escape') {
            this.index = 0;
            this.confirm();
            e.preventDefault();
        }
    }

    confirm() {
        const done = this.resolve;
        if (!done) return;
        this.resolve = null;
        if (this.onKey) window.removeEventListener('keydown', this.onKey);
        this.onKey = null;
        const modo = this.modos[this.index];
        if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
        this.root = null;
        done({ modo: modo.id, indice: this.index });
    }
}

export default ModeSelect;
