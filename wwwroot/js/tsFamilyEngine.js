window.tsFamilyEngine = {
    canvas: null,
    engine: null,
    scene: null,
    camera: null,
    player: null,
    inputMap: {},
    walkTimer: 0,
    hasJoined: false,
    userId: localStorage.getItem("tsFamilyUserId") || (function () {
        const id = Math.random().toString(36).substr(2, 9);
        localStorage.setItem("tsFamilyUserId", id);
        return id;
    })(),
    userName: "User",
    ghostPlayers: {},
    syncTimer: 0,
    lastSyncedPos: null,
    lastSyncedRot: null,
    lastHeartbeat: 0,
    blueprints: {},
    worldObjects: {},
    isBuilding: false,
    selectedBlueprintId: "apple_tree",
    previewNode: null,

    init: async function (canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.engine = new BABYLON.Engine(this.canvas, true);

        await this.loadAssets();

        this.scene = this.createScene();

        // Keyboard Input Handling
        this.scene.onKeyboardObservable.add((kbInfo) => {
            switch (kbInfo.type) {
                case BABYLON.KeyboardEventTypes.KEYDOWN:
                    this.inputMap[kbInfo.event.key.toLowerCase()] = true;
                    break;
                case BABYLON.KeyboardEventTypes.KEYUP:
                    this.inputMap[kbInfo.event.key.toLowerCase()] = false;
                    break;
            }
        });

        this.engine.runRenderLoop(() => {
            if (this.player && this.hasJoined) {
                this.handleMovement();
                this.updateSync();
            }
            if (this.isBuilding) {
                this.updatePlacementPreview();
            }
            this.scene.render();
        });

        // Pointer Click Handling for Placement
        this.scene.onPointerObservable.add((pointerInfo) => {
            if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERDOWN && this.isBuilding) {
                const pickInfo = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh) => mesh.name === "ground");
                if (pickInfo.hit) {
                    this.placeObject(pickInfo.pickedPoint);
                }
            }
        });

        window.addEventListener("resize", () => {
            this.engine.resize();
        });

        this.setupWorldSync();
    },

    loadAssets: async function () {
        try {
            const response = await fetch('data/assetBlueprints.json');
            const data = await response.json();
            data.blueprints.forEach(bp => {
                this.blueprints[bp.id] = bp;
            });
            console.log("Blueprints loaded:", Object.keys(this.blueprints));
        } catch (e) {
            console.error("Error loading assets:", e);
        }
    },

    setupWorldSync: function () {
        if (!window.firebaseManager) {
            setTimeout(() => this.setupWorldSync(), 500);
            return;
        }

        window.firebaseManager.listenForWorldObjects((objects) => {
            objects.forEach(obj => {
                if (!this.worldObjects[obj.id]) {
                    this.renderWorldObject(obj);
                }
            });
        });
    },

    renderWorldObject: function (obj) {
        const bp = this.blueprints[obj.type];
        if (!bp) return;

        const container = new BABYLON.TransformNode("object_" + obj.id, this.scene);
        container.position = new BABYLON.Vector3(obj.x, obj.y, obj.z);
        if (obj.ry) container.rotation.y = obj.ry;

        if (obj.type === "apple_tree") {
            this.createVoxelTree(container, bp, obj.seed || 123);
        } else if (obj.type === "park_bench") {
            this.createVoxelBench(container, bp);
        } else if (obj.type === "red_house") {
            this.createVoxelHouse(container, bp);
        } else {
            // Default placeholder
            const box = BABYLON.MeshBuilder.CreateBox("box_" + obj.id, { size: 1 }, this.scene);
            box.parent = container;
            box.position.y = 0.5;
        }

        this.worldObjects[obj.id] = container;
    },

    createVoxelTree: function (parent, bp, seed) {
        const trunkMat = new BABYLON.StandardMaterial("trunkMat", this.scene);
        trunkMat.diffuseColor = BABYLON.Color3.FromHexString(bp.trunkColor);

        const leafMat = new BABYLON.StandardMaterial("leafMat", this.scene);
        leafMat.diffuseColor = BABYLON.Color3.FromHexString(bp.leafColor);

        // Trunk
        const trunkHeight = bp.baseTrunkHeight;
        const trunk = BABYLON.MeshBuilder.CreateBox("trunk", { width: bp.baseTrunkWidth, height: trunkHeight, depth: bp.baseTrunkWidth }, this.scene);
        trunk.parent = parent;
        trunk.position.y = trunkHeight / 2;
        trunk.material = trunkMat;

        // "Foliage" (Voxel Blob)
        const crown = BABYLON.MeshBuilder.CreateBox("crown", { size: bp.crownSize }, this.scene);
        crown.parent = parent;
        crown.position.y = trunkHeight + (bp.crownSize / 2) - 0.2;
        crown.material = leafMat;

        // Mini "Apples"
        const appleMat = new BABYLON.StandardMaterial("appleMat", this.scene);
        appleMat.diffuseColor = BABYLON.Color3.FromHexString(bp.appleColor);

        for (let i = 0; i < 5; i++) {
            const apple = BABYLON.MeshBuilder.CreateBox("apple", { size: 0.15 }, this.scene);
            apple.parent = crown;
            // Pseudo-random placement based on seed
            const offset = (i + seed) % 10 / 10;
            apple.position = new BABYLON.Vector3(
                (Math.sin(i * 1.5 + seed) * 0.4) * bp.crownSize,
                (Math.cos(i * 2.2 + seed) * 0.4) * bp.crownSize,
                (Math.sin(i * 3.7 + seed) * 0.4) * bp.crownSize
            );
            apple.material = appleMat;
        }
    },

    createVoxelBench: function (parent, bp) {
        const woodMat = new BABYLON.StandardMaterial("woodMat", this.scene);
        woodMat.diffuseColor = BABYLON.Color3.FromHexString(bp.woodColor);

        const metalMat = new BABYLON.StandardMaterial("metalMat", this.scene);
        metalMat.diffuseColor = BABYLON.Color3.FromHexString(bp.metalColor);

        // Seat
        const seat = BABYLON.MeshBuilder.CreateBox("seat", { width: bp.width, height: 0.1, depth: bp.depth }, this.scene);
        seat.parent = parent;
        seat.position.y = 0.5;
        seat.material = woodMat;

        // Backrest
        const back = BABYLON.MeshBuilder.CreateBox("back", { width: bp.width, height: 0.5, depth: 0.1 }, this.scene);
        back.parent = parent;
        back.position.y = 0.8;
        back.position.z = bp.depth / 2;
        back.material = woodMat;

        // Legs (Simplified)
        const legLeft = BABYLON.MeshBuilder.CreateBox("legL", { width: 0.1, height: 0.5, depth: bp.depth }, this.scene);
        legLeft.parent = parent;
        legLeft.position.x = -bp.width / 2 + 0.1;
        legLeft.position.y = 0.25;
        legLeft.material = metalMat;

        const legRight = BABYLON.MeshBuilder.CreateBox("legR", { width: 0.1, height: 0.5, depth: bp.depth }, this.scene);
        legRight.parent = parent;
        legRight.position.x = bp.width / 2 - 0.1;
        legRight.position.y = 0.25;
        legRight.material = metalMat;
    },

    createVoxelHouse: function (parent, bp) {
        const wallMat = new BABYLON.StandardMaterial("wallMat", this.scene);
        wallMat.diffuseColor = BABYLON.Color3.FromHexString(bp.wallColor);

        const trimMat = new BABYLON.StandardMaterial("trimMat", this.scene);
        trimMat.diffuseColor = BABYLON.Color3.FromHexString(bp.trimColor);

        const roofMat = new BABYLON.StandardMaterial("roofMat", this.scene);
        roofMat.diffuseColor = BABYLON.Color3.FromHexString(bp.roofColor);

        // Main Structure
        const wall = BABYLON.MeshBuilder.CreateBox("wall", { width: 3, height: 2.5, depth: 4 }, this.scene);
        wall.parent = parent;
        wall.position.y = 1.25;
        wall.material = wallMat;
        wall.checkCollisions = true;

        // Roof (Traditional Gable)
        const roof = BABYLON.MeshBuilder.CreateCylinder("roof", { diameter: 4.5, height: 3.2, tessellation: 3 }, this.scene);
        roof.parent = parent;
        roof.position.y = 3;
        roof.rotation.z = Math.PI / 2;
        roof.material = roofMat;

        // Door
        const door = BABYLON.MeshBuilder.CreateBox("door", { width: 0.8, height: 1.4, depth: 0.1 }, this.scene);
        door.parent = parent;
        door.position = new BABYLON.Vector3(0, 0.7, -2.01);
        door.material = trimMat;

        // Window Frames
        const windowFrame = BABYLON.MeshBuilder.CreateBox("window", { width: 0.8, height: 0.8, depth: 0.1 }, this.scene);
        windowFrame.parent = parent;
        windowFrame.position = new BABYLON.Vector3(0.8, 1.8, -2.01);
        windowFrame.material = trimMat;
    },

    createScene: function () {
        const scene = new BABYLON.Scene(this.engine);
        scene.clearColor = new BABYLON.Color4(0.1, 0.2, 0.4, 1.0); // Darker blue for mood

        // Camera - Floating above/behind
        this.camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 3, 10, BABYLON.Vector3.Zero(), scene);
        this.camera.attachControl(this.canvas, true);
        this.camera.lowerRadiusLimit = 5;
        this.camera.upperRadiusLimit = 60;

        // Lights
        const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
        light.intensity = 0.8;

        // Ground (Stavanger Plaza Placeholder)
        const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 200, height: 200 }, scene);
        const groundMaterial = new BABYLON.StandardMaterial("groundMat", scene);
        groundMaterial.diffuseColor = new BABYLON.Color3(0.3, 0.3, 0.3);
        ground.material = groundMaterial;

        // Add environment
        this.createEnvironment(scene);

        // Grid helper
        const grid = new BABYLON.GridMaterial("grid", scene);
        grid.mainColor = new BABYLON.Color3(1, 1, 1);
        grid.lineColor = new BABYLON.Color3(1, 1, 1);
        grid.opacity = 0.1;
        ground.material = grid;

        return scene;
    },

    createEnvironment: function (scene) {
        const houseMat = new BABYLON.StandardMaterial("houseMat", scene);
        houseMat.diffuseColor = new BABYLON.Color3(0.85, 0.14, 0.14); // Stavanger red

        const whiteMat = new BABYLON.StandardMaterial("whiteMat", scene);
        whiteMat.diffuseColor = new BABYLON.Color3(0.9, 0.9, 0.9); // Gamle Stavanger white

        const woodMat = new BABYLON.StandardMaterial("woodMat", scene);
        woodMat.diffuseColor = new BABYLON.Color3(0.4, 0.25, 0.1);

        const leafMat = new BABYLON.StandardMaterial("leafMat", scene);
        leafMat.diffuseColor = new BABYLON.Color3(0.1, 0.4, 0.2);

        // Fixed Houses
        const housePositions = [
            { pos: new BABYLON.Vector3(15, 2, 15), mat: houseMat },
            { pos: new BABYLON.Vector3(-15, 2, 15), mat: whiteMat },
            { pos: new BABYLON.Vector3(15, 2, -15), mat: houseMat },
            { pos: new BABYLON.Vector3(-15, 2, -15), mat: whiteMat }
        ];

        housePositions.forEach(hp => {
            const house = BABYLON.MeshBuilder.CreateBox("house", { width: 4, height: 4, depth: 4 }, scene);
            house.position = hp.pos;
            house.material = hp.mat;
            house.checkCollisions = true;

            const roof = BABYLON.MeshBuilder.CreateCylinder("roof", { diameter: 5, height: 1, tessellation: 3 }, scene);
            roof.position = hp.pos.clone();
            roof.position.y += 2.5;
            roof.rotation.z = Math.PI / 2;
            roof.material = woodMat;
        });

        // Initial Trees
        for (let i = 0; i < 6; i++) {
            this.createTree(scene, new BABYLON.Vector3(Math.random() * 80 - 40, 0, Math.random() * 80 - 40), woodMat, leafMat);
        }
    },

    createTree: function (scene, pos, woodMat, leafMat) {
        const trunk = BABYLON.MeshBuilder.CreateCylinder("trunk", { height: 2, diameter: 0.3 }, scene);
        trunk.position = pos.add(new BABYLON.Vector3(0, 1, 0));
        trunk.material = woodMat;
        trunk.checkCollisions = true;

        const leaves = BABYLON.MeshBuilder.CreateSphere("leaves", { diameter: 2 }, scene);
        leaves.position = pos.add(new BABYLON.Vector3(0, 2.5, 0));
        leaves.material = leafMat;
    },

    toggleBuildMode: function (enabled, blueprintId = "apple_tree") {
        this.isBuilding = enabled;
        this.selectedBlueprintId = blueprintId;

        if (this.previewNode) {
            this.previewNode.dispose();
            this.previewNode = null;
        }

        if (this.isBuilding) {
            this.previewNode = new BABYLON.TransformNode("preview", this.scene);
            this.renderWorldObject({ id: "preview", type: this.selectedBlueprintId, x: 0, y: 0, z: 0 });
            this.worldObjects["preview"].parent = this.previewNode;

            // Make preview semi-transparent
            this.previewNode.getChildMeshes().forEach(m => {
                m.visibility = 0.5;
                m.isPickable = false;
            });
        }
    },

    updatePlacementPreview: function () {
        const pickInfo = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh) => mesh.name === "ground");
        if (pickInfo.hit && this.previewNode) {
            this.previewNode.position = pickInfo.pickedPoint;
        }
    },

    placeObject: function (point) {
        if (!window.firebaseManager) return;

        window.firebaseManager.placeWorldObject({
            type: this.selectedBlueprintId,
            x: point.x,
            y: point.y,
            z: point.z,
            ry: 0,
            seed: Math.floor(Math.random() * 1000)
        });
    },

    hasJoined: false,
    handleMovement: function () {
        const speed = 0.15;
        const rotateSpeed = 0.04;
        let isMoving = false;

        if (this.inputMap["w"]) {
            this.player.moveWithCollisions(this.player.forward.scale(speed));
            isMoving = true;
        }
        if (this.inputMap["s"]) {
            this.player.moveWithCollisions(this.player.forward.scale(-speed * 0.5));
            isMoving = true;
        }
        if (this.inputMap["a"]) {
            this.player.rotation.y -= rotateSpeed;
        }
        if (this.inputMap["d"]) {
            this.player.rotation.y += rotateSpeed;
        }

        // Animate Limbs
        if (isMoving) {
            this.walkTimer += 0.125;
            const swing = Math.sin(this.walkTimer) * 0.25;

            // Legs move in opposition
            this.player.limbs.leftLeg.rotation.x = swing;
            this.player.limbs.rightLeg.rotation.x = -swing;

            // Arms move in opposition to legs
            this.player.limbs.leftArm.rotation.x = -swing;
            this.player.limbs.rightArm.rotation.x = swing;

            // Slight body bob
            this.player.limbs.torso.position.y = 1.2 + Math.abs(swing) * 0.05;
        } else {
            // Smoothly return to neutral position
            const lerpSpeed = 0.1;
            this.player.limbs.leftLeg.rotation.x *= (1 - lerpSpeed);
            this.player.limbs.rightLeg.rotation.x *= (1 - lerpSpeed);
            this.player.limbs.leftArm.rotation.x *= (1 - lerpSpeed);
            this.player.limbs.rightArm.rotation.x *= (1 - lerpSpeed);
            this.player.limbs.torso.position.y = 1.2;
            this.walkTimer = 0;
        }

        // Update camera target to follow player
        this.camera.target = this.player.position;
    },

    spawnUser: function (name) {
        this.userName = name;
        this.hasJoined = true;
        this.setupMultiplayer();

        // Root transform for the player
        this.player = BABYLON.MeshBuilder.CreateBox("playerRoot", { size: 0.1 }, this.scene);
        this.player.isVisible = false;
        this.player.position = new BABYLON.Vector3(0, 0, 0);
        this.player.checkCollisions = true;
        this.player.ellipsoid = new BABYLON.Vector3(0.5, 1, 0.5);
        this.player.ellipsoidOffset = new BABYLON.Vector3(0, 1, 0);

        this.player.limbs = {};

        // Materials
        const skinMat = new BABYLON.StandardMaterial("skinMat", this.scene);
        skinMat.diffuseColor = new BABYLON.Color3(1, 0.8, 0.6);

        const shirtMat = new BABYLON.StandardMaterial("shirtMat", this.scene);
        shirtMat.diffuseColor = new BABYLON.Color3(0.2, 0.4, 0.8);

        const pantsMat = new BABYLON.StandardMaterial("pantsMat", this.scene);
        pantsMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);

        const faceMat = new BABYLON.StandardMaterial("faceMat", this.scene);
        faceMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);

        // Torso
        const torso = BABYLON.MeshBuilder.CreateBox("torso", { width: 0.8, height: 0.8, depth: 0.4 }, this.scene);
        torso.parent = this.player;
        torso.position.y = 1.2;
        torso.material = shirtMat;
        this.player.limbs.torso = torso;

        // Head
        const head = BABYLON.MeshBuilder.CreateBox("head", { size: 0.6 }, this.scene);
        head.parent = this.player;
        head.position.y = 1.9;
        head.material = skinMat;

        // Facial Features
        const eyeL = BABYLON.MeshBuilder.CreateBox("eyeL", { width: 0.1, height: 0.1, depth: 0.05 }, this.scene);
        eyeL.parent = head;
        eyeL.position.set(-0.15, 0.1, 0.3);
        eyeL.material = faceMat;

        const eyeR = BABYLON.MeshBuilder.CreateBox("eyeR", { width: 0.1, height: 0.1, depth: 0.05 }, this.scene);
        eyeR.parent = head;
        eyeR.position.set(0.15, 0.1, 0.3);
        eyeR.material = faceMat;

        const smile = BABYLON.MeshBuilder.CreateBox("smile", { width: 0.3, height: 0.05, depth: 0.05 }, this.scene);
        smile.parent = head;
        smile.position.set(0, -0.15, 0.3);
        smile.material = faceMat;

        // Arms (with pivots at shoulders)
        const leftArmPivot = new BABYLON.TransformNode("leftArmPivot", this.scene);
        leftArmPivot.parent = this.player;
        leftArmPivot.position.set(-0.55, 1.6, 0);
        this.player.limbs.leftArm = leftArmPivot;

        const leftArm = BABYLON.MeshBuilder.CreateBox("leftArm", { width: 0.3, height: 0.8, depth: 0.3 }, this.scene);
        leftArm.parent = leftArmPivot;
        leftArm.position.y = -0.4;
        leftArm.material = skinMat;

        const rightArmPivot = new BABYLON.TransformNode("rightArmPivot", this.scene);
        rightArmPivot.parent = this.player;
        rightArmPivot.position.set(0.55, 1.6, 0);
        this.player.limbs.rightArm = rightArmPivot;

        const rightArm = BABYLON.MeshBuilder.CreateBox("rightArm", { width: 0.3, height: 0.8, depth: 0.3 }, this.scene);
        rightArm.parent = rightArmPivot;
        rightArm.position.y = -0.4;
        rightArm.material = skinMat;

        // Legs (with pivots at hips)
        const leftLegPivot = new BABYLON.TransformNode("leftLegPivot", this.scene);
        leftLegPivot.parent = this.player;
        leftLegPivot.position.set(-0.22, 0.8, 0);
        this.player.limbs.leftLeg = leftLegPivot;

        const leftLeg = BABYLON.MeshBuilder.CreateBox("leftLeg", { width: 0.35, height: 0.8, depth: 0.35 }, this.scene);
        leftLeg.parent = leftLegPivot;
        leftLeg.position.y = -0.4;
        leftLeg.material = pantsMat;

        const rightLegPivot = new BABYLON.TransformNode("rightLegPivot", this.scene);
        rightLegPivot.parent = this.player;
        rightLegPivot.position.set(0.22, 0.8, 0);
        this.player.limbs.rightLeg = rightLegPivot;

        const rightLeg = BABYLON.MeshBuilder.CreateBox("rightLeg", { width: 0.35, height: 0.8, depth: 0.35 }, this.scene);
        rightLeg.parent = rightLegPivot;
        rightLeg.position.y = -0.4;
        rightLeg.material = pantsMat;

        // Name tag
        const dynamicTexture = new BABYLON.DynamicTexture("nameTag", { width: 512, height: 256 }, this.scene);
        dynamicTexture.hasAlpha = true;
        const font = "bold 70px Inter";
        dynamicTexture.drawText(name, null, null, font, "white", "transparent", true);

        const plane = BABYLON.MeshBuilder.CreatePlane("namePlane", { width: 2, height: 1 }, this.scene);
        plane.parent = this.player;
        plane.position.y = 2.6;

        const planeMat = new BABYLON.StandardMaterial("namePlaneMat", this.scene);
        planeMat.diffuseTexture = dynamicTexture;
        planeMat.specularColor = new BABYLON.Color3(0, 0, 0);
        planeMat.emissiveColor = new BABYLON.Color3(1, 1, 1);
        planeMat.backFaceCulling = false;
        plane.material = planeMat;
        plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
    },

    setupMultiplayer: function () {
        if (!window.firebaseManager) {
            console.warn("Firebase Manager not ready yet. Retrying...");
            setTimeout(() => this.setupMultiplayer(), 500);
            return;
        }

        // Listen for other players
        window.firebaseManager.listenForPlayers((players) => {
            const now = Date.now();
            const activePlayers = players.filter(p => {
                if (!p.lastSeen) return true; // Newly joined
                const lastUpdated = p.lastSeen.seconds ? p.lastSeen.seconds * 1000 : p.lastSeen;
                return (now - lastUpdated) < 60000; // 1 minute timeout
            });

            activePlayers.forEach(p => {
                if (p.id === this.userId) return; // Skip self

                if (!this.ghostPlayers[p.id]) {
                    this.spawnGhost(p.id, p.name);
                }

                const ghost = this.ghostPlayers[p.id];
                ghost.targetPosition = new BABYLON.Vector3(p.x, p.y, p.z);
                ghost.targetRotationY = p.ry;
                ghost.lastUpdate = now;
            });

            // Cleanup old ghosts
            const activeIds = activePlayers.map(p => p.id);
            for (let id in this.ghostPlayers) {
                if (!activeIds.includes(id)) {
                    this.ghostPlayers[id].dispose();
                    delete this.ghostPlayers[id];
                }
            }
        });

        // Interpolation loop for ghosts
        this.scene.onBeforeRenderObservable.add(() => {
            for (let id in this.ghostPlayers) {
                const ghost = this.ghostPlayers[id];
                if (ghost.targetPosition) {
                    // Smoothly LERP position and rotation
                    ghost.position = BABYLON.Vector3.Lerp(ghost.position, ghost.targetPosition, 0.1);
                    ghost.rotation.y = BABYLON.Scalar.LerpAngle(ghost.rotation.y, ghost.targetRotationY, 0.1);
                }
            }
        });
    },

    spawnGhost: function (id, name) {
        console.log("Spawning ghost for: " + name);
        const ghost = BABYLON.MeshBuilder.CreateBox("ghost_" + id, { size: 0.1 }, this.scene);
        ghost.position = new BABYLON.Vector3(0, 0, 0);
        ghost.isVisible = false; // Root is hidden

        // Simple voxel humanoid for ghosts
        const skinMat = new BABYLON.StandardMaterial("skinMatGhost", this.scene);
        skinMat.diffuseColor = new BABYLON.Color3(1, 0.8, 0.6);

        const shirtMat = new BABYLON.StandardMaterial("shirtMatGhost", this.scene);
        shirtMat.diffuseColor = new BABYLON.Color3(0.5, 0.5, 0.5); // Grey shirts for ghosts

        const torso = BABYLON.MeshBuilder.CreateBox("torsoGhost", { width: 0.8, height: 0.8, depth: 0.4 }, this.scene);
        torso.parent = ghost;
        torso.position.y = 1.2;
        torso.material = shirtMat;

        const head = BABYLON.MeshBuilder.CreateBox("headGhost", { size: 0.6 }, this.scene);
        head.parent = ghost;
        head.position.y = 1.9;
        head.material = skinMat;

        // Legs
        const pantsMat = new BABYLON.StandardMaterial("pantsMatGhost", this.scene);
        pantsMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);

        const leftLeg = BABYLON.MeshBuilder.CreateBox("leftLegGhost", { width: 0.35, height: 0.8, depth: 0.35 }, this.scene);
        leftLeg.parent = ghost;
        leftLeg.position = new BABYLON.Vector3(-0.2, 0.4, 0);
        leftLeg.material = pantsMat;

        const rightLeg = BABYLON.MeshBuilder.CreateBox("rightLegGhost", { width: 0.35, height: 0.8, depth: 0.35 }, this.scene);
        rightLeg.parent = ghost;
        rightLeg.position = new BABYLON.Vector3(0.2, 0.4, 0);
        rightLeg.material = pantsMat;

        // Arms
        const leftArm = BABYLON.MeshBuilder.CreateBox("leftArmGhost", { width: 0.3, height: 0.7, depth: 0.3 }, this.scene);
        leftArm.parent = ghost;
        leftArm.position = new BABYLON.Vector3(-0.55, 1.25, 0);
        leftArm.material = skinMat;

        const rightArm = BABYLON.MeshBuilder.CreateBox("rightArmGhost", { width: 0.3, height: 0.7, depth: 0.3 }, this.scene);
        rightArm.parent = ghost;
        rightArm.position = new BABYLON.Vector3(0.55, 1.25, 0);
        rightArm.material = skinMat;

        // Name tag for ghost
        const namePlane = BABYLON.MeshBuilder.CreatePlane("namePlaneGhost", { width: 2, height: 1 }, this.scene);
        namePlane.parent = ghost;
        namePlane.position.y = 2.6;
        namePlane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;

        const nameTexture = new BABYLON.DynamicTexture("nameTextureGhost", { width: 512, height: 128 }, this.scene);
        nameTexture.hasAlpha = true;
        nameTexture.drawText(name, null, null, "bold 60px Inter", "white", "transparent", true);

        const nameMaterial = new BABYLON.StandardMaterial("nameMatGhost", this.scene);
        nameMaterial.diffuseTexture = nameTexture;
        nameMaterial.emissiveColor = new BABYLON.Color3(1, 1, 1);
        nameMaterial.backFaceCulling = false;
        namePlane.material = nameMaterial;

        this.ghostPlayers[id] = ghost;
    },

    updateSync: function () {
        this.syncTimer++;
        if (this.syncTimer >= 18) { // Every ~300ms
            this.syncTimer = 0;
            if (window.firebaseManager && this.player) {
                const pos = this.player.position;
                const rot = this.player.rotation;
                const now = Date.now();

                // Dirty check: has moved or rotated?
                const moved = !this.lastSyncedPos || BABYLON.Vector3.Distance(pos, this.lastSyncedPos) > 0.05;
                const rotated = !this.lastSyncedRot || Math.abs(rot.y - this.lastSyncedRot.y) > 0.1;
                const heartbeat = (now - this.lastHeartbeat) > 30000; // Heartbeat every 30s

                if (moved || rotated || heartbeat) {
                    this.lastSyncedPos = pos.clone();
                    this.lastSyncedRot = rot.clone();
                    this.lastHeartbeat = now;

                    window.firebaseManager.updatePlayerPosition(
                        this.userId,
                        this.userName,
                        pos,
                        rot
                    );
                }
            }
        }
    },

    initChat: function (dotNetRef) {
        if (!window.firebaseManager) {
            setTimeout(() => this.initChat(dotNetRef), 500);
            return;
        }

        window.firebaseManager.listenForChat((msg) => {
            // Send back to Blazor
            if (dotNetRef) {
                dotNetRef.invokeMethodAsync("ReceiveChatMessage", msg.name, msg.text);
            }
        });
    },

    sendChat: function (message) {
        if (window.firebaseManager) {
            window.firebaseManager.sendChatMessage(this.userId, this.userName, message);
        }
    }
};
