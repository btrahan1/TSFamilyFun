window.tsInput = {
    scene: null,
    engine: null,
    inputMap: {},
    lastTapTime: 0,
    targetDestination: null,
    moveMarker: null,

    init: function (scene, engine) {
        this.scene = scene;
        this.engine = engine;

        // Keyboard Input Handling
        this.scene.onKeyboardObservable.add((kbInfo) => {
            switch (kbInfo.type) {
                case BABYLON.KeyboardEventTypes.KEYDOWN:
                    this.inputMap[kbInfo.event.key.toLowerCase()] = true;
                    break;
                case BABYLON.KeyboardEventTypes.KEYUP:
                    this.inputMap[kbInfo.event.key.toLowerCase()] = false;
                    if (kbInfo.event.key === "Escape") {
                        if (window.tsFamilyEngine.isBuilding) window.tsFamilyEngine.toggleBuildMode(false);
                        if (window.tsFamilyEngine.isBulldozing) window.tsFamilyEngine.toggleBulldozer(false);
                    }
                    if (kbInfo.event.key === "c") {
                        // Toggle camera lock placeholder
                    }
                    break;
            }
        });

        // Pointer Click Handling for Placement and Movement
        this.scene.onPointerObservable.add((pointerInfo) => {
            if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERDOWN) {
                const now = Date.now();
                const pickInfo = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh) => mesh.name === "ground");

                if (window.tsFamilyEngine.isBuilding) {
                    if (pickInfo.hit) {
                        window.tsFamilyEngine.placeObject(pickInfo.pickedPoint);
                    }
                } else if (window.tsFamilyEngine.isBulldozing) {
                    const objPick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh) => mesh.name.startsWith("object_"));
                    if (objPick.hit) {
                        const objId = objPick.pickedMesh.name.replace("object_", "");
                        if (confirm("Remove this object?")) {
                            window.firebaseManager.removeWorldObject(objId);
                        }
                    }
                } else {
                    // Double Tap for Movement
                    if (now - this.lastTapTime < 300) {
                        if (pickInfo.hit) {
                            this.setTargetDestination(pickInfo.pickedPoint);
                        }
                    }
                    this.lastTapTime = now;
                }
            }
        });
    },

    setTargetDestination: function (point) {
        this.targetDestination = point.clone();

        // Visual Indicator
        if (!this.moveMarker) {
            this.moveMarker = BABYLON.MeshBuilder.CreateTorus("moveMarker", { diameter: 0.5, thickness: 0.1 }, this.scene);
            const mat = new BABYLON.StandardMaterial("moveMarkerMat", this.scene);
            mat.diffuseColor = new BABYLON.Color3(0, 1, 0);
            mat.emissiveColor = new BABYLON.Color3(0, 0.5, 0);
            this.moveMarker.material = mat;
            this.moveMarker.isPickable = false;
        }
        this.moveMarker.position = point.add(new BABYLON.Vector3(0, 0.1, 0));
        this.moveMarker.setEnabled(true);

        // Hide marker after 2 seconds
        setTimeout(() => {
            if (this.moveMarker) this.moveMarker.setEnabled(false);
        }, 2000);
    },

    handleMovement: function (player, transportMode) {
        if (!player) return;

        let speed = 0.15;
        if (transportMode === "skate") speed = 0.22;
        if (transportMode === "scooter") speed = 0.25;
        if (transportMode === "bike") speed = 0.3;

        let moving = false;
        const rotateSpeed = 0.05;

        // Automated Movement (Double Tap)
        if (this.targetDestination) {
            const distSq = BABYLON.Vector3.DistanceSquared(
                new BABYLON.Vector3(player.position.x, 0, player.position.z),
                new BABYLON.Vector3(this.targetDestination.x, 0, this.targetDestination.z)
            );

            if (distSq > 0.1) {
                const diff = this.targetDestination.subtract(player.position);
                const targetAngle = Math.atan2(diff.x, diff.z);
                player.rotation.y = BABYLON.Scalar.LerpAngle(player.rotation.y, targetAngle, 0.1);

                player.position.addInPlace(player.forward.scale(speed));
                moving = true;
            } else {
                this.targetDestination = null;
                if (this.moveMarker) this.moveMarker.setEnabled(false);
            }
        }

        // WASD Input (Overrides target movement)
        if (this.inputMap["w"]) {
            player.position.addInPlace(player.forward.scale(speed));
            moving = true;
            this.targetDestination = null;
        }
        if (this.inputMap["s"]) {
            player.position.addInPlace(player.forward.scale(-speed * 0.5));
            moving = true;
            this.targetDestination = null;
        }
        if (this.inputMap["a"]) {
            player.rotation.y -= rotateSpeed;
            this.targetDestination = null;
        }
        if (this.inputMap["d"]) {
            player.rotation.y += rotateSpeed;
            this.targetDestination = null;
        }

        // Animation
        const now = Date.now();
        if (moving) {
            if (transportMode === "walk") {
                const animSpeed = 0.008;
                const amplitude = 0.4;
                player.leftUpperLeg.rotation.x = Math.sin(now * animSpeed) * amplitude;
                player.rightUpperLeg.rotation.x = -Math.sin(now * animSpeed) * amplitude;
                player.leftLowerLeg.rotation.x = Math.max(0, -Math.sin(now * animSpeed) * 0.3);
                player.rightLowerLeg.rotation.x = Math.max(0, Math.sin(now * animSpeed) * 0.3);

                player.leftUpperArm.rotation.x = -Math.sin(now * animSpeed) * 0.3;
                player.rightUpperArm.rotation.x = Math.sin(now * animSpeed) * 0.3;
            } else if (transportMode === "skate" || transportMode === "scooter") {
                const pushSpeed = 0.005;
                const push = Math.sin(now * pushSpeed);
                const isPushing = push > 0;

                player.rightUpperLeg.rotation.x = isPushing ? -push * 0.8 : 0;
                player.rightLowerLeg.rotation.x = isPushing ? push * 0.4 : 0;
                player.leftUpperLeg.rotation.x = 0;
                player.leftLowerLeg.rotation.x = 0.2;

                if (transportMode === "scooter") {
                    player.leftUpperArm.rotation.x = -1.3;
                    player.rightUpperArm.rotation.x = -1.3;
                    player.leftLowerArm.rotation.x = -0.5;
                    player.rightLowerArm.rotation.x = -0.5;
                } else {
                    // Skateboard: Arms straight down
                    player.leftUpperArm.rotation.x = 0;
                    player.rightUpperArm.rotation.x = 0;
                    player.leftLowerArm.rotation.x = 0;
                    player.rightLowerArm.rotation.x = 0;
                }
            } else if (transportMode === "bike") {
                const pedalSpeed = 0.004;
                const pedal = now * pedalSpeed;
                player.leftUpperLeg.rotation.x = -0.8 + Math.sin(pedal) * 0.3;
                player.rightUpperLeg.rotation.x = -0.8 + Math.sin(pedal + Math.PI) * 0.3;
                player.leftLowerLeg.rotation.x = 1.0 + Math.cos(pedal) * 0.2;
                player.rightLowerLeg.rotation.x = 1.0 + Math.cos(pedal + Math.PI) * 0.2;

                player.leftUpperArm.rotation.x = -1.1;
                player.rightUpperArm.rotation.x = -1.1;
            }
        } else {
            // Idle
            player.getChildMeshes().forEach(m => {
                if (m.name.includes("Leg") || m.name.includes("Arm")) m.rotation.x = 0;
            });
            if (transportMode === "bike") {
                player.leftUpperLeg.rotation.x = -0.8;
                player.rightUpperLeg.rotation.x = -0.8;
                player.leftLowerLeg.rotation.x = 1.0;
                player.rightLowerLeg.rotation.x = 1.0;
                player.leftUpperArm.rotation.x = -1.1;
                player.rightUpperArm.rotation.x = -1.1;
            } else if (transportMode === "scooter") {
                player.leftUpperArm.rotation.x = -1.3;
                player.rightUpperArm.rotation.x = -1.3;
                player.leftLowerArm.rotation.x = -0.5;
                player.rightLowerArm.rotation.x = -0.5;
            }
        }
    },

    handleRCMovement: function (activeRC, transportMode, userId, playerName) {
        if (!activeRC) return;

        const isDrone = transportMode === "rc_drone";
        const speed = isDrone ? 0.2 : 0.25;
        const rotateSpeed = 0.05;
        let moved = false;

        // Forward/Backward
        if (this.inputMap["w"]) {
            activeRC.position.addInPlace(activeRC.forward.scale(speed));
            moved = true;
        }
        if (this.inputMap["s"]) {
            activeRC.position.addInPlace(activeRC.forward.scale(-speed));
            moved = true;
        }

        // Rotation
        if (this.inputMap["a"]) {
            activeRC.rotation.y -= rotateSpeed;
            moved = true;
        }
        if (this.inputMap["d"]) {
            activeRC.rotation.y += rotateSpeed;
            moved = true;
        }

        // Drone Vertical Movement
        if (isDrone) {
            if (this.inputMap[" "]) {
                activeRC.position.y += 0.1;
                moved = true;
            }
            if (this.inputMap["shift"]) {
                activeRC.position.y -= 0.1;
                if (activeRC.position.y < 0.1) activeRC.position.y = 0.1;
                moved = true;
            }
        } else {
            activeRC.position.y = 0.1;
        }
    }
};
