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
 * MODELOS QUE FUNCIONAN
 * ----------------------------------------------------------------------------
 *   assets/characters/mannequin.glb (Khronos Rigged Figure, CC BY 4.0), Z arriba,
 *   compensado con rootFix 'Z_UP'. Es el de por defecto.
 *   assets/characters/quaternius-superhero-male/ (CC0), malla en Y y huesos en Z.
 *
 * EL TRAMPA DEL ENVOLTORIO
 * ----------------------------------------------------------------------------
 *   Que el root del RIG sea el mismo que el root de la ESCENA no es cierto. El
 *   archivo puede colgar el hueso raiz de nodos intermedios (Armature, root,
 *   Z_UP) que el rig no conoce porque no son huesos del contrato, pero que
 *   Babylon sigue componiendo. applyPose escribe un LOCAL, y el mundo real es
 *   `W * local` con W el envoltorio acumulado: si W ya trae la correccion de
 *   eje, el rootFix se cuenta dos veces y el personaje se va 1,34 m al suelo.
 *   wrapperTransform() mide W y applyPose lo neutraliza. El mannequin no lo
 *   necesita (su envoltorio es identidad) y por eso ahi el bug nunca se vio.
 * ============================================================================
 */

import { buildBoneMap } from './BoneMap.js';
import { buildRig, fk } from '../core/cine/Rig.js';
import { createPose, rotOf, posOf } from '../core/cine/Pose.js';
import { CFG } from '../core/cine/CineConstants.js';
import { buildParts, tintParts } from './PartMannequin.js';

/** Quita el sufijo del pivot de un nombre de glTF (`Bone.001` -> `Bone`). */
function stripSuffix(name) {
    const m = /^(.*?)\.\d+$/.exec(name);
    return m ? m[1] : name;
}

/**
 * La transform MUNDIAL acumulada de los envoltorios del ARCHIVO que hay por
 * encima de un hueso: los nodos intermedios que mete el importador (Armature,
 * root, Z_UP) y que NO son huesos del contrato, asi que el rig no los conoce.
 *
 * POR QUE HACE FALTA ESTE NUMERO
 *   applyPose escribe el local del hueso raiz del rig. Babylon, al componer,
 *   le aplica ENCIMA todos sus padres de verdad. El mundo resultante es por
 *   tanto `W * local`, no `local`: si W es un giro, el hueso acaba en otro
 *   sitio y la malla, que esta skinneada a el, sale retorcida.
 *
 *   El caso real: el .gltf de Quaternius trae un nodo `root` con un giro de
 *   90 grados sobre X, que es EXACTAMENTE el rootFix 'Z_UP' que el rig aplica.
 *   Con las dos correcciones, la cadera acababa a 1,34 m de donde deberia
 *   (tumbada en vez de de pie) y el peleador salia hecho una bola. El mannequin
 *   de Khronos no lo-sufría porque su cadena (`Z_UP -> Armature`) es identidad.
 *
 * @param {Array}  recs     registros de readModelBones, con `parentName`
 * @param {string} rootName nombre real del hueso raiz del rig (p.ej. 'pelvis')
 * @returns {number[]} quaternion [x,y,z,w] de W
 */
export function wrapperTransform(recs, rootName) {
    const byName = new Map();
    for (const r of recs) if (!byName.has(r.name)) byName.set(r.name, r);
    const IDQ = [0, 0, 0, 1];
    let cur = byName.get(rootName);
    const chain = [];
    while (cur && cur.parentName) {
        chain.unshift(cur.parentName);
        cur = byName.get(cur.parentName);
    }
    if (!chain.length) return IDQ.slice();
    let W = IDQ;
    for (const name of chain) {
        const node = byName.get(name);
        if (!node) continue;
        W = qnormQ(qmulQuat(node.localQ, W));
    }
    return W;
}

function qinvQ(q) {
    const n = q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3];
    if (n < 1e-12) return [0, 0, 0, 1];
    return [-q[0] / n, -q[1] / n, -q[2] / n, q[3] / n];
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

    // Un hueso es un nodo SIN geometria PROPIA. Importante: no vale mirar los
    // descendientes con getChildMeshes(), porque los nodos intermedios que
    // mete el importador de glTF (__root__, Z_UP, Armature) no tienen malla
    // propia pero tienen hijos que si, y son parte del esqueleto. Si se les
    // salta sin bajar, el rig sale VACIO: el personaje se ve de pie (por el
    // transform que trae el archivo) pero no se le puede animar, y placeFoot
    // revienta al no encontrar el hueso del pie.
    const isGeometry = (node) => {
        if (node.isAnInstance) return true;
        const vtx = typeof node.getTotalVertices === 'function' ? node.getTotalVertices() : 0;
        return vtx > 0;
    };

    const walk = (node, parentName) => {
        for (const child of node.getChildren()) {
            if (isGeometry(child)) {
                // Tiene malla, pero puede esconder huesos debajo (un grupo o un
                // nodo de anidamiento): se sigue bajando sin registrarlo.
                walk(child, parentName);
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

function qnormQ(q) {
    const n = Math.hypot(q[0], q[1], q[2], q[3]);
    if (n < 1e-12) return [0, 0, 0, 1];
    return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

/**
 * Un peleador: malla + esqueleto + rig numerico.
 *
 * NO es una entidad de combate (eso es core/fsm). Solo sabe de su propia
 * geometria y de escribir poses. El `root` es un TransformNode suelto para poder
 * mover y girar al personaje entero sin tocar ni un solo hueso.
 */
/**
 * Caja envolvente de las mallas en el espacio del ARCHIVO, leyendo los
 * vertices CRUDOS (no la caja del mundo: esa ya trae las rotaciones de los
 * nodos intermedios, que no son las que necesita el calculo del rig).
 *
 * @returns {{min:number[], max:number[], alto:number}} `alto` es la dimension
 *   mayor del modelo en metros de archivo, que es su altura este o tumbado.
 */
export function measureMesh(roots) {
    const B = globalThis.BABYLON;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    let any = false;

    for (const root of roots || []) {
        const meshes = root && root.getChildMeshes ? root.getChildMeshes() : [];
        for (const mesh of meshes) {
            if (!mesh.getVerticesData) continue;
            const pos = mesh.getVerticesData(B.VertexBuffer.PositionKind);
            if (!pos || pos.length < 3) continue;
            for (let i = 0; i < pos.length; i += 3) {
                for (let a = 0; a < 3; a++) {
                    if (pos[i + a] < min[a]) min[a] = pos[i + a];
                    if (pos[i + a] > max[a]) max[a] = pos[i + a];
                }
            }
            any = true;
        }
    }

    if (!any || !isFinite(min[0])) return { min: [0, 0, 0], max: [0, 0, 0], alto: 1 };
    const ext = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    // La altura es el eje mayor entre Y y Z, nunca X: en T-pose la extension
    // en X es la envergadura de los brazos (1,86 m en el modelo de Quaternius)
    // y tomarla como alturaeria un personaje de 1,86 m en vez de 1,82.
    return { min, max, ext, alto: Math.max(ext[1], ext[2]) };
}

/**
 * Elige la correccion de eje probando las dos y quedandose con la que deja la
 * cadena de huesos COHERENTE: cabeza arriba, pelvis en medio, pies abajo.
 *
 * POR QUE HAY QUE PROBAR Y NO ADIVINAR
 *   Los .glb no guarantizan nada y los hay de las dos clases. Peor: el eje de
 *   los HUESOS puede no ser el de la MALLA. El mannequin de Khronos tiene los
 *   dos en Z, pero el modelo de Quaternius tiene la malla en Y (1,82 m en Y) y
 *   los huesos en Z. Mirar solo los vertices da 'Y_UP' y el rig sale con la
 *   cabeza a -0,005 y los pies a +0,088: la cadena al reves, y el peleador
 *   aparece arrodillado. Por eso se decide con el rig, que es quien lo usa.
 */
function pickRootFix(boneMap, bones) {
    const coherente = (rig) => {
        const y = (c) => (rig.restWorld[c] ? rig.restWorld[c].p[1] : null);
        const cabeza = y('HEAD'), pelvis = y('PELVIS');
        const pies = [y('FOOT_L'), y('FOOT_R')].filter((v) => v !== null);
        if (cabeza === null || pelvis === null || !pies.length) return false;
        return cabeza > pelvis && Math.max(...pies) < pelvis;
    };

    // Se prueban las dos y se devuelven el rig ganador, que ademas sirve como
    // sonda para la escala: asi no se construye dos veces.
    const z = buildRig(boneMap, bones, { scale: 1, rootFix: 'Z_UP' });
    if (coherente(z)) return { rootFix: 'Z_UP', probe: z };
    const y = buildRig(boneMap, bones, { scale: 1, rootFix: 'Y_UP' });
    if (coherente(y)) return { rootFix: 'Y_UP', probe: y };
    // Ninguna es coherente: se entrega el rig vacio, que es lo que habia antes.
    return { rootFix: 'Y_UP', probe: y };
}

export class CharacterModel {
    /**
     * @param {object} opts
     * @param {string} opts.name       nombre unico (dos peleadores a la vez)
     * @param {object} opts.scene      BABYLON.Scene
     * @param {object} opts.roots      { glb: BABYLON.TransformNode } nodos ya cargados
     * @param {number} [opts.height]   alto deseado en metros
     * @param {string} [opts.rootFix]  'Z_UP' / 'Y_UP'. Si se omite, se DETECTA
     *                                   midiendo el modelo (ver detectUpAxis)
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
        // El eje se DECIDE con el rig (ver pickRootFix): hay archivos con los
        // huesos tumbados y de pie, y el eje de los huesos no tiene por que ser
        // el de la malla. Si el llamante lo impone, se respeta.
        const rootsHere = this.sources.length ? this.sources : (opts.roots || []);
        let rootFix, probe;
        if (opts.rootFix !== undefined && opts.rootFix !== null) {
            rootFix = opts.rootFix;
            probe = buildRig(this.boneMap, bones, { scale: 1, rootFix });
        } else {
            const elegido = pickRootFix(this.boneMap, bones);
            rootFix = elegido.rootFix;
            probe = elegido.probe;
        }
        this.rootFix = rootFix;

        // La escala sale de la MALLA, no del rig. El rig mide la altura entre
        // huesos (1,49 m en el modelo de Quaternius) y la malla 1,82 m: son
        // cosas distintas, y lo que tiene que medir 1,80 m es el personaje que
        // se ve. Con la escala de la malla el esqueleto queda en 1,48 m, que es
        // justo lo que mide un esqueleto humano de 1,80 m, y el IK encaja.
        // Para el mannequin de Khronos los dos valores coinciden (1,45 m) y la
        // escala sale 1,2414, igual que antes de este cambio.
        const target = opts.height || CFG.CHARACTER_HEIGHT;
        const altoMalla = measureMesh(rootsHere).alto;
        this.meshAlto = altoMalla;
        this.modelScale = target / (altoMalla > 1e-6 ? altoMalla : probe.measuredHeight);
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

        // --- 5b. Envoltorios del archivo por encima del hueso raiz ------------
        //
        // El rig solo conoce los huesos del contrato, pero en la escena el hueso
        // raiz cuelga de los nodos intermedios del archivo (Armature, root,
        // Z_UP...). Babylon los compone igualmente, asi que hay que conocerlos
        // para poder neutralizarlos al escribir (ver applyPose).
        const pelvisReal = this.boneMap.map.PELVIS;
        this.wrapperQ = pelvisReal ? wrapperTransform(bones, pelvisReal) : [0, 0, 0, 1];
        this.wrapperInv = qinvQ(this.wrapperQ);
        // El envoltorio tiene que ser REALMENTE la identidad para que el rig y
        // la escena hablen el mismo idioma. Si no lo es, la correccion es
        // aplicarla; se deja constancia porque es el bug que hacia que el modelo
        // de Quaternius saliera hecho una bola.
        this.wrapperIsIdentity = Math.abs(this.wrapperQ[3]) > 0.9999;

        // --- 6. PIEZAS (opcional): maniqui de primitivas ------------------
        //
        // Con `opts.parts` se cuelgan capsulas y cajas de los HUESOS DEL
        // CONTRATO. No es un adorno: es lo que permite tener dos peleadores
        // con silueta legible y colores distintos sin depender de que el
        // .glb tenga una malla por personaje. Y como las piezas cuelgan del
        // contrato (no de los nombres del archivo), la postura procedural
        // funciona con cualquier modelo.
        this.parts = null;
        if (opts.parts) {
            const built = buildParts(B, opts.scene, this.nodes, {
                name: this.name,
                parts: opts.parts === true ? undefined : opts.parts,
                skin: opts.skin
            });
            this.parts = built.meshes.map((mesh, i) => ({
                mesh,
                contract: built.contracts[i]
            }));
            this.partMaterials = built.materials;
        }

        // --- 7. Estado numerico inicial --------------------------------------
        this.fkState = fk(this.rig, this.pose);
        this.applyPose(this.pose, this.fkState);
    }

    /**
     * Tiñe las piezas con el color del peleador. Sin piezas no hace nada:
     * el .glb ya trae su propio material y se tiñe con `tint()` en Engine.js.
     */
    tintParts(rgb) {
        if (!this.parts) return null;
        return tintParts(globalThis.BABYLON, this.scene, this.parts, rgb, { name: this.name });
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
            //
            // PARA EL HUESO RAIZ DEL RIG hay que anular antes el envoltorio del
            // archivo (ver wrapperTransform). Lo que se escribe abajo es un LOCAL,
            // y Babylon le componera encima `wrapperQ`; sin neutralizarlo, ese
            // giro se suma al rootFix y el hueso se va de sitio. Con Quaternius
            // eran 90 grados de mas y la pelvis acababa 1,34 m mas abajo.
            const fileT = b.model.localT;
            let base;
            let delta = [dp[0] * inv, dp[1] * inv, dp[2] * inv];
            if (b.parentIndex < 0) {
                base = qRotateVecCached(this.rig.rootFix, fileT);
                if (!this.wrapperIsIdentity) {
                    // Mundo que produce la escena = wrapperQ * (base + delta).
                    // Para que sea el que quiere el rig, el local escrito tiene
                    // que ser wrapperQ^-1 * (base + delta).
                    const t = qRotateVecCached(this.wrapperInv, base);
                    const d = qRotateVecCached(this.wrapperInv, delta);
                    base = t;
                    delta = d;
                }
            } else {
                base = qRotateVecCached(st.q[b.parentContract], fileT);
            }
            node.position.set(
                base[0] + delta[0],
                base[1] + delta[1],
                base[2] + delta[2]
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
        // meshAlto viene en metros de archivo y modelScale ya lleva la
        // conversion; multiplicar tambien por rig.measuredHeight (que va en
        // espacio de personaje) contaba la escala dos veces.
        return this.meshAlto * this.modelScale;
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
 * De una lista de nodos, saca las RAICES: los que se quedan sin padre al
 * subir por la jerarquia. Los huesos (TransformNode) tambien cuentan: son
 * justo los que necesita el rig.
 */
function topLevelRoots(nodes) {
    const out = [];
    const seen = new Set();
    for (const m of nodes) {
        if (seen.has(m)) continue;
        let top = m;
        while (top.parent) top = top.parent;
        if (seen.has(top)) continue;
        seen.add(top);
        out.push(top);
    }
    return out;
}

/**
 * Nodos de la escena SIN padre antes y despues de addAllToScene(): asi se
 * sabe que ha trayado el .glb. Hace falta porque `container.meshes` solo trae
 * Mesh y el esqueleto del mannequin son TransformNodes; usarla dejaba el rig
 * vacio y reventaba en el primer frame.
 */
function newRootNodes(scene, before) {
    const known = new Set(before);
    return topLevelRoots(scene.rootNodes.filter(n => !known.has(n)));
}

/**
 * Construye el CharacterModel a partir de las raices ya en la escena.
 */
function buildFrom(scene, roots, opts) {
    return new CharacterModel({
        name: opts.name || 'fighter',
        scene,
        roots,
        height: opts.height,
        rootFix: opts.rootFix,
        debugDraw: opts.debugDraw
    });
}

/**
 * Carga un .glb y devuelve un CharacterModel.
 *
 * POR QUE UN ASSET CONTAINER Y NO SceneLoader.ImportMesh
 *   ImportMesh cachea por URL: pedir dos veces el MISMO .glb en la MISMA
 *   escena devuelve los MISMOS nodos. Como el CharacterModel cuelga esos
 *   nodos de su propia raiz (setParent), el segundo peleador se lleva por
 *   delante los meshes del primero y en pantalla solo aparece UNO.
 *   LoadAssetContainer construye un arbol NUEVO en cada llamada, con su
 *   propio esqueleto, que es justo lo que necesita un combate a dos.
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
        if (typeof B.LoadAssetContainerAsync !== 'function') {
            reject(new Error('CharacterModel: LoadAssetContainerAsync no disponible'));
            return;
        }
        const before = scene.rootNodes.slice();
        B.LoadAssetContainerAsync(url, scene).then((container) => {
            // addAllToScene() es lo que cuelga los nodos en la escena; sin esto
            // el esqueleto no se registra y las poses no deforman la malla.
            container.addAllToScene();
            resolve(buildFrom(scene, newRootNodes(scene, before), opts));
        }).catch(reject);
    });
}

export default CharacterModel;