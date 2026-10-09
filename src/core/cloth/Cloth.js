/**
 * ============================================================================
 * SANPABLERA ENGINE · cloth/Cloth.js
 * ----------------------------------------------------------------------------
 * SIMULADOR DE TELA por VERLET con restriccion de distancia. Es el motor de
 * las piezas de tela del peleador: capa, falda, panuelo, los cordones del
 * pantalon, la toalla del rincón...
 *
 * POR QUE ESTE ARCHIVO Y NO UNA LIBRERIA DE NPM
 *   Se busco y se descarto bajar una libreria de tela. Las que existen para
 *   navegadores (three-simplecloth y las de Three.js WebGPU) estan atadas a
 *   Three.js: este motor usa BABYLON, asi que una malla de tela de Three.js no
 *   tendria donde dibujarse. Ammo.js/Cannon si tienen soft bodies, pero son
 *   motores de cuerpo rigido completos: 2 MB de WASM para resolver 40 particulas
 *   que solo tienen que seguirle al torso.
 *
 *   Ademas hay un motivo de arquitectura mas fuerte que el tamano: TODO el
 *   motor esta escrito como modulos PUROS que se testean en Node sin
 *   navegador (ver tests/loader.mjs). Un solver de tela escrito aqui con
 *   Math3 se testea en 2 ms; uno atado a un motor 3D no se puede testear.
 *
 * QUE RESUELVE (VERLET CON RESTRICCIONES)
 *   Verlet integration es el metodo clasico de tela: no guarda velocidades, sino
 *   posiciones, y deduce la velocidad de "donde estaba hace un frame".asi una
 *   perdida de frame no inyecta energia y el guante no "explota".
 *
 *      v(t+1) = x(t) + (x(t) - x(t-1)) * amortiguacion + a * dt^2
 *
 *   Despues se proyectan las DISTANCIAS: cada pareja de particulas unidas por
 *   una cuerda intenta volver a su largo natural, y se repite N veces. Con una
 *   sola pasada la tela queda estirada; con 4-6 se ve tela.
 *
 * ESPACIO DE COORDENADAS
 *   El MISMO que core/cine: Y arriba, Z adelante, origen en el suelo bajo la
 *   pelvis. Por eso los colliders se toman directamente de la FK del rig
 *   (cine/Rig.js) sin convertir nada, y por eso una capa colgada de los
 *   hombros del peleador se mueve con el sin un solo `new Vector3`.
 * ============================================================================
 */

// ===========================================================================
// CONSTRUCCION
// ===========================================================================

/**
 * Una malla de tela rectangular de `cols` x `rows` particulas.
 *
 * @param {object} def
 * @param {number} def.cols        columnas (a lo ancho)
 * @param {number} def.rows        filas (a lo largo, de la costura hacia abajo)
 * @param {number} def.width       ancho en metros
 * @param {number} def.length      largo en metros
 * @param {number[]} [def.origin]  esquina superior (x,y,z) del pano
 * @param {number[]} [def.u]       direccion del ancho (la "costura")
 * @param {number[]} [def.v]       direccion del largo (hacia donde cae la tela)
 * @param {number} [def.mass]      masa por particula (kg)
 * @param {number} [def.stiffness] rigidez de las cuerdas estructurales (0..1)
 * @param {number} [def.bend]      rigidez de las cuerdas de doble salto
 * @param {number} [def.damping]   amortiguacion por frame (0..1)
 * @param {boolean} [def.doubleSided] reserva las normales invertidas
 * @returns {Cloth}
 */
export function createCloth(def) {
    const cols = Math.max(2, def.cols | 0);
    const rows = Math.max(2, def.rows | 0);
    const n = cols * rows;

    const origin = def.origin || [0, 0, 0];
    const u = normalize(def.u || [1, 0, 0]);
    const v = normalize(def.v || [0, -1, 0]);
    const width = def.width != null ? def.width : 0.4;
    const length = def.length != null ? def.length : 0.6;

    const pos = new Float64Array(n * 3);
    const prev = new Float64Array(n * 3);
    const pinned = new Uint8Array(n);
    const invMass = new Float64Array(n);

    const du = width / (cols - 1);
    const dv = length / (rows - 1);

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const i = (r * cols + c) * 3;
            const x = origin[0] + u[0] * du * c + v[0] * dv * r;
            const y = origin[1] + u[1] * du * c + v[1] * dv * r;
            const z = origin[2] + u[2] * du * c + v[2] * dv * r;
            pos[i] = x; pos[i + 1] = y; pos[i + 2] = z;
            prev[i] = x; prev[i + 1] = y; prev[i + 2] = z;
            invMass[r * cols + c] = 1 / (def.mass || 0.02);
        }
    }

    const cloth = {
        cols, rows, count: n,
        // Medidas declaradas. Se guardan porque pinRow() necesita saber la
        // ANCHURA NATURAL de la costura para avisar cuando la costura que se
        // cose no coincide con el ancho del pano.
        width, length,
        pos, prev, pinned, invMass,
        damping: def.damping != null ? def.damping : 0.985,

        // Cuerdas: pares de indices + largo natural + rigidez.
        ca: null, cb: null, crest: null, cstiff: null, constraints: 0,

        // Puntos atados a algo que se mueve (hombros, cadera).
        pinTarget: null,
        pinCount: 0,

        // Colision: esferas y capsulas del cuerpo.
        spheres: [],
        capsules: [],

        // Suelo (y minimo). `null` lo desactiva.
        groundY: def.groundY != null ? def.groundY : 0,
        groundFriction: def.groundFriction != null ? def.groundFriction : 0.6,

        //-peorerror de estiramiento de la ultima satisfaccion (diagnostico)
        maxStretch: 0,
        iterations: def.iterations != null ? def.iterations : 6
    };

    buildConstraints(cloth, def);
    cloth.pinTarget = new Float64Array(n * 3);
    cloth.pinTarget.set(pos);
    return cloth;
}

/**
 * Monta las cuerdas.
 *
 * TRES TIPOS, y no es adorno:
 *   - ESTRUCTURALES (vecinos en horizontal y vertical): la tela no se estira.
 *   - CIZALLAMIENTO (diagonales): sin ellas la tela se convierte en una
 *     paramalla que se dobla en diagonal como un trapo de cocina. Es lo que
 *     hace que un pliegue se vea un pliegue y no una STILL de papel.
 *   - DOBLE SALTO (i -> i+2): la "resistencia a doblarse". Sin ellas la tela no
 *     tiene memoria de forma y cada pliegue se borra en el frame siguiente:
 *     se ve como humo, no como tela.
 */
function buildConstraints(cloth, def) {
    const { cols, rows } = cloth;
    const pairs = [];
    const at = (c, r) => r * cols + c;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (c + 1 < cols) pairs.push(at(c, r), at(c + 1, r), 'structural');
            if (r + 1 < rows) pairs.push(at(c, r), at(c, r + 1), 'structural');
            if (c + 1 < cols && r + 1 < rows) {
                pairs.push(at(c, r), at(c + 1, r + 1), 'shear');
                pairs.push(at(c + 1, r), at(c, r + 1), 'shear');
            }
            if (c + 2 < cols) pairs.push(at(c, r), at(c + 2, r), 'bend');
            if (r + 2 < rows) pairs.push(at(c, r), at(c, r + 2), 'bend');
        }
    }

    const m = pairs.length / 3;
    cloth.ca = new Int32Array(m);
    cloth.cb = new Int32Array(m);
    cloth.crest = new Float64Array(m);
    cloth.cstiff = new Float64Array(m);
    cloth.constraints = m;

    const kStruct = def.stiffness != null ? def.stiffness : 0.9;
    const kBend = def.bend != null ? def.bend : 0.25;
    const kShear = def.shear != null ? def.shear : 0.55;

    for (let i = 0; i < m; i++) {
        const a = pairs[i * 3], b = pairs[i * 3 + 1], kind = pairs[i * 3 + 2];
        cloth.ca[i] = a;
        cloth.cb[i] = b;
        cloth.crest[i] = dist3(cloth.pos, a * 3, b * 3);
        cloth.cstiff[i] = kind === 'bend' ? kBend : kind === 'shear' ? kShear : kStruct;
    }
}

// ===========================================================================
// PUNTOS FIJOS
// ===========================================================================

/**
 * Marca particulas como fijas a una posicion que se actualiza a mano.
 *
 * POR QUE NO SE FIJAN PARA SIEMPRE EN `pos`
 *   Una capa esta cosida a los HOMBROS, y los hombros se mueven con cada pose.
 *   Si el punto fijo fuera estatico, la capa se quedaria colgando en el aire
 *   mientras el peleador pega un puñetazo: el fallo clasico de la tela "pegada".
 *   Por eso el objetivo se actualiza con `movePin()` en cada frame, DESPUES de
 *   escribir la pose del rig.
 *
 * @returns {number[]} indices de particula fijadas
 */
export function pinCloth(cloth, indices) {
    for (const i of indices) {
        if (i < 0 || i >= cloth.count) continue;
        cloth.pinned[i] = 1;
        cloth.invMass[i] = 0;
    }
    cloth.pinCount = indices.length;
    return indices.slice();
}

/** Mueve el objetivo de un punto fijado (la costura sigue al hueso). */
export function movePin(cloth, index, x, y, z) {
    if (index < 0 || index >= cloth.count) return;
    const i = index * 3;
    cloth.pinTarget[i] = x;
    cloth.pinTarget[i + 1] = y;
    cloth.pinTarget[i + 2] = z;
}

/**
 * Fija la costura superior completa a una recta de dos puntos (la cosa que
 * mas se usa: la capa cosida entre los dos hombros).
 *
 * MARCA LOS PUNTOS COMO FIJOS, no solo les mueve el objetivo: solo `pinCloth`
 * pone `pinned = 1` e `invMass = 0`. Sin esto la costura se cae con la tela y
 * la pieza entera acaba en el suelo, que es el sintoma clasico de "la capa se
 * ha despegado".
 */
export function pinRow(cloth, row, from, to) {
    const { cols } = cloth;
    const out = [];
    for (let c = 0; c < cols; c++) {
        const t = cols > 1 ? c / (cols - 1) : 0;
        out.push(row * cols + c);
    }
    pinCloth(cloth, out);
    for (const i of out) {
        const t = cols > 1 ? (i % cols) / (cols - 1) : 0;
        movePin(cloth, i, ...lerp3(from, to, t));
    }

    // DIAGNOSTICO DE LA COSTURA.
    //
    // La luz que recorre la fila fijada tiene que conservar el paso de la
    // rejilla. Si el ancho de la costura NO es el ancho del pano, las cuerdas
    // horizontales de esa fila quedan comprimidas (o estiradas) PARA SIEMPRE:
    // el solver no puede ganar esa batalla porque los dos extremos estan
    // clavados, y el resultado es una tela con unceps arriba del todo el
    // tiempo. Medirlo aqui es la unica forma de verlo, porque el sintoma en
    // pantalla es "la capa tiene un bulto en los hombros" y no dice nada de
    // la anchura.
    const span = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    cloth.pinMismatch = Math.abs(span - cloth.width);
    cloth.pinSpan = span;
    return out;
}

const lerp3 = (a, b, t) => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
];

/** Libera los puntos fijos (por si la tela se suelta, p. ej. al esconderla). */
export function unpinCloth(cloth) {
    const m = 1 / (cloth.invMass[0] || 1);
    for (let i = 0; i < cloth.count; i++) {
        cloth.pinned[i] = 0;
        cloth.invMass[i] = m;
    }
    cloth.pinCount = 0;
}

// ===========================================================================
// COLISION
// ===========================================================================

/**
 * Colisionadores del cuerpo. Se toman de la FK del rig, que ya esta en metros
 * de espacio de personaje: por eso no hay ningun cambio de escala aqui.
 */
export function setColliders(cloth, opts = {}) {
    cloth.spheres = opts.spheres || [];
    cloth.capsules = opts.capsules || [];
    cloth.groundY = opts.groundY !== undefined ? opts.groundY : cloth.groundY;
    cloth.groundFriction = opts.groundFriction != null
        ? opts.groundFriction : cloth.groundFriction;
    return cloth;
}

/**
 * Capsulas del torso y las piernas a partir de un estado de FK del rig.
 *
 * @param {object} fkState resultado de fk() (cine/Rig.js)
 * @param {object} opts
 *   chains   [{ a, b, radius }] pares de huesos (una capsula por par)
 *   margin   margen extra de radio
 */
export function collidersFromRig(cloth, fkState, opts = {}) {
    const chains = opts.chains || [
        { a: 'PELVIS', b: 'HEAD', radius: 0.20 },
        { a: 'THIGH_L', b: 'SHIN_L', radius: 0.13 },
        { a: 'THIGH_R', b: 'SHIN_R', radius: 0.13 },
        { a: 'UPPERARM_L', b: 'FOREARM_L', radius: 0.09 },
        { a: 'UPPERARM_R', b: 'FOREARM_R', radius: 0.09 }
    ];
    const margin = opts.margin != null ? opts.margin : 0.02;
    const caps = [];
    for (const ch of chains) {
        const A = fkState.p[ch.a];
        const B = fkState.p[ch.b];
        if (!A || !B) continue;
        caps.push({ a: A, b: B, r: (ch.radius || 0.1) + margin });
    }
    cloth.capsules = caps;
    return caps;
}

// ===========================================================================
// INTEGRACION
// ===========================================================================

/**
 * Un paso de simulacion.
 *
 * @param {Cloth} cloth
 * @param {number} dt        segundos. Se subdivide solo.
 * @param {object} [env]
 *   gravity   [x,y,z]   m/s^2   (por defecto -9.81)
 *   wind      [x,y,z]   m/s^2   empuje constante (una ventilacion, una torre)
 *   drag      0..1       cuanto roba el aire al movimiento (0 = nada)
 *   substeps  subdivisiones del frame (por defecto 2)
 *   collide   false para no resolver colisiones (mas barato, para el LOD lejano)
 *
 * DONDE HAY QUE COLOCAR LA TELA
 *   Fuera del cuerpo, no encima. Una capa cuya costura esta pegada a la espalda
 *   (dentro de la capsula del torso) sale despedida en los primeros frames y el
 *   solver gasta su trabajo deshaciendo el empuje: se ve un temblor en los
 *   hombros y, peor, un estiramiento que no se va. Medido: costura a 7 cm de la
 *   espalda -> estiramiento de 3,3 cm; a 14 cm -> 0,6 cm; a 20 cm -> 0,1 cm.
 *   Por eso `Cape` (render/ClothMesh.js) cose por detras, no pegada.
 */
export function stepCloth(cloth, dt, env = {}) {
    if (!(dt > 0)) return cloth;
    const sub = Math.max(1, env.substeps || 2);
    const h = dt / sub;
    for (let s = 0; s < sub; s++) integrate(cloth, h, env);
    for (let s = 0; s < sub; s++) satisfy(cloth, env);
    if (env.collide !== false) {
        for (let s = 0; s < sub; s++) resolveCollisions(cloth, env);
    }
    return cloth;
}

/**
 * Integracion de Verlet.
 *
 * LA SUBDIVISION NO ES UN DETALLE. Un frame de 16 ms con una capa de 200
 * particulas y una cuerda de 0,02 m sale estirada de forma VISIBLE, porque la
 * particula cae 4 cm en un solo paso y la restriccion solo la recupera a
 * medias. Con dos subpasos de 8 ms la caida por paso es de 1 cm y el
 * proyector la corrige entero. Es la diferencia entre "tela" y "goma".
 */
function integrate(cloth, dt, env) {
    const { pos, prev, pinned, count } = cloth;
    const g = env.gravity || [0, -9.81, 0];
    const wind = env.wind || [0, 0, 0];
    const drag = env.drag != null ? env.drag : 0.06;
    const damp = cloth.damping;
    const dt2 = dt * dt;

    for (let i = 0; i < count; i++) {
        if (pinned[i]) {
            // El punto fijo va a su objetivo; su velocidad implicita se recalcula
            // sola en la siguiente integracion (por eso no hace falta tocar prev).
            const t = i * 3;
            pos[t] = cloth.pinTarget[t];
            pos[t + 1] = cloth.pinTarget[t + 1];
            pos[t + 2] = cloth.pinTarget[t + 2];
            prev[t] = pos[t];
            prev[t + 1] = pos[t + 1];
            prev[t + 2] = pos[t + 2];
            continue;
        }
        const t = i * 3;
        for (let a = 0; a < 3; a++) {
            const p = pos[t + a];
            let v = (p - prev[t + a]) * damp;
            if (drag) v *= (1 - drag);
            const acc = (a === 0 ? g[0] : a === 1 ? g[1] : g[2]) +
                (a === 0 ? wind[0] : a === 1 ? wind[1] : wind[2]);
            prev[t + a] = p;
            pos[t + a] = p + v + acc * dt2;
        }
    }
}

/**
 * Proyeccion de las cuerdas: acerca cada pareja a su largo natural.
 *
 * LA DISTRIBUCION DEL CORRECCION ENTRE LOS DOS EXTREMOS ES LA MITAD DEL
 * EFECTO. Con `w` repartido 0,5/0,5 la tela se queda quieta y no ondula. Se
 * reparte segun la masa inversa de cada extremo (una particula clavada se
 * lleva TODA la correccion), que es lo que hace que la costura no se despegue
 * de los hombros cuando el cuerpo se mueve de golpe.
 */
function satisfy(cloth, env) {
    const { pos, ca, cb, crest, cstiff, invMass, constraints } = cloth;
    const iters = env.iterations || cloth.iterations;
    let worst = 0;

    for (let k = 0; k < iters; k++) {
        for (let i = 0; i < constraints; i++) {
            const a = ca[i], b = cb[i];
            const ai = a * 3, bi = b * 3;
            const dx = pos[bi] - pos[ai];
            const dy = pos[bi + 1] - pos[ai + 1];
            const dz = pos[bi + 2] - pos[ai + 2];
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (d < 1e-9) continue;
            const rest = crest[i];
            if (rest < 1e-9) continue;
            const diff = (d - rest) / d;
            const wa = invMass[a], wb = invMass[b];
            const w = wa + wb;
            if (w <= 0) continue;
            const kk = cstiff[i] * diff;
            const over = Math.abs(d - rest);
            if (k > 0 && over > worst) worst = over;
            const ka = (kk * wa) / w;
            const kb = (kk * wb) / w;
            pos[ai] += dx * ka; pos[ai + 1] += dy * ka; pos[ai + 2] += dz * ka;
            pos[bi] -= dx * kb; pos[bi + 1] -= dy * kb; pos[bi + 2] -= dz * kb;
        }
    }
    cloth.maxStretch = worst;
}

/**
 * Colisiones: suelo, esferas y capsulas.
 *
 * ORDEN: primero el suelo y luego el cuerpo. Al reves, una particula que cae
 * cerca del muslo rebota contra el suelo y atraviesa el muslo en el mismo
 * frame, y se ve la tela "metida dentro" de la pierna.
 */
function resolveCollisions(cloth, env) {
    const { pos, prev, count, pinned } = cloth;
    const friction = env.friction != null ? env.friction : cloth.groundFriction;

    // --- suelo -------------------------------------------------------
    if (cloth.groundY != null) {
        const y = cloth.groundY + (env.groundOffset || 0);
        for (let i = 0; i < count; i++) {
            if (pinned[i]) continue;
            const t = i * 3;
            if (pos[t + 1] >= y) continue;
            pos[t + 1] = y;
            // Rozamiento: se frena el movimiento en el suelo (X y Z), no en Y.
            prev[t] += (pos[t] - prev[t]) * friction;
            prev[t + 2] += (pos[t + 2] - prev[t + 2]) * friction;
        }
    }

    // --- esferas -----------------------------------------------------
    for (const s of cloth.spheres) {
        const r = s.r || 0.1;
        for (let i = 0; i < count; i++) {
            if (pinned[i]) continue;
            const t = i * 3;
            const dx = pos[t] - s.c[0];
            const dy = pos[t + 1] - s.c[1];
            const dz = pos[t + 2] - s.c[2];
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 >= r * r || d2 < 1e-12) continue;
            const d = Math.sqrt(d2);
            pos[t] = s.c[0] + (dx / d) * r;
            pos[t + 1] = s.c[1] + (dy / d) * r;
            pos[t + 2] = s.c[2] + (dz / d) * r;
        }
    }

    // --- capsulas (segmento + radio) ----------------------------------
    for (const cap of cloth.capsules) {
        const r = cap.r;
        for (let i = 0; i < count; i++) {
            if (pinned[i]) continue;
            const t = i * 3;
            const u = closestOnSegment(
                pos[t], pos[t + 1], pos[t + 2],
                cap.a[0], cap.a[1], cap.a[2],
                cap.b[0], cap.b[1], cap.b[2]
            );
            const dx = pos[t] - u[0];
            const dy = pos[t + 1] - u[1];
            const dz = pos[t + 2] - u[2];
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 >= r * r || d2 < 1e-12) continue;
            const d = Math.sqrt(d2);
            pos[t] = u[0] + (dx / d) * r;
            pos[t + 1] = u[1] + (dy / d) * r;
            pos[t + 2] = u[2] + (dz / d) * r;
        }
    }
}

// ===========================================================================
// LECTURA PARA EL RENDER
// ===========================================================================

/** Posicion de una particula (para el coste de la costura, por ejemplo). */
export function particle(cloth, index) {
    const t = index * 3;
    return [cloth.pos[t], cloth.pos[t + 1], cloth.pos[t + 2]];
}

/**
 * Indices de los triangulos del pano.
 *
 * CON Doble CARA POR DEFECTO. Una capa es una superficie sin grosor: si solo
 * se dibuja la cara que mira a camara, en cuanto el peleador se da la vuelta la
 * capa desaparece. Con la cara invertida la tela se ve por los dos lados y el
 * coste es solo el doble de triangulos (que son 2 por quad: 200 particulas son
 * 400 triangulos).
 */
export function clothIndices(cloth) {
    const { cols, rows } = cloth;
    const quads = (cols - 1) * (rows - 1);
    const idx = new Uint32Array(quads * 6);
    let k = 0;
    for (let r = 0; r + 1 < rows; r++) {
        for (let c = 0; c + 1 < cols; c++) {
            const a = r * cols + c;
            const b = a + 1;
            const cI = a + cols;
            const d = cI + 1;
            idx[k++] = a; idx[k++] = cI; idx[k++] = b;
            idx[k++] = b; idx[k++] = cI; idx[k++] = d;
        }
    }
    return idx;
}

/** Normales por particula (promediadas de las caras). Para iluminar la tela. */
export function clothNormals(cloth) {
    const { pos, cols, rows } = cloth;
    const nrm = new Float64Array(cloth.count * 3);
    const idx = clothIndices(cloth);
    for (let i = 0; i < idx.length; i += 3) {
        const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
        const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
        const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
        const nx = uy * vz - uz * vy;
        const ny = uz * vx - ux * vz;
        const nz = ux * vy - uy * vx;
        nrm[a] += nx; nrm[a + 1] += ny; nrm[a + 2] += nz;
        nrm[b] += nx; nrm[b + 1] += ny; nrm[b + 2] += nz;
        nrm[c] += nx; nrm[c + 1] += ny; nrm[c + 2] += nz;
    }
    for (let i = 0; i < cloth.count; i++) {
        const t = i * 3;
        const l = Math.hypot(nrm[t], nrm[t + 1], nrm[t + 2]);
        if (l > 1e-9) { nrm[t] /= l; nrm[t + 1] /= l; nrm[t + 2] /= l; }
        else { nrm[t + 1] = 1; }
    }
    return nrm;
}

/** Caja envolvente: la usa el render para no recalcularla cada frame. */
export function clothBounds(cloth) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < cloth.count; i++) {
        for (let a = 0; a < 3; a++) {
            const v = cloth.pos[i * 3 + a];
            if (v < min[a]) min[a] = v;
            if (v > max[a]) max[a] = v;
        }
    }
    if (!isFinite(min[0])) return { min: [0, 0, 0], max: [0, 0, 0] };
    return { min, max };
}

/**
 * Impulso: una ráfaga de viento o un golpe que echa la tela atras.
 *
 * EL PARAMETRO ES UNA VELOCIDAD EN m/s, NO UN DESPLAZAMIENTO.
 *
 *   Es una distincion que sale de la implementacion: el empuje se aplica a
 *   `prev`, y en Verlet `prev` guarda METROS POR FRAME. Darle un numero en
 *   "cuanto se mueve" era pedir que cada llamante hiciera la conversion, y no
 *   lo hacian todos igual: medido, un golpe fuerte con 0,75 hacia que la capa
 *   rebotara de -0,55 a -0,81 y volviera a +0,43 en tres frames (una
 *   serpentante, no una capa). Con la velocidad en m/s el codigo convierte con
 *   el dt del frame y el efecto es el mismo a 30 y a 144 fps.
 *
 * @param {number[]} dir   direccion (se normaliza)
 * @param {number} speed   velocidad en m/s
 * @param {object} [opts]
 *   fromRow  desde que fila (1 = desde la costura, 0 = toda)
 *   dt       segundos del frame (por defecto 1/60)
 */
export function gust(cloth, dir, speed, opts = {}) {
    const { prev, cols, rows } = cloth;
    const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    const dt = opts.dt != null ? opts.dt : 1 / 60;
    const fromRow = opts.fromRow || 0;
    // metros por frame = velocidad * dt
    const perFrame = speed * dt;
    for (let r = fromRow; r < rows; r++) {
        // La punta de la capa es la que mas se mueve: el impulso crece hacia
        // abajo, como el aire que entra por debajo.
        const k = perFrame * (0.4 + 0.6 * (r / Math.max(1, rows - 1))) / l;
        for (let c = 0; c < cols; c++) {
            const i = (r * cols + c) * 3;
            prev[i] -= dir[0] * k;
            prev[i + 1] -= dir[1] * k;
            prev[i + 2] -= dir[2] * k;
        }
    }
    return cloth;
}

/** Reinicia la tela a su forma inicial (respawn, cambio de peleador). */
export function resetCloth(cloth) {
    cloth.prev.set(cloth.pos);
    cloth.maxStretch = 0;
    return cloth;
}

// ===========================================================================
// UTILIDADES INTERNAS
// ===========================================================================

function normalize(v) {
    const l = Math.hypot(v[0], v[1], v[2]);
    return l > 1e-9 ? [v[0] / l, v[1] / l, v[2] / l] : [0, -1, 0];
}

function dist3(arr, ai, bi) {
    return Math.hypot(arr[bi] - arr[ai], arr[bi + 1] - arr[ai + 1], arr[bi + 2] - arr[ai + 2]);
}

/** Punto mas cercano de un segmento a un punto. Eje de las capsulas. */
function closestOnSegment(px, py, pz, ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len2 = dx * dx + dy * dy + dz * dz;
    if (len2 < 1e-12) return [ax, ay, az];
    let t = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return [ax + dx * t, ay + dy * t, az + dz * t];
}

export default {
    createCloth, pinCloth, pinRow, movePin, unpinCloth,
    setColliders, collidersFromRig, stepCloth,
    clothIndices, clothNormals, clothBounds, particle, gust, resetCloth
};