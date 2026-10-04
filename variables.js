// ==========================================
// SANPABLERA ENGINE - DICCIONARIO MAESTRO
// ==========================================

// 1. Estados Biomecánicos (IK y Transiciones)
const STATES = {
    STANDING: 0,       // De pie / Neutro
    CROUCH: 1,         // Agachado / Cobertura baja
    GROUND_UP: 2,      // Suelo - Boca arriba
    GROUND_DOWN: 3,    // Suelo - Boca abajo
    KNEEL: 4,          // Una rodilla en el suelo
    QUAD: 5,           // Cuadrúpeda / Gato
    AIRBORNE: 6        // En el aire / Salto / Caída
};

// 2. Inputs Ultraligeros (Optimizado para bytes de red y mandos)
const INPUTS = {
    UP: "U",
    DOWN: "D",
    LEFT: "L",
    RIGHT: "R",
    PUNCH: "P",
    KICK: "K",
    SPECIAL: "S",
    GUARD: "G"         // Guardia / Defensa
};

// Exportar configuración si usas módulos (CommonJS)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { STATES, INPUTS };
}
