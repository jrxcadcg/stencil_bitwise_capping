// main.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';

let camera, scene, renderer, object, stats;
let planes, planeObjects, planeHelpers;
let clock;
let planes1, planes2, planes3;


let planeObjectPlanes = [];
const textureLoader = new THREE.TextureLoader();
const texture = textureLoader.load('/texture/crate_jpeg.jpg');
const params = {
  animate: true,
  planeX: { constant: 0, negated: false, displayHelper: false },
  planeY: { constant: 0, negated: false, displayHelper: false },
  planeZ: { constant: 0, negated: false, displayHelper: false }
};

//init();

function createPlaneStencilGroup(geometry, plane, renderOrder, offsetv) {
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
  mesh0.position.x = offsetv.x;
  mesh0.position.z = offsetv.z;
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
  mesh1.position.x = offsetv.x;
  mesh1.position.z = offsetv.z;

  group.add(mesh1);

  return group;
}

export default function init() {
  clock = new THREE.Clock();
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 1, 100);
  camera.position.set(0, 2, 10);

  scene.add(new THREE.AmbientLight(0xffffff, 1.5));

  const dirLight = new THREE.DirectionalLight(0xffffff, 3);
  dirLight.position.set(5, 10, 7.5);
  dirLight.castShadow = false;
  scene.add(dirLight);


  planes = [
    new THREE.Plane(new THREE.Vector3(-1, -1, 0), 0)
  ];

  planes1 = [
    new THREE.Plane(new THREE.Vector3(1, 1, 0), 0)
  ];

  planes2 = [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
  ];

  planes3 = [
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
  ];

  // planeHelpers 
  planeHelpers = planes.map(p => new THREE.PlaneHelper(p, 2, 0xffffff));
  planeHelpers.forEach(ph => {
    ph.visible = false;
    scene.add(ph);
  });


  const geometry = new THREE.CylinderGeometry(1, 1, 3.5, 100);

  object = new THREE.Group();
  scene.add(object);

  // Set up clip plane rendering for ALL groups
  planeObjects = [];
  planeObjectPlanes = [];
  const planeGeom = new THREE.PlaneGeometry(4, 4);

  const planeGroups = [{ planes: planes, colorHue: 0.0 },
  { planes: planes1, colorHue: 0.25 }];

  // renderOrder 
  let baseRenderOrder = 1;

  for (let g = 0; g < planeGroups.length; g++) {
    const set = planeGroups[g].planes;
    const hue = planeGroups[g].colorHue;
    let offsetv = new THREE.Vector3(set[0].normal.x * 0.5, 0, 0);

    for (let i = 0; i < set.length; i++) {

      const poGroup = new THREE.Group();
      let plane = set[i];
      const matrix = new THREE.Matrix4().makeTranslation(offsetv);
      plane.applyMatrix4(matrix);



      const stencilGroup = createPlaneStencilGroup(geometry, plane, baseRenderOrder + i, offsetv);


      const color = new THREE.Color().setHSL((hue + (i / Math.max(1, set.length)) * 0.05) % 1, 0.7, 0.55);


      const planeMat = new THREE.MeshStandardMaterial({

        map: texture,

        clippingPlanes: set.filter(p => p !== plane),
        stencilWrite: true,
        stencilRef: 0,
        stencilFunc: THREE.NotEqualStencilFunc,
        stencilFail: THREE.ReplaceStencilOp,
        stencilZFail: THREE.ReplaceStencilOp,
        stencilZPass: THREE.ReplaceStencilOp,
      });

      const po = new THREE.Mesh(planeGeom, planeMat);
      po.onAfterRender = function (renderer) {
        renderer.clearStencil();
      };

      po.renderOrder = baseRenderOrder + i + 0.1;
      po.position.x = offsetv.x
      po.position.z = offsetv.z
      object.add(stencilGroup);
      poGroup.add(po);
      planeObjects.push(po);
      planeObjectPlanes.push(plane);
      scene.add(poGroup);
    }

    const material = new THREE.MeshStandardMaterial({

      map: texture,

      clippingPlanes: set,
      clipShadows: false,
      shadowSide: THREE.DoubleSide,
    });

    const clippedColorFront = new THREE.Mesh(geometry, material);
    clippedColorFront.renderOrder = baseRenderOrder + set.length + 1;
    clippedColorFront.position.x = offsetv.x
    clippedColorFront.position.z = offsetv.z
    object.add(clippedColorFront);


    baseRenderOrder += set.length + 5;
  }


  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x263238);
  renderer.setAnimationLoop(animate);
  renderer.localClippingEnabled = true;
  document.body.appendChild(renderer.domElement);

  // Stats
  stats = new Stats();
  document.body.appendChild(stats.dom);

  window.addEventListener('resize', onWindowResize);

  // Controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.minDistance = 2;
  controls.maxDistance = 20;
  controls.update();


}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  document.getElementById('info').style.display = 'none';
  const delta = clock.getDelta();



  for (let i = 0; i < planeObjects.length; i++) {
    const plane = planeObjectPlanes[i];

    const po = planeObjects[i];
    if (plane && po) {
      plane.coplanarPoint(po.position);
      po.lookAt(
        po.position.x - plane.normal.x,
        po.position.y - plane.normal.y,
        po.position.z - plane.normal.z
      );
    }
  }

  stats.begin();
  renderer.render(scene, camera);
  stats.end();
}
