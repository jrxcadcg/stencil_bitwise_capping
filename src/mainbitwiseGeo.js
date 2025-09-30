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
let modelsGroup;                 // 顶层组，容纳所有模型

// ✅ 剖切/补面相关
let slicePlane;                  // 世界空间剖切平面（x = constant）
let sliceHelper;                 // 可视化
const planeCaps = [];            // 记录补面，便于清理

// 你的切面中心
const SLICE_CENTER = { x: -247330.90625, y: 224444.83984375, z: 13011.81396484375 };

const params = {
  animate: true,
  modelCount: 18,
  modelOffset: 1.2,
  modelsPerRow: 8,
  planeX: { constant: 0, negated: false, displayHelper: false },
  capsVisible: true,      // ✅ 补面显隐
  sliceEnabled: true      // ✅ 剖切开关
};

const assets = [
  'DZ_2','DZ_21','DZ_22','DZ_23',
  'DZ_24','DZ_25','DZ_26','DZ_27',
  'DZ_28','DZ_29','DZ_210','DZ_213',
  'DZ_214','DZ_215','DZ_216',
  'DZ_217','DZ_218'
];

//init();

// ----------------- 工具：补面显隐 -----------------
function setCapsVisible(flag) {
  planeCaps.forEach(m => { if (m) m.visible = flag; });
  // 也可联动 helper：
  // if (sliceHelper) sliceHelper.visible = flag;
}

// ----------------- 剖切开关 -----------------
function setSliceEnabled(flag) {
  if (!modelsGroup) return;

  if (flag) {
    // 重新应用剖切与补面
    sliceGroupWithCaps(modelsGroup, SLICE_CENTER, renderer, scene);
    setCapsVisible(params.capsVisible);
  } else {
    // 关闭剖切：移除补面 + 清空所有材质的裁剪/模板
    planeCaps.forEach(m => m?.parent?.remove(m));
    planeCaps.length = 0;

    modelsGroup.traverse(obj => {
      if (!obj.isMesh) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(mat => {
        if (!mat) return;
        mat.clippingPlanes = [];     // 取消裁剪
        mat.stencilWrite = false;    // 关闭模板写入
        mat.needsUpdate = true;
      });
    });

    if (sliceHelper) { scene.remove(sliceHelper); sliceHelper = null; }
  }
}

// ----------------- 剖切 + 补面（按 X 轴，从 SLICE_CENTER.x 处） -----------------
function sliceGroupWithCaps(modelsGroup, SLICE_CENTER, renderer, scene) {
  if (!modelsGroup) return;

  // 1) 整体包围盒（用于 helper 尺寸与 cap 尺寸）
  const bbox = new THREE.Box3().setFromObject(modelsGroup);
  const size = bbox.getSize(new THREE.Vector3());
  const center = bbox.getCenter(new THREE.Vector3());

  // 2) 世界平面（法线 +X, x = -constant）
  const x0 = SLICE_CENTER.x;
  slicePlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), -x0);

  // helper（可开可关）
  // if (sliceHelper) scene.remove(sliceHelper);
  // sliceHelper = new THREE.PlaneHelper(slicePlane, size.length(), 0xff6677);
  // scene.add(sliceHelper);

  // 3) 清理旧补面
  planeCaps.forEach(m => m?.parent?.remove(m));
  planeCaps.length = 0;

  // ★★★ 把世界平面变换到 modelsGroup 的局部空间，保证 cap 完全对齐
  const inv = new THREE.Matrix4().copy(modelsGroup.matrixWorld).invert();
  const localPlane = slicePlane.clone().applyMatrix4(inv).normalize();
  const localP0 = localPlane.normal.clone().multiplyScalar(-localPlane.constant);

  let meshIndex = 0;

  // 4) 遍历 Mesh：实体写模板 + cap 用 Equal
  modelsGroup.traverse(obj => {
    if (!obj.isMesh) return;

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const bit = meshIndex % 8;                 // 0..7
    const bucket = Math.floor(meshIndex / 8);  // 分批控制 renderOrder

    // 4.1 实体：裁剪 + 模板写入
    mats.forEach(mat => {
      if (!mat) return;
      mat.clippingPlanes = [slicePlane]; // 用世界平面裁剪
      mat.clipShadows   = true;
      mat.side          = THREE.DoubleSide;

      mat.stencilWrite      = true;
      mat.stencilWriteMask  = (1 << bit);
      mat.stencilRef        = (1 << bit);
      mat.stencilFunc       = THREE.AlwaysStencilFunc;
      mat.stencilFail       = THREE.InvertStencilOp;
      mat.stencilZFail      = THREE.InvertStencilOp;
      mat.stencilZPass      = THREE.InvertStencilOp;

      mat.needsUpdate = true;
    });
    obj.renderOrder = bucket + 1.0;

    // 4.2 补面：同色 + 模板 Equal，只显示切割轮廓
    const sampleMat = mats[0];
    const capColor = (sampleMat && sampleMat.color)
      ? sampleMat.color.clone()
      : new THREE.Color(0x888888);

    const capMat = new THREE.MeshStandardMaterial({
      color: capColor,
      metalness: 0.1,
      roughness: 0.75,
      side: THREE.DoubleSide,
      clippingPlanes: [], // cap 不再裁剪
      stencilWrite: true,
      stencilFuncMask: (1 << bit),
      stencilRef: (1 << bit),
      stencilFunc: THREE.EqualStencilFunc,
      stencilFail: THREE.KeepStencilOp,
      stencilZFail: THREE.KeepStencilOp,
      stencilZPass: THREE.KeepStencilOp
    });

    const capSize = Math.hypot(size.y, size.z) * 1.5;
    const capGeom = new THREE.PlaneGeometry(capSize, capSize);
    const cap = new THREE.Mesh(capGeom, capMat);

    // === 在 modelsGroup“局部空间”对齐 cap 的位置与角度 ===
    cap.position.copy(localP0); // 平面上一点
    cap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), localPlane.normal);
    cap.scale.y = 0.1;
    cap.renderOrder = bucket + 1.1;
    if (bit === 7) {
      cap.onAfterRender = (renderer) => renderer.clearStencil();
      cap.renderOrder = bucket + 1.2;
    }

    // ✅ 初始显隐跟随 params
    cap.visible = params.capsVisible;

    modelsGroup.add(cap);
    planeCaps.push(cap);

    meshIndex++;
  });
}

// ----------------- 资源释放 -----------------
function disposeGroup(group) {
  group.traverse((child) => {
    if (child.isMesh) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach(m => { if (!m) return; if (m.map) m.map.dispose(); m.dispose(); });
    }
    if (child.geometry) child.geometry.dispose();
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
    disposeGroup(modelsGroup);
  }

  modelsGroup = new THREE.Group();
  scene.add(modelsGroup);

  let loaded = 0;

  assets.forEach((name) => {
    loader.load(`src/models/geo/${name}.fbx`, (group) => {
      group.traverse(child => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      // 若 FBX 坐标系是 Z 向上，可统一转一下
      group.rotateX(-Math.PI / 2);

      modelsGroup.add(group);

      loaded++;
      if (loaded === assets.length) {
        fitCameraToObject(camera, modelsGroup, controls, 1.5);
        // 初次按开关状态应用/关闭剖切
        setSliceEnabled(params.sliceEnabled);
      }
    }, undefined, (err) => {
      console.error(`加载失败: ${name}.fbx`, err);
      loaded++;
      if (loaded === assets.length) {
        fitCameraToObject(camera, modelsGroup, controls, 1.5);
        setSliceEnabled(params.sliceEnabled);
      }
    });
  });
}

// ----------------- 初始化/循环 -----------------
export default function init() {
   document.getElementById('info').style.display = 'none';
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

  // 批量加载所有 FBX，并在全部完成后自动对焦 +（按开关）剖切补面
  loadAllAssets(camera, controls);

  // GUI
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

  // ✅ 补面可见性开关
  gui.add(params, 'capsVisible').name('Show Caps').onChange(v => setCapsVisible(v));

  // ✅ 剖切开关
  gui.add(params, 'sliceEnabled').name('Enable Slicing').onChange(v => setSliceEnabled(v));

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
