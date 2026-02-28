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
    transportMode: "walk", // walk, skate, scooter, bike
    isRCMode: false,
    activeRC: null,
    droneRotors: [],
    blueprints: {},
    worldObjects: {},
    worldPets: {},
    isBuilding: false,
    selectedBlueprintId: "apple_tree",
    previewNode: null,
    targetDestination: null,
    moveMarker: null,
    lastTapTime: 0,
    isBulldozing: false,

    init: async function (canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.engine = new BABYLON.Engine(this.canvas, true);

        this.worldObjects = {};
        this.blueprints = {};
        this.worldPets = {};

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

            // Pet Simulation Loop
            const now = Date.now();
            for (let id in this.worldPets) {
                const pet = this.worldPets[id];
                if (pet.isDisposed()) {
                    delete this.worldPets[id];
                    continue;
                }
                const data = pet.petData;
                const isPreview = (id === "preview");

                if (!data.isMoving && !isPreview) {
                    data.moveTimer -= 1;
                    if (data.moveTimer <= 0) {
                        // Pick random destination within 5 units
                        const angle = Math.random() * Math.PI * 2;
                        const dist = 3 + Math.random() * 5;
                        data.targetPos = pet.position.add(new BABYLON.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist));

                        // Keep within bounds (approximate)
                        data.targetPos.x = Math.max(-45, Math.min(45, data.targetPos.x));
                        data.targetPos.z = Math.max(-45, Math.min(45, data.targetPos.z));

                        data.isMoving = true;
                    }
                } else if (!isPreview) {
                    const distSq = BABYLON.Vector3.DistanceSquared(
                        new BABYLON.Vector3(pet.position.x, 0, pet.position.z),
                        new BABYLON.Vector3(data.targetPos.x, 0, data.targetPos.z)
                    );

                    if (distSq > 0.04) { // 0.2 units
                        const diff = data.targetPos.subtract(pet.position);
                        const targetAngle = Math.atan2(diff.x, diff.z);
                        pet.rotation.y = BABYLON.Scalar.LerpAngle(pet.rotation.y, targetAngle, 0.1);

                        pet.position.addInPlace(pet.forward.scale(data.speed));
                    } else {
                        data.isMoving = false;
                        data.moveTimer = 100 + Math.random() * 200;
                    }
                }

                // Animation loop runs for all, including preview
                const hop = Math.abs(Math.sin(now * 0.01)) * 0.1;
                pet.getChildMeshes().forEach(m => {
                    if (m.name.includes("Body") || m.name.includes("Head") || m.name.includes("Tail")) {
                        // Use base Y offset + hopping
                        let baseY = m.name.includes("Body") ? 0.3 : (m.name.includes("Head") ? 0.2 : 0.1);
                        if (pet.blueprintId === "cat") baseY = m.name.includes("Body") ? 0.25 : (m.name.includes("Head") ? 0.15 : 0.15);
                        m.position.y = baseY + hop;
                    }
                });
            }

            // Drone Rotors
            if (this.isRCMode && this.transportMode === "rc_drone" && this.droneRotors) {
                this.droneRotors.forEach((r, i) => {
                    // Quadcopters have diagonal rotors spinning same direction, adjacent opposite
                    // Let's just alternate for visual flair
                    const speed = (i === 1 || i === 2) ? -0.5 : 0.5;
                    r.rotation.y += speed;
                });
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
                if (this.worldPets[obj.id]) {
                    delete this.worldPets[obj.id];
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
        } else if (obj.type === "dog") {
            this.createVoxelDog(container, bp, obj.id);
        } else if (obj.type === "cat") {
            this.createVoxelCat(container, bp, obj.id);
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

        // Add to pet simulation if it's a pet
        if (obj.type === "dog" || obj.type === "cat") {
            container.petData = {
                targetPos: container.position.clone(),
                moveTimer: Math.random() * 100,
                isMoving: false,
                speed: 0.05
            };
            this.worldPets[obj.id] = container;
        }
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

        // Cleanup existing preview
        if (this.previewNode) {
            this.previewNode.dispose();
            this.previewNode = null;
        }
        if (this.worldObjects["preview"]) {
            this.worldObjects["preview"].dispose();
            delete this.worldObjects["preview"];
        }
        if (this.worldPets["preview"]) {
            delete this.worldPets["preview"];
        }

        if (this.isBuilding) {
            this.previewNode = new BABYLON.TransformNode("preview", this.scene);
            this.renderWorldObject({ id: "preview", type: this.selectedBlueprintId, x: 0, y: 0, z: 0 });

            if (this.worldObjects["preview"]) {
                this.worldObjects["preview"].parent = this.previewNode;

                // Make preview semi-transparent
                this.previewNode.getChildMeshes().forEach(m => {
                    m.visibility = 0.5;
                    m.isPickable = false;
                });
            }
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
        if (this.isRCMode && this.activeRC) {
            this.handleRCMovement();
            return;
        }

        const isSkating = this.transportMode === "skate";
        const isScooting = this.transportMode === "scooter";
        const isCycling = this.transportMode === "bike";
        const speed = isCycling ? 0.3 : (isScooting ? 0.28 : (isSkating ? 0.25 : 0.15));
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
            this.walkTimer += (isSkating || isScooting || isCycling) ? 0.08 : 0.125;
            const swing = Math.sin(this.walkTimer) * 0.25;

            if (isCycling) {
                // Bicycle Animation (Pedaling)
                const pedalSwing = this.walkTimer * 1.25;
                const leftCycle = Math.sin(pedalSwing);
                const rightCycle = Math.sin(pedalSwing + Math.PI);

                this.player.limbs.torso.position.y = 1.0 + Math.cos(this.walkTimer * 5) * 0.02;
                this.player.limbs.torso.rotation.x = 0.2;
                this.player.limbs.leftArm.rotation.x = -1.2;
                this.player.limbs.rightArm.rotation.x = -1.2;
                this.player.limbs.leftUpperLeg.rotation.x = -0.8 + leftCycle * 0.4;
                this.player.limbs.rightUpperLeg.rotation.x = -0.8 + rightCycle * 0.4;
                this.player.limbs.leftLowerLeg.rotation.x = 1.5;
                this.player.limbs.rightLowerLeg.rotation.x = 1.5;
            } else if (isSkating) {
                // Skateboard Animation (Pushing)
                this.player.limbs.leftUpperLeg.rotation.x = 0.2;
                this.player.limbs.leftLowerLeg.rotation.x = 0.1;
                this.player.limbs.rightUpperLeg.rotation.x = -swing * 2;
                this.player.limbs.rightLowerLeg.rotation.x = swing > 0 ? swing : 0;
                this.player.limbs.leftArm.rotation.x = -0.4;
                this.player.limbs.rightArm.rotation.x = 0.4;
                this.player.limbs.torso.rotation.x = 0.15;
                this.player.limbs.torso.position.y = 1.2 + Math.abs(swing) * 0.05;
            } else if (isScooting) {
                // Scooter Animation
                this.player.limbs.leftArm.rotation.x = -1.3;
                this.player.limbs.rightArm.rotation.x = -1.3;
                this.player.limbs.leftUpperLeg.rotation.x = 0.1;
                this.player.limbs.leftLowerLeg.rotation.x = 0.05;
                this.player.limbs.rightUpperLeg.rotation.x = -swing * 2.2;
                this.player.limbs.rightLowerLeg.rotation.x = swing > 0 ? swing : 0;
                this.player.limbs.torso.rotation.x = 0.1;
                this.player.limbs.torso.position.y = 1.2 + Math.abs(swing) * 0.05;
            } else {
                // Walking Animation
                this.player.limbs.leftUpperLeg.rotation.x = swing;
                this.player.limbs.leftLowerLeg.rotation.x = swing < 0 ? -swing : 0;
                this.player.limbs.rightUpperLeg.rotation.x = -swing;
                this.player.limbs.rightLowerLeg.rotation.x = swing > 0 ? swing : 0;
                this.player.limbs.leftArm.rotation.x = -swing;
                this.player.limbs.rightArm.rotation.x = swing;
                this.player.limbs.torso.rotation.x = 0;
                this.player.limbs.torso.position.y = 1.2 + Math.abs(swing) * 0.05;
            }
        } else {
            // Idle: Smoothly return to neutral position
            const lerpSpeed = 0.1;
            this.player.limbs.leftUpperLeg.rotation.x *= (1 - lerpSpeed);
            this.player.limbs.leftLowerLeg.rotation.x *= (1 - lerpSpeed);
            this.player.limbs.rightUpperLeg.rotation.x *= (1 - lerpSpeed);
            this.player.limbs.rightLowerLeg.rotation.x *= (1 - lerpSpeed);
            this.player.limbs.leftArm.rotation.x *= (1 - lerpSpeed);
            this.player.limbs.rightArm.rotation.x *= (1 - lerpSpeed);
            this.player.limbs.torso.rotation.x *= (1 - lerpSpeed);
            this.player.limbs.torso.position.y = 1.2;
            this.walkTimer = 0;
        }

        // Update camera target to follow player
        this.camera.target = this.player.position;
    },

    handleRCMovement: function () {
        if (!this.activeRC) return;

        const isDrone = this.transportMode === "rc_drone";
        const speed = isDrone ? 0.2 : 0.25;
        const rotateSpeed = 0.05;

        // Forward/Backward
        if (this.inputMap["w"]) {
            this.activeRC.position.addInPlace(this.activeRC.forward.scale(speed));
        }
        if (this.inputMap["s"]) {
            this.activeRC.position.addInPlace(this.activeRC.forward.scale(-speed));
        }

        // Rotation
        if (this.inputMap["a"]) {
            this.activeRC.rotation.y -= rotateSpeed;
        }
        if (this.inputMap["d"]) {
            this.activeRC.rotation.y += rotateSpeed;
        }

        // Drone Vertical Movement
        if (isDrone) {
            if (this.inputMap[" "]) { // Space for Up
                this.activeRC.position.y += 0.1;
            }
            if (this.inputMap["shift"]) { // Shift for Down
                this.activeRC.position.y -= 0.1;
                if (this.activeRC.position.y < 0.1) this.activeRC.position.y = 0.1;
            }
        } else {
            // Car Grounding
            this.activeRC.position.y = 0.1;
        }
    },

    handleRCMovement: function () {
        if (!this.activeRC) return;

        const isDrone = this.transportMode === "rc_drone";
        const speed = isDrone ? 0.2 : 0.25;
        const rotateSpeed = 0.05;

        // Forward/Backward
        if (this.inputMap["w"]) {
            this.activeRC.position.addInPlace(this.activeRC.forward.scale(speed));
        }
        if (this.inputMap["s"]) {
            this.activeRC.position.addInPlace(this.activeRC.forward.scale(-speed));
        }

        // Rotation
        if (this.inputMap["a"]) {
            this.activeRC.rotation.y -= rotateSpeed;
        }
        if (this.inputMap["d"]) {
            this.activeRC.rotation.y += rotateSpeed;
        }

        // Drone Vertical Movement
        if (isDrone) {
            if (this.inputMap[" "]) { // Space for Up
                this.activeRC.position.y += 0.1;
            }
            if (this.inputMap["shift"]) { // Shift for Down
                this.activeRC.position.y -= 0.1;
                if (this.activeRC.position.y < 0.1) this.activeRC.position.y = 0.1;
            }
        } else {
            // Car Grounding
            this.activeRC.position.y = 0.1;
        }

        // Sync RC position to Firebase (as a virtual property on the player for simplicity, or a separate collection?)
        // Let's reuse the player sync for now by adding rcPos/rcRot to the player data.
        if (window.firebaseManager && this.hasJoined) {
            window.firebaseManager.updatePlayerRC(this.userId, this.activeRC.position, this.activeRC.rotation.y, this.transportMode);
        }
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

        // Legs (with pivots at hips and knees)
        // Left Leg
        const leftUpperLegPivot = new BABYLON.TransformNode("leftUpperLegPivot", this.scene);
        leftUpperLegPivot.parent = this.player;
        leftUpperLegPivot.position.set(-0.22, 0.8, 0);
        this.player.limbs.leftUpperLeg = leftUpperLegPivot;

        const leftUpperLeg = BABYLON.MeshBuilder.CreateBox("leftUpperLeg", { width: 0.35, height: 0.45, depth: 0.35 }, this.scene);
        leftUpperLeg.parent = leftUpperLegPivot;
        leftUpperLeg.position.y = -0.225;
        leftUpperLeg.material = pantsMat;

        const leftKneePivot = new BABYLON.TransformNode("leftKneePivot", this.scene);
        leftKneePivot.parent = leftUpperLeg;
        leftKneePivot.position.y = -0.225;
        this.player.limbs.leftLowerLeg = leftKneePivot;

        const leftLowerLeg = BABYLON.MeshBuilder.CreateBox("leftLowerLeg", { width: 0.35, height: 0.45, depth: 0.35 }, this.scene);
        leftLowerLeg.parent = leftKneePivot;
        leftLowerLeg.position.y = -0.225;
        leftLowerLeg.material = pantsMat;

        // Right Leg
        const rightUpperLegPivot = new BABYLON.TransformNode("rightUpperLegPivot", this.scene);
        rightUpperLegPivot.parent = this.player;
        rightUpperLegPivot.position.set(0.22, 0.8, 0);
        this.player.limbs.rightUpperLeg = rightUpperLegPivot;

        const rightUpperLeg = BABYLON.MeshBuilder.CreateBox("rightUpperLeg", { width: 0.35, height: 0.45, depth: 0.35 }, this.scene);
        rightUpperLeg.parent = rightUpperLegPivot;
        rightUpperLeg.position.y = -0.225;
        rightUpperLeg.material = pantsMat;

        const rightKneePivot = new BABYLON.TransformNode("rightKneePivot", this.scene);
        rightKneePivot.parent = rightUpperLeg;
        rightKneePivot.position.y = -0.225;
        this.player.limbs.rightLowerLeg = rightKneePivot;

        const rightLowerLeg = BABYLON.MeshBuilder.CreateBox("rightLowerLeg", { width: 0.35, height: 0.45, depth: 0.35 }, this.scene);
        rightLowerLeg.parent = rightKneePivot;
        rightLowerLeg.position.y = -0.225;
        rightLowerLeg.material = pantsMat;

        // Skateboard (hidden by default)
        this.createSkateboard();
        // Scooter (hidden by default)
        this.createScooter();
        // Bicycle (hidden by default)
        this.createBicycle();

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

                // RC Data
                ghost.targetRCMode = p.rcMode || "walk";
                if (p.rcX !== undefined && p.rcX !== null) {
                    ghost.targetRCPosition = new BABYLON.Vector3(p.rcX, p.rcY, p.rcZ);
                    ghost.targetRCRotationY = p.rcRy;
                } else {
                    ghost.targetRCPosition = null;
                }

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
                    if (ghost.bicycle) {
                        ghost.bicycle.setEnabled(ghost.targetTransportMode === "bike");
                    }
                    if (ghost.rcCar) {
                        const isRC = ghost.targetRCMode === "rc_car";
                        ghost.rcCar.setEnabled(isRC);
                        if (isRC && ghost.targetRCPosition) {
                            ghost.rcCar.position = BABYLON.Vector3.Lerp(ghost.rcCar.position, ghost.targetRCPosition, 0.1);
                            ghost.rcCar.rotation.y = BABYLON.Scalar.LerpAngle(ghost.rcCar.rotation.y, ghost.targetRCRotationY, 0.1);
                        }
                    }
                    if (ghost.rcDrone) {
                        const isRC = ghost.targetRCMode === "rc_drone";
                        ghost.rcDroneNode.setEnabled(isRC);
                        if (isRC && ghost.targetRCPosition) {
                            ghost.rcDroneNode.position = BABYLON.Vector3.Lerp(ghost.rcDroneNode.position, ghost.targetRCPosition, 0.1);
                            ghost.rcDroneNode.rotation.y = BABYLON.Scalar.LerpAngle(ghost.rcDroneNode.rotation.y, ghost.targetRCRotationY, 0.1);
                            if (ghost.rcDroneNode.droneRotors) {
                                ghost.rcDroneNode.droneRotors.forEach((r, i) => {
                                    const speed = (i === 1 || i === 2) ? -0.5 : 0.5;
                                    r.rotation.y += speed;
                                });
                            }
                        }
                    }

                    // Simple Ghost Animation
                    if (wasMoving) {
                        const isSkating = ghost.targetTransportMode === "skate";
                        const isScooting = ghost.targetTransportMode === "scooter";
                        const isCycling = ghost.targetTransportMode === "bike";
                        const swing = Math.sin(now * 0.008) * 0.25;
                        ghost.getChildMeshes().forEach(m => {
                            if (m.name === "leftUpperLegGhost") {
                                m.rotation.x = (isSkating || isScooting) ? 0.2 : (isCycling ? -1.0 + Math.sin(now * 0.005) : swing);
                                if (isCycling) m.parent.position.y = 0.5; // Lower hips for bike
                            }
                            if (m.name === "leftLowerLegGhost") {
                                m.rotation.x = (isSkating || isScooting) ? 0.1 : (isCycling ? 1.5 : (swing < 0 ? -swing : 0));
                            }
                            if (m.name === "rightUpperLegGhost") {
                                m.rotation.x = (isSkating || isScooting) ? -swing * 2 : (isCycling ? -1.0 - Math.sin(now * 0.005) : -swing);
                                if (!isCycling) m.parent.position.y = 0.575; // Reset hips
                            }
                            if (m.name === "rightLowerLegGhost") {
                                m.rotation.x = (isSkating || isScooting) ? (swing > 0 ? swing : 0) : (isCycling ? 1.5 : (swing > 0 ? swing : 0));
                            }
                            if (m.name === "leftArmGhost") {
                                m.rotation.x = isCycling ? -1.2 : (isScooting ? -1.3 : (isSkating ? -0.4 : -swing));
                            }
                            if (m.name === "rightArmGhost") {
                                m.rotation.x = isCycling ? -1.2 : (isScooting ? -1.3 : (isSkating ? 0.4 : swing));
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

        const leftUpperLeg = BABYLON.MeshBuilder.CreateBox("leftUpperLegGhost", { width: 0.35, height: 0.45, depth: 0.35 }, this.scene);
        leftUpperLeg.parent = ghost;
        leftUpperLeg.position = new BABYLON.Vector3(-0.2, 0.575, 0); // 0.8 / 2 + offset
        leftUpperLeg.material = pantsMat;

        const leftLowerLeg = BABYLON.MeshBuilder.CreateBox("leftLowerLegGhost", { width: 0.35, height: 0.45, depth: 0.35 }, this.scene);
        leftLowerLeg.parent = leftUpperLeg;
        leftLowerLeg.position = new BABYLON.Vector3(0, -0.45, 0);
        leftLowerLeg.material = pantsMat;

        const rightUpperLeg = BABYLON.MeshBuilder.CreateBox("rightUpperLegGhost", { width: 0.35, height: 0.45, depth: 0.35 }, this.scene);
        rightUpperLeg.parent = ghost;
        rightUpperLeg.position = new BABYLON.Vector3(0.2, 0.575, 0);
        rightUpperLeg.material = pantsMat;

        const rightLowerLeg = BABYLON.MeshBuilder.CreateBox("rightLowerLegGhost", { width: 0.35, height: 0.45, depth: 0.35 }, this.scene);
        rightLowerLeg.parent = rightUpperLeg;
        rightLowerLeg.position = new BABYLON.Vector3(0, -0.45, 0);
        rightLowerLeg.material = pantsMat;

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

        // Ghost Skateboard, Scooter, & Bicycle
        ghost.skateboard = this.createSkateboard(ghost);
        ghost.scooter = this.createScooter(ghost);
        ghost.bicycle = this.createVoxelBicycle(ghost, true);

        // Recreation models (not parented to ghost root so they can move independently)
        ghost.rcCar = this.createRCCar(null, true);
        ghost.rcCar.setEnabled(false);

        ghost.rcDroneNode = new BABYLON.TransformNode("ghostDroneNode_" + id, this.scene);
        ghost.rcDrone = this.createRCDrone(ghost.rcDroneNode, true);
        ghost.rcDroneNode.setEnabled(false);

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

    createSkateboard: function (parent = null) {
        const root = parent || this.player;
        const boardRoot = new BABYLON.TransformNode("skateboardRoot", this.scene);
        boardRoot.parent = root;
        boardRoot.position.y = 0.1;
        boardRoot.setEnabled(false);

        const deckMat = new BABYLON.StandardMaterial("deckMat", this.scene);
        deckMat.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.2);

        const wheelMat = new BABYLON.StandardMaterial("wheelMat", this.scene);
        wheelMat.diffuseColor = new BABYLON.Color3(0.8, 0.8, 0.8);

        // Deck
        const deck = BABYLON.MeshBuilder.CreateBox("deck", { width: 0.5, height: 0.05, depth: 1.2 }, this.scene);
        deck.parent = boardRoot;
        deck.material = deckMat;

        // Wheels
        const wheelPositions = [
            { x: -0.2, z: 0.4 }, { x: 0.2, z: 0.4 },
            { x: -0.2, z: -0.4 }, { x: 0.2, z: -0.4 }
        ];

        wheelPositions.forEach((wp, i) => {
            const wheel = BABYLON.MeshBuilder.CreateCylinder("wheel_" + i, { diameter: 0.15, height: 0.1 }, this.scene);
            wheel.parent = boardRoot;
            wheel.position.set(wp.x, -0.05, wp.z);
            wheel.rotation.z = Math.PI / 2;
            wheel.material = wheelMat;
        });

        if (!parent) {
            this.player.skateboard = boardRoot;
        }
        return boardRoot;
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

        // Deck (Increased length)
        const deck = BABYLON.MeshBuilder.CreateBox("scooterDeck", { width: 0.4, height: 0.05, depth: 1.4 }, this.scene);
        deck.parent = scooterRoot;
        deck.material = deckMat;

        // Steering Column (Move further forward: z = 0.65)
        const pole = BABYLON.MeshBuilder.CreateBox("scooterPole", { width: 0.05, height: 1.4, depth: 0.05 }, this.scene);
        pole.parent = scooterRoot;
        pole.position.set(0, 0.7, 0.65);
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

        // Wheels (Adjusted for longer deck)
        const wheel1 = BABYLON.MeshBuilder.CreateCylinder("scooterWheel1", { diameter: 0.2, height: 0.08 }, this.scene);
        wheel1.parent = scooterRoot;
        wheel1.position.set(0, -0.05, 0.6);
        wheel1.rotation.z = Math.PI / 2;
        wheel1.material = wheelMat;

        const wheel2 = BABYLON.MeshBuilder.CreateCylinder("scooterWheel2", { diameter: 0.2, height: 0.08 }, this.scene);
        wheel2.parent = scooterRoot;
        wheel2.position.set(0, -0.05, -0.6);
        wheel2.rotation.z = Math.PI / 2;
        wheel2.material = wheelMat;

        if (!parent) {
            this.player.scooter = scooterRoot;
        }
        return scooterRoot;
    },

    createBicycle: function (parent = null) {
        const root = parent || this.player;
        const bikeRoot = new BABYLON.TransformNode("bicycleRoot", this.scene);
        bikeRoot.parent = root;
        bikeRoot.position.y = 0;
        bikeRoot.setEnabled(false);

        const frameMat = new BABYLON.StandardMaterial("bikeFrameMat", this.scene);
        frameMat.diffuseColor = new BABYLON.Color3(0.8, 0.2, 0.2); // Red bike

        const tireMat = new BABYLON.StandardMaterial("tireMat", this.scene);
        tireMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);

        const metalMat = new BABYLON.StandardMaterial("bikeMetalMat", this.scene);
        metalMat.diffuseColor = new BABYLON.Color3(0.7, 0.7, 0.7);

        // Frame
        const bar1 = BABYLON.MeshBuilder.CreateBox("bikeBar1", { width: 0.05, height: 1.0, depth: 0.05 }, this.scene);
        bar1.parent = bikeRoot;
        bar1.position.set(0, 0.5, 0.1);
        bar1.rotation.x = -0.5;
        bar1.material = frameMat;

        const bar2 = BABYLON.MeshBuilder.CreateBox("bikeBar2", { width: 0.05, height: 0.8, depth: 0.05 }, this.scene);
        bar2.parent = bikeRoot;
        bar2.position.set(0, 0.6, 0.5);
        bar2.rotation.x = 0.5;
        bar2.material = frameMat;

        const topBar = BABYLON.MeshBuilder.CreateBox("bikeTopBar", { width: 0.05, height: 0.8, depth: 0.05 }, this.scene);
        topBar.parent = bikeRoot;
        topBar.position.set(0, 0.8, 0.25);
        topBar.rotation.x = Math.PI / 2;
        topBar.material = frameMat;

        // Seat
        const seat = BABYLON.MeshBuilder.CreateBox("bikeSeat", { width: 0.25, height: 0.05, depth: 0.4 }, this.scene);
        seat.parent = bikeRoot;
        seat.position.set(0, 0.9, -0.1);
        seat.material = tireMat;

        // Handlebars
        const stem = BABYLON.MeshBuilder.CreateBox("bikeStem", { width: 0.05, height: 0.4, depth: 0.05 }, this.scene);
        stem.parent = bikeRoot;
        stem.position.set(0, 1.0, 0.65);
        stem.material = metalMat;

        const bars = BABYLON.MeshBuilder.CreateBox("bikeBars", { width: 0.8, height: 0.05, depth: 0.05 }, this.scene);
        bars.parent = stem;
        bars.position.y = 0.2;
        bars.material = metalMat;

        // Wheels
        const wheelF = BABYLON.MeshBuilder.CreateCylinder("wheelF", { diameter: 0.8, height: 0.1 }, this.scene);
        wheelF.parent = bikeRoot;
        wheelF.position.set(0, 0.4, 0.8);
        wheelF.rotation.z = Math.PI / 2;
        wheelF.material = tireMat;

        const wheelR = BABYLON.MeshBuilder.CreateCylinder("wheelR", { diameter: 0.8, height: 0.1 }, this.scene);
        wheelR.parent = bikeRoot;
        wheelR.position.set(0, 0.4, -0.4);
        wheelR.rotation.z = Math.PI / 2;
        wheelR.material = tireMat;

        if (!parent) {
            this.player.bicycle = bikeRoot;
        }
        return bikeRoot;
    },

    setTransportVisibility: function (mode) {
        if (this.player) {
            if (this.player.skateboard) this.player.skateboard.setEnabled(mode === "skate");
            if (this.player.scooter) this.player.scooter.setEnabled(mode === "scooter");
            if (this.player.bicycle) this.player.bicycle.setEnabled(mode === "bike");
        }
    },

    setTransportMode: function (mode) {
        // Cleanup existing RC if switching
        if (this.isRCMode && (mode !== "rc_car" && mode !== "rc_drone")) {
            this.toggleRCMode(false);
        }

        this.transportMode = mode;
        this.setTransportVisibility(mode);

        if (mode === "rc_car" || mode === "rc_drone") {
            this.toggleRCMode(true, mode);
        }
    },

    toggleRCMode: function (enabled, mode) {
        this.isRCMode = enabled;
        if (enabled) {
            if (!this.player) return;
            if (this.activeRC) this.activeRC.dispose();

            this.activeRC = new BABYLON.TransformNode("activeRC", this.scene);
            this.activeRC.position = this.player.position.clone();
            this.activeRC.position.y = (mode === "rc_drone" ? 1.5 : 0.1);

            if (mode === "rc_car") this.createRCCar(this.activeRC);
            else this.createRCDrone(this.activeRC);

            this.setupChaseCamera(this.activeRC);
        } else {
            if (this.activeRC) {
                this.activeRC.dispose();
                this.activeRC = null;
            }
            this.droneRotors = []; // Clear rotors
            if (window.firebaseManager && this.hasJoined) {
                window.firebaseManager.updatePlayerRC(this.userId, null, null, "walk"); // Signals despawn
            }
            this.resetCamera();
        }
    },


    setupChaseCamera: function (target) {
        if (!this.camera) return;
        this.camera.lockedTarget = target;
        this.camera.radius = 5;
        this.camera.alpha = Math.PI / 2;
        this.camera.beta = Math.PI / 3;
    },

    resetCamera: function () {
        if (!this.camera) return;
        this.camera.lockedTarget = this.player;
        this.camera.radius = 15;
        this.camera.alpha = 4.2;
        this.camera.beta = 1.1;
    },

    createRCCar: function (parent, isGhost = false) {
        const idSuffix = isGhost ? "Ghost" : "";
        const bodyMat = new BABYLON.StandardMaterial("rcCarMat" + idSuffix, this.scene);
        bodyMat.diffuseColor = isGhost ? new BABYLON.Color3(0.5, 0.5, 0.5) : new BABYLON.Color3(1, 0.1, 0.1);

        const glassMat = new BABYLON.StandardMaterial("rcGlassMat" + idSuffix, this.scene);
        glassMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.2);
        glassMat.alpha = 0.8;

        const tireMat = new BABYLON.StandardMaterial("rcTireMat" + idSuffix, this.scene);
        tireMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);

        // Chassis
        const body = BABYLON.MeshBuilder.CreateBox("rcBody" + idSuffix, { width: 0.4, height: 0.15, depth: 0.7 }, this.scene);
        body.parent = parent;
        body.position.y = 0.1;
        body.material = bodyMat;

        const cabin = BABYLON.MeshBuilder.CreateBox("rcCabin" + idSuffix, { width: 0.3, height: 0.15, depth: 0.3 }, this.scene);
        cabin.parent = body;
        cabin.position.y = 0.15;
        cabin.position.z = -0.1;
        cabin.material = glassMat;

        // Wheels
        [[-0.2, 0, 0.2], [0.2, 0, 0.2], [-0.2, 0, -0.2], [0.2, 0, -0.2]].forEach((pos, i) => {
            const wheel = BABYLON.MeshBuilder.CreateCylinder("rcWheel" + idSuffix + i, { diameter: 0.2, height: 0.08 }, this.scene);
            wheel.parent = body;
            wheel.position.set(pos[0], -0.05, pos[2]);
            wheel.rotation.z = Math.PI / 2;
            wheel.material = tireMat;
        });
        return body;
    },

    createRCDrone: function (parent, isGhost = false) {
        const idSuffix = isGhost ? "Ghost" : "";
        const bodyMat = new BABYLON.StandardMaterial("droneMat" + idSuffix, this.scene);
        bodyMat.diffuseColor = isGhost ? new BABYLON.Color3(0.3, 0.3, 0.3) : new BABYLON.Color3(0.2, 0.2, 0.2);

        const neonMat = new BABYLON.StandardMaterial("droneNeon" + idSuffix, this.scene);
        neonMat.emissiveColor = isGhost ? new BABYLON.Color3(0.5, 0.5, 0.5) : new BABYLON.Color3(0, 1, 0);

        // Body
        const body = BABYLON.MeshBuilder.CreateBox("droneBody" + idSuffix, { width: 0.2, height: 0.1, depth: 0.2 }, this.scene);
        body.parent = parent;
        body.material = bodyMat;

        // Arms
        const rotors = [];
        const offsets = [
            { x: -0.15, z: 0.15, rot: 3 * Math.PI / 4 }, // Top Left
            { x: 0.15, z: 0.15, rot: Math.PI / 4 },      // Top Right
            { x: -0.15, z: -0.15, rot: 5 * Math.PI / 4 }, // Bottom Left
            { x: 0.15, z: -0.15, rot: 7 * Math.PI / 4 }   // Bottom Right
        ];

        offsets.forEach((o, i) => {
            const arm = BABYLON.MeshBuilder.CreateBox("droneArm" + idSuffix + i, { width: 0.3, height: 0.03, depth: 0.03 }, this.scene);
            arm.parent = body;
            arm.rotation.y = o.rot;
            // Position arm so it starts at body edge
            arm.position.x = o.x / 2;
            arm.position.z = o.z / 2;
            arm.material = bodyMat;

            const rotor = BABYLON.MeshBuilder.CreateBox("rotor" + idSuffix + i, { width: 0.3, height: 0.01, depth: 0.03 }, this.scene);
            rotor.parent = arm;
            rotor.position.x = 0.15; // Move to tip of arm
            rotor.position.y = 0.03;
            rotor.material = neonMat;
            rotors.push(rotor);

            // Landing Legs
            const leg = BABYLON.MeshBuilder.CreateBox("droneLeg" + idSuffix + i, { width: 0.03, height: 0.1, depth: 0.03 }, this.scene);
            leg.parent = arm;
            leg.position.x = 0.15;
            leg.position.y = -0.05;
            leg.material = bodyMat;
        });

        if (!isGhost) {
            this.droneRotors = rotors;
        } else {
            parent.droneRotors = rotors;
        }
        return body;
    },

    scrollToBottom: function (element) {
        if (element) {
            element.scrollTop = element.scrollHeight;
        }
    },

    createVoxelDog: function (parent, bp, objId) {
        const bodyMat = new BABYLON.StandardMaterial("dogBodyMat", this.scene);
        bodyMat.diffuseColor = BABYLON.Color3.FromHexString(bp.bodyColor || "#8D6E63");

        const earMat = new BABYLON.StandardMaterial("dogEarMat", this.scene);
        earMat.diffuseColor = BABYLON.Color3.FromHexString(bp.earColor || "#5D4037");

        // Body
        const body = BABYLON.MeshBuilder.CreateBox("object_" + objId + "_Body", { width: 0.3, height: 0.3, depth: 0.6 }, this.scene);
        body.parent = parent;
        body.position.y = 0.3;
        body.material = bodyMat;
        body.isPickable = true;

        // Head
        const head = BABYLON.MeshBuilder.CreateBox("object_" + objId + "_Head", { size: 0.25 }, this.scene);
        head.parent = body;
        head.position.set(0, 0.2, 0.3);
        head.material = bodyMat;

        // Snout
        const snout = BABYLON.MeshBuilder.CreateBox("dogSnout", { width: 0.15, height: 0.12, depth: 0.15 }, this.scene);
        snout.parent = head;
        snout.position.set(0, -0.05, 0.15);
        snout.material = bodyMat;

        // Ears
        const earL = BABYLON.MeshBuilder.CreateBox("dogEarL", { width: 0.05, height: 0.15, depth: 0.1 }, this.scene);
        earL.parent = head;
        earL.position.set(-0.1, 0.1, 0);
        earL.material = earMat;

        const earR = BABYLON.MeshBuilder.CreateBox("dogEarR", { width: 0.05, height: 0.15, depth: 0.1 }, this.scene);
        earR.parent = head;
        earR.position.set(0.1, 0.1, 0);
        earR.material = earMat;

        // Legs
        const legSize = { width: 0.08, height: 0.2, depth: 0.08 };
        const legPos = [
            { x: -0.1, z: 0.2 }, { x: 0.1, z: 0.2 },
            { x: -0.1, z: -0.2 }, { x: 0.1, z: -0.2 }
        ];
        legPos.forEach((p, i) => {
            const leg = BABYLON.MeshBuilder.CreateBox("dogLeg" + i, legSize, this.scene);
            leg.parent = body;
            leg.position.set(p.x, -0.15, p.z);
            leg.material = bodyMat;
        });

        // Tail
        const tail = BABYLON.MeshBuilder.CreateBox("object_" + objId + "_Tail", { width: 0.05, height: 0.05, depth: 0.2 }, this.scene);
        tail.parent = body;
        tail.position.set(0, 0.1, -0.35);
        tail.rotation.x = 0.5;
        tail.material = bodyMat;

        return body;
    },

    createVoxelCat: function (parent, bp, objId) {
        const bodyMat = new BABYLON.StandardMaterial("catBodyMat", this.scene);
        bodyMat.diffuseColor = BABYLON.Color3.FromHexString(bp.bodyColor || "#9E9E9E");

        const eyeMat = new BABYLON.StandardMaterial("catEyeMat", this.scene);
        eyeMat.diffuseColor = BABYLON.Color3.FromHexString(bp.eyeColor || "#76FF03");

        // Body
        const body = BABYLON.MeshBuilder.CreateBox("object_" + objId + "_Body", { width: 0.25, height: 0.25, depth: 0.5 }, this.scene);
        body.parent = parent;
        body.position.y = 0.25;
        body.material = bodyMat;
        body.isPickable = true;

        // Head
        const head = BABYLON.MeshBuilder.CreateBox("object_" + objId + "_Head", { size: 0.22 }, this.scene);
        head.parent = body;
        head.position.set(0, 0.15, 0.25);
        head.material = bodyMat;

        // Ears
        const earL = BABYLON.MeshBuilder.CreateBox("catEarL", { width: 0.08, height: 0.08, depth: 0.05 }, this.scene);
        earL.parent = head;
        earL.position.set(-0.07, 0.12, 0);
        earL.material = bodyMat;

        const earR = BABYLON.MeshBuilder.CreateBox("catEarR", { width: 0.08, height: 0.08, depth: 0.05 }, this.scene);
        earR.parent = head;
        earR.position.set(0.07, 0.12, 0);
        earR.material = bodyMat;

        // Eyes
        const eyeL = BABYLON.MeshBuilder.CreateBox("catEyeL", { width: 0.05, height: 0.05, depth: 0.02 }, this.scene);
        eyeL.parent = head;
        eyeL.position.set(-0.06, 0.05, 0.11);
        eyeL.material = eyeMat;

        const eyeR = BABYLON.MeshBuilder.CreateBox("catEyeR", { width: 0.05, height: 0.05, depth: 0.02 }, this.scene);
        eyeR.parent = head;
        eyeR.position.set(0.06, 0.05, 0.11);
        eyeR.material = eyeMat;

        // Legs
        const legSize = { width: 0.07, height: 0.15, depth: 0.07 };
        const legPos = [
            { x: -0.08, z: 0.18 }, { x: 0.08, z: 0.18 },
            { x: -0.08, z: -0.18 }, { x: 0.08, z: -0.18 }
        ];
        legPos.forEach((p, i) => {
            const leg = BABYLON.MeshBuilder.CreateBox("catLeg" + i, legSize, this.scene);
            leg.parent = body;
            leg.position.set(p.x, -0.12, p.z);
            leg.material = bodyMat;
        });

        // Tail (curved up)
        const tail = BABYLON.MeshBuilder.CreateBox("object_" + objId + "_Tail", { width: 0.04, height: 0.3, depth: 0.04 }, this.scene);
        tail.parent = body;
        tail.position.set(0, 0.15, -0.25);
        tail.rotation.x = -0.3;
        tail.material = bodyMat;

        return body;
    }
};
