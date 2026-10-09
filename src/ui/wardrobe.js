/**
 * ============================================================================
 * SANPABLERA ENGINE · ui/wardrobe.js
 * ----------------------------------------------------------------------------
 * EL VESTUARIO: que ropa lleva cada peleador, como datos.
 *
 * QUE ES Y QUE NO ES
 * ----------------------------------------------------------------------------
 *   Es un CATALOGO de atuendos. No dibuja nada: son tablas que el motor lee y
 *   que la pantalla de seleccion recorre. Al estar en datos (y no en el codigo
 *   de la pantalla) se puede testear en Node y se puede ampliar sin tocar la UI.
 *
 * POR QUE DATOS Y NO MALLA AHORA MISMO
 * ----------------------------------------------------------------------------
 *   Un atuendo de verdad (ropa con su propia malla) pesa, y la pantalla de
 *   seleccion carga UN solo modelo (ver SelectScreen): multiplicar por nueve
 *   peleadores multiplicaria la descarga. Con colores por pieza el panal pesa
 *   cero y sigue habiendo donde meter detalle mas adelante.
 *
 *   La estructura ya esta preparada para ese futuro: cada atuendo declara
 *   `piezas`, que son los huesos del CONTRATO que cubre. Si manana un atuendo
 *   trae malla, se anade un `model` a la entrada y el motor lo cuelga de esos
 *   mismos huesos. No habra que rehacer el catalogo.
 *
 * COMO ESTA PENSADO PARA LAS PIEZAS QUE SE ROMPEN
 * ----------------------------------------------------------------------------
 *   Este archivo esta escrito pensando en que mas adelante las piezas se
 *  SeparateN: una entrada puede declarar `soltable: true` (la gorra, las
 *   guantes, un cinturon), que significa que se le puede sacar al rival en un
 *   combate. El campo `arma` dice con que golpe se usa. La pantalla de
 *   seleccion, de momento, solo cambia el color; pero los datos ya estan ahi
 *   para que la mecanica de desarme de la Fase 4 (ver core/phases.js) tenga
 *   donde mirar.
 *
 *   POR QUE EL COLOR ES POR PIEZA Y NO UNO SOLO
 *   El maniqui de piezas (render/PartMannequin.js) tiene el torso, la pelvis,
 *   las extremidades, la cabeza, las manos y los pies como piezas separadas. Un
 *   solo color para todo hace que los pies y las manos dejen de leerse, que es
 *   justo lo que un juego de pelea no puede permitirse (ver tintParts). Por eso
 *   cada atuendo declara los suyos.
 *
 * GRUPOS DE PIEZA (los mismos nombres que usa PART_TABLE)
 * ----------------------------------------------------------------------------
 *   torso    : pecho y abdomen      (SPINE, CHEST)
 *   pelvis   : cadera               (PELVIS)
 *   piernas  : muslos y espinillas  (THIGH_*, SHIN_*)
 *   brazos   : brazos y antebrazos   (UPPERARM_*, FOREARM_*)
 *   manos    : nudos y manos        (HAND_*)
 *   pies     : zapatillas           (FOOT_*, TOE_*)
 *   cabeza   : cabeza y cuello      (HEAD, NECK)
 *   extra    : lo que no cuelga de un hueso (gorra, gafas, mochila)
 *
 * UN ATUENDO POR PELEADOR, MAS LOS DE MARCA
 * ----------------------------------------------------------------------------
 *   Cada peleador del roster declara su `outfit`. Los que vienen con el nombre
 *   son los suyos de verdad; ademas hay atuendos sueltos (los de marca, que
 *   cualquier peleador puede$) para que la eleccion tenga gracia.
 * ============================================================================
 */

/** Colores de piel y de pelo por defecto, para los huecos que un atuendo deja. */
export const BASE_SKIN = Object.freeze({
    piel: '#c8a58a',
    pelo: '#2b2118',
    shoes: '#2b3247'
});

/**
 * Los grupos de pieza que entiende el motor. La lista es cerrada a proposito:
 * si se anade un grupo aqui, hay que anadirlo tambien a `skinOfGroup` (abajo)
 * y al tinte, o el atuendo se pinta a medias.
 */
export const PART_GROUPS = Object.freeze([
    'torso', 'pelvis', 'piernas', 'brazos', 'manos', 'pies', 'cabeza', 'extra'
]);

/**
 * LOS ATUENDOS DE MARCA: los que puede elegir cualquier peleador.
 *
 * Cada uno:
 *   id      : identificador estable (se guarda en localStorage).
 *   nombre  : como se llama en la pantalla.
 *   piezas  : grupo -> color. Lo que no este, cae al color base.
 *   extra   : adornos sueltos (color y forma). Se dibujan en la pantalla y, si
 *             el 3D los soporta, se cuelgan de un hueso.
 *   soltable: true si se le puede quitar al rival en combate (fase de desarme).
 *   arma    : con que golpe se usa lo soltable (ver core/phases.js).
 */
export const OUTFITS = Object.freeze([
    {
        id: 'CALLEJON',
        nombre: 'Del Callejón',
        piezas: {
            torso: '#2b3a55', pelvis: '#1f2a3d', piernas: '#3b4a63',
            brazos: '#c8a58a', manos: '#c8a58a', pies: '#e8e4d8',
            cabeza: '#c8a58a'
        },
        extra: [{ tipo: 'gorra', color: '#e03b3b' }],
        nota: 'El que se pone uno cuando va a pelear en su calle.'
    },
    {
        id: 'ARCOIRIS',
        nombre: 'Arcoíris',
        piezas: {
            torso: '#ff2d6f', pelvis: '#2b1055', piernas: '#00d4ff',
            brazos: '#ffd23f', manos: '#f4f1e8', pies: '#8dff3b',
            cabeza: '#c8a58a'
        },
        extra: [{ tipo: 'gafas', color: '#00e5ff' }],
        nota: 'Para que se le vea desde la última fila.'
    },
    {
        id: 'CANCHA',
        nombre: 'Cancha',
        piezas: {
            torso: '#f4f1e8', pelvis: '#1a1a22', piernas: '#f4f1e8',
            brazos: '#c8a58a', manos: '#ff2d6f', pies: '#ffd23f',
            cabeza: '#c8a58a'
        },
        extra: [{ tipo: 'cinta', color: '#ff2d6f' }],
        nota: 'El de los cortos de la calle. Cinturon que se puede sacar.'
    },
    {
        id: 'NOCHE',
        nombre: 'De Noche',
        piezas: {
            torso: '#14141c', pelvis: '#0d0d12', piernas: '#1f1f2b',
            brazos: '#14141c', manos: '#c8a58a', pies: '#0d0d12',
            cabeza: '#c8a58a'
        },
        extra: [{ tipo: 'capucha', color: '#0d0d12' }],
        nota: 'Negro sobre negro. Para los que pegan de noche.'
    },
    {
        id: 'MECANICO',
        nombre: 'Mecánico',
        piezas: {
            torso: '#3f4a63', pelvis: '#2b3247', piernas: '#5a6b8c',
            brazos: '#c8a58a', manos: '#e8a33b', pies: '#2b3247',
            cabeza: '#c8a58a'
        },
        // Las herramientas se rompen, se pierden y sirven como arma. Es el
        // ejemplo de por que el campo existe.
        extra: [{ tipo: 'guantes', color: '#e8a33b', soltable: true, arma: 'PATADA' }],
        nota: 'Guantes de trabajo: se sueltan fácil y pegan igual.'
    },
    {
        id: 'AGUA',
        nombre: 'Agua',
        piezas: {
            torso: '#0a3d5c', pelvis: '#062a40', piernas: '#0e5c85',
            brazos: '#c8a58a', manos: '#c8a58a', pies: '#7bd8f0',
            cabeza: '#c8a58a'
        },
        extra: [{ tipo: 'gorra', color: '#7bd8f0' }],
        nota: 'Del color del mar a las cuatro de la tarde.'
    },
    {
        id: 'BICICLETA',
        nombre: 'Bicicleta',
        piezas: {
            torso: '#2d6a4f', pelvis: '#1b4332', piernas: '#95d5b2',
            brazos: '#c8a58a', manos: '#2d6a4f', pies: '#1b4332',
            cabeza: '#c8a58a'
        },
        extra: [{ tipo: 'gorra', color: '#1b4332', alReves: true }],
        nota: 'Gorra al revés: se le ve de lejos que viene en bici.'
    },
    {
        id: 'ORO',
        nombre: 'Oro',
        piezas: {
            torso: '#ffd23f', pelvis: '#b8860b', piernas: '#2b2118',
            brazos: '#c8a58a', manos: '#ffd23f', pies: '#1a1a22',
            cabeza: '#c8a58a'
        },
        extra: [{ tipo: 'cinturon', color: '#ffd23f', soltable: true, arma: 'MANO' }],
        nota: 'El cinturón brilla. Y brilla porque se lo pueden quitar.'
    }
]);

/**
 * El atuendo por defecto de cada peleador del roster.
 *
 * Se indexa por el `id` del peleador, no por el nombre, para que si un dia se
 * renombran no se rompa. Los que no estan aqui usan `defaultFor()`.
 */
export const OUTFIT_BY_FIGHTER = Object.freeze({
    PEDRO: 'CANCHA',
    JUAN: 'NOCHE',
    JOSE: 'CALLEJON',
    MARIA: 'AGUA',
    JOHN: 'MECANICO',
    JANE: 'ARCOIRIS',
    CARLOS: 'BICICLETA',
    ANA: 'ORO'
});

/** Atuendo que se pone el peleador del jugador si no ha elegido otro. */
export const DEFAULT_OUTFIT = 'CALLEJON';

/**
 * Los atuendos que puede ver un peleador: los suyos + todos los de marca.
 * @param {string} fighterId
 * @returns {Array<object>} la lista, con el suyo primero
 */
export function outfitsFor(fighterId) {
    const propio = OUTFIT_BY_FIGHTER[fighterId] || DEFAULT_OUTFIT;
    const mios = OUTFITS.filter((o) => o.id === propio);
    const otros = OUTFITS.filter((o) => o.id !== propio);
    return [...mios, ...otros];
}

/** El atuendo por defecto de un peleador concreto. */
export function defaultFor(fighterId) {
    const id = OUTFIT_BY_FIGHTER[fighterId] || DEFAULT_OUTFIT;
    return outfitById(id) || OUTFITS[0];
}

/** Un atuendo por id, o null. */
export function outfitById(id) {
    return OUTFITS.find((o) => o.id === id) || null;
}

/** Todos los ids, en orden. */
export function outfitIds() {
    return OUTFITS.map((o) => o.id);
}

/**
 * El siguiente atuendo del ciclo de un peleador.
 *
 * POR QUE CICLO Y NO UNA LISTA CON CURSOR
 *   El boton de patada tiene que cambiar de ropa en un gesto y volver a su
 *   sitio. Con un ciclo, el estado del boton no importa: siempre avanza una.
 *   Con un cursor habria que guardar cual esta enfocada y sincronizarlo con la
 *   pantalla, que es justo el tipo de estado que se desincroniza.
 *
 * @param {string} fighterId
 * @param {string} currentId  el que lleva puesto ahora
 * @returns {string} el id del siguiente
 */
export function nextOutfit(fighterId, currentId) {
    const lista = outfitsFor(fighterId);
    if (!lista.length) return DEFAULT_OUTFIT;
    const i = lista.findIndex((o) => o.id === currentId);
    return lista[(i + 1) % lista.length].id;
}

/**
 * El color final de una pieza concreta, con elatuendo puesto.
 *
 * POR QUE HAY QUE RESOLVERLO AQUI Y NO EN EL MOTOR
 *   El 3D solo tiene el maniqui de piezas (render/PartMannequin.js), y ahi cada
 *   pieza se tiñe con UN material. Para que el vestuario se vea hace falta
 *   decidir el color de cada grupo ANTES, y pasarlos separados. Esta funcion es
 *   ese "antes": el motor solo la llama y ya no tiene que saber nada de
 *   atuendos.
 *
 * @param {object} outfit  una entrada de OUTFITS
 * @param {string} group   clave de PART_GROUPS
 * @returns {string} color hex
 */
export function colorOf(outfit, group) {
    if (outfit && outfit.piezas && outfit.piezas[group]) return outfit.piezas[group];
    // Huecos: se cae a la base, o al torso si el grupo no tiene base propia.
    if (group === 'cabeza') return BASE_SKIN.piel;
    if (group === 'pies') return BASE_SKIN.shoes;
    if (group === 'manos') return BASE_SKIN.piel;
    if (outfit && outfit.piezas && outfit.piezas.torso) return outfit.piezas.torso;
    return '#8f9bb3';
}

/**
 * Los adornos sueltos de un atuendo (gorra, gafas, guantes...).
 * @returns {Array} la lista de extras
 */
export function extrasOf(outfit) {
    return (outfit && outfit.extra) || [];
}

/**
 * Las piezas SOLTABLES de un atuendo: las que se pueden perder o servir de arma.
 * @returns {Array<{tipo,color,arma}>}
 */
export function loosePiecesOf(outfit) {
    return extrasOf(outfit).filter((e) => e.soltable);
}

/**
 * Comprueba que el catalogo esta sano. Se usa en los tests.
 * @returns {string[]} la lista de problemas (vacia = bien)
 */
export function validate() {
    const problemas = [];
    const vistos = new Set();
    if (!OUTFITS.length) problemas.push('no hay ningun atuendo');
    for (const o of OUTFITS) {
        if (!o.id) problemas.push('un atuendo sin id');
        if (vistos.has(o.id)) problemas.push(`atuendo repetido: ${o.id}`);
        vistos.add(o.id);
        if (!o.nombre) problemas.push(`${o.id}: sin nombre`);
        if (!o.piezas || typeof o.piezas !== 'object') {
            problemas.push(`${o.id}: sin piezas`);
            continue;
        }
        if (!o.piezas.torso) problemas.push(`${o.id}: el torso es obligatorio (es el color de reserva)`);
        for (const g of Object.keys(o.piezas)) {
            if (!PART_GROUPS.includes(g)) problemas.push(`${o.id}: grupo desconocido "${g}"`);
            if (!/^#[0-9a-fA-F]{6}$/.test(o.piezas[g])) {
                problemas.push(`${o.id}: "${g}" no es un color hex (${o.piezas[g]})`);
            }
        }
        for (const e of extrasOf(o)) {
            if (!e.tipo) problemas.push(`${o.id}: un extra sin tipo`);
            if (!/^#[0-9a-fA-F]{6}$/.test(e.color || '')) {
                problemas.push(`${o.id}: extra "${e.tipo}" sin color hex valido`);
            }
            // Lo soltable tiene que decir con que golpe se usa, o el motor no
            // sabe que hacer con ello cuando lo sacan del rival.
            if (e.soltable && !e.arma) {
                problemas.push(`${o.id}: "${e.tipo}" es soltable pero no dice con que arma`);
            }
        }
    }
    for (const [fid, oid] of Object.entries(OUTFIT_BY_FIGHTER)) {
        if (!outfitById(oid)) problemas.push(`el peleador ${fid} apunta a un atuendo inexistente: ${oid}`);
    }
    if (!outfitById(DEFAULT_OUTFIT)) problemas.push(`DEFAULT_OUTFIT no existe: ${DEFAULT_OUTFIT}`);
    return problemas;
}

export default {
    OUTFITS, OUTFIT_BY_FIGHTER, DEFAULT_OUTFIT, PART_GROUPS, BASE_SKIN,
    outfitsFor, defaultFor, outfitById, outfitIds, nextOutfit,
    colorOf, extrasOf, loosePiecesOf, validate
};
