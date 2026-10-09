/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/glb.mjs
 * ----------------------------------------------------------------------------
 * Lector de GLB minimo, SOLO para pruebas.
 *
 * POR QUE EXISTE: sin navegador ni WebGL no hay forma de "ver" el maniqui. Lo
 * que si se puede es medir el archivo: leer la jerarquia de huesos, aplicar la
 * FK y comprobar que la anatomia que sale es la de un humano de pie. Eso es lo
 * que este modulo permite, y lo que usan las pruebas de Rig, Stances y
 * Footwork para validar contra el .glb REAL del repositorio.
 *
 * NO se usa en el motor: alli carga Babylon. Esto es una herramienta de test.
 * ============================================================================
 */
import { readFileSync } from 'node:fs';

const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NUM = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

/**
 * @returns { nodes, skins, animations, meshes, accessors, images }
 *   nodes[i] = { name, parent, children, translation, rotation, scale, matrix }
 */
export function parseGLB(buffer) {
    if (buffer.readUInt32LE(0) !== 0x46546c67) throw new Error('no es un GLB');
    let off = 12;
    let json = null;
    let bin = null;
    while (off < buffer.length) {
        const len = buffer.readUInt32LE(off);
        const type = buffer.readUInt32LE(off + 4);
        const start = off + 8;
        if (type === 0x4e4f534a) json = JSON.parse(buffer.slice(start, start + len).toString('utf8'));
        else if (type === 0x004e4942) bin = buffer.slice(start, start + len);
        off = start + len + ((4 - (len % 4)) % 4);
    }
    const nodes = (json.nodes || []).map((n, i) => ({
        index: i,
        name: n.name || `node_${i}`,
        children: n.children || [],
        translation: n.translation || [0, 0, 0],
        rotation: n.rotation || [0, 0, 0, 1],
        scale: n.scale || [1, 1, 1],
        matrix: n.matrix || null
    }));
    nodes.forEach((n) => n.children.forEach((c) => { nodes[c].parent = n.index; }));
    return {
        json,
        nodes,
        skins: json.skins || [],
        meshes: json.meshes || [],
        animations: json.animations || [],
        images: json.images || [],
        sampler: makeSampler(json, bin)
    };
}

/**
 * Lector de .gltf con el .bin aparte.
 *
 * POR QUE HACE FALTA ADEMAS DEL .glb: no todos los exporters de la industria
 * producen un .glb binario. El pack CC0 de Quaternius llega como .gltf + .bin
 * sueltos, y es justamente el modelo con el que hay que comprobar el puente
 * rig -> Babylon (ver CharacterModel.wrapperTransform). Sin esto, el test que
 * protege ese bug no se puede escribir.
 */
export function parseGLTF(json, bin) {
    const nodes = (json.nodes || []).map((n, i) => ({
        index: i,
        name: n.name || `node_${i}`,
        children: n.children || [],
        translation: n.translation || [0, 0, 0],
        rotation: n.rotation || [0, 0, 0, 1],
        scale: n.scale || [1, 1, 1],
        matrix: n.matrix || null
    }));
    nodes.forEach((n) => n.children.forEach((c) => { nodes[c].parent = n.index; }));
    return {
        json,
        nodes,
        skins: json.skins || [],
        meshes: json.meshes || [],
        animations: json.animations || [],
        images: json.images || [],
        sampler: makeSampler(json, bin)
    };
}

function makeSampler(json, bin) {
    return (i) => {
        const a = json.accessors[i];
        const v = json.bufferViews[a.bufferView];
        const base = (v.byteOffset || 0) + (a.byteOffset || 0);
        const n = a.count * NUM[a.type];
        const Arr = COMP[a.componentType];
        return {
            array: new Arr(bin.buffer, bin.byteOffset + base, n),
            count: a.count, type: a.type, componentType: a.componentType
        };
    };
}

/** Lee un accesor entero y devuelve un array plano. */
export function readAccessor(glb, i) {
    const s = glb.sampler(i);
    return Array.from(s.array);
}

/** Nodos que son huesos de la primera skin, con su nombre real y su padre. */
export function bonesOf(glb) {
    const skin = glb.skins[0];
    if (!skin) return [];
    return skin.joints.map((nodeIndex) => {
        const n = glb.nodes[nodeIndex];
        return {
            name: n.name,
            parentName: n.parent === undefined ? null : glb.nodes[n.parent].name,
            localT: n.translation.slice(),
            localQ: n.rotation.slice(),
            nodeIndex
        };
    });
}

/** Caja envolvente de la malla en el espacio del archivo. */
export function meshBounds(glb) {
    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];
    for (const mesh of glb.meshes) {
        for (const prim of mesh.primitives) {
            const p = readAccessor(glb, prim.attributes.POSITION);
            for (let i = 0; i < p.length; i += 3) {
                for (let a = 0; a < 3; a++) {
                    if (p[i + a] < min[a]) min[a] = p[i + a];
                    if (p[i + a] > max[a]) max[a] = p[i + a];
                }
            }
        }
    }
    return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

/** Lee un .glb del disco. */
export function loadGLB(path) {
    return parseGLB(readFileSync(path));
}

/**
 * Lee un .gltf + su .bin del disco, por nombre de archivo sin extension.
 * Devuelve { gltf, bones, bounds } con la misma forma que loadGLB, para que los
 * tests puedan tratar los dos formatos igual.
 */
export function loadGLTFPair(basePath) {
    const gltf = parseGLTF(
        JSON.parse(readFileSync(basePath + '.gltf', 'utf8')),
        readFileSync(basePath + '.bin')
    );
    return { gltf, bones: bonesOf(gltf), bounds: meshBounds(gltf) };
}

export default { parseGLB, parseGLTF, readAccessor, bonesOf, meshBounds, loadGLB, loadGLTFPair };
