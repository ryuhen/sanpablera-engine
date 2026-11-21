/**
 * ============================================================================
 * SANPABLERA ENGINE · render/ToonMaterial.js
 * ----------------------------------------------------------------------------
 * CEL-SHADING DE NOVELA GRAFICA, sin paquetes que no estan instalados.
 * ============================================================================
 *
 * POR QUE UN SHADER PROPIO
 *   Babylon 9 no trae ToonMaterial en el nucleo y @babylonjs/materials no esta
 *   en el proyecto. Asi que se registra un par de shaders en
 *   B.Effect.ShadersStore y se usa B.ShaderMaterial, que SI viene en el nucleo.
 *   No hace falta ningun archivo .fx ni ningun npm install.
 *
 * QUE SE VE
 *   Tres tonos (sombra / media / luz) por la normal con la luz, con cortes
 *   duros en vez de un degradado: es el dibujo a tinta de la novela grafica.
 *   Encima se pone un borde oscuro tipo fresnel/rim para que cada malla tenga
 *   contorno propio, como si estuviera entintada a mano.
 *
 * FALLBACK
 *   render.smoke.mjs usa un BABYLON de mentira SIN ShaderMaterial. Cualquier
 *   funcion que cree materiales debe funcionar ahi tambien: si no hay
 *   ShaderMaterial se devuelve un StandardMaterial con el difuso puesto y el
 *   especular a cero. El juego se ve menos novelesco, pero no se cae.
 * ============================================================================
 */

/** Nombre del shader en el ShadersStore. */
export const SHADER_NAME = 'spfToon';

/** Claves donde Babylon busca el codigo fuente. */
export const VERTEX_KEY = SHADER_NAME + 'VertexShader';
export const FRAGMENT_KEY = SHADER_NAME + 'FragmentShader';

/** Luces por defecto: la misma direccion que la key de Engine.js. */
export const LUZ_POR_DEFECTO = [-0.5, -1, 0.45];

/**
 * El vertex shader. Ademas de la normal en mundo (para los tonos) se pasa la
 * normal en espacio de vista (para el borde): asi no hace falta ninguna
 * uniform de camara que Babylon no garantiza en un ShaderMaterial.
 */
export const TOON_VERTEX = `
precision highp float;

attribute vec3 position;
attribute vec3 normal;

uniform mat4 world;
uniform mat4 worldView;
uniform mat4 worldViewProjection;

varying vec3 vNormalW;
varying vec3 vNormalV;

void main(void) {
    vec4 p = vec4(position, 1.0);
    vNormalW = normalize((world * vec4(normal, 0.0)).xyz);
    vNormalV = normalize((worldView * vec4(normal, 0.0)).xyz);
    gl_Position = worldViewProjection * p;
}
`;

/**
 * El fragment shader. `steps` parte la iluminacion en bandas con floor(), y
 * `rimColor` entinta los bordes cuando la normal mira de perfil.
 */
export const TOON_FRAGMENT = `
precision highp float;

varying vec3 vNormalW;
varying vec3 vNormalV;

uniform vec3 lightDir;
uniform vec3 baseColor;
uniform vec3 shadowColor;
uniform vec3 rimColor;
uniform float steps;

void main(void) {
    vec3 N = normalize(vNormalW);
    vec3 L = normalize(-lightDir);
    float ndl = max(dot(N, L), 0.0);

    // TRES TONOS: sombra, media, luz. floor() hace el corte duro.
    float bandas = max(steps, 2.0);
    float t = floor(min(ndl * bandas, bandas - 1.0)) / (bandas - 1.0);
    vec3 media = mix(shadowColor, baseColor, 0.55);
    vec3 tinta = t < 0.25 ? shadowColor : (t < 0.75 ? media : baseColor);

    // BORDE: la normal vista de perfil (|z| pequeño) se entinta.
    float rim = 1.0 - abs(normalize(vNormalV).z);
    float borde = smoothstep(0.45, 0.85, rim);
    vec3 color = mix(tinta, rimColor, borde * 0.85);

    gl_FragColor = vec4(color, 1.0);
}
`;

/** Registra los shaders. Devuelve false si B no tiene ShadersStore. */
export function registrarShaders(B) {
    const store = B && B.Effect && B.Effect.ShadersStore;
    if (!store) return false;
    store[VERTEX_KEY] = TOON_VERTEX;
    store[FRAGMENT_KEY] = TOON_FRAGMENT;
    return true;
}

/** Un Color3 desde hex, con fallback para B sin Color3.FromHexString. */
export function colorDeHex(B, hex, porDefecto = '#ffffff') {
    const valor = typeof hex === 'string' && /^#?[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(hex.trim())
        ? hex.trim() : porDefecto;
    const conAlmohadilla = valor[0] === '#' ? valor : '#' + valor;

    if (B && typeof B.Color3 === 'function' && typeof B.Color3.FromHexString === 'function') {
        try {
            const c = B.Color3.FromHexString(conAlmohadilla);
            if (c) return c;
        } catch (_) { /* el stub puede no entenderlo: se parsea a mano */ }
    }
    const h = conAlmohadilla.slice(1);
    const completo = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const n = parseInt(completo, 16);
    const rgb = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    if (B && typeof B.Color3 === 'function') return new B.Color3(rgb[0], rgb[1], rgb[2]);
    return { r: rgb[0], g: rgb[1], b: rgb[2] };
}

/** Color3 (o parecido) a hex, para heredar el color de un StandardMaterial. */
export function colorAHex(color, porDefecto = '#d8d8d8') {
    if (!color || typeof color.r !== 'number') return porDefecto;
    const parte = (v) => Math.round(Math.max(0, Math.min(1, v || 0)) * 255)
        .toString(16).padStart(2, '0');
    return '#' + parte(color.r) + parte(color.g) + parte(color.b);
}

/** Mezcla dos hex: `t=0` es a, `t=1` es b. */
function mezclarHex(a, b, t) {
    const rgb = (hex) => {
        const n = parseInt(String(hex || '').replace('#', ''), 16);
        return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [255, 255, 255];
    };
    const ca = rgb(a), cb = rgb(b);
    const k = Math.max(0, Math.min(1, t));
    return '#' + ca.map((v, i) => Math.round(v + (cb[i] - v) * k)
        .toString(16).padStart(2, '0')).join('');
}

/** Marca el material para que `isToon()` pueda reconocerlo. */
function marcar(material, datos) {
    if (material) {
        material.metadata = Object.assign({}, material.metadata, { spfToon: true }, datos);
    }
    return material;
}

/**
 * Crea un material cel-shaded para una malla.
 *
 * @param {object} B         BABYLON (global)
 * @param {object} scene
 * @param {string} nombre
 * @param {string} hex       color base
 * @param {object} [opts]
 *   lightDir    [x,y,z], direccion de la luz
 *   shadowColor color de la sombra (derivado si no se da)
 *   rimColor    color del borde
 *   steps       numero de tonos (3 por defecto)
 * @returns {BABYLON.ShaderMaterial|BABYLON.StandardMaterial}
 */
export function createToonMaterial(B, scene, nombre, hex = '#ffffff', opts = {}) {
    const base = colorDeHex(B, hex);
    const sombraHex = opts.shadowColor || mezclarHex(hex, '#05070f', 0.58);
    const rimHex = opts.rimColor || '#0a0c14';
    const pasos = typeof opts.steps === 'number' && opts.steps >= 2 ? Math.round(opts.steps) : 3;

    // FALLBACK: sin ShaderMaterial no hay shader, pero el juego sigue andando.
    if (typeof B.ShaderMaterial !== 'function') {
        const simple = new B.StandardMaterial(nombre, scene);
        simple.diffuseColor = base;
        simple.emissiveColor = colorDeHex(B, mezclarHex(hex, '#000000', 0.72));
        simple.specularColor = typeof B.Color3 === 'function'
            ? new B.Color3(0, 0, 0) : { r: 0, g: 0, b: 0 };
        return marcar(simple, { fallback: true, color: hex, steps: pasos });
    }

    registrarShaders(B);
    const material = new B.ShaderMaterial(nombre, scene, {
        vertex: SHADER_NAME,
        fragment: SHADER_NAME
    }, {
        attributes: ['position', 'normal'],
        uniforms: [
            'world', 'worldView', 'worldViewProjection',
            'lightDir', 'baseColor', 'shadowColor', 'rimColor', 'steps'
        ],
        needAlphaBlending: false,
        needAlphaTesting: false
    });

    if (typeof material.setColor3 === 'function') {
        material.setColor3('baseColor', base);
        material.setColor3('shadowColor', colorDeHex(B, sombraHex));
        material.setColor3('rimColor', colorDeHex(B, rimHex));
    } else {
        material.baseColor = base;
        material.shadowColor = colorDeHex(B, sombraHex);
        material.rimColor = colorDeHex(B, rimHex);
    }
    if (typeof material.setFloat === 'function') material.setFloat('steps', pasos);
    else material.steps = pasos;

    const luz = Array.isArray(opts.lightDir) && opts.lightDir.length === 3
        ? opts.lightDir : LUZ_POR_DEFECTO;
    if (typeof material.setVector3 === 'function' && typeof B.Vector3 === 'function') {
        material.setVector3('lightDir', new B.Vector3(luz[0], luz[1], luz[2]));
    } else if (typeof material.setColor3 === 'function') {
        material.setColor3('lightDir', { r: luz[0], g: luz[1], b: luz[2] });
    }

    return marcar(material, { color: hex, shadowColor: sombraHex, rimColor: rimHex, steps: pasos });
}

/**
 * Sustituye el material de todas las mallas por materiales toon.
 * Las mallas sin material tambien se pintan (con el color por defecto o el de
 * `opts.colorFor`), que es el caso tipico de una primitiva recien creada.
 *
 * @param {object} B
 * @param {object} scene
 * @param {object[]} meshes
 * @param {object} [opts]
 *   colorFor  (mesh) => hex; gana sobre el color de la malla
 *   color     hex por defecto
 *   prefijo   prefijo de los nombres de material
 * @returns {object[]} los materiales creados, en el mismo orden que `meshes`
 */
export function applyCelShading(B, scene, meshes, opts = {}) {
    const lista = Array.isArray(meshes) ? meshes : (meshes ? [meshes] : []);
    const creados = [];
    const prefijo = opts.prefijo || 'toon';
    const porDefecto = opts.color || '#d8d8d8';

    for (const mesh of lista) {
        if (!mesh) continue;
        const elegido = typeof opts.colorFor === 'function' ? opts.colorFor(mesh) : null;
        const hex = elegido || (mesh.material && mesh.material.diffuseColor
            ? colorAHex(mesh.material.diffuseColor, porDefecto)
            : porDefecto);
        const sufijo = String(mesh.name || mesh.uniqueId || creados.length)
            .replace(/[^A-Za-z0-9_-]/g, '_');
        const material = createToonMaterial(B, scene, prefijo + '_' + sufijo, hex, opts);
        mesh.material = material;
        creados.push(material);
    }
    return creados;
}

/** `true` si el material fue creado por este modulo (toon o fallback). */
export function isToon(material) {
    return !!(material && material.metadata && material.metadata.spfToon === true);
}

export default createToonMaterial;
