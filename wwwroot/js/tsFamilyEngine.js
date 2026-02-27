window.tsFamilyEngine = {
    canvas: null,
    engine: null,
    scene: null,
    camera: null,
    player: null,
    inputMap: {},
    walkTimer: 0,
    hasJoined: false,

    init: function (canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.engine = new BABYLON.Engine(this.canvas, true);
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
            }
            this.scene.render();
        });

        window.addEventListener("resize", () => {
            this.engine.resize();
        });
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

        // Houses
        const housePositions = [
            { pos: new BABYLON.Vector3(15, 2, 15), mat: houseMat },
            { pos: new BABYLON.Vector3(-15, 2, 15), mat: whiteMat },
            { pos: new BABYLON.Vector3(15, 2, -15), mat: houseMat },
            { pos: new BABYLON.Vector3(-15, 2, -15), mat: whiteMat }
        ];

        housePositions.forEach((p, i) => {
            const box = BABYLON.MeshBuilder.CreateBox("house" + i, { width: 6, height: 4, depth: 8 }, scene);
            box.position = p.pos;
            box.material = p.mat;
            box.checkCollisions = true;
        });

        // Trees
        const treePositions = [
            new BABYLON.Vector3(8, 0, 8),
            new BABYLON.Vector3(-8, 0, 8),
            new BABYLON.Vector3(8, 0, -8),
            new BABYLON.Vector3(-8, 0, -8)
        ];

        treePositions.forEach((pos, i) => {
            this.createTree(scene, pos, woodMat, leafMat);
        });

        // Benches
        this.createBench(scene, new BABYLON.Vector3(0, 0, 5), woodMat);
        this.createBench(scene, new BABYLON.Vector3(0, 0, -5), woodMat);
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

    createBench: function (scene, pos, woodMat) {
        const seat = BABYLON.MeshBuilder.CreateBox("benchSeat", { width: 3, height: 0.2, depth: 1 }, scene);
        seat.position = pos.add(new BABYLON.Vector3(0, 0.5, 0));
        seat.material = woodMat;
        seat.checkCollisions = true;

        const back = BABYLON.MeshBuilder.CreateBox("benchBack", { width: 3, height: 0.8, depth: 0.1 }, scene);
        back.position = pos.add(new BABYLON.Vector3(0, 1, 0.5));
        back.material = woodMat;
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
        this.hasJoined = true;

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
    }
};
