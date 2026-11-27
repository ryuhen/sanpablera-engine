/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/loadingscreen.dom.mjs
 * ----------------------------------------------------------------------------
 * El "calentamiento" de la pantalla de carga, probado sin navegador. LoadingScreen
 * depende de SVG, rAF y pantalla completa, asi que aqui se ejercitan los METODOS
 * del prototipo con un DOM minimo. Lo que se comprueba es justo lo que puede
 * fallar en silencio: que las dianas no adelantan la barra, que las teclas
 * J/K/L y el raton golpean el carril correcto y que `holdUntilDone` retarda
 * el cierre hasta que el motor llama a `dismiss()`.
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

function clase() {
    const set = new Set();
    return {
        add: (c) => set.add(c),
        remove: (c) => set.delete(c),
        contains: (c) => set.has(c),
        values: () => [...set]
    };
}
function elemento() {
    return {
        textContent: '',
        hidden: false,
        disabled: false,
        classList: clase(),
        listeners: Object.create(null),
        addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); },
        removeEventListener(t, fn) {
            const l = this.listeners[t] || [];
            const i = l.indexOf(fn);
            if (i >= 0) l.splice(i, 1);
        },
        disparar(t, ev = {}) {
            for (const fn of (this.listeners[t] || [])) fn({ preventDefault() {}, ...ev });
        }
    };
}
function maqueta() {
    return {
        _play: {
            lanes: [0.35, 0.8, 1.25].map(next => ({ next, active: false, life: 0, flash: 0, miss: 0 })),
            score: 0, combo: 0, hits: 0, misses: 0
        },
        laneEls: [elemento(), elemento(), elemento()],
        _onLaneClicks: [],
        score: elemento(),
        playTitle: elemento(),
        playHint: elemento(),
        rng: () => 0.5,
        progress: 0.42,
        // La maqueta es un objeto llano: le prestamos el metodo que en la clase
        // viene del prototipo, porque _hit() lo llama al pintar el marcador.
        _renderPlay: proto._renderPlay
    };
}

const win = {
    listeners: Object.create(null),
    addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); },
    removeEventListener(t, fn) {
        const l = this.listeners[t] || [];
        const i = l.indexOf(fn);
        if (i >= 0) l.splice(i, 1);
    }
};
Object.defineProperty(globalThis, 'window', { value: win, writable: true, configurable: true });

const L = await load('src/ui/LoadingScreen.js');
const proto = L.LoadingScreen.prototype;

section('1 · Las dianas aparecen solas y no tocan la carga');
{
    const f = maqueta();
    proto._tickPlay.call(f, 1300);
    check('las tres dianas se encienden', f.laneEls.every(e => e.classList.contains('on')));
    check('ninguna se ha golpeado todavia', f._play.hits === 0);
    proto._hit.call(f, 0);
    check('el golpe suma puntos', f._play.score === 12, f._play.score);
    check('la racha sube', f._play.combo === 1);
    check('el marcador se pinta', f.score.textContent.includes('12 puntos'), f.score.textContent);
    check('la barra real NO se mueve', f.progress === 0.42, f.progress);
    check('el carril acertado se apaga', !f.laneEls[0].classList.contains('on'));
    check('el destello se pinta', f.laneEls[0].classList.contains('hit'));
}

section('2 · Fallar y dejar pasar cortan la racha, no la partida');
{
    const f = maqueta();
    proto._tickPlay.call(f, 1300);
    proto._hit.call(f, 1);
    const puntos = f._play.score;
    proto._hit.call(f, 1);   // el carril ya estava apagado
    check('un fallo no resta puntos', f._play.score === puntos, f._play.score);
    check('un fallo corta la racha', f._play.combo === 0);
    check('el fallo se cuenta', f._play.misses === 1);
    check('el fallo se pinta', f.laneEls[1].classList.contains('miss'));
    proto._hit.call(f, 2);
    check('la racha vuelve a empezar en x1', f._play.combo === 1);
    // Primero reaparecen, y despues expiran: es lo que corta la racha.
    proto._tickPlay.call(f, 1000);
    proto._tickPlay.call(f, 1000);
    check('dejar pasar una diana tambien corta', f._play.combo === 0);
}

section('3 · Ratón y teclado golpean el carril correcto');
{
    const f = maqueta();
    const golpes = [];
    f._hit = (i) => golpes.push(i);
    proto._bindPlay.call(f);
    const tecla = win.listeners.keydown[0];
    check('se registra una tecla', typeof tecla === 'function');
    tecla({ code: 'KeyJ', repeat: false, preventDefault() {} });
    tecla({ code: 'Digit3', repeat: false, preventDefault() {} });
    tecla({ code: 'KeyL', repeat: true, preventDefault() {} });
    tecla({ code: 'KeyL', repeat: false, ctrlKey: true, preventDefault() {} });
    check('J y 3 llegan, el repeat y el ctrl no',
        JSON.stringify(golpes) === '[0,2]', golpes);
    f.laneEls[1].disparar('click');
    check('el click del carril 1 llega', golpes[golpes.length - 1] === 1, golpes);
    check('el texto de racha cambia con 8 golpes', (() => {
        f._play.combo = 9;
        proto._renderPlay.call(f);
        return f.playTitle.textContent === '¡MANOS DE FUEGO!';
    })());
}

section('4 · holdUntilDone: el gesto NO retira la pantalla');
{
    const realSetTimeout = globalThis.setTimeout;
    const temporizadores = [];
    globalThis.setTimeout = (fn) => { temporizadores.push(fn); return temporizadores.length; };

    let resuelto = null;
    const f = {
        started: false, destroyed: false, dismissed: false,
        holdUntilDone: true, wantFullscreen: false,
        startButton: elemento(),
        root: elemento(),
        label: elemento(),
        steps: [{ key: 'luchadores', label: 'Vistiendo luchadores' }],
        opts: {},
        _resolveStarted: (v) => { resuelto = v; },
        destroy() { this.destroyed = true; }
    };
    await proto.start.call(f);
    check('el arranque queda marcado', f.started);
    check('la pantalla se queda visible', f.root.classList.contains('spl-held'));
    check('NO se pone en salida', !f.root.classList.contains('spl-leaving'));
    check('el boton se esconde', f.startButton.hidden);
    check('el cartel anuncia la carga que viene',
        f.label.textContent === 'Vistiendo luchadores', f.label.textContent);
    check('la promesa se resuelve', !!resuelto);
    check('todavia no se ha retirado', !f.destroyed && !f.dismissed);
    check('dismiss la retira', proto.dismiss.call(f) === true);
    check('se marca la salida', f.root.classList.contains('spl-leaving'));
    check('un segundo dismiss no hace nada', proto.dismiss.call(f) === false);
    for (const fn of temporizadores) fn();
    check('el fundido desmonta', f.destroyed);

    globalThis.setTimeout = realSetTimeout;
}

section('5 · Sin hold, el arranque se va como antes');
{
    const realSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = () => 1;
    const f = {
        started: false, destroyed: false, holdUntilDone: false, wantFullscreen: false,
        startButton: elemento(), root: elemento(), opts: {},
        _resolveStarted() {}, destroy() { this.destroyed = true; }
    };
    await proto.start.call(f);
    check('se pone en salida en cuanto se pulsa', f.root.classList.contains('spl-leaving'));
    globalThis.setTimeout = realSetTimeout;
}

section('6 · finish() no gasta el 100% antes de cargar los modelos');
{
    const realMatchMedia = globalThis.matchMedia;
    const realDocument = globalThis.document;
    globalThis.matchMedia = () => ({ matches: false });
    globalThis.document = { documentElement: {} };
    const base = (hold) => ({
        holdUntilDone: hold, wantFullscreen: true, ready: false, started: false,
        destroyed: false, steps: [
            { key: 'motor', weight: 10 }, { key: 'escena', weight: 20 },
            { key: 'fisicas', weight: 15 }, { key: 'luchadores', weight: 25 },
            { key: 'interfaz', weight: 15 }, { key: 'listo', weight: 15 }
        ],
        stepIndex: 3, doneWeight: 45, totalWeight: 100, progress: 0.45,
        root: { setAttribute() {} }, bar: { style: {} }, pct: elemento(),
        label: elemento(), startButton: elemento(), hint: elemento(),
        _baseWeight: proto._baseWeight, _refreshProgress: proto._refreshProgress,
        step: proto.step
    });

    const retenida = base(true);
    proto.finish.call(retenida);
    check('con hold la antesala no dice Listo', retenida.label.textContent === 'Pulsa para jugar',
        retenida.label.textContent);
    check('con hold la barra se queda en la antesala', retenida.progress === 0.45,
        retenida.progress);
    check('con hold el boton sigue visible', retenida.startButton.hidden === false);
    proto.setProgress.call(retenida, 0.5);
    check('los modelos SI avanzan la barra', retenida.progress > 0.45, retenida.progress);
    retenida.step('listo');
    check('boot cierra al 100% con step(listo)', retenida.progress === 1, retenida.progress);

    const normal = base(false);
    proto.finish.call(normal);
    check('sin hold termina como antes', normal.progress === 1 && normal.label.textContent === 'Listo');
    globalThis.matchMedia = realMatchMedia;
    globalThis.document = realDocument;
}

console.log('\n' + '='.repeat(64));
if (failed.length) {
    console.log('FALLOS (' + failed.length + '):');
    for (const f of failed) console.log('  - ' + f);
}
console.log('\n' + passed + ' comprobaciones, ' + failed.length + ' fallos');
process.exit(failed.length ? 1 : 0);
