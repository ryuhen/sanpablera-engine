/**
 * ============================================================================
 * SANPABLERA ENGINE · stages.js
 * ----------------------------------------------------------------------------
 * ESCENARIOS DE SANPABLERA: donde se pelea y donde se cuenta la historia.
 *
 * Cada escenario tiene dos capas:
 *   - PELEA: paleta y atmosfera que el motor aplica al ring (ground/mat/rail/wall).
 *   - NARRATIVA: contexto, tono, gancho y reglas de color para intros/cutscenes.
 *
 * Los escenarios estan anclados a lugares/zonas de margarita.js para que mapa,
 * diorama, campaña y seleccion hablen el mismo idioma.
 * ============================================================================
 */

export const STAGES = [
    {
        id: 'PLAYA_AGUA',
        name: 'Playa del Agua',
        tag: 'Arena abierta, sal y publico encima',
        zona: 'COSTA',
        lugar: 'PLAYA_AGUA',
        hora: 'atardecer',
        ground: '#e7d3a2',
        mat: '#f3e7c7',
        rail: '#9fc2d8',
        wall: '#f6e0a8',
        pelea: {
            ritmo: 'rapido',
            visibilidad: 'alta',
            nota: 'Ring abierto y luminoso. Favorece lecturas claras y entradas largas.'
        },
        narrativa: {
            tono: 'desafio publico',
            gancho: 'El torneo empieza frente a todo el mundo; no hay donde esconderse.',
            intro: 'Brisa marina, tambores lejanos y gente rodeando el ring improvisado.',
            paleta: ['#1f6fb2', '#f3e7c7', '#ffd447']
        }
    },
    {
        id: 'EL_MORRO',
        name: 'El Morro',
        tag: 'Risco de viento, roca y caida al mar',
        zona: 'COSTA',
        lugar: 'EL_MORRO',
        hora: 'atardecer',
        ground: '#c9b08a',
        mat: '#dfccb0',
        rail: '#7f8f99',
        wall: '#d7c9ae',
        pelea: {
            ritmo: 'arriesgado',
            visibilidad: 'alta',
            nota: 'Bordes peligrosos: ideal para caidas, saltos y cambios de escenario.'
        },
        narrativa: {
            tono: 'vertigo',
            gancho: 'Un paso en falso y la pelea baja a la playa.',
            intro: 'Viento fuerte, gaviotas y el mar golpeando las rocas debajo.',
            paleta: ['#7f8f99', '#dfccb0', '#1f6fb2']
        }
    },
    {
        id: 'PUEBLO_PAN',
        name: 'Pueblo de Pan',
        tag: 'Callejon de casas blancas y sombra corta',
        zona: 'COSTA',
        lugar: 'PUEBLO_PAN',
        hora: 'manana',
        ground: '#ddd2bf',
        mat: '#efe6d3',
        rail: '#8fa3b3',
        wall: '#f2ede2',
        pelea: {
            ritmo: 'medio',
            visibilidad: 'alta',
            nota: 'Espacio urbano limpio, bueno para footsies y confirmaciones.'
        },
        narrativa: {
            tono: 'barrio despierto',
            gancho: 'La pelea pasa entre ventanas, voces y olor a pan recien hecho.',
            intro: 'Persianas abiertas, pasos en calzada y una campana de bici al fondo.',
            paleta: ['#f2ede2', '#8fa3b3', '#c49a6c']
        }
    },
    {
        id: 'PUERTO_AZUL',
        name: 'Puerto Azul',
        tag: 'Madera, oxido y golpes que suenan a metal',
        zona: 'SUR_SECO',
        lugar: 'PUERTO_AZUL',
        hora: 'noche',
        ground: '#8b7760',
        mat: '#b8a184',
        rail: '#5f7688',
        wall: '#2f3b4a',
        pelea: {
            ritmo: 'pesado',
            visibilidad: 'media',
            nota: 'Ambiente cerrado y duro. Se siente bien para presión, clinch y castigo.'
        },
        narrativa: {
            tono: 'trabajo y deuda',
            gancho: 'Nadie pelea gratis en el puerto; cada round parece un cobro.',
            intro: 'Gruas quietas, sirena lejana y cadenas que se mueven con el viento.',
            paleta: ['#2f3b4a', '#b8a184', '#ff8a3d']
        }
    },
    {
        id: 'MIRADOR_SECO',
        name: 'Mirador Seco',
        tag: 'Tierra roja, calor y nada que bloquee la mirada',
        zona: 'SUR_SECO',
        lugar: 'MIRADOR_SECO',
        hora: 'mediodia',
        ground: '#c98d4f',
        mat: '#ddb377',
        rail: '#7a4a2a',
        wall: '#f0c27b',
        pelea: {
            ritmo: 'castigo',
            visibilidad: 'alta',
            nota: 'Escenario de desgaste: ideal para peleas largas y reads de resistencia.'
        },
        narrativa: {
            tono: 'aguante',
            gancho: 'El sol pega primero; el rival pega después.',
            intro: 'Viento seco, polvo en suspension y el horizonte temblando por calor.',
            paleta: ['#b8873a', '#f0c27b', '#7a4a2a']
        }
    },
    {
        id: 'SELVA_BORDE',
        name: 'Borde de Selva',
        tag: 'Verde cerrado, humedad y sonido de hojas',
        zona: 'MACIZO',
        lugar: 'SELVA_BORDE',
        hora: 'tarde',
        ground: '#6d7b4b',
        mat: '#95a56a',
        rail: '#4f5f35',
        wall: '#c9d3a1',
        pelea: {
            ritmo: 'inestable',
            visibilidad: 'media',
            nota: 'Bueno para movilidad, mixtos y cambios de ritmo; la silueta debe leerse fuerte.'
        },
        narrativa: {
            tono: 'acecho',
            gancho: 'La selva no mira, pero escucha. Cada paso revela intención.',
            intro: 'Insectos, hojas moviendose y un rayo de luz cortando la humedad.',
            paleta: ['#2f5d3a', '#95a56a', '#dce7b0']
        }
    },
    {
        id: 'CANYON_SECO',
        name: 'Cañon Hondo',
        tag: 'Paredes de piedra y eco de impacto',
        zona: 'MACIZO',
        lugar: 'CANYON_SECO',
        hora: 'tarde',
        ground: '#8d735d',
        mat: '#b79a80',
        rail: '#5b4638',
        wall: '#d2c0ad',
        pelea: {
            ritmo: 'tenso',
            visibilidad: 'media',
            nota: 'Corredor natural: favorece presión frontal y castigo de error.'
        },
        narrativa: {
            tono: 'eco',
            gancho: 'En el cañón, un golpe suena dos veces.',
            intro: 'Eco corto, grava cayendo y sombra larga entre paredes rojas.',
            paleta: ['#7a5b44', '#d2c0ad', '#3e2f27']
        }
    },
    {
        id: 'VILLA_BASALTICA',
        name: 'Villa Basaltica',
        tag: 'Roca negra, ceniza y calor bajo los pies',
        zona: 'CERRO',
        lugar: 'VILLA_BASALTICA',
        hora: 'anochecer',
        ground: '#4b4340',
        mat: '#726966',
        rail: '#2f2a28',
        wall: '#8f7d73',
        pelea: {
            ritmo: 'duro',
            visibilidad: 'media',
            nota: 'Escenario pesado, ideal para personajes de presión y agarre.'
        },
        narrativa: {
            tono: 'umbral',
            gancho: 'Antes de la cratera, la isla prueba si todavia quieres subir.',
            intro: 'Brasas tenues, viento caliente y polvo negro sobre el suelo.',
            paleta: ['#5a3a2a', '#726966', '#d08a5a']
        }
    },
    {
        id: 'CRATERA',
        name: 'La Cratera',
        tag: 'La final: calor, eco y roca viva',
        zona: 'CERRO',
        lugar: 'CRATERA',
        hora: 'noche',
        ground: '#3a302d',
        mat: '#5c4b45',
        rail: '#8b3f2b',
        wall: '#1f1715',
        pelea: {
            ritmo: 'climax',
            visibilidad: 'dramatica',
            nota: 'Arena final. Contraste alto, lectura clara de siluetas y golpes decisivos.'
        },
        narrativa: {
            tono: 'final',
            gancho: 'El ultimo ring no es un lugar: es una prueba.',
            intro: 'Resplandor rojo bajo la roca, humo leve y silencio antes del primer golpe.',
            paleta: ['#8b3f2b', '#ffb347', '#1f1715']
        }
    },
    {
        id: 'DOJO_ORIGAMI',
        name: 'Dojo Origami',
        tag: 'Un dojo plegado a mano, de papel y silencio',
        zona: 'ESPECIAL',
        lugar: null,
        hora: 'interior',
        ground: '#e9e3d2',
        mat: '#f2ebd8',
        rail: '#c9b57f',
        wall: '#efe7cf',
        pelea: {
            ritmo: 'neutral',
            visibilidad: 'alta',
            nota: 'Escenario de entrenamiento y legibilidad máxima.'
        },
        narrativa: {
            tono: 'disciplina',
            gancho: 'Donde se aprenden los golpes antes de llevarlos a la isla.',
            intro: 'Luz suave, papel, madera y silencio.',
            paleta: ['#efe7cf', '#c9b57f', '#7a6a45']
        }
    }
];

/** Escenarios recomendados para modo pelea rápida (excluye especiales si se quiere). */
export const FIGHT_STAGES = STAGES.filter((s) => s.zona !== 'ESPECIAL');

/** Escenarios con anclaje narrativo/geográfico en la isla. */
export const NARRATIVE_STAGES = STAGES.filter((s) => !!s.lugar);

export function stageById(id) {
    return STAGES.find((s) => s.id === id) || STAGES[0];
}

export function stagesByZone(zona) {
    return STAGES.filter((s) => s.zona === zona);
}

export function stageByLugar(lugarId) {
    return STAGES.find((s) => s.lugar === lugarId) || null;
}

export default STAGES;
