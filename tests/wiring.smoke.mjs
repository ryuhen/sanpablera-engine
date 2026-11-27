/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/wiring.smoke.mjs
 * ----------------------------------------------------------------------------
 * EL CABLEADO DE Engine.js, comprobado sin navegador.
 *
 * Engine.js no se puede importar en Node (BABYLON + DOM al cargar), asi que las
 * suites puras no ven si un modulo nuevo se quedo en el cajon: los datos y los
 * tests pasan, pero el menu nunca aparece. Aqui se lee el codigo fuente como
 * texto y se comprueban los PUNTOS DE CONEXION, ademas de que los exports que
 * se importan existan de verdad en sus modulos.
 *
 * Es una prueba de estructura, no de comportamiento: el comportamiento lo
 * cubren las suites de cada sistema. Lo que evita esto es el "lo escribi pero
 * nadie lo llama".
 * ============================================================================
 */
import { readFile, readdir } from 'node:fs/promises';
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

const engine = await readFile('src/core/Engine.js', 'utf8');
const tiene = (texto) => engine.includes(texto);

section('1 · Engine importa los modulos nuevos');
for (const [nombre, ruta] of [
    ['ModeSelect', "../ui/ModeSelect.js"],
    ['SessionPanel', "../ui/SessionPanel.js"],
    ['sesion', "./modes/session.js"],
    ['geografia de la maqueta', "./geo/diorama.js"],
    ['render de la maqueta', "../render/Diorama.js"],
    ['cel-shading', "../render/ToonMaterial.js"],
    ['guiones de intro', "./cine/fighterIntros.js"],
    ['rompecabezas de escenarios', "./narrative/stagePuzzle.js"]
]) {
    check('importa ' + nombre, tiene("from '" + ruta + "'"));
}

section('2 · Los puntos de conexion estan presentes');
for (const [nombre, texto] of [
    ['el menu de modo se abre en el arranque', 'new ModeSelect().pick()'],
    ['se crea la sesion', 'createSession({'],
    ['se construye la maqueta', 'buildDiorama();'],
    ['se aplica cel-shading a los peleadores', 'celShaderReal = applyFighterCelShading();'],
    ['se monta el panel de sesion', 'new SessionPanel({'],
    ['el panel se repinta', 'panelModo.update({'],
    ['el KO se conecta con la sesion', 'sincronizarSesion();'],
    ['la sesion se guarda', "localStorage.setItem('spf-sesion-v1'"],
    ['el zoom de la maqueta manda en la camara', 'if (camaraMaqueta) {'],
    ['la maqueta congela el combate', 'if (enMaqueta) {'],
    ['se puede salir de la maqueta', 'function entrarAlRing()'],
    ['la sesion se publica para depurar', 'getSesion'],
    ['la carga se mantiene durante los modelos', 'holdUntilDone: true'],
    ['la barra avanza dentro de la fase lenta', 'loading.setProgress('],
    ['se marca la fase de luchadores', "loading.step('luchadores')"],
    ['se marca la fase de interfaz', "loading.step('interfaz')"],
    ['la barra se cierra al terminar', "loading.step('listo');"],
    ['la pantalla se retira al terminar', 'loading.dismiss();'],
    ['los intros se validan con los clips reales', 'validateIntros('],
    ['los intros se pueden consultar', 'getFighterIntros'],
    ['el puzzle se valida al arrancar', 'validatePuzzle()'],
    ['el puzzle arranca en el escenario elegido', 'fijarNodoPuzzle(stage.id)'],
    ['el puzzle arranca en el hito elegido', 'fijarNodoPuzzle(id);'],
    ['el puzzle sigue los cambios de campana', 'if (id) fijarNodoPuzzle(id);'],
    ['una accion puede mover la pelea de lugar', 'function viajarPorAccion('],
    ['el puzzle se publica para depurar', 'getStagePuzzle']
]) {
    check(nombre, tiene(texto), texto);
}

section('3 · El orden importa (y se rompe sin excepcion)');
{
    const iModo = engine.indexOf('new ModeSelect().pick()');
    const iSesion = engine.indexOf('createSession({');
    const iMaqueta = engine.indexOf('buildDiorama();');
    check('el modo se elige ANTES de crear la sesion', iModo > 0 && iSesion > iModo, { iModo, iSesion });
    check('la sesion existe ANTES de construir la maqueta', iSesion > 0 && iMaqueta > iSesion, { iSesion, iMaqueta });

    const inicioCamara = engine.indexOf('function fitCamera(dt)');
    const finCamara = engine.indexOf('\n}', inicioCamara);
    const camara = engine.slice(inicioCamara, finCamara);
    check('fitCamera mira la maqueta ANTES de encuadrar peleadores',
        camara.indexOf('camaraMaqueta') >= 0
        && camara.indexOf('camaraMaqueta') < camara.indexOf('entities.filter'),
        camara.slice(0, 220));

    const inicioRender = engine.indexOf('function render()');
    const render = engine.slice(inicioRender);
    // El primer `scene.render()` del bucle esta en los early returns (inspector
    // y maqueta), asi que hay que comparar con el ULTIMO, que es el del frame
    // de combate. Comparar con el primero daria un falso fallo.
    check('el KO se sincroniza ANTES de dibujar',
        render.indexOf('sincronizarSesion();') > 0
        && render.indexOf('sincronizarSesion();') < render.lastIndexOf('scene.render();'));

    check('la economia usa tiempo epoch, no el de la pagina', !tiene('performance.now()'));
}

section('4 · Los exports importados existen de verdad');
{
    const M = await load('src/ui/ModeSelect.js');
    check('ModeSelect.default es una clase', typeof M.default === 'function');
    check('ModeSelect.MODES tiene los cuatro modos', Array.isArray(M.MODES) && M.MODES.length === 4);

    const S = await load('src/core/modes/session.js');
    for (const k of ['createSession', 'registrarKO', 'tickSesion', 'textoCampana',
        'lineaHUD', 'serializeSession', 'MODO']) {
        check('session.js exporta ' + k, S[k] !== undefined);
    }

    const G = await load('src/core/geo/diorama.js');
    check('diorama.js exporta buildDioramaData', typeof G.buildDioramaData === 'function');
    check('diorama.js exporta aPaleta', typeof G.aPaleta === 'function');

    const D = await load('src/render/Diorama.js');
    check('Diorama.js exporta createDiorama', typeof D.createDiorama === 'function');

    const T = await load('src/render/ToonMaterial.js');
    check('ToonMaterial.js exporta applyCelShading', typeof T.applyCelShading === 'function');

    const P = await load('src/ui/SessionPanel.js');
    check('SessionPanel.default es una clase', typeof P.default === 'function');
    check('SessionPanel exporta panelMarkup', typeof P.panelMarkup === 'function');
}

section('5 · Ninguna suite se queda fuera de npm test');
{
    const pkg = JSON.parse(await readFile('package.json', 'utf8'));
    const script = pkg.scripts.test || '';
    const archivos = (await readdir('tests')).filter(f => f.endsWith('.smoke.mjs') || f.endsWith('.dom.mjs'));
    check('hay suites registradas', script.includes('node tests/'));
    for (const f of archivos) {
        check(script.includes('tests/' + f), f);
    }
    check('el script no apunta a suites borradas', (() => {
        const referenciadas = Array.from(script.matchAll(/tests\/([^\s&&]+\.mjs)/g)).map(m => m[1]);
        return referenciadas.every(f => archivos.includes(f));
    })(), script.match(/tests\/[^\s&&]+\.mjs/g));
}

section('6 · El editor de animaciones (F3) tambien esta cableado');
for (const [nombre, ruta] of [
    ['AnimEditor', "../ui/AnimEditor.js"],
    ['ClipEditor', "./anim/ClipEditor.js"],
    ['ClipMap', "./anim/ClipMap.js"],
    ['ClipLibrary', "./anim/ClipLibrary.js"],
    ['FighterRig', "./entities/FighterRig.js"]
]) {
    check('importa ' + nombre, tiene("from '" + ruta + "'"));
}
for (const [nombre, texto] of [
    ['el estado del editor existe', 'let editorAnimaciones = null;'],
    ['se construye el mapa', 'buildClipMap({'],
    ['se construye el estado editable', 'createClipEditor({ mapa: mapaEditor })'],
    ['se construye la ventana', 'new AnimEditor({'],
    ['la biblioteca usa los generadores del rig', 'stancePoseFn: FighterRig.posturePose'],
    ['la vista previa usa clips grabados', 'runner.pose(clip, lect.segundos)'],
    ['y cae a la biblioteca procedural', 'poseDe(bibEditor, clip, modelo.rig'],
    ['desempaqueta la Pose que envuelve ClipLibrary', 'if (pose && pose.pose) pose = pose.pose;'],
    ['la apertura tiene nombre', 'const abrirEditorAnimaciones = () =>'],
    ['se publica para el menu de desarrollo', 'window.SANPABLERA.abrirEditorAnimaciones'],
    ['F3 abre el editor', "e.code === 'F3'"],
    ['el bucle le da el frame', 'editorAnimaciones.tick(dt)'],
    ['se puede coger desde la consola', 'getEditorAnimaciones']
]) {
    check(nombre, tiene(texto), texto);
}
{
    const inicio = engine.indexOf('function render()');
    const render = engine.slice(inicio);
    const iEditor = render.indexOf('editorAnimaciones.isOpen()');
    const iSinCombate = render.indexOf('if (!ui || !entities.length)');
    check('el editor se abre incluso sin combate', iEditor > 0 && iEditor < iSinCombate,
        { iEditor, iSinCombate });
    const iInspector = render.indexOf('inspector.isOpen()');
    check('el editor manda antes que el inspector (F2)', iEditor > 0 && iEditor < iInspector,
        { iEditor, iInspector });
}
{
    const E = await load('src/ui/AnimEditor.js');
    check('AnimEditor exporta la clase', typeof E.AnimEditor === 'function');
    check('AnimEditor exporta panelMarkup', typeof E.panelMarkup === 'function');
    const C = await load('src/core/anim/ClipEditor.js');
    check('ClipEditor exporta createClipEditor', typeof C.createClipEditor === 'function');
    const L = await load('src/core/anim/ClipLibrary.js');
    check('ClipLibrary exporta crearBiblioteca', typeof L.crearBiblioteca === 'function');
    check('ClipLibrary exporta poseDe', typeof L.poseDe === 'function');
    check('ClipLibrary exporta nombres', typeof L.nombres === 'function');
    const R = await load('src/core/entities/FighterRig.js');
    for (const k of ['locoPose', 'attackPose', 'posturePose']) {
        check('FighterRig.default exporta ' + k, typeof R.default[k] === 'function');
    }
}

section('7 · Tipologias, escenarios, intros y pantalla de carga');
{
    const B = await load('src/core/bodyTypes.js');
    for (const k of ['SOMATOTYPES', 'SOMATOTYPE_LIST', 'GENDERS', 'bodyTypeOf',
        'genderOf', 'scalePartTable', 'createCharacter', 'GENERATED_CHARACTERS']) {
        check('bodyTypes exporta ' + k, B[k] !== undefined);
    }
    const E = await load('src/core/stages.js');
    check('stages exporta nueve de historia mas el dojo',
        E.STAGES.length === 10, E.STAGES.length);
    for (const k of ['FIGHT_STAGES', 'NARRATIVE_STAGES', 'stageById',
        'stagesByZone', 'stageByLugar']) {
        check('stages exporta ' + k, E[k] !== undefined);
    }
    const I = await load('src/core/cine/fighterIntros.js');
    check('fighterIntros exporta FIGHTER_INTROS', !!I.FIGHTER_INTROS);
    for (const k of ['introForFighter', 'listIntroBeats', 'validateIntros']) {
        check('fighterIntros exporta ' + k, typeof I[k] === 'function');
    }
    const P = await load('src/core/narrative/stagePuzzle.js');
    check('stagePuzzle exporta el grafo', !!P.STAGE_PUZZLE);
    for (const k of ['validatePuzzle', 'getNode', 'createPuzzleState',
        'resolveTransition', 'applyTransition', 'availableTransitions']) {
        check('stagePuzzle exporta ' + k, typeof P[k] === 'function');
    }
    check('el grafo del puzzle esta sano', P.validatePuzzle().length === 0, P.validatePuzzle());

    const LS = await load('src/ui/LoadingScreen.js');
    for (const k of ['_bindPlay', '_hit', '_tickPlay', '_renderPlay', 'dismiss']) {
        check('LoadingScreen implementa ' + k, typeof LS.LoadingScreen.prototype[k] === 'function');
    }
    const fuente = await readFile('src/ui/LoadingScreen.js', 'utf8');
    check('el calentamiento no escribe en el progreso',
        fuente.indexOf('_renderPlay()') > 0 && !fuente.includes('this.progress = this._play'));
    check('el calentamiento se pinta en el DOM', fuente.includes('class="spl-play"'));
}

console.log('\n' + '='.repeat(64));
if (failed.length) {
    console.log('FALLOS (' + failed.length + '):');
    for (const f of failed) console.log('  - ' + f);
}
console.log('\n' + passed + ' comprobaciones, ' + failed.length + ' fallos');
process.exit(failed.length ? 1 : 0);
