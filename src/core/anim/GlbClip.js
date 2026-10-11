/**
 * ============================================================================
 * SANPABLERA ENGINE · core/anim/GlbClip.js
 * ----------------------------------------------------------------------------
 * Lector de animaciones glTF/GLB y muestreo a Pose del motor.
 *
 * POR QUE EXISTE
 *   El motor compone el cuerpo con una Pose de deltas por hueso
 *   (`core/cine/Pose.js`) y la escribe sobre el esqueleto antes del FK. Ese
 *   camino es el que ya mezcla, corta y transiciona bien, asi que las
 *   animaciones reales tienen que ENTRAR por ahi y no por un AnimationGroup de
 *   Babylon: dos sistemas escribiendo las rotaciones del mismo hueso se
 *   pisan y el resultado es aleatorio.
 *
 *   Este modulo hace de puente: lee los tracks del .glb, y los convierte a
 *   deltas listos para `applyPose`.
 *
 * EL TRUCO IMPORTANTE: DELTA, NO ROTACION ABSOLUTA
 *   Un .glb guarda rotaciones ABSOLUTAS locales. La Pose guarda DELTAS sobre
 *   el reposo, porque `applyPose` hace `rest ∘ delta` (ver CharacterModel.js).
 *   De ahi sale la conversion, que es la unica ecuacion del modulo:
 *
 *       rest ∘ delta = clip        =>        delta = conj(rest) ∘ clip
 *
 *   donde `rest` es la rotacion de reposo ESE nodo en ESE archivo. Por eso el
 *   clip se prepara contra el modelo: si el personaje y la animacion no
 *   comparten esqueleto, el delta sale mal y el cuerpo se descuadra. El
 *   `aviso()` de abajo lo dice en voz alta en vez de fallar en silencio.
 *
 * QUE SE LEE Y QUE NO
 *   - rotacion: si, siempre. Es lo que da vida al maniqui.
 *   - traslacion: solo de los huesos del cuerpo, y solo como delta vertical
 *     (agacharse, caerse). La traslacion de la RAIZ se descarta siempre: el
 *     motor ya mueve al peleador por el mundo y aplicarla seria moverlo dos
 *     veces. Ver `ignoraRaiz`.
 *   - escala y dedos: fuera. El contrato de huesos no tiene dedos y el motor
 *     no los escribe.
 *
 * SIN DEPENDENCIAS
 *   Ni Babylon ni DOM ni fetch. Solo ArrayBuffer y TypedArrays, asi que este
 *   mismo archivo corre en el navegador y en Node, y las pruebas de `tests/`
 *   pueden medir un clip real sin abrir un navegador.
 * ============================================================================
 */

/** Tipos de componente de un accessor de glTF. */
const COMPONENT = {
    5120: Int8Array, 5121: Uint8Array, 5122: Int16Array,
    5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array
};

/** Cuantas floats ocupa cada tipo de accessor. */
const ELEMENTOS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

/** Nombres de huesos que el motor NO escribe, para no perder tiempo con ellos. */
const SIN_INTERES = /^(index|middle|pinky|ring|thumb)_\d/;

/**
 * Trocea un buffer GLB en su trozo JSON y su trozo BIN.
 *
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {{ json: object, bin: Uint8Array }}
 */
export function partirGlb(buffer) {
    const b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const vista = new DataView(b.buffer, b.byteOffset, b.byteLength);
    // 'glTF' en little endian. Si no esta, no es un GLB.
    if (vista.getUint32(0, true) !== 0x46546c67) {
        throw new TypeError('GlbClip: el buffer no es un GLB');
    }
    let off = 12;
    let json = null;
    let bin = null;
    while (off + 8 <= b.byteLength) {
        const largo = vista.getUint32(off, true);
        const tipo = vista.getUint32(off + 4, true);
        const ini = off + 8;
        if (tipo === 0x4e4f534a) json = JSON.parse(decodificar(b.subarray(ini, ini + largo)));
        else if (tipo === 0x004e4942) bin = b.subarray(ini, ini + largo);
        // los trozos van rellenados con espacios a multiplo de 4
        off = ini + largo + ((4 - (largo % 4)) % 4);
    }
    if (!json) throw new TypeError('GlbClip: el GLB no tiene trozo JSON');
    return { json, bin };
}

/**
 * Bytes -> texto.
 *
 * POR QUE HACE FALTA: `String(unUint8Array)` NO decodifica, devuelve la lista
 * de bytes separada por comas ("123,34,97,..."). Solo un Buffer de Node lo
 * hace bien, y en el navegador no hay Buffer. `TextDecoder` esta en los dos
 * sitios y es lo unico que funciona igual en Node que en la pagina.
 */
function decodificar(bytes) {
    return new TextDecoder('utf-8').decode(bytes);
}

/**
 * Lee un accessor a un TypedArray plano.
 *
 * Cubre el caso dificil de los archivos de Quaternius: los bufferView con
 * `byteStride` (datos entrelazados), donde los elementos NO son contiguos y
 * hay que copiarlos de uno en uno.
 *
 * @param {object} json  el JSON del glTF
 * @param {Uint8Array} bin
 * @param {number} indice
 * @returns {{ datos: Float32Array, count: number, tipo: string }}
 */
export function leerAccesor(json, bin, indice) {
    const acc = json.accessors[indice];
    if (!acc) throw new RangeError('GlbClip: accessor ' + indice + ' no existe');
    const vista = acc.bufferView == null ? null : json.bufferViews[acc.bufferView];
    const base = vista ? (vista.byteOffset || 0) + (acc.byteOffset || 0) : 0;
    const Array = COMPONENT[acc.componentType];
    if (!Array) throw new RangeError('GlbClip: componentType ' + acc.componentType + ' desconocido');
    const paso = vista && vista.byteStride ? vista.byteStride : 0;
    const total = ELEMENTOS[acc.type] || 1;
    const out = new Float32Array(acc.count * total);

    for (let i = 0; i < acc.count; i++) {
        for (let k = 0; k < total; k++) {
            const at = base + i * (paso || total * 4) + k * 4;
            // accessors normalizados: un entero pequeno representa -1..1.
            let v = new Array(bin.buffer, bin.byteOffset + at, 1)[0];
            if (acc.normalized && acc.componentType !== 5126) {
                v = v <= 0 ? v / (1 << (8 * 1 - 1)) : v / ((1 << (8 * 1 - 1)) - 1);
            }
            out[i * total + k] = v;
        }
    }
    return { datos: out, count: acc.count, tipo: acc.type };
}

/** Conjugado de un quaternion [x, y, z, w]. */
export function conjugar(q) {
    return [-q[0], -q[1], -q[2], q[3]];
}

/**
 * Hamilton producto: `a ∘ b` (se aplica b primero, luego a).
 * Copia de la de CharacterModel.js para que el motor no dependa del render.
 */
export function multiplicar(a, b) {
    return [
        a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
        a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
        a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
        a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
    ];
}

/** Interpolacion lineal de dos quaterniones, con el camino corto. */
function slerp(a, b, t) {
    let ax = a[0], ay = a[1], az = a[2], aw = a[3];
    let bx = b[0], by = b[1], bz = b[2], bw = b[3];
    let cos = ax * bx + ay * by + az * bz + aw * bw;
    if (cos < 0) { cos = -cos; bx = -bx; by = -by; bz = -bz; bw = -bw; }
    if (cos > 0.9995) {
        const r = [
            ax + (bx - ax) * t, ay + (by - ay) * t,
            az + (bz - az) * t, aw + (bw - aw) * t
        ];
        const n = Math.hypot(r[0], r[1], r[2], r[3]) || 1;
        return [r[0] / n, r[1] / n, r[2] / n, r[3] / n];
    }
    const th = Math.acos(cos), s = Math.sin(th);
    const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
    return [ax * wa + bx * wb, ay * wa + by * wb, az * wa + bz * wb, aw * wa + bw * wb];
}

/**
 * Prepara un clip: lee sus pistas y deja cada una lista para muestrear.
 *
 * @param {object} json      JSON del glTF
 * @param {Uint8Array} bin
 * @param {object} boneIndex indice de BoneMap (`{ map: {CONTRATO: real} }`)
 * @param {string} [nombre] nombre del clip
 * @returns {object} clip `{ nombre, duracion, pistas, ignoraRaiz }`
 */
export function crearClip(json, bin, boneIndex, nombre) {
    const anim = (json.animations || [])[0];
    if (!anim) throw new Error('GlbClip: el archivo no tiene animaciones');

    // El canal apunta a un indice de nodo y lo que el motor entiende es el
    // nombre del contrato: son las dos direcciones. BoneMap va de contrato a
    // nombre real, aqui hace falta al reves, asi que se da la vuelta una vez
    // por clip (son 21 entradas, no tiene coste).
    const porNombre = Object.create(null);
    if (boneIndex && boneIndex.map) {
        for (const contrato in boneIndex.map) porNombre[boneIndex.map[contrato]] = contrato;
    }

    const pistas = [];
    let duracion = 0;

    for (const canal of anim.channels) {
        const nodo = json.nodes[canal.target.node];
        if (!nodo || !nodo.name) continue;
        if (SIN_INTERES.test(nodo.name)) continue;
        if (canal.target.path === 'scale') continue;

        const contrato = porNombre[nodo.name];
        if (!contrato) continue;                       // dedo o hueso que no tenemos

        const esRaiz = nodo.name === 'root';
        if (esRaiz && canal.target.path === 'translation') continue;   // el motor ya mueve

        const samp = anim.samplers[canal.sampler];
        const t = leerAccesor(json, bin, samp.input).datos;
        const v = leerAccesor(json, bin, samp.output).datos;
        if (t.length) duracion = Math.max(duracion, t[t.length - 1]);

        // El reposo de ESE nodo en ESE archivo. De aqui sale el delta.
        pistas.push({
            hueso: contrato,
            ruta: canal.target.path,
            tiempos: t,
            valores: v,
            pasos: ELEMENTOS[json.accessors[samp.output].type] || 4,
            interp: samp.interpolation || 'LINEAR',
            invReposo: canal.target.path === 'rotation'
                ? conjugar(nodo.rotation || [0, 0, 0, 1])
                : null,
            reposoT: (nodo.translation || [0, 0, 0]).slice()
        });
    }

    return {
        nombre: nombre || anim.name || 'clip',
        duracion: duracion || 0,
        pistas,
        /** Raices distintas: si el clip no anima la pelvis, suelta al personaje. */
        tienePelvis: pistas.some(p => p.hueso === 'PELVIS')
    };
}

/**
 * Lee el instante `t` del clip y escribe los deltas en `pose`.
 *
 * @param {object} clip
 * @param {number} t      segundos dentro del clip (se envuelve con la duracion)
 * @param {object} pose   Pose destino `{ rot, pos }`
 * @returns {object} la misma pose
 */
export function muestrear(clip, t, pose) {
    const dur = clip.duracion;
    let u = t;
    if (dur > 0) u = ((u % dur) + dur) % dur;

    for (const p of clip.pistas) {
        const T = p.tiempos, V = p.valores, n = p.pasos;
        const nT = T.length;

        // Clip de un solo frame: es un valor constante (la forma "step" de
        // estos archivos), asi que no hay nada que interpolar.
        let k = nT > 1 ? busquedaBinaria(T, u) : 0;

        let v0, v1, f;
        if (nT === 1) {
            v0 = v1 = 0; f = 0;
        } else if (k >= nT - 1) {
            // Antes del primer frame o despues del ultimo: se sujeta al
            // extremo. Un clip que no cierra el bucle no debe dar un salto
            // al volver al principio.
            v0 = v1 = nT - 1; f = 0;
        } else {
            v0 = k; v1 = k + 1;
            const span = T[v1] - T[v0];
            f = span > 1e-9 ? (u - T[v0]) / span : 0;
        }

        if (p.ruta === 'rotation') {
            const a = V.subarray(v0 * 4, v0 * 4 + 4);
            const b = V.subarray(v1 * 4, v1 * 4 + 4);
            let q;
            if (p.interp === 'STEP') q = Array.from(a);
            else if (v0 === v1) q = Array.from(a);
            else q = slerp(a, b, f);
            // delta = conj(reposo) ∘ clip
            const d = multiplicar(p.invReposo, q);
            const m = Math.hypot(d[0], d[1], d[2], d[3]) || 1;
            pose.rot[p.hueso] = [d[0] / m, d[1] / m, d[2] / m, d[3] / m];
        } else {
            // traslacion: delta sobre el reposo, en Y sobre todo (agacharse)
            const off = v0 * n, off2 = v1 * n;
            pose.pos[p.hueso] = [
                V[off] - p.reposoT[0],
                V[off + 1] - p.reposoT[1],
                V[off + 2] - p.reposoT[2]
            ];
            if (off2 !== off) {
                // se interpola tambien el desplazamiento
                const fx = V[off2] - p.reposoT[0];
                const fy = V[off2 + 1] - p.reposoT[1];
                const fz = V[off2 + 2] - p.reposoT[2];
                if (v0 !== v1) {
                    pose.pos[p.hueso][0] += (fx - V[off] + p.reposoT[0]) * f;
                    pose.pos[p.hueso][1] += (fy - V[off + 1] + p.reposoT[1]) * f;
                    pose.pos[p.hueso][2] += (fz - V[off + 2] + p.reposoT[2]) * f;
                }
            }
        }
    }
    return pose;
}

/** Indice del ultimo frame con tiempo <= t (busqueda binaria). */
function busquedaBinaria(T, t) {
    let lo = 0, hi = T.length - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (T[mid] <= t) lo = mid; else hi = mid - 1;
    }
    return lo;
}

/**
 * Aviso honesto cuando el clip no casa con el modelo.
 *
 * POR QUE AVISA Y NO FALLA: un clip con un solo frame es una pose, no una
 * animacion; eso es un dato, no un fallo de la carga. Romper el arranque del
 * juego por eso seria peor que dejarse ver en la consola.
 *
 * @returns {string[]} problemas encontrados (vacio = todo bien)
 */
export function aviso(clip, boneIndex) {
    const out = [];
    if (!clip.pistas.length) out.push(clip.nombre + ': ningun hueso del cuerpo');
    else if (clip.pistas.filter(p => p.ruta === 'rotation').length < 4) {
        out.push(clip.nombre + ': solo ' +
            clip.pistas.filter(p => p.ruta === 'rotation').length + ' huesos rotando');
    }
    if (clip.duracion <= 0) out.push(clip.nombre + ': duracion cero (es una pose fija)');
    if (boneIndex && typeof boneIndex.playable === 'function' && !boneIndex.playable()) {
        out.push(clip.nombre + ': el modelo no cumple el minimo (' +
            (boneIndex.missing || []).join(', ') + ')');
    }
    return out;
}