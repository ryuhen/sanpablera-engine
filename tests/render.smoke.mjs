/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/render.smoke.mjs
 * ----------------------------------------------------------------------------
 * Pruebas de lo que toca BABYLON, con un BABYLON DE MENTIRA.
 *
 * QUE SON ESTAS PRUEBAS Y POR QUE HACEN FALTA
 * ----------------------------------------------------------------------------
 *   El resto de suites (cine, anim, fsm) son PUROS: se ejecutan en Node sin
 *   motor grafico. Eso es lo que permite ajustar la fisica de la tela o la
 *   matriz de reacciones en segundos. Pero deja sin cubrir justo la frontera
 *   con el render, que es donde se cuelan los fallos de contrato:
 *
 *     - las piezas del maniqui pueden quedar colgadas del hueso EQUIVOCADO
 *       (pasa en cuanto el modelo no trae un hueso y una fila se salta), y
 *       entonces al tintar de color se pintan las manos como si fueran torso;
 *     - la capa puede buscar un hueso que el modelo no tiene y reventar;
 *     - la costura puede ser mas corta que el pano y la tela nace estirada.
 *
 *   Ninguno de esos tres se ve leyendo el codigo: hace falta construir las
 *   piezas y la capa de verdad.
 *
 * EL STUB
 *   Se define `globalThis.BABYLON` con las POCAS clases que usan
 *   PartMannequin y ClothMesh (MeshBuilder, VertexData, Mesh, StandardMaterial,
 *   Color3, VertexBuffer). No es un simulador de WebGL: es lo justo para que
 *   los dos archivos se EJECUTEN y se pueda mirar lo que producen. Lo que no
 *   se comprueba aqui es que se vea bien, que eso necesita un navegador (ver
 *   la tarea pendiente de la bitacora).
 *
 *   node tests/render.smoke.mjs
 * ============================================================================
 */
import { load } from './loader.mjs';

// ===========================================================================
// El BABYLON de mentira
// ===========================================================================
function installStub() {
    const made = [];
    const mkMesh = (name, sc) => {
        const m = new B.Mesh(name, sc);
        m.parent = null;
        // Vector3-ish: solo se usa `set()` y se leen x/y/z.
        m.position = {
            x: 0, y: 0, z: 0,
            set(x, y, z) { this.x = x; this.y = y; this.z = z; }
        };
        m.rotation = { x: 0, y: 0, z: 0 };
        m.material = null;
        m.isPickable = true;
        m.updates = 0;
        made.push(m);
        return m;
    };

    class StandardMaterial {
        constructor(n) { this.name = n; this.diffuseColor = {}; this.specularColor = {}; this.emissiveColor = {}; this.specularPower = 0; this.backFaceCulling = true; }
    }
    class Color3 {
        constructor(r, g, b) { this.r = r; this.g = g; this.b = b; }
        static FromHexString() { return new Color3(0, 0, 0); }
        copyFrom() { } set() { }
    }
    class Vector3 {
        constructor(x, y, z) { this.x = x; this.y = y; this.z = z; }
        normalize() { return this; }
    }
    class VertexData {
        constructor() { this.positions = null; this.normals = null; this.uvs = null; this.indices = null; }
        applyToMesh(mesh) {
            // Se guarda lo que se subio, para poder comprobar que la capa
            // escribe vertices de verdad (y no solo que no reventara).
            mesh.applied = {
                vertices: this.positions ? this.positions.length / 3 : 0,
                indices: this.indices ? this.indices.length : 0
            };
        }
    }
    class Mesh {
        constructor(n, sc) { this.name = n; this.scene = sc; this.receiveShadows = false; }
        updateVerticesData(kind) {
            this.updates = (this.updates || 0) + 1;
            this.lastKind = kind;
        }
        setEnabled() { }
        dispose() { }
    }

    const B = {
        StandardMaterial, Color3, Vector3, VertexData, Mesh,
        VertexBuffer: { PositionKind: 'position', NormalKind: 'normal' },
        MeshBuilder: {
            CreateSphere: (n, o, sc) => mkMesh(n, sc),
            CreateCapsule: (n, o, sc) => mkMesh(n, sc),
            CreateBox: (n, o, sc) => mkMesh(n, sc)
        }
    };
    globalThis.BABYLON = B;
    return { B, mkMesh };
}

let pass = 0;
const fails = [];
const ok = (cond, name, extra) => {
    if (cond) { pass++; return true; }
    fails.push(extra !== undefined ? `${name} :: ${extra}` : name);
    return false;
};
const section = (t) => console.log('\n' + t);
const run = (name, fn) => {
    console.log(`\n[${name}]`);
    const before = fails.length;
    const beforePass = pass;
    try { fn(); } catch (e) {
        fails.push(`${name} lanzo: ${e && e.message ? e.message : e}`);
    }
    console.log(`  ${fails.length === before ? 'ok  ' : 'FALLO'} ${name} (${pass - beforePass} comprobaciones)`);
};

const { B, mkMesh } = installStub();
const scene = {};

const Parts = await load('src/render/PartMannequin.js');
const PoseM = await load('src/core/cine/Pose.js');
const RigMod = await load('src/core/cine/Rig.js');
const { Cape, ClothMesh } = await load('src/render/ClothMesh.js');
const Cloth = await load('src/core/cloth/Cloth.js');
const { BONES } = await load('src/core/cine/CineConstants.js');

/** El rig del contrato (los mismos 21 huesos, sin depender de ningun .glb). */
function contractRig() {
    const bones = BONES.map((b) => ({
        name: b.name, parentName: b.parent,
        localT: b.offset.slice(), localQ: [0, 0, 0, 1]
    }));
    const map = Object.create(null);
    for (const b of BONES) map[b.name] = b.name;
    return RigMod.buildRig({ map, missing: [], duplicates: [] }, bones, { scale: 1, rootFix: 'Y_UP' });
}

const rig = contractRig();

// ===========================================================================
section('Maniqui de piezas');
// ===========================================================================

run('se cuelga una pieza por hueso del contrato', () => {
    const nodes = Object.create(null);
    for (const b of BONES) nodes[b.name] = mkMesh(b.name, scene);
    const built = Parts.buildParts(B, scene, nodes, { name: 'p1' });
    ok(built.meshes.length === Parts.PART_TABLE.length,
        'se crean todas las piezas de la tabla', built.meshes.length);
    ok(built.contracts.length === built.meshes.length,
        'cada malla trae su hueso contractual', [built.meshes.length, built.contracts.length]);
    // LA COMPROBACION IMPORTANTE: el hueso que trae cada malla es el MISMO al
    // que cuelga. Antes se emparejaban por indice sobre la tabla de entrada, y
    // en cuanto el modelo no tenia un hueso (una fila se saltaba) todas las
    // piezas siguientes llevaban el nombre de otra.
    const descuadre = built.meshes.filter((m, i) => m.parent.name !== built.contracts[i]);
    ok(descuadre.length === 0, 'cada malla cuelga de SU propio hueso', descuadre.length);
    ok(built.materials && Object.keys(built.materials).length > 1,
        'hay varios materiales (no es todo del mismo color)',
        Object.keys(built.materials || {}).length);
});

run('un modelo incompleto no rompe nada', () => {
    // El mannequin de Khronos no tiene TOE_L/R. Las dos filas se saltan, y
    // el resto sigue siendo coherente.
    const sinDedos = BONES.filter((b) => !/TOE_/.test(b.name));
    const nodes = Object.create(null);
    for (const b of sinDedos) nodes[b.name] = mkMesh(b.name, scene);
    const built = Parts.buildParts(B, scene, nodes, { name: 'p2' });
    ok(built.meshes.length === Parts.PART_TABLE.length - 2,
        'se saltan justo las dos piezas sin hueso', built.meshes.length);
    const descuadre = built.meshes.filter((m, i) => m.parent.name !== built.contracts[i]);
    ok(descuadre.length === 0, 'y las que quedan siguen en su sitio', descuadre.length);
});

run('el tinte por peleador deja manos y cabeza mas claras', () => {
    const nodes = Object.create(null);
    for (const b of BONES) nodes[b.name] = mkMesh(b.name, scene);
    const built = Parts.buildParts(B, scene, nodes, { name: 'p3' });
    const parts = built.meshes.map((m, i) => ({ mesh: m, contract: built.contracts[i] }));
    Parts.tintParts(B, scene, parts, [0.9, 0.2, 0.1], { name: 'p3' });
    const de = (c) => parts.find((p) => p.contract === c);
    ok(de('HEAD').mesh.material.name.endsWith('_skin'), 'la cabeza lleva material de piel');
    ok(de('HAND_L').mesh.material.name.endsWith('_skin'), 'la mano lleva material de piel');
    ok(de('CHEST').mesh.material.name.endsWith('_tint'), 'el pecho lleva el color del peleador');
    ok(de('HEAD').mesh.material !== de('CHEST').mesh.material,
        'y son materiales distintos (se distingue de quien es quien)');
});

run('una tabla de piezas a medida sustituye a la de por defecto', () => {
    const nodes = Object.create(null);
    for (const b of BONES) nodes[b.name] = mkMesh(b.name, scene);
    const soloCabeza = [{ contract: 'HEAD', kind: 'sphere', size: Parts.PART_SIZES.head, at: [0, 0.11, 0] }];
    const built = Parts.buildParts(B, scene, nodes, { name: 'p4', parts: soloCabeza });
    ok(built.meshes.length === 1, 'solo se crea lo que se pide', built.meshes.length);
    ok(built.contracts[0] === 'HEAD', 'y trae su contrato', built.contracts[0]);
});

// ===========================================================================
section('La capa de tela');
// ===========================================================================

run('la costura se cose con el ancho del pano', () => {
    const model = { rig, fkState: RigMod.fk(rig, PoseM.createPose()) };
    const cape = new Cape(B, scene, model, {
        cols: 5, rows: 6, width: 0.40, length: 0.55,
        seedY: 1.42, seedZ: -0.14, groundY: 0
    });
    ok(cape.cloth.pinCount === 5, 'se cosen las 5 particulas de la fila', cape.cloth.pinCount);
    ok(cape.cloth.pinMismatch < 1e-9,
        'la costura coincide con el ancho (si no, la tela nace estirada)',
        cape.cloth.pinMismatch);
    cape.dispose();
});

run('la capa se construye una malla actualizable con sus triangulos', () => {
    const model = { rig, fkState: RigMod.fk(rig, PoseM.createPose()) };
    const cape = new Cape(B, scene, model, { cols: 5, rows: 6, width: 0.40, length: 0.55 });
    const applied = cape.mesh.mesh.applied;
    ok(applied.vertices === 30, 'la malla tiene una vertice por particula', applied.vertices);
    ok(applied.indices === (5 - 1) * (6 - 1) * 6, 'y los triangulos de la rejilla', applied.indices);
    cape.dispose();
});

run('la capa cae, queda cosida y la empuja el viento', () => {
    const model = { rig, fkState: RigMod.fk(rig, PoseM.createPose()) };
    const quieta = new Cape(B, scene, model, { cols: 5, rows: 6, width: 0.40, length: 0.55, seedY: 1.42, seedZ: -0.14, groundY: 0 });
    const atras = new Cape(B, scene, model, { cols: 5, rows: 6, width: 0.40, length: 0.55, seedY: 1.42, seedZ: -0.14, groundY: 0 });
    const delante = new Cape(B, scene, model, { cols: 5, rows: 6, width: 0.40, length: 0.55, seedY: 1.42, seedZ: -0.14, groundY: 0 });

    for (let i = 0; i < 180; i++) quieta.update(1 / 60);
    for (let i = 0; i < 180; i++) atras.update(1 / 60);
    for (let i = 0; i < 180; i++) delante.update(1 / 60);

    // La costura se queda en el pecho (el hueso), no cae al suelo.
    ok(quieta.cloth.pinTarget[1] > 1.3, 'la costura sigue en el pecho', quieta.cloth.pinTarget[1]);
    // Y la tela CUELGA por debajo de ella.
    const ys = [];
    for (let i = 0; i < quieta.cloth.count; i++) ys.push(quieta.cloth.pos[i * 3 + 1]);
    ok(Math.min(...ys) < Math.max(...ys) - 0.15,
        'la tela cuelga (no es un plano horizontal)', [Math.min(...ys), Math.max(...ys)]);
    // Colisiona contra el cuerpo: hay capsulas sacadas de la FK del rig.
    ok(quieta.cloth.capsules.length >= 2, 'colisiona contra el cuerpo', quieta.cloth.capsules.length);

    // EL VIENTO VA EN LA DIRECCION PEDIDA, con la INTENSIDAD que se le pide.
    // Una rafaga que empuja al reves es el fallo clasico: no se ve en la
    // simetrica, solo cuando pelean. Y se mide a POCOS frames, porque la capa
    // es elastica: si se espera a que se estabilice, un impulso exagerado
    // vuelve a su sitio y el test pasa sin querer.
    atras.gust([0, 0, -1], 2.0);
    delante.gust([0, 0, 1], 2.0);
    for (let i = 0; i < 4; i++) { atras.update(1 / 60); delante.update(1 / 60); }
    const tip = (c) => c.cloth.pos[(c.cloth.count - 1) * 3 + 2];
    ok(tip(atras) < tip(quieta) - 0.02, 'la rafaga -Z echa la capa atras',
        { quieta: tip(quieta).toFixed(3), atras: tip(atras).toFixed(3) });
    ok(tip(delante) > tip(quieta) + 0.02, 'la rafaga +Z la echa delante',
        { quieta: tip(quieta).toFixed(3), delante: tip(delante).toFixed(3) });

    // Y NO SE PASA: un impulso de 2 m/s no puede mover la punta mas que medio
    // metro en un frame, ni de rebote sale disparada.
    ok(Math.abs(tip(atras) - tip(delante)) < 0.5,
        'la capa no sale disparada (el impulso es una velocidad, no un teletransporte)',
        Math.abs(tip(atras) - tip(delante)).toFixed(3));

    // Y se vuelcan vertices y normales a la GPU (malla actualizable de verdad).
    // Ojo con la ruta: `cape.mesh` es el ClothMesh y `cape.mesh.mesh` la malla
    // de Babylon. En un ClothMesh suelto es `cm.mesh` a secas.
    ok(quieta.mesh.mesh.updates > 100, 'la malla recibe vertices cada frame', quieta.mesh.mesh.updates);

    quieta.dispose(); atras.dispose(); delante.dispose();
});

run('un golpe fuerte echa la capa para atras', () => {
    // Es el comportamiento que se ve en combate: al recibir un golpe fuerte
    // la capa sale despedida con el cuerpo.
    const model = { rig, fkState: RigMod.fk(rig, PoseM.createPose()) };
    const opts = { cols: 5, rows: 6, width: 0.40, length: 0.55, seedY: 1.42, seedZ: -0.14 };
    const cape = new Cape(B, scene, model, opts);
    const control = new Cape(B, scene, model, opts);
    for (let i = 0; i < 180; i++) { cape.update(1 / 60); control.update(1 / 60); }
    // El mismo impulso que mete FighterEntity.takeHit al recibir >= 10 de dano
    // (1,4 m/s base + 0,12 por punto). Se mide a 5 frames contra una capa de
    // control: si se esperase a que la capa se estabilizase, un impulso
    // exagerado volveria a su sitio y la comprobacion pasaria sin querer.
    cape.gust([0, 0, -1], 1.4 + 15 * 0.12);
    for (let i = 0; i < 5; i++) { cape.update(1 / 60); control.update(1 / 60); }
    const punta = (c) => c.cloth.pos[(c.cloth.count - 1) * 3 + 2];
    ok(punta(cape) < punta(control) - 0.01,
        'el golpe fuerte echa la capa para atras y la de control no',
        { golpeado: punta(cape).toFixed(3), control: punta(control).toFixed(3) });
    cape.dispose(); control.dispose();
});

run('un modelo sin el hueso ancla no revienta', () => {
    // Si el rig no trae CHEST (ni CL claviculas), la capa simplemente no tiene
    // donde coserse y se queda quieta. Antes reventaba con "cannot read
    // properties of undefined", que en combate es un pantallazo negro.
    const model = { rig, fkState: { p: {}, q: {} } };
    let cape = null;
    let fallo = null;
    try {
        cape = new Cape(B, scene, model, { cols: 4, rows: 4, width: 0.3, length: 0.4 });
        for (let i = 0; i < 30; i++) cape.update(1 / 60);
    } catch (e) { fallo = e; }
    ok(!fallo, 'sin hueso ancla no lanza', fallo && fallo.message);
    if (cape) cape.dispose();
});

run('update() con un entorno donde se espera el estado de FK no revienta', () => {
    // Firma: update(dt, fkState, env). Pasar el entorno en el segundo sitio es
    // el error natural, asi que se comprueba que no rompe (usa el fk del
    // modelo). El viento se cambia por `env` o por `this.env.wind`.
    const model = { rig, fkState: RigMod.fk(rig, PoseM.createPose()) };
    const cape = new Cape(B, scene, model, { cols: 4, rows: 4, width: 0.3, length: 0.4 });
    let fallo = null;
    try {
        cape.update(1 / 60, { wind: [5, 0, 0] });           // segundo sitio
        cape.update(1 / 60, undefined, { wind: [5, 0, 0] }); // tercero, el bueno
    } catch (e) { fallo = e; }
    ok(!fallo, 'ninguna de las dos formas rompe', fallo && fallo.message);
    cape.dispose();
});

run('la tela sola tambien se puede usar (sin capa)', () => {
    // ClothMesh es la pieza baja: sirve para un cordon, un pañuelo o una
    // toalla, no solo para capas.
    const cloth = Cloth.createCloth({ cols: 4, rows: 4, width: 0.2, length: 0.3, origin: [0, 1.2, 0] });
    Cloth.pinRow(cloth, 0, [0, 1.2, 0], [0.2, 1.2, 0]);
    const cm = new ClothMesh(B, scene, { name: 'pañol' }, cloth);
    cm.update(1 / 60, { gravity: [0, -9.81, 0] });
    // En un ClothMesh suelto la malla de Babylon ES `cm.mesh` (sin el segundo
    // `.mesh` que tiene `cape.mesh` cuando va dentro de una Cape).
    ok(cm.mesh.updates === 2, 'escribe vertices y normales', cm.mesh.updates);
    ok(cm.mesh.lastKind === 'normal', 'la ultima subida son las normales', cm.mesh.lastKind);
    cm.refreshNormals();
    ok(cm.mesh.updates === 3, 'refreshNormals escribe otra vez', cm.mesh.updates);
    cm.dispose();
});

// ===========================================================================
console.log('\n' + '='.repeat(64));
if (fails.length) {
    console.log(`FALLOS (${fails.length}):`);
    for (const f of fails) console.log('  - ' + f);
}
console.log(`\n${pass} comprobaciones, ${fails.length} fallos`);
process.exit(fails.length ? 1 : 0);