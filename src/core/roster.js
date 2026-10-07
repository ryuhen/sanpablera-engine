/**
 * ============================================================================
 * SANPABLERA ENGINE · roster.js
 * ----------------------------------------------------------------------------
 * ROSTER de 8 peleadores para la pantalla de seleccion (spec: 8 espacios,
 * tipo panal).
 *
 * El modelo 3D es UNO (assets/characters/mannequin.glb) y cada personaje es
 * un color + un perfil FSM (characterId). Los dos primeros (SAN_PABLO y
 * MALON) ya tienen stances y golpes propios en core/fsm/states/
 * CharacterStates.js; el resto son huecos del roster con el perfil base
 * hasta que tengan su propio estilo.
 * ============================================================================
 */

export const ROSTER = [
    { id: 'SAN_PABLO', name: 'San Pablo',  tag: 'El luchador de barrio', characterId: 'SAN_PABLO', rgb: [0.30, 0.55, 1.00], hex: '#4d8cff' },
    { id: 'MALON',     name: 'Malon',      tag: 'El rival',              characterId: 'MALON',     rgb: [0.90, 0.35, 0.30], hex: '#e6594d' },
    { id: 'ORIGAMI',   name: 'Origami',    tag: 'El plegado',            characterId: null,        rgb: [0.95, 0.87, 0.55], hex: '#f2de8c' },
    { id: 'CENIZA',    name: 'Ceniza',     tag: 'La brasa apagada',      characterId: null,        rgb: [0.55, 0.55, 0.55], hex: '#8c8c8c' },
    { id: 'ESMERALDA', name: 'Esmeralda',  tag: 'El filo verde',         characterId: null,        rgb: [0.15, 0.70, 0.45], hex: '#26b373' },
    { id: 'VIOLETA',   name: 'Violeta',    tag: 'La lanza morada',       characterId: null,        rgb: [0.55, 0.30, 0.85], hex: '#8c4dd9' },
    { id: 'AZABACHE',  name: 'Azabache',   tag: 'El abismo quieto',      characterId: null,        rgb: [0.10, 0.45, 0.45], hex: '#1a7373' },
    { id: 'CALAMO',    name: 'Calamo',     tag: 'El trazo ambar',        characterId: null,        rgb: [0.95, 0.60, 0.15], hex: '#f29a26' }
];

/** Devuelve un slot del roster por id (o el primero, por si tercia). */
export function rosterSlot(id) {
    return ROSTER.find(s => s.id === id) || ROSTER[0];
}

export default ROSTER;