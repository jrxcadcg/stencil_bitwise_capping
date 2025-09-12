// main.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';

let camera, scene, renderer, stats;
let planes, planeObjects, planeHelpers;
let clock;
let modelsGroup; // 顶层组，容纳所有模型

const params = {
  animate: true,
  modelCount: 18,
  modelOffset: 1.2,             // 行列间距（同时用于 Z 列间距与 Y 行间距）
  modelsPerRow: 8,             // 每行可放几个模型（沿 Z 排列），超过则沿 Y 换行
  planeX: { constant: 0, negated: false, displayHelper: false }
};

init();



// 生成/重建所有模型（网格排布：Z 为列，Y 为行；超过 modelsPerRow 沿 Y 换行）
function createModels() {
  // 清旧
  if (modelsGroup) scene.remove(modelsGroup);
  planeObjects = [];
  modelsGroup = new THREE.Group();
  scene.add(modelsGroup);

  // 共享资源
  const geometry = new THREE.TorusGeometry(0.4, 0.15, 2200, 600); // 也可换 Sphere/TorusKnot
// const geometry = new THREE.TorusKnotGeometry(0.4, 0.15, 220, 600); // 也可换 Sphere/TorusKnot
//  const geometry = new THREE.SphereGeometry(0.8, 64, 32);
  const planeGeom = new THREE.PlaneGeometry(4, 4);
  const plane = planes[0];

  // 计算网格居中偏移
  const cols = Math.max(1, Math.floor(params.modelsPerRow)); // 每行列数（沿 Z）
  const rows = Math.ceil(params.modelCount / cols);          // 行数（沿 Y）
  const halfCols = (cols - 1) / 2;
  const halfRows = (rows - 1) / 2;

  for (let i = 0; i < params.modelCount; i++) {
    const modelContainer = new THREE.Group();

    // 网格索引：col 沿 Z，row 沿 Y
    const row = Math.floor(i / cols);
    const col = i % cols;

    // 居中摆放：Z 为列间距，Y 为行间距
    modelContainer.position.z = (col - halfCols) * params.modelOffset;
    modelContainer.position.y = (row - halfRows) * params.modelOffset;

    // (1) 模板标记
    //const stencilGroup = createPlaneStencilGroup(geometry, plane, i + 1.05);
    //modelContainer.add(stencilGroup);

    // 为每个模型生成不同的颜色（主体 + 补面）
    const hue = params.modelCount > 0 ? (i / params.modelCount) % 1 : 0;
    const bodyColor = new THREE.Color().setHSL(hue, 0.7, 0.55);              // 主体颜色
    const capColor  = bodyColor;    // 补面互补色
    const index = i%8;
    const indexOrder = Math.floor(i / 8 + Number.EPSILON);

    // (2) 实体 —— 在本模型的 stencil 之后渲染
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
    // 关键：让实体在补面之前渲染
    clippedColorFront.renderOrder = indexOrder + 1.0;
    modelContainer.add(clippedColorFront);

    // (3) 补面 —— 在实体之后渲染（每个模型也给不同颜色，便于区分）
    const planeMat = new THREE.MeshStandardMaterial({
      color: capColor,
      metalness: 0.1,
      roughness: 0.75,
      clippingPlanes: [],
      stencilWrite: true,
      stencilFuncMask: 1 << index,
      stencilRef: 1 << index,
      stencilFunc: THREE.EqualStencilFunc,
      stencilFail: THREE.KeepStencilOp,
      stencilZFail: THREE.KeepStencilOp,
      stencilZPass: THREE.KeepStencilOp,
      side: THREE.DoubleSide,
     // polygonOffset: true,
     //polygonOffsetFactor: -2.0,   // 根据需要调节（通常是 1）
      //polygonOffsetUnits: i       // 每个 i 增加一点偏移
    });

    const po = new THREE.Mesh(planeGeom, planeMat);
    // 如果希望固定补面朝向，可保留；若想跟随局部平面法线，见 animate() 中注释的 lookAt
    po.lookAt(new THREE.Vector3(1, 0, 0));
console.log("index = ", index, "  i = ", i, "  indexOrder = ", indexOrder);
    if(index == 7)
    {
       
       po.renderOrder = indexOrder + 1.2;
        po.onAfterRender = (renderer) => renderer.clearStencil(); // 清模板
    }
    else
    {
        po.renderOrder = indexOrder + 1.1;
    }
   
   

    modelContainer.add(po);
    planeObjects.push(po);

    modelsGroup.add(modelContainer);
  }
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
  dirLight.shadow.camera.right = 4;
  dirLight.shadow.camera.left = -4;
  dirLight.shadow.camera.top = 4;
  dirLight.shadow.camera.bottom = -4;
  dirLight.shadow.mapSize.set(1024, 1024);
  scene.add(dirLight);

  // 单裁剪平面（-X 方向，x=0）
  planes = [ new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0) ];

  // helper
  planeHelpers = planes.map(p => new THREE.PlaneHelper(p, 5, 0xffffff));
  planeHelpers.forEach(h => { h.visible = false; scene.add(h); });

  // 初始生成模型
  createModels();

  // 渲染器
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

  // 控制器
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.minDistance = 2;
  controls.maxDistance = 20;
  controls.update();

  // GUI
  const gui = new GUI();
  gui.add(params, 'animate');
  gui.add(params, 'modelCount', 1, 1000, 1).name('Model Count').onChange(createModels);
  gui.add(params, 'modelOffset', 0, 3, 0.1).name('Model Offset').onChange(createModels);
  gui.add(params, 'modelsPerRow', 1, 50, 1).name('Models Per Row').onChange(createModels); // 新增 GUI 控件

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

  if (params.animate && modelsGroup) {
    // 可选：整体旋转看看效果
    // modelsGroup.rotation.y += delta * 0.2;
  }

  // 让每个补面跟随自身容器的局部平面
  for (let i = 0; i < planeObjects.length; i++) {
    const po = planeObjects[i];
    const plane = planes[0];

    // 将全局平面转换到 po.parent（模型容器）的局部坐标系
    const inv = new THREE.Matrix4().copy(po.parent.matrixWorld).invert();
    const localPlane = plane.clone().applyMatrix4(inv);

    localPlane.coplanarPoint(po.position);
    // 如果希望补面法线实时对齐局部平面法线，解开下面注释
    // po.lookAt(
    //   po.position.x - localPlane.normal.x,
    //   po.position.y - localPlane.normal.y,
    //   po.position.z - localPlane.normal.z
    // );
  }
  //requestAnimationFrame(animate);
  stats.begin();
  renderer.render(scene, camera);
  stats.end();
}
