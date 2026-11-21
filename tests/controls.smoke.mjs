/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/controls.smoke.mjs
 * ----------------------------------------------------------------------------
 * EL MENU DE CONTROLES COMO PROMESA, Y EL MANDO COMO INDICES.
 *
 * POR QUE ESTA PRUEBA EXISTE
 *   Tres fallos que no salian en `node --check` ni en ninguna suite:
 *
 *   1. `open()` creaba una promesa pero no guardaba su `resolve`. El boton
 *      GUARDAR Y VOLVER llamaba a `close(this._resolve)` con `undefined`, asi
 *      que la promesa no se resolvia nunca y `controlsOpen` se quedaba en
 *      `true`: F1 dejaba de abrir el menu para el resto de la partida.
 *   2. `pollPad()` leia `this._padPrev[i]` antes de inicializar `_padPrev`.
 *      Con mando conectado, el primer sondeo lanzaba TypeError.
 *   3. `assignPad()` traducia los botones 12..15 a teclas 'up'/'down'/... y
 *      escribia en el mapa de TECLADO. Con un boton de cara (0..3) guardaba
 *      `undefined`, que al serializar se convierte en [null] y se pierde.
 *
 *   Son fallos de CABLEADO, no de sintaxis: por eso hacen falta un DOM de
 *   mentira y un router de mentira, aunque sean veinte lineas.
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

function definir(nombre, valor) {
    Object.defineProperty(globalThis, nombre, { value: valor, writable: true, configurable: true });
}

/** DOM minimo: lo que `ControlsScreen` toca, y nada mas. */
function crear(tag = 'div') {
    const el = {
        tagName: String(tag).toUpperCase(),
        id: '', className: '', textContent: '', title: '', type: '',
        _html: '', _children: [], _parent: null, _listeners: {},
        classList: {
            add() {}, remove() {}, toggle() {}, contains() { return false; }
        },
        get innerHTML() { return this._html; },
        set innerHTML(v) { this._html = String(v); },
        appendChild(hijo) { hijo._parent = this; this._children.push(hijo); return hijo; },
        removeChild(hijo) {
            const i = this._children.indexOf(hijo);
            if (i >= 0) this._children.splice(i, 1);
            return hijo;
        },
        addEventListener(tipo, fn) {
            (this._listeners[tipo] = this._listeners[tipo] || []).push(fn);
        },
        removeEventListener(tipo, fn) {
            const l = this._listeners[tipo];
            if (l) this._listeners[tipo] = l.filter((f) => f !== fn);
        },
        dispatch(tipo, ev = {}) {
            const evento = Object.assign({
                type: tipo, target: this, preventDefault() {}, stopPropagation() {}
            }, ev);
            for (const fn of (this._listeners[tipo] || []).slice()) fn(evento);
        },
        focus() {},
        walk(salida = []) {
            for (const h of this._children) { salida.push(h); h.walk(salida); }
            return salida;
        },
        querySelector() { return null; },
        querySelectorAll() { return []; }
    };
    return el;
}

const cuerpo = crear('body');
const cabeza = crear('head');
definir('document', {
    body: cuerpo,
    head: cabeza,
    createElement: crear,
    getElementById(id) {
        return cabeza.walk().concat(cuerpo.walk()).find((e) => e.id === id) || null;
    }
});

const winListeners = Object.create(null);
const ventana = {
    addEventListener(tipo, fn) { (winListeners[tipo] = winListeners[tipo] || []).push(fn); },
    removeEventListener(tipo, fn) {
        const l = winListeners[tipo];
        if (l) winListeners[tipo] = l.filter((f) => f !== fn);
    },
    dispatch(tipo, ev = {}) {
        for (const fn of (winListeners[tipo] || []).slice()) fn(Object.assign({ type: tipo }, ev));
    }
};
definir('window', ventana);
definir('navigator', { getGamepads: () => [] });
definir('localStorage', {
    _d: {},
    getItem(k) { return this._d[k] === undefined ? null : this._d[k]; },
    setItem(k, v) { this._d[k] = String(v); }
});
// El sondeo del mando no debe arrancar un intervalo real dentro de la prueba.
definir('setInterval', () => 7);
definir('clearInterval', () => {});

const C = await load('src/ui/ControlsScreen.js');

function routerFalso() {
    return {
        bindings: {},
        padMap: {},
        enabled: false,
        setEnabled(v) { this.enabled = v; },
        releaseAll() {}, releaseTouch() {},
        setBindings(m) { this.bindings = m; },
        setPadMap(m) { this.padMap = m; },
        detectPad() { return { id: 'Pad de prueba' }; },
        captureNextKey() { return () => {}; }
    };
}
function botonCon(texto) {
    return cuerpo.walk().find((e) => e.tagName === 'BUTTON' && e.textContent === texto) || null;
}
function escuchas(tipo) { return (winListeners[tipo] || []).length; }

// ===========================================================================
section('1 · El estado nace listo para sondear');
// ===========================================================================
{
    const s = new C.ControlsScreen(routerFalso());
    check('la foto anterior del mando existe desde el principio',
        Array.isArray(s._padPrev) && s._padPrev.length === 0, s._padPrev);
    check('el aviso de mando existe antes de build()', typeof s._onPadChange === 'function');
    check('no hay un resolve colgado de otra apertura', s._resolve === null);
}

// ===========================================================================
section('2 · GUARDAR Y VOLVER resuelve la promesa');
// ===========================================================================
{
    const s = new C.ControlsScreen(routerFalso());
    const promesa = s.open().then(() => 'cerrado');
    check('open() guarda el resolve', typeof s._resolve === 'function');
    check('los listeners de mando se registran en window', escuchas('gamepadconnected') === 1,
        escuchas('gamepadconnected'));

    const back = botonCon('GUARDAR Y VOLVER');
    check('el boton existe en el arbol', !!back);
    back.dispatch('click');
    const resultado = await Promise.race([
        promesa,
        new Promise((res) => setTimeout(() => res('timeout'), 100))
    ]);
    check('la promesa se resuelve', resultado === 'cerrado', resultado);
    check('y se limpia el resolve', s._resolve === null);
    check('close() quita los listeners de window', escuchas('gamepadconnected') === 0,
        escuchas('gamepadconnected'));
    check('y devuelve el router al juego', s.router.enabled === true, s.router.enabled);
}

// ===========================================================================
section('3 · El mando se lee por indices, sin TypeError');
// ===========================================================================
{
    const s = new C.ControlsScreen(routerFalso());
    s.open();
    let asignado = null;
    s.assignPad = (accion, indice) => { asignado = [accion, indice]; };
    s.listening = 'attack1';

    definir('navigator', {
        getGamepads: () => [{ connected: true, buttons: [{ pressed: false }, { pressed: false }] }]
    });
    s.pollPad();
    check('sin pulsacion no asigna nada', asignado === null, asignado);
    check('y toma la foto de los botones', s._padPrev[0] === false && s._padPrev[1] === false,
        s._padPrev);

    definir('navigator', {
        getGamepads: () => [{ connected: true, buttons: [{ pressed: false }, { pressed: true }] }]
    });
    s.pollPad();
    check('una pulsacion nueva se asigna por indice',
        asignado && asignado[0] === 'attack1' && asignado[1] === 1, asignado);
    s.close();
}

// ===========================================================================
section('4 · Un boton del mando no corrompe el mapa de teclado');
// ===========================================================================
{
    const r = routerFalso();
    const s = new C.ControlsScreen(r);
    s.open();
    s.assignPad('up', 12);
    check('la cruceta se guarda como indice en el mapa del mando',
        Array.isArray(r.padMap.up) && r.padMap.up[0] === 12, r.padMap.up);
    check('y NO se escribe en el mapa de teclado', !Array.isArray(r.bindings.up), r.bindings.up);
    s.assignPad('attack1', 0);
    check('un boton de cara tambien es un indice', r.padMap.attack1[0] === 0, r.padMap.attack1);
    s.close();
}

// ===========================================================================
section('5 · El menu de modos elige con teclado y cierra la promesa');
// ===========================================================================
{
    const M = await load('src/ui/ModeSelect.js');
    const m = new M.ModeSelect();
    const promesa = m.pick().then((r) => r.modo);
    check('pick() guarda el resolve', typeof m.resolve === 'function');
    check('hay cuatro modos', M.MODES.length === 4);
    ventana.dispatch('keydown', { code: 'ArrowDown', preventDefault() {} });
    check('abajar mueve el foco', m.index === 1, m.index);
    ventana.dispatch('keydown', { code: 'Enter', preventDefault() {} });
    const elegido = await Promise.race([
        promesa,
        new Promise((res) => setTimeout(() => res('timeout'), 100))
    ]);
    check('Enter confirma el modo enfocado', elegido === 'DIORAMA', elegido);
    check('y limpia el resolve', m.resolve === null);
    check('y suelta el listener de teclado', escuchas('keydown') === 0, escuchas('keydown'));
}

// ===========================================================================
console.log('\n' + '='.repeat(64));
if (failed.length) {
    console.log('FALLOS (' + failed.length + '):');
    for (const f of failed) console.log('  - ' + f);
}
console.log('\n' + passed + ' comprobaciones, ' + failed.length + ' fallos');
process.exit(failed.length ? 1 : 0);
