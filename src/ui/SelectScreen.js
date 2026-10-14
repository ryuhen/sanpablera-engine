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
 *   La ultima celda es EL PELEADOR DEL JUGADOR (ver core/CustomFighter.js):
 *   con ella enfocada, R la RENOMBRA (el nombre se guarda en la memoria
 *   local de la maquina). Al enfocar cualquier celda se muestra su
 *   historia y su estilo de pelea.
 *
 *   Se usa como promesa: const { p1, p2 } = await new SelectScreen({...}).pick();
 * ============================================================================
 */

import { ROSTER, fullRoster } from '../core/roster.js';
import { renameCustomFighter } from '../core/CustomFighter.js';

// ===========================================================================
// ESTILO STREET FIGHTER II
// ---------------------------------------------------------------------------
// LO QUE SE HA COPIADO Y POR QUE, que es lo que hace que "parezca" de SFII y
// no sea solo "una rejilla con otros colores":
//
//   1. RETRATO EN MARCO, NO HEXAGONO. SFII no usa exagonos: son recuadros con
//      marco biselado y la foto dentro. Aqui tampoco hay fotos, asi que el
//      retrato es el color del peleador con sus iniciales, que es lo que
//      comunica "quien es" sin un asset que aqui no existe.
//   2. REJILLA DE 3. La de SFII es 3x3 y son nueve peleadores; aqui son nueve.
//      Ademas el titulo y el nombre abajo Obligation la misma lectura.
//   3. CARTEL DE NOMBRE ABAJO, en grande. Es el rasgo mas reconocible: el
//      nombre del que esta enfocado, escrito en mouldura, cambia al mover.
//   4. ROTULOS 1P / 2P en rojo y azul, como los marcadores del mando.
//   5. FONDO A BANDAS con lineas de barrido. SFII es de lectura y arcade: el
//      fondo no es liso, tiene bandas horizontales y un velo de scanlines.
//   6. ORO CON CONTORNO GRUESO en el titulo y el boton, que es como esta
//      dibujado el logo.
//
// NO se copia nada de Street Fighter: es la forma de la pantalla, no sus
// personajes ni sus logotipos.
// ===========================================================================
const COLS = 3;

const SELECT_CSS = `\
.spf-select{position:fixed;inset:0;z-index:90;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:clamp(5px,1.3vh,14px);font-family:'Arial Black','Arial Bold',Impact,system-ui,sans-serif;color:#fff;user-select:none;padding:clamp(8px,2vh,18px);overflow:hidden;background:linear-gradient(180deg,#0a1a4a 0%,#061033 45%,#03071c 100%)}\
.spf-select::before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.055) 0 2px,transparent 2px 7px);pointer-events:none}\
.spf-select::after{content:'';position:absolute;inset:0;background:linear-gradient(115deg,transparent 0 42%,rgba(255,255,255,.05) 42% 58%,transparent 58% 100%);pointer-events:none}\
.spf-select-title{position:relative;z-index:1;font-size:clamp(18px,5.2vh,40px);letter-spacing:2px;font-style:italic;font-weight:900;text-align:center;line-height:1;background:linear-gradient(180deg,#fff7cf 0%,#ffd447 42%,#e09a12 100%);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-stroke:clamp(1.5px,.42vh,3px) #7a1200;paint-order:stroke fill;text-shadow:0 3px 0 #7a1200,0 6px 12px rgba(0,0,0,.7)}\
.spf-select-subtitle{position:relative;z-index:1;font-size:clamp(9px,1.9vh,12px);letter-spacing:4px;color:#7ea6ff;text-transform:uppercase;text-shadow:0 2px 0 #001038}\
.spf-select-grid{position:relative;z-index:1;display:grid;grid-template-columns:repeat(3,clamp(62px,min(19vw,19vh),140px));gap:clamp(5px,1.2vh,10px)}\
.spf-select-cell{display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;background:none;border:none;padding:0;color:inherit;font-family:inherit}\
.spf-select-hex{position:relative;width:100%;aspect-ratio:1/1;border:3px solid #0b1a44;border-radius:3px;overflow:hidden;transition:transform .07s steps(2),border-color .12s linear;box-shadow:inset 0 0 0 2px #4a6bd6,3px 3px 0 rgba(0,0,0,.55)}\
.spf-select-hex::before{content:'';position:absolute;inset:0;background:linear-gradient(160deg,var(--hex) 0%,#101a3a 78%,#060a20 100%)}\
.spf-select-hex::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.34) 0 22%,transparent 55%);border-bottom:3px solid rgba(0,0,0,.45)}\
.spf-select-init{position:relative;z-index:2;display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:clamp(26px,6.4vh,52px);font-style:italic;font-weight:900;color:#fff;text-shadow:0 3px 0 #000,0 0 14px rgba(0,0,0,.75);letter-spacing:-1px}\
.spf-select-cell:hover .spf-select-hex{transform:translate(-1px,-1px) scale(1.05);border-color:#ffd447}\
.spf-select-cell:focus-visible{outline:none}\
.spf-select-cell:focus-visible .spf-select-hex{border-color:#ffd447;box-shadow:inset 0 0 0 2px #fff,0 0 16px #ffd447}\
.spf-select-name{position:relative;z-index:1;font-size:clamp(9px,1.9vh,13px);font-weight:900;letter-spacing:.5px;text-shadow:0 2px 0 #001038;white-space:nowrap}\
.spf-select-tag{position:relative;z-index:1;font-size:clamp(7px,1.4vh,10px);letter-spacing:.5px;text-align:center;color:#9db9ff;text-shadow:0 1px 0 #001038;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\
.spf-select-hex.pick1{border-color:#2f6bff;box-shadow:inset 0 0 0 2px #fff,0 0 18px #2f6bff}\
.spf-select-hex.pick2{border-color:#ff3b30;box-shadow:inset 0 0 0 2px #fff,0 0 18px #ff3b30}\
.spf-select-badge{position:absolute;z-index:3;top:2px;left:3px;font-size:clamp(9px,1.9vh,13px);font-weight:900;font-style:italic;letter-spacing:.5px;text-shadow:0 2px 0 #000;opacity:0}\
.spf-select-hex.pick1 .spf-select-badge{opacity:1;color:#6ea2ff}\
.spf-select-hex.pick2 .spf-select-badge{opacity:1;color:#ff6a60}\
.spf-select-banner{position:relative;z-index:1;min-height:1.5em;display:flex;align-items:center;justify-content:center;padding:.12em 1.4em;background:linear-gradient(180deg,#f5f7ff 0%,#c3cdf2 48%,#7f8fc9 52%,#e8ecff 100%);border:3px solid #101a3a;box-shadow:0 4px 0 #001038,inset 0 0 0 2px #fff;font-size:clamp(13px,3.4vh,26px);font-style:italic;font-weight:900;letter-spacing:1px;color:#101a3a;text-shadow:0 1px 0 #fff;white-space:nowrap}\
.spf-select-hint{position:relative;z-index:1;font-size:clamp(10px,2vh,13px);font-weight:900;letter-spacing:2px;color:#ffd447;text-shadow:0 2px 0 #001038;min-height:1.3em;text-align:center}\
.spf-select-info{position:relative;z-index:1;font-size:clamp(8px,1.7vh,12px);font-weight:400;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#c3d2ff;letter-spacing:.3px;text-align:center;max-width:min(720px,92vw);min-height:2.6em;line-height:1.5;text-shadow:0 1px 0 #001038}\
.spf-select-info b{color:#fff}\
.spf-select-info i{color:#8fa8dd}\
.spf-select-info u{color:#ffd447;text-decoration:none}\
.spf-select-start{position:relative;z-index:1;font-size:clamp(13px,3vh,20px);letter-spacing:3px;font-style:italic;font-weight:900;color:#5b1000;background:linear-gradient(180deg,#fff3b8 0%,#ffc72c 45%,#e08b00 100%);border:3px solid #5b1000;border-radius:0;padding:.45em 1.9em;cursor:pointer;font-family:inherit;box-shadow:0 5px 0 #5b1000,0 0 22px rgba(255,190,40,.5);text-shadow:0 1px 0 #fff6c9;opacity:0;pointer-events:none;transform:translateY(0)}\
.spf-select-start.ready{opacity:1;pointer-events:auto;animation:spf-blink 1.05s steps(1,end) infinite}\
.spf-select-start:active{transform:translateY(3px);box-shadow:0 2px 0 #5b1000}\
@keyframes spf-blink{0%,60%{filter:brightness(1)}61%,100%{filter:brightness(1.55)}}`;

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
        this.roster = opts.roster || fullRoster();
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
            <div class="spf-select-subtitle">street fighter</div>
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

            // Sin retratos dibujados, el "retrato" es la inicial sobre el color
            // del peleador. Es lo que comunica quien es sin un asset que aqui no
            // existe, y es lo que hace que la rejilla se lea de un vistazo.
            const init = document.createElement('span');
            init.className = 'spf-select-init';
            init.textContent = (fighter.name || '?').trim().charAt(0).toUpperCase();
            hex.appendChild(init);

            const badge = document.createElement('span');
            badge.className = 'spf-select-badge';
            badge.textContent = '1P';
            hex.appendChild(badge);

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
            cell.addEventListener('mouseenter', () => {
                this.index = i;
                this.showInfo(i);
                this.refreshBanner();
            });
            grid.appendChild(cell);
            this.tiles.push(hex);
            this.cells.push(cell);
        });

        // El cartel de nombre: el rasgo mas reconocible de la pantalla. Muestra
        // el peleador ENFOCADO y cambia al mover el cursor.
        const banner = document.createElement('div');
        banner.className = 'spf-select-banner';
        this.banner = banner;

        const hint = document.createElement('div');
        hint.className = 'spf-select-hint';
        hint.id = 'spf-select-hint';
        this.hint = hint;

        // Historia y estilo del peleador enfocado: la
        // personalidad de cada uno, en una linea.
        const info = document.createElement('div');
        info.className = 'spf-select-info';
        info.id = 'spf-select-info';
        this.info = info;

        const start = document.createElement('button');
        start.className = 'spf-select-start';
        start.textContent = 'COMBATE';
        start.addEventListener('click', () => this.confirm());
        this.start = start;

        root.appendChild(grid);
        root.appendChild(banner);
        root.appendChild(hint);
        root.appendChild(info);
        root.appendChild(start);
        document.body.appendChild(root);
        this.root = root;

        this.cells[0].focus();
        this.refresh();
        this.showInfo(0);
        this.refreshBanner();
        this._onKey = (e) => this.onKey(e);
        document.addEventListener('keydown', this._onKey);
    }

    /**
     * Panel de historia: nombre, etiqueta, estilo y la
     * historia del peleador enfocado. La celda del jugador
     * ademas avisa que se puede renombrar (R).
     */
    showInfo(index) {
        if (!this.info) return;
        this.refreshBanner(index);
        const fighter = this.roster[index];
        if (!fighter) { this.info.textContent = ''; return; }
        const rename = fighter.custom
            ? ' · <u>[R] renombrar</u>'
            : '';
        this.info.innerHTML =
            `<b>${fighter.name}</b> — ${fighter.tag}${rename}<br>` +
            `<i>${fighter.style || ''}</i><br>` +
            `${fighter.story || ''}`;
    }

    /** Renombra el peleador del jugador (R con su celda enfocada). */
    renameFocused() {
        const fighter = this.roster[this.index];
        if (!fighter || !fighter.custom) return;
        const name = window.prompt(
            'Nombre de tu peleador (máx. 24 letras):', fighter.name
        );
        if (name === null) return;          // canceló
        const renamed = renameCustomFighter(name);
        if (!renamed) return;
        fighter.name = renamed.name;
        const cell = this.cells[this.index];
        const nameEl = cell && cell.querySelector('.spf-select-name');
        if (nameEl) nameEl.textContent = renamed.name;
        this.showInfo(this.index);
        this.refresh();
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
            // El rotulo cambia: el mismo hueco puede ser el del P1 o el del P2.
            const badge = hex.querySelector('.spf-select-badge');
            if (badge) badge.textContent = isP2 ? '2P' : '1P';
        });

        this.refreshBanner();

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

    /**
     * Pone en el cartel el nombre del peleador enfocado. Es el equivalente al
     * cartel de SFII: lo que estas a punto de elegir, escrito en grande.
     *
     * @param {number} [index] el peleador a mostrar; por defecto, el enfocado
     */
    refreshBanner(index) {
        if (!this.banner) return;
        const i = typeof index === 'number' ? index : this.index;
        const f = this.roster[i];
        this.banner.textContent = f ? f.name : '';
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
            this.showInfo(this.index);
            return;
        }
        // R (o r) con la celda del jugador enfocada:
        // RENOMBRAR el peleador personalizado.
        if ((e.key === 'r' || e.key === 'R')
            && this.roster[this.index] && this.roster[this.index].custom) {
            e.preventDefault();
            this.renameFocused();
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