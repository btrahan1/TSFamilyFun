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
    targetDestination: null,
    moveMarker: null,
    lastTapTime: 0,
    isBulldozing: false,
    transportMode: "walk", // walk, skate, scooter

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
                    if (kbInfo.event.key === "Escape") {
                        if (this.isBuilding) this.toggleBuildMode(false);
                        if (this.isBulldozing) this.toggleBulldozer(false);
                    }
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

        // Pointer Click Handling for Placement and Movement
        this.scene.onPointerObservable.add((pointerInfo) => {
            if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERDOWN) {
                const now = Date.now();
                const pickInfo = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh) => mesh.name === "ground");

                if (this.isBuilding) {
                    const pickInfo = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh) => mesh.name === "ground");
                    if (pickInfo.hit) {
                        this.placeObject(pickInfo.pickedPoint);
                    }
                } else if (this.isBulldozing) {
                    // Pick for any mesh that belongs to an object
                    const pickInfo = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh) => mesh.name && mesh.name.startsWith("object_"));
                    if (pickInfo.hit) {
                        const objectId = pickInfo.pickedMesh.name.split('_')[1];
                        if (confirm(`Are you sure you want to remove this object?`)) {
                            window.firebaseManager.deleteWorldObject(objectId);
                        }
                    }
                } else {
                    const pickInfo = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh) => mesh.name === "ground");
                    if (pickInfo.hit) {
                        // Double Tap Detection (Mobile Movement)
                        if (now - this.lastTapTime < 300) {
                            this.setTargetDestination(pickInfo.pickedPoint);
                        }
                        this.lastTapTime = now;
                    }
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

        window.firebaseManager.listenForWorldObjects((type, obj) => {
            if (type === "added" || type === "modified") {
                if (this.worldObjects[obj.id]) {
                    this.worldObjects[obj.id].dispose();
                }
                this.renderWorldObject(obj);
            } else if (type === "removed") {
                if (this.worldObjects[obj.id]) {
                    this.worldObjects[obj.id].dispose();
                    delete this.worldObjects[obj.id];
                }
            }
        });
    },

    renderWorldObject: function (obj) {
        const bp = this.blueprints[obj.type];
        if (!bp) return;

        const container = new BABYLON.TransformNode("object_" + obj.id, this.scene);
        container.position = new BABYLON.Vector3(obj.x, obj.y, obj.z);
        if (obj.ry) container.rotation.y = obj.ry;

        if (obj.type === "apple_tree") {
            this.createVoxelTree(container, bp, obj.seed || 123, obj.id);
        } else if (obj.type === "park_bench") {
            this.createVoxelBench(container, bp, obj.id);
        } else if (obj.type === "red_house") {
            this.createVoxelHouse(container, bp, obj.id);
        } else if (obj.type === "street_light") {
            this.createVoxelStreetLight(container, bp, obj.id);
        } else if (bp.recipe) {
            this.createVoxelRecipe(container, bp, obj.id);
        } else {
            // Default placeholder
            const box = BABYLON.MeshBuilder.CreateBox("object_" + obj.id, { size: 1 }, this.scene);
            box.parent = container;
            box.position.y = 0.5;
            box.isPickable = true;
        }

        this.worldObjects[obj.id] = container;
        container.blueprintId = obj.type; // For identification
    },

    createVoxelTree: function (parent, bp, seed, objId) {
        const trunkMat = new BABYLON.StandardMaterial("trunkMat", this.scene);
        trunkMat.diffuseColor = BABYLON.Color3.FromHexString(bp.trunkColor);

        const leafMat = new BABYLON.StandardMaterial("leafMat", this.scene);
        leafMat.diffuseColor = BABYLON.Color3.FromHexString(bp.leafColor);

        // Trunk
        const trunkHeight = bp.baseTrunkHeight;
        const trunk = BABYLON.MeshBuilder.CreateBox("object_" + objId, { width: bp.baseTrunkWidth, height: trunkHeight, depth: bp.baseTrunkWidth }, this.scene);
        trunk.parent = parent;
        trunk.position.y = trunkHeight / 2;
        trunk.material = trunkMat;
        trunk.isPickable = true;

        // "Foliage" (Voxel Blob)
        const crown = BABYLON.MeshBuilder.CreateBox("object_" + objId, { size: bp.crownSize }, this.scene);
        crown.parent = parent;
        crown.position.y = trunkHeight + (bp.crownSize / 2) - 0.2;
        crown.material = leafMat;
        crown.isPickable = true;

        // Mini "Apples"
        const appleMat = new BABYLON.StandardMaterial("appleMat", this.scene);
        appleMat.diffuseColor = BABYLON.Color3.FromHexString(bp.appleColor);

        for (let i = 0; i < 5; i++) {
            const apple = BABYLON.MeshBuilder.CreateBox("object_" + objId, { size: 0.15 }, this.scene);
            apple.parent = crown;
            // Pseudo-random placement based on seed
            const offset = (i + seed) % 10 / 10;
            apple.position = new BABYLON.Vector3(
                (Math.sin(i * 1.5 + seed) * 0.4) * bp.crownSize,
                (Math.cos(i * 2.2 + seed) * 0.4) * bp.crownSize,
                (Math.sin(i * 3.7 + seed) * 0.4) * bp.crownSize
            );
            apple.material = appleMat;
            apple.isPickable = true;
        }
    },

    createVoxelBench: function (parent, bp, objId) {
        const woodMat = new BABYLON.StandardMaterial("woodMat", this.scene);
        woodMat.diffuseColor = BABYLON.Color3.FromHexString(bp.woodColor);

        const metalMat = new BABYLON.StandardMaterial("metalMat", this.scene);
        metalMat.diffuseColor = BABYLON.Color3.FromHexString(bp.metalColor);

        // Seat
        const seat = BABYLON.MeshBuilder.CreateBox("object_" + objId, { width: bp.width, height: 0.1, depth: bp.depth }, this.scene);
        seat.parent = parent;
        seat.position.y = 0.5;
        seat.material = woodMat;
        seat.isPickable = true;

        // Backrest
        const back = BABYLON.MeshBuilder.CreateBox("object_" + objId, { width: bp.width, height: 0.5, depth: 0.1 }, this.scene);
        back.parent = parent;
        back.position.y = 0.8;
        back.position.z = bp.depth / 2;
        back.material = woodMat;
        back.isPickable = true;

        // Legs (Simplified)
        const legLeft = BABYLON.MeshBuilder.CreateBox("object_" + objId, { width: 0.1, height: 0.5, depth: bp.depth }, this.scene);
        legLeft.parent = parent;
        legLeft.position.x = -bp.width / 2 + 0.1;
        legLeft.position.y = 0.25;
        legLeft.material = metalMat;
        legLeft.isPickable = true;

        const legRight = BABYLON.MeshBuilder.CreateBox("object_" + objId, { width: 0.1, height: 0.5, depth: bp.depth }, this.scene);
        legRight.parent = parent;
        legRight.position.x = bp.width / 2 - 0.1;
        legRight.position.y = 0.25;
        legRight.material = metalMat;
        legRight.isPickable = true;
    },

    createVoxelHouse: function (parent, bp, objId) {
        const wallMat = new BABYLON.StandardMaterial("wallMat", this.scene);
        wallMat.diffuseColor = BABYLON.Color3.FromHexString(bp.wallColor);

        const trimMat = new BABYLON.StandardMaterial("trimMat", this.scene);
        trimMat.diffuseColor = BABYLON.Color3.FromHexString(bp.trimColor);

        const roofMat = new BABYLON.StandardMaterial("roofMat", this.scene);
        roofMat.diffuseColor = BABYLON.Color3.FromHexString(bp.roofColor);

        // Main Structure
        const wall = BABYLON.MeshBuilder.CreateBox("object_" + objId, { width: 3, height: 2.5, depth: 4 }, this.scene);
        wall.parent = parent;
        wall.position.y = 1.25;
        wall.material = wallMat;
        wall.checkCollisions = true;
        wall.isPickable = true;

        // Roof (Traditional Gable)
        const roof = BABYLON.MeshBuilder.CreateCylinder("object_" + objId, { diameter: 4.5, height: 3.2, tessellation: 3 }, this.scene);
        roof.parent = parent;
        roof.position.y = 3;
        roof.rotation.z = Math.PI / 2;
        roof.material = roofMat;
        roof.isPickable = true;

        // Door
        const door = BABYLON.MeshBuilder.CreateBox("object_" + objId, { width: 0.8, height: 1.4, depth: 0.1 }, this.scene);
        door.parent = parent;
        door.position = new BABYLON.Vector3(0, 0.7, -2.01);
        door.material = trimMat;
        door.isPickable = true;

        // Window Frames
        const windowFrame = BABYLON.MeshBuilder.CreateBox("object_" + objId, { width: 0.8, height: 0.8, depth: 0.1 }, this.scene);
        windowFrame.parent = parent;
        windowFrame.position = new BABYLON.Vector3(0.8, 1.8, -2.01);
        windowFrame.material = trimMat;
        windowFrame.isPickable = true;
    },

    createVoxelStreetLight: function (parent, bp, objId) {
        const metalMat = new BABYLON.PBRMaterial("metalMat", this.scene);
        metalMat.albedoColor = BABYLON.Color3.FromHexString(bp.poleColor);
        metalMat.metallic = 0.8;
        metalMat.roughness = 0.2;

        const bulbMat = new BABYLON.PBRMaterial("bulbMat", this.scene);
        bulbMat.albedoColor = BABYLON.Color3.FromHexString(bp.bulbColor);
        bulbMat.emissiveColor = BABYLON.Color3.FromHexString(bp.bulbColor);
        bulbMat.emissiveIntensity = 2.0;

        // Pole
        const pole = BABYLON.MeshBuilder.CreateBox("object_" + objId, { width: 0.2, height: 4, depth: 0.2 }, this.scene);
        pole.parent = parent;
        pole.position.y = 2;
        pole.material = metalMat;
        pole.isPickable = true;

        // Arm
        const arm = BABYLON.MeshBuilder.CreateBox("object_" + objId, { width: 1.0, height: 0.15, depth: 0.15 }, this.scene);
        arm.parent = parent;
        arm.position.set(0.4, 3.8, 0);
        arm.material = metalMat;
        arm.isPickable = true;

        // Lantern / Bulb
        const bulb = BABYLON.MeshBuilder.CreateBox("object_" + objId, { width: 0.5, height: 0.5, depth: 0.5 }, this.scene);
        bulb.parent = parent;
        bulb.position.set(0.8, 3.5, 0);
        bulb.material = bulbMat;
        bulb.isPickable = true;

        // The Actual Light
        const light = new BABYLON.PointLight("light_" + objId, new BABYLON.Vector3(0.8, 3.5, 0), this.scene);
        light.parent = parent;
        light.diffuse = BABYLON.Color3.FromHexString(bp.bulbColor);
        light.intensity = 1.0;
        light.range = 15;
    },

    createVoxelRecipe: async function (parent, bp, objId) {
        try {
            const response = await fetch(bp.recipe);
            const data = await response.json();
            const parts = data.Parts || data.parts;
            if (!parts) return;

            const registry = new Map();

            parts.forEach(p => {
                this.createProp(p, parent, registry, objId);
            });
        } catch (e) {
            console.error("Error rendering recipe:", e);
        }
    },

    createProp: function (config, root, registry, objId) {
        const getVal = (obj, prop) => {
            if (!obj) return null;
            if (obj[prop] !== undefined) return obj[prop];
            const lower = prop.toLowerCase();
            for (let k in obj) { if (k.toLowerCase() === lower) return obj[k]; }
            return null;
        };

        const parseVec3 = (data, defaultVal = { x: 0, y: 0, z: 0 }) => {
            if (!data) return new BABYLON.Vector3(defaultVal.x, defaultVal.y, defaultVal.z);
            if (Array.isArray(data)) return new BABYLON.Vector3(data[0] ?? defaultVal.x, data[1] ?? defaultVal.y, data[2] ?? defaultVal.z);
            return new BABYLON.Vector3(
                getVal(data, "x") ?? defaultVal.x,
                getVal(data, "y") ?? defaultVal.y,
                getVal(data, "z") ?? defaultVal.z
            );
        };

        const id = getVal(config, "Id") || "p_" + Math.random().toString(36).substr(2, 5);
        const shape = (getVal(config, "Shape") || "Box").toLowerCase();
        const scale = parseVec3(getVal(config, "Scale"), { x: 1, y: 1, z: 1 });
        const pos = parseVec3(getVal(config, "Position"));
        const rot = parseVec3(getVal(config, "Rotation"));

        // Use the building's object ID for the mesh name so the bulldozer can find it
        const meshName = "object_" + objId;

        let mesh;
        if (shape === "sphere") mesh = BABYLON.MeshBuilder.CreateSphere(meshName, { diameter: 1 }, this.scene);
        else if (shape === "cylinder") mesh = BABYLON.MeshBuilder.CreateCylinder(meshName, { diameter: 1, height: 1 }, this.scene);
        else mesh = BABYLON.MeshBuilder.CreateBox(meshName, { size: 1 }, this.scene);

        mesh.scaling = scale;
        mesh.position = pos;
        mesh.rotation = new BABYLON.Vector3(
            BABYLON.Tools.ToRadians(rot.x),
            BABYLON.Tools.ToRadians(rot.y),
            BABYLON.Tools.ToRadians(rot.z)
        );

        const parentId = getVal(config, "ParentId");
        if (parentId && registry.has(parentId)) {
            mesh.parent = registry.get(parentId);
        } else {
            mesh.parent = root;
        }

        mesh.material = this.createPBR(id, config);
        mesh.isPickable = true;
        registry.set(id, mesh);
    },

    createPBR: function (id, config) {
        const getVal = (obj, prop) => {
            if (!obj) return null;
            if (obj[prop] !== undefined) return obj[prop];
            const lower = prop.toLowerCase();
            for (let k in obj) { if (k.toLowerCase() === lower) return obj[k]; }
            return null;
        };

        const mat = new BABYLON.PBRMaterial("pbr_" + id, this.scene);
        const colHex = getVal(config, "ColorHex");
        mat.albedoColor = colHex ? BABYLON.Color3.FromHexString(colHex) : new BABYLON.Color3(0.5, 0.5, 0.5);
        mat.metallic = 0;
        mat.roughness = 0.5;

        const matType = (getVal(config, "Material") || "Plastic").toLowerCase();
        if (matType.includes("metal")) {
            mat.metallic = 1.0;
            mat.roughness = 0.1;
        } else if (matType.includes("glass")) {
            mat.alpha = 0.4;
            mat.transparencyMode = BABYLON.PBRMaterial.PBR_ALPHABLEND;
        } else if (matType.includes("glow")) {
            mat.emissiveColor = mat.albedoColor;
            mat.emissiveIntensity = 2.0;
        }

        return mat;
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
        if (enabled) this.isBulldozing = false; // Mutually exclusive
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

    toggleBulldozer: function (enabled) {
        this.isBulldozing = enabled;
        if (enabled) {
            this.isBuilding = false;
            if (this.previewNode) {
                this.previewNode.dispose();
                this.previewNode = null;
            }
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

    setTargetDestination: function (point) {
        this.targetDestination = point;

        // Show/Create marker
        if (!this.moveMarker) {
            this.moveMarker = BABYLON.MeshBuilder.CreateTorus("moveMarker", { thickness: 0.1, diameter: 0.8 }, this.scene);
            const mat = new BABYLON.StandardMaterial("moveMarkerMat", this.scene);
            mat.emissiveColor = new BABYLON.Color3(1, 1, 0); // Yellow glow
            mat.alpha = 0.5;
            this.moveMarker.material = mat;
            this.moveMarker.isPickable = false;
        }

        this.moveMarker.position = point.add(new BABYLON.Vector3(0, 0.05, 0));
        this.moveMarker.isVisible = true;

        // Animation for the marker
        this.moveMarker.scaling.set(1, 1, 1);
        const anim = new BABYLON.Animation("markerPulse", "scaling", 30, BABYLON.Animation.ANIMATIONTYPE_VECTOR3, BABYLON.Animation.ANIMATIONLOOPMODE_CYCLE);
        anim.setKeys([{ frame: 0, value: new BABYLON.Vector3(1, 1, 1) }, { frame: 15, value: new BABYLON.Vector3(1.2, 1.2, 1.2) }, { frame: 30, value: new BABYLON.Vector3(1, 1, 1) }]);
        this.moveMarker.animations = [anim];
        this.scene.beginAnimation(this.moveMarker, 0, 30, true);
    },

    hasJoined: false,
    handleMovement: function () {
        const isSkating = this.transportMode === "skate";
        const isScooting = this.transportMode === "scooter";
        const speed = isScooting ? 0.28 : (isSkating ? 0.25 : 0.15);
        const rotateSpeed = 0.04;
        let isMoving = false;

        // Keyboard overrides auto-movement
        const hasKeyboardInput = this.inputMap["w"] || this.inputMap["s"] || this.inputMap["a"] || this.inputMap["d"];
        if (hasKeyboardInput) {
            this.targetDestination = null;
            if (this.moveMarker) this.moveMarker.isVisible = false;
        }

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

        // Automated Movement (Point-to-Click)
        if (this.targetDestination && !hasKeyboardInput) {
            const dist = BABYLON.Vector2.Distance(
                new BABYLON.Vector2(this.player.position.x, this.player.position.z),
                new BABYLON.Vector2(this.targetDestination.x, this.targetDestination.z)
            );

            if (dist > 0.5) {
                // Calculate target angle
                const diff = this.targetDestination.subtract(this.player.position);
                const targetAngle = Math.atan2(diff.x, diff.z);

                // Rotate smoothly
                const angleDiff = BABYLON.Scalar.DeltaAngle(this.player.rotation.y, targetAngle);
                if (Math.abs(angleDiff) > 0.1) {
                    this.player.rotation.y += Math.sign(angleDiff) * rotateSpeed;
                } else {
                    // Move forward if facing correctly
                    this.player.moveWithCollisions(this.player.forward.scale(speed));
                    isMoving = true;
                }
            } else {
                // Arrived
                this.targetDestination = null;
                if (this.moveMarker) this.moveMarker.isVisible = false;
            }
        }

        // Animate Limbs
        if (isMoving) {
            this.walkTimer += (isSkating || isScooting) ? 0.08 : 0.125;
            const swing = Math.sin(this.walkTimer) * 0.25;

            if (isSkating) {
                // Skateboard Animation (Pushing)
                this.player.limbs.leftLeg.rotation.x = 0.2;
                this.player.limbs.rightLeg.rotation.x = -swing * 2;
                this.player.limbs.leftArm.rotation.x = -0.4;
                this.player.limbs.rightArm.rotation.x = 0.4;
                this.player.limbs.torso.rotation.x = 0.15;
            } else if (isScooting) {
                // Scooter Animation
                // Hands on handlebars
                this.player.limbs.leftArm.rotation.x = 1.0;
                this.player.limbs.rightArm.rotation.x = 1.0;
                // Left leg on deck
                this.player.limbs.leftLeg.rotation.x = 0.1;
                // Right leg pushes
                this.player.limbs.rightLeg.rotation.x = -swing * 2.2;
                this.player.limbs.torso.rotation.x = 0.1;
            } else {
                // Walking Animation
                this.player.limbs.leftLeg.rotation.x = swing;
                this.player.limbs.rightLeg.rotation.x = -swing;
                this.player.limbs.leftArm.rotation.x = -swing;
                this.player.limbs.rightArm.rotation.x = swing;
                this.player.limbs.torso.rotation.x = 0;
            }

            // Slight body bob
            this.player.limbs.torso.position.y = 1.2 + Math.abs(swing) * 0.05;
        } else {
            // Smoothly return to neutral position
            const lerpSpeed = 0.1;
            this.player.limbs.leftLeg.rotation.x *= (1 - lerpSpeed);
            this.player.limbs.rightLeg.rotation.x *= (1 - lerpSpeed);
            this.player.limbs.leftArm.rotation.x *= (1 - lerpSpeed);
            this.player.limbs.rightArm.rotation.x *= (1 - lerpSpeed);
            this.player.limbs.torso.rotation.x *= (1 - lerpSpeed);
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

        // Skateboard (hidden by default)
        this.createSkateboard();
        // Scooter (hidden by default)
        this.createScooter();

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
                ghost.targetTransportMode = p.transportMode || "walk";
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
            const now = Date.now();
            for (let id in this.ghostPlayers) {
                const ghost = this.ghostPlayers[id];
                if (ghost.targetPosition) {
                    const wasMoving = BABYLON.Vector3.Distance(ghost.position, ghost.targetPosition) > 0.05;

                    // Smoothly LERP position and rotation
                    ghost.position = BABYLON.Vector3.Lerp(ghost.position, ghost.targetPosition, 0.1);
                    ghost.rotation.y = BABYLON.Scalar.LerpAngle(ghost.rotation.y, ghost.targetRotationY, 0.1);

                    // Handle Transport visibility
                    if (ghost.skateboard) {
                        ghost.skateboard.setEnabled(ghost.targetTransportMode === "skate");
                    }
                    if (ghost.scooter) {
                        ghost.scooter.setEnabled(ghost.targetTransportMode === "scooter");
                    }

                    // Simple Ghost Animation
                    if (wasMoving) {
                        const isSkating = ghost.targetTransportMode === "skate";
                        const isScooting = ghost.targetTransportMode === "scooter";
                        const swing = Math.sin(now * 0.008) * 0.25;
                        ghost.getChildMeshes().forEach(m => {
                            if (m.name === "leftLegGhost") {
                                m.rotation.x = (isSkating || isScooting) ? 0.2 : swing;
                            }
                            if (m.name === "rightLegGhost") {
                                m.rotation.x = (isSkating || isScooting) ? -swing * 2 : -swing;
                            }
                            if (m.name === "leftArmGhost") {
                                m.rotation.x = isScooting ? 1.0 : (isSkating ? -0.4 : -swing);
                            }
                            if (m.name === "rightArmGhost") {
                                m.rotation.x = isScooting ? 1.0 : (isSkating ? 0.4 : swing);
                            }
                        });
                    }
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
        namePlane.material = nameMaterial;

        // Ghost Skateboard & Scooter
        ghost.skateboard = this.createSkateboard(ghost);
        ghost.scooter = this.createScooter(ghost);

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
                        rot,
                        this.transportMode
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
    },

    createScooter: function (parent = null) {
        const root = parent || this.player;
        const scooterRoot = new BABYLON.TransformNode("scooterRoot", this.scene);
        scooterRoot.parent = root;
        scooterRoot.position.y = 0.1;
        scooterRoot.setEnabled(false);

        const metalMat = new BABYLON.StandardMaterial("scooterMetalMat", this.scene);
        metalMat.diffuseColor = new BABYLON.Color3(0.7, 0.7, 0.7);

        const deckMat = new BABYLON.StandardMaterial("scooterDeckMat", this.scene);
        deckMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);

        const wheelMat = new BABYLON.StandardMaterial("scooterWheelMat", this.scene);
        wheelMat.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.2);

        // Deck
        const deck = BABYLON.MeshBuilder.CreateBox("scooterDeck", { width: 0.4, height: 0.05, depth: 1.0 }, this.scene);
        deck.parent = scooterRoot;
        deck.material = deckMat;

        // Steering Column
        const pole = BABYLON.MeshBuilder.CreateBox("scooterPole", { width: 0.05, height: 1.4, depth: 0.05 }, this.scene);
        pole.parent = scooterRoot;
        pole.position.set(0, 0.7, -0.45);
        pole.material = metalMat;

        // Handlebars
        const bars = BABYLON.MeshBuilder.CreateBox("scooterBars", { width: 0.8, height: 0.05, depth: 0.05 }, this.scene);
        bars.parent = pole;
        bars.position.y = 0.7;
        bars.material = metalMat;

        // Grips
        const gripMat = new BABYLON.StandardMaterial("gripMat", this.scene);
        gripMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);

        const gripL = BABYLON.MeshBuilder.CreateBox("gripL", { width: 0.2, height: 0.06, depth: 0.06 }, this.scene);
        gripL.parent = bars;
        gripL.position.x = -0.3;
        gripL.material = gripMat;

        const gripR = BABYLON.MeshBuilder.CreateBox("gripR", { width: 0.2, height: 0.06, depth: 0.06 }, this.scene);
        gripR.parent = bars;
        gripR.position.x = 0.3;
        gripR.material = gripMat;

        // Wheels
        const wheel1 = BABYLON.MeshBuilder.CreateCylinder("scooterWheel1", { diameter: 0.2, height: 0.08 }, this.scene);
        wheel1.parent = scooterRoot;
        wheel1.position.set(0, -0.05, 0.45);
        wheel1.rotation.z = Math.PI / 2;
        wheel1.material = wheelMat;

        const wheel2 = BABYLON.MeshBuilder.CreateCylinder("scooterWheel2", { diameter: 0.2, height: 0.08 }, this.scene);
        wheel2.parent = scooterRoot;
        wheel2.position.set(0, -0.05, -0.45);
        wheel2.rotation.z = Math.PI / 2;
        wheel2.material = wheelMat;

        if (!parent) {
            this.player.scooter = scooterRoot;
        }
        return scooterRoot;
    },

    setTransportVisibility: function (mode) {
        if (this.player) {
            if (this.player.skateboard) this.player.skateboard.setEnabled(mode === "skate");
            if (this.player.scooter) this.player.scooter.setEnabled(mode === "scooter");
        }
    },

    setTransportMode: function (mode) {
        this.transportMode = mode;
        this.setTransportVisibility(mode);
    },

    scrollToBottom: function (element) {
        if (element) {
            element.scrollTop = element.scrollHeight;
        }
    }
};
