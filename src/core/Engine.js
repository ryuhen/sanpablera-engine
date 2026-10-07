/**
 * ============================================================================
 * SANPABLERA ENGINE · core/Engine.js
 * ----------------------------------------------------------------------------
 * Arranque del juego: motor, escena, fisicas, peleadores e interfaz.
 *
 * QUE HA CAMBIADO RESPECTO AL CUBO DE PRUEBA
 * ----------------------------------------------------------------------------
 *   Antes habia un cubo de 1,5 m con fisicas que caia al suelo. Era un
 *   comprobador de que el motor arrancaba, nada mas. Ahora en su lugar se
 *   montan DOS peleadores con el modelo de assets/characters/mannequin.glb, cada
 *   uno con su esqueleto real y su rig numerico (cine/Rig.js).
 *
 *   El cubo no se ha escondido: se ha QUITADO. Dejarlo colgando seria ruido.
 *
 * ORDEN DE ARRANQUE (importa, y por eso esta en este orden)
 * ----------------------------------------------------------------------------
 *   1. LoadingScreen, ANTES de tocar BABYLON. La pantalla de carga de grafiti
 *      (ui/LoadingScreen.js) pesa fases reales, asi que tiene que existir para
 *      que la primera fase "motor" se pueda marcar.
 *   2. Motor y escena.
 *   3. Fisicas.
 *   4. Peleadores: es la fase lenta (lectura del .glb, construccion del rig).
 *   5. Interfaz.
 *   6. El boton de "toca para jugar" pide pantalla completa y suelta el
 *      arranque. Hasta ese gesto no se arranca el bucle: si se arrancara antes,
 *      en un movil se perderian los primeros segundos de juego por culpa de la
 *      pantalla completa.
 *
 * POR QUE LOS PELOADORES NO LLEVAN FISICA
 * ----------------------------------------------------------------------------
 *   Un esqueleto con Cannon por encima se desincroniza en un solo frame. El
 *   suelo y las colisiones los lleva la logica de combate (el spacing viene de
 *   donde estan los pies, no de un rigidbody). Aqui la fisica se queda en el
 *   suelo y en el muro de contencion del ring.
 * ============================================================================
 */

import UI from '../ui/UI.js';
import LoadingScreen from '../ui/LoadingScreen.js';
import { loadCharacterModel } from '../render/CharacterModel.js';
import { stancePose } from './cine/Stances.js';

const MODEL_URL = './assets/characters/mannequin.glb';
const FIGHTERS = [
    { name: 'P1', x: -0.55, z: 0.45, facing: 0, color: [0.30, 0.55, 1.00] },
    { name: 'P2', x: 0.55, z: -0.45, facing: Math.PI, color: [1.00, 0.42, 0.35] }
];

// ===========================================================================
// 1. PANTALLA DE CARGA (antes de nada, para que el progreso sea real)
// ===========================================================================

const loading = new LoadingScreen({
    title: 'SANPABLERA',
    subtitle: 'MOTOR DE LUCHA'
});
loading.step('motor');

// ===========================================================================
// 2. MOTOR Y ESCENA
// ===========================================================================

const B = window.BABYLON;
const canvas = document.getElementById('renderCanvas');
const engine = new B.Engine(canvas, true, { preserveDrawingBuffer: false, stencil: true });
const scene = new B.Scene(engine);
scene.clearColor = new B.Color4(0.07, 0.08, 0.11, 1);
loading.step('escena');

// ===========================================================================
// 3. FISICAS
// ===========================================================================

const gravity = new B.Vector3(0, -9.81, 0);
// El motor nativo no necesita CDN. Si Cannon esta (lo carga index.html) se
// usa el plugin de Cannon; si no, se sigue con el motor de Babylon, que para
// suelo y muro es mas que suficiente.
if (B.CannonJSPlugin) {
    scene.enablePhysics(gravity, new B.CannonJSPlugin(true, 10, B.Cannon));
}
loading.step('fisicas');

// ===========================================================================
// 4. ESCENARIO
// ===========================================================================

function matte(scene_, hex, spec) {
    const m = new B.StandardMaterial('mat', scene_);
    const c = B.Color3.FromHexString(hex);
    m.diffuseColor = c;
    m.specularColor = new B.Color3(spec, spec, spec);
    m.specularPower = 32;
    return m;
}

const ground = B.MeshBuilder.CreateGround('ground', { width: 24, height: 24, subdivisions: 2 }, scene);
ground.material = matte(scene, '#2c2f3a', 0.06);
ground.receiveShadows = true;

// Suelo de combate: un circulo mas claro, para que se vea el "ring".
const mat = B.MeshBuilder.CreateDisc('mat', { radius: 3.1, tessellation: 96 }, scene);
mat.rotation.x = Math.PI / 2;
mat.position.y = 0.002;
mat.material = matte(scene, '#3b4052', 0.05);

// Vallas del ring: ocho postes. Dan escala y quitan la sensacion de "plano
// infinito flotando en el vacio".
const railMat = matte(scene, '#151822', 0.20);
for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const post = B.MeshBuilder.CreateCylinder('post' + i, { diameter: 0.07, height: 1.05 }, scene);
    post.position.set(Math.cos(a) * 3.1, 0.52, Math.sin(a) * 3.1);
    post.material = railMat;
}

const hemi = new B.HemisphericLight('hemi', new B.Vector3(0, 1, 0), scene);
hemi.intensity = 0.55;
hemi.groundColor = new B.Color3(0.16, 0.15, 0.20);

const key = new B.DirectionalLight('key', new B.Vector3(-0.5, -1, 0.45), scene);
key.position = new B.Vector3(2, 6, -3);
key.intensity = 1.15;

const rim = new B.DirectionalLight('rim', new B.Vector3(0.6, -0.35, -0.75), scene);
rim.position = new B.Vector3(-3, 3, 4);
rim.intensity = 0.55;
rim.diffuse = new B.Color3(0.55, 0.65, 1.0);

const camera = new B.ArcRotateCamera('cam', Math.PI / 2, 1.15, 5.2, new B.Vector3(0, 1.0, 0), scene);
camera.attachControl(canvas, true);
camera.lowerRadiusLimit = 2.2;
camera.upperRadiusLimit = 12;
camera.wheelDeltaPercentage = 0.02;

// ===========================================================================
// 5. PELEADORES  (el cubo vivio aqui)
// ===========================================================================

/**
 * Peleador de escena: envuelve un CharacterModel con lo que el juego necesita
 * saber de el (donde esta, hacia donde mira, el ultimo FSM, etc). La logica de
 * combate va en core/fsm; aqui solo hay estado de render.
 */
function makeFighter(spec) {
    const f = Object.assign({}, spec, {
        x: spec.x,
        z: spec.z,
        facing: spec.facing,
        // Cadencia de la interpolacion de poses.
        fkState: null
    });
    return f;
}

const fighters = FIGHTERS.map(makeFighter);

/**
 * Da color a un peleador. El .glb del mannequin trae su propio material y
 * un solo color para los dos peleadores seria ilegible en combate.
 */
function tint(model, [r, g, b]) {
    for (const mesh of model.root.getChildMeshes ? model.root.getChildMeshes() : []) {
        const m = new B.StandardMaterial('skin', scene);
        m.diffuseColor = new B.Color3(r, g, b);
        m.specularColor = new B.Color3(0.12, 0.12, 0.14);
        m.specularPower = 24;
        mesh.material = m;
    }
}

/**
 * Postura inicial de cada peleador.
 *
 * NO es una animacion: es la Pose de una postura de cine (core/cine/Stances.js)
 * con los pies ya clavados en el suelo por IK. Lo que se ve aqui es el
 * resultado de medir el modelo, decidir los dos puntos de apoyo y resolver las
 * dos piernas contra ellos, no un numero de rotaciones escrito a mano.
 */
function adoptStance(fighter, stanceName) {
    const model = fighter.model;
    const { pose, state } = stancePose(model.rig, stanceName || 'IDLE', { forward: 1 });
    model.applyPose(pose, state);
    fighter.pose = pose;
    fighter.fkState = state;
    fighter.stance = stanceName || 'IDLE';
}

// ===========================================================================
// 6. INTERFAZ
// ===========================================================================

let ui = null;

// ===========================================================================
// ARRANQUE
// ===========================================================================

async function boot() {
    // --- Peleadores -------------------------------------------------------
    for (const f of fighters) {
        try {
            f.model = await loadCharacterModel(scene, MODEL_URL, { name: f.name });
        } catch (err) {
            console.error('No se pudo cargar ' + MODEL_URL, err);
            // Un modelo que no carga NO puede ser un problema que tumbe el
            // juego entero: se avisa y se sigue con lo que haya.
            f.failed = true;
            continue;
        }
        tint(f.model, f.color);
        adoptStance(f, 'GUARD');
        // Cada peleador en su esquina, mirando al centro.
        f.model.place(f.x, f.z, f.facing);
        loading.setProgress((fighters.indexOf(f) + 1) / fighters.length);
    }
    loading.step('luchadores');

    // --- Interfaz ---------------------------------------------------------
    ui = new UI();
    loading.step('interfaz');

    loading.finish();
    await loading.whenStarted();

    // --- Bucle ------------------------------------------------------------
    engine.runRenderLoop(render);
    window.addEventListener('resize', () => engine.resize());
}

// Un frame. Hoy es "dibujar y nada mas": el cubo tambien solo se dibujaba, lo
// que cambia es que lo que hay en pantalla son dos peleadores de 1,80 m.
function render() {
    scene.render();
}

// Arranca en cuanto el DOM esta listo (el script es un modulo, asi que ya lo
// esta, pero por si se carga con defer o en el head).
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}

// Para depurar desde la consola del navegador.
window.SANPABLERA = { engine, scene, camera, fighters, loading, ground };