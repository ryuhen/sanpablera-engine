/**
 * ============================================================================
 * SANPABLERA ENGINE · ui/StageSelect.js
 * ----------------------------------------------------------------------------
 * Pantalla de seleccion de ESCENARIO con aspecto de LIBRO DE PAPEL / ORIGAMI:
 * dos paginas abiertas en el centro, un doblez en el lomo y la carta plegada
 * del escenario en la pagina derecha.
 *
 * POR AHORA SOLO HAY UN ESCENARIO (STAGES con una entrada, "Dojo Origami"),
 * asi que esa carta viene ya doblada y seleccionada; el boton "LUCHAR AQUI"
 * basta para confirmar. Cuando haya mas, la carta se desdobla al elegirla.
 *
 *   const { stage } = await new StageSelect({ stages: STAGES }).pick();
 * ============================================================================
 */

import { STAGES } from '../core/stages.js';

const STAGE_CSS = `\
.spf-stage{position:fixed;inset:0;z-index:90;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:clamp(10px,2.4vh,18px);background:radial-gradient(1000px 640px at 50% 30%,#2a2418 0%,#0c0a07 75%);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#efe6d0;user-select:none;padding:16px}\
.spf-stage-title{font-size:clamp(16px,4vh,26px);letter-spacing:6px;font-weight:800;color:#f6efdc;text-shadow:0 2px 0 rgba(0,0,0,.7)}\
.spf-stage-subtitle{font-size:clamp(10px,2vh,12px);letter-spacing:3px;color:#b7a87e;text-transform:uppercase}\
.spf-book{position:relative;width:min(640px,88vw);aspect-ratio:4/3;perspective:1400px;margin:auto}\
.spf-page{position:absolute;top:0;bottom:0;width:50%;transform-style:preserve-3d;background:linear-gradient(105deg,#f7f1df 0%,#ece2c6 55%,#e3d6b2 100%);box-shadow:0 18px 40px rgba(0,0,0,.55);border-radius:4px}\
.spf-page-left{left:0;transform-origin:right center;transform:rotateY(8deg);border-right:2px solid rgba(120,95,40,.25)}\
.spf-page-right{right:0;transform-origin:left center;transform:rotateY(-8deg);border-left:2px solid rgba(120,95,40,.25)}\
.spf-page::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.10) 0%,rgba(0,0,0,0) 22%,rgba(0,0,0,0) 78%,rgba(0,0,0,.12) 100%)}\
.spf-page-title{position:absolute;top:9%;left:10%;right:10%;text-align:center;font-size:clamp(11px,2.6vh,15px);letter-spacing:4px;font-weight:800;color:#5c4a20;border-bottom:2px solid #cbb678;padding-bottom:8px}\
.spf-page-crane{position:absolute;left:50%;top:55%;transform:translate(-50%,-50%) rotate(-2deg)}\
.spf-paper{width:clamp(52px,9vw,84px);height:clamp(36px,7vw,60px);background:linear-gradient(120deg,#fffdf2 0%,#f2e3bd 55%,#d9c391 100%);clip-path:polygon(0 0,100% 0,100% 38%,62% 100%,0 100%);box-shadow:0 8px 14px rgba(0,0,0,.28);transform:rotate(6deg)}\
.spf-paper-b{width:clamp(46px,8vw,72px);height:clamp(34px,6vw,54px);background:linear-gradient(120deg,#fbf6e4 0%,#e9dcba 50%,#cfb888 100%);clip-path:polygon(0 0,18% 0,100% 62%,100% 100%,0 100%);box-shadow:0 8px 14px rgba(0,0,0,.28);transform:rotate(-10deg);position:absolute;left:14%;top:6%}\
.spf-paper-c{width:clamp(40px,7vw,60px);height:clamp(32px,6vw,52px);background:linear-gradient(120deg,#fdf7e8 0%,#eadbb6 50%,#cbb17f 100%);clip-path:polygon(0 0,100% 0,100% 100%,30% 100%);box-shadow:0 8px 14px rgba(0,0,0,.28);transform:rotate(12deg);position:absolute;right:10%;bottom:4%}\
.spf-stage-card{position:absolute;right:7%;left:7%;top:28%;bottom:12%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:clamp(8px,2vh,14px);text-align:center;background:linear-gradient(160deg,#fffdf4 0%,#f4e9c8 100%);border:1px solid #cfb87f;border-radius:6px;box-shadow:0 12px 26px rgba(60,40,10,.35);cursor:pointer;padding:12px}\
.spf-stage-card::before{content:'';position:absolute;top:0;right:0;width:0;height:0;border-style:solid;border-width:0 34px 30px 0;border-color:transparent #cfb87f transparent transparent}\
.spf-stage-flag{font-size:clamp(9px,1.9vh,11px);letter-spacing:3px;color:#7b6a3c;text-transform:uppercase}\
.spf-stage-hex{width:clamp(52px,11vw,84px);aspect-ratio:1/0.9;clip-path:polygon(25% 0%,75% 0%,100% 50%,75% 100%,25% 100%,0% 50%);background:linear-gradient(145deg,#f2e3bd 0%,#c9a85e 140%);box-shadow:inset 0 0 0 2px rgba(120,95,40,.4);margin:auto}\
.spf-stage-name{font-size:clamp(15px,3.4vh,22px);letter-spacing:3px;font-weight:800;color:#4a3a16}\
.spf-stage-tag{font-size:clamp(10px,2.2vh,12px);color:#7b6a3c}\
.spf-stage-start{font-size:clamp(13px,3vh,17px);letter-spacing:4px;font-weight:800;color:#10131a;background:linear-gradient(180deg,#f2de8c,#d9b84a);border:none;border-radius:6px;padding:.7em 2.2em;cursor:pointer;font-family:inherit;box-shadow:0 4px 0 #8f7a2a}\
.spf-stage-start:active{transform:translateY(2px);box-shadow:0 2px 0 #8f7a2a}`;

let STAGE_STYLE = null;
function ensureStyles() {
    if (STAGE_STYLE) return;
    const tag = document.createElement('style');
    tag.id = 'spf-stage-style';
    tag.textContent = STAGE_CSS;
    document.head.appendChild(tag);
    STAGE_STYLE = tag;
}

class StageSelect {
    /**
     * @param {object} [opts] { stages } (por defecto STAGES)
     */
    constructor(opts = {}) {
        this.stages = opts.stages || STAGES;
        this.root = null;
        this.resolve = null;
    }

    /** Muestra el menu y devuelve una promesa que resuelve { stage }. */
    pick() {
        ensureStyles();
        this.build();
        return new Promise((resolve) => {
            this.resolve = resolve;
        });
    }

    build() {
        const root = document.createElement('div');
        root.className = 'spf-stage';

        const title = document.createElement('div');
        title.className = 'spf-stage-title';
        title.textContent = 'ELIGE EL ESCENARIO';

        const subtitle = document.createElement('div');
        subtitle.className = 'spf-stage-subtitle';
        subtitle.textContent = 'por ahora solo hay uno';

        const book = document.createElement('div');
        book.className = 'spf-book';

        // Pagina izquierda: portada del libro, con un par de pliegues de papel.
        const pageL = document.createElement('div');
        pageL.className = 'spf-page spf-page-left';
        const pageLTitle = document.createElement('div');
        pageLTitle.className = 'spf-page-title';
        pageLTitle.textContent = 'MAPPA · DOJO';
        pageL.appendChild(pageLTitle);
        const crane = document.createElement('div');
        crane.className = 'spf-page-crane';
        const p1 = document.createElement('div');
        p1.className = 'spf-paper';
        const p2 = document.createElement('div');
        p2.className = 'spf-paper-b';
        const p3 = document.createElement('div');
        p3.className = 'spf-paper-c';
        crane.appendChild(p1);
        crane.appendChild(p2);
        crane.appendChild(p3);
        pageL.appendChild(crane);
        book.appendChild(pageL);

        // Pagina derecha: la carta del escenario (ya plegada, unica opcion).
        const pageR = document.createElement('div');
        pageR.className = 'spf-page spf-page-right';
        const pageRTitle = document.createElement('div');
        pageRTitle.className = 'spf-page-title';
        pageRTitle.textContent = 'ESCENARIO';
        pageR.appendChild(pageRTitle);

        const stage = this.stages[0];
        const card = document.createElement('div');
        card.className = 'spf-stage-card';

        const flag = document.createElement('div');
        flag.className = 'spf-stage-flag';
        flag.textContent = 'la unica opcion';

        const hex = document.createElement('div');
        hex.className = 'spf-stage-hex';

        const name = document.createElement('div');
        name.className = 'spf-stage-name';
        name.textContent = stage.name;

        const tag = document.createElement('div');
        tag.className = 'spf-stage-tag';
        tag.textContent = stage.tag;

        card.appendChild(flag);
        card.appendChild(hex);
        card.appendChild(name);
        card.appendChild(tag);
        pageR.appendChild(card);
        book.appendChild(pageR);

        const start = document.createElement('button');
        start.className = 'spf-stage-start';
        start.textContent = 'LUCHAR AQUI';
        start.addEventListener('click', () => this.confirm(stage));

        root.appendChild(title);
        root.appendChild(subtitle);
        root.appendChild(book);
        root.appendChild(start);
        document.body.appendChild(root);
        this.root = root;

        this._onKey = (e) => {
            if (e.key === 'Enter') { e.preventDefault(); this.confirm(stage); }
        };
        document.addEventListener('keydown', this._onKey);
    }

    confirm(stage) {
        document.removeEventListener('keydown', this._onKey);
        this.root.classList.add('leaving');
        setTimeout(() => this.destroy(), 240);
        if (this.resolve) this.resolve({ stage });
    }

    destroy() {
        document.removeEventListener('keydown', this._onKey);
        if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
        this.root = null;
    }
}

export default StageSelect;