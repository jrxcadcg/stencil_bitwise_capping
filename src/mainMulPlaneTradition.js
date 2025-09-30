// main.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';

let camera, scene, renderer, object, stats;
let planes = [], planeObjects = [];
let clock;
let count1 = 50; 
const params = { maxFPX: false };

function generateArcPlanes({
  count = 10,
  radius = 1,
  startAngle = -Math.PI / 2, 
  endAngle = Math.PI / 2
} = {}) {
  const result = [];
  for (let i = 0; i < count; i++) {
    const t = (count === 1)
      ? (startAngle + endAngle) * 0.5
      : startAngle + (endAngle - startAngle) * (i / (count - 1));
    const point = new THREE.Vector3(
      radius * Math.cos(t), 0, radius * Math.sin(t)
    );
    const normal = point.clone().negate().normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
    result.push(plane);
  }
  return result;
}

function createPlaneStencilGroup(geometry, plane, renderOrder) {
  const group = new THREE.Group();
  const baseMat = new THREE.MeshBasicMaterial();
  baseMat.depthWrite = false;
  baseMat.depthTest = false;
  baseMat.colorWrite = false;
  baseMat.stencilWrite = true;
  baseMat.stencilFunc = THREE.AlwaysStencilFunc;

  // back faces
  const mat0 = baseMat.clone();
  mat0.side = THREE.BackSide;
  mat0.clippingPlanes = [plane];
  mat0.stencilFail = THREE.IncrementWrapStencilOp;
  mat0.stencilZFail = THREE.IncrementWrapStencilOp;
  mat0.stencilZPass = THREE.IncrementWrapStencilOp;

  const mesh0 = new THREE.Mesh(geometry, mat0);
  mesh0.renderOrder = renderOrder;
  mesh0.rotateZ(-Math.PI / 2);
  group.add(mesh0);

  // front faces
  const mat1 = baseMat.clone();
  mat1.side = THREE.FrontSide;
  mat1.clippingPlanes = [plane];
  mat1.stencilFail = THREE.DecrementWrapStencilOp;
  mat1.stencilZFail = THREE.DecrementWrapStencilOp;
  mat1.stencilZPass = THREE.DecrementWrapStencilOp;

  const mesh1 = new THREE.Mesh(geometry, mat1);
  mesh1.renderOrder = renderOrder;
  mesh1.rotateZ(-Math.PI / 2);
  group.add(mesh1);

  return group;
}

//init();

export default function init() {
  document.getElementById('info').style.display = 'none';
  clock = new THREE.Clock();
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 1, 100);
  camera.position.set(4, 4, 4);


  scene.add(new THREE.AmbientLight(0xffffff, 1.25));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
  dirLight.position.set(5, 10, 7.5);
  scene.add(dirLight);

  object = new THREE.Group();
  scene.add(object);


  renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x263238);
  renderer.setAnimationLoop(animate);
  renderer.localClippingEnabled = true; 
  document.body.appendChild(renderer.domElement);

  stats = new Stats();
  document.body.appendChild(stats.dom);

  const SCALE = 3;
  Object.assign(stats.dom.style, {
    position: 'fixed',
    left: '400px',
    top: '100px',
    transform: `scale(${SCALE})`,
    transformOrigin: 'top left',
    zIndex: 9999
  });
  window.addEventListener('resize', onWindowResize);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.minDistance = 2;
  controls.maxDistance = 20;
  controls.update();

  // GUI 
  const gui = new GUI();
  gui.add(params, 'maxFPX');
  gui.add({ planeCount: count1 }, 'planeCount', 1, 1000, 1)
    .name('planes number')
    .onFinishChange((v) => {
      count1 = v | 0;
      rebuildClipping();
    });


  rebuildClipping();
}

function rebuildClipping() {

  planeObjects.forEach(po => po.parent?.remove(po));
  planeObjects = [];
  object.clear();

  planes = generateArcPlanes({ count: count1, radius: 1 });


  const geometry = new THREE.CylinderGeometry(0.9, 0.9, 4, 1000);
  // face
  let faceCount;
  if (geometry.index) {
    faceCount = geometry.index.count / 3;
  } else {
    faceCount = geometry.attributes.position.count / 3;
  }

  console.log('face:', faceCount);

  const planeGeom = new THREE.PlaneGeometry(4, 4);
  for (let i = 0; i < count1; i++) {
    const poGroup = new THREE.Group();
    const plane = planes[i];
    const stencilGroup = createPlaneStencilGroup(geometry, plane, i + 1);

    const color = new THREE.Color().setHSL((i / count1), 1, 0.55);

    const planeMat = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.1,
      roughness: 0.75,
      clippingPlanes: planes.filter(p => p !== plane),
      stencilWrite: true,
      stencilRef: 0,
      stencilFunc: THREE.NotEqualStencilFunc,
      stencilFail: THREE.ReplaceStencilOp,
      stencilZFail: THREE.ReplaceStencilOp,
      stencilZPass: THREE.ReplaceStencilOp
  
    });

    const po = new THREE.Mesh(planeGeom, planeMat);
    po.onAfterRender = function (renderer) { renderer.clearStencil(); };
    po.renderOrder = i + 1.1;

    object.add(stencilGroup);
    poGroup.add(po);
    planeObjects.push(po);
    scene.add(poGroup);
  }


  const material = new THREE.MeshStandardMaterial({
    color: 0xFFC107,
    metalness: 0.1,
    roughness: 0.75,
    clippingPlanes: planes

  });
  const clipped = new THREE.Mesh(geometry, material);
  clipped.rotateZ(-Math.PI / 2);
  clipped.renderOrder = count1 + 2;
  object.add(clipped);
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

  for (let i = 0; i < planeObjects.length; i++) {
    const plane = planes[i];
    const po = planeObjects[i];
    plane.coplanarPoint(po.position);
    po.lookAt(
      po.position.x - plane.normal.x,
      po.position.y - plane.normal.y,
      po.position.z - plane.normal.z
    );
  }

  stats.begin();
  renderer.render(scene, camera);
  stats.end();
}
