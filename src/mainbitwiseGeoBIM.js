// main.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';

const manager = new THREE.LoadingManager();
let camera, scene, renderer, stats;
let planes, planeHelpers;
let clock;
let modelsGroup;          // 顶层组，容纳所有模型
let object;               // 若需要单模型替换时使用（此例批量加载不再用）

// ✅ 剖切/补面相关的全局
let slicePlane;           // 剖切用平面（x = constant）
let sliceHelper;          // 平面辅助显示
const planeCaps = [];     // 记录补面，方便清理/隐藏

// 你给定的剖切中心
const SLICE_CENTER = { x: -247330.90625, y: 224444.83984375, z: 13011.81396484375 };

const params = {
  animate: true,
  modelCount: 18,
  modelOffset: 1.2,
  modelsPerRow: 8,
  planeX: { constant: 0, negated: false, displayHelper: false }
};

// const assets = [
//   'DZ_2','DZ_21','DZ_22','DZ_23',
//   'DZ_24','DZ_25','DZ_26','DZ_27',
//   'DZ_28','DZ_29','DZ_210','DZ_213',
//   'DZ_214','DZ_215','DZ_216',
//   'DZ_217','DZ_218'
// ];
const assets = [
  'M_SiQiao_TZQK1_1',
  'M_SiQiao_TZQK1_2',
  'M_SiQiao_TZQK1_3',
  'M_SiQiao_TZQK2_1',
  'M_SiQiao_TZQK2_2',
  'M_SiQiao_TZQK3',
  'M_SiQiao_TZQK4',
  'M_SiQiao_TZQK2_4'
];

init();

// ----------------- 剖切 + 补面（按 X 轴，从 SLICE_CENTER.x 处） -----------------
/**
 * 按给定中心（SLICE_CENTER.x）做 X 轴方向剖切，并为每个 Mesh 生成同色补面。
 * @param {THREE.Group} modelsGroup - 需要剖切的模型父组（已装载FBX们）
 * @param {{x:number,y:number,z:number}} SLICE_CENTER - 切面的中心坐标（只用 x）
 * @param {THREE.WebGLRenderer} renderer - 需 {stencil:true}, 并已开启 localClippingEnabled
 * @param {THREE.Scene} scene - 仅用于辅助 PlaneHelper（可选）
 */
function sliceGroupWithCaps(modelsGroup, SLICE_CENTER, renderer, scene) {
  if (!modelsGroup) return;

  // 1) 计算整体包围盒，用来给补面定尺寸/位置
  const bbox = new THREE.Box3().setFromObject(modelsGroup);
  const size = bbox.getSize(new THREE.Vector3());
  const center = bbox.getCenter(new THREE.Vector3());

  // 2) 在 x = SLICE_CENTER.x 处放一张法线指向 +X 的裁剪平面
  //    平面方程：x + constant = 0  =>  x = -constant
  const x0 = SLICE_CENTER.x;
  slicePlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), -x0);
  
  // （可选）可视化切面
  //if (sliceHelper) scene.remove(sliceHelper);
  //sliceHelper = new THREE.PlaneHelper(slicePlane, size.length(), 0xff6677);
  
  //if (scene) scene.add(sliceHelper);

  // 3) 清理旧补面（如果之前调用过）
  planeCaps.forEach(m => { if (m.parent) m.parent.remove(m); });
  planeCaps.length = 0;

  // 4) 遍历所有 Mesh：设置裁剪 + 模板写入；并创建与之同色的补面
  //    做法与你“createModels”里的一致：实体写模板，补面按模板 Equal 渲染
  let meshIndex = 0;
  modelsGroup.traverse(obj => {
    if (!obj.isMesh) return;

    // ---- 4.1 为实体 Mesh 配置裁剪与模板写入 ----
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const bit = meshIndex % 8;                // 0..7 循环使用 8 个bit
    const bucket = Math.floor(meshIndex / 8); // 分批控制 renderOrder
    const entityRenderOrder = bucket + 1.0;

    mats.forEach(mat => {
      if (!mat) return;
      // 保留原材质的颜色/贴图，仅叠加裁剪与模板设置
      mat.clippingPlanes = [slicePlane];
      mat.clipShadows   = true;
      mat.side          = THREE.DoubleSide;

      // 模板写入（与你示例一致）
      mat.stencilWrite      = true;
      mat.stencilWriteMask  = (1 << bit);
      mat.stencilRef        = (1 << bit);
      mat.stencilFunc       = THREE.AlwaysStencilFunc;
      mat.stencilFail       = THREE.InvertStencilOp;
      mat.stencilZFail      = THREE.InvertStencilOp;
      mat.stencilZPass      = THREE.InvertStencilOp;

      mat.needsUpdate = true;
    });

    obj.renderOrder = entityRenderOrder;

    // ---- 4.2 创建补面：同色材质 + 按模板 Equal 渲染 ----
    // 取一个代表色（若有多材质，取第一个的 color；若没有 color，就给个灰色）
    const sampleMat = mats[0];
        const hue =  (meshIndex / 8) 
        const bodyColor = new THREE.Color().setHSL(hue, 0.7, 0.55);              // 主体颜色
        const capColor  = bodyColor;    // 补面互补色
    // const capColor = (sampleMat && sampleMat.color)
    //   ? sampleMat.color.clone()
    //   : new THREE.Color(0x888888);

    const capMat = new THREE.MeshStandardMaterial({
      color: capColor,
      metalness: 0.1,
      roughness: 0.75,
      side: THREE.DoubleSide,
      // 补面本身不再裁剪（只由模板限定可见区域）
      clippingPlanes: [],
      // 模板测试：只在该 mesh 的“切割轮廓”处显示
      stencilWrite: true,
      stencilFuncMask: (1 << bit),
      stencilRef: (1 << bit),
      stencilFunc: THREE.EqualStencilFunc,
      stencilFail: THREE.KeepStencilOp,
      stencilZFail: THREE.KeepStencilOp,
      stencilZPass: THREE.KeepStencilOp
    });

    // 补面的平面几何：足够覆盖整个 YZ 范围
    const capSize = Math.hypot(size.y, size.z) * 1.5;
    const capGeom = new THREE.PlaneGeometry(capSize, capSize);

    const cap = new THREE.Mesh(capGeom, capMat);
    // 位置：x = x0，y/z 放在整体中心即可（只要足够大就能覆盖所有交线）
    cap.position.set(x0, center.y, center.z);
    // 让法线朝 +X（PlaneGeometry 默认法线 +Z；用 lookAt 让 +Z 指向 +X）
    //cap.lookAt(new THREE.Vector3(1, 0, 0));
    cap.rotateY(-3.14159/2)
    //cap.scale.y=0.05
    // 渲染顺序：保证“实体先、补面后”
    cap.renderOrder = bucket + 1.1;

    // 每 8 个 mesh 清一次模板，避免积累（与示例一致）
    if (bit === 7) {
      cap.onAfterRender = (renderer) => renderer.clearStencil();
      cap.renderOrder = bucket + 1.2;
    }

    // 放到与模型同一父组下
    modelsGroup.add(cap);
    planeCaps.push(cap);

    meshIndex++;
  });
}

// ----------------- 相机对焦 -----------------
function fitCameraToObject(camera, object, controls, fitOffset = 1.2) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const maxSize = Math.max(size.x, size.y, size.z);
  const fov = THREE.MathUtils.degToRad(camera.fov);
  let distance = (maxSize / 2) / Math.tan(fov / 2);
  distance *= fitOffset;

  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  camera.position.copy(center).add(dir.multiplyScalar(-distance));

  camera.near = Math.max(0.1, distance / 100);
  camera.far  = distance * 100;
  camera.updateProjectionMatrix();

  if (controls) {
    controls.target.copy(center);
    controls.update();
  }
}

// ----------------- 批量加载：把所有 FBX 放入 modelsGroup（保持原始坐标） -----------------
function loadAllAssets(camera, controls) {
  const loader = new FBXLoader(manager);

  // 先清空旧的 modelsGroup
  if (modelsGroup) {
    scene.remove(modelsGroup);
    // 清理旧资源
    modelsGroup.traverse((child) => {
      if (child.isMesh) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(m => { if (m && m.map) m.map.dispose(); if (m) m.dispose(); });
      }
      if (child.geometry) child.geometry.dispose();
    });
  }

  modelsGroup = new THREE.Group();
  scene.add(modelsGroup);

  let loaded = 0;

  assets.forEach((name) => {
    loader.load(`src/models/bim/${name}.fbx`, (group) => {
      // 基本设置
      group.traverse(child => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      // 若 FBX 坐标系是 Z 向上，可统一转一下
      group.rotateX(-Math.PI / 2);

      // 标记（如果后续要筛选/管理）
      group.userData.isMyModel = true;

      // 保持原始坐标
      modelsGroup.add(group);

      loaded++;

      // 打印整体中心（可选）
      const box = new THREE.Box3().setFromObject(modelsGroup);
      const center = box.getCenter(new THREE.Vector3());
      console.log("整体中心坐标:", center);

      // 全部加载完 → 让相机框住整体 + 剖切补面
      if (loaded === assets.length) {
        fitCameraToObject(camera, modelsGroup, controls, 1.5);
        sliceGroupWithCaps(modelsGroup, SLICE_CENTER, renderer, scene);
      }
    }, undefined, (err) => {
      console.error(`加载失败: ${name}.fbx`, err);

      // 即便失败也计数，避免相机永远不对焦
      loaded++;
      if (loaded === assets.length) {
        fitCameraToObject(camera, modelsGroup, controls, 1.5);
        sliceGroupWithCaps(modelsGroup, SLICE_CENTER, renderer, scene);
      }
    });
  });
}

// ----------------- 初始化/循环 -----------------
function init() {
  clock = new THREE.Clock();
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 1, 1000);
  camera.position.set(2, 2, 2);

  // 灯光
  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const dirLight = new THREE.DirectionalLight(0xffffff, 3);
  dirLight.position.set(5, 10, 7.5);
  dirLight.castShadow = true;
  dirLight.shadow.camera.right = 4;
  dirLight.shadow.camera.left = -4;
  dirLight.shadow.camera.top = 4;
  dirLight.shadow.camera.bottom = -4;
  dirLight.shadow.mapSize.set(1024, 1024);
  scene.add(dirLight);

  // 单裁剪平面（你的 GUI 演示用；不影响我们的剖切逻辑）
  planes = [ new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0) ];
  planeHelpers = planes.map(p => new THREE.PlaneHelper(p, 5, 0xffffff));
  planeHelpers.forEach(h => { h.visible = false; scene.add(h); });

  // 渲染器
  renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x263238);
  renderer.shadowMap.enabled = true;
  renderer.localClippingEnabled = true; // ✅ 必须打开
  document.body.appendChild(renderer.domElement);

  // Stats
  stats = new Stats();
  document.body.appendChild(stats.dom);

  // 轨道控制
  const controls = new OrbitControls(camera, renderer.domElement);

  // 批量加载所有 FBX，并在全部完成后自动对焦 + 剖切补面
  loadAllAssets(camera, controls);

  // GUI（可选）
  const gui = new GUI();
  gui.add(params, 'animate');
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
    // modelsGroup.rotation.y += delta * 0.2;
  }

  stats.begin();
  renderer.render(scene, camera);
  stats.end();
}
