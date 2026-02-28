window.tsFamilyEngine = {
    canvas: null,
    engine: null,
    scene: null,
    camera: null,
    player: null,
    hasJoined: false,
    userId: localStorage.getItem("tsFamilyUserId") || (function () {
        const id = "user_" + Math.random().toString(36).substr(2, 9);
        localStorage.setItem("tsFamilyUserId", id);
        return id;
    })(),

    // State
    isBuilding: false,
    isBulldozing: false,
    selectedBlueprintId: "apple_tree",
    previewNode: null,
    transportMode: "walk",
    isRCMode: false,
    playerName: "Guest",
    lastSyncTime: 0,
    syncThrottle: 1000, // 1 second (Configurable: increase to reduce DB load, decrease for smoother movement)

    init: async function (canvasId) {
        console.log("TS Engine Initializing. User ID:", this.userId);
        this.canvas = document.getElementById(canvasId);
        this.engine = new BABYLON.Engine(this.canvas, true);

        // Initialize Modules
        this.scene = this.createScene();
        window.tsAssets.init(this.scene);
        window.tsInput.init(this.scene, this.engine);
        window.tsWorld.init(this.scene);
        window.tsRecreation.init(this.scene, this.camera);

        await window.tsAssets.loadAssets();
        window.tsWorld.setupWorldSync();
        window.tsRecreation.setupMultiplayer();

        this.engine.runRenderLoop(() => {
            if (this.player && this.hasJoined) {
                if (this.isRCMode) {
                    window.tsInput.handleRCMovement(window.tsRecreation.activeRC, this.transportMode, this.userId, this.playerName);
                } else {
                    window.tsInput.handleMovement(this.player, this.transportMode);
                }

                // Throttled Sync
                const now = Date.now();
                if (now - this.lastSyncTime > this.syncThrottle) {
                    this.updateSync();
                    this.lastSyncTime = now;
                }
            }

            if (this.isBuilding) {
                this.updatePlacementPreview();
            }

            window.tsWorld.updateSimulation();
            window.tsRecreation.updateMultiplayer();

            this.scene.render();
        });

        window.addEventListener("resize", () => this.engine.resize());
    },

    createScene: function () {
        const scene = new BABYLON.Scene(this.engine);
        scene.clearColor = new BABYLON.Color4(0.1, 0.1, 0.2, 1);

        // Optimized Camera
        this.camera = new BABYLON.ArcRotateCamera("camera", 4.2, 1.1, 15, BABYLON.Vector3.Zero(), scene);
        this.camera.attachControl(this.canvas, true);
        this.camera.lowerRadiusLimit = 2;
        this.camera.upperRadiusLimit = 50;
        this.camera.wheelPrecision = 50;

        const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
        light.intensity = 0.7;

        this.createEnvironment(scene);
        return scene;
    },

    createEnvironment: function (scene) {
        const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 100, height: 100, subdivisions: 4 }, scene);
        ground.position.y = -0.01; // Prevent Z-fighting
        const gridMat = new BABYLON.GridMaterial("gridMat", scene);
        gridMat.mainColor = new BABYLON.Color3(0.1, 0.2, 0.4); // Stavanger Blue
        gridMat.lineColor = new BABYLON.Color3(0.2, 0.3, 0.5);
        gridMat.gridRatio = 1;
        ground.material = gridMat;

        // Add some basic scenery (legacy trees)
        for (let i = 0; i < 20; i++) {
            this.createTree(scene, new BABYLON.Vector3(Math.random() * 80 - 40, 0, Math.random() * 80 - 40));
        }
    },

    createTree: function (scene, pos) {
        const trunk = BABYLON.MeshBuilder.CreateBox("treeTrunk", { width: 0.3, height: 1, depth: 0.3 }, scene);
        trunk.position = pos.add(new BABYLON.Vector3(0, 0.5, 0));
        const trunkMat = new BABYLON.StandardMaterial("trunkMat", scene);
        trunkMat.diffuseColor = new BABYLON.Color3(0.4, 0.2, 0.1);
        trunk.material = trunkMat;

        const leaves = BABYLON.MeshBuilder.CreateBox("treeLeaves", { size: 1.2 }, scene);
        leaves.position = pos.add(new BABYLON.Vector3(0, 1.5, 0));
        const leafMat = new BABYLON.StandardMaterial("leafMat", scene);
        leafMat.diffuseColor = new BABYLON.Color3(0.1, 0.5, 0.1);
        leaves.material = leafMat;
    },

    // Bridge methods for Blazor/Firebase
    spawnUser: function (name) {
        this.playerName = name;
        this.player = window.tsRecreation.spawnUser(name);
        this.hasJoined = true;
    },

    toggleBuildMode: function (enabled, blueprintId = "apple_tree") {
        this.isBuilding = enabled;
        this.selectedBlueprintId = blueprintId;
        if (this.previewNode) this.previewNode.dispose();

        if (enabled) {
            this.isBulldozing = false;
            const bp = window.tsAssets.blueprints[blueprintId];
            if (bp) {
                this.previewNode = new BABYLON.TransformNode("preview", this.scene);
                if (blueprintId === "apple_tree") window.tsAssets.createVoxelTree(this.previewNode, bp, 123, "preview");
                else if (blueprintId === "park_bench") window.tsAssets.createVoxelBench(this.previewNode, bp, "preview");
                else if (blueprintId === "red_house") window.tsAssets.createVoxelHouse(this.previewNode, bp, "preview");
                else if (blueprintId === "street_light") window.tsAssets.createVoxelStreetLight(this.previewNode, bp, "preview");
                else if (blueprintId === "dog") window.tsAssets.createVoxelDog(this.previewNode, bp, "preview");
                else if (blueprintId === "cat") window.tsAssets.createVoxelCat(this.previewNode, bp, "preview");
                else if (bp.recipe) window.tsAssets.createVoxelRecipe(this.previewNode, bp, "preview");

                this.previewNode.getChildMeshes().forEach(m => {
                    m.isPickable = false;
                    if (m.material) {
                        const ghostMat = m.material.clone("ghost");
                        ghostMat.alpha = 0.5;
                        m.material = ghostMat;
                    }
                });
            }
        }
    },

    updatePlacementPreview: function () {
        if (!this.previewNode) return;
        const pickInfo = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh) => mesh.name === "ground");
        if (pickInfo.hit) {
            this.previewNode.position = pickInfo.pickedPoint;
        }
    },

    toggleBulldozer: function (enabled) {
        this.isBulldozing = enabled;
        if (enabled) this.toggleBuildMode(false);
    },

    placeObject: function (point) {
        if (window.firebaseManager) {
            window.firebaseManager.addWorldObject({
                type: this.selectedBlueprintId,
                x: point.x,
                y: point.y,
                z: point.z,
                ry: 0,
                seed: Math.floor(Math.random() * 1000)
            });
        }
    },

    updateSync: function () {
        if (!window.firebaseManager || !this.hasJoined) return;

        if (this.isRCMode && window.tsRecreation.activeRC) {
            window.firebaseManager.updatePlayerRC(
                this.userId,
                window.tsRecreation.activeRC.position,
                window.tsRecreation.activeRC.rotation.y,
                this.transportMode,
                this.playerName
            );
        } else if (this.player) {
            window.firebaseManager.updatePlayerPosition(
                this.userId,
                this.playerName,
                this.player.position,
                this.player.rotation.y,
                this.transportMode
            );
        }
    },

    initChat: function (dotNetRef) {
        if (window.firebaseManager) {
            window.firebaseManager.listenForChat((msg) => {
                dotNetRef.invokeMethodAsync("ReceiveChatMessage", msg.name, msg.text);
            });
        }
    },

    sendChat: function (message) {
        if (window.firebaseManager) {
            window.firebaseManager.sendChat(this.userId, "User", message);
        }
    },

    setTransportMode: function (mode) {
        window.tsRecreation.setTransportMode(mode);
    },

    scrollToBottom: function (element) {
        if (element) {
            element.scrollTop = element.scrollHeight;
        }
    }
};
