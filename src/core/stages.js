/**
 * ============================================================================
 * SANPABLERA ENGINE · stages.js
 * ----------------------------------------------------------------------------
 * ESCENARIOS (spec: seleccion de escenario con aspecto de libro de papel /
 * origami). POR AHORA solo hay uno: el Dojo Origami.
 *
 * El tema se aplica al escenario 3D (suelo, tatami y vallas) desde Engine.js
 * despues de que el jugador elige. Todo lo demas (luces, camara, peleadores)
 * es independiente del escenario.
 * ============================================================================
 */

export const STAGES = [
    {
        id: 'DOJO_ORIGAMI',
        name: 'Dojo Origami',
        tag: 'Un dojo plegado a mano, de papel y silencio',
        // Paleta del escenario 3D.
        ground: '#e9e3d2',   // suelo
        mat: '#f2ebd8',      // tatami / ring
        rail: '#c9b57f',     // vallas y postes
        wall: '#efe7cf'      // luz ambiental de papel
    }
];

export function stageById(id) {
    return STAGES.find(s => s.id === id) || STAGES[0];
}

export default STAGES;