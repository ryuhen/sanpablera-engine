/**
 * ============================================================================
 * SANPABLERA ENGINE · core/Engine.js
 * ----------------------------------------------------------------------------
 * Arranque del juego: motor, escena, fisicas, peleadores e interfaz.
 *
 * QUE HAY AQUI
 * ----------------------------------------------------------------------------
 *   El bucle de juego y el CABLEADO del combate:
 *
 *     UI tactil -> InputMapper -> FighterEntity -> (FSM + rig) ->
 *     CharacterModel -> Babylon
 *
 *   El InputMapper traduce el d-pad y los 4 botones en input de la
 *   FSM (y detecta doble toque, secuencias y combos). La FighterEntity
 *  es la duena del peleador: la maquina de locomocion (paso ->
 *   caminar -> correr, dashes, cuadripedia, deslizamientos), las
 *   ventanas de esquive, el puerto `api` de la FSM y la pose de cada
 *   frame. La FSM decide los estados de combate (golpes, guardias,
 *   impactos, derribos) y el rig los dibuja.
 *
 *   Tambien vive aqui el MUNDO: hitstop, el saco de boxeo (objeto
 *   interactuable) y la resolucion de hitboxes (tryHit), que es donde
 *   se aplica la regla de oro del movimiento: los golpes LINEALES se
 *   esquivan moviendose y los AREA cazan a quien se mueve.
 *
 * ORDEN DE ARRANQUE (importa, y por eso esta en este orden)
 * ----------------------------------------------------------------------------
 *   1. LoadingScreen, ANTES de tocar BABYLON.
 *   2. Motor y escena.
 *   3. Fisicas.
 *   4. Escenario y utilería (saco de boxeo).
 *   5. Peleadores (la fase lenta: lectura del .glb, rig).
 *   6. Interfaz y bucle.
 * ============================================================================
 */

import UI from '../ui/UI.js';
import { ControlsScreen } from '../ui/ControlsScreen.js';
import { resolveClash } from './clinch.js';
import { makeLocoState, readLoco, LOCO, LOCO_TABLE } from './locomotion.js';
import HUD from '../ui/HUD.js';
import LoadingScreen from '../ui/LoadingScreen.js';
import SelectScreen from '../ui/SelectScreen.js';
import StageSelect from '../ui/StageSelect.js';
import { loadCharacterModel } from '../render/CharacterModel.js';
import { Cape } from '../render/ClothMesh.js';
import { AnimInspector } from './anim/Inspector.js';
import { InputMapper } from './entities/InputMapper.js';
import FighterEntity, { nextStance } from './entities/FighterEntity.js';
import { StaminaGauge } from './combat/Stamina.js';
import SPF from './fsm/Constants.js';
import { fullRoster } from './roster.js';
import { STAGES } from './stages.js';

// Constants.js expone el namespace SPF como export por defecto (no hay
// exports con nombre), asi que Intent se saca de ahi.
const { Intent } = SPF;

// Modelo del peleador. Se puede cambiar por ?modelo=<ruta> en la URL para
// probar otro sin tocar el codigo (ver ASSETS.md).
//
// `?piezas=1` cuelga primitivas (capsulas y cajas) de los huesos del CONTRATO
// encima del .glb. Es el "maniqui de piezas" (render/PartMannequin.js): sirve
// para comprobar la animacion sin depender de la malla de ningun modelo
// concreto, y de paso da una silueta clara de quien es quien en el ring.
const USE_PARTS = new URLSearchParams(location.search).get('piezas') === '1';
const MODEL_URL = (() => {
    const alt = new URLSearchParams(location.search).get('modelo');
    return alt ? './' + alt.replace(/^\.?\//, '') : './assets/characters/mannequin.glb';
})();
// Las dos esquinas del ring. P1 a un lado, P2 al opuesto, y LOS DOS miran al
// rival. Quien ocupa cada esquina se elige en la pantalla de seleccion
// (SelectScreen), no aqui.
//
// OJO CON EL FACING: se calcula, no se escribe a mano. Las esquinas estan en
// diagonal, asi que "facing: 0" (que apunta a +Z) miraba JUSTO HACIA EL LADO
// CONTRARIO del rival y todos los golpes salian de espaldas: no conectaba nada
// y no habia forma de que el combate empezara. En un juego de pelea los dos
// tienen que estar mirandose.
const FIGHTER_CORNERS = [
    { name: 'P1', x: -0.55, z: 0.45 },
    { name: 'P2', x: 0.55, z: -0.45 }
];

/**
 * Giro sobre Y (rad) para mirar de (x,z) hacia (tx,tz).
 * El motor usa la convencion (sin f, cos f) = direccion de avance: +f mira a +Z.
 */
function facingToward(x, z, tx, tz) {
    return Math.atan2(tx - x, tz - z);
}

// Radio del ring. Pasarse es una FALTA, no una pared: el peleador que se sale
// pierde vida y los dos vuelven al centro (ver world.ringOut). El suelo de la
// escena mide 24 m, asi que hay de sobra para salirse un poco sin caerse.
const RING_LIMIT = 2.8;
// Vida que se pierde por salirse del ring.
const RING_OUT_DAMAGE = 50;
// Frames de congelacion cuando alguien se sale: da el golpe de efecto.
const RING_OUT_HITSTOP = 14;
// Distancia minima al rival: nadie se pisa para "meterse" en el otro.
const MIN_SPACING = 0.9;
// Volumen de colision de un peleador (para la hitbox del rival).
const OPPONENT_HULL = 0.45;
// Boton multiple: cuanto se mantiene ACCION antes de entrar en modo
// target (encarado automatico + zoom de camara).
const TARGET_HOLD = 0.32;
// Alcance para interactuar con la utilería (el saco).
const INTERACT_RANGE = 1.25;

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
// 4. ESCENARIO Y UTILERÍA
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

/**
 * Saco de boxeo: pendulo amortiguado colgado de un ancla. Es el
 * primer OBJETO DEL ESCENARIO: se le golpea (lo balancea el impacto
 * y destella) y se le toca con el boton multiple (empujon).
 *
 * El plano de balanceo apunta al centro del ring, para que un
 * golpe recto lo aleje del peleador.
 */
function makePunchBag(scene_) {
    const anchor = new B.Vector3(-2.85, 2.42, 0.78);
    const LEN = 1.3;

    // Direccion del balanceo (hacia el centro del ring).
    const toCenter = new B.Vector3(-anchor.x, 0, -anchor.z);
    toCenter.normalize();
    const dirX = toCenter.x;
    const dirZ = toCenter.z;
    // Eje de inclinacion: perpendicular al balanceo (horizontal).
    const tiltAxis = new B.Vector3(dirZ, 0, -dirX);

    const pivot = new B.TransformNode('bagPivot', scene_);
    pivot.position = anchor;
    // RotationAxisToRef escribe DENTRO del quaternion que se le pasa: si no
    // existe, el primer update() del pendulo revienta con "_w de null".
    pivot.rotationQuaternion = new B.Quaternion(0, 0, 0, 1);

    const chain = B.MeshBuilder.CreateCylinder('bagChain', { diameter: 0.02, height: LEN }, scene_);
    chain.parent = pivot;
    chain.position = new B.Vector3(0, -LEN / 2, 0);
    chain.material = matte(scene_, '#8a8f9a', 0.35);

    const bagMat = new B.StandardMaterial('bagMat', scene_);
    bagMat.diffuseColor = B.Color3.FromHexString('#7a3b3b');
    bagMat.specularColor = new B.Color3(0.2, 0.2, 0.2);
    bagMat.emissiveColor = B.Color3.Black();
    const bag = B.MeshBuilder.CreateCylinder('saco', { diameter: 0.5, height: 0.85, tessellation: 24 }, scene_);
    bag.parent = pivot;
    bag.position = new B.Vector3(0, -LEN, 0);
    bag.material = bagMat;

    return {
        name: 'saco',
        type: 'prop',
        radius: 0.34,
        theta: 0,     // angulo del pendulo (rad)
        omega: 0,     // velocidad angular
        flash: 0,     // destello de impacto (decae)

        /** Fisica del pendulo: theta'' = -(g/L) sen(theta) - c·theta'. */
        update(dt) {
            const accel = -(9.81 / LEN) * Math.sin(this.theta) - 0.55 * this.omega;
            this.omega += accel * dt;
            this.theta += this.omega * dt;
            // Tope: no da la vuelta completa (rebot con perdidas).
            if (this.theta > 1.2) { this.theta = 1.2; this.omega *= -0.3; }
            if (this.theta < -1.2) { this.theta = -1.2; this.omega *= -0.3; }
            B.Quaternion.RotationAxisToRef(tiltAxis, this.theta, pivot.rotationQuaternion);

            if (this.flash > 0) {
                this.flash = Math.max(0, this.flash - dt * 4);
                const f = this.flash;
                bagMat.emissiveColor = new B.Color3(0.9 * f, 0.35 * f, 0.1 * f);
            }
        },

        // Centro del saco (los getters siguen el pendulo).
        get x() { return anchor.x + Math.sin(this.theta) * dirX * LEN; },
        get z() { return anchor.z + Math.sin(this.theta) * dirZ * LEN; },
        get y() { return anchor.y - Math.cos(this.theta) * LEN; },

        /** Golpe: el saco se empuja segun la orientacion del ataque. */
        hit(move, attacker) {
            const fx = Math.sin(attacker.fighter.facing);
            const fz = Math.cos(attacker.fighter.facing);
            const align = fx * dirX + fz * dirZ;
            this.omega += align * (2.2 + move.damage * 0.05);
            this.flash = 1;
        },

        /** Interaccion (boton multiple cerca): empujon directo. */
        interact(entity) {
            const dx = this.x - entity.fighter.x;
            const dz = this.z - entity.fighter.z;
            const d = Math.hypot(dx, dz) || 1;
            const align = (dx / d) * dirX + (dz / d) * dirZ;
            this.omega += align * 2.6;
            this.flash = 0.5;
        }
    };
}

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
    const rival = FIGHTER_CORNERS[side === 0 ? 1 : 0];
    return {
        name: corner.name,
        displayName: slot.name,
        characterId: slot.characterId,
        color: slot.rgb,
        x: corner.x,
        z: corner.z,
        // Mira al rival, no a un eje fijo: es lo unico que hace que los
        // golpes salgan hacia delante en vez de de espaldas.
        facing: facingToward(corner.x, corner.z, rival.x, rival.z),
        // Estado de combate del peleador. El HUD lo lee cada frame; la
        // FighterEntity lo modifica al ligar el golpe.
        health: 100,
        // Barra de stamina (core/combat/Stamina.js): se consume al
        // correr, se regenera al parar. El HUD la dibuja bajo su nombre.
        gauge: new StaminaGauge()
    };
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
// 6. MUNDO, ENTIDADES E INPUT
// ===========================================================================

/** Entidades de combate (una por peleador con modelo cargado). */
const entities = [];

/** Traductor de input: UI tactil -> input de la FSM + detecciones. */
const inputMapper = new InputMapper();

/**
 * Memoria de la pulsacion del boton de mover, para distinguir un TOQUE (un
 * paso) de mantenerlo (caminata o carrera). Vive aqui porque es estado del
 * motor, no del router: el router solo sabe que el boton esta pulsado.
 */
const locoState = makeLocoState();
let locoWasDown = false;

/**
 * El MUNDO: lo que las entidades y las hitboxes necesitan saber.
 * `hitstop` congela todo el mundo (menos la camara) unos frames
 * al conectar un golpe: es la sensacion de impacto del juego.
 */
const world = {
    hitstop: 0,
    props: [],
    ringLimit: RING_LIMIT,
    minSpacing: MIN_SPACING,

    opponentOf(entity) {
        if (entities.length < 2) return null;
        const i = entities.indexOf(entity);
        return entities[(i + 1) % entities.length] || null;
    },

    /** La entidad del peleador que NO es `fighter` (o null). */
    opponentByFighter(fighter) {
        return entities.find((e) => e.fighter && e.fighter.name !== fighter.name) || null;
    },

    /**
     * REGLA DEL RING: salirse del ring es una falta.
     *
     * El peleador que cruza el limite paga RING_OUT_DAMAGE de vida y los dos
     * vuelven al centro. Antes el limite era una pared invisible (se recortaba
     * la posicion dentro de FighterEntity), con lo que nadie podia salirse
     * nunca y la regla no tendria sentido: empujar al rival hacia las cuerdas
     * era imposible.
     *
     * @returns {string|null} nombre del que se salio, o null si nadie fallo
     */
    ringOut() {
        let fuera = null;
        for (const f of fighters) {
            if (Math.hypot(f.x, f.z) > this.ringLimit) { fuera = f; break; }
        }
        if (!fuera) return null;

        fuera.health = Math.max(0, fuera.health - RING_OUT_DAMAGE);
        this.hitstop = Math.max(this.hitstop, RING_OUT_HITSTOP);

        const rivalEnt = this.opponentByFighter(fuera);
        const rival = rivalEnt ? rivalEnt.fighter : null;
        // Los dos al centro. La inercia se limpia porque si no, el que iba
        // lanzado seguia empujando al otro nada mas reaparecer.
        for (const f of fighters) { f.x = 0; f.z = 0; }
        // Separados lo justo para no violar MIN_SPACING al instante, y mirando
        // al otro otra vez. Ojo: `facing` se queda en NaN si no se recalcula,
        // porque con los dos en el centro no hay direccion.
        if (rival && fighters.length >= 2) {
            fuera.x = -MIN_SPACING / 2;
            rival.x = MIN_SPACING / 2;
            fuera.facing = facingToward(fuera.x, fuera.z, rival.x, rival.z);
            rival.facing = facingToward(rival.x, rival.z, fuera.x, fuera.z);
        }
        for (const ent of entities) {
            if (typeof ent.vx === 'number') ent.vx = 0;
            if (typeof ent.vz === 'number') ent.vz = 0;
        }
        inputMapper.reset();
        return fuera.name;
    },

    /**
     * Comprueba la hitbox del atacante. El punto de golpe nace
     * DELANTE del peleador (su frente) y se mide contra el
     * volumen del rival y contra la utilería.
     *
     * Aqui se aplica la regla de oro del movimiento: el
     * dictamen (defend) de la entidad defensora decide si el
     * golpe lineal se esquivo o si el de area cazo al que se
     * movia.
     */
    tryHit(attacker) {
        const fsm = attacker.fsm;
        const move = fsm.move;
        if (!move) return 'miss';
        const fa = attacker.fighter;
        const hx = fa.x + Math.sin(fa.facing) * move.hitbox.forward;
        const hz = fa.z + Math.cos(fa.facing) * move.hitbox.forward;

        const opp = this.opponentOf(attacker);
        if (opp && opp.model) {
            const d = Math.hypot(opp.fighter.x - hx, opp.fighter.z - hz);
            if (d <= move.hitbox.radius + OPPONENT_HULL) {
                const verdict = opp.defend(move, attacker, this);
                fsm.markHitboxResolved();
                if (verdict.blocked) {
                    opp.onBlocked(move, attacker, this);
                    return 'blocked';
                }
                if (verdict.hit) {
                    opp.takeHit(move, attacker, this, verdict.bonus);
                    // Mi golpe conecto: la entidad lo apunta para la
                    // fijacion (TARGET ACTION: accion tras conectar).
                    attacker.onHitLanded(move, this);
                    return 'hit';
                }
                return 'dodged';
            }
        }

        // Objetos del escenario (el saco de boxeo).
        for (const prop of this.props) {
            const d = Math.hypot(prop.x - hx, prop.z - hz);
            if (d <= move.hitbox.radius + prop.radius) {
                prop.hit(move, attacker);
                fsm.markHitboxResolved();
                return 'prop';
            }
        }
        return 'miss';
    }
};

// Utilería del ring.
world.props.push(makePunchBag(scene));

/** Input "congelado" para el rival pasivo: nada pulsado, nada de movimiento. */
const IDLE_INPUT = Object.freeze({
    x: 0, y: 0,
    forward: false, back: false, up: false, down: false,
    left: false, right: false,
    pressed: Object.freeze(Object.create(null)),
    held: Object.freeze(Object.create(null)),
    moveX: 0, moveZ: 0, moveMag: 0,
    dash: null, airSeqReady: false,
    quadEdge: false, slideEdge: false,
    actionEdge: false, actionHeld: false, actionFresh: false,
    crouch: false, dirEdge: null
});

// ===========================================================================
// 7. INTERFAZ
// ===========================================================================

let ui = null;
let hud = null;
/** El inspector de animaciones (F2). Vive fuera del combat loop: cuando esta
 *  abierto, el bucle le cede el control de la pose. */
let inspector = null;

/**
 * Basis de la camara en el suelo: "adelante" es la proyeccion del
 * rayo de la camara al plano XZ y "derecha" su perpendicular. El
 * d-pad se traduce con esto: pulsar "arriba" en pantalla aleja al
 * peleador de la camara, sea cual sea el angulo de esta.
 */
function cameraGroundBasis() {
    const d = camera.getForwardRay().direction;
    let fx = d.x;
    let fz = d.z;
    const len = Math.hypot(fx, fz);
    if (len < 1e-4) { fx = 0; fz = 1; }
    else { fx /= len; fz /= len; }
    // Izquierda del sistema (Babylon es zurdo): right = (fz, 0, -fx).
    return { fx, fz, rx: fz, rz: -fx };
}

/**
 * BOTON MULTIPLE (ACCION) · lo que le toca al ENGINE.
 * El resto (rotacion de posturas, baile, fijacion y el especial
 * del doble toque) lo resuelve la entidad en `_stances`, que lee
 * las mismas aristas. Aqui solo queda lo que necesita el mundo:
 *
 *   - Mantenido (>=0,32 s)  modo TARGET: encarado automatico al
 *     rival y zoom de camara. No se pisa con la fijacion de
 *     combate (TARGET ACTION), que tambien usa ACCION.
 *   - Con puño + diagonal  combos de movimiento (cuadrupedia y
 *     deslizamiento): la pulsacion se CONSUME.
 *   - Al soltar sobre utileria .. INTERACTUAR con el saco. Se
 *     marca `consumedByProp` para que el toque no rota postura.
 *
 * El toque corto SIN utileria lo consume la entidad: rota postura,
 * o doble toque = especial.
 */
const action = { held: false, since: 0, targeting: false, consumed: false };

function nearestProp(entity, range) {
    let best = null;
    let bestD = range;
    for (const prop of world.props) {
        const d = Math.hypot(prop.x - entity.fighter.x, prop.z - entity.fighter.z);
        if (d <= bestD) { best = prop; bestD = d; }
    }
    return best;
}

function updateActionButton(input, dt) {
    const player = entities[0];
    if (!player) return;

    if (input.actionEdge) {
        action.held = true;
        action.since = 0;
        action.targeting = false;
        action.consumed = false;
    }
    if (action.held) {
        action.since += dt;
        // Los combos de movimiento consumen la pulsacion.
        if (!action.consumed && (input.quadEdge || input.slideEdge)) {
            action.consumed = true;
        }
        // Mantenido: modo target de CAMARA (si no hay fijacion de
        // combate activa, que es lo que el jugador quiere al mantener).
        const fixing = player.stance && player.stance.target;
        if (!action.targeting && !action.consumed && !fixing &&
            action.since >= TARGET_HOLD) {
            action.targeting = true;
            player.targetLock = true;
        }
    }
    if (!input.actionHeld && action.held) {
        if (action.targeting) {
            player.targetLock = false;
        } else if (!action.consumed) {
            const prop = nearestProp(player, INTERACT_RANGE);
            if (prop) {
                prop.interact(player);
                input.consumedByProp = true;
            }
        }
        action.held = false;
        action.targeting = false;
        action.consumed = false;
    }
}

// ===========================================================================
// ARRANQUE
// ===========================================================================

async function boot() {
    // La pantalla de carga llega a "Listo" y pide el gesto para empezar
    // (pantalla completa + fundido). Hasta aqui NO hay peleadores: todavia no
    // se sabe quien pelea.
    loading.finish();
    await loading.whenStarted();

    // --- Seleccion de peleador (8 celdas tipo panal + la del
    //     jugador, con su nombre guardado en la maquina) ----
    const selection = await new SelectScreen({ roster: fullRoster() }).pick();

    // --- Seleccion de escenario (libro de origami; solo 1 por ahora) -------
    const { stage } = await new StageSelect({ stages: STAGES }).pick();
    applyStageTheme(stage);

    // --- Peleadores: se crean con la eleccion del jugador ------------------
    fighters.push(makeFighter(selection.p1, 0));
    fighters.push(makeFighter(selection.p2, 1));

    for (const f of fighters) {
        try {
            f.model = await loadCharacterModel(scene, MODEL_URL, {
                name: f.name,
                // Las piezas se cuelgan de los huesos del contrato, asi que el
                // .glb puede ser el que sea: la silueta siempre es la misma.
                parts: USE_PARTS
            });
        } catch (err) {
            console.error('No se pudo cargar ' + MODEL_URL, err);
            // Un modelo que no carga NO puede ser un problema que tumbe el
            // juego entero: se avisa y se sigue con lo que haya.
            f.failed = true;
            continue;
        }
        // Las piezas tienen su propio metodo de tinte (deja manos y cabeza mas
        // claras para que se vea de quien es quien a tres metros); el .glb se
        // tiñe entero.
        if (USE_PARTS) f.model.tintParts(f.color);
        else tint(f.model, f.color);
        // Cada peleador en su esquina, mirando al centro.
        f.model.place(f.x, f.z, f.facing);
    }

    // --- Entidades de combate (FSM + rig + locomocion) ---------------------
    // P2 es el RIVAL PASIVO: input congelado y postura de guardia. Se
    // levanta solo del suelo (la entidad inyecta la levantada) pero no
    // ataca: la IA del rival es un paso posterior.
    for (const f of fighters) {
        if (!f.model) continue;
        const ent = new FighterEntity({
            fighter: f,
            model: f.model,
            characterId: f.characterId || 'BASE',
            id: f.name,
            stance: f.name === 'P2' ? 'RELAX' : 'SHELL'
        });

        // --- LA CAPA (tela) ---------------------------------------------
        // Se le da UNA CAPA a cada peleador. La costura va cosida a la
        // clavicula y se actualiza cada frame con la FK del rig, asi que la
        // capa sigue al cuerpo en los golpes, en el salto y en la levantada
        // sin que nadie tenga que animarla.
        //
        // Va DESPUES de crear la entidad porque la entidad es la que escribe la
        // pose: la capa se actualiza al final de su update (ver
        // FighterEntity._pose), y para eso necesita existir antes.
        const cm = new B.StandardMaterial('cape' + f.name, scene);
        const [r, g, b] = f.color;
        cm.diffuseColor = new B.Color3(r * 0.45, g * 0.45, b * 0.5);
        cm.specularColor = new B.Color3(0.05, 0.05, 0.06);
        cm.backFaceCulling = false;   // la capa es una superficie sin grosor
        ent.cape = new Cape(B, scene, f.model, {
            name: 'cape' + f.name,
            material: cm,
            cols: 6, rows: 8,
            width: 0.44, length: 0.66,
            // 14 cm detras del pecho. Medido: cosida pegada (7 cm) la tela
            // nace dentro de la capsula del torso y sale despedida; a 14 cm cae
            // limpia. Ver la nota de Cloth.stepCloth.
            seedY: 1.42,
            seedZ: -0.14,
            groundY: 0
        });

        entities.push(ent);
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

    // --- INSPECTOR DE ANIMACIONES (F2) ------------------------------------
    //
    // Se construye UNA vez con el modelo del P1. Cuando esta abierto, el bucle
    // de render deja de avanzar a las entidades y llama a `inspector.tick()`, que
    // escribe la pose que se esta viendo. Los peleadores siguen en pantalla (no
    // se borran), asi que se ve el golpe con el RIVAL al lado, que es la mitad
    // de comprobar un golpe: un jab mas largo solo se ve con alguien a quien
    // llegue.
    //
    // POR QUE UN SOLO MODELO Y NO LOS DOS
    //   El inspector escribe la pose del P1. El P2 se queda con la suya (la
    //   ultima del combate), y eso es lo que hace util tenerlos: se ve el
    //   alcance y la altura RELATIVOS al rival, sin tener que fabricar un
    //   maniqui de altura fija que no dice nada.
    inspector = new AnimInspector({
        model: (fighters[0] && fighters[0].model) || null,
        onApply: (res) => {
            // La capa se actualiza con la FK de la pose del inspector: si no,
            // la capa se queda en la pose anterior mientras el cuerpo se mueve,
            // que es el sintoma de "la capa va un frame por detras".
            const m = fighters[0];
            if (m && m.model) {
                m.model.place(m.x, m.z, m.facing);
                if (inspector.capeRef) inspector.capeRef.update(1 / 60, res.state);
            }
        },
        onZoom: (delta) => {
            // Zoom de la camara con ctrl+rueda, con tope. El tope importa: sin
            // el, `camera.radius` puede llegar a 0 y la escena se ve desde
            // dentro del suelo.
            const MIN = 1.1, MAX = 12;
            camera.radius = Math.max(MIN, Math.min(MAX, camera.radius * (delta > 0 ? 1.15 : 1 / 1.15)));
            // Se guarda el radio como preferencia mientras el inspector esta
            // abierto: si `fitCamera` siguiera corriendo, devolveria el radio
            // a su valor canonico en cuanto se moviera un peleador y el zoom
            // se perderia a los dos segundos.
            inspector.camBias = camera.radius;
        },
        onClose: () => { inputMapper.reset(); ui.router.releaseAll(); }
    });
    if (fighters[0] && entities[0]) inspector.capeRef = entities[0].cape || null;

    // --- Atajo al menu de controles ---------------------------------------
    // F1 abre el configurador de teclado y mando. Mientras esta abierto el
    // juego queda congelado (el router desactiva el teclado), asi que no hace
    // falta pausar la escena a mano.
    //
    // F2 abre el inspector de animaciones. Mismo criterio: abrirlo suelta el
    // teclado, para que el WASD no mueva al peleador mientras estas mirando el
    // jab.
    let controlsOpen = false;
    window.addEventListener('keydown', (e) => {
        if (e.code === 'F2') {
            e.preventDefault();
            const abriendo = !inspector.isOpen();
            if (abriendo) { ui.router.releaseAll(); inputMapper.reset(); }
            inspector.toggle();
            if (!inspector.isOpen()) { ui.router.releaseTouch(); inputMapper.reset(); }
            return;
        }
        if (e.code !== 'F1' || controlsOpen) return;
        e.preventDefault();
        controlsOpen = true;
        ui.router.releaseAll();
        inputMapper.reset();
        new ControlsScreen(ui.router).open().then(() => {
            controlsOpen = false;
            ui.router.releaseTouch();
            inputMapper.reset();
        });
    });

    // --- Bucle ------------------------------------------------------------
    engine.runRenderLoop(render);
    window.addEventListener('resize', () => engine.resize());
}

// ===========================================================================
// BUCLE DE JUEGO
// ===========================================================================

/**
 * Camara que encuadra SIEMPRE a los dos peleadores (spec: se amplia para
 * mostrar a ambos). Apunta al punto medio y ajusta el radio para que quepan,
 * sea cual sea la distancia entre ellos (incluso en medio de una huida).
 * En modo target el enfoque aprieta.
 */
function fitCamera(dt) {
    const alive = entities.filter(e => e.model);
    if (alive.length < 2) return;

    const [a, b] = alive;
    const mx = (a.fighter.x + b.fighter.x) / 2;
    const mz = (a.fighter.z + b.fighter.z) / 2;
    const span = Math.hypot(a.fighter.x - b.fighter.x, a.fighter.z - b.fighter.z);

    camera.setTarget(new B.Vector3(mx, 1.0, mz));
    const locked = entities.some(e => e.targetLock);
    const base = locked ? 3.0 : 4.2;
    const target = Math.max(base, span * 0.9 + 3.0);

    // Con el inspector abierto manda el zoom manual (ctrl+rueda). Sin esto,
    // `fitCamera` devolveria el radio a su valor canonico en cada frame y el
    // zoom se perderia al instante. Al cerrar el inspector, el ajuste automatico
    // vuelve a mandar solo.
    const destino = (inspector && inspector.isOpen() && inspector.camBias)
        ? inspector.camBias : target;
    camera.radius += (destino - camera.radius) * (1 - Math.exp(-dt * 3));
}

/**
 * Traduce el estado de la FSM de una entidad a la POSTURA que entiende la capa
 * de choque (core/clinch.js). Es un PUENTE, no una logica: si el motor anade
 * un estado nuevo, se toca solo esta funcion.
 *
 * OJO: esto lee el estado de la FSM del frame ANTERIOR (la entidad acaba de
 * actualizarse, asi que ya es el nuevo). Para el choque da igual: el impacto
 * ocurre en el mismo frame que el cambio de estado.
 */
function postureOf(entity) {
    const fsm = entity.fsm;
    const id = fsm ? fsm.stateId : null;
    if (id == null) return 'NEUTRAL';

    // Se comparan los grupos/bandas de fase, no los ids sueltos: asi no hay que
    // mantener una lista de ids aqui que se quede vieja.
    const phase = fsm.state ? fsm.state.phase : null;
    const group = fsm.state ? fsm.state.group : null;

    if (phase === 'AIR') return 'AIRBORNE';
    if (phase === 'DOWNED') return 'DOWNED';
    if (group === 'GRAPPLE') return 'GRAPPLE';

    // De pie: se distingue por la velocidad real de la entidad, que es lo que
    // distingue correr de andar aunque la FSM no lo diga.
    const sp = Math.hypot(entity.vx || 0, entity.vz || 0);
    if (sp > 4.0) return 'DASH';
    if (sp > 1.6) return 'RUN';
    if (sp > 0.15) return 'WALK';

    // Quieto: de pie o agachado, segun la postura de combate que tenga puesta.
    return entity.stance && entity.stance.id === 'CROUCH' ? 'CROUCH' : 'NEUTRAL';
}

/**
 * LECTURA DEL BOTON DE MOVER: paso por toque frente a pulsacion mantenida.
 *
 * Es la pieza que hace que tocar y mantener se sientan distintos (un paso
 * corto frente a andar o correr), que es de lo que habla core/locomotion.js.
 * Solo mira el EJE del dpad; los botones de golpe van por otro lado.
 *
 * @param {number} time  reloj del juego
 * @returns {object} { kind, dirX, dirZ }
 */
function readMoveInput(time) {
    if (!ui) return { kind: LOCO.IDLE, dirX: 0, dirZ: 0 };
    const d = ui.touchControls.dpad;

    const dirX = (d.right ? 1 : 0) - (d.left ? 1 : 0);
    const dirZ = (d.up ? 1 : 0) - (d.down ? 1 : 0);
    const hay = dirX !== 0 || dirZ !== 0;

    const kind = readLoco(locoState, {
        down: hay,
        justDown: hay && !locoWasDown,
        justUp: !hay && locoWasDown,
        time: time,
        dir: { x: dirX, z: dirZ }
    });
    locoWasDown = hay;

    return { kind, dirX, dirZ };
}

/**
 * RESUELVE EL CHOQUE ENTRE LOS DOS CUERPOS.
 *
 * Solo mira a los dos luchadores (no la utileria). Si el veredicto dice que no
 * hay choque, no hace nada. Si lo hay, aplica el dano y el empuje.
 *
 * @param {number} dt
 * @param {object} input  el input del frame, para leer los botones del instante
 */
function resolveBodyClash(dt, input) {
    if (entities.length < 2) return;

    const a = entities[0];
    const b = entities[1];

    // Radio de contacto: dos cuerpos se tocan cuando estan mas cerca que la
    // suma de sus volumenes. Es el mismo criterio que usa MIN_SPACING, pero
    // aqui NO se separan: se resuelve que pasa en el choque.
    const dx = b.fighter.x - a.fighter.x;
    const dz = b.fighter.z - a.fighter.z;
    if (Math.hypot(dx, dz) > OPPONENT_HULL * 2) return;   // ni se tocan

    const v = resolveClash({
        x: a.fighter.x, z: a.fighter.z,
        posture: postureOf(a),
        attack: 'NONE',
        input: botonDelInstante(input)
    }, {
        x: b.fighter.x, z: b.fighter.z,
        posture: postureOf(b),
        attack: 'NONE',
        input: 'NONE'
    });

    if (!v.isClash || v.result === 'ABSORB') return;

    if (v.damageA) a.fighter.health = Math.max(0, a.fighter.health - v.damageA);
    if (v.damageB) b.fighter.health = Math.max(0, b.fighter.health - v.damageB);

    console.log('choque: ' + v.result + ' (' + v.reason + ')');
}

/**
 * Que boton esta pulsado EN EL FRAME DEL CHOQUE (la explotacion).
 *
 * Las claves de `input.pressed` son los ids de `SPF.Intent`, que son numeros,
 * NO nombres: hay que buscar por el id o esto no detecta nunca nada.
 */
function botonDelInstante(input) {
    if (!input || !input.pressed) return 'NONE';
    const p = input.pressed;
    if (p[Intent.ATAQUE_LIGERO]) return 'PUNCH';
    if (p[Intent.ATAQUE_PESADO]) return 'KICK';
    if (p[Intent.ACCION]) return 'ACTION';
    if (p[Intent.GUARDIA]) return 'GUARD';
    return 'NONE';
}

/** Un frame de juego. */
function render() {
    // OJO: getDeltaTime() devuelve MILISEGUNDOS en Babylon. Tratarlo
    // como segundos (el bug de siempre) hacia el juego ~16x mas rapido.
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.1);

    if (!ui || !entities.length) {
        // Todavia no hay combate: solo camara y dibujo.
        fitCamera(dt);
        scene.render();
        return;
    }

    // --- INSPECTOR DE ANIMACIONES (F2) ---------------------------------
    // Cuando esta abierto, el combate NO avanza y el inspector escribe la pose.
    //
    // POR QUE SE SACA ANTES DEL INPUT Y NO AL FINAL DEL BUCLE
    //   Si el combate avanzara un frame mas con cada pulsacion de F2, el
    //   estado de la FSM avanzaria mientras se mira un fotograma: al cerrar el
    //   inspector el combate estaria medio segundo por delante de donde se
    //   dejo. Es el mismo motivo por el que el menu de controles congela el
    //   juego, pero aqui el congelado es TOTAL (no solo el teclado), porque lo
    //   que se mira es un instante, no una partida.
    //
    // El HUD y la camara siguen vivos: el HUD para ver la vida, la camara para
    // poder girar alrededor del golpe que se esta viendo.
    if (inspector && inspector.isOpen()) {
        // La camara sigue viva: sin esto el objetivo se queda congelado en
        // donde estaba al abrir el panel, y si el rival esta lejos la pose se
        // ve fuera de encuadre.
        fitCamera(dt);
        inspector.tick(dt);
        if (hud) hud.tick(dt);
        scene.render();
        return;
    }

    // --- Input (una lectura por frame) ----------------------------------
    const cam = cameraGroundBasis();
    const player = entities[0];
    const opp = world.opponentOf(player);
    let toOpp = null;
    if (opp) {
        const dx = opp.fighter.x - player.fighter.x;
        const dz = opp.fighter.z - player.fighter.z;
        const d = Math.hypot(dx, dz) || 1;
        toOpp = { x: dx / d, z: dz / d };
    }
    // Teclado + mando + tactil se unifican aqui, una vez por frame, para que
    // el InputMapper siga leyendo un unico objeto de estado.
    ui.syncInput();
    const input = inputMapper.snapshot(ui.touchControls, cam, toOpp);
    inputMapper.tick(dt);

    // El boton de mover se lee aparte: es lo que distingue un paso por toque
    // de mantener y andar (core/locomotion.js).
    const loco = readMoveInput(inputMapper.time);
    if (entities[0]) entities[0].loco = loco;

    // --- Boton multiple ---------------------------------------------------
    updateActionButton(input, dt);

    // --- Avance del mundo (congelado por el hitstop) -------------------
    if (world.hitstop > 0) {
        world.hitstop = Math.max(0, world.hitstop - dt);
    } else {
        // P1 recibe el input real; el rival pasivo, input vacio.
        for (let i = 0; i < entities.length; i++) {
            entities[i].update(dt, i === 0 ? input : IDLE_INPUT, world);
        }
        for (const prop of world.props) prop.update(dt);

        // CHOQUE entre los dos cuerpos (core/clinch.js). Se comprueba DESPUES
        // de mover a los dos y ANTES de aplicar el ring-out, asi que un choque
        // que manda a alguien al suelo puede ser lo que provoque que se salga.
        resolveBodyClash(dt, input);

        // Quien se sale del ring paga 50 de vida y los dos vuelven al centro.
        // Se comprueba DESPUES de mover a todos, no dentro de la entidad: si
        // se hiciera ahi, el rival podria "arrastrar" al otro fuera el mismo
        // frame en que se mueve, y la falta se adjudicaria a quien todavia no
        // ha salido.
        const fuera = world.ringOut();
        if (fuera) {
            inputMapper.reset();
            console.log(fuera + ' se salio del ring: -' + RING_OUT_DAMAGE + ' de vida');
        }
    }

    fitCamera(dt);
    scene.render();

    if (hud) {
        for (const e of entities) {
            hud.update(e.fighter.name, { health: e.fighter.health, stamina: e.fighter.gauge.value });
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
window.SANPABLERA = { engine, scene, camera, fighters, entities, world, inputMapper, loading, ground, hud };

// El inspector se expone por getter porque todavia es null aqui (se crea al
// final de boot):
window.SANPABLERA.getInspector = () => inspector;
window.SANPABLERA.getRouter = () => (ui ? ui.router : null);

/** Abre o cierra el inspector de animaciones (atajo a la tecla F2). */
window.SANPABLERA.anim = function () {
    if (inspector) inspector.toggle();
    return !!(inspector && inspector.isOpen());
};

// Helpers de debug: probar barras y golpes en tiempo real sin esperar
// al input tactil.
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

/**
 * Dispara un golpe "a mano" contra el rival (debug / IA):
 *   SANPABLERA.punch('P1')                 -> puño (ligero)
 *   SANPABLERA.punch('P1', 'ATAQUE_PESADO')-> patada (pesado)
 * El intent lo resuelve la tabla de transiciones, como con el mando.
 */
window.SANPABLERA.punch = function (name, moveKey) {
    const e = entities.find(x => x.fighter.name === name);
    if (!e) return false;
    const intent = moveKey === 'ATAQUE_PESADO' ? Intent.ATAQUE_PESADO : Intent.ATAQUE_LIGERO;
    e.tryIntent(intent);
    return true;
};

/**
 * Recibe un golpe a mano para ver la REACCION sin tener que pegarlo
 * (debug de la matriz 3x3 de alturas y potencias):
 *
 *   SANPABLERA.recibir('P1', 'ALTO', 'FUERTE')
 *   SANPABLERA.recibir('P2', 'BAJO', 'DEBIL')
 */
window.SANPABLERA.recibir = function (name, altura, potencia) {
    const e = entities.find(x => x.fighter.name === name);
    const rival = entities.find(x => x.fighter.name !== name);
    if (!e || !rival) return false;
    // Un golpe de mentira con el frame data que decide la reaccion. Se usa el
    // mismo `move` que usaria un golpe de verdad, para que la prueba vea lo
    // que vera en partida.
    const move = {
        key: 'DEBUG', label: 'debug', state: 0, phase: 'GROUND',
        startup: 4, active: 3, recovery: 12, duration: 19,
        damage: potencia === 'FUERTE' ? 15 : potencia === 'MEDIO' ? 9 : 4,
        hitstun: potencia === 'FUERTE' ? 22 : potencia === 'MEDIO' ? 15 : 10,
        blockstun: 0,
        hitLevel: potencia === 'FUERTE' ? 'FUERTE' : potencia === 'DEBIL' ? 'BAJO' : 'MEDIO',
        power: potencia, height: altura,
        type: 'LINEAL', breaksGuardHeight: 'ALTA',
        knockdown: potencia === 'FUERTE' ? 'ALWAYS' : 'NONE',
        launch: { x: potencia === 'FUERTE' ? 4 : 1, y: 0 },
        juggleAdd: 0, hitstop: 6, radius: 0.5, forward: 0.5,
        hitbox: { radius: 0.5, forward: 0.5, centerY: 1.1 }
    };
    e.takeHit(move, { fighter: rival.fighter }, world);
    return { altura, potencia };
};

/** Cambia la tela (o la quita) para ver como afecta. */
window.SANPABLERA.tela = function (name, on) {
    const e = entities.find(x => x.fighter.name === name);
    if (!e || !e.cape) return false;
    e.cape.setEnabled(on !== false);
    return true;
};

/** Viento de prueba sobre las capas. */
window.SANPABLERA.viento = function (x, y, z) {
    for (const e of entities) if (e.cape) e.cape.env.wind = [x, y, z];
};

/** Elige la postura del peleador (SHELL · LEAD · RELAX · PRESS...). */
window.SANPABLERA.stance = function (name, id) {
    const e = entities.find(x => x.fighter.name === name);
    if (!e) return;
    if (id) e._adopt(id);
    else e._startDance([nextStance(e.stance.id, false)]);
    return e.stance.id;
};

/** Activa / desactiva el candado de target de un peleador. */
window.SANPABLERA.target = function (name, on) {
    const e = entities.find(x => x.fighter.name === name);
    if (!e) return;
    e.targetLock = !!on;
};

export default { boot, render, entities, world };
