/**
 * ============================================================================
 * SANPABLERA ENGINE · core/archetypes.js
 * ----------------------------------------------------------------------------
 * LA TRIADA DE ARQUETIPOS BASE: la "plantilla
 * internacional segura". Tres arquetipos con nombres y
 * conceptos 100% libres de copyright: ni marcas ni
 * nombres de franquicias existentes.
 *
 * Todo peleador del roster (y cualquier peleador nuevo,
 * incluido el del jugador) VIENE DE uno de estos tres:
 * es su ESTILO BASE, el punto de partida antes de que
 * la calle de Sanpablera le añada las capas (ver
 * fsm/states/Movesets.js: Pedro es el ejemplo escrito
 * capa por capa).
 *
 *   YUGO ..... El Boxeador: combate agil y rapido de
 *                puños. (Pedro Pérez es el ejemplo.)
 *   MONTE .... El Peleador Salvaje: movilidad acrobatica,
 *                saltos multiples y posturas cuadrupedas.
 *                Es el estilo "Tarzán/Monte": el de la
 *                selva, registrado con el nombre libre
 *                (MONTE) por la regla de nombres sin
 *                copyright.
 *   MUSASHI .. El Vagabundo Marcial: base desarmada de
 *                Karate, Aikido y Judo, con la capacidad
 *                de convertir cualquier objeto del entorno
 *                (palo, vara, herramienta) en un estilo de
 *                espada letal: el KENJUTSU IMPROVISADO.
 * ============================================================================
 */

export const ARCHETYPES = Object.freeze({
    YUGO: Object.freeze({
        id: 'YUGO',
        name: 'El Boxeador',
        style: 'Yugo',
        concept: 'Combate ágil y rápido de puños.',
        base: 'Boxeo',
        grows: Object.freeze(['patadas', 'suelo', 'sumisión', 'arma'])
    }),
    MONTE: Object.freeze({
        id: 'MONTE',
        name: 'El Peleador Salvaje',
        style: 'Tarzán/Monte',
        concept: 'Movilidad acrobática, saltos múltiples y posturas cuadrúpedas.',
        base: 'Acrobacia de monte',
        grows: Object.freeze(['saltos múltiples', 'cuadrupedia', 'golpes de aire'])
    }),
    MUSASHI: Object.freeze({
        id: 'MUSASHI',
        name: 'El Vagabundo Marcial',
        style: 'Musashi',
        concept: 'Base desarmada de Karate, Aikido y Judo, con capacidad de convertir cualquier objeto del entorno (palo, vara, herramienta) en un estilo de espada letal: el Kenjutsu Improvisado.',
        base: 'Karate · Aikido · Judo',
        grows: Object.freeze(['kenjutsu improvisado', 'proyecciones', 'sumisiones'])
    })
});

/** La triada en orden (para menus y documentacion). */
export const ARCHETYPE_LIST = Object.freeze([
    ARCHETYPES.YUGO,
    ARCHETYPES.MONTE,
    ARCHETYPES.MUSASHI
]);

/** ¿Es un id de arquetipo conocido? */
export function isArchetype(id) {
    return !!ARCHETYPES[id];
}

export default ARCHETYPES;
