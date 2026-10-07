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
import HUD from '../ui/HUD.js';
import LoadingScreen from '../ui/LoadingScreen.js';
import SelectScreen from '../ui/SelectScreen.js';
import StageSelect from '../ui/StageSelect.js';
import { loadCharacterModel } from '../render/CharacterModel.js';
import { stancePose } from './cine/Stances.js';
import { StaminaGauge } from './combat/Stamina.js';
import { ROSTER } from './roster.js';
import { STAGES } from './stages.js';

const MODEL_URL = './assets/characters/mannequin.glb';
// Las dos esquinas del ring. P1 a la izquierda mirando al centro, P2 a la
// derecha mirando al centro. Quien ocupa cada esquina se elige en la pantalla
// de seleccion (SelectScreen), no aqui.
const FIGHTER_CORNERS = [
    { name: 'P1', x: -0.55, z: 0.45, facing: 0 },
    { name: 'P2', x: 0.55, z: -0.45, facing: Math.PI }
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
 * Peleador de escena: envuelve una carta del roster (color, nombre, perfil
 * FSM) con lo que el juego necesita saber de el (donde esta, hacia donde
 * mira, stamina...). Se crea DESPUES de la pantalla de seleccion, cuando ya
 * se sabe quien pelea en cada esquina.
 */
function makeFighter(slot, side) {
    const corner = FIGHTER_CORNERS[side];
    const f = {
        name: corner.name,
        displayName: slot.name,
        characterId: slot.characterId,
        color: slot.rgb,
        x: corner.x,
        z: corner.z,
        facing: corner.facing,
        // Estado de combate del peleador. El HUD lo lee cada frame; el FSM
        // (core/fsm) lo modificara cuando se ligue el combate logico.
        health: 100,
        // Barra de stamina (core/combat/Stamina.js): se consume al correr y
        // en parkour, se regenera al parar. El HUD la dibuja bajo su nombre.
        gauge: new StaminaGauge(),
        // null = parado (mira al rival). { vx, vz } = corriendo hacia ese
        // rumbo (mira hacia donde corre, no al rival).
        running: null,
        // Cadencia de la interpolacion de poses.
        fkState: null
    };
    return f;
}

const fighters = [];

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

// Color [r,g,b] (0..1) del roster a hex, para la etiqueta del HUD.
function hexOf([r, g, b]) {
    const to = (c) => Math.round(c * 255).toString(16).padStart(2, '0');
    return '#' + to(r) + to(g) + to(b);
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

/**
 * Pinta el escenario con la paleta de la carta elegida (spec: el escenario
 * sale de la pantalla de seleccion estilo libro de origami).
 */
function applyStageTheme(stage) {
    if (!stage) return;
    ground.material.diffuseColor = B.Color3.FromHexString(stage.ground);
    mat.material.diffuseColor = B.Color3.FromHexString(stage.mat);
    railMat.diffuseColor = B.Color3.FromHexString(stage.rail);
    hemi.groundColor.copyFrom(B.Color3.FromHexString(stage.wall));
}

// ===========================================================================
// 6. INTERFAZ
// ===========================================================================

let ui = null;
let hud = null;

// ===========================================================================
// ARRANQUE
// ===========================================================================

async function boot() {
    // La pantalla de carga llega a "Listo" y pide el gesto para empezar
    // (pantalla completa + fundido). Hasta aqui NO hay peleadores: todavia no
    // se sabe quien pelea.
    loading.finish();
    await loading.whenStarted();

    // --- Seleccion de peleador (8 celdas, tipo panal) ----------------------
    const selection = await new SelectScreen({ roster: ROSTER }).pick();

    // --- Seleccion de escenario (libro de origami; solo 1 por ahora) -------
    const { stage } = await new StageSelect({ stages: STAGES }).pick();
    applyStageTheme(stage);

    // --- Peleadores: se crean con la eleccion del jugador ------------------
    fighters.push(makeFighter(selection.p1, 0));
    fighters.push(makeFighter(selection.p2, 1));

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
    }

    // --- Interfaz ---------------------------------------------------------
    ui = new UI();
    hud = new HUD({
        fighters: fighters.map(f => ({
            id: f.name,
            label: f.displayName,
            color: hexOf(f.color),
            health: f.health,
            stamina: f.gauge.value
        }))
    });

    // --- Bucle ------------------------------------------------------------
    engine.runRenderLoop(render);
    window.addEventListener('resize', () => engine.resize());
}

// ===========================================================================
// AVANCE DEL MUNDO (por ahora: correr y la camara que no pierde a nadie)
// ===========================================================================

// Dentro del ring: los peleadores no salen de este radio (suelo de 3,1 m).
const RING_LIMIT = 2.8;
// Distancia minima al rival: nadie se pisa para "meterse" en el otro.
const MIN_SPACING = 0.9;

function opponentOf(f) {
    return f.name === fighters[0].name ? fighters[1] : fighters[0];
}

/** Rumbo que mira a la cara/pecho del rival (facing 0 = +Z). */
function headingToward(f, o) {
    if (!o) return f.facing;
    return Math.atan2(o.x - f.x, o.z - f.z);
}

/**
 * Un paso del mundo por frame. Hoy hace dos cosas:
 *   - Ejecutar la carrera: mueve al peleador, lo GIRA hacia donde corre (no
 *     hacia el rival) y drena la stamina segun la direccion del rumbo.
 *   - Al pararse, gira hacia el rival (le mira la cara/pecho) y regenera.
 * Cuando exista la logica de combate real (FSM), el movimiento y los gastos
 * de stamina los dirigira el input, no el debug.
 */
function advance(dt) {
    for (const f of fighters) {
        const o = opponentOf(f);
        const run = f.running;

        if (run) {
            f.gauge.update(dt, {
                running: true,
                moveX: run.vx,
                moveZ: run.vz,
                toOppX: o.x - f.x,
                toOppZ: o.z - f.z
            });

            // Sin stamina no hay carrera: se frena en seco (gira al rival).
            if (!f.gauge.canRun()) {
                f.running = null;
                if (f.model) f.model.place(f.x, f.z, headingToward(f, o));
                continue;
            }

            let nx = f.x + run.vx * dt;
            let nz = f.z + run.vz * dt;

            // Dentro del ring.
            const radius = Math.hypot(nx, nz);
            if (radius > RING_LIMIT) {
                nx *= RING_LIMIT / radius;
                nz *= RING_LIMIT / radius;
            }
            // Sin pisar al rival.
            const dox = o.x - nx;
            const doz = o.z - nz;
            const dist = Math.hypot(dox, doz);
            if (dist < MIN_SPACING) {
                nx = o.x - (dox / dist) * MIN_SPACING;
                nz = o.z - (doz / dist) * MIN_SPACING;
            }

            f.x = nx;
            f.z = nz;
            if (f.model) {
                // El corredor mira hacia DONDE CORRE (spec: no a la cara del
                // rival, no al pecho: al rumbo).
                f.model.place(f.x, f.z, Math.atan2(run.vx, run.vz));
            }
        } else {
            f.gauge.update(dt, { running: false });
            if (f.model) f.model.place(f.x, f.z, headingToward(f, o));
        }
    }
}

/**
 * Camara que encuadra SIEMPRE a los dos peleadores (spec: se amplia para
 * mostrar a ambos). Apunta al punto medio y ajusta el radio para que quepan,
 * sea cual sea la distancia entre ellos (incluso en medio de una huida).
 */
function fitCamera(dt) {
    const alive = fighters.filter(f => f.model);
    if (alive.length < 2) return;

    const [a, b] = alive;
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    const span = Math.hypot(a.x - b.x, a.z - b.z);

    camera.setTarget(new B.Vector3(mx, 1.0, mz));
    const target = Math.max(4.2, span * 0.9 + 3.0);
    camera.radius += (target - camera.radius) * (1 - Math.exp(-dt * 3));
}

// Un frame: avanzar el mundo, encuadrar, dibujar y volcar el combate al HUD.
function render() {
    const dt = engine.getDeltaTime();
    advance(dt);
    fitCamera(dt);
    scene.render();

    if (hud) {
        for (const f of fighters) {
            hud.update(f.name, { health: f.health, stamina: f.gauge.value });
        }
        hud.tick(dt);
    }
}

// Arranca en cuanto el DOM esta listo (el script es un modulo, asi que ya lo
// esta, pero por si se carga con defer o en el head).
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}

// Para depurar desde la consola del navegador.
window.SANPABLERA = { engine, scene, camera, fighters, loading, ground, hud };

// Helpers de debug: probar barras, carrera y stamina en tiempo real sin
// esperar a tener input y combate logico ligados.
window.SANPABLERA.setHealth = function (name, value) {
    const f = fighters.find(x => x.name === name);
    if (!f) return;
    f.health = Math.max(0, Math.min(100, value));
};

window.SANPABLERA.setStamina = function (name, value) {
    const f = fighters.find(x => x.name === name);
    if (!f) return;
    f.gauge.reset(value);
};

// Corre hacia el rumbo (dx,dz) a `speed` m/s. Mientras corre mira hacia
// donde va y quema stamina. Con (dx,dz)=(0,0) simplemente se detiene.
window.SANPABLERA.run = function (name, dx, dz, speed = 3.5) {
    const f = fighters.find(x => x.name === name);
    if (!f) return;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) {
        f.running = null;
        return;
    }
    f.running = { vx: (dx / len) * speed, vz: (dz / len) * speed };
};

window.SANPABLERA.stop = function (name) {
    const f = fighters.find(x => x.name === name);
    if (!f) return;
    f.running = null;
};

// Intenta una maniobra de parkour (REBOTE / DESLIZAR). Devuelve true si se
// pago con stamina y false si no quedaba.
window.SANPABLERA.parkour = function (name, kind) {
    const f = fighters.find(x => x.name === name);
    if (!f) return false;
    const ok = f.gauge.spendParkour(kind);
    if (!ok) console.warn('stamina insuficiente para ' + kind + ' (' + f.gauge.value.toFixed(1) + ' pts)');
    return ok;
};