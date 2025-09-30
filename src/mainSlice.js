// main.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';

let camera, scene, renderer, object, stats;
let planes, planeObjects, planeHelpers;
let clock;
let planes1, planes2, planes3;

// 用于把每个补面 Mesh 对应回它所属的数学平面
let planeObjectPlanes = [];
const textureLoader = new THREE.TextureLoader();
const texture = textureLoader.load('src/texture/crate_jpeg.jpg');
const params = {
  animate: true,
  planeX: { constant: 0, negated: false, displayHelper: false },
  planeY: { constant: 0, negated: false, displayHelper: false },
  planeZ: { constant: 0, negated: false, displayHelper: false }
};

//init();

function createPlaneStencilGroup( geometry, plane, renderOrder ,offsetv) {
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
  mat0.clippingPlanes = [ plane ];
  mat0.stencilFail = THREE.IncrementWrapStencilOp;
  mat0.stencilZFail = THREE.IncrementWrapStencilOp;
  mat0.stencilZPass = THREE.IncrementWrapStencilOp;

  const mesh0 = new THREE.Mesh( geometry, mat0 );
  mesh0.renderOrder = renderOrder;
  mesh0.position.x = offsetv.x;
  mesh0.position.z = offsetv.z;
  group.add( mesh0 );

  // front faces
  const mat1 = baseMat.clone();
  mat1.side = THREE.FrontSide;
  mat1.clippingPlanes = [ plane ];
  mat1.stencilFail = THREE.DecrementWrapStencilOp;
  mat1.stencilZFail = THREE.DecrementWrapStencilOp;
  mat1.stencilZPass = THREE.DecrementWrapStencilOp;

  const mesh1 = new THREE.Mesh( geometry, mat1 );
  mesh1.renderOrder = renderOrder;
  mesh1.position.x = offsetv.x;
  mesh1.position.z = offsetv.z;

  group.add( mesh1 );

  return group;
}

export default function init() {
  clock = new THREE.Clock();
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera( 36, window.innerWidth / window.innerHeight, 1, 100 );
  camera.position.set( 2, 2, 2 );

  scene.add( new THREE.AmbientLight( 0xffffff, 1.5 ) );

  const dirLight = new THREE.DirectionalLight( 0xffffff, 3 );
  dirLight.position.set( 5, 10, 7.5 );
  dirLight.castShadow = false;
  scene.add( dirLight );

  // --- 定义 4 组平面（示例：每组各两个平面）
  planes = [
    new THREE.Plane( new THREE.Vector3( -1, -1, 0 ), 0 )
  ];

  planes1 = [
    new THREE.Plane( new THREE.Vector3( 1, 1, 0 ), 0 )
  ];

  planes2 = [
    new THREE.Plane( new THREE.Vector3( 1, 0, 0 ), 0 ),
    new THREE.Plane( new THREE.Vector3( 0, 0, 1 ), 0 )
  ];

  planes3 = [
    new THREE.Plane( new THREE.Vector3( -1, 0, 0 ), 0 ),
    new THREE.Plane( new THREE.Vector3( 0, 0, 1 ), 0 )
  ];

  // planeHelpers 仅为第一组创建（如果需要为其它组可扩展）
  planeHelpers = planes.map( p => new THREE.PlaneHelper( p, 2, 0xffffff ) );
  planeHelpers.forEach( ph => {
    ph.visible = false;
    scene.add( ph );
  } );

  // 主体几何（被裁剪的对象）——你可以随意替换成 Box/TorusKnot 等
  const geometry = new THREE.CylinderGeometry(1, 1, 3.5, 100);

  object = new THREE.Group();
  scene.add( object );

  // Set up clip plane rendering for ALL groups
  planeObjects = [];
  planeObjectPlanes = []; // 对应 planeObjects 的数学平面引用
  const planeGeom = new THREE.PlaneGeometry( 4, 4 );

  // 将多组平面放入数组中，便于统一处理
  const planeGroups = [ { planes: planes, colorHue: 0.0 },
                        { planes: planes1, colorHue: 0.25 } ];

  // renderOrder 基数，避免组之间渲染冲突
  let baseRenderOrder = 1;

  for ( let g = 0; g < planeGroups.length; g ++ ) {
    const set = planeGroups[g].planes;
    const hue = planeGroups[g].colorHue;
 let offsetv =  new THREE.Vector3(set[ 0 ].normal.x*0.5, 0,0 );
    // 为每组的每个平面生成 stencilGroup + cap
    for ( let i = 0; i < set.length; i ++ ) {

      const poGroup = new THREE.Group();
      let plane = set[ i ];
      const matrix = new THREE.Matrix4().makeTranslation(offsetv); // 沿 X 轴移动 2
plane.applyMatrix4(matrix);
  

      // stencil 使用主体几何（与原示例一致）
      const stencilGroup = createPlaneStencilGroup( geometry, plane, baseRenderOrder + i ,offsetv);

      // 每组使用不同的颜色，且每组内再用 i 微调
      const color = new THREE.Color().setHSL( (hue + (i / Math.max(1, set.length)) * 0.05) % 1, 0.7, 0.55 );
     
      // plane is clipped by the other clipping planes (同组内)
      const planeMat = new THREE.MeshStandardMaterial( {
        
      map:texture,
       
        clippingPlanes: set.filter( p => p !== plane ),
        stencilWrite: true,
        stencilRef: 0,
        stencilFunc: THREE.NotEqualStencilFunc,
        stencilFail: THREE.ReplaceStencilOp,
        stencilZFail: THREE.ReplaceStencilOp,
        stencilZPass: THREE.ReplaceStencilOp,
      } );

      const po = new THREE.Mesh( planeGeom, planeMat );
      po.onAfterRender = function ( renderer ) {
        renderer.clearStencil();
      };

      po.renderOrder = baseRenderOrder + i + 0.1;
      po.position.x = offsetv.x
       po.position.z = offsetv.z
      object.add( stencilGroup );
      poGroup.add( po );
      planeObjects.push( po );
      planeObjectPlanes.push( plane ); // 记录对应的数学平面
      scene.add( poGroup );
    }

    // 为这一组创建被裁剪的主体 Mesh（颜色区分）
    const material = new THREE.MeshStandardMaterial( {
     
      map:texture,
     
      clippingPlanes: set,
      clipShadows: false,
      shadowSide: THREE.DoubleSide,
    } );

    const clippedColorFront = new THREE.Mesh( geometry, material );
    clippedColorFront.renderOrder = baseRenderOrder + set.length + 1;
    clippedColorFront.position.x = offsetv.x
       clippedColorFront.position.z = offsetv.z
    object.add( clippedColorFront );

    // 增加 baseRenderOrder，确保下一组顺序不会覆盖上一组的 stencil 操作
    baseRenderOrder += set.length + 5;
  }


  // Renderer
  renderer = new THREE.WebGLRenderer( { antialias: true, stencil: true } );
  renderer.setPixelRatio( window.devicePixelRatio );
  renderer.setSize( window.innerWidth, window.innerHeight );
  renderer.setClearColor( 0x263238 );
  renderer.setAnimationLoop( animate );
  renderer.localClippingEnabled = true;
  document.body.appendChild( renderer.domElement );

  // Stats
  stats = new Stats();
  document.body.appendChild( stats.dom );

  window.addEventListener( 'resize', onWindowResize );

  // Controls
  const controls = new OrbitControls( camera, renderer.domElement );
  controls.minDistance = 2;
  controls.maxDistance = 20;
  controls.update();

  // GUI（保留原始 GUI，若想精简可修改）
  const gui = new GUI();
  gui.add( params, 'animate' );

  const planeX = gui.addFolder( 'planeX' );
  planeX.add( params.planeX, 'displayHelper' ).onChange( v => planeHelpers[ 0 ].visible = v );
  planeX.add( params.planeX, 'constant' ).min( - 1 ).max( 1 ).onChange( d => planes[ 0 ].constant = d );
  planeX.add( params.planeX, 'negated' ).onChange( () => {
    planes[ 0 ].negate();
    params.planeX.constant = planes[ 0 ].constant;
  } );
  planeX.open();

  const planeY = gui.addFolder( 'planeY' );
  planeY.add( params.planeY, 'displayHelper' ).onChange( v => planeHelpers[ 1 ] ? planeHelpers[ 1 ].visible = v : null );
  planeY.add( params.planeY, 'constant' ).min( - 1 ).max( 1 ).onChange( d => planes[ 1 ].constant = d );
  planeY.add( params.planeY, 'negated' ).onChange( () => {
    planes[ 1 ].negate();
    params.planeY.constant = planes[ 1 ].constant;
  } );
  planeY.open();

  const planeZ = gui.addFolder( 'planeZ' );
  planeZ.add( params.planeZ, 'displayHelper' ).onChange( v => planeHelpers[ 2 ] ? planeHelpers[ 2 ].visible = v : null );
  planeZ.add( params.planeZ, 'constant' ).min( - 1 ).max( 1 ).onChange( d => planes[ 2 ].constant = d );
  planeZ.add( params.planeZ, 'negated' ).onChange( () => {
    planes[ 2 ].negate();
    params.planeZ.constant = planes[ 2 ].constant;
  } );
  planeZ.open();
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize( window.innerWidth, window.innerHeight );
}

function animate() {
   document.getElementById('info').style.display = 'none';
  const delta = clock.getDelta();


  // 更新每个补面的位置与朝向：使用 planeObjectPlanes 映射
  for ( let i = 0; i < planeObjects.length; i ++ ) {
    const plane = planeObjectPlanes[i];
 
    const po = planeObjects[i];
    if ( plane && po ) {
      plane.coplanarPoint( po.position );
      po.lookAt(
        po.position.x - plane.normal.x,
        po.position.y - plane.normal.y,
        po.position.z - plane.normal.z
      );
    }
  }

  stats.begin();
  renderer.render( scene, camera );
  stats.end();
}
