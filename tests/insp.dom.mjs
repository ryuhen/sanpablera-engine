/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/insp.dom.mjs
 * ----------------------------------------------------------------------------
 * Pruebas de la INTERFAZ del inspector, con un DOM de mentira.
 *
 * POR QUE ESTAS PRUEBAS EXISTEN Y NO SE PUEDEN SUSTITUIR LEYENDO
 * ----------------------------------------------------------------------------
 *   `overrides.smoke.mjs` comprueba la capa de datos (que un override cambia la
 *   pose, que las tablas siguen congeladas, que los objetivos estan al alcance).
 *   Eso deja fuera la mitad del inspector: el DOM.
 *
 *   Y el DOM es donde se cuelan los fallos que mas molestan, porque NO DAN
 *   EXCEPCION. Un `this.$('spf-sliders')` mal escrito da `null`, y
 *   `null.addEventListener` revienta al construir... pero un `id` mal escrito
 *   dentro de un `innerHTML` no revienta nada: simplemente no aparece ningun
 *   slider, el panel se abre vacio y no hay ningun error en ninguna consola.
 *   Un panel de sliders que no tiene sliders es indistinguible de un panel
 *   funcionando si no se mira de cerca.
 *
 *   Aqui se comprueba, sobre un DOM minimo de mentira:
 *     - que todos los `id` que pide el codigo EXISTEN en el HTML que el
 *       propio inspector genera (que es la unica forma de saber que el
 *       cableado y el marcado no se han desincronizado);
 *     - que la rueda sobre un slider mueve el valor (el ajuste fino por rueda
 *       es la razon de existir del panel);
 *     - que al mover un slider se llama a `applyPose` con una pose distinta
 *       (es decir: que el ajuste se ve, no solo se guarda);
 *     - que cerrar y abrir varias veces no duplica nodos ni deja el panel
 *       "abierto" cuando esta cerrado (el fallo congelaria el combate sin que
 *       se viera nada en pantalla).
 *
 * EL DOM DE MENTIRA
 *   No se usa jsdom: no esta en las dependencias y meter una libreria de 3 MB
 *   para comprobar cuatro cosas seria anadir una dependencia permanente al
 *   proyecto para poder borrar veinte lineas. Lo que se necesita es lo de
 *   siempre:
 *   createElement, appendChild, querySelector por id, classList, addEventListener,
 *   dispatchEvent e innerHTML con el que se pueda buscar por texto.
 *
 *   node tests/insp.dom.mjs
 * ============================================================================
 */
import { load } from './loader.mjs';

// ===========================================================================
// EL DOM DE MENTIRA
// ===========================================================================
function installDom() {
    const byId = new Map();

    /** Define un global aunque sea de solo lectura (Node 22+ lo tiene asi). */
    const definir = (nombre, valor) => Object.defineProperty(globalThis, nombre, {
        value: valor, writable: true, configurable: true
    });

    function clase(el) {
        const set = new Set((el._class || '').split(' ').filter(Boolean));
        return {
            add: (c) => set.add(c),
            remove: (c) => set.delete(c),
            contains: (c) => set.has(c),
            get value() { return Array.from(set).join(' '); },
            set value(v) { set = new Set(v.split(' ').filter(Boolean)); }
        };
    }

    function crear(tag) {
        const el = {
            tagName: (tag || 'div').toUpperCase(),
            _class: '',
            _children: [],
            _parent: null,
            style: {},
            dataset: {},
            attributes: {},
            _listeners: {},
            _value: '',
            _html: '',
            textContent: '',
            get className() { return this._class; },
            set className(v) { this._class = v; },
            get value() { return this._value; },
            set value(v) { this._value = String(v); },
            get min() { return this._min === undefined ? '0' : String(this._min); },
            set min(v) { this._min = v; },
            get max() { return this._max === undefined ? '100' : String(this._max); },
            set max(v) { this._max = v; },
            get step() { return this._step === undefined ? '1' : String(this._step); },
            set step(v) { this._step = v; },
            set innerHTML(h) {
                this._html = h;
                // El inspector pone todo su marcado en UN solo innerHTML. Lo que
                // se necesita aqui es poder localizar lo que el codigo va a
                // buscar despues: los `id`. Se recorre el texto del HTML, que
                // es exactamente lo que un navegador haria al construirlo.
                byId.clear();
                const re = /\bid="([^"]+)"/g;
                let m;
                while ((m = re.exec(h)) !== null) {
                    const hijo = crear('div');
                    hijo.id = m[1];
                    hijo._class = (h.slice(Math.max(0, m.index - 120), m.index).match(/class="([^"]*)"\s*$/)
                        || [, ''])[1];
                    this._children.push(hijo);
                    hijo._parent = this;
                    byId.set(m[1], hijo);
                }
            },
            get innerHTML() { return this._html; },
            appendChild(hijo) {
                hijo._parent = this;
                this._children.push(hijo);
                if (hijo.id) byId.set(hijo.id, hijo);
                return hijo;
            },
            removeChild(hijo) {
                const i = this._children.indexOf(hijo);
                if (i >= 0) this._children.splice(i, 1);
                if (hijo.id) byId.delete(hijo.id);
                return hijo;
            },
            remove() {
                if (this._parent) this._parent.removeChild(this);
            },
            setAttribute(k, v) { this.attributes[k] = String(v); },
            getAttribute(k) { return this.attributes[k] === undefined ? null : this.attributes[k]; },
            removeAttribute(k) { delete this.attributes[k]; },
            addEventListener(tipo, fn) {
                (this._listeners[tipo] = this._listeners[tipo] || []).push(fn);
            },
            removeEventListener(tipo, fn) {
                const l = this._listeners[tipo];
                if (l) this._listeners[tipo] = l.filter((f) => f !== fn);
            },
            dispatchEvent(ev) {
                ev.target = ev.target || el;
                ev.preventDefault = ev.preventDefault || (() => { ev._prevented = true; });
                ev.stopPropagation = ev.stopPropagation || (() => { ev._stopped = true; });
                // El `wheel` del panel se registra con `{passive:false}` y usa
                // `preventDefault` para no hacer scroll de la pagina; sin esto
                // el evento se propagaria a la ventana y moveria el juego.
                const l = this._listeners[ev.type] || [];
                for (const fn of l.slice()) fn(ev);
                // Y luego sube al padre, que es lo que hace un evento de verdad.
                if (!ev._stopped && ev.type !== 'click' && this._parent) {
                    this._parent.dispatchEvent(ev);
                }
                return !ev._prevented;
            },
            /** Dispara un click sin construir un evento completo. */
            click() {
                const ev = { type: 'click', target: el };
                el.dispatchEvent(ev);
            },
            /** Todos los descendientes (para contar sliders, botones, etc.). */
            walk(salida = []) {
                for (const h of this._children) { salida.push(h); h.walk(salida); }
                return salida;
            },
            querySelector(sel) {
                if (sel.charAt(0) === '#') {
                    return byId.get(sel.slice(1)) || null;
                }
                // Selector de clase: suficiente para lo que usa el inspector.
                const clase = sel.replace(/^\./, '');
                const todos = this.walk();
                return todos.find((h) => (h._class || '').split(' ').includes(clase)) || null;
            }
        };
        el.classList = clase(el);
        return el;
    }

    const cuerpo = crear('body');
    const cabeza = crear('head');
    const raiz = { body: cuerpo, head: cabeza, byId, crear };

    definir('document', {
        body: cuerpo,
        head: cabeza,
        activeElement: null,
        createElement: (t) => crear(t),
        getElementById: (id) => byId.get(id) || null,
        execCommand: () => true
    });
    // `window` TIENE que ser un objeto de verdad, no un `{...}` literal.
    //
    // `fsm/Constants.js` hace `(function(SPF){...})(window)` y espera poder
    // colgar su namespace en `window.SPF`. Con un objeto literal, la
    // propiedad se crearia bien, pero si el modulo se evalua antes de que se
    // asigne `window` (que es justo lo que pasa en estas pruebas, porque
    // `load()` es asincrono) se iria a `globalThis` y las importaciones que
    // esperan `SPF` en `window` no lo encontrarian.
    //
    // Con un objeto real, las dos rutas (window y globalThis) terminan en el
    // mismo sitio, que es ademas lo que hace el motor en el navegador.
    const ventana = {
        addEventListener: () => {},
        removeEventListener: () => {}
    };
    definir('window', ventana);
    definir('localStorage', {
        _d: {},
        getItem(k) { return this._d[k] === undefined ? null : this._d[k]; },
        setItem(k, v) { this._d[k] = String(v); }
    });
    // `navigator` existe en Node desde la 22 y es de SOLO LECTURA: asignarlo
    // con `=` lanza. Se define con `defineProperty`, que si lo permite.
    // (Es el mismo motivo por el que el codigo del inspector no debe tocar
    // estos globales: si los Definiera, en el navegador no tendrian efecto.)
    definir('navigator', {});
    definir('Blob', function (parts) { this.parts = parts; });
    definir('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} });
    definir('Event', function (type, o) {
        this.type = type;
        if (o && o.bubbles) this._bubbles = true;
    });
    return raiz;
}

// ===========================================================================
// EL CONTADOR
// ===========================================================================
let pass = 0;
const fails = [];
const ok = (cond, name, extra) => {
    if (cond) { pass++; return true; }
    fails.push(extra !== undefined ? `${name} :: ${extra}` : name);
    return false;
};
const section = (t) => console.log('\n' + t);
const run = (name, fn) => {
    console.log(`\n[${name}]`);
    const before = fails.length;
    const beforePass = pass;
    try { fn(); } catch (e) {
        fails.push(`${name} lanzo: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`);
    }
    console.log(`  ${fails.length === before ? 'ok  ' : 'FALLO'} ${name} (${pass - beforePass} comprobaciones)`);
};

// ===========================================================================
installDom();

const O = await load('src/core/anim/Overrides.js');
const I = await load('src/core/anim/Inspector.js');
const RigMod = await load('src/core/cine/Rig.js');
const { BONES } = await load('src/core/cine/CineConstants.js');

function contractRig() {
    const bones = BONES.map((b) => ({
        name: b.name, parentName: b.parent,
        localT: b.offset.slice(), localQ: [0, 0, 0, 1]
    }));
    const map = Object.create(null);
    for (const b of BONES) map[b.name] = b.name;
    return RigMod.buildRig({ map, missing: [], duplicates: [] }, bones, { scale: 1, rootFix: 'Y_UP' });
}
const rig = contractRig();

/** Un modelo de mentira que registra las poses que se le escriben. */
function fakeModel() {
    const poses = [];
    return {
        rig,
        poses,
        applyPose(pose, state) { poses.push(state.p.HAND_L.slice()); },
        place() {}
    };
}

// ===========================================================================
section('1 · El panel se construye y se cablea');
// ===========================================================================

run('el constructor no rompe y nace cerrado', () => {
    const model = fakeModel();
    const insp = new I.AnimInspector({ model });
    ok(!!insp.el, 'crea su elemento');
    ok(insp.isOpen() === false, 'y arranca CERRADO', insp.isOpen());
    ok(insp.el.getAttribute('hidden') !== null, 'con el atributo hidden puesto');
    ok(insp.el.style.display === 'none', 'y con display none');
});

run('TODOS los id que pide el codigo existen en su HTML', () => {
    // ESTA ES LA PRUEBA QUE MAS FALLOS ADELANTA CUANDO SE TOCA EL MARCADO.
    //
    // Un `id` mal escrito no da excepcion en ninguna parte: el `querySelector`
    // devuelve `null` y, si el codigo no lo comprueba, el elemento simplemente
    // no esta. El panel se abre, se ve la cabecera, y no hay ni un slider.
    // Aqui se listan a mano los ids que el inspector busca por su cuenta y se
    // comprueba que el HTML que genera los trae todos.
    const model = fakeModel();
    const insp = new I.AnimInspector({ model });
    const NECESARIOS = [
        'spf-close',      // boton de cerrar
        'spf-play',       // play / pausa
        'spf-t',          // scrubber de la fase
        'spf-tv',         // porcentaje del scrubber
        'spf-kind',       // pestanas GOLPE / REACCION / SUELO / LEVANTADA
        'spf-opts',       // las filas de opciones (familia, contexto, fase)
        'spf-frames',     // la linea de tiempo del golpe
        'spf-read',       // la lectura (cadera, mano, pie, cabeza)
        'spf-alcance',    // el aviso de alcance
        'spf-nota',       // la nota de la fila
        'spf-sliders',    // donde van los sliders
        'spf-count',      // el contador de ajustes sin volcar
        'spf-copy', 'spf-copy-json', 'spf-save', 'spf-load', 'spf-reset'
    ];
    // Se reconstruye el marcado (el `byId` se llena al fijar innerHTML).
    const html = insp.el.innerHTML;
    const faltan = [];
    for (const id of NECESARIOS) {
        if (html.indexOf('id="' + id + '"') === -1) faltan.push(id);
    }
    ok(faltan.length === 0, 'el HTML trae todos los ids que el codigo usa', faltan);

    // Y el DOM construido los expone de verdad (no solo el texto del HTML).
    const noResueltos = NECESARIOS.filter((id) => insp.$(id) === null);
    ok(noResueltos.length === 0, 'y el DOM los resuelve', noResueltos);
});

run('abrir y cerrar varias veces no duplica nada', () => {
    // Si `open()` construyera el DOM otra vez en vez de solo mostrarlo, cada
    // F2 duplicaria el panel entero. Con veinte aperturas se notaria; con
    // dos, no. Se comprueba el conteo de hijos del body, que es lo que crece.
    const antes = document.body.walk().length;
    const model = fakeModel();
    const insp = new I.AnimInspector({ model });
    const conUno = document.body.walk().length;
    for (let i = 0; i < 20; i++) {
        insp.open();
        insp.close();
    }
    ok(document.body.walk().length === conUno,
        'el numero de nodos no crece con 20 aperturas',
        [antes, conUno, document.body.walk().length]);
    ok(insp.isOpen() === false, 'y al terminar esta cerrado');
});

// ===========================================================================
section('2 · Los sliders');
// ===========================================================================

run('la vista de GOLPE genera sliders', () => {
    const model = fakeModel();
    const insp = new I.AnimInspector({ model });
    O.clearAll();
    insp.open();
    const filas = insp.$('spf-sliders')._children;
    ok(filas.length > 0, 'hay sliders', filas.length);
    // Cada fila tiene que tener los cuatro elementos: etiqueta, rango, numero
    // y el boton de volver al valor del fichero. Una fila con el rango pero sin
    // el boton de reset deja al usuario sin salida (no puede volver al valor
    // del codigo sin recargar la pagina).
    const conReset = filas.filter((f) => (f._class || '').indexOf('spf-sl-x') !== -1).length;
    ok(conReset === filas.length, 'todas tienen boton de reset', [conReset, filas.length]);
    insp.close();
});

run('la rueda sobre un slider lo mueve UN paso', () => {
    const model = fakeModel();
    const insp = new I.AnimInspector({ model });
    O.clearAll();
    insp.open();

    const fila = insp.$('spf-sliders')._children[0];
    const rng = fila._children[1];      // [label, range, number, unit, reset]
    ok((rng._class || '').indexOf('spf-rng') !== -1, 'el segundo hijo es el rango',
        rng._class);
    const antes = Number(rng.value);
    const paso = Number(rng.step);

    // Una rueda "hacia abajo" (deltaY > 0) tiene que RESTAR un paso: bajar el
    // scroll baja el numero. Al reves, seria el fallo de signo clasico, que no
    // da error y hace que la rueda accelerates en vez de afinar.
    insp.$('spf-sliders').dispatchEvent({ type: 'wheel', target: rng, deltaY: 120 });
    const despues = Number(rng.value);
    ok(Math.abs((antes - despues) - paso) < 1e-9,
        'la rueda hacia abajo resta exactamente un paso', [antes, despues, paso]);

    // Y al reves suma.
    insp.$('spf-sliders').dispatchEvent({ type: 'wheel', target: rng, deltaY: -120 });
    const vuelta = Number(rng.value);
    ok(Math.abs(vuelta - antes) < 1e-9, 'y la de arriba lo devuelve', [antes, vuelta]);

    // Y no se sale del rango.
    rng.value = rng.max;
    insp.$('spf-sliders').dispatchEvent({ type: 'wheel', target: rng, deltaY: -120 });
    ok(Number(rng.value) <= Number(rng.max), 'no se pasa del maximo', rng.value);
    insp.close();
});

run('la rueda FUERA de un slider no toca nada', () => {
    // Si el listener de la rueda no filtra por clase, cualquier scroll sobre el
    // panel moveria el primer slider. Con el scroll del panel lleno de
    // sliders eso es facil de que pase por descuido.
    const model = fakeModel();
    const insp = new I.AnimInspector({ model });
    O.clearAll();
    insp.open();
    const filas = insp.$('spf-sliders')._children;
    const rng = filas[0]._children[1];
    const antes = Number(rng.value);
    insp.$('spf-sliders').dispatchEvent({
        type: 'wheel', target: insp.$('spf-sliders'), deltaY: 120
    });
    ok(Number(rng.value) === antes, 'el scroll del panel no mueve sliders',
        [antes, rng.value]);
    insp.close();
});

run('mover un slider CAMBIA la pose del modelo (se ve en vivo)', () => {
    // Este es el motivo de que el panel exista: el ajuste se ve mientras se
    // mueve, no al soltar. Se comprueba que `applyPose` recibe una mano
    // distinta despues del cambio.
    const model = fakeModel();
    const insp = new I.AnimInspector({ model });
    O.clearAll();
    insp.open();
    const antes = model.poses[model.poses.length - 1];

    O.setOverride('ATTACK_SILHOUETTES.JAB.STAND.armL.active.2', 0.20);
    insp.apply();
    const despues = model.poses[model.poses.length - 1];

    ok(despues[2] < antes[2] - 0.15, 'la mano se ha movido de verdad',
        [antes[2].toFixed(3), despues[2].toFixed(3)]);
    ok(O.overrideCount() === 1, 'y el override queda registrado');
    O.clearAll();
    insp.close();
});

run('el boton de reset devuelve el valor del fichero', () => {
    const model = fakeModel();
    const insp = new I.AnimInspector({ model });
    O.clearAll();
    insp.open();

    // Busca la fila que sea `base.hip` del jab de pie, para no depender del
    // orden en que se recorren las claves del objeto.
    const filas = insp.$('spf-sliders')._children;
    let filaHip = null;
    for (const f of filas) {
        if (f._children[0] && f._children[0].textContent === 'base.hip') { filaHip = f; break; }
    }
    ok(filaHip !== null, 'esta la fila de base.hip',
        filas.slice(0, 6).map((f) => f._children[0] && f._children[0].textContent));

    if (filaHip) {
        const original = filaHip._children[2].value;
        O.setOverride('ATTACK_SILHOUETTES.JAB.STAND.base.hip', 0.55);
        insp.refresh();
        // Tras el refresh el valor mostrado tiene que ser el del override.
        const conParche = insp.$('spf-sliders')._children
            .find((f) => f._children[0] && f._children[0].textContent === 'base.hip');
        ok(Number(conParche._children[2].value) === 0.55,
            'el slider muestra el valor del override', conParche._children[2].value);
        ok((conParche._class || '').indexOf('mod') !== -1,
            'y la fila se marca como modificada', conParche._class);
        // Y el reset lo devuelve.
        const reset = conParche._children[4];
        reset.click();
        ok(O.overrideAt('ATTACK_SILHOUETTES.JAB.STAND.base.hip') === undefined,
            'el reset quita el override');
        const trasReset = insp.$('spf-sliders')._children
            .find((f) => f._children[0] && f._children[0].textContent === 'base.hip');
        ok(Number(trasReset._children[2].value) === Number(original),
            'y el slider vuelve al valor del fichero',
            [original, trasReset._children[2].value]);
    }
    O.clearAll();
    insp.close();
});

// ===========================================================================
section('3 · Las otras vistas');
// ===========================================================================

run('cambiar de vista repinta y no rompe', () => {
    const model = fakeModel();
    const insp = new I.AnimInspector({ model });
    O.clearAll();
    insp.open();
    for (const kind of ['REACTION', 'GROUND', 'WAKEUP', 'ATTACK']) {
        insp.view.kind = kind;
        insp.refresh();
        insp.apply();
        ok(model.poses.length > 0, `${kind}: se aplica una pose`);
        // En las vistas sin tabla de numeros (SUELO, LEVANTADA) no hay sliders,
        // pero NO puede reventar: se dice con un texto y ya.
        const sliders = insp.$('spf-sliders')._children;
        ok(sliders.length >= 0, `${kind}: la lista de sliders existe`);
        if (kind === 'GROUND' || kind === 'WAKEUP') {
            ok(sliders.length === 0, `${kind}: no hay sliders (se edita en codigo)`,
                sliders.length);
            ok((insp.$('spf-sliders')._html || insp.$('spf-sliders').textContent || '').length > 0,
                `${kind}: y se explica por que`);
        } else {
            ok(sliders.length > 0, `${kind}: hay sliders`, sliders.length);
        }
    }
    insp.close();
});

run('la matriz de reacciones da los 9 conjuntos de sliders', () => {
    const model = fakeModel();
    const insp = new I.AnimInspector({ model });
    O.clearAll();
    insp.open();
    insp.view.kind = 'REACTION';
    let conSliders = 0;
    for (const height of ['ALTO', 'MEDIO', 'BAJO']) {
        for (const power of ['DEBIL', 'MEDIO', 'FUERTE']) {
            insp.view.height = height;
            insp.view.power = power;
            insp.refresh();
            const n = insp.$('spf-sliders')._children.length;
            if (n > 0) conSliders++;
        }
    }
    ok(conSliders === 9, 'las nueve filas tienen numeros', conSliders);
    insp.close();
});

run('el aviso de alcance aparece cuando el objetivo no se alcanza', () => {
    const model = fakeModel();
    const insp = new I.AnimInspector({ model });
    O.clearAll();
    insp.open();
    // Con la tabla buena: sin aviso.
    insp.apply();
    const cont = insp.$('spf-alcance');
    ok(cont._children.length > 0, 'hay algo en el hueco del aviso');
    ok((cont._children[0]._class || '').indexOf('ok') !== -1,
        'y dice que es alcanzable', cont._children[0]._class);

    // Con un objetivo imposible: aviso rojo con la magnitud de lo que falta.
    O.setOverride('ATTACK_SILHOUETTES.JAB.STAND.armL.active.2', 1.20);
    insp.apply();
    const cont2 = insp.$('spf-alcance');
    ok(cont2._children.length > 1, 'sale el aviso con su explicacion',
        cont2._children.length);
    ok((cont2._children[0]._class || '').indexOf('bad') !== -1,
        'en rojo', cont2._children[0]._class);
    ok((cont2._children[1]._class || '').indexOf('spf-alc-nota') !== -1,
        'con el texto que dice cuanto falta');
    O.clearAll();
    insp.close();
});

// ===========================================================================
section('4 · Guardar, cargar y volcar al codigo');
// ===========================================================================

run('GUARDAR y CARGAR van y vuelven por localStorage', () => {
    const model = fakeModel();
    const insp = new I.AnimInspector({ model });
    O.clearAll();
    insp.open();
    O.setOverride('ATTACK_SILHOUETTES.JAB.STAND.base.hip', 0.70);
    O.setOverride('HIT_REACTIONS.ALTO.FUERTE.recover', 0.44);

    insp.$('spf-save').click();
    ok(localStorage.getItem('sanpablera.anim.overrides') !== null, 'se guarda algo');

    O.clearAll();
    ok(O.overrideCount() === 0, 'se borra');
    insp.$('spf-load').click();
    ok(O.overrideCount() === 2, 'y se recuperan los dos',
        O.overrideCount());
    ok(O.overrideAt('ATTACK_SILHOUETTES.JAB.STAND.base.hip') === 0.70, 'con el valor');
    ok(O.overrideAt('HIT_REACTIONS.ALTO.FUERTE.recover') === 0.44, 'los dos');
    O.clearAll();
    insp.close();
});

run('DESCARTAR vacia el parche y repinta', () => {
    const model = fakeModel();
    const insp = new I.AnimInspector({ model });
    O.clearAll();
    insp.open();
    O.setOverride('ATTACK_SILHOUETTES.JAB.STAND.base.hip', 0.70);
    insp.refresh();
    insp.$('spf-reset').click();
    ok(O.overrideCount() === 0, 'el parche queda vacio');
    const fila = insp.$('spf-sliders')._children
        .find((f) => f._children[0] && f._children[0].textContent === 'base.hip');
    ok(fila !== undefined, 'y la fila sigue ahi');
    ok((fila._class || '').indexOf('mod') === -1, 'ya sin la marca de modificada',
        fila._class);
    insp.close();
});

run('el contador dice cuantos ajustes hay sin volcar', () => {
    // Es lo que evita el peor final: cerrar el navegador con veinte ajustes en
    // la cabeza y perderlos. El contador esta en rojo y en mayusculas.
    const model = fakeModel();
    const insp = new I.AnimInspector({ model });
    O.clearAll();
    insp.open();
    insp.refresh();
    ok(insp.$('spf-count').textContent === 'sin ajustes',
        'sin nada, dice que no hay', insp.$('spf-count').textContent);
    O.setOverride('A.b', 1);
    insp.refresh();
    ok(insp.$('spf-count').textContent === '1 ajuste SIN volcar al codigo',
        'con uno, lo dice con mayusculas', insp.$('spf-count').textContent);
    O.setOverride('A.c', 2);
    insp.refresh();
    ok(insp.$('spf-count').textContent === '2 ajustes SIN volcar al codigo',
        'con dos, en plural', insp.$('spf-count').textContent);
    O.clearAll();
    insp.close();
});

// ===========================================================================
section('5 · El bucle');
// ===========================================================================

run('tick() avanza el scrubber solo si esta reproduciendo', () => {
    const model = fakeModel();
    const insp = new I.AnimInspector({ model });
    O.clearAll();
    insp.open();
    insp.view.t = 0;
    insp.tick(0.5);
    ok(insp.view.t === 0, 'en pausa no avanza', insp.view.t);

    insp.playing = true;
    insp.tick(0.5);
    ok(insp.view.t > 0, 'reproduciendo avanza', insp.view.t);

    // Y da la vuelta al llegar al final (si no, se queda parado en 1 y parece
    // que el play no funciona).
    insp.view.t = 0.999;
    insp.tick(1.0);
    ok(insp.view.t < 1, 'y vuelve al principio en vez de quedarse en 1',
        insp.view.t);
    insp.close();
});

run('tick() con el panel cerrado no toca la pose', () => {
    // El bucle del motor comprueba `isOpen()` antes de llamar, pero el inspector
    // no debe DEPENDER de esa comprobacion: si alguien lo llama sin comprobar,
    // el combate se congela escribiendo poses por debajo del panel cerrado.
    const model = fakeModel();
    const insp = new I.AnimInspector({ model });
    O.clearAll();
    insp.open();
    insp.close();
    const antes = model.poses.length;
    insp.tick(0.5);
    ok(model.poses.length === antes, 'no aplica ninguna pose', [antes, model.poses.length]);
});

run('cerrar llama a onClose (para soltar el teclado)', () => {
    // Sin esto, el WASD se queda pulsado al abrir el panel y el peleador
    // camina solo al cerrarlo.
    let llamadas = 0;
    const model = fakeModel();
    const insp = new I.AnimInspector({ model, onClose: () => { llamadas++; } });
    O.clearAll();
    insp.open();
    ok(llamadas === 0, 'abrir no lo llama');
    insp.close();
    ok(llamadas === 1, 'cerrar si', llamadas);
    insp.open();
    insp.close();
    ok(llamadas === 2, 'y una vez por cierre', llamadas);
});

run('onZoom se llama con la delta de la rueda sobre la escena', () => {
    // El zoom de camara llega por aqui; si no llegara, ctrl+rueda no haria
    // nada y no habria forma de mirar si un jab llega a la altura de la cara.
    let z = 0;
    const model = fakeModel();
    const insp = new I.AnimInspector({ model, onZoom: (d) => { z += d; } });
    O.clearAll();
    insp.open();
    insp.el.dispatchEvent({ type: 'wheel', target: insp.el, deltaY: 120 });
    ok(z === 1, 'la rueda abajo aleja', z);
    insp.el.dispatchEvent({ type: 'wheel', target: insp.el, deltaY: -120 });
    ok(z === 0, 'la de arriba acerca', z);
    // Y sobre un slider NO debe llegar a la camara (ahi manda el ajuste).
    const rng = insp.$('spf-sliders')._children[0]._children[1];
    const z0 = z;
    insp.el.dispatchEvent({ type: 'wheel', target: rng, deltaY: 120 });
    ok(z === z0, 'sobre un slider no toca la camara', [z0, z]);
    insp.close();
});

// ===========================================================================
console.log('\n' + '='.repeat(64));
if (fails.length) {
    console.log(`FALLOS (${fails.length}):`);
    for (const f of fails) console.log('  - ' + f);
}
console.log(`\n${pass} comprobaciones, ${fails.length} fallos`);
process.exit(fails.length ? 1 : 0);