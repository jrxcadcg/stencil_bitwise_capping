// main.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';

let camera, scene, renderer, stats;
let planes, planeObjects, planeHelpers;
let clock;
let modelsGroup; // A top-level group to hold all models

const params = {
  maxFPX: false,
  modelCount: 10,
  modelOffset: 1.2,       // Spacing between models (used for both Z columns and Y rows)
  modelsPerRow: 10,        // Number of models per row (arranged along the Z-axis), wraps to the Y-axis
  planeX: { constant: 0, negated: false, displayHelper: false }
};

// init();

/**
 * Generates or recreates all models.
 * Grid layout: Z-axis for columns, Y-axis for rows.
 * Wraps to the next row on the Y-axis if modelsPerRow is exceeded.
 */
function createModels() {
  // Clean up old models
  if (modelsGroup) scene.remove(modelsGroup);
  planeObjects = [];
  modelsGroup = new THREE.Group();
  scene.add(modelsGroup);

  // Shared resources
  const geometry = new THREE.TorusGeometry(0.4, 0.15, 1000, 1000); // Can also be SphereGeometry or TorusKnotGeometry
      // face
    let faceCount;
    if (geometry.index) {
        faceCount = geometry.index.count / 3;
    } else {
        faceCount = geometry.attributes.position.count / 3;
    }

    console.log('face:', faceCount);
  // const geometry = new THREE.TorusKnotGeometry(0.4, 0.15, 220, 600);
  // const geometry = new THREE.SphereGeometry(0.8, 64, 32);
  const planeGeom = new THREE.PlaneGeometry(4, 4);
  const plane = planes[0];

  // Calculate grid center offset
  const cols = Math.max(1, Math.floor(params.modelsPerRow)); // Number of columns per row (along Z-axis)
  const rows = Math.ceil(params.modelCount / cols);         // Number of rows (along Y-axis)
  const halfCols = (cols - 1) / 2;
  const halfRows = (rows - 1) / 2;

  for (let i = 0; i < params.modelCount; i++) {
    const modelContainer = new THREE.Group();

    // Grid index: col along Z-axis, row along Y-axis
    const row = Math.floor(i / cols);
    const col = i % cols;

    // Center placement: Z for column spacing, Y for row spacing
    modelContainer.position.z = (col - halfCols) * params.modelOffset;
    modelContainer.position.y = (row - halfRows) * params.modelOffset;


    // Generate a unique color for each model (body + cap)
    const hue = params.modelCount > 0 ? (i / params.modelCount) % 1 : 0;
    const bodyColor = new THREE.Color().setHSL(hue, 0.7, 0.55); // Main body color
    const capColor = bodyColor;                                 // Capping plane color
    const index = i % 8;
    const indexOrder = Math.floor(i / 8 + Number.EPSILON);

    // (1) Solid model -- this material writes to the stencil buffer
    const solidMat = new THREE.MeshStandardMaterial({
      color: bodyColor,
      metalness: 0.1,
      roughness: 0.75,
      clippingPlanes: planes,
      clipShadows: true,
      shadowSide: THREE.DoubleSide,
      side: THREE.DoubleSide,
      stencilWrite: true,
      stencilWriteMask: 1 << index,
      stencilRef: 1 << index,
      stencilFunc: THREE.AlwaysStencilFunc,
      stencilFail: THREE.InvertStencilOp,
      stencilZFail: THREE.InvertStencilOp,
      stencilZPass: THREE.InvertStencilOp,
    });

    const clippedColorFront = new THREE.Mesh(geometry, solidMat);
    clippedColorFront.castShadow = true;
    // Important: Make the solid model render before the capping plane
    clippedColorFront.renderOrder = indexOrder + 1.0;
    modelContainer.add(clippedColorFront);

    // (2) Capping plane -- this material is rendered only where the stencil buffer has been set
    const planeMat = new THREE.MeshStandardMaterial({
      color: capColor,
      metalness: 0.1,
      roughness: 0.75,
      clippingPlanes: [], // No clipping for the cap itself
      stencilWrite: true,
      stencilFuncMask: 1 << index,
      stencilRef: 1 << index,
      stencilFunc: THREE.EqualStencilFunc,
      stencilFail: THREE.KeepStencilOp,
      stencilZFail: THREE.KeepStencilOp,
      stencilZPass: THREE.KeepStencilOp,
      side: THREE.DoubleSide,
      // polygonOffset: true,
      // polygonOffsetFactor: -2.0, // Adjust as needed
      // polygonOffsetUnits: i      // Add a small offset for each instance
    });

    const po = new THREE.Mesh(planeGeom, planeMat);
    // Orient the capping plane to match the clipping plane's normal
    po.lookAt(new THREE.Vector3(1, 0, 0));
    console.log("index = ", index, "  i = ", i, "  indexOrder = ", indexOrder);
    po.renderOrder = indexOrder + 1.1;

    // After rendering the 8th object in a set, clear the stencil buffer
    if (index == 7) {
      po.renderOrder = indexOrder + 1.2;
      po.onAfterRender = (renderer) => renderer.clearStencil(); // Clear stencil
    }

    modelContainer.add(po);
    planeObjects.push(po);
    modelsGroup.add(modelContainer);
  }
}

export default function init() {
  document.getElementById('info').style.display = 'none';

  clock = new THREE.Clock();
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 1, 100);
  camera.position.set(20, 2, 2);

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const dirLight = new THREE.DirectionalLight(0xffffff, 3);
  dirLight.position.set(5, 10, 7.5);

  scene.add(dirLight);

  // Single clipping plane (facing -X direction, at x=0)
  planes = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0)];

  // Helpers
  planeHelpers = planes.map(p => new THREE.PlaneHelper(p, 5, 0xffffff));
  planeHelpers.forEach(h => {
    h.visible = false;
    scene.add(h);
  });

  // Initially create the models
  createModels();

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x263238);
  renderer.shadowMap.enabled = true;
  renderer.localClippingEnabled = true;
  document.body.appendChild(renderer.domElement);

  // Stats
  stats = new Stats();
  document.body.appendChild(stats.dom);

// 放大 2 倍，并固定到左上
const SCALE = 3; // 1.5~2.5 都行
Object.assign(stats.dom.style, {
  position: 'fixed',
  left: '400px',
  top: '100px',
  transform: `scale(${SCALE})`,
  transformOrigin: 'top left',
  zIndex: 9999
});
  // Controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.minDistance = 2;
  controls.maxDistance = 20;
  controls.update();

  // GUI
  const gui = new GUI();
  gui.add(params, 'maxFPX');
  gui.add(params, 'modelCount', 1, 1000, 1).name('Model Count').onChange(createModels);
  gui.add(params, 'modelOffset', 0, 3, 0.1).name('Model Offset').onChange(createModels);
  gui.add(params, 'modelsPerRow', 1, 50, 1).name('Models Per Row').onChange(createModels);

  const planeX = gui.addFolder('planeX');
  planeX.add(params.planeX, 'displayHelper').onChange(v => planeHelpers[0].visible = v);
  planeX.add(params.planeX, 'constant', -1, 1, 0.001).onChange(d => planes[0].constant = d);
  planeX.add(params.planeX, 'negated').onChange(() => {
    planes[0].negate();
    params.planeX.constant = planes[0].constant;
  });
  planeX.open();

  window.addEventListener('resize', onWindowResize);

  renderer.setAnimationLoop(animate);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  const delta = clock.getDelta();

  if (params.maxFPX) {
    requestAnimationFrame(animate);
  }

  // Make each capping plane follow the local plane of its container
  for (let i = 0; i < planeObjects.length; i++) {
    const po = planeObjects[i];
    const plane = planes[0];

    // Transform the global plane into the local coordinate system of po.parent (the model container)
    const inv = new THREE.Matrix4().copy(po.parent.matrixWorld).invert();
    const localPlane = plane.clone().applyMatrix4(inv);

    // Position the capping plane geometry on the local plane
    localPlane.coplanarPoint(po.position);
  }

  stats.begin();
  renderer.render(scene, camera);
  stats.end();
}