window.tsWorld = {
    scene: null,
    worldObjects: {},
    worldPets: {},

    init: function (scene) {
        this.scene = scene;
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
        const bp = window.tsAssets.blueprints[obj.type];
        if (!bp) return;

        const container = new BABYLON.TransformNode("object_" + obj.id, this.scene);
        container.position = new BABYLON.Vector3(obj.x, obj.y, obj.z);
        if (obj.ry) container.rotation.y = obj.ry;

        if (obj.type === "apple_tree") {
            window.tsAssets.createVoxelTree(container, bp, obj.seed || 123, obj.id);
        } else if (obj.type === "park_bench") {
            window.tsAssets.createVoxelBench(container, bp, obj.id);
        } else if (obj.type === "red_house") {
            window.tsAssets.createVoxelHouse(container, bp, obj.id);
        } else if (obj.type === "street_light") {
            window.tsAssets.createVoxelStreetLight(container, bp, obj.id);
        } else if (obj.type === "dog") {
            window.tsAssets.createVoxelDog(container, bp, obj.id);
        } else if (obj.type === "cat") {
            window.tsAssets.createVoxelCat(container, bp, obj.id);
        } else if (bp.recipe) {
            window.tsAssets.createVoxelRecipe(container, bp, obj.id);
        } else {
            // Default placeholder
            const box = BABYLON.MeshBuilder.CreateBox("object_" + obj.id, { size: 1 }, this.scene);
            box.parent = container;
            box.position.y = 0.5;
            box.isPickable = true;
        }

        this.worldObjects[obj.id] = container;
        container.blueprintId = obj.type;

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

    updateSimulation: function () {
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
                    // Pick random destination within local radius
                    const angle = Math.random() * Math.PI * 2;
                    const dist = 3 + Math.random() * 5;
                    data.targetPos = pet.position.add(new BABYLON.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist));

                    // Keep within bounds
                    data.targetPos.x = Math.max(-45, Math.min(45, data.targetPos.x));
                    data.targetPos.z = Math.max(-45, Math.min(45, data.targetPos.z));

                    data.isMoving = true;
                }
            } else if (!isPreview) {
                const distSq = BABYLON.Vector3.DistanceSquared(
                    new BABYLON.Vector3(pet.position.x, 0, pet.position.z),
                    new BABYLON.Vector3(data.targetPos.x, 0, data.targetPos.z)
                );

                if (distSq > 0.04) {
                    const diff = data.targetPos.subtract(pet.position);
                    const targetAngle = Math.atan2(diff.x, diff.z);
                    pet.rotation.y = BABYLON.Scalar.LerpAngle(pet.rotation.y, targetAngle, 0.1);

                    pet.position.addInPlace(pet.forward.scale(data.speed));
                } else {
                    data.isMoving = false;
                    data.moveTimer = 100 + Math.random() * 200;
                }
            }

            // Hopping Animation
            const hop = Math.abs(Math.sin(now * 0.01)) * 0.1;
            pet.getChildMeshes().forEach(m => {
                if (m.name.includes("Body") || m.name.includes("Head") || m.name.includes("Tail")) {
                    let baseY = m.name.includes("Body") ? 0.3 : (m.name.includes("Head") ? 0.2 : 0.1);
                    if (pet.blueprintId === "cat") baseY = m.name.includes("Body") ? 0.25 : (m.name.includes("Head") ? 0.15 : 0.15);
                    m.position.y = baseY + (data.isMoving || isPreview ? hop : 0);
                }
            });
        }
    }
};
