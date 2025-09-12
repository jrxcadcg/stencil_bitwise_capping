import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';

let camera, scene, renderer, stats;
let object;                 // 包含模型与剖切相关 mesh 的组
let planes, planeObjects;   // planes: THREE.Plane[]; planeObjects: 平面可视化 Mesh[]
let planeHelpers;           // THREE.PlaneHelper[]
let clock;

const params = {
  animate: true,
  planeX: { constant: 0, negated: false, displayHelper: false },
  planeY: { constant: 0, negated: false, displayHelper: false },
  planeZ: { constant: 0, negated: false, displayHelper: false }
};

init();

function createPlaneStencilGroup(geometry, plane, renderOrder) {
  const group = new THREE.Group();

  // 基础模板材质（不写深度、不写颜色，只写模板）
  const baseMat = new THREE.MeshBasicMaterial();
  baseMat.depthWrite = false;
  baseMat.depthTest = false;
  baseMat.colorWrite = false;
  baseMat.stencilWrite = true;
  baseMat.stencilFunc = THREE.AlwaysStencilFunc;

  // 背面：模板 ++
  const matBack = baseMat.clone();
  matBack.side = THREE.BackSide;
  matBack.clippingPlanes = [plane];
  matBack.stencilFail = THREE.IncrementWrapStencilOp;
  matBack.stencilZFail = THREE.IncrementWrapStencilOp;
  matBack.stencilZPass = THREE.IncrementWrapStencilOp;

  const meshBack = new THREE.Mesh(geometry, matBack);
  meshBack.renderOrder = renderOrder;
  group.add(meshBack);

  // 正面：模板 --
  const matFront = baseMat.clone();
  matFront.side = THREE.FrontSide;
  matFront.clippingPlanes = [plane];
  matFront.stencilFail = THREE.DecrementWrapStencilOp;
  matFront.stencilZFail = THREE.DecrementWrapStencilOp;
  matFront.stencilZPass = THREE.DecrementWrapStencilOp;

  const meshFront = new THREE.Mesh(geometry, matFront);
  meshFront.renderOrder = renderOrder;
  group.add(meshFront);

  return group;
}

function init() {
  clock = new THREE.Clock();

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 1, 100);
  camera.position.set(2, 2, 2);

  // 光照
  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const dirLight = new THREE.DirectionalLight(0xffffff, 3);
  dirLight.position.set(5, 10, 7.5);
  dirLight.castShadow = true;
  dirLight.shadow.camera.right = 2;
  dirLight.shadow.camera.left = -2;
  dirLight.shadow.camera.top = 2;
  dirLight.shadow.camera.bottom = -2;
  dirLight.shadow.mapSize.set(1024, 1024);
  scene.add(dirLight);

  // 三个裁剪平面（与官方示例一致：法线朝 -X/-Y/-Z）
  planes = [
    new THREE.Plane(new THREE.Vector3(-1,  0,  0), 0), // planeX
    new THREE.Plane(new THREE.Vector3( 0, -1,  0), 0), // planeY
    new THREE.Plane(new THREE.Vector3( 0,  0, -1), 0)  // planeZ
  ];

  // 可视化 helper（默认隐藏）
  planeHelpers = planes.map(p => new THREE.PlaneHelper(p, 2, 0xffffff));
  planeHelpers.forEach(ph => {
    ph.visible = false;
    scene.add(ph);
  });

  // 模型
  const geometry = new THREE.TorusKnotGeometry(0.4, 0.15, 220, 60);
  object = new THREE.Group();
  scene.add(object);

  // —— 设置剖切渲染相关 —— //
  planeObjects = [];
  const planeGeom = new THREE.PlaneGeometry(4, 4);

  for (let i = 0; i < 3; i++) {
    const plane = planes[i];

    // 模板缓冲控制的“包围几何体”
    const stencilGroup = createPlaneStencilGroup(geometry, plane, i + 1);
    object.add(stencilGroup);

    // 剖切面（被另外两个平面裁掉），并用模板值决定显隐
    const planeMat = new THREE.MeshStandardMaterial({
      color: 0xE91E63,
      metalness: 0.1,
      roughness: 0.75,
      clippingPlanes: planes.filter(p => p !== plane),
      // 模板：只在模板值 != 0 时渲染（形成实体截面）
      stencilWrite: true,
      stencilRef: 0,
      stencilFunc: THREE.NotEqualStencilFunc,
      stencilFail: THREE.ReplaceStencilOp,
      stencilZFail: THREE.ReplaceStencilOp,
      stencilZPass: THREE.ReplaceStencilOp,
      side: THREE.DoubleSide
    });

    const po = new THREE.Mesh(planeGeom, planeMat);
    po.renderOrder = i + 1.1;
    po.onAfterRender = function (renderer) {
      renderer.clearStencil(); // 每次画完剖切面清理模板
    };

    // 放入一个 group 方便对齐
    const poGroup = new THREE.Group();
    poGroup.add(po);
    scene.add(poGroup);

    planeObjects.push(po);
  }

  // 被裁剪的“彩色实体”
  const solidMat = new THREE.MeshStandardMaterial({
    color: 0xFFC107,
    metalness: 0.1,
    roughness: 0.75,
    clippingPlanes: planes,
    clipShadows: true,
    shadowSide: THREE.DoubleSide
  });
  const clippedColorFront = new THREE.Mesh(geometry, solidMat);
  clippedColorFront.castShadow = true;
  clippedColorFront.renderOrder = 6;
  object.add(clippedColorFront);

  // 地面接收阴影
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 9, 1, 1),
    new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.25, side: THREE.DoubleSide })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1;
  ground.receiveShadow = true;
  scene.add(ground);

  // 渲染器（必须开启 stencil）
  renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x263238);
  renderer.shadowMap.enabled = true;
  renderer.localClippingEnabled = true; // 允许本地裁剪
  document.body.appendChild(renderer.domElement);

  // Stats
  stats = new Stats();
  document.body.appendChild(stats.dom);

  // OrbitControls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.minDistance = 2;
  controls.maxDistance = 20;
  controls.update();

  // GUI（与原示例一致）
  const gui = new GUI();
  gui.add(params, 'animate');

  const planeX = gui.addFolder('planeX');
  planeX.add(params.planeX, 'displayHelper').onChange(v => planeHelpers[0].visible = v);
  planeX.add(params.planeX, 'constant', -1, 1).onChange(d => planes[0].constant = d);
  planeX.add(params.planeX, 'negated').onChange(() => {
    planes[0].negate();
    params.planeX.constant = planes[0].constant;
  });
  planeX.open();

  const planeY = gui.addFolder('planeY');
  planeY.add(params.planeY, 'displayHelper').onChange(v => planeHelpers[1].visible = v);
  planeY.add(params.planeY, 'constant', -1, 1).onChange(d => planes[1].constant = d);
  planeY.add(params.planeY, 'negated').onChange(() => {
    planes[1].negate();
    params.planeY.constant = planes[1].constant;
  });
  planeY.open();

  const planeZ = gui.addFolder('planeZ');
  planeZ.add(params.planeZ, 'displayHelper').onChange(v => planeHelpers[2].visible = v);
  planeZ.add(params.planeZ, 'constant', -1, 1).onChange(d => planes[2].constant = d);
  planeZ.add(params.planeZ, 'negated').onChange(() => {
    planes[2].negate();
    params.planeZ.constant = planes[2].constant;
  });
  planeZ.open();

  // 事件
  window.addEventListener('resize', onWindowResize);

  // 动画循环
  renderer.setAnimationLoop(animate);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  const delta = clock.getDelta();

  if (params.animate) {
    object.rotation.x += delta * 0.5;
    object.rotation.y += delta * 0.2;
  }

  // 让剖切面 Mesh 始终贴在对应平面上、朝向法线
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
//setInterval(animate, 1);