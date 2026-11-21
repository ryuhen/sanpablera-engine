/**
 * ============================================================================
 * SANPABLERA ENGINE · render/Diorama.js
 * ----------------------------------------------------------------------------
 * LA MAQUETA EN 3D. Una isla de carton levantada sobre el ring.
 * ============================================================================
 *
 * QUE CONSTRUYE
 *   Un root, la silueta de la isla con CreateRibbon (dos anillos, interior un
 *   poco mas alto: bayas y relieves sin triangulacion manual), una mancha por
 *   zona con CreateDisc y un marcador por hito con CreateCylinder. Todo con
 *   material toon, asi que se lee como una maqueta de novela grafica.
 *
 * POR QUE NO CreatePolygon / ExtrudePolygon
 *   Esas funciones necesitan earcut, que NO esta instalado. CreateRibbon y
 *   CreateDisc/Cylinder vienen en el nucleo y no piden nada mas.
 *
 * QUE NO HACE
 *   No toca la camara. Devuelve `zoomPara(id)` con los datos (target, radius)
 *   y es el motor el que los aplica a su ArcRotateCamera. Mantener el render
 *   separado de la camara es lo que permite cambiar la maqueta sin tocar
 *   Engine.js y viceversa.
 * ============================================================================
 */

import { hitoEn, zoomPara as zoomDeDatos } from '../core/geo/diorama.js';
import { createToonMaterial } from './ToonMaterial.js';

/** Colores de la leyenda, los mismos que en IslandMap.js. */
export const COLOR_ABIERTO = '#ffc72c';
export const COLOR_CERRADO = '#5a6480';
export const COLOR_SIGUIENTE = '#ff3b30';
export const COLOR_ISLA = '#e8d9a8';
export const COLOR_RESALTADO = '#fff2b0';

/** Un Vector3 o su equivalente si el B de turno no lo trae. */
function vec(B, x, y, z) {
    if (B && typeof B.Vector3 === 'function') return new B.Vector3(x, y, z);
    return { x, y, z };
}

/** Coloca una malla (position.set en Babylon, objeto en los stubs). */
function poner(mesh, x, y, z) {
    if (!mesh) return;
    if (mesh.position && typeof mesh.position.set === 'function') mesh.position.set(x, y, z);
    else mesh.position = { x, y, z };
}

/** Un disco horizontal: CreateDisc nace en XY, hay que tumbarlo. */
function crearDisco(MB, nombre, radio, scene) {
    let disco = null;
    if (typeof MB.CreateDisc === 'function') {
        disco = MB.CreateDisc(nombre, { radius: radio, tessellation: 12 }, scene);
        if (disco && disco.rotation) disco.rotation.x = Math.PI / 2;
    }
    if (!disco && typeof MB.CreateCylinder === 'function') {
        disco = MB.CreateCylinder(nombre, { diameter: radio * 2, height: 0.02, tessellation: 12 }, scene);
    }
    return disco;
}

/**
 * Material toon con red de seguridad: si el shader falla en un navegador raro,
 * se cae a StandardMaterial en vez de dejar la malla sin pintar.
 */
function matToon(B, scene, nombre, hex) {
    try {
        return createToonMaterial(B, scene, nombre, hex);
    } catch (_) {
        const simple = new B.StandardMaterial(nombre + '_plano', scene);
        simple.diffuseColor = B.Color3 && B.Color3.FromHexString
            ? B.Color3.FromHexString(hex) : { r: 1, g: 1, b: 1 };
        if (typeof B.Color3 === 'function') simple.specularColor = new B.Color3(0, 0, 0);
        return simple;
    }
}

/**
 * Construye la diorama a partir de los datos planos.
 *
 * @param {object} B      BABYLON (global)
 * @param {object} scene
 * @param {object} data   lo que devuelve buildDioramaData()
 * @param {object} [opts]
 *   y               altura base de la maqueta
 *   radio           radio de pick, en metros de escenario
 *   colorIsla       color de la silueta
 *   colorResaltado  color del marcador resaltado
 * @returns {{root:object, markers:object[], highlight:Function, highlightSiguiente:Function,
 *            pick:Function, dispose:Function, zoomPara:Function}}
 */
export function createDiorama(B, scene, data, opts = {}) {
    const MB = (B && B.MeshBuilder) || {};
    const baseY = typeof opts.y === 'number' ? opts.y : 0;
    const radioPick = typeof opts.radio === 'number' ? opts.radio : 1.2;
    const objetos = [];
    const materiales = [];

    // TransformNode es mas barato que una Mesh vacia; si el B no lo trae, una
    // Mesh sin geometria hace el mismo trabajo de padre.
    const root = B && typeof B.TransformNode === 'function'
        ? new B.TransformNode('diorama_root', scene)
        : (B && typeof B.Mesh === 'function' ? new B.Mesh('diorama_root', scene) : { name: 'diorama_root' });
    if (root && root.metadata === undefined) root.metadata = {};
    if (root && root.metadata) root.metadata.diorama = true;

    const adoptar = (m) => {
        if (m) {
            objetos.push(m);
            m.parent = root;
        }
        return m;
    };

    // --- la isla: dos anillos, el interior mas alto, con CreateRibbon ---------
    const vertices = data && data.isla && Array.isArray(data.isla.vertices)
        ? data.isla.vertices : [];
    // El contorno ya cierra; si el ultimo punto repite al primero se quita para
    // no dibujar un segmento de longitud cero dos veces.
    const anillo = vertices.length > 1
        && Math.abs(vertices[0][0] - vertices[vertices.length - 1][0]) < 1e-9
        && Math.abs(vertices[0][1] - vertices[vertices.length - 1][1]) < 1e-9
        ? vertices.slice(0, -1) : vertices;

    if (anillo.length > 2 && typeof MB.CreateRibbon === 'function') {
        const exterior = anillo.map(([x, z], i) => vec(B, x, baseY + 0.02 + 0.02 * Math.sin(i * 1.7), z));
        const interior = anillo.map(([x, z], i) => vec(B, x * 0.72, baseY + 0.07 + 0.02 * Math.sin(i * 1.7), z * 0.72));
        const isla = adoptar(MB.CreateRibbon('diorama_isla', {
            pathArray: [exterior, interior],
            closePath: true,
            closeArray: false
        }, scene));
        const material = matToon(B, scene, 'diorama_isla_mat', opts.colorIsla || COLOR_ISLA);
        materiales.push(material);
        if (isla) isla.material = material;
    }

    // --- las manchas de zona -------------------------------------------------
    const zonas = data && Array.isArray(data.zonas) ? data.zonas : [];
    for (const z of zonas) {
        const disco = adoptar(crearDisco(MB, 'diorama_zona_' + z.id, z.radio, scene));
        const material = matToon(B, scene, 'diorama_zona_mat_' + z.id, z.color);
        materiales.push(material);
        if (disco) {
            poner(disco, z.centro[0], baseY + 0.035, z.centro[1]);
            disco.material = material;
        }
    }

    // --- los marcadores ------------------------------------------------------
    const hitos = data && Array.isArray(data.hitos) ? data.hitos : [];
    const markers = [];
    markers.byId = Object.create(null);
    const materialBase = Object.create(null);

    for (const h of hitos) {
        const color = h.siguiente ? COLOR_SIGUIENTE : (h.abierto ? COLOR_ABIERTO : COLOR_CERRADO);
        const material = matToon(B, scene, 'diorama_marca_' + h.id, color);
        materiales.push(material);
        materialBase[h.id] = material;

        let marca = null;
        if (typeof MB.CreateCylinder === 'function') {
            marca = MB.CreateCylinder('diorama_marca_' + h.id, {
                diameter: 0.55, height: 0.12, tessellation: 8
            }, scene);
        } else if (typeof MB.CreateDisc === 'function') {
            marca = crearDisco(MB, 'diorama_marca_' + h.id, 0.28, scene);
        }
        adoptar(marca);
        if (marca) {
            poner(marca, h.x, baseY + (h.y || 0) + 0.12, h.z);
            marca.material = material;
            marca.isPickable = true;
            marca.metadata = Object.assign({}, marca.metadata, { hitoId: h.id });
        }
        markers.push(marca);
        markers.byId[h.id] = marca;
    }

    const materialResaltado = matToon(B, scene, 'diorama_resaltado', opts.colorResaltado || COLOR_RESALTADO);
    materiales.push(materialResaltado);
    let resaltado = null;

    /** Pinta un marcador con el color de resaltado; el resto vuelve al suyo. */
    function highlight(id) {
        for (const h of hitos) {
            const marca = markers.byId[h.id];
            if (marca && materialBase[h.id]) marca.material = materialBase[h.id];
        }
        resaltado = id && markers.byId[id] ? id : null;
        if (resaltado) markers.byId[resaltado].material = materialResaltado;
        return resaltado;
    }

    /** Resalta el siguiente objetivo de la ruta, si queda alguno. */
    function highlightSiguiente() {
        const sig = hitos.find(h => h.siguiente);
        return sig ? highlight(sig.id) : null;
    }

    /** El hito mas cercano al punto (en metros de escenario), o null. */
    function pick(x, z) {
        return hitoEn(data, x, z, radioPick);
    }

    /** Datos de camara para un hito. Nada de mover la camara aqui. */
    function zoomParaId(id) {
        return zoomDeDatos(data, id);
    }

    /** Suelta mallas, materiales y root. */
    function dispose() {
        for (const material of materiales) {
            if (material && typeof material.dispose === 'function') material.dispose();
        }
        for (const objeto of objetos) {
            if (objeto && typeof objeto.dispose === 'function') objeto.dispose();
        }
        if (root && typeof root.dispose === 'function') root.dispose();
        markers.length = 0;
        markers.byId = Object.create(null);
        resaltado = null;
    }

    return {
        root,
        markers,
        highlight,
        highlightSiguiente,
        pick,
        dispose,
        zoomPara: zoomParaId,
        get resaltado() { return resaltado; }
    };
}

export default createDiorama;
