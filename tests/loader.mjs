/**
 * Mini cargador de módulos ES para los tests.
 *
 * POR QUE EXISTE
 *   El proyecto sirve el motor como módulos ES nativos desde el navegador
 *   (<script type="module">), pero su package.json sigue siendo CommonJS
 *   porque server.js usa require(). Node no puede importar un .js con
 *   `export` sin "type": "module", asi que este loader resuelve los imports
 *   relativos a URLs data: y los carga tal cual.
 *
 *   Efecto secundario utile: obliga a que los modulos testeados sean PUROS
 *   (sin BABYLON, sin DOM). Los modulos puros son los que se pueden testear en
 *   Node; los que dependen del motor se testean en el navegador.
 *
 * USO
 *   const { load } = await import('./loader.mjs');
 *   const { StateMachine } = await load('src/core/fsm/StateMachine.js');
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Cache de URLs data: por ruta absoluta. Importar dos veces la misma URL
 * devuelve el MISMO modulo (como en el navegador), asi que el singleton global
 * SPF se mantiene igual que en el motor real.
 */
const urls = new Map();

/** Captura `from './x.js'`, `import './x.js'` e `import(...)` relativos. */
const SPECIFIER_RE = /(\bfrom\s*|\bimport\s*\(?\s*)(['"])(\.{1,2}\/[^'"]+)\2/g;

function toDataUrl(source) {
    return 'data:text/javascript;base64,' + Buffer.from(source, 'utf8').toString('base64');
}

export async function load(relPath) {
    const abs = resolvePath(ROOT, relPath);
    if (urls.has(abs)) return import(urls.get(abs));

    const source = await readFile(abs, 'utf8');

    const deps = new Map();
    for (const match of source.matchAll(SPECIFIER_RE)) {
        const spec = match[3];
        if (deps.has(spec)) continue;
        await load(resolvePath(dirname(abs), spec));   // llena la cache de URLs
        deps.set(spec, urls.get(resolvePath(dirname(abs), spec)));
    }

    const rewritten = source.replace(SPECIFIER_RE, (_m, keyword, quote, spec) => {
        const url = deps.get(spec);
        if (!url) throw new Error('[loader] No se pudo resolver ' + spec + ' desde ' + abs);
        return keyword + quote + url + quote;
    });

    const url = toDataUrl(rewritten);
    urls.set(abs, url);   // antes de importar: esto resuelve los ciclos
    return import(url);
}

/** Carga varios modulos a la vez y devuelve su namespace por ruta. */
export async function loadAll(paths) {
    const out = {};
    for (const p of paths) out[p] = await load(p);
    return out;
}