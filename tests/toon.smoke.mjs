/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/toon.smoke.mjs
 * ----------------------------------------------------------------------------
 * Cel-shading con un BABYLON de mentira, sin WebGL.
 * ============================================================================
 *
 * QUE COMPRUEBA
 *   Que los shaders se registran en el ShadersStore, que el material creado es
 *   un ShaderMaterial con los uniform correctos y tres tonos, que
 *   applyCelShading sustituye materiales (incluso en mallas sin material) y que
 *   con un B sin ShaderMaterial se cae a StandardMaterial. Es el fallback que
 *   necesita render.smoke.mjs, que no tiene ShaderMaterial en su stub.
 *
 *   node tests/toon.smoke.mjs
 * ============================================================================
 */
import { load } from './loader.mjs';

let passed = 0, failed = 0;
function check(name, cond, extra) {
    if (cond) { passed++; console.log('  ok   ' + name); }
    else { failed++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
}
function section(t) { console.log('\n' + t); }

/** El BABYLON justo para ejecutar el modulo. No es un render: es un espejo. */
function makeB(conShader = true) {
    class Color3 {
        constructor(r = 0, g = 0, b = 0) { this.r = r; this.g = g; this.b = b; }
        static FromHexString(hex) {
            const n = parseInt(String(hex).replace('#', ''), 16);
            return new Color3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
        }
    }
    class Vector3 {
        constructor(x, y, z) { this.x = x; this.y = y; this.z = z; }
    }
    class StandardMaterial {
        constructor(n, sc) {
            this.name = n; this.scene = sc;
            this.diffuseColor = null; this.emissiveColor = null; this.specularColor = null;
        }
        dispose() { this.disposed = true; }
    }
    class ShaderMaterial {
        constructor(n, sc, path, options) {
            this.name = n; this.scene = sc; this.path = path; this.options = options;
            this.uniforms = {}; this.vectors = {};
        }
        setColor3(k, v) { this.uniforms[k] = v; }
        setFloat(k, v) { this.uniforms[k] = v; }
        setVector3(k, v) { this.vectors[k] = v; }
        dispose() { this.disposed = true; }
    }
    const B = {
        Color3, Vector3, StandardMaterial,
        Effect: { ShadersStore: {} },
        MeshBuilder: {}
    };
    if (conShader) B.ShaderMaterial = ShaderMaterial;
    return { B, ShaderMaterial, StandardMaterial, Color3, Vector3 };
}

const T = await load('src/render/ToonMaterial.js');
const scene = {};
const { B, ShaderMaterial, StandardMaterial, Color3, Vector3 } = makeB(true);

// ---------------------------------------------------------------------------
section('1. LOS SHADERS SE REGISTRAN');
// ---------------------------------------------------------------------------
check('hay store para registrar', T.registrarShaders(B) === true);
check('el vertex shader existe en el ShadersStore',
    typeof B.Effect.ShadersStore[T.VERTEX_KEY] === 'string');
check('el fragment shader existe en el ShadersStore',
    typeof B.Effect.ShadersStore[T.FRAGMENT_KEY] === 'string');
check('el vertex trae position y normal',
    /attribute\s+vec3\s+position/.test(B.Effect.ShadersStore[T.VERTEX_KEY])
    && /attribute\s+vec3\s+normal/.test(B.Effect.ShadersStore[T.VERTEX_KEY]));
check('el fragment hace cortes con floor (tonos, no degradado)',
    /floor\s*\(/.test(B.Effect.ShadersStore[T.FRAGMENT_KEY]));
check('el fragment tiene borde tipo rim',
    /rim/.test(B.Effect.ShadersStore[T.FRAGMENT_KEY]));
check('sin Effect no revienta y no registra nada',
    T.registrarShaders({}) === false);

// ---------------------------------------------------------------------------
section('2. EL MATERIAL TOON');
// ---------------------------------------------------------------------------
const mat = T.createToonMaterial(B, scene, 'prueba', '#1f6fb2');
check('devuelve un ShaderMaterial', mat instanceof ShaderMaterial);
check('la ruta del shader es la registrada',
    mat.path.vertex === T.SHADER_NAME && mat.path.fragment === T.SHADER_NAME, mat.path);
check('los attributes son position y normal',
    JSON.stringify(mat.options.attributes) === JSON.stringify(['position', 'normal']));
for (const u of ['world', 'worldViewProjection', 'lightDir', 'baseColor',
    'shadowColor', 'rimColor', 'steps']) {
    check('uniform ' + u, mat.options.uniforms.includes(u));
}
check('setColor3 recibe baseColor, shadowColor y rimColor',
    ['baseColor', 'shadowColor', 'rimColor'].every(k => mat.uniforms[k] instanceof Color3),
    Object.keys(mat.uniforms));
check('setFloat pone 3 tonos por defecto', mat.uniforms.steps === 3, mat.uniforms.steps);
check('la luz se sube como Vector3', mat.vectors.lightDir instanceof Vector3);
check('isToon lo reconoce', T.isToon(mat) === true);
check('isToon no confunde un material cualquiera', T.isToon(new StandardMaterial('x', scene)) === false);
check('isToon tolera null', T.isToon(null) === false);

// ---------------------------------------------------------------------------
section('3. SUSTITUCION DE MATERIALES');
// ---------------------------------------------------------------------------
const malla = (nombre, material) => ({ name: nombre, material: material || null });
const vieja = new StandardMaterial('vieja', scene);
vieja.diffuseColor = new Color3(1, 0, 0);
const mallas = [malla('uno', vieja), malla('dos'), malla('tres', vieja)];
const colores = [];
const creados = T.applyCelShading(B, scene, mallas, {
    colorFor: (m) => { colores.push(m.name); return '#1f6fb2'; }
});
check('se crea un material por malla', creados.length === 3, creados.length);
check('todas las mallas estan pintadas',
    mallas.every(m => m.material && m.material instanceof ShaderMaterial));
check('el material viejo se sustituye', mallas[0].material !== vieja);
check('colorFor se llama por malla', colores.join(',') === 'uno,dos,tres', colores);
check('las mallas sin material no rompen', mallas[1].material instanceof ShaderMaterial);
check('una lista vacia no crea nada', T.applyCelShading(B, scene, [], {}).length === 0);

// ---------------------------------------------------------------------------
section('4. FALLBACK SIN SHADERMATERIAL');
// ---------------------------------------------------------------------------
const sinShaderStub = makeB(false);
const sinShader = sinShaderStub.B;
const plano = T.createToonMaterial(sinShader, {}, 'fallback', '#b8873a');
check('sin ShaderMaterial se devuelve StandardMaterial',
    plano instanceof sinShaderStub.StandardMaterial);
check('el fallback pone difuso', plano.diffuseColor instanceof sinShaderStub.Color3);
check('el fallback pone emisivo', plano.emissiveColor instanceof sinShaderStub.Color3);
check('el fallback apaga el specular',
    plano.specularColor.r === 0 && plano.specularColor.g === 0 && plano.specularColor.b === 0,
    plano.specularColor);
check('el fallback tambien se reconoce como toon', T.isToon(plano) === true);

// Un B sin Color3.FromHexString debe usar el parseo a mano.
const sinFromHexStub = makeB(false);
const sinFromHex = sinFromHexStub.B;
delete sinFromHex.Color3.FromHexString;
let sinFalloT = true;
let planoManual = null;
try { planoManual = T.createToonMaterial(sinFromHex, {}, 'manual', '#1f6fb2'); }
catch (_) { sinFalloT = false; }
check('sin Color3.FromHexString no revienta', sinFalloT);
check('y el color se parsea a mano',
    sinFalloT && Math.abs(planoManual.diffuseColor.r - 31 / 255) < 1e-9,
    planoManual && planoManual.diffuseColor);
const aplicados = T.applyCelShading(sinFromHex, {}, [malla('plana')], {});
check('applyCelShading tambien usa el fallback',
    aplicados[0] instanceof sinFromHexStub.StandardMaterial);

console.log('\n' + passed + ' ok, ' + failed + ' FAIL');
process.exit(failed ? 1 : 0);
