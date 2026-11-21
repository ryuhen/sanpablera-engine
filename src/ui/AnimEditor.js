/**
 * ============================================================================
 * SANPABLERA ENGINE · ui/AnimEditor.js
 * ----------------------------------------------------------------------------
 * LA VENTANA DEL EDITOR DE ANIMACIONES (raton + teclado).
 *
 * POR QUE VIVE FUERA DE Engine.js
 *   Engine.js no se puede importar en Node (BABYLON + DOM al cargar). Si el
 *   marcado y los manejadores estuvieran ahi, un `id` mal escrito no daria
 *   ningun error: el boton aparece, no hace nada y el mapa parece funcionar.
 *   Al sacar la VISTA aqui se puede probar con un DOM minimo, igual que se hace
 *   con el inspector y con el panel de sesion.
 *
 * QUE MUESTRA
 *   - El MAPA: una fila por animacion, con su clip y una barra de tres frases.
 *     Las filas que no conectan con un clip real se marcan con un aviso.
 *   - El DETALLE de la animacion seleccionada: duracion, peso, a que clip apunta
 *     y las tres frases, ajustables con raton y con teclado.
 *   - Un cabezal (scrubber) que recorre la animacion y avisa de la frase actual.
 *
 * QUE NO HACE
 *   No decide reglas de combate y no escribe las tablas congeladas. Solo edita
 *   la copia del estado y entrega un parche. El dibujo 3D lo hace quien inyecte
 *   `onPreview`; aqui solo se le dice que animacion y que instante mostrar.
 * ============================================================================
 */

import { escapeHtml } from './SessionPanel.js';
import { FASES } from '../core/anim/ClipMap.js';
import * as Ed from '../core/anim/ClipEditor.js';

const CSS = `
.spf-ae{position:fixed;left:12px;top:12px;z-index:130;width:min(520px,94vw);
max-height:82vh;overflow:auto;background:rgba(8,12,26,.97);border:2px solid #f2de8c;
border-radius:6px;box-shadow:0 8px 0 #000;color:#f2ead4;
font:11px/1.45 ui-monospace,Menlo,Consolas,monospace;user-select:none}
.spf-ae h3{margin:0;padding:8px 10px;font-size:12px;letter-spacing:2px;
background:#1b2947;border-bottom:1px solid #f2de8c;display:flex;gap:10px;align-items:center}
.spf-ae h3 span{flex:1;font-weight:400;color:#9fb0d0;letter-spacing:0}
.spf-ae h3 button{background:transparent;border:1px solid #f2de8c;color:#f2de8c;
cursor:pointer;font:inherit;padding:1px 7px}
.spf-ae-lista{padding:6px;display:flex;flex-direction:column;gap:3px;
border-bottom:1px solid #31405e}
.spf-ae-fila{display:grid;grid-template-columns:118px 1fr 64px;gap:6px;align-items:center;
background:#111a2e;border:1px solid #31405e;color:#e8dfc8;padding:3px 5px;
cursor:pointer;font:inherit;text-align:left}
.spf-ae-fila:hover{border-color:#f2de8c}
.spf-ae-fila.on{border-color:#ffc72c;background:#1b2947;box-shadow:inset 3px 0 #ffc72c}
.spf-ae-fila.rota{color:#ffb4a2}
.spf-ae-barra{display:flex;height:8px;background:#0a0f1e;overflow:hidden}
.spf-ae-seg{height:100%;display:block}
.spf-ae-seg[data-fase="STARTUP"]{background:#ffc72c}
.spf-ae-seg[data-fase="ACTIVE"]{background:#ff6b4a}
.spf-ae-seg[data-fase="RECOVERY"]{background:#5b8dd6}
.spf-ae-detalle{padding:8px 10px;display:grid;grid-template-columns:1fr 1fr;gap:6px 10px}
.spf-ae-titulo{grid-column:1/-1;font-weight:800;color:#ffc72c;letter-spacing:1px}
.spf-ae-aviso{grid-column:1/-1;color:#ffb4a2}
.spf-ae-grupo{display:flex;gap:4px;align-items:center}
.spf-ae-grupo label{min-width:44px;color:#9fb0d0}
.spf-ae-grupo input[type=range]{flex:1;min-width:60px}
.spf-ae-grupo b{min-width:52px;text-align:right;color:#fff}
.spf-ae-grupo button{background:#182449;color:#cfe0ff;border:1px solid #3a5090;
cursor:pointer;font:inherit;padding:2px 7px}
.spf-ae-grupo button:hover{background:#24365f}
.spf-ae-total{grid-column:1/-1;display:flex;gap:5px;flex-wrap:wrap;margin-top:4px}
.spf-ae-total button{background:#182449;color:#cfe0ff;border:1px solid #3a5090;
cursor:pointer;font:inherit;padding:5px 8px}
.spf-ae-total button:hover{background:#24365f}
.spf-ae-lectura{grid-column:1/-1;border-top:1px solid #31405e;padding-top:6px;
display:flex;justify-content:space-between;color:#9fb0d0}
.spf-ae-lectura b{color:#fff}
`;

/** Escapa los textos que vienen de las tablas antes de meterlos en innerHTML. */
function esc(s) { return escapeHtml(s); }

/** Etiqueta del clip: si es un alias, se ve la traduccion a la biblioteca. */
function textoClip(f) {
    if (!f) return '';
    return f.esAlias && f.clipReal ? f.clip + ' → ' + f.clipReal : f.clip;
}

/** Una fila del mapa. Funcion pura. */
export function filaMarkup(fila, seleccionada = false) {
    if (!fila) return '';
    const barras = FASES.map((fase) => {
        const ancho = Math.max(0, Math.min(100, (fila.fases && fila.fases[fase] || 0) * 100));
        return '<span class="spf-ae-seg" data-fase="' + fase + '" style="width:'
            + ancho.toFixed(1) + '%"></span>';
    }).join('');
    return '<button type="button" class="spf-ae-fila' + (seleccionada ? ' on' : '')
        + (fila.aviso ? ' rota' : '') + '" data-id="' + esc(fila.id) + '" title="'
        + esc(fila.clip) + '">'
        + '<span>' + esc(fila.nombre) + '</span>'
        + '<span class="spf-ae-barra">' + barras + '</span>'
        + '<span>' + esc(fila.clip) + '</span>'
        + '</button>';
}

/** El marcado de la ventana. Funcion pura: mismos datos, mismo texto. */
export function panelMarkup(editor) {
    const filas = (editor && editor.filas) || [];
    const sel = Ed.seleccion(editor);
    const lista = filas.map((f) => filaMarkup(f, f.id === editor.seleccionId)).join('');
    const resumen = editor ? Ed.cambios(editor) : 0;
    return ''
        + '<h3>MAPA DE ANIMACIONES <span id="ae-resumen">' + filas.length
        + ' animaciones · ' + resumen + ' cambiadas</span>'
        + '<button type="button" id="ae-cerrar" title="Esc">×</button></h3>'
        + '<div class="spf-ae-lista" id="ae-lista">' + lista + '</div>'
        + '<div class="spf-ae-detalle">'
        + '<div class="spf-ae-titulo" id="ae-titulo">' + esc(sel && sel.nombre) + '</div>'
        + (sel && sel.aviso ? '<div class="spf-ae-aviso" id="ae-aviso">⚠ '
            + esc(sel.aviso) + '</div>' : '')
        + '<div class="spf-ae-grupo"><label>CLIP</label>'
        + '<button type="button" id="ae-clip-prev" title="Clip anterior">◀</button>'
        + '<b id="ae-clip">' + esc(textoClip(sel)) + '</b>'
        + '<button type="button" id="ae-clip-next" title="Clip siguiente">▶</button></div>'
        + '<div class="spf-ae-grupo"><label>NAVEGAR</label>'
        + '<button type="button" id="ae-prev" title="↑">ANTERIOR</button>'
        + '<button type="button" id="ae-next" title="↓">SIGUIENTE</button>'
        + '<button type="button" id="ae-play" title="Espacio">▶</button></div>'
        + '<div class="spf-ae-grupo"><label>DURACIÓN</label>'
        + '<button type="button" id="ae-dur-menos">−</button>'
        + '<input id="ae-dur" type="range" min="0.05" max="10" step="0.05" value="'
        + esc(sel && sel.dur) + '">'
        + '<button type="button" id="ae-dur-mas">+</button>'
        + '<b id="ae-dur-valor">' + esc(sel && sel.dur) + 's</b></div>'
        + '<div class="spf-ae-grupo"><label>PESO</label>'
        + '<button type="button" id="ae-pes-menos">−</button>'
        + '<input id="ae-pes" type="range" min="0" max="20" step="1" value="'
        + esc(sel && sel.pes) + '">'
        + '<button type="button" id="ae-pes-mas">+</button>'
        + '<b id="ae-pes-valor">' + esc(sel && sel.pes) + '</b></div>'
        + '<div class="spf-ae-grupo"><label>FRASE</label>'
        + '<button type="button" id="ae-fase-prev">[</button>'
        + '<b id="ae-fase-activa">' + esc(editor && editor.faseActiva) + '</b>'
        + '<button type="button" id="ae-fase-next">]</button>'
        + FASES.map((f) => '<button type="button" class="ae-fase-boton" data-fase="'
            + f + '">' + f.charAt(0) + '</button>').join('')
        + '<button type="button" id="ae-fase-valor-menos" title="Bajar frase">−</button>'
        + '<b id="ae-fase-valor"></b>'
        + '<button type="button" id="ae-fase-valor-mas" title="Subir frase">+</button></div>'
        + '<div class="spf-ae-grupo"><label>INSTANTE</label>'
        + '<input id="ae-t" type="range" min="0" max="1" step="0.01" value="'
        + esc(editor && editor.t) + '"></div>'
        + '<div class="spf-ae-lectura"><span id="ae-fase">STARTUP</span>'
        + '<span id="ae-tiempo">0.00s</span></div>'
        + '<div class="spf-ae-total">'
        + '<button type="button" id="ae-undo">DESHACER</button>'
        + '<button type="button" id="ae-redo">REHACER</button>'
        + '<button type="button" id="ae-export">EXPORTAR</button>'
        + '</div></div>'
        + '<style>' + CSS + '</style>';
}

export class AnimEditor {
    /**
     * @param {object} opts
     *   doc        documento (se inyecta para probarlo en Node)
     *   editor     estado creado con `createClipEditor`
     *   onPreview  (lectura) => void, dibuja el instante en el modelo 3D
     *   onExport   (json) => void, recibe el parche al pulsar EXPORTAR
     *   onClose    () => void
     */
    constructor(opts = {}) {
        this.doc = Object.prototype.hasOwnProperty.call(opts, 'doc')
            ? opts.doc
            : (typeof document !== 'undefined' ? document : null);
        this.editor = opts.editor || Ed.createClipEditor();
        this.onPreview = opts.onPreview || null;
        this.onExport = opts.onExport || null;
        this.onClose = opts.onClose || null;
        this.root = null;
        this.filasNodos = new Map();
        this._onKey = (e) => this._tecla(e);
    }

    isOpen() { return !!this.root && this.root.style.display !== 'none'; }

    /** Crea la ventana una sola vez. */
    montar() {
        if (!this.doc || this.root) return this.root;
        const root = this.doc.createElement('div');
        root.id = 'spf-anim-editor';
        root.className = 'spf-ae';
        root.style.cssText = 'position:fixed;left:12px;top:12px';
        root.innerHTML = panelMarkup(this.editor);
        const padre = this.doc.body || this.doc.documentElement;
        if (padre && padre.appendChild) padre.appendChild(root);
        this.root = root;
        this._indexar();
        this._wire();
        if (this.doc.addEventListener) this.doc.addEventListener('keydown', this._onKey);
        this.paint();
        return root;
    }

    open() {
        this.montar();
        if (this.root) this.root.style.display = '';
        this.paint();
        return this;
    }

    close() {
        if (this.root) this.root.style.display = 'none';
        if (this.onClose) this.onClose();
        return this;
    }

    toggle() { return this.isOpen() ? this.close() : this.open(); }

    /** Nodos que interesan para pintar sin reconstruir el arbol. */
    _indexar() {
        if (!this.root) return;
        this.nodos = Object.create(null);
        for (const id of ['ae-resumen', 'ae-lista', 'ae-titulo', 'ae-aviso', 'ae-clip',
            'ae-dur', 'ae-dur-valor', 'ae-pes', 'ae-pes-valor', 'ae-fase-activa',
            'ae-fase-valor', 'ae-t', 'ae-fase', 'ae-tiempo', 'ae-play']) {
            this.nodos[id] = this.root.querySelector('#' + id);
        }
        this.filasNodos.clear();
        for (const b of this.root.querySelectorAll('.spf-ae-fila')) {
            const id = b.getAttribute && b.getAttribute('data-id');
            if (id) this.filasNodos.set(id, b);
        }
    }

    _on(id, tipo, fn) {
        const n = this.root && this.root.querySelector('#' + id);
        if (n && n.addEventListener) n.addEventListener(tipo, fn);
        return n;
    }

    _wire() {
        for (const [id, delta] of [['ae-prev', -1], ['ae-next', 1]]) {
            this._on(id, 'click', () => { Ed.mover(this.editor, delta); this.paint(); });
        }
        for (const [id, delta] of [['ae-clip-prev', -1], ['ae-clip-next', 1]]) {
            this._on(id, 'click', () => { Ed.ciclarClip(this.editor, delta); this.paint(); });
        }
        for (const [id, campo, signo] of [
            ['ae-dur-menos', 'dur', -1], ['ae-dur-mas', 'dur', 1],
            ['ae-pes-menos', 'pes', -1], ['ae-pes-mas', 'pes', 1]
        ]) {
            this._on(id, 'click', () => { Ed.ajustar(this.editor, campo, signo); this.paint(); });
        }
        this._on('ae-fase-prev', 'click', () => this._fase(-1));
        this._on('ae-fase-next', 'click', () => this._fase(1));
        this._on('ae-fase-valor-menos', 'click', () => {
            Ed.ajustar(this.editor, 'fase', -1); this.paint();
        });
        this._on('ae-fase-valor-mas', 'click', () => {
            Ed.ajustar(this.editor, 'fase', 1); this.paint();
        });
        this._on('ae-play', 'click', () => { Ed.togglePlay(this.editor); this.paint(); });
        this._on('ae-undo', 'click', () => { Ed.deshacer(this.editor); this.paint(); });
        this._on('ae-redo', 'click', () => { Ed.rehacer(this.editor); this.paint(); });
        this._on('ae-export', 'click', () => this._exportar());
        this._on('ae-cerrar', 'click', () => this.close());

        for (const b of this.root.querySelectorAll('.ae-fase-boton')) {
            b.addEventListener('click', () => {
                Ed.ponerFaseActiva(this.editor, b.getAttribute('data-fase'));
                this.paint();
            });
        }
        for (const [id, fila] of this.filasNodos) {
            fila.addEventListener('click', () => { Ed.seleccionar(this.editor, id); this.paint(); });
        }

        const dur = this.nodos['ae-dur'];
        if (dur && dur.addEventListener) {
            dur.addEventListener('input', () => {
                Ed.ajustar(this.editor, 'dur', dur.value, { abs: true });
                this.paint();
            });
        }
        const pes = this.nodos['ae-pes'];
        if (pes && pes.addEventListener) {
            pes.addEventListener('input', () => {
                Ed.ajustar(this.editor, 'pes', pes.value, { abs: true });
                this.paint();
            });
        }
        const t = this.nodos['ae-t'];
        if (t && t.addEventListener) {
            t.addEventListener('input', () => { Ed.tiempo(this.editor, Number(t.value)); this.paint(); });
        }
        const lista = this.nodos['ae-lista'];
        if (lista && lista.addEventListener) {
            lista.addEventListener('wheel', (e) => {
                if (!this.isOpen()) return;
                const d = Number(e && e.deltaY) || 0;
                if (!d) return;
                if (e.preventDefault) e.preventDefault();
                Ed.mover(this.editor, d > 0 ? 1 : -1);
                this.paint();
            });
        }
    }

    _fase(delta) {
        const activa = this.editor.faseActiva;
        const i = FASES.indexOf(activa);
        const nueva = FASES[((i + delta) % FASES.length + FASES.length) % FASES.length];
        Ed.ponerFaseActiva(this.editor, nueva);
        this.paint();
    }

    _exportar() {
        const json = Ed.exportar(this.editor);
        if (this.onExport) this.onExport(json);
        return json;
    }

    /** Repinta todo (se llama tras cada cambio de seleccion o de valor). */
    paint() {
        if (!this.root || !this.isOpen()) return;
        const ed = this.editor;
        const sel = Ed.seleccion(ed);
        const n = this.nodos;

        if (n['ae-resumen']) n['ae-resumen'].textContent = ed.filas.length
            + ' animaciones · ' + Ed.cambios(ed) + ' cambiadas';
        for (const [id, nodo] of this.filasNodos) {
            const f = ed.filas.find((x) => x.id === id);
            const clases = ['spf-ae-fila'];
            if (id === ed.seleccionId) clases.push('on');
            if (f && f.aviso) clases.push('rota');
            if (nodo.className !== undefined) nodo.className = clases.join(' ');
        }
        if (n['ae-titulo']) n['ae-titulo'].textContent = sel ? sel.nombre : '';
        if (n['ae-clip']) n['ae-clip'].textContent = textoClip(sel);
        if (n['ae-dur'] && sel) n['ae-dur'].value = String(sel.dur);
        if (n['ae-dur-valor']) n['ae-dur-valor'].textContent = (sel ? sel.dur : 0) + 's';
        if (n['ae-pes'] && sel) n['ae-pes'].value = String(sel.pes);
        if (n['ae-pes-valor']) n['ae-pes-valor'].textContent = String(sel ? sel.pes : 0);
        if (n['ae-fase-activa']) n['ae-fase-activa'].textContent = ed.faseActiva;
        if (n['ae-fase-valor'] && sel) {
            n['ae-fase-valor'].textContent = Math.round((sel.fases[ed.faseActiva] || 0) * 100) + '%';
        }
        if (n['ae-play']) n['ae-play'].textContent = ed.reproduciendo ? '❚❚' : '▶';
        this.paintBarras();
        this.paintLectura();
    }

    /** Actualiza el ancho de las frases del mapa con los valores editados. */
    paintBarras() {
        if (!this.root) return;
        for (const [id, fila] of this.filasNodos) {
            const f = this.editor.filas.find((x) => x.id === id);
            if (!f || !fila.querySelectorAll) continue;
            for (const seg of fila.querySelectorAll('.spf-ae-seg')) {
                const fase = seg.getAttribute && seg.getAttribute('data-fase');
                if (!fase) continue;
                const ancho = Math.max(0, Math.min(100, (f.fases[fase] || 0) * 100));
                if (seg.style) seg.style.width = ancho.toFixed(1) + '%';
            }
        }
    }

    /** Solo lo que cambia cada frame: util para no repintar el mapa 60 veces. */
    paintLectura() {
        const lect = Ed.lectura(this.editor);
        const n = this.nodos;
        if (!lect || !n) return;
        if (n['ae-t']) n['ae-t'].value = String(lect.t);
        if (n['ae-fase']) n['ae-fase'].textContent = lect.fase;
        if (n['ae-tiempo']) n['ae-tiempo'].textContent = lect.segundos.toFixed(2) + 's / ' + lect.dur + 's';
    }

    /** Un frame: avanza el cabezal, pinta y avisa al dibujante 3D. */
    tick(dt = 0) {
        if (!this.isOpen()) return null;
        const lect = Ed.avanzar(this.editor, dt);
        this.paintLectura();
        if (this.nodos && this.nodos['ae-play']) {
            this.nodos['ae-play'].textContent = this.editor.reproduciendo ? '❚❚' : '▶';
        }
        if (this.onPreview && lect) this.onPreview(lect);
        return lect;
    }

    /** Devuelve true si la tecla se consumo (y no debe llegar al juego). */
    _tecla(e) {
        if (!this.isOpen() || !e) return false;
        const k = e.key || e.code || '';
        const ctrl = !!e.ctrlKey || !!e.metaKey;
        let consumida = true;

        if (ctrl && (k === 'z' || k === 'Z')) Ed.deshacer(this.editor);
        else if (ctrl && (k === 'y' || k === 'Y')) Ed.rehacer(this.editor);
        else if (k === 'ArrowUp' || k === 'w' || k === 'W') Ed.mover(this.editor, -1);
        else if (k === 'ArrowDown' || k === 's' || k === 'S') Ed.mover(this.editor, 1);
        else if (k === 'ArrowLeft') Ed.tiempo(this.editor, this.editor.t - 0.02);
        else if (k === 'ArrowRight') Ed.tiempo(this.editor, this.editor.t + 0.02);
        else if (k === ' ' || k === 'Spacebar') Ed.togglePlay(this.editor);
        else if (k === '[' || k === ']') Ed.ajustar(this.editor, 'fase', k === ']' ? 1 : -1);
        else if (k === '-' || k === '_') Ed.ajustar(this.editor, 'dur', -1);
        else if (k === '+' || k === '=') Ed.ajustar(this.editor, 'dur', 1);
        else if (k === 'Escape') { this.close(); }
        else if (k === 'Enter') { this._exportar(); }
        else consumida = false;

        if (consumida) {
            if (e.preventDefault) e.preventDefault();
            if (e.stopPropagation) e.stopPropagation();
            this.paint();
        }
        return consumida;
    }

    dispose() {
        if (this.doc && this.doc.removeEventListener) {
            this.doc.removeEventListener('keydown', this._onKey);
        }
        if (this.root && this.root.parentNode && this.root.parentNode.removeChild) {
            this.root.parentNode.removeChild(this.root);
        }
        this.root = null;
        this.filasNodos.clear();
    }
}

export default AnimEditor;
