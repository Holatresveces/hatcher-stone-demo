import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader";
import * as dat from "dat.gui";
import gsap from "gsap";

function lerp(start, end, amt) {
  return (1 - amt) * start + amt * end;
}

class ExplodingAnimation {
  constructor(container) {
    this.container = container;
    this.gui = new dat.GUI();

    this.settings = {
      progress: 0,
      strength: 15,
      animate: () => {
        gsap.to(this.settings, {
          progress: 1,
          duration: 6,
          ease: "expo.out",
        });
      },
      reverse: () => {
        gsap.to(this.settings, {
          progress: 0,
          duration: 6,
          ease: "expo.out",
        });
      },
    };

    this.gui.width = 500;
    this.gui.add(this.settings, "progress", 0, 1, 0.001);
    this.gui.add(this.settings, "strength", 0, 30, 0.1);
    this.gui.add(this.settings, "animate");
    this.gui.add(this.settings, "reverse");

    this.scene = new THREE.Scene();

    this.stone = new THREE.Group();
    this.scene.add(this.stone);
    this.fragments = [];
    this.loadModels();
    this.addLights();

    this.viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    };

    this.addListeners();

    this.initCamera();
    this.initRenderer();
    // this.initControls();

    this.clock = new THREE.Clock();
    this.prevTime = 0;

    this.tick = this.tick.bind(this);

    this.tick();
  }

  loadModels() {
    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath("/draco/");

    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.setDRACOLoader(this.dracoLoader);

    const p1 = this.loadTexture();

    const p2 = this.loadCube().then((gltf) => {
      this.processCube(gltf);
    });
    const p3 = this.loadStone().then((gltf) => {
      this.processStone(gltf);
    });

    return Promise.all([p1, p2, p3]);
  }

  loadTexture() {
    return new Promise((resolve) => {
      const textureLoader = new THREE.TextureLoader();
      this.texture = textureLoader.load("/stone-texture.jpg", (texture) => {
        texture.generateMipmaps = false;
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.repeat.x = 2;
        texture.repeat.y = 4;
        texture.offset.x = 1;
        texture.offset.y = 1;
        texture.wrapS = THREE.MirroredRepeatWrapping;
        texture.wrapT = THREE.MirroredRepeatWrapping;
        resolve();
      });
    });
  }

  loadCube() {
    return new Promise((resolve) => {
      this.gltfLoader.load("/models/cube-logo-top.gltf", resolve);
    });
  }

  loadStone() {
    return new Promise((resolve) => {
      this.gltfLoader.load("/models/stone.gltf", resolve);
    });
  }

  processCube(gltf) {
    this.cube = gltf.scene.children[0];
    this.cube.material.map = this.texture;
    this.scene.add(this.cube);
  }

  processStone(gltf) {
    gltf.scene.traverse((child) => {
      if (child.isMesh) {
        this.fragments.push({
          mesh: child.clone(),
        });
      }
    });

    this.minY = Math.min(
      ...this.fragments.map((fragment) => fragment.mesh.position.y)
    );
    this.maxY = Math.max(
      ...this.fragments.map((fragment) => fragment.mesh.position.y)
    );

    this.interval = this.maxY - this.minY;

    for (const fragment of this.fragments) {
      const mesh = fragment.mesh;
      const position = mesh.position.clone();
      const direction = new THREE.Vector3();
      direction
        .subVectors(position, new THREE.Vector3(0.0, position.y, 0.0))
        .normalize();

      fragment.direction = direction;
      fragment.initX = position.x;
      fragment.initZ = position.z;
      fragment.pct = (position.y + this.interval / 2) / this.interval;

      mesh.material.map = this.texture;
      this.stone.add(mesh);
    }
  }

  addLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(ambientLight);

    this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.mapSize.set(1024, 1024);
    this.directionalLight.shadow.camera.far = 15;
    this.directionalLight.shadow.camera.left = -7;
    this.directionalLight.shadow.camera.top = 7;
    this.directionalLight.shadow.camera.right = 7;
    this.directionalLight.shadow.camera.bottom = -7;
    this.directionalLight.position.set(8, 5, 5);
    this.scene.add(this.directionalLight);
  }

  addListeners() {
    window.addEventListener("resize", () => {
      this.viewport.width = this.container.offsetWidth;
      (this.viewport.height = this.container.offsetHeight),
        (this.camera.aspect = this.viewport.width / this.viewport.height);
      this.camera.updateProjectionMatrix();

      this.renderer.setSize(this.viewport.width, this.viewport.height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    });
  }

  initCamera() {
    this.camera = new THREE.PerspectiveCamera(
      75,
      this.viewport.width / this.viewport.height,
      0.1,
      100
    );
    this.perspective = 8;
    this.camera.position.set(0, 0, this.perspective);
    this.scene.add(this.camera);
  }

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(this.viewport.width, this.viewport.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setClearColor(0xffffff);
    this.container.appendChild(this.renderer.domElement);
  }

  initControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
  }

  tick() {
    const elapsedTime = this.clock.getElapsedTime();
    this.prevTime = elapsedTime;

    this.camera.position.y = lerp(0, 8, this.settings.progress);
    this.camera.position.z = lerp(8, 0, this.settings.progress);

    const rotation = -1 * lerp(0, Math.PI, this.settings.progress);
    this.stone.rotation.y = rotation;
    if (this.cube) {
      this.cube.rotation.y = rotation;
    }

    this.camera.lookAt(0, 0, 0);

    this.stone.position.y = Math.sin(elapsedTime * 0.5) * 0.2;

    for (const fragment of this.fragments) {
      const position = fragment.mesh.position;
      const direction = fragment.direction;

      const value =
        this.settings.strength *
        Math.max(this.settings.progress - fragment.pct, 0);

      position.x = fragment.initX + direction.x * value;
      position.z = fragment.initZ + direction.z * value;
    }

    this.renderer.render(this.scene, this.camera);

    requestAnimationFrame(this.tick);
  }
}

new ExplodingAnimation(document.querySelector(".webgl-container"));
