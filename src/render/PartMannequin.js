/**
 * ============================================================================
 * SANPABLERA ENGINE · render/PartMannequin.js
 * ----------------------------------------------------------------------------
 * MANIQUI DE PIEZAS: un humanoide construido con PRIMITIVAS de Babylon
 * (capsulas, cajas y esferas) colgadas de los huesos del contrato.
 *
 * QUE ES Y POR QUE EXISTE
 * ----------------------------------------------------------------------------
 *   Este proyecto tiene un problema viejo y documentado en la bitacora: el
 *   modelo de Quaternius (CC0, el mejor que se ha encontrado con licencia
 *   redistribuible) tiene la malla en Y y los HUESOS en Z, y la postura
 *   procedural no le encaja: el peleador sale hecho una bola. Arreglar un .glb
 *   ajeno, con su escala y su convencion de huesos, es trabajo de arquivo por
 *   archivo, y el proximo modelo traera otra convencion.
 *
 *   Este mannequin lo quita de en medio. Las piezas se cuelgan de los nombres
 *   DEL CONTRATO (PELVIS, CHEST, UPPERARM_L...), no de los del archivo, asi
 *   que el esqueleto es siempre el correcto y la postura procedural siempre
 *   funciona. Y como las piezas son propias, se pueden FAMILIAR: el torso es
 *   una caja, el muslo una capsula. No es un personaje artistico, es el modelo
 *   de trabajo con el que se verifica que la animacion es correcta.
 *
 *   Sigue siendo util fuera de las pruebas: dos peleadores de colores
 *   distintos con siluetas legibles son exactamente lo que hace falta para
 *   que un jugador entienda quien esta pegando a quien. Por eso esta en
 *   render/ y no en tests/.
 *
 * QUE SE DIBUJA
 * ----------------------------------------------------------------------------
 *   pelvis  caja       torso    caja        cabeza  esfera
 *   cuello  capsula    hombro   esfera      brazo    2 capsulas (upper + fore)
 *   mano    caja       muslo   capsula     Pantorrilla capsula
 *   pie     caja
 *
 *   TODO cuelga de un hueso del contrato, no del padre visual: el antebrazo
 *   cuelga de FOREARM_L, no de UPPERARM_L. Es lo que hace que la cadena del
 *   IK (cine/Rig.js) mueva la pieza correcta.
 *
 * CONVENCION
 *   Y arriba, Z adelante, como el resto del motor. Las piezas se crean con
 *   CreateCapsule / CreateBox / CreateSphere y se cuelgan del nodo del hueso
 *   con `parent`, no con posicion absolute: asi el motor 3D compone la
 *   jerarquia solo y no hay que replicar la FK a mano.
 * ============================================================================
 */

import { BONES } from '../core/cine/CineConstants.js';

/** Colores por defecto del maniqui. Se pueden sobreescribir por pieza. */
export const DEFAULT_SKIN = Object.freeze({
    torso: '#3f4a63',
    pelvis: '#333c52',
    head: '#c8a58a',
    limbs: '#8f9bb3',
    hands: '#c8a58a',
    feet: '#2b3247'
});

/**
 * Radio (m) de cada pieza. Un maniqui legible no es un maniqui fino: si las
 * piernas son un alambre, cuando el peleador esta en cuclillas no se ve por
 * donde esta el pie y el combate se entiende peor. Estos numeros dan la
 * silueta de un cuerpo de Boxeo sin detalle.
 */
export const PART_SIZES = Object.freeze({
    pelvis: { w: 0.30, h: 0.20, d: 0.20 },
    torso: { w: 0.34, h: 0.36, d: 0.22 },
    chest: { w: 0.36, h: 0.16, d: 0.22 },
    neck: { r: 0.055, h: 0.09 },
    head: { r: 0.105 },
    shoulder: { r: 0.075 },
    upperArm: { r: 0.055 },
    foreArm: { r: 0.048 },
    hand: { w: 0.075, h: 0.10, d: 0.055 },
    thigh: { r: 0.075 },
    shin: { r: 0.058 },
    foot: { w: 0.085, h: 0.065, d: 0.20 },
    toe: { r: 0.038 }
});

/** Media anchura (X) de cada hueso. El pie tiene que estar en su sitio. */
function halfWidthOf(contract) {
    const b = BONES.find((x) => x.name === contract);
    return b && b.offset ? Math.abs(b.offset[0]) : 0.10;
}

/**
 * La lista de piezas: que hueso del contrato lleva cada una y de que tipo.
 *
 * ESTA TABLA ES EL "MODELO GENERICO CON PIEZAS"
 * ----------------------------------------------------------------------------
 *   Se puede cambiar entero sin tocar el motor: un peleador mas corpulento es
 *   una tabla de medidas distinta, no un .glb distinto. Y anadir una pieza
 *   (una capa, un cordón, una cinta en la cabeza) es anadir una fila, no
 *   reescribir el generador.
 *
 * @param {string} contract  nombre del hueso del contrato
 * @param {string} kind      'box' | 'capsule' | 'sphere'
 * @param {object} size      medidas (ver PART_SIZES)
 * @param {object} [at]      desplazamiento LOCAL dentro del hueso [x,y,z]
 * @param {number[]} [dir]   orientacion local de la pieza (euler)
 */
export const PART_TABLE = Object.freeze([
    { contract: 'PELVIS', kind: 'box', size: PART_SIZES.pelvis, at: [0, 0.04, 0] },
    { contract: 'SPINE', kind: 'box', size: PART_SIZES.torso, at: [0, 0.08, 0] },
    { contract: 'CHEST', kind: 'box', size: PART_SIZES.chest, at: [0, 0.09, 0] },
    { contract: 'NECK', kind: 'capsule', size: PART_SIZES.neck, at: [0, 0.045, 0] },
    { contract: 'HEAD', kind: 'sphere', size: PART_SIZES.head, at: [0, 0.11, 0] },

    // --- brazos --------------------------------------------------------
    { contract: 'CLAV_L', kind: 'sphere', size: PART_SIZES.shoulder, at: [0.08, 0.01, 0] },
    { contract: 'UPPERARM_L', kind: 'capsule', size: PART_SIZES.upperArm, at: [0.15, 0, 0], axis: 'X' },
    { contract: 'FOREARM_L', kind: 'capsule', size: PART_SIZES.foreArm, at: [0.135, 0, 0], axis: 'X' },
    { contract: 'HAND_L', kind: 'box', size: PART_SIZES.hand, at: [0.045, 0, 0] },
    { contract: 'CLAV_R', kind: 'sphere', size: PART_SIZES.shoulder, at: [-0.08, 0.01, 0] },
    { contract: 'UPPERARM_R', kind: 'capsule', size: PART_SIZES.upperArm, at: [-0.15, 0, 0], axis: 'X' },
    { contract: 'FOREARM_R', kind: 'capsule', size: PART_SIZES.foreArm, at: [-0.135, 0, 0], axis: 'X' },
    { contract: 'HAND_R', kind: 'box', size: PART_SIZES.hand, at: [-0.045, 0, 0] },

    // --- piernas -------------------------------------------------------
    // Cada pierna va con su propio desplazamiento en X (la cadera esta
    // abierta): sin esto las dos piernas nacen en el mismo sitio y el
    // personaje aparece sin APDURA, que en un juego de pelea es fatal.
    { contract: 'THIGH_L', kind: 'capsule', size: PART_SIZES.thigh, at: [0, -0.21, 0], axis: 'Y' },
    { contract: 'SHIN_L', kind: 'capsule', size: PART_SIZES.shin, at: [0, -0.19, 0], axis: 'Y' },
    { contract: 'FOOT_L', kind: 'box', size: PART_SIZES.foot, at: [0, -0.02, 0.04] },
    { contract: 'TOE_L', kind: 'sphere', size: PART_SIZES.toe, at: [0, -0.05, 0.12] },
    { contract: 'THIGH_R', kind: 'capsule', size: PART_SIZES.thigh, at: [0, -0.21, 0], axis: 'Y' },
    { contract: 'SHIN_R', kind: 'capsule', size: PART_SIZES.shin, at: [0, -0.19, 0], axis: 'Y' },
    { contract: 'FOOT_R', kind: 'box', size: PART_SIZES.foot, at: [0, -0.02, 0.04] },
    { contract: 'TOE_R', kind: 'sphere', size: PART_SIZES.toe, at: [0, -0.05, 0.12] }
]);

/** A que color va cada pieza (para poder tintar por peleador). */
function skinOf(contract) {
    if (contract === 'HEAD' || contract === 'NECK') return DEFAULT_SKIN.head;
    if (contract === 'HAND_L' || contract === 'HAND_R') return DEFAULT_SKIN.hands;
    if (contract === 'FOOT_L' || contract === 'FOOT_R' ||
        contract === 'TOE_L' || contract === 'TOE_R') return DEFAULT_SKIN.feet;
    if (contract === 'PELVIS') return DEFAULT_SKIN.pelvis;
    if (contract === 'SPINE' || contract === 'CHEST') return DEFAULT_SKIN.torso;
    return DEFAULT_SKIN.limbs;
}

/**
 * Fabrica las piezas de un maniqui.
 *
 * @param {object} B         BABYLON (global)
 * @param {object} scene
 * @param {object} nodes     contrato -> TransformNode (del CharacterModel)
 * @param {object} [opts]
 *   name      prefijo de los nombres
 *   parts     tabla de piezas (PART_TABLE por defecto)
 *   skin      { torso, pelvis, head, limbs, hands, feet } en hex
 *   material  material ya hecho (si se pasa, se usa para todo)
 * @returns {{meshes: Mesh[], materials: object}}
 */
export function buildParts(B, scene, nodes, opts = {}) {
    const skin = Object.assign({}, DEFAULT_SKIN, opts.skin || {});
    const table = opts.parts || PART_TABLE;
    const meshes = [];
    const materials = Object.create(null);
    // El hueso CONTRACTUAL de cada malla, en el MISMO orden que `meshes`.
    const madeContracts = [];

    const mat = (hex) => {
        const m = new B.StandardMaterial((opts.name || 'part') + '_' + hex.slice(1), scene);
        m.diffuseColor = B.Color3.FromHexString(hex);
        m.specularColor = new B.Color3(0.10, 0.10, 0.12);
        m.specularPower = 24;
        return m;
    };

    for (const p of table) {
        const parent = nodes[p.contract];
        if (!parent) continue;          // el modelo no tiene ese hueso: se salta
        const name = (opts.name || 'part') + '_' + p.contract;

        let mesh;
        if (p.kind === 'sphere') {
            mesh = B.MeshBuilder.CreateSphere(name, { diameter: p.size.r * 2, segments: 10 }, scene);
        } else if (p.kind === 'capsule') {
            mesh = B.MeshBuilder.CreateCapsule(name, {
                radius: p.size.r,
                height: (p.size.h || p.size.r * 2) + p.size.r * 2,
                tessellation: 10,
                subdivisions: 1
            }, scene);
        } else {
            mesh = B.MeshBuilder.CreateBox(name, {
                width: p.size.w, height: p.size.h, depth: p.size.d
            }, scene);
        }

        mesh.parent = parent;
        const at = p.at || [0, 0, 0];
        mesh.position.set(at[0], at[1], at[2]);

        // Una capsula nace alineada con +Y. Cuando la pieza va a lo largo de un
        // hueso que apunta en +X (los brazos, en la pose de reposo del
        // contrato) hay que tumbarla 90 grados. Sin esta rotacion los brazos
        // salen como dos palos verticales clavados en los hombros.
        if (p.kind === 'capsule' && p.axis === 'X') mesh.rotation.z = Math.PI / 2;
        if (p.kind === 'capsule' && p.axis === 'Z') mesh.rotation.x = Math.PI / 2;

        const hex = opts.material ? null : skinOf(p.contract);
        if (!opts.material) {
            if (!materials[hex]) materials[hex] = mat(hex);
            mesh.material = materials[hex];
        } else {
            mesh.material = opts.material;
        }

        mesh.isPickable = false;
        meshes.push(mesh);
        madeContracts.push(p.contract);
    }

    // Se devuelve el hueso CONTRACTUAL de cada pieza, no solo la malla. Antes
    // el llamante lo hacia con `meshes[i]` sobre la tabla de entrada, y eso se
    // descuadraba en cuanto una pieza se saltaba porque su hueso no existia en
    // el modelo (que es justo lo que pasa con un esqueleto de 19 huesos): a
    // partir de ahi, todas las piezas llevaban el nombre de otra y al tintar
    // de color se coloreaban manos y pies como si fueran torso.
    return { meshes, materials, contracts: madeContracts };
}

/**
 * Tinte por peleador: cambia el material de todas las piezas a un color.
 *
 * POR QUE HAY UNA FUNCION DEDICADA Y NO BASTA CON ASIGNAR UN MATERIAL
 *   El maniqui tiene seis colores por defecto (piel, ropa, manos...). Si en
 *   combate los dos peleadores tuvieran el mismo material no se sabria quien
 *   es quien, y con un solo color los pies y las manos dejan de leerse. Esta
 *   funcion sustituye TODO por el color del peleador y deja un material mas
 *   claro para las manos y la cabeza, que es lo que hace legible de quien es
 *   quien a tres metros.
 */
export function tintParts(B, scene, parts, rgb, opts = {}) {
    const [r, g, b] = rgb;
    const body = new B.StandardMaterial((opts.name || 'part') + '_tint', scene);
    body.diffuseColor = new B.Color3(r, g, b);
    body.specularColor = new B.Color3(0.14, 0.14, 0.16);
    body.specularPower = 28;

    const skin = new B.StandardMaterial((opts.name || 'part') + '_skin', scene);
    skin.diffuseColor = new B.Color3(
        Math.min(1, r * 0.55 + 0.42),
        Math.min(1, g * 0.55 + 0.36),
        Math.min(1, b * 0.55 + 0.30)
    );
    skin.specularColor = new B.Color3(0.08, 0.08, 0.08);

    for (const p of parts) {
        const isSkin = /^(HEAD|NECK|HAND_L|HAND_R)$/.test(p.contract);
        p.mesh.material = isSkin ? skin : body;
    }
    parts.tint = body;
    return body;
}

export default { PART_TABLE, PART_SIZES, DEFAULT_SKIN, buildParts, tintParts };