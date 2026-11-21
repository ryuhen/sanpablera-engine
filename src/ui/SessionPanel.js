/**
 * ============================================================================
 * SANPABLERA ENGINE · ui/SessionPanel.js
 * ----------------------------------------------------------------------------
 * EL PANEL DE LA SESION (Cobre, ciclo, hitos de la maqueta).
 * ============================================================================
 *
 * POR QUE VIVE FUERA DE Engine.js
 *   Engine.js no se puede importar en Node: nada de BABYLON al cargarlo. Si el
 *   marcado del panel y sus botones vivieran ahi, no habria forma de comprobar
 *   que un `data-hito` mal escrito deja la maqueta incomunicada: el boton
 *   aparece, no hace nada y no sale ningun error. Al sacar la VISTA aqui se
 *   puede probar con un DOM minimo (tests/sessionpanel.dom.mjs), como ya se
 *   hace con el inspector.
 *
 * QUE NO HACE
 *   No decidle nada del juego: recibe texto ya formado (`lineaHUD`,
 *   `textoCampana`) y la lista de hitos, y devuelve acciones por callback.
 *   Las reglas siguen en core/modes y core/narrative.
 * ============================================================================
 */

/** Escapa el texto que viene de tablas antes de meterlo en innerHTML. */
export function escapeHtml(texto) {
    return String(texto == null ? '' : texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * El HTML del panel. Funcion pura: con los mismos datos da el mismo texto.
 *
 * @param {object} estado
 *   hud        texto corto de la sesion
 *   campana    resumen narrativo (puede tener saltos de linea)
 *   enMaqueta  si se estan eligiendo hitos
 *   hitos      lista de `{ id, nombre, abierto, siguiente }`
 * @returns {string}
 */
export function panelMarkup(estado = {}) {
    const hud = estado.hud || '';
    const campana = estado.campana || '';
    const enMaqueta = !!estado.enMaqueta;
    const hitos = Array.isArray(estado.hitos) ? estado.hitos : [];
    const lineas = [];

    if (hud) lineas.push('<b>' + escapeHtml(hud) + '</b>');
    if (campana) lineas.push(escapeHtml(campana).replace(/\n/g, '<br>'));

    if (enMaqueta) {
        lineas.push('<br><b>MAQUETA DEL CARIBE</b>');
        for (const h of hitos) {
            if (!h || !h.id) continue;
            const marca = h.siguiente ? ' &#9654;' : (h.abierto ? ' &#10003;' : '');
            lineas.push('<button type="button" data-hito="' + escapeHtml(h.id) + '">'
                + escapeHtml(h.nombre || h.id) + marca + '</button>');
        }
        lineas.push('<button type="button" data-accion="pelear">PELEAR</button>');
    }

    return lineas.join('<br>');
}

/**
 * Conecta los botones del panel ya montado. Se llama DESPUES de cada repintado:
 * `innerHTML` sustituye los nodos, y los manejadores viejos mueren con ellos.
 *
 * @returns {number} cuantos botones se conectaron
 */
export function bindPanel(panel, acciones = {}) {
    if (!panel || typeof panel.querySelectorAll !== 'function') return 0;
    let conectados = 0;

    if (typeof acciones.onHito === 'function') {
        for (const boton of panel.querySelectorAll('button[data-hito]')) {
            const id = boton.getAttribute && boton.getAttribute('data-hito');
            if (!id) continue;
            boton.onclick = () => acciones.onHito(id);
            conectados++;
        }
    }
    if (typeof acciones.onFight === 'function') {
        for (const boton of panel.querySelectorAll('button[data-accion="pelear"]')) {
            boton.onclick = () => acciones.onFight();
            conectados++;
        }
    }
    return conectados;
}

const ESTILO = 'position:fixed;right:8px;top:8px;z-index:80;max-width:300px;'
    + 'padding:8px 10px;background:rgba(9,13,24,.86);border:1px solid #f2de8c;'
    + 'border-radius:6px;color:#f2ead4;font:11px/1.5 ui-monospace,Menlo,Consolas,monospace;'
    + 'white-space:normal;pointer-events:auto';

export class SessionPanel {
    constructor(opts = {}) {
        // `doc` se inyecta para poder montarlo sobre un DOM de mentira en Node.
        // Se respeta un `doc: null` EXPLICITO: en las pruebas interesa comprobar
        // que sin documento no revienta, no que cae al global.
        this.doc = Object.prototype.hasOwnProperty.call(opts, 'doc')
            ? opts.doc
            : (typeof document !== 'undefined' ? document : null);
        this.onHito = opts.onHito || null;
        this.onFight = opts.onFight || null;
        this.estado = {
            hud: '',
            campana: '',
            enMaqueta: !!opts.enMaqueta,
            hitos: Array.isArray(opts.hitos) ? opts.hitos : []
        };
        this.root = null;
    }

    /** Crea el nodo una sola vez. Idempotente: se puede llamar al rotar. */
    mount() {
        if (!this.doc || this.root) return this.root;
        const panel = this.doc.createElement('div');
        panel.id = 'spf-sesion';
        panel.style.cssText = ESTILO;
        const padre = this.doc.body || this.doc.documentElement;
        if (padre && padre.appendChild) padre.appendChild(panel);
        this.root = panel;
        this.paint();
        return panel;
    }

    /** Mezcla con el estado anterior: no hace falta repetir todos los campos. */
    update(cambios = {}) {
        Object.assign(this.estado, cambios);
        this.paint();
    }

    paint() {
        if (!this.root) return 0;
        this.root.innerHTML = panelMarkup(this.estado);
        return bindPanel(this.root, { onHito: this.onHito, onFight: this.onFight });
    }

    /** Devuelve el numero de botones vivos, util para diagnosticar un panel vacio. */
    get botones() {
        if (!this.root || !this.root.querySelectorAll) return 0;
        return this.root.querySelectorAll('button').length;
    }

    dispose() {
        if (this.root && this.root.parentNode && this.root.parentNode.removeChild) {
            this.root.parentNode.removeChild(this.root);
        }
        this.root = null;
    }
}

export default SessionPanel;
