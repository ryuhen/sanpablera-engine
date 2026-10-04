import UI from '../ui/UI.js';
// Create loading screen
const loadingScreenDiv = document.createElement('div');
loadingScreenDiv.style.position = 'absolute';
loadingScreenDiv.style.top = '0';
loadingScreenDiv.style.left = '0';
loadingScreenDiv.style.width = '100%';
loadingScreenDiv.style.height = '100%';
loadingScreenDiv.style.backgroundColor = '#000';
loadingScreenDiv.style.display = 'flex';
loadingScreenDiv.style.flexDirection = 'column';
loadingScreenDiv.style.justifyContent = 'center';
loadingScreenDiv.style.alignItems = 'center';
loadingScreenDiv.style.color = '#fff';
loadingScreenDiv.style.fontFamily = 'Arial, sans-serif';
loadingScreenDiv.style.fontSize = '24px';
document.body.appendChild(loadingScreenDiv);

const loadingText = document.createElement('div');
loadingText.textContent = 'Loading...';
loadingScreenDiv.appendChild(loadingText);

const progressBarContainer = document.createElement('div');
progressBarContainer.style.width = '80%';
progressBarContainer.style.height = '30px';
progressBarContainer.style.backgroundColor = '#333';
progressBarContainer.style.borderRadius = '5px';
progressBarContainer.style.marginTop = '20px';
loadingScreenDiv.appendChild(progressBarContainer);

const progressBar = document.createElement('div');
progressBar.style.width = '0%';
progressBar.style.height = '100%';
progressBar.style.backgroundColor = '#4CAF50';
progressBar.style.borderRadius = '5px';
progressBarContainer.appendChild(progressBar);

const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true);

// Create scene
const scene = new BABYLON.Scene(engine);

// 1. Habilitar el motor de físicas de Babylon (usando CannonJS o el motor nativo de físicas)
const gravityVector = new BABYLON.Vector3(0, -9.81, 0);
scene.enablePhysics(gravityVector, new BABYLON.CannonJSPlugin());

// 2. Crear una cámara y controles
const camera = new BABYLON.ArcRotateCamera("Camera", Math.PI / 2, Math.PI / 3, 6, BABYLON.Vector3.Zero(), scene);
camera.attachControl(canvas, true);

// 3. Añadir luz
const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);

// 4. Crear el suelo (Escenario)
const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 10, height: 10 }, scene);
// Añadir físicas estáticas al suelo para que actúe como tope
ground.physicsImpostor = new BABYLON.PhysicsImpostor(
    ground,
    BABYLON.PhysicsImpostor.BoxImpostor,
    { mass: 0, restitution: 0.9 },
    scene
);

// Material opcional para diferenciar el suelo del objeto
const groundMaterial = new BABYLON.StandardMaterial("groundMat", scene);
groundMaterial.diffuseColor = new BABYLON.Color3(0.3, 0.3, 0.3);
ground.material = groundMaterial;

// 5. Crear el objeto (cubo inicial que luego reemplazaremos por el muñeco)
const box = BABYLON.MeshBuilder.CreateBox("box", { size: 1.5 }, scene);
box.position.y = 4; // Lo colocamos flotando para que caiga al suelo por gravedad

// Añadir físicas dinámicas al cubo (con masa para que caiga y colisione)
box.physicsImpostor = new BABYLON.PhysicsImpostor(
    box,
    BABYLON.PhysicsImpostor.BoxImpostor,
    { mass: 1, restitution: 0.2 },
    scene
);

// Initialize UI
const ui = new UI();

// Update progress bar
let progress = 0;
const updateProgress = () => {
    progress += 10;
    progressBar.style.width = `${progress}%`;
    if (progress < 100) {
        setTimeout(updateProgress, 100);
    } else {
        loadingScreenDiv.style.display = 'none';
    }
};

// Start progress bar
updateProgress();

// Bucle de renderizado
engine.runRenderLoop(() => {
    scene.render();

    // Update box position based on touch controls
    const movementVector = ui.getMovementVector();
    if (movementVector.x !== 0 || movementVector.y !== 0) {
        box.position.x += movementVector.x * 0.1;
        box.position.z += movementVector.y * 0.1;
    }

    // Handle button actions
    const activeButtons = ui.getActiveButtons();
    if (activeButtons.includes('attack1')) {
        console.log('Attack 1 pressed');
    }
    if (activeButtons.includes('attack2')) {
        console.log('Attack 2 pressed');
    }
    if (activeButtons.includes('block')) {
        console.log('Block pressed');
    }
    if (activeButtons.includes('action')) {
        console.log('Action pressed');
    }
});

// Ajustar tamaño al rotar pantalla
window.addEventListener("resize", () => {
    engine.resize();
});
