/**
 * ============================================================================
 * SANPABLERA ENGINE · ui/DevMenu.js
 * ----------------------------------------------------------------------------
 * LA PUERTA DE LOS QUE NO SON JUEGO.
 * ============================================================================
 *
 * POR QUE UN MENU Y NO UNA TECLA MAS
 *   El inspector (F2) y el configurador (F1) ya existen y funcionan, pero son
 *   invisibles: hay que saberse acordarse de dos teclas que no pone ningun
 *   cartel. Este menu las hace clicables, y de paso enseña lo que se necesita
 *   para diagnosticar: que modelo esta cargado, cuantos huesos se han leido,
 *   cuantos frames van, cuantos peleadores hay en pie.
 *
 *   Ese ultimo bloque no es adorno. Esta sesion entero se perdio por medir sin
 *   mirar: sondas que decian "cambio 0,0000" porque el bucle no corria, o
 *   "CONGELADO" porque la sonda nunca paso de la pantalla de carga. Un panel
 *   que dice la verdad del estado ahorra esas dos horas la proxima vez.
 *
 * POR QUE ES AUTOSUFICIENTE Y NO TOCA EL ENGINE
 *   El inspector y el configurador se abren desde un `keydown` en `window`
 *   (Engine.js, F1 y F2). Este menu lanza una tecla de verdad con
 *   `KeyboardEvent`, y el codigo que ya existe hace el resto. Asi el menu se
 *   puede montar en la pantalla de carga, en la de escenario o en la pelea sin
 *   que ningun modulo tenga que saber que existe.
 *
 * LO QUE NO HACE
 *   No abre la pelea de entrenamiento: eso necesita una entidad nueva y es otro
 *   fichero. Aqui se deja el hueco (`alEntrenar`) para que lo llame quien sepa
 *   hacerlo, en vez de fingir que existe con un boton que no hace nada.
 */

let estilo = null;
function asegurarEstilo() {
    if (estilo) return estilo;
    estilo = document.createElement('style');
    estilo.id = 'spf-dev-style';
    estilo.textContent = CSS;
    document.head.appendChild(estilo);
    return estilo;
}

const CSS = `
.spf-dev-fab{position:fixed;left:10px;bottom:10px;z-index:120;display:flex;gap:5px;
align-items:center;font:700 10px/1 Consolas,monospace;letter-spacing:1px}
.spf-dev-fab>button{background:#11182e;color:#7ea6ff;border:2px solid #2b3a6b;
padding:6px 10px;cursor:pointer;font:inherit;box-shadow:0 3px 0 #000}
.spf-dev-fab>button:hover{background:#1c2a52;color:#cfe0ff}
.spf-dev-fab>button.activo{background:#ffd447;color:#11182e;border-color:#7a1200}
.spf-dev-panel{position:fixed;left:10px;bottom:44px;z-index:121;width:340px;
background:rgba(10,16,34,.97);border:3px solid #2b3a6b;box-shadow:0 6px 0 #000;
color:#cfe0ff;font:12px/1.55 Consolas,monospace;padding:10px 12px}
.spf-dev-panel h3{margin:0 0 7px;font:900 12px/1 inherit;letter-spacing:2px;color:#ffd447;
text-transform:uppercase;border-bottom:1px solid #2b3a6b;padding-bottom:5px}
.spf-dev-fila{display:flex;justify-content:space-between;gap:10px}
.spf-dev-fila b{color:#8fa8e0;font-weight:400}
.spf-dev-fila i{font-style:normal;color:#fff}
.spf-dev-sep{margin:8px 0;border-top:1px solid #1e2a4d}
.spf-dev-btns{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px}
.spf-dev-btns button{flex:1 1 44%;background:#182449;color:#cfe0ff;border:1px solid #3a5090;
padding:7px 4px;cursor:pointer;font:700 10px/1.25 inherit;letter-spacing:.5px}
.spf-dev-btns button:hover{background:#24365f;color:#fff}
.spf-dev-btns button:disabled{opacity:.45;cursor:not-allowed}
.spf-dev-aviso{color:#ffb4a2;margin-top:6px;font-size:11px}
`;

export class DevMenu {
    /**
     * @param {object} [opts]
     *   alEntrenar  se llama al pedir entrenamiento (lo implementa el Engine)
     *  diagnostico  () => objeto con lo que se enseña: modelo, huesos, fps...
     */
    constructor(opts = {}) {
        this.alEntrenar = opts.alEntrenar || null;
        this.diagnostico = opts.diagnostico || null;
        this.root = null;
        this.panel = null;
        this.abierto = false;
        this._t0 = performance.now();
        this._frames = 0;
        this._cuenta = () => {
            this._frames++;
            requestAnimationFrame(this._cuenta);
        };
        requestAnimationFrame(this._cuenta);
    }

    /** Se monta. `ancla` es donde se pega el boton (por defecto, esquina). */
    montar(ancla) {
        if (this.root) return this;
        asegurarEstilo();
        const raiz = document.createElement('div');
        raiz.className = 'spf-dev-fab';
        raiz.style.position = 'static';

        const toggle = document.createElement('button');
        toggle.textContent = 'DEV';
        toggle.title = 'Menu de desarrollo';
        const panel = document.createElement('div');
        panel.className = 'spf-dev-panel';
        panel.style.display = 'none';

        toggle.addEventListener('click', () => this.alternar());
        raiz.appendChild(panel);
        raiz.appendChild(toggle);
        (ancla || document.body).appendChild(raiz);

        this.root = raiz;
        this.panel = panel;
        this.toggle = toggle;
        this.pintar();
        // Se repinta solo, porque un panel que dice 60 fps congelado miente.
        this._t = setInterval(() => { if (this.abierto) this.pintar(); }, 500);
        return this;
    }

    alternar() {
        this.abierto = !this.abierto;
        this.panel.style.display = this.abierto ? '' : 'none';
        this.toggle.classList.toggle('activo', this.abierto);
        if (this.abierto) this.pintar();
    }

    /** Los frames por segundo REALES, no los que juega el motor. */
    get fps() {
        const seg = (performance.now() - this._t0) / 1000;
        return seg > 0 ? +(this._frames / seg).toFixed(1) : 0;
    }

    pintar() {
        if (!this.panel) return;
        // El diagnóstico se ejecuta SUELTO. Antes, si la función que le pasan
        // tiraba una excepción, el panel entero salía vacío: ni botones ni
        // filas. Un panel de diagnóstico que se rompe justo cuando hay algo
        // raro que diagnosticar es peor que no tenerlo, porque parece vacío y
        // no dice por qué.
        let d = {};
        let fallo = '';
        try {
            d = (this.diagnostico ? this.diagnostico() : {}) || {};
        } catch (err) {
            fallo = String(err && err.message ? err.message : err).slice(0, 80);
            d = {};
        }
        const filas = [
            ['modelo', d.modelo || MODELO_POR_DEFECTO.split('/').pop()],
            ['huesos', d.huesos != null ? d.huesos : '—'],
            ['peleadores', d.peleadores != null ? d.peleadores : '—'],
            ['fps', this.fps + (this.fps < 20 ? '  (va lento)' : '')]
        ];
        let html = '<h3>Diagnóstico</h3>';
        for (const [k, v] of filas) {
            html += `<div class="spf-dev-fila"><b>${k}</b><i>${v}</i></div>`;
        }

        // Las herramientas existen cuando el motor ha llegado al punto donde las
        // registra. En la pantalla de carga todavia no, y fingir que si -dejar
        // el boton pulsable y que no pase nada- es peor que deshabilitado: el
        // jugador deduce que el menu esta roto cuando lo que pasa es que aun
        // no toca.
        const sp = window.SANPABLERA || {};
        const hayInspector = typeof sp.abrirInspector === 'function';
        const hayControles = typeof sp.abrirControles === 'function';

        html += '<div class="spf-dev-sep"></div><div class="spf-dev-btns">';
        html += '<button data-a="inspector"' + (hayInspector ? '' : ' disabled')
            + '>Inspector de<br>animaciones (F2)</button>';
        html += '<button data-a="controles"' + (hayControles ? '' : ' disabled')
            + '>Controles y<br>mando (F1)</button>';
        html += '<button data-a="entrenar">Entrenar<br>peleador</button>';
        html += '<button data-a="cerrar">Cerrar</button>';
        html += '</div>';
        if (!hayControles) {
            html += '<div class="spf-dev-aviso">Las herramientas se activan al '
                + 'terminar de cargar el modelo. En la pantalla inicial todavia '
                + 'no hay nada que abrir.</div>';
        }
        if (!this.alEntrenar) {
            html += '<div class="spf-dev-aviso">El entrenamiento todavia no esta'
                + ' conectado: este boton solo avisa.</div>';
        }
        if (fallo) {
            html += '<div class="spf-dev-aviso">diagnostico: ' + fallo + '</div>';
        }
        this.panel.innerHTML = html;

        const boton = (a) => this.panel.querySelector(`[data-a="${a}"]`);
        if (hayInspector) {
            boton('inspector').addEventListener('click', () => sp.abrirInspector());
        }
        if (hayControles) {
            boton('controles').addEventListener('click', () => sp.abrirControles());
        }
        boton('cerrar').addEventListener('click', () => this.alternar());
        const ent = boton('entrenar');
        if (this.alEntrenar) ent.addEventListener('click', () => this.alEntrenar());
        else ent.addEventListener('click', () => {
            const a = this.panel.querySelector('.spf-dev-aviso');
            if (a) a.textContent = 'El entrenamiento sigue sin conectar: es el siguiente fichero.';
        });
    }

    cerrar() {
        clearInterval(this._t);
        if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
        this.root = null;
        this.panel = null;
        this.abierto = false;
    }
}

export default DevMenu;
