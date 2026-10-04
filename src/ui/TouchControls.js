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

  getMovementVector() {
    const vector = { x: 0, y: 0 };

    if (this.dpad.up) vector.y -= 1;
    if (this.dpad.down) vector.y += 1;
    if (this.dpad.left) vector.x -= 1;
    if (this.dpad.right) vector.x += 1;

    // Diagonal movement
    if (this.dpad.upLeft || this.dpad.downLeft) vector.x -= 1;
    if (this.dpad.upRight || this.dpad.downRight) vector.x += 1;

    // Normalize diagonal vectors
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
