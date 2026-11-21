/**
 * SANPABLERA ENGINE · tests/animateditor.dom.mjs
 * LA VENTANA del editor de animaciones con un DOM minimo (sin jsdom).
 *
 * Lo que aqui se comprueba es justo lo que en el navegador falla SIN EXCEPCION:
 * un id mal escrito deja un boton mudo, un `data-id` mal escrito no selecciona
 * y un evento que no se consume mueve al peleador mientras editas.
 */
import { load } from './loader.mjs';

let passed = 0;
const failed = [];
function check(name, cond, extra) {
    if (cond) { passed++; console.log('  ok   ' + name); return; }
    const msg = name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '');
    failed.push(msg);
    console.log('  FAIL ' + msg);
}
function section(t) { console.log('\n' + t); }

// ---------------------------------------------------------------------------
// DOM de mentira: innerHTML se parsea en arbol, los eventos burbujean.
// ---------------------------------------------------------------------------
function parserAtributos(texto) {
    const attrs = Object.create(null);
    const estilo = {};
    const re = /([a-zA-Z_:][-\w:.]*)\s*=\s*"([^"]*)"/g;
    let m;
    while ((m = re.exec(texto)) !== null) {
        const k = m[1].toLowerCase();
        attrs[k] = m[2];
        if (k === 'style') {
            for (const pareja of m[2].split(';')) {
                const [clave, ...resto] = pareja.split(':');
                if (clave && resto.length) estilo[clave.trim()] = resto.join(':').trim();
            }
        }
    }
    return { attrs, estilo };
}

function crearElemento(tag, doc) {
    const el = {
        tagName: String(tag).toUpperCase(),
        ownerDocument: doc,
        id: '',
        className: '',
        _children: [],
        _padre: null,
        _attrs: Object.create(null),
        _listeners: Object.create(null),
        _texto: '',
        _html: '',
        style: { cssText: '', display: '' },
        value: '',
        parentNode: null,
        get textContent() { return this._texto; },
        set textContent(v) { this._texto = String(v); },
        get children() { return this._children; },
        get innerHTML() { return this._html; },
        set innerHTML(html) {
            this._html = String(html);
            this._children = [];
            // Pila de etiquetas: sin ella los segmentos de la barra salen como
            // HERMANOS de la fila, no como hijos, y `fila.querySelectorAll`
            // devuelve vacio aunque el HTML este bien.
            const pila = [this];
            const re = /<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g;
            let m;
            while ((m = re.exec(this._html)) !== null) {
                const nombre = m[2].toLowerCase();
                if (m[1] === '/') {
                    for (let i = pila.length - 1; i > 0; i--) {
                        if (pila[i].tagName === nombre.toUpperCase()) { pila.length = i; break; }
                    }
                    continue;
                }
                const { attrs, estilo } = parserAtributos(m[3] || '');
                const hijo = crearElemento(m[2], doc);
                hijo._attrs = attrs;
                hijo.id = attrs.id || '';
                hijo.className = attrs.class || '';
                hijo.value = attrs.value !== undefined ? attrs.value : '';
                Object.assign(hijo.style, estilo);
                hijo._padre = pila[pila.length - 1];
                hijo.parentNode = hijo._padre;
                hijo._padre._children.push(hijo);
                const solo = ['input', 'br', 'hr', 'img'].includes(nombre) || /\/\s*$/.test(m[3] || '');
                if (!solo) pila.push(hijo);
            }
        },
        appendChild(hijo) { hijo._padre = this; hijo.parentNode = this; this._children.push(hijo); return hijo; },
        removeChild(hijo) {
            const i = this._children.indexOf(hijo);
            if (i >= 0) { this._children.splice(i, 1); hijo._padre = null; hijo.parentNode = null; }
            return hijo;
        },
        getAttribute(n) { return Object.prototype.hasOwnProperty.call(this._attrs, n) ? this._attrs[n] : null; },
        setAttribute(n, v) { this._attrs[n] = String(v); },
        addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
        removeEventListener(t, fn) {
            const l = this._listeners[t];
            if (l) this._listeners[t] = l.filter((f) => f !== fn);
        },
        dispatchEvent(ev) {
            ev.target = ev.target || this;
            if (!ev.preventDefault) ev.preventDefault = () => { ev._prevented = true; };
            if (!ev.stopPropagation) ev.stopPropagation = () => { ev._stopped = true; };
            for (const fn of (this._listeners[ev.type] || []).slice()) fn(ev);
            if (!ev._stopped && this._padre && this._padre.dispatchEvent) this._padre.dispatchEvent(ev);
            return !ev._prevented;
        },
        click() { this.dispatchEvent({ type: 'click' }); },
        walk(salida = []) { for (const h of this._children) { salida.push(h); h.walk(salida); } return salida; },
        querySelectorAll(sel) {
            if (sel.charAt(0) === '#') {
                const id = sel.slice(1);
                return this.walk().filter((h) => h.id === id);
            }
            const cls = sel.charAt(0) === '.' ? sel.slice(1) : sel;
            return this.walk().filter((h) => h.className.split(' ').includes(cls));
        },
        querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    };
    return el;
}

function installDom() {
    const doc = crearElemento('document', null);
    doc.body = crearElemento('body', doc);
    doc.documentElement = doc.body;
    doc.createElement = (tag) => crearElemento(tag, doc);
    Object.defineProperty(globalThis, 'document', { value: doc, writable: true, configurable: true });
    return doc;
}

const doc = installDom();
const UI = await load('src/ui/AnimEditor.js');
const CM = await load('src/core/anim/ClipMap.js');
const CE = await load('src/core/anim/ClipEditor.js');

const BIB = {
    idle: { nombre: 'idle', dur: 1.2, loop: true, commitment: 0.1 },
    jab_light: { nombre: 'jab_light', dur: 0.4, loop: false, commitment: 0.6 },
    guard_high: { nombre: 'guard_high', dur: 0.8, loop: true, commitment: 0.25 }
};
const ANIMS = {
    guardia: { id: 'guardia', nombre: 'Guardia', tipo: 'guardia', clip: 'idle', dur: 0, pes: 10 },
    jab: { id: 'jab', nombre: 'Jab', tipo: 'tecnica', clip: 'jab_light', dur: 0.7, pes: 4 },
    roto: { id: 'roto', nombre: '<Roto>', tipo: 'tecnica', clip: 'NO_EXISTE', dur: 0.9, pes: 2 }
};
function nuevo(opts = {}) {
    const editor = CE.createClipEditor({
        mapa: CM.buildClipMap({ animaciones: ANIMS, biblioteca: BIB }),
        ...opts
    });
    return editor;
}

section('1 · El marcado es pura funcion');
{
    const ed = nuevo();
    const html = UI.panelMarkup(ed);
    check('titulo del mapa', html.includes('MAPA DE ANIMACIONES'));
    check('una fila por animacion', (html.match(/class="spf-ae-fila/g) || []).length === 3);
    check('la fila seleccionada se marca', html.includes('spf-ae-fila on'));
    check('la fila rota se marca', html.includes('class="spf-ae-fila rota" data-id="roto"'));
    check('tres segmentos por fila', (html.match(/class="spf-ae-seg"/g) || []).length === 9);
    check('los ids de datos estan', html.includes('data-id="jab"'));
    check('el nombre se escapa', html.includes('&lt;Roto&gt;') && !html.includes('<Roto>'));
    const htmlRoto = UI.panelMarkup(nuevo({ seleccion: 'roto' }));
    check('el aviso se ve al seleccionar la fila rota', htmlRoto.includes('no existe'));
    check('el aviso se escapa', htmlRoto.includes('id="ae-aviso"'));
    check('controles de raton presentes', ['ae-prev', 'ae-next', 'ae-play', 'ae-dur-mas',
        'ae-pes-menos', 'ae-fase-next', 'ae-clip-prev', 'ae-undo', 'ae-redo', 'ae-export']
        .every((id) => html.includes('id="' + id + '"')));
    check('filaMarkup sin fila no revienta', UI.filaMarkup(null) === '');
    check('la barra usa porcentajes', /width:\d+\.\d%/.test(html));
    const edAlias = CE.createClipEditor({
        mapa: CM.buildClipMap({
            animaciones: { g: { id: 'g', nombre: 'Guardia', tipo: 'guardia', clip: 'IDLE', dur: 0, pes: 1 } },
            biblioteca: { idle: { dur: 1, loop: true, commitment: 0 } }
        })
    });
    check('el alias se ve en el detalle', UI.panelMarkup(edAlias).includes('IDLE → idle'));
}

section('2 · Montar, abrir, cerrar');
{
    let cerrados = 0;
    const ed = nuevo();
    const w = new UI.AnimEditor({ doc, editor: ed, onClose: () => { cerrados++; } });
    check('sin montar esta cerrada', w.isOpen() === false);
    w.montar();
    check('monta #spf-anim-editor', !!w.root && w.root.id === 'spf-anim-editor');
    check('cuelga del body', doc.body.children.includes(w.root));
    check('montar dos veces no duplica', w.montar() === w.root && doc.body.children.length === 1);
    check('montada esta abierta', w.isOpen() === true);
    check('indexo los controles', !!w.nodos['ae-t'] && !!w.nodos['ae-lista']);
    w.close();
    check('cerrar oculta', w.isOpen() === false && w.root.style.display === 'none');
    check('onClose se llama', cerrados === 1);
    w.open();
    check('abrir muestra', w.isOpen() === true);
    check('toggle cierra', w.toggle().isOpen() === false);
    check('toggle abre', w.toggle().isOpen() === true);
    check('sin documento no revienta', new UI.AnimEditor({ doc: null }).montar() === null);
}

section('3 · Ratón: seleccionar y navegar');
{
    const ed = nuevo();
    const w = new UI.AnimEditor({ doc, editor: ed });
    w.montar();
    const filas = w.root.querySelectorAll('.spf-ae-fila');
    check('tres filas indexadas', w.filasNodos.size === 3);
    filas.find((f) => f.getAttribute('data-id') === 'jab').click();
    check('click en fila selecciona', ed.seleccionId === 'jab');
    check('la clase on se mueve', w.filasNodos.get('jab').className.includes('on')
        && !w.filasNodos.get('guardia').className.includes('on'));
    check('el titulo cambia', w.nodos['ae-titulo'].textContent === 'Jab');
    w.root.querySelector('#ae-next').click();
    check('boton siguiente', ed.seleccionId === 'roto');
    w.root.querySelector('#ae-prev').click();
    check('boton anterior', ed.seleccionId === 'jab');
    w.nodos['ae-lista'].dispatchEvent({ type: 'wheel', deltaY: 1 });
    check('rueda abajo avanza', ed.seleccionId === 'roto');
    w.nodos['ae-lista'].dispatchEvent({ type: 'wheel', deltaY: -1 });
    check('rueda arriba retrocede', ed.seleccionId === 'jab');
    w.dispose();
}

section('4 · Ratón: ajustar una a una');
{
    const ed = nuevo({ seleccion: 'jab' });
    const w = new UI.AnimEditor({ doc, editor: ed });
    w.montar();
    const dur0 = CE.seleccion(ed).dur;
    w.root.querySelector('#ae-dur-mas').click();
    check('dur +', CE.seleccion(ed).dur > dur0);
    w.root.querySelector('#ae-dur-menos').click();
    check('dur -', Math.abs(CE.seleccion(ed).dur - dur0) < 1e-9);
    w.nodos['ae-dur'].value = '2.5';
    w.nodos['ae-dur'].dispatchEvent({ type: 'input' });
    check('slider dur aplica valor absoluto', CE.seleccion(ed).dur === 2.5);
    w.nodos['ae-pes'].value = '7';
    w.nodos['ae-pes'].dispatchEvent({ type: 'input' });
    check('slider pes aplica', CE.seleccion(ed).pes === 7);
    check('lectura del peso en pantalla', w.nodos['ae-pes-valor'].textContent === '7');
    w.root.querySelector('#ae-fase-next').click();
    check('boton cambia de frase', ed.faseActiva === 'ACTIVE');
    w.root.querySelectorAll('.ae-fase-boton')
        .find((b) => b.getAttribute('data-fase') === 'RECOVERY').click();
    check('boton de frase directo', ed.faseActiva === 'RECOVERY');
    const rec = CE.seleccion(ed).fases.RECOVERY;
    w.root.querySelector('#ae-fase-valor-menos').click();
    check('frase - con raton', CE.seleccion(ed).fases.RECOVERY < rec);
    check('las fases siguen sumando 1', Math.abs(['STARTUP', 'ACTIVE', 'RECOVERY']
        .reduce((s, f) => s + CE.seleccion(ed).fases[f], 0) - 1) < 1e-3);
    w.root.querySelector('#ae-clip-next').click();
    check('cambiar clip', CE.seleccion(ed).clip === 'guard_high');
    check('el rebind no deja aviso', CE.seleccion(ed).aviso === null);
    w.root.querySelector('#ae-undo').click();
    check('deshacer desde el boton', CE.seleccion(ed).clip === 'jab_light');
    w.root.querySelector('#ae-redo').click();
    check('rehacer desde el boton', CE.seleccion(ed).clip === 'guard_high');
    w.dispose();
}

section('5 · Teclado');
{
    const ed = nuevo();
    const exportados = [];
    const w = new UI.AnimEditor({ doc, editor: ed, onExport: (j) => exportados.push(j) });
    w.montar();
    const key = (k, extra = {}) => {
        const ev = { type: 'keydown', key: k, code: k, ...extra };
        doc.dispatchEvent(ev);
        return ev;
    };
    let ev = key('ArrowDown');
    check('ArrowDown mueve', ed.seleccionId === 'jab');
    check('la tecla se consume', ev._prevented === true && ev._stopped === true);
    key('ArrowUp');
    check('ArrowUp vuelve', ed.seleccionId === 'guardia');
    key('s');
    check('tambien funciona S', ed.seleccionId === 'jab');
    key('ArrowLeft');
    check('ArrowLeft recorta el tiempo a 0', ed.t === 0);
    key('ArrowRight');
    check('ArrowRight mueve el cabezal', ed.t > 0);
    key(' ');
    check('espacio reproduce', ed.reproduciendo === true);
    key(' ');
    check('espacio pausa', ed.reproduciendo === false);
    const start0 = CE.seleccion(ed).fases.STARTUP;
    key(']');
    check('] sube la frase activa', CE.seleccion(ed).fases.STARTUP > start0);
    check('] no deja las fases descuadradas', Math.abs(['STARTUP', 'ACTIVE', 'RECOVERY']
        .reduce((s, f) => s + CE.seleccion(ed).fases[f], 0) - 1) < 1e-3);
    check('la frase activa era STARTUP', ed.faseActiva === 'STARTUP');
    const dur1 = CE.seleccion(ed).dur;
    key('+');
    check('+ sube duracion', CE.seleccion(ed).dur > dur1);
    key('-');
    check('- baja duracion', CE.seleccion(ed).dur === dur1);
    key('z', { ctrlKey: true });
    check('Ctrl+Z deshace el ultimo cambio', CE.seleccion(ed).dur > dur1);
    key('y', { ctrlKey: true });
    check('Ctrl+Y rehace el ultimo cambio', CE.seleccion(ed).dur === dur1);
    ev = key('F2');
    check('tecla ajena NO se consume', ev._prevented === undefined && ev._stopped === undefined);
    key('Enter');
    check('Enter exporta', exportados.length === 1);
    check('el export es JSON', JSON.parse(exportados[0]).version === 1);
    key('Escape');
    check('Escape cierra', w.isOpen() === false);
    const antes = ed.seleccionId;
    key('ArrowDown');
    check('cerrado ignora el teclado', ed.seleccionId === antes);
    w.dispose();
}

section('6 · Vista previa y barras');
{
    const ed = nuevo();
    const vistos = [];
    const w = new UI.AnimEditor({ doc, editor: ed, onPreview: (l) => vistos.push(l) });
    w.montar();
    CE.seleccionar(ed, 'jab');
    CE.togglePlay(ed);
    const l = w.tick(0.1);
    check('tick devuelve la lectura', l && l.clip === 'jab_light');
    check('tick resuelve el clip real', l.clipReal === 'jab_light');
    check('tick avisa al dibujante', vistos.length === 1 && vistos[0].fase === 'STARTUP');
    check('el cabezal se pinta', Number(w.nodos['ae-t'].value) > 0);
    check('la frase se pinta', w.nodos['ae-fase'].textContent === 'STARTUP');
    check('el reloj se pinta', w.nodos['ae-tiempo'].textContent.includes('0.1'));

    CE.ajustar(ed, 'fases.STARTUP', 5);
    w.paintBarras();
    const filaJab = w.filasNodos.get('jab');
    const seg = filaJab.querySelectorAll('.spf-ae-seg')
        .find((s) => s.getAttribute('data-fase') === 'STARTUP');
    check('el ancho de la barra sigue a la fase', Math.abs(parseFloat(seg.style.width)
        - CE.seleccion(ed).fases.STARTUP * 100) < 0.2, seg.style.width);
    w.close();
    check('tick cerrado no avisa', w.tick(1) === null && vistos.length === 1);
    w.dispose();
    check('dispose suelta el nodo', !doc.body.children.includes(w.root) && w.root === null);
}

console.log('\n' + '='.repeat(64));
if (failed.length) {
    console.log('FALLOS (' + failed.length + '):');
    for (const f of failed) console.log('  - ' + f);
}
console.log('\n' + passed + ' comprobaciones, ' + failed.length + ' fallos');
process.exit(failed.length ? 1 : 0);
