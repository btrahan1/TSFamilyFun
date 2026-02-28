window.tsAssets = {
    scene: null,
    blueprints: {},

    init: function (scene) {
        this.scene = scene;
    },

    loadAssets: async function () {
        try {
            const response = await fetch('data/assetBlueprints.json');
            const data = await response.json();
            data.blueprints.forEach(bp => {
                this.blueprints[bp.id] = bp;
            });
            console.log("Blueprints loaded into tsAssets:", Object.keys(this.blueprints));
        } catch (e) {
            console.error("Error loading assets in tsAssets:", e);
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
    },

    createSkateboard: function (player, parent = null) {
        const root = parent || player;
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
            player.skateboard = boardRoot;
        }
        return boardRoot;
    },

    createScooter: function (player, parent = null) {
        const root = parent || player;
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

        // Steering Column
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

        // Wheels
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
            player.scooter = scooterRoot;
        }
        return scooterRoot;
    },

    createBicycle: function (player, parent = null) {
        const root = parent || player;
        const bikeRoot = new BABYLON.TransformNode("bicycleRoot", this.scene);
        bikeRoot.parent = root;
        bikeRoot.position.y = 0;
        bikeRoot.setEnabled(false);

        const frameMat = new BABYLON.StandardMaterial("bikeFrameMat", this.scene);
        frameMat.diffuseColor = new BABYLON.Color3(0.8, 0.2, 0.2);

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
            player.bicycle = bikeRoot;
        }
        return bikeRoot;
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
            arm.position.x = o.x / 2;
            arm.position.z = o.z / 2;
            arm.material = bodyMat;

            const rotor = BABYLON.MeshBuilder.CreateBox("rotor" + idSuffix + i, { width: 0.3, height: 0.01, depth: 0.03 }, this.scene);
            rotor.parent = arm;
            rotor.position.x = 0.15;
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

        return { body, rotors };
    }
};
