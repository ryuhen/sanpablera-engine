/**
 * ============================================================================
 * SANPABLERA ENGINE · ui/SelectScreen.js
 * ----------------------------------------------------------------------------
 * Pantalla de seleccion de PELEADOR, tipo panal: 8 celdas hexagonales con el
 * color y el nombre de cada personaje del roster.
 *
 * FLUJO
 *   P1 elige primero (cursor azul) y P2 despues (cursor rojo). Cuando los dos
 *   estan marcados aparece el boton COMBATE. Tambien se puede jugar 100% por
 *   teclado: flechas para moverse por el panal, Enter para marcar y volver a
 *   pulsar Enter para confirmar el combate.
 *
 *   Se usa como promesa: const { p1, p2 } = await new SelectScreen({...}).pick();
 * ============================================================================
 */

import { ROSTER } from '../core/roster.js';

const COLS = 4;

const SELECT_CSS = `\
.spf-select{position:fixed;inset:0;z-index:90;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:clamp(12px,3vh,26px);background:radial-gradient(1200px 700px at 50% 20%,#232837 0%,#0d1017 70%);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#e8e8ee;user-select:none;padding:20px;overflow:hidden}\
.spf-select::before{content:'';position:absolute;inset:0;opacity:.35;background-image:linear-gradient(30deg,#ffffff10 12%,transparent 12.5%,transparent 87%,#ffffff10 87.5%),linear-gradient(150deg,#ffffff10 12%,transparent 12.5%,transparent 87%,#ffffff10 87.5%);background-size:46px 80px}\
.spf-select-title{font-size:clamp(16px,4vh,26px);letter-spacing:6px;font-weight:800;color:#f4f4f8;text-shadow:0 2px 0 rgba(0,0,0,.6)}\
.spf-select-subtitle{font-size:clamp(10px,2.2vh,13px);letter-spacing:3px;color:#8c93ad;text-transform:uppercase}\
.spf-select-grid{display:grid;grid-template-columns:repeat(4,clamp(84px,17vw,140px));gap:clamp(6px,1.6vh,12px) clamp(8px,1.2vw,16px)}\
.spf-select-cell{display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;background:none;border:none;padding:0;color:inherit;font-family:inherit}\
.spf-select-hex{width:100%;aspect-ratio:1/0.98;clip-path:polygon(25% 0%,75% 0%,100% 50%,75% 100%,25% 100%,0% 50%);position:relative;overflow:hidden;transition:transform .08s linear;border:none}\
.spf-select-hex::before{content:'';position:absolute;inset:0;background:linear-gradient(145deg,var(--hex) 0%,#14171f 130%);box-shadow:inset 0 0 0 2px rgba(255,255,255,.18)}\
.spf-select-hex::after{content:'';position:absolute;inset:8% 14%;background:linear-gradient(145deg,rgba(255,255,255,.32),rgba(255,255,255,.02));clip-path:polygon(25% 0%,75% 0%,100% 50%,75% 100%,25% 100%,0% 50%);opacity:.5}\
.spf-select-cell:hover .spf-select-hex{transform:scale(1.06)}\
.spf-select-cell:focus-visible .spf-select-hex{outline:3px solid #fff;outline-offset:2px}\
.spf-select-name{font-size:clamp(10px,2vw,13px);font-weight:700;letter-spacing:1px}\
.spf-select-tag{font-size:clamp(8px,1.6vh,10px);color:#8c93ad;letter-spacing:.5px;text-align:center}\
.spf-select-hex.pick1{filter:drop-shadow(0 0 10px #4d8cff)}\
.spf-select-hex.pick1::before{box-shadow:inset 0 0 0 2px #4d8cff}\
.spf-select-hex.pick2{filter:drop-shadow(0 0 10px #ff5a4e)}\
.spf-select-hex.pick2::before{box-shadow:inset 0 0 0 2px #ff5a4e}\
.spf-select-hint{font-size:clamp(11px,2.3vh,14px);letter-spacing:1px;color:#c7cbe0;min-height:1.4em;text-align:center}\
.spf-select-start{font-size:clamp(13px,3vh,17px);letter-spacing:4px;font-weight:800;color:#10131a;background:linear-gradient(180deg,#f2de8c,#d9b84a);border:none;border-radius:6px;padding:.7em 2.2em;cursor:pointer;font-family:inherit;box-shadow:0 4px 0 #8f7a2a;transform:translateY(0);opacity:0;pointer-events:none}\
.spf-select-start.ready{opacity:1;pointer-events:auto}\
.spf-select-start:active{transform:translateY(2px);box-shadow:0 2px 0 #8f7a2a}`;

let SELECT_STYLE = null;
function ensureStyles() {
    if (SELECT_STYLE) return;
    const tag = document.createElement('style');
    tag.id = 'spf-select-style';
    tag.textContent = SELECT_CSS;
    document.head.appendChild(tag);
    SELECT_STYLE = tag;
}

class SelectScreen {
    /**
     * @param {object} [opts] { roster } (por defecto ROSTER)
     */
    constructor(opts = {}) {
        this.roster = opts.roster || ROSTER;
        this.pick1 = null;
        this.pick2 = null;
        this.turn = 0;          // 0 = P1, 1 = P2
        this.index = 0;         // celda enfocada con teclado
        this.root = null;
        this.tiles = [];
        this.cells = [];
    }

    /** Muestra el menu y devuelve una promesa { p1, p2 } al confirmar. */
    pick() {
        ensureStyles();
        this.build();
        return new Promise((resolve) => {
            this.resolve = resolve;
        });
    }

    build() {
        const root = document.createElement('div');
        root.className = 'spf-select';
        root.innerHTML = `
            <div class="spf-select-title">ELIGE TU COMBATIENTE</div>
            <div class="spf-select-subtitle">los ocho del dojo</div>
        `;
        const grid = document.createElement('div');
        grid.className = 'spf-select-grid';

        this.roster.forEach((fighter, i) => {
            const cell = document.createElement('button');
            cell.className = 'spf-select-cell';
            cell.type = 'button';
            cell.dataset.index = String(i);

            const hex = document.createElement('span');
            hex.className = 'spf-select-hex';
            hex.style.setProperty('--hex', fighter.hex);

            const name = document.createElement('span');
            name.className = 'spf-select-name';
            name.textContent = fighter.name;

            const tag = document.createElement('span');
            tag.className = 'spf-select-tag';
            tag.textContent = fighter.tag;

            cell.appendChild(hex);
            cell.appendChild(name);
            cell.appendChild(tag);
            cell.addEventListener('click', () => this.pickSlot(i));
            grid.appendChild(cell);
            this.tiles.push(hex);
            this.cells.push(cell);
        });

        const hint = document.createElement('div');
        hint.className = 'spf-select-hint';
        hint.id = 'spf-select-hint';
        this.hint = hint;

        const start = document.createElement('button');
        start.className = 'spf-select-start';
        start.textContent = 'COMBATE';
        start.addEventListener('click', () => this.confirm());
        this.start = start;

        root.appendChild(grid);
        root.appendChild(hint);
        root.appendChild(start);
        document.body.appendChild(root);
        this.root = root;

        this.cells[0].focus();
        this.refresh();
        this._onKey = (e) => this.onKey(e);
        document.addEventListener('keydown', this._onKey);
    }

    pickSlot(index) {
        const fighter = this.roster[index];
        if (!fighter) return;
        if (this.turn === 0) {
            this.pick1 = fighter;
            this.turn = 1;
        } else {
            this.pick2 = fighter;
        }
        this.refresh();
    }

    refresh() {
        this.tiles.forEach((hex, i) => {
            const isP1 = this.pick1 && this.roster[i].id === this.pick1.id;
            const isP2 = this.pick2 && this.roster[i].id === this.pick2.id;
            hex.classList.toggle('pick1', !!isP1);
            hex.classList.toggle('pick2', !!isP2);
        });

        if (!this.pick1) {
            this.hint.textContent = 'P1 · elige tu peleador';
        } else if (!this.pick2) {
            this.hint.textContent = 'P2 · elige tu peleador';
        } else {
            this.hint.textContent = `${this.pick1.name} vs ${this.pick2.name} · pulsa COMBATE`;
        }

        const ready = !!(this.pick1 && this.pick2);
        this.start.classList.toggle('ready', ready);
        if (ready) this.cells[this.index].blur();
    }

    onKey(e) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const row = Math.floor(this.index / COLS);
            const col = this.index % COLS;
            const rows = Math.ceil(this.roster.length / COLS);
            let nrow = row, ncol = col;
            if (e.key === 'ArrowLeft') ncol = Math.max(0, col - 1);
            if (e.key === 'ArrowRight') ncol = Math.min(COLS - 1, col + 1);
            if (e.key === 'ArrowUp') nrow = Math.max(0, row - 1);
            if (e.key === 'ArrowDown') nrow = Math.min(rows - 1, row + 1);
            this.index = nrow * COLS + ncol;
            this.cells[this.index]?.focus();
            return;
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            if (!(this.pick1 && this.pick2)) {
                this.pickSlot(this.index);
                // Si ya estan los dos, el siguiente Enter dispara el combate.
                if (this.pick1 && this.pick2) this.start.focus();
            } else {
                this.confirm();
            }
        }
    }

    confirm() {
        if (!this.pick1 || !this.pick2) return;
        document.removeEventListener('keydown', this._onKey);
        this.root.classList.add('leaving');
        setTimeout(() => this.destroy(), 240);
        if (this.resolve) this.resolve({ p1: this.pick1, p2: this.pick2 });
    }

    destroy() {
        document.removeEventListener('keydown', this._onKey);
        if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
        this.root = null;
    }
}

export default SelectScreen;