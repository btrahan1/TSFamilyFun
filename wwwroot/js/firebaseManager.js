import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, doc, setDoc, onSnapshot, query, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDMq6Gyt8twhGecidZldXw7Y0wf4UdMKyI",
    authDomain: "tsfamilyfun.firebaseapp.com",
    projectId: "tsfamilyfun",
    storageBucket: "tsfamilyfun.firebasestorage.app",
    messagingSenderId: "955047283483",
    appId: "1:955047283483:web:aece92a19f65676d7221be",
    measurementId: "G-PDRJQLDRW6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

window.firebaseManager = {
    db: db,
    playersRef: collection(db, "players"),

    // Update local player position
    updatePlayerPosition: async function (userId, name, position, rotation) {
        const playerDoc = doc(this.playersRef, userId);
        await setDoc(playerDoc, {
            name: name,
            x: position.x,
            y: position.y,
            z: position.z,
            ry: rotation.y,
            lastSeen: serverTimestamp()
        }, { merge: true });
    },

    // Listen for other players
    listenForPlayers: function (callback) {
        const q = query(this.playersRef);
        return onSnapshot(q, (snapshot) => {
            const players = [];
            snapshot.forEach((doc) => {
                players.push({ id: doc.id, ...doc.data() });
            });
            callback(players);
        });
    },

    // Chat functionality
    sendChatMessage: async function (userId, name, text) {
        const chatRef = collection(this.db, "chat");
        const msgDoc = doc(chatRef);
        await setDoc(msgDoc, {
            userId: userId,
            name: name,
            text: text,
            timestamp: serverTimestamp()
        });
    },

    listenForChat: function (callback) {
        const chatRef = collection(this.db, "chat");
        const q = query(chatRef);
        return onSnapshot(q, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    callback(change.doc.data());
                }
            });
        });
    },

    // World Objects
    placeWorldObject: async function (objectData) {
        try {
            const id = Math.random().toString(36).substr(2, 9);
            await setDoc(doc(this.db, "world_objects", id), {
                ...objectData,
                id: id,
                timestamp: serverTimestamp()
            });
            console.log("Object placed:", id);
        } catch (e) {
            console.error("Error placing object: ", e);
        }
    },

    listenForWorldObjects: function (callback) {
        const q = query(collection(this.db, "world_objects"));
        return onSnapshot(q, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                callback(change.type, change.doc.data());
            });
        });
    },

    deleteWorldObject: async function (id) {
        try {
            const { deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
            await deleteDoc(doc(this.db, "world_objects", id));
            console.log("Object deleted:", id);
        } catch (e) {
            console.error("Error deleting object: ", e);
        }
    }
};
