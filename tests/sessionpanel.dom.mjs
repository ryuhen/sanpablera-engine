/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/sessionpanel.dom.mjs
 * ----------------------------------------------------------------------------
 * La VISTA del panel de sesion, con un DOM minimo de mentira (sin jsdom).
 *
 * Engine.js no se puede importar en Node, asi que el panel vive en su propio
 * modulo. Aqui se comprueba lo que en el navegador falla SILENCIOSAMENTE: un
 * `data-hito` mal escrito pinta un boton que no hace nada, y un texto sin
 * escapar puede romper el marcado. Ninguno de los dos da una excepcion.
 * ============================================================================
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
// DOM de mentira: solo createElement, appendChild, innerHTML y botones.
// ---------------------------------------------------------------------------
function parsearBotones(dueno, html) {
    const salida = [];
    const re = /<button\b([^>]*)>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const attrs = {};
        const ra = /([\w-]+)\s*=\s*"([^"]*)"/g;
        let a;
        while ((a = ra.exec(m[1])) !== null) attrs[a[1]] = a[2];
        salida.push({
            tagName: 'BUTTON',
            attrs,
            onclick: null,
            parentNode: dueno,
            getAttribute(n) { return Object.prototype.hasOwnProperty.call(attrs, n) ? attrs[n] : null; }
        });
    }
    return salida;
}

function elemento(tag) {
    return {
        tagName: String(tag).toUpperCase(),
        id: '',
        style: { cssText: '' },
        parentNode: null,
        children: [],
        _html: '',
        get innerHTML() { return this._html; },
        set innerHTML(v) { this._html = String(v); this.children = parsearBotones(this, this._html); },
        appendChild(hijo) { hijo.parentNode = this; this.children.push(hijo); return hijo; },
        removeChild(hijo) {
            const i = this.children.indexOf(hijo);
            if (i >= 0) { this.children.splice(i, 1); hijo.parentNode = null; }
            return hijo;
        },
        querySelectorAll(sel) {
            const botones = this.children.filter(c => c.tagName === 'BUTTON');
            if (sel === 'button') return botones;
            if (sel === 'button[data-hito]') return botones.filter(b => b.getAttribute('data-hito') !== null);
            if (sel === 'button[data-accion="pelear"]') {
                return botones.filter(b => b.getAttribute('data-accion') === 'pelear');
            }
            return [];
        },
        getAttribute(n) { return Object.prototype.hasOwnProperty.call(this, n) ? this[n] : null; }
    };
}

function installDom() {
    const body = elemento('body');
    const doc = { body, createElement: (tag) => elemento(tag) };
    Object.defineProperty(globalThis, 'document', { value: doc, writable: true, configurable: true });
    return doc;
}

const doc = installDom();
const P = await load('src/ui/SessionPanel.js');

const HITOS = [
    { id: 'EL_MORRO', nombre: 'El Morro', abierto: true, siguiente: false },
    { id: 'PLAYA_AGUA', nombre: 'Playa del Agua', abierto: false, siguiente: true },
    { id: 'VOLCAN', nombre: 'Volcán', abierto: false, siguiente: false }
];

section('1 · El marcado es pura funcion');
{
    check('sin datos no pinta nada', P.panelMarkup() === '');
    check('el HUD va en negrita', P.panelMarkup({ hud: 'CLASICO · R1 · 20 Cobre' }).includes('<b>CLASICO'));
    const conCampana = P.panelMarkup({ campana: 'linea 1\nlinea 2' });
    check('los saltos de la campana se vuelven <br>', conCampana.includes('linea 1<br>linea 2'));
    check('sin maqueta no hay botones', !P.panelMarkup({ hitos: HITOS }).includes('data-hito'));
    const maqueta = P.panelMarkup({ enMaqueta: true, hitos: HITOS });
    check('la maqueta aparece', maqueta.includes('MAQUETA DEL CARIBE'));
    check('un boton por hito', (maqueta.match(/data-hito=/g) || []).length === 3);
    check('el boton de PELEAR aparece', maqueta.includes('data-accion="pelear"'));
    check('el hito siguiente se marca', maqueta.includes('PLAYA_AGUA">Playa del Agua &#9654;'));
    check('el hito abierto se marca', maqueta.includes('EL_MORRO">El Morro &#10003;'));
}

section('2 · El texto se escapa antes de innerHTML');
{
    check('escapeHtml escapa &<>"\'', P.escapeHtml('<a href="x">&\'') === '&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
    const malo = P.panelMarkup({ hud: '<img src=x onerror=1>', campana: '<script>x</script>' });
    check('no se cuela una etiqueta por el HUD', !malo.includes('<img'));
    check('no se cuela una etiqueta por la campana', !malo.includes('<script'));
    const hitoMalo = P.panelMarkup({ enMaqueta: true, hitos: [{ id: 'x" onmouseover="y', nombre: '<b>x</b>' }] });
    check('el id no rompe el atributo', !hitoMalo.includes('id="x" onmouseover'));
    check('el nombre no se interpreta como negrita', !hitoMalo.includes('><b>x</b>'));
}

section('3 · bindPanel conecta los botones que pinta');
{
    const panel = elemento('div');
    panel.innerHTML = P.panelMarkup({ enMaqueta: true, hitos: HITOS });
    check('bindPanel sin panel no revienta', P.bindPanel(null, {}) === 0);
    check('sin callbacks no conecta nada', P.bindPanel(panel, {}) === 0);
    let elegido = null;
    let peleo = 0;
    const n = P.bindPanel(panel, {
        onHito: (id) => { elegido = id; },
        onFight: () => { peleo++; }
    });
    check('conecta los 3 hitos y PELEAR', n === 4, n);
    const playa = panel.querySelectorAll('button[data-hito]').find(b => b.getAttribute('data-hito') === 'PLAYA_AGUA');
    playa.onclick();
    check('el click pasa el id correcto', elegido === 'PLAYA_AGUA', elegido);
    panel.querySelectorAll('button[data-accion="pelear"]')[0].onclick();
    check('PELEAR llama a su callback', peleo === 1, peleo);
}

section('4 · SessionPanel monta, repinta y desmonta');
{
    let elegido = null;
    const panel = new P.SessionPanel({
        doc,
        onHito: (id) => { elegido = id; },
        hitos: HITOS,
        enMaqueta: true
    });
    const raiz = panel.mount();
    check('monta un nodo #spf-sesion', !!raiz && raiz.id === 'spf-sesion');
    check('el nodo cuelga del body', doc.body.children.includes(raiz));
    check('tiene estilo para no tapar el juego', raiz.style.cssText.includes('position:fixed'));
    check('montar dos veces no duplica el nodo', panel.mount() === raiz && doc.body.children.length === 1);
    check('pinta los 4 botones', panel.botones === 4, panel.botones);

    panel.update({ hud: 'CAMPAÑA · R2 · 45 Cobre' });
    check('update conserva los hitos anteriores', panel.botones === 4, panel.botones);
    check('update muestra el HUD nuevo', raiz.innerHTML.includes('45 Cobre'));
    raiz.querySelectorAll('button[data-hito]')[0].onclick();
    check('los botones SIGUEN conectados tras repintar', elegido === 'EL_MORRO', elegido);

    panel.update({ enMaqueta: false });
    check('salir de la maqueta quita los botones', panel.botones === 0);
    panel.dispose();
    check('dispose suelta el nodo', !doc.body.children.includes(raiz) && panel.root === null);

    const sinDoc = new P.SessionPanel({ doc: null });
    check('sin documento mount no revienta', sinDoc.mount() === null);
}

console.log('\n' + '='.repeat(64));
if (failed.length) {
    console.log('FALLOS (' + failed.length + '):');
    for (const f of failed) console.log('  - ' + f);
}
console.log('\n' + passed + ' comprobaciones, ' + failed.length + ' fallos');
process.exit(failed.length ? 1 : 0);
