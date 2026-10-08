import TouchControls from './TouchControls.js';

class UI {
  constructor() {
    this.touchControls = new TouchControls();
    this.initUI();
  }

  initUI() {
    // El HUD de combate (barras de vida y recurso) vive en HUD.js. Aqui solo
    // se montan los controles tactiles.
    this.createDpad();
    this.createActionButtons();
  }

  createDpad() {
    // Create dpad container
    const dpadContainer = document.createElement('div');
    dpadContainer.id = 'dpad-container';
    dpadContainer.style.position = 'absolute';
    dpadContainer.style.bottom = '20px';
    dpadContainer.style.left = '20px';
    dpadContainer.style.width = '200px';
    dpadContainer.style.height = '200px';
    document.body.appendChild(dpadContainer);

    // Create dpad buttons
    const directions = ['up', 'down', 'left', 'right', 'upLeft', 'upRight', 'downLeft', 'downRight'];
    directions.forEach(direction => {
      const button = document.createElement('button');
      button.id = `dpad-${direction}`;
      button.style.position = 'absolute';
      button.style.width = '60px';
      button.style.height = '60px';
      button.style.borderRadius = '50%';
      button.style.backgroundColor = '#ccc';
      button.style.border = 'none';
      button.style.opacity = '0.7';
      button.style.cursor = 'pointer';

      // Position buttons
      switch (direction) {
        case 'up':
          button.style.top = '0';
          button.style.left = '70px';
          break;
        case 'down':
          button.style.bottom = '0';
          button.style.left = '70px';
          break;
        case 'left':
          button.style.top = '70px';
          button.style.left = '0';
          break;
        case 'right':
          button.style.top = '70px';
          button.style.right = '0';
          break;
        case 'upLeft':
          button.style.top = '0';
          button.style.left = '0';
          break;
        case 'upRight':
          button.style.top = '0';
          button.style.right = '0';
          break;
        case 'downLeft':
          button.style.bottom = '0';
          button.style.left = '0';
          break;
        case 'downRight':
          button.style.bottom = '0';
          button.style.right = '0';
          break;
      }

      // Add event listeners
      // Touch (movil) y pointer (raton/estilo). Son
      // idempotentes: si un dispositivo dispara ambos,
      // el estado final es el mismo.
      button.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.touchControls.updateDpad(direction, true);
        button.style.backgroundColor = '#999';
      });

      button.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.touchControls.updateDpad(direction, false);
        button.style.backgroundColor = '#ccc';
      });

      button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.touchControls.updateDpad(direction, true);
        button.style.backgroundColor = '#999';
      });

      button.addEventListener('pointerup', (e) => {
        e.preventDefault();
        this.touchControls.updateDpad(direction, false);
        button.style.backgroundColor = '#ccc';
      });

      button.addEventListener('pointercancel', (e) => {
        e.preventDefault();
        this.touchControls.updateDpad(direction, false);
        button.style.backgroundColor = '#ccc';
      });

      button.addEventListener('pointerleave', (e) => {
        // En raton: salir del boton con el boton pulsado
        // SUELTA (el dedo en movil ya lo hace con pointerup).
        if (e.pointerType === 'mouse' && e.buttons > 0) {
          this.touchControls.updateDpad(direction, false);
          button.style.backgroundColor = '#ccc';
        }
      });

      dpadContainer.appendChild(button);
    });
  }

  createActionButtons() {
    // Create action buttons container
    const actionButtonsContainer = document.createElement('div');
    actionButtonsContainer.id = 'action-buttons-container';
    actionButtonsContainer.style.position = 'absolute';
    actionButtonsContainer.style.bottom = '20px';
    actionButtonsContainer.style.right = '20px';
    actionButtonsContainer.style.width = '200px';
    actionButtonsContainer.style.height = '200px';
    document.body.appendChild(actionButtonsContainer);

    // Create action buttons
    const buttons = [
      { id: 'attack1', text: 'Attack 1' },
      { id: 'attack2', text: 'Attack 2' },
      { id: 'block', text: 'Block' },
      { id: 'action', text: 'Action' }
    ];

    buttons.forEach(buttonInfo => {
      const button = document.createElement('button');
      button.id = `action-${buttonInfo.id}`;
      button.textContent = buttonInfo.text;
      button.style.position = 'absolute';
      button.style.width = '80px';
      button.style.height = '80px';
      button.style.borderRadius = '50%';
      button.style.backgroundColor = '#ccc';
      button.style.border = 'none';
      button.style.opacity = '0.7';
      button.style.cursor = 'pointer';
      button.style.touchAction = 'none';

      // Position buttons
      switch (buttonInfo.id) {
        case 'attack1':
          button.style.top = '0';
          button.style.left = '0';
          break;
        case 'attack2':
          button.style.top = '0';
          button.style.right = '0';
          break;
        case 'block':
          button.style.bottom = '0';
          button.style.left = '0';
          break;
        case 'action':
          button.style.bottom = '0';
          button.style.right = '0';
          break;
      }

      // Add event listeners
      // Touch (movil) y pointer (raton/estilo). Idempotentes.
      button.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.touchControls.updateButton(buttonInfo.id, true);
        button.style.backgroundColor = '#999';
      });

      button.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.touchControls.updateButton(buttonInfo.id, false);
        button.style.backgroundColor = '#ccc';
      });

      button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.touchControls.updateButton(buttonInfo.id, true);
        button.style.backgroundColor = '#999';
      });

      button.addEventListener('pointerup', (e) => {
        e.preventDefault();
        this.touchControls.updateButton(buttonInfo.id, false);
        button.style.backgroundColor = '#ccc';
      });

      button.addEventListener('pointercancel', (e) => {
        e.preventDefault();
        this.touchControls.updateButton(buttonInfo.id, false);
        button.style.backgroundColor = '#ccc';
      });

      button.addEventListener('pointerleave', (e) => {
        if (e.pointerType === 'mouse' && e.buttons > 0) {
          this.touchControls.updateButton(buttonInfo.id, false);
          button.style.backgroundColor = '#ccc';
        }
      });

      actionButtonsContainer.appendChild(button);
    });
  }

  getMovementVector() {
    return this.touchControls.getMovementVector();
  }

  getActiveButtons() {
    return this.touchControls.getActiveButtons();
  }
}

export default UI;