class TouchControls {
  constructor() {
    this.dpad = {
      up: false,
      down: false,
      left: false,
      right: false,
      upLeft: false,
      upRight: false,
      downLeft: false,
      downRight: false
    };
    this.buttons = {
      attack1: false,
      attack2: false,
      block: false,
      action: false
    };
  }

  updateDpad(direction, value) {
    if (this.dpad.hasOwnProperty(direction)) {
      this.dpad[direction] = value;
    }
  }

  updateButton(button, value) {
    if (this.buttons.hasOwnProperty(button)) {
      this.buttons[button] = value;
    }
  }

  /**
   * LA DIRECCION, Y POR QUE SE CALCULA ASI
   *
   * El bug de las diagonales venia de mezclar DOS esquemas en el mismo sitio.
   * El dpad tiene ocho banderas: las cuatro rectas (up/down/left/right) y las
   * cuatro diagonales con nombre (upLeft/upRight/downLeft/downRight). El
   * codigo anterior sumaba las ocho:
   *
   *     if (this.dpad.left)         vector.x -= 1;   // dedo a la izquierda
   *     if (this.dpad.upLeft)       vector.x -= 1;   // la misma diagonal OTRA VEZ
   *
   * Si la pantalla tactil marcaba a la vez `left` y `upLeft` - que es lo normal,
   * porque un dedo en la izquierda y otro arriba ES la diagonal arriba-izquierda -
   * la X valia -2 en vez de -1. Luego la normalizacion la dejaba en -1,41 en vez
   * de -0,71: **las diagonales salian el doble de largas que las rectas**, y el
   * personaje hacia la diagonal al doble de velocidad. No hacia diagonales
   * raras: hacia diagonales RARAS DE VERDAD.
   *
   * LA REGLA QUE SE APLICA
   *   Las cuatro rectas mandan. Si hay al menos una pulsada, la diagonal sale de
   *   combinar las que haya, y las banderas con nombre no se suman. Solo si no
   *   hay ninguna recta se mira si hay una diagonal con nombre puesta, que
   *   cubre el caso de un control que solo sepa dar diagonales.
   *
   *   Asi el resultado no depende de COMO se pulsó: dos dedos en izquierda y
   *   arriba, o una sola bandera `upLeft`, dan el mismo vector.
   */
  getMovementVector() {
    const vector = { x: 0, y: 0 };

    if (this.dpad.up) vector.y -= 1;
    if (this.dpad.down) vector.y += 1;
    if (this.dpad.left) vector.x -= 1;
    if (this.dpad.right) vector.x += 1;

    // Sin ninguna recta: se acepta una diagonal declarada. Antes esto se sumaba
    // SIEMPRE, que es justo lo que duplicaba el vector.
    if (vector.x === 0 && vector.y === 0) {
      if (this.dpad.upLeft) { vector.y -= 1; vector.x -= 1; }
      if (this.dpad.upRight) { vector.y -= 1; vector.x += 1; }
      if (this.dpad.downLeft) { vector.y += 1; vector.x -= 1; }
      if (this.dpad.downRight) { vector.y += 1; vector.x += 1; }
    }

    // Normalizar SOLO cuando hay dos ejes. La division por si misma ya parte
    // de un vector que vale 1 (una recta) o raiz(2) (una diagonal), asi que
    // con esto una diagonal mide lo mismo que una recta.
    if (vector.x !== 0 && vector.y !== 0) {
      const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
      vector.x /= length;
      vector.y /= length;
    }

    return vector;
  }

  getActiveButtons() {
    return Object.keys(this.buttons).filter(button => this.buttons[button]);
  }
}

export default TouchControls;
