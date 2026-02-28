window.tsRecreation = {
    scene: null,
    camera: null,
    player: null,
    ghosts: {},
    isRCMode: false,
    activeRC: null,
    droneRotors: [],

    init: function (scene, camera) {
        this.scene = scene;
        this.camera = camera;

        // Register animation for local rotors
        this.scene.onBeforeRenderObservable.add(() => {
            if (this.isRCMode && this.droneRotors.length > 0) {
                this.droneRotors.forEach((r, i) => {
                    const speed = (i === 1 || i === 2) ? -0.5 : 0.5;
                    r.rotation.y += speed;
                });
            }
        });
    },

    spawnUser: function (name) {
        const userId = window.tsFamilyEngine.userId;
        const player = new BABYLON.TransformNode("playerRoot", this.scene);
        player.position = new BABYLON.Vector3(0, 0, 0);
        // Removed Math.PI rotation - character should face +Z by default

        // Voxel Character
        const skinMat = new BABYLON.StandardMaterial("skinMat", this.scene);
        skinMat.diffuseColor = new BABYLON.Color3(1, 0.8, 0.6);

        const shirtMat = new BABYLON.StandardMaterial("shirtMat", this.scene);
        shirtMat.diffuseColor = new BABYLON.Color3(0.2, 0.4, 0.8);

        const pantsMat = new BABYLON.StandardMaterial("pantsMat", this.scene);
        pantsMat.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.2);

        // Torso
        const torso = BABYLON.MeshBuilder.CreateBox("torso", { width: 0.6, height: 0.8, depth: 0.3 }, this.scene);
        torso.parent = player;
        torso.position.y = 1.1; // 0.7 (legs) + 0.4(half torso)
        torso.material = shirtMat;

        // Head
        const head = BABYLON.MeshBuilder.CreateBox("head", { size: 0.4 }, this.scene);
        head.parent = player;
        head.position.y = 1.7;
        head.material = skinMat;

        // Face
        const eyeMat = new BABYLON.StandardMaterial("eyeMat", this.scene);
        eyeMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        const mouthMat = new BABYLON.StandardMaterial("mouthMat", this.scene);
        mouthMat.diffuseColor = new BABYLON.Color3(0.5, 0.1, 0.1);

        const eyeL = BABYLON.MeshBuilder.CreateBox("eyeL", { width: 0.05, height: 0.05, depth: 0.02 }, this.scene);
        eyeL.parent = head;
        eyeL.position.set(-0.1, 0.05, 0.21); // Positive Z
        eyeL.material = eyeMat;

        const eyeR = BABYLON.MeshBuilder.CreateBox("eyeR", { width: 0.05, height: 0.05, depth: 0.02 }, this.scene);
        eyeR.parent = head;
        eyeR.position.set(0.1, 0.05, 0.21); // Positive Z
        eyeR.material = eyeMat;

        const smile = BABYLON.MeshBuilder.CreateBox("smile", { width: 0.15, height: 0.03, depth: 0.02 }, this.scene);
        smile.parent = head;
        smile.position.set(0, -0.1, 0.21); // Positive Z
        smile.material = mouthMat;

        // Arms (Jointed)
        const armSize = { width: 0.2, height: 0.25, depth: 0.2 };

        // Left Arm
        player.leftUpperArm = new BABYLON.TransformNode("leftUpperArm", this.scene);
        player.leftUpperArm.parent = torso;
        player.leftUpperArm.position.set(-0.4, 0.3, 0);
        const lUpperArmMesh = BABYLON.MeshBuilder.CreateBox("lUpperArmMesh", armSize, this.scene);
        lUpperArmMesh.parent = player.leftUpperArm;
        lUpperArmMesh.position.y = -0.125;
        lUpperArmMesh.material = shirtMat;

        player.leftLowerArm = new BABYLON.TransformNode("leftLowerArm", this.scene);
        player.leftLowerArm.parent = player.leftUpperArm;
        player.leftLowerArm.position.y = -0.25;
        const lLowerArmMesh = BABYLON.MeshBuilder.CreateBox("lLowerArmMesh", armSize, this.scene);
        lLowerArmMesh.parent = player.leftLowerArm;
        lLowerArmMesh.position.y = -0.125;
        lLowerArmMesh.material = shirtMat;

        // Right Arm
        player.rightUpperArm = new BABYLON.TransformNode("rightUpperArm", this.scene);
        player.rightUpperArm.parent = torso;
        player.rightUpperArm.position.set(0.4, 0.3, 0);
        const rUpperArmMesh = BABYLON.MeshBuilder.CreateBox("rUpperArmMesh", armSize, this.scene);
        rUpperArmMesh.parent = player.rightUpperArm;
        rUpperArmMesh.position.y = -0.125;
        rUpperArmMesh.material = shirtMat;

        player.rightLowerArm = new BABYLON.TransformNode("rightLowerArm", this.scene);
        player.rightLowerArm.parent = player.rightUpperArm;
        player.rightLowerArm.position.y = -0.25;
        const rLowerArmMesh = BABYLON.MeshBuilder.CreateBox("rLowerArmMesh", armSize, this.scene);
        rLowerArmMesh.parent = player.rightLowerArm;
        rLowerArmMesh.position.y = -0.125;
        rLowerArmMesh.material = shirtMat;

        // Hands (Skin)
        const handL = BABYLON.MeshBuilder.CreateBox("handL", { size: 0.15 }, this.scene);
        handL.parent = player.leftLowerArm;
        handL.position.y = -0.3;
        handL.material = skinMat;

        const handR = BABYLON.MeshBuilder.CreateBox("handR", { size: 0.15 }, this.scene);
        handR.parent = player.rightLowerArm;
        handR.position.y = -0.3;
        handR.material = skinMat;

        // Legs (Hips & Knees)
        const legSize = { width: 0.25, height: 0.35, depth: 0.25 };

        // Left Leg
        player.leftUpperLeg = new BABYLON.TransformNode("leftUpperLeg", this.scene);
        player.leftUpperLeg.parent = player;
        player.leftUpperLeg.position.set(-0.15, 0.7, 0);
        const lThigh = BABYLON.MeshBuilder.CreateBox("lThigh", legSize, this.scene);
        lThigh.parent = player.leftUpperLeg;
        lThigh.position.y = -0.175;
        lThigh.material = pantsMat;

        player.leftLowerLeg = new BABYLON.TransformNode("leftLowerLeg", this.scene);
        player.leftLowerLeg.parent = player.leftUpperLeg;
        player.leftLowerLeg.position.y = -0.35;
        const lShin = BABYLON.MeshBuilder.CreateBox("lShin", legSize, this.scene);
        lShin.parent = player.leftLowerLeg;
        lShin.position.y = -0.175;
        lShin.material = pantsMat;

        // Right Leg
        player.rightUpperLeg = new BABYLON.TransformNode("rightUpperLeg", this.scene);
        player.rightUpperLeg.parent = player;
        player.rightUpperLeg.position.set(0.15, 0.7, 0);
        const rThigh = BABYLON.MeshBuilder.CreateBox("rThigh", legSize, this.scene);
        rThigh.parent = player.rightUpperLeg;
        rThigh.position.y = -0.175;
        rThigh.material = pantsMat;

        player.rightLowerLeg = new BABYLON.TransformNode("rightLowerLeg", this.scene);
        player.rightLowerLeg.parent = player.rightUpperLeg;
        player.rightLowerLeg.position.y = -0.35;
        const rShin = BABYLON.MeshBuilder.CreateBox("rShin", legSize, this.scene);
        rShin.parent = player.rightLowerLeg;
        rShin.position.y = -0.175;
        rShin.material = pantsMat;

        // Name Tag
        const plane = BABYLON.MeshBuilder.CreatePlane("nameTag", { width: 2, height: 0.5 }, this.scene);
        plane.parent = player;
        plane.position.y = 2.2;
        plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;

        const advancedTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(plane, 512, 128);
        const textBlock = new BABYLON.GUI.TextBlock();
        textBlock.text = name;
        textBlock.color = "white";
        textBlock.fontSize = 60;
        textBlock.fontWeight = "bold";
        textBlock.outlineColor = "black";
        textBlock.outlineWidth = 4;
        advancedTexture.addControl(textBlock);

        this.player = player;
        window.tsFamilyEngine.player = player;

        // Initial setup for camera
        this.camera.lockedTarget = player;

        // Create transport models
        window.tsAssets.createSkateboard(player);
        window.tsAssets.createScooter(player);
        window.tsAssets.createBicycle(player);

        return player;
    },

    setupMultiplayer: function () {
        if (!window.firebaseManager) {
            setTimeout(() => this.setupMultiplayer(), 500);
            return;
        }

        window.firebaseManager.listenForPlayers((players) => {
            const myId = (window.tsFamilyEngine.userId || "").toString().trim().toLowerCase();
            const now = Date.now();
            const staleThreshold = 30000; // 30 seconds (more aggressive)

            // Track active IDs to remove ghosts that left or are stale
            const activeIds = players
                .filter(p => {
                    const pid = (p.id || "").toString().trim().toLowerCase();
                    if (pid === myId) return false;

                    if (!p.lastSeen) return false; // Purge if no heartbeat at all

                    const timestamp = p.lastSeen.toMillis ? p.lastSeen.toMillis() : p.lastSeen;
                    const age = now - timestamp;
                    return age < staleThreshold;
                })
                .map(p => p.id);

            for (let id in this.ghosts) {
                if (!activeIds.includes(id)) {
                    console.log("[Recreation] Removing ghost (stale or left):", id);
                    this.ghosts[id].dispose();
                    delete this.ghosts[id];
                }
            }

            players.forEach(data => {
                const id = data.id;
                const normalizedId = (id || "").toString().trim().toLowerCase();

                // CRITICAL: Double-check we aren't spawning ourselves
                if (normalizedId === myId) return;

                // Filter out stale ghosts in the spawn loop too
                if (data.lastSeen) {
                    const timestamp = data.lastSeen.toMillis ? data.lastSeen.toMillis() : data.lastSeen;
                    const age = now - timestamp;
                    if (age > staleThreshold) return;
                } else {
                    return; // Skip if no heartbeat
                }

                let ghost = this.ghosts[id];
                if (!ghost) {
                    console.log("[Recreation] Spawning ghost:", id, "Name:", data.name);
                    ghost = this.spawnGhost(id, data.name || "Guest");
                    this.ghosts[id] = ghost;
                }

                ghost.targetPos = new BABYLON.Vector3(data.x || 0, 0, data.z || 0);
                ghost.targetRotY = data.ry || 0;
                ghost.transportMode = data.transport || "walk";

                // RC States
                ghost.targetRCMode = data.rcMode || "walk";
                if (data.rcX !== undefined && data.rcX !== null) {
                    ghost.targetRCPosition = new BABYLON.Vector3(data.rcX, data.rcY, data.rcZ);
                } else {
                    ghost.targetRCPosition = null;
                }
                ghost.targetRCRotationY = data.rcRy || 0;
            });
        });
    },

    spawnGhost: function (id, name) {
        const ghost = new BABYLON.TransformNode("ghost_" + id, this.scene);
        // Removed Math.PI rotation

        // Use a simpler torso/head for ghosts
        const mat = new BABYLON.StandardMaterial("ghostMat_" + id, this.scene);
        mat.diffuseColor = new BABYLON.Color3(0.7, 0.7, 0.7);
        mat.alpha = 0.8;

        const torso = BABYLON.MeshBuilder.CreateBox("torso_" + id, { width: 0.6, height: 0.8, depth: 0.3 }, this.scene);
        torso.parent = ghost;
        torso.position.y = 1.1;
        torso.material = mat;

        const head = BABYLON.MeshBuilder.CreateBox("head_" + id, { size: 0.4 }, this.scene);
        head.parent = ghost;
        head.position.y = 1.7;
        head.material = mat;

        // Transport models for ghosts
        ghost.skateboard = window.tsAssets.createSkateboard(ghost, ghost);
        ghost.scooter = window.tsAssets.createScooter(ghost, ghost);
        ghost.bicycle = window.tsAssets.createBicycle(ghost, ghost);

        // RC Models for ghosts (parented to a separate node for independent sync)
        ghost.rcCarNode = new BABYLON.TransformNode("ghostRCCar_" + id, this.scene);
        window.tsAssets.createRCCar(ghost.rcCarNode, true);
        ghost.rcCarNode.setEnabled(false);

        ghost.rcDroneNode = new BABYLON.TransformNode("ghostRCDrone_" + id, this.scene);
        const drone = window.tsAssets.createRCDrone(ghost.rcDroneNode, true);
        ghost.rcDroneNode.droneRotors = drone.rotors;
        ghost.rcDroneNode.setEnabled(false);

        // Name Tag
        const plane = BABYLON.MeshBuilder.CreatePlane("nameTag_" + id, { width: 2, height: 0.5 }, this.scene);
        plane.parent = ghost;
        plane.position.y = 2.2;
        plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
        const advancedTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(plane, 512, 128);
        const textBlock = new BABYLON.GUI.TextBlock();
        textBlock.text = name;
        textBlock.color = "#CCCCCC";
        textBlock.fontSize = 50;
        textBlock.fontWeight = "bold";
        textBlock.outlineColor = "black";
        textBlock.outlineWidth = 3;
        advancedTexture.addControl(textBlock);

        return ghost;
    },

    updateMultiplayer: function () {
        const now = Date.now();
        for (let id in this.ghosts) {
            const ghost = this.ghosts[id];

            // Interpolate Movement
            if (ghost.targetPos) {
                ghost.position = BABYLON.Vector3.Lerp(ghost.position, ghost.targetPos, 0.1);
                ghost.rotation.y = BABYLON.Scalar.LerpAngle(ghost.rotation.y, ghost.targetRotY, 0.1);
            }

            // Transport Sync
            if (ghost.skateboard) ghost.skateboard.setEnabled(ghost.transportMode === "skate");
            if (ghost.scooter) ghost.scooter.setEnabled(ghost.transportMode === "scooter");
            if (ghost.bicycle) ghost.bicycle.setEnabled(ghost.transportMode === "bike");

            // Character Sync (only show if not in RC mode)
            const inRC = (ghost.targetRCMode === "rc_car" || ghost.targetRCMode === "rc_drone");
            ghost.getChildMeshes().forEach(m => {
                if (!m.name.includes("rc")) m.setEnabled(!inRC);
            });

            // RC Sync
            if (ghost.rcCarNode) {
                const isCar = ghost.targetRCMode === "rc_car";
                ghost.rcCarNode.setEnabled(isCar);
                if (isCar && ghost.targetRCPosition) {
                    ghost.rcCarNode.position = BABYLON.Vector3.Lerp(ghost.rcCarNode.position, ghost.targetRCPosition, 0.1);
                    ghost.rcCarNode.rotation.y = BABYLON.Scalar.LerpAngle(ghost.rcCarNode.rotation.y, ghost.targetRCRotationY, 0.1);
                }
            }
            if (ghost.rcDroneNode) {
                const isDrone = ghost.targetRCMode === "rc_drone";
                ghost.rcDroneNode.setEnabled(isDrone);
                if (isDrone && ghost.targetRCPosition) {
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
        }
    },

    setTransportMode: function (mode) {
        if (this.isRCMode && (mode !== "rc_car" && mode !== "rc_drone")) {
            this.toggleRCMode(false);
        }

        window.tsFamilyEngine.transportMode = mode;
        this.setTransportVisibility(mode);

        if (mode === "rc_car" || mode === "rc_drone") {
            this.toggleRCMode(true, mode);
        }
    },

    setTransportVisibility: function (mode) {
        if (this.player) {
            if (this.player.skateboard) this.player.skateboard.setEnabled(mode === "skate");
            if (this.player.scooter) this.player.scooter.setEnabled(mode === "scooter");
            if (this.player.bicycle) this.player.bicycle.setEnabled(mode === "bike");
        }
    },

    toggleRCMode: function (enabled, mode) {
        this.isRCMode = enabled;
        window.tsFamilyEngine.isRCMode = enabled;

        if (enabled) {
            if (!this.player) return;
            if (this.activeRC) this.activeRC.dispose();

            this.activeRC = new BABYLON.TransformNode("activeRC", this.scene);
            this.activeRC.position = this.player.position.clone();
            this.activeRC.position.y = (mode === "rc_drone" ? 1.5 : 0.1);

            if (mode === "rc_car") window.tsAssets.createRCCar(this.activeRC);
            else {
                const drone = window.tsAssets.createRCDrone(this.activeRC);
                this.droneRotors = drone.rotors;
            }

            this.setupChaseCamera(this.activeRC);
        } else {
            if (this.activeRC) {
                this.activeRC.dispose();
                this.activeRC = null;
            }
            this.droneRotors = [];
            if (window.firebaseManager && window.tsFamilyEngine.hasJoined) {
                window.firebaseManager.updatePlayerRC(window.tsFamilyEngine.userId, null, null, "walk");
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
    }
};
