// main.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';

let camera, scene, renderer, object, stats;
let planes = [], planeObjects = [];
let clock;
let count1 = 50; // Initial number of planes
const params = { maxFPX: false };

// Generate a set of arc-shaped planes on the xz plane (y=0), with normals pointing towards the origin.
function generateArcPlanes({
    count = 10,
    radius = 1,
    startAngle = -Math.PI / 2, // Semicircle: -90° -> +90°
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
    const indexOrder = Math.floor((renderOrder - 1) / 8 + Number.EPSILON);
    const group = new THREE.Group();
    const baseMat = new THREE.MeshBasicMaterial();
    baseMat.depthWrite = false;
    baseMat.depthTest = false;
    baseMat.colorWrite = false;
    baseMat.stencilWrite = true;
    baseMat.stencilFunc = THREE.AlwaysStencilFunc;

    // Material for the back faces
    const mat0 = baseMat.clone();
    mat0.side = THREE.DoubleSide;
    mat0.clippingPlanes = [plane];
    mat0.stencilWrite = true;
    mat0.stencilWriteMask = 1 << (renderOrder - 1) % 8;
    mat0.stencilRef = 1 << (renderOrder - 1) % 8;
    mat0.stencilFunc = THREE.AlwaysStencilFunc;
    mat0.stencilFail = THREE.InvertStencilOp;
    mat0.stencilZFail = THREE.InvertStencilOp;
    mat0.stencilZPass = THREE.InvertStencilOp;

    const mesh0 = new THREE.Mesh(geometry, mat0);
    mesh0.renderOrder = indexOrder + 1.0;
    mesh0.rotateZ(-Math.PI / 2);
    group.add(mesh0);

    return group;
}

//init();

export default function init() {
	 document.getElementById('info').style.display = 'none';
    clock = new THREE.Clock();
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 1, 100);
    camera.position.set(4, 4, 4);

    // Lighting (no shadows)
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
    renderer.localClippingEnabled = true; // Enable local clipping

    document.body.appendChild(renderer.domElement);

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
    window.addEventListener('resize', onWindowResize);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.minDistance = 2;
    controls.maxDistance = 20;
    controls.update();

    // GUI for controlling the number of planes
    const gui = new GUI();
    gui.add(params, 'maxFPX');
    gui.add({ planeCount: count1 }, 'planeCount', 1, 1000, 1)
        .name('planes number')
        .onFinishChange((v) => {
            count1 = v | 0;
            rebuildClipping();
        });

    // Initial build
    rebuildClipping();
}

function rebuildClipping() {
    // Clear old objects
    planeObjects.forEach(po => po.parent?.remove(po));
    planeObjects = [];
    object.clear();

    planes = generateArcPlanes({ count: count1, radius: 1 });

    // Target geometry (the main object to be clipped)
    // You can also replace this with TorusKnot/Sphere/Box, etc.
    const geometry = new THREE.CylinderGeometry(0.9, 0.9, 4, 1000);
    // face
    let faceCount;
    if (geometry.index) {
        faceCount = geometry.index.count / 3;
    } else {
        faceCount = geometry.attributes.position.count / 3;
    }

    console.log('face:', faceCount);
    // Capping plane and stencil setup for each clipping plane
    const planeGeom = new THREE.PlaneGeometry(4, 4);
    for (let i = 0; i < count1; i++) {
        const indexOrder = Math.floor(i / 8 + Number.EPSILON);
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
            stencilFuncMask: 1 << (i % 8),
            stencilRef: 1 << (i % 8),
            stencilFunc: THREE.EqualStencilFunc,
            stencilFail: THREE.KeepStencilOp,
            stencilZFail: THREE.KeepStencilOp,
            stencilZPass: THREE.KeepStencilOp,
            // No shadow-related settings
        });

        const po = new THREE.Mesh(planeGeom, planeMat);
        po.renderOrder = indexOrder + 1.1;
        if (i % 8 === 7) {
            po.renderOrder = indexOrder + 1.2;
            po.onAfterRender = function (renderer) {
                renderer.clearStencil();
            };
        }

        object.add(stencilGroup);
        poGroup.add(po);
        planeObjects.push(po);
        scene.add(poGroup);
    }

    // The main clipped object
    const material = new THREE.MeshStandardMaterial({
        color: 0xFFC107,
        metalness: 0.1,
        roughness: 0.75,
        clippingPlanes: planes
        // No clipShadows / shadowSide properties needed
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

    // Make each capping plane align with its corresponding clipping plane
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