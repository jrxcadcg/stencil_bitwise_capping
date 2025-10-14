
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import { ElLoading } from 'element-plus';
import 'element-plus/dist/index.css'

const manager = new THREE.LoadingManager();
let camera, scene, renderer, stats;
let planes, planeHelpers;
let clock;
let modelsGroup;                 // Top-level group containing all models

// ✅ Slicing / Capping related
let slicePlane;                  // World-space slicing plane (x = constant)
let sliceHelper;                 // Visualization helper
const planeCaps = [];            // Record caps for cleanup

// Slice center position
const SLICE_CENTER = { x: -247330.90625, y: 224444.83984375, z: 13011.81396484375 };

const params = {
  animate: true,
  modelCount: 18,
  modelOffset: 1.2,
  modelsPerRow: 8,
  planeX: { constant: 0, negated: false, displayHelper: false },
  capsVisible: true,      // ✅ Show/Hide caps
  sliceEnabled: true      // ✅ Enable/Disable slicing
};

const assets = [
  'DZ_2','DZ_21','DZ_22','DZ_23',
  'DZ_24','DZ_25','DZ_26','DZ_27',
  'DZ_28','DZ_29','DZ_210','DZ_213',
  'DZ_214','DZ_215','DZ_216',
  'DZ_217','DZ_218'
];

const textureNames = [
  "T_FenXiSha",
  "T_FenZhiNianTu",
  "T_FenZhiNianTuJiaFenTu",
  "T_HanShaFenZhiNianTu",
  "T_HanSuiShiFenZhiNianTu",
  "T_HanSuiShiNianTu",
  "T_NiZhiFenShaYan",
  "T_ShaLiYan",
  "T_ShaZhiFenTu",
  "T_SuiShiNianTu",
  "T_SuTianTu",
  "T_YuanLi",
  "T_YuNiZhiFenZhiNiTu",
  "T_YuNiZhiNianTu",
  "T_YuNiZhiTianTu",
  "T_ZaTianTu",
  "T_FenXiSha",
  "T_FenZhiNianTu"
];

let textureArray = []
//init();

let loadingInstance1;

// loadingInstance1.close()

function setCapsVisible(flag) {
  planeCaps.forEach(m => { if (m) m.visible = flag; });
  // if (sliceHelper) sliceHelper.visible = flag;
}

// ----------------- Slice toggle -----------------
function setSliceEnabled(flag) {
  if (!modelsGroup) return;

  if (flag) {
    // Reapply slicing and caps
    sliceGroupWithCaps(modelsGroup, SLICE_CENTER, renderer, scene);
    setCapsVisible(params.capsVisible);
  } else {
    // Disable slicing: remove caps + clear all clipping/stencil data from materials
    planeCaps.forEach(m => m?.parent?.remove(m));
    planeCaps.length = 0;

    modelsGroup.traverse(obj => {
      if (!obj.isMesh) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(mat => {
        if (!mat) return;
        mat.clippingPlanes = [];     // Remove clipping
        mat.stencilWrite = false;    // Disable stencil writing
        mat.needsUpdate = true;
      });
    });

    if (sliceHelper) { scene.remove(sliceHelper); sliceHelper = null; }
  }
}

// ----------------- Slice + Cap (along X-axis from SLICE_CENTER.x) -----------------
function sliceGroupWithCaps(modelsGroup, SLICE_CENTER, renderer, scene) {
  if (!modelsGroup) return;

  // 1) Get overall bounding box (for helper and cap sizing)
  const bbox = new THREE.Box3().setFromObject(modelsGroup);
  const size = bbox.getSize(new THREE.Vector3());
  const center = bbox.getCenter(new THREE.Vector3());

  // 2) World plane (normal +X, x = -constant)
  const x0 = SLICE_CENTER.x;
  slicePlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), -x0);

  // 3) Remove old caps
  planeCaps.forEach(m => m?.parent?.remove(m));
  planeCaps.length = 0;

  // ★★★ Convert world plane into modelsGroup's local space to ensure perfect alignment
  const inv = new THREE.Matrix4().copy(modelsGroup.matrixWorld).invert();
  const localPlane = slicePlane.clone().applyMatrix4(inv).normalize();
  const localP0 = localPlane.normal.clone().multiplyScalar(-localPlane.constant);

  let meshIndex = 0;

  // 4) Traverse meshes: solids write stencil + caps use Equal function
  modelsGroup.traverse(obj => {
    if (!obj.isMesh) return;
     const geometry = obj.geometry;

  // Output UV information
  const uvAttr = geometry.attributes.uv;
  if (uvAttr) {
    console.log(`✅ UV found on ${obj.name || '[unnamed mesh]'}:`, uvAttr);
  } else {
    console.warn(`❌ No UV on ${obj.name || '[unnamed mesh]'}`);
  }
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const bit = meshIndex % 8;                 // 0..7
    const bucket = Math.floor(meshIndex / 8);  // Batch render order control
    const texture = textureArray[meshIndex];
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace  = THREE.SRGBColorSpace;
    // Set UV repeat scale (X, Y)
    texture.repeat.set(0.01, 0.01); // Repeat texture in both directions

    // 4.1 Solid: clipping + stencil write
    mats.forEach(mat => {
      if (!mat) return;
      mat.clippingPlanes = [slicePlane]; // Use world plane for clipping
      mat.side = THREE.DoubleSide;
      mat.color = new THREE.Color(0xffffff);
      mat.map = texture,
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

    // Set texture wrapping to RepeatWrapping
    const texture2 = texture.clone(); // Create a clone
    texture2.wrapS = THREE.RepeatWrapping;
    texture2.wrapT = THREE.RepeatWrapping;

    // Set UV scale (X, Y)
    texture2.repeat.set(20, 2); // Repeat texture more times
    // 4.2 Cap: same color + stencil Equal, only display the slice surface
    const sampleMat = mats[0];
    const capColor = (sampleMat && sampleMat.color)
      ? sampleMat.color.clone()
      : new THREE.Color(0x888888);

    const capMat = new THREE.MeshStandardMaterial({
      // color: capColor,
      map: texture2,
      color : new THREE.Color(0xffffff),
      side: THREE.DoubleSide,
      clippingPlanes: [], // Cap not clipped
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

    // === Align cap position and orientation in local space ===
    cap.position.copy(localP0); // A point on the plane
    cap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), localPlane.normal);
    cap.scale.y = 0.1;
    cap.renderOrder = bucket + 1.1;
    if (bit === 7) {
      cap.onAfterRender = (renderer) => renderer.clearStencil();
      cap.renderOrder = bucket + 1.2;
    }

    // ✅ Initial visibility follows params
    cap.visible = params.capsVisible;

    modelsGroup.add(cap);
    planeCaps.push(cap);

    meshIndex++;
  });
}

// ----------------- Resource cleanup -----------------
function disposeGroup(group) {
  group.traverse((child) => {
    if (child.isMesh) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach(m => { if (!m) return; if (m.map) m.map.dispose(); m.dispose(); });
    }
    if (child.geometry) child.geometry.dispose();
  });
}

// ----------------- Focus camera on object -----------------
function fitCameraToObject(camera, object, controls, fitOffset = 1.2) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const maxSize = Math.max(size.x, size.y, size.z);
  const fov = THREE.MathUtils.degToRad(camera.fov);
  let distance = (maxSize / 2) / Math.tan(fov / 2);
  distance *= fitOffset;

 
  camera.near = Math.max(0.1, distance / 100);
  camera.far  = distance * 100;
 camera.updateProjectionMatrix();

  if (controls) {
    controls.target.copy(center);
    controls.update();
  }
    camera.position.set(-427108.84, 83848.92, -188624.30);

    camera.rotation.set(-1.66, -1.27, -1.67);
   loadingInstance1.close()
}

// ----------------- Batch load all FBX models (keep original coordinates) -----------------
function loadAllAssets(camera, controls) {

  const textureLoader = new THREE.TextureLoader();
  const texturePath = '/Underground/'; // Change to your actual path
  textureArray = textureNames.map(name => textureLoader.load(`${texturePath}${name}.PNG`));

  const loader = new FBXLoader(manager);

  // Clear previous modelsGroup
  if (modelsGroup) {
    scene.remove(modelsGroup);
    disposeGroup(modelsGroup);
  }

  modelsGroup = new THREE.Group();
  scene.add(modelsGroup);

  let loaded = 0;

  assets.forEach((name) => {
    loader.load(`/models/geo/${name}.FBX`, (group) => {
      group.traverse(child => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      // If FBX uses Z-up, rotate to Y-up
      group.rotateX(-Math.PI / 2);

      modelsGroup.add(group);

      loaded++;
      if (loaded === assets.length) {
        fitCameraToObject(camera, modelsGroup, controls, 1.5);
        // Apply/disable slicing initially based on toggle
        setSliceEnabled(params.sliceEnabled);
      }
    }, undefined, (err) => {
      console.error(`Failed to load: ${name}.fbx`, err);
      loaded++;
      if (loaded === assets.length) {
        fitCameraToObject(camera, modelsGroup, controls, 1.5);
        setSliceEnabled(params.sliceEnabled);
      }
    });
  });
}

// ----------------- Initialization / Animation loop -----------------
export default function init() {
  document.getElementById('info').style.display = 'none';
  loadingInstance1 = ElLoading.service({ text: "Loading……" })
  clock = new THREE.Clock();
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 1, 1000);

//x=-443456.95, y=95018.34, z=-178857.23
  camera.position.set(-443456.95, 95018.34, -178857.23);
  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const dirLight = new THREE.DirectionalLight(0xffffff, 3);
  dirLight.position.set(5, 10, 7.5);

  scene.add(dirLight);

  // Single clipping plane (used for GUI demo; does not affect slicing logic)
  planes = [ new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0) ];
  planeHelpers = planes.map(p => new THREE.PlaneHelper(p, 5, 0xffffff));
  planeHelpers.forEach(h => { h.visible = false; scene.add(h); });

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x263238);
  renderer.shadowMap.enabled = true;
  renderer.localClippingEnabled = true; // ✅ Must be enabled
  renderer.outputColorSpace  = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);

  // Stats
  stats = new Stats();
  document.body.appendChild(stats.dom);

  // Orbit controls
  const controls = new OrbitControls(camera, renderer.domElement);

  // Load all FBX models and auto-focus + apply slice toggle
  loadAllAssets(camera, controls);

  // GUI
  const gui = new GUI();

  // ✅ Cap visibility toggle
  gui.add(params, 'capsVisible').name('Show Caps').onChange(v => setCapsVisible(v));

  // ✅ Slice enable toggle
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


  stats.begin();
  renderer.render(scene, camera);
  stats.end();
}
