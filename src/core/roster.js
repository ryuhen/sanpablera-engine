/**
 * ============================================================================
 * SANPABLERA ENGINE · roster.js
 * ----------------------------------------------------------------------------
 * ROSTER de la pantalla de seleccion (spec: 8 espacios,
 * tipo panal) + el PELEADOR DEL JUGADOR (ver CustomFighter.js).
 *
 * LOS NOMBRES
 *   A propósito, comunes y genéricos (un Pedro Pérez, una
 *   María González, un John Doe): los peleadores de
 *   Sanpablera son gente anónima de la calle que VA A LA
 *   VICTORIA. El nombre no dice quien es; la etiqueta y la
 *   historia dicen COMO PELEA. El jugador, ademas, puede
 *   renombrar a su propio peleador (slot CUSTOM).
 *
 * LA FORMA DE CADA UNO
 *   Cada peleador viene de un ARQUETIPO BASE (ver
 *   core/archetypes.js: YUGO el boxeador, MONTE el
 *   salvaje, MUSASHI el vagabundo marcial) y, por
 *   la calle de Sanpablera, lo adapta con formas
 *   variadas y mucha movilidad. Pedro Pérez es
 *   el ejemplo vivo: empezó como boxeador, le sumó
 *   patadas, aprendió a pelear en el suelo
 *   (sumisión) y guarda una botella rota para el
 *   final. Su moveset entero está en
 *   core/fsm/states/Movesets.js, escrito capa por
 *   capa.
 *
 * El modelo 3D es UNO (assets/characters/mannequin.glb) y
 * cada personaje es un color + un perfil FSM (characterId).
 * characterId null = set base del motor (CORE_MOVES).
 * ============================================================================
 */
import { customRosterSlot } from './CustomFighter.js';

export const ROSTER = [
    {
        id: 'PEDRO', name: 'Pedro Pérez', tag: 'El vecino invicto',
        characterId: 'PEDRO', archetype: 'YUGO',
        rgb: [0.30, 0.55, 1.00], hex: '#4d8cff',
        story: 'Del gimnasio de la esquina al callejón. Empezó como boxeador; en el puerto aprendió las patadas de los savateros, en el suelo le enseñaron a cerrar sumisiones y, cuando la pelea se pone fea, saca la botella. Movilidad de sobra: el que se mueve, vive.',
        style: 'Boxeo → patadas → suelo → botella'
    },
    {
        id: 'JUAN', name: 'Juan García', tag: 'El que no se raja',
        characterId: 'JUAN', archetype: 'MUSASHI',
        rgb: [0.90, 0.35, 0.30], hex: '#e6594d',
        story: 'Del gremio de carniceros del mercado. No golpea: cuelga. Garfios, proyecciones y un remate que no perdona. Judo de base: lento de pies, imposible de levantar una vez que te tiene.',
        style: 'Lucha · garfios y proyecciones (judo)'
    },
    {
        id: 'JOSE', name: 'José López', tag: 'El de la esquina',
        characterId: null, archetype: 'MONTE',
        rgb: [0.95, 0.87, 0.55], hex: '#f2de8c',
        story: 'Bailarín de capoeira reconvertido a pelea callejera: gira, esquiva y solo golpea cuando ya estás donde antes no estabas. El más móvil de los ocho: saltos múltiples y cuadrupedia sin aviso.',
        style: 'Capoeira · movilidad extrema · saltos y cuadrupedia'
    },
    {
        id: 'MARIA', name: 'María González', tag: 'La que siempre llega',
        characterId: null, archetype: 'YUGO',
        rgb: [0.55, 0.55, 0.55], hex: '#8c8c8c',
        story: 'Ex bombera. Codos y rodillas en el clinch; quema el aire antes de quemarte. Donde ella llega, la pelea ya terminó.',
        style: 'Muay thai · clinch · golpeo ágil'
    },
    {
        id: 'JOHN', name: 'John Doe', tag: 'El desconocido que gana',
        characterId: null, archetype: 'MUSASHI',
        rgb: [0.15, 0.70, 0.45], hex: '#26b373',
        story: 'Nadie sabe de dónde sale. Del mercado de pulgas: palo, cuchillo y lo que encuentre. Distancia larga, cortes cortos. El vagabundo que convierte cualquier objeto en arma.',
        style: 'Kali · kenjutsu improvisado · arma blanca'
    },
    {
        id: 'JANE', name: 'Jane Doe', tag: 'La anónima de oro',
        characterId: null, archetype: 'MUSASHI',
        rgb: [0.55, 0.30, 0.85], hex: '#8c4dd9',
        story: 'Heredera de una escuela de lanzas de feria: la vara como estilo de espada, todo es alcance, todo es punta. Te ve antes de que la veas.',
        style: 'Lanza · vara (kenjutsu improvisado) · alcance'
    },
    {
        id: 'CARLOS', name: 'Carlos Ruiz', tag: 'El primo de la final',
        characterId: null, archetype: 'MUSASHI',
        rgb: [0.10, 0.45, 0.45], hex: '#1a7373',
        story: 'No sube al ring: te lleva al suelo y allí se queda. Judo de base, BJJ de oficio: cuanto más tiempo pasa, peor estás.',
        style: 'BJJ · judo · suelo y sumisión'
    },
    {
        id: 'ANA', name: 'Ana Torres', tag: 'La última en pie',
        characterId: null, archetype: 'MONTE',
        rgb: [0.95, 0.60, 0.15], hex: '#f29a26',
        story: 'Pintora de grafiti y peleadora de plaza: no tiene escuela, tiene instinto salvaje. Cada pelea inventa un movimiento nuevo: gira, salta y repta sin aviso.',
        style: 'Calle · improvisación · acrobacia'
    }
];

/**
 * Roster completo: los ocho + el peleador del jugador
 * (novena celda, con su nombre guardado en la máquina).
 * El peleador del jugador HEREDA el arquetipo del
 * estilo base que use: "un personaje del juego con
 * su nombre" también hereda de donde viene.
 */
export function fullRoster() {
    const custom = customRosterSlot();
    const base = custom.characterId !== 'CUSTOM'
        ? ROSTER.find((s) => s.characterId === custom.characterId)
        : null;
    custom.archetype = base ? base.archetype : null;
    return [...ROSTER, custom];
}

/** Devuelve un slot del roster por id (o el primero, por si tercia). */
export function rosterSlot(id) {
    return fullRoster().find(s => s.id === id) || ROSTER[0];
}

export default ROSTER;
