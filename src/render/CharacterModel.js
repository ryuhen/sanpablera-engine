/**
 * ============================================================================
 * SANPABLERA ENGINE · render/CharacterModel.js
 * ----------------------------------------------------------------------------
 * El PUENTE entre el esqueleto numerico (core/cine/Rig.js) y el esqueleto real
 * de Babylon. Es el unico archivo de este proyecto que toca BABYLON para
 * mattered de personajes, y por eso todo lo que hay ahi se puede testear en
 * Node sin motor grafico.
 *
 * QUE HACE Y POR QUE HACE FALTA
 * ----------------------------------------------------------------------------
 *   core/cine no sabe que existe Babylon: calcula una pose de deltas en
 *   "espacio de personaje" (Y arriba, Z adelante, origen en el suelo bajo la
 *   pelvis). Este modulo se limita a volcar esos numeros sobre los
 *   TransformNode del .glb, en el orden jerarquico correcto y aplicando el
 *   MISMO espacio de rotacion que usa Babylon (cuaternion zurdo).
 *
 * EL AGUA Y EL TRABAJO DURO ESTAN EN OTRO SITIO
 * ----------------------------------------------------------------------------
 *   Aqui no hay cinematica, ni stances, ni pasos. Eso lo decide el procedural
 *   generator y llega aqui como una Pose ya resuelta. CharacterModel solo sabe
 *   escribirla. Si manana se sustituye el generador de movimiento por clips grabados,
 *   este archivo no cambia: sigue siendo el sitio donde una Pose se convierte
 *   en pixeles.
 *
 * POR QUE NO SE USA scene.beginAnimation PARA LAS POSES
 * ----------------------------------------------------------------------------
 *   Babylon interpola entre dos claves guardadas. Una Pose procedural se
 *   recalcula cada frame a partir de donde esten los pies y la cadera, asi que
 *   no hay dos claves entre las que interpolar: hay una solucion por frame. Por
 *   eso el generador escribe directamente los huesos y deja los Animation /
 *   AnimationGroup (clip grabados) para lo que si sea claveframe.
 *
 * MODELO ACTUAL
 * ----------------------------------------------------------------------------
 *   assets/characters/mannequin.glb (Khronos Rigged Figure, CC BY 4.0). Esta en
 *   Z arriba, asi que se compensa con rootFix 'Z_UP' en buildRig. El archivo
 *   tambien trae un nodo "Z_UP" en la raiz que hace lo mismo: por eso el
 *   personaje aparece de pie sin que haya que tocar el importador.
 * ============================================================================
 */

import { buildBoneMap } from './BoneMap.js';
import { buildRig, fk } from '../core/cine/Rig.js';
import { createPose, rotOf, posOf } from '../core/cine/Pose.js';
import { CFG } from '../core/cine/CineConstants.js';

/** Quita el sufijo del pivot de un nombre de glTF (`Bone.001` -> `Bone`). */
function stripSuffix(name) {
    const m = /^(.*?)\.\d+$/.exec(name);
    return m ? m[1] : name;
}

/**
 * Lee los huesos de una jerarquia de Babylon y los pasa al formato que espera
 * buildRig: { name, parentName, localT, localQ } en el espacio DEL ARCHIVO.
 *
 * POR QUE HAY QUE CONSTRUIRLO A MANO Y NO USAR EL SKELETON DE BABYLON
 *   El esqueleto de Babylon ya viene en el espacio del motor (Y arriba, Z adelante,
 * zurdo). Como este archivo esta en Z arriba, los valores locales
 *   de los huesos NO son los del rig: hay que quedarse con los del .glb y dejar
 *   que sea buildRig (con rootFix) quien haga la conversion, una sola vez y en
 *   un sitio. Si se leyeran los huesos ya convertidos y luego buildRig volviera
 *   a aplicar rootFix, el personaje acabaria tumbado.
 */
export function readModelBones(root) {
    const byName = new Map();
    const out = [];

    const walk = (node, parentName) => {
        for (const child of node.getChildren()) {
            // Los mallas de un .glb son hijos de un hueso, no al reves. Solo se
            // recorren los nodos que son de tipo hueso (sin geometria).
            if (!child.getChildMeshes || child.getChildMeshes().length > 0) {
                continue;
            }
            const name = stripSuffix(child.name);
            const p = child.position;
            const q = child.rotationQuaternion;
            const rec = {
                name,
                node: child,
                parentName,
                localT: [p.x, p.y, p.z],
                // Sin quaternion hay que componer el euler de Babylon. El orden
                // es el de Babylon (Y, X, Z) y NO el del archivo.
                localQ: q
                    ? [q.x, q.y, q.z, q.w]
                    : eulerToQuat(child.rotation)
            };
            out.push(rec);
            byName.set(name, rec);
            walk(child, name);
        }
    };
    walk(root, null);
    return { bones: out, byName };
}

/** Euler de Babylon (orden YXZ) a quaternion [x, y, z, w]. */
function eulerToQuat(e) {
    const qy = [0, Math.sin(e.y / 2), 0, Math.cos(e.y / 2)];
    const qx = [Math.sin(e.x / 2), 0, 0, Math.cos(e.x / 2)];
    const qz = [Math.sin(e.z / 2), 0, 0, Math.cos(e.z / 2)];
    return qmulQuat(qmulQuat(qy, qx), qz);
}

function qmulQuat(a, b) {
    return [
        a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
        a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
        a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
        a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
    ];
}

/**
 * Un peleador: malla + esqueleto + rig numerico.
 *
 * NO es una entidad de combate (eso es core/fsm). Solo sabe de su propia
 * geometria y de escribir poses. El `root` es un TransformNode suelto para poder
 * mover y girar al personaje entero sin tocar ni un solo hueso.
 */
export class CharacterModel {
    /**
     * @param {object} opts
     * @param {string} opts.name       nombre unico (dos peleadores a la vez)
     * @param {object} opts.scene      BABYLON.Scene
     * @param {object} opts.roots      { glb: BABYLON.TransformNode } nodos ya cargados
     * @param {number} [opts.height]   alto deseado en metros
     * @param {string} [opts.rootFix]  'Z_UP' si el archivo esta tumbado
     */
    constructor(opts) {
        this.name = opts.name || 'fighter';
        this.scene = opts.scene;
        this.pose = createPose();
        this.fkState = null;
        this.debugDraw = !!opts.debugDraw;

        // --- 1. Raiz propia, para colocar y girar al personaje entero -------
        this.root = opts.root || new (globalThis.BABYLON.TransformNode)(this.name + ':root', opts.scene);

        // --- 2. El .glb se cuelga de esa raiz --------------------------------
        this.sources = [];
        for (const src of (opts.roots || [])) {
            src.setParent(this.root);
            this.sources.push(src);
        }

        // --- 3. Lectura de huesos y construccion del rig ----------------------
        const { bones, byName } = readModelBones(this.root);
        this.modelBones = bones;
        this.boneIndex = byName;
        this.boneMap = buildBoneMap(bones.map((b) => b.name));

        // Todos los huesos reciben un quaternion para poder escribir poses sin
        // pelearse con el euler de Babylon (que no tiene orden intuitivo).
        for (const b of bones) {
            if (!b.node.rotationQuaternion) {
                const q = eulerToQuat(b.node.rotation);
                b.node.rotationQuaternion = new (globalThis.BABYLON.Quaternion)(q[0], q[1], q[2], q[3]);
            }
            b.node.rotation.set(0, 0, 0);
        }

        // --- 4. Rig numerico: mide el modelo y pone todo en espacio personaje -
        //
        // OJO CON LA ESCALA. buildRig espera un MULTIPLICADOR, no una altura.
        // El mannequin mide 1,45 m de alto en el archivo y el contrato pide
        // 1,80 m, asi que el factor es 1,2414. Pasarle directamente "1.8"
        // (que es lo que parece el parametro) inflaria el personaje a 2,6 m.
        // Por eso se mide primero con factor 1 y se reconstruye ya escalado:
        // son 19 huesos, da igual hacerlo dos veces.
        const rootFix = opts.rootFix === undefined ? 'Z_UP' : opts.rootFix;
        const target = opts.height || CFG.CHARACTER_HEIGHT;
        const probe = buildRig(this.boneMap, bones, { scale: 1, rootFix });
        this.modelScale = target / probe.measuredHeight;
        this.rig = buildRig(this.boneMap, bones, { scale: this.modelScale, rootFix });

        // El rig ya mide en METROS REALES (todo el core/cine trabaja asi), pero
        // la malla de Babylon sigue en metros de archivo. La escala se aplica
        // una sola vez, en la raiz del personaje, y de ahi sale la correccion
        // para escribir los huesos en el espacio del archivo.
        this.root.scaling = new (globalThis.BABYLON.Vector3)(
            this.modelScale, this.modelScale, this.modelScale
        );

        // --- 5. Tabla contrato -> nodo de Babylon -----------------------------
        this.nodes = Object.create(null);
        for (const b of this.rig.bones) {
            this.nodes[b.contract] = b.model.node;
        }

        // --- 6. Estado numerico inicial --------------------------------------
        this.fkState = fk(this.rig, this.pose);
        this.applyPose(this.pose, this.fkState);
    }

    /**
     * Vuelca una pose en el esqueleto.
     *
     * @param {object} [pose]        Pose de deltas (Pose.js)
     * @param {object} [fkState]      resultado de fk(), si ya esta calculado
     * @returns {object} el fkState usado
     */
    applyPose(pose, fkState) {
        const p = pose || this.pose;
        const st = fkState || fk(this.rig, p);
        const inv = 1 / this.modelScale;

        // Se recorre EN ORDEN DE JERARQUIA. Babylon vuelve a componer la
        // transformacion del padre en cada hijo, asi que basta con escribir los
        // locales en ese orden: no hay que hacer el producto a mano.
        for (const b of this.rig.bones) {
            const node = this.nodes[b.contract];
            if (!node) continue;

            const dq = rotOf(p, b.contract);
            const dp = posOf(p, b.contract);

            // Las rotaciones no se escalan: el quaternion local de reposo vale
            // igual en el archivo y en la escena.
            const local = qmulQuat(b.localQ, dq);
            node.rotationQuaternion.set(local[0], local[1], local[2], local[3]);

            // Las traslaciones SI: los deltas de la Pose van en metros reales y
            // la raiz los escala, asi que aqui se vuelven a dividir.
            const fileT = b.model.localT;
            const base = b.parentIndex < 0
                ? qRotateVecCached(this.rig.rootFix, fileT)
                : qRotateVecCached(st.q[b.parentContract], fileT);
            node.position.set(
                base[0] + dp[0] * inv,
                base[1] + dp[1] * inv,
                base[2] + dp[2] * inv
            );
        }
        return st;
    }

    /**
     * Coloca al personaje en el mundo. La posicion va en METROS REALES: la
     * escala del modelo la pone la raiz, no este metodo.
     * @param {number} facingRad giro sobre Y (0 = mirando a +Z)
     */
    place(x, z, facingRad) {
        const B = globalThis.BABYLON;
        this.root.position.set(x, 0, z);
        if (!this.root.rotationQuaternion) this.root.rotationQuaternion = new B.Quaternion(0, 0, 0, 1);
        // El modelo mira a +Z, que es delante en Babylon.
        B.Quaternion.RotationAxisToRef(
            new B.Vector3(0, 1, 0), facingRad || 0, this.root.rotationQuaternion
        );
    }

    /** Altura real del personaje en metros de escena. */
    get height() {
        return this.rig.measuredHeight * this.modelScale;
    }

    dispose() {
        for (const src of this.sources) src.dispose(false, true);
        this.root.dispose(false, true);
    }
}

/** Rotacion de un vector por un quaternion, sin importar BABYLON. */
function qRotateVecCached(q, v) {
    if (!q) return [v[0], v[1], v[2]];
    const x = q[0], y = q[1], z = q[2], w = q[3];
    const vx = v[0], vy = v[1], vz = v[2];
    const tx = 2 * (y * vz - z * vy);
    const ty = 2 * (z * vx - x * vz);
    const tz = 2 * (x * vy - y * vx);
    return [
        vx + w * tx + (y * tz - z * ty),
        vy + w * ty + (z * tx - x * tz),
        vz + w * tz + (x * ty - y * tx)
    ];
}

/**
 * Carga un .glb y devuelve un CharacterModel.
 *
 * @returns {Promise<CharacterModel>}
 */
export function loadCharacterModel(scene, url, opts = {}) {
    return new Promise((resolve, reject) => {
        const B = globalThis.BABYLON;
        if (!B) {
            reject(new Error('CharacterModel: BABYLON no esta cargado'));
            return;
        }
        B.SceneLoader.ImportMesh(null, '', url, undefined,
            (result) => {
                try {
                    const mql = result.meshes.filter((m) => !m.name.startsWith('Z_UP'));
                    const roots = [];
                    const seen = new Set();
                    for (const m of mql) {
                        // Solo los nodos de jerarquia (sin padre) se mueven; las
                        // instancias se cuelgan de su padre y se mueven solas.
                        if (m.parent && m.parent.getTotalVertices && m.parent.getTotalVertices() > 0) continue;
                        let top = m;
                        while (top.parent) top = top.parent;
                        if (seen.has(top)) continue;
                        seen.add(top);
                        roots.push(top);
                    }
                    resolve(new CharacterModel({
                        name: opts.name || 'fighter',
                        scene,
                        roots,
                        height: opts.height,
                        rootFix: opts.rootFix,
                        debugDraw: opts.debugDraw
                    }));
                } catch (err) {
                    reject(err);
                }
            },
            undefined,
            (msg, ex) => reject(ex || new Error(String(msg)))
        );
    });
}

export default CharacterModel;