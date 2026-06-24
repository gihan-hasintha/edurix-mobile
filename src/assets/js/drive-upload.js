import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
    initializeAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    signInWithCredential,
    signOut,
    onAuthStateChanged,
    indexedDBLocalPersistence,
    browserPopupRedirectResolver
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { GoogleAuth } from "@codetrix-studio/capacitor-google-auth";

const firebaseConfig = {
    apiKey: "AIzaSyDD1TNHm4d3H8xyA2Q5idYdq63TOJzn8As",
    authDomain: "edurix-file.firebaseapp.com",
    projectId: "edurix-file",
    storageBucket: "edurix-file.firebasestorage.app",
    messagingSenderId: "945136094597",
    appId: "1:945136094597:web:0989548b327d60eb0948ec"
};

const app = initializeApp(firebaseConfig);

// Use indexedDB persistence — fixes "missing initial state" / sessionStorage errors
// that occur in Capacitor Android WebView and partitioned storage environments.
// browserPopupRedirectResolver must be passed explicitly when using initializeAuth()
// (unlike getAuth() which includes it automatically) — otherwise signInWithPopup/Redirect
// throws auth/argument-error at _withDefaultResolver.
const auth = initializeAuth(app, {
    persistence: indexedDBLocalPersistence,
    popupRedirectResolver: browserPopupRedirectResolver
});

// Detect if running inside Capacitor native app (Android/iOS)
const isCapacitorNative = !!(
    window.Capacitor &&
    typeof window.Capacitor.isNativePlatform === 'function' &&
    window.Capacitor.isNativePlatform()
);

// ─── Helper: update signed-in UI ────────────────────────────────────────────
function updateSignedInUI(user) {
    if (document.getElementById('mainDriveSignedOutView')) {
        document.getElementById('mainDriveSignedOutView').style.display = 'none';
        document.getElementById('mainDriveSignedInView').style.display = 'flex';
        document.getElementById('mainDriveUserPhoto').src = user.photoURL || '';
        document.getElementById('mainDriveUserEmail').textContent = user.email;
    }
    if (document.getElementById('uploadDriveSignedOutView')) {
        document.getElementById('uploadDriveSignedOutView').style.display = 'none';
        document.getElementById('uploadDriveSignedInView').style.display = 'flex';
        document.getElementById('uploadDriveUserPhoto').src = user.photoURL || '';
        document.getElementById('uploadDriveUserName').textContent = user.displayName || 'User';
        document.getElementById('uploadDriveUserEmail').textContent = user.email;
        const btn = document.getElementById('uploadPaperBtn');
        if (btn) btn.disabled = false;
    }
}

// ─── Helper: update signed-out UI ───────────────────────────────────────────
function updateSignedOutUI() {
    if (document.getElementById('mainDriveSignedOutView')) {
        document.getElementById('mainDriveSignedOutView').style.display = 'block';
        document.getElementById('mainDriveSignedInView').style.display = 'none';
    }
    if (document.getElementById('uploadDriveSignedOutView')) {
        document.getElementById('uploadDriveSignedOutView').style.display = 'block';
        document.getElementById('uploadDriveSignedInView').style.display = 'none';
        const btn = document.getElementById('uploadPaperBtn');
        if (btn) btn.disabled = true;
    }
}

window.DriveAuth = {
    currentUser: null,
    accessToken: null,
    authResolve: null,
    authReject: null,

    init: function () {
        if (isCapacitorNative) {
            GoogleAuth.initialize();
        }

        // ── Auth state listener (fires on every page load if already signed in) ──
        onAuthStateChanged(auth, user => {
            if (user) {
                this.currentUser = user;
                updateSignedInUI(user);
            } else {
                this.currentUser  = null;
                this.accessToken  = null;
                updateSignedOutUI();
            }
        });

        // ── Button wiring ────────────────────────────────────────────────────────
        if (document.getElementById('mainDriveLoginBtn')) {
            document.getElementById('mainDriveLoginBtn').onclick  = () => this.signIn();
            document.getElementById('mainDriveLogoutBtn').onclick = () => this.signOut();
        }
        if (document.getElementById('uploadDriveLoginBtn')) {
            document.getElementById('uploadDriveLoginBtn').onclick  = () => this.signIn();
            document.getElementById('uploadDriveLogoutBtn').onclick = () => this.signOut();
        }

        // ── Electron IPC callback (desktop app path) ─────────────────────────────
        if (window.api && window.api.onGoogleAuthSuccess) {
            window.api.onGoogleAuthSuccess(async (data) => {
                try {
                    const credential = GoogleAuthProvider.credential(data.idToken);
                    const result     = await signInWithCredential(auth, credential);
                    this.accessToken = data.accessToken;
                    this.currentUser = result.user;
                    if (this.authResolve) {
                        this.authResolve();
                        this.authResolve = null;
                        this.authReject  = null;
                    }
                } catch (error) {
                    console.error("External sign in error:", error);
                    if (this.authReject) {
                        this.authReject(error);
                        this.authResolve = null;
                        this.authReject  = null;
                    }
                }
            });
        }
    },

    signIn: async function () {
        try {
            if (window.api && window.api.openExternalBrowser) {
                // ── Electron desktop path ─────────────────────────────────────────
                return new Promise((resolve, reject) => {
                    this.authResolve = resolve;
                    this.authReject  = reject;
                    const clientId   = "945136094597-4hr21un9ugf9honpt679ohmcnhosq932.apps.googleusercontent.com";
                    const redirectUri = "http://127.0.0.1:55892/auth-callback";
                    const scope      = "email profile https://www.googleapis.com/auth/drive.file";
                    const authUrl    = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token%20id_token&scope=${encodeURIComponent(scope)}&nonce=edurix123`;
                    window.api.openExternalBrowser(authUrl);
                });

            } else if (isCapacitorNative) {
                // ── Capacitor Android/iOS Native Plugin Path ──────────────────────
                const googleUser = await GoogleAuth.signIn();
                
                // Pass the native Google token to Firebase Auth
                const credential = GoogleAuthProvider.credential(googleUser.authentication.idToken);
                const result = await signInWithCredential(auth, credential);
                
                this.currentUser = result.user;
                this.accessToken = googleUser.authentication.accessToken;

            } else {
                // ── Web browser path ──────────────────────────────────────────────
                const provider = new GoogleAuthProvider();
                provider.addScope("https://www.googleapis.com/auth/drive.file");
                const result    = await signInWithPopup(auth, provider);
                this.currentUser = result.user;
                const credential = GoogleAuthProvider.credentialFromResult(result);
                this.accessToken = credential.accessToken;
            }
        } catch (e) {
            console.error("Sign in error:", e);
            alert("Sign in failed: " + e.message);
        }
    },

    signOut: async function () {
        await signOut(auth);
        this.accessToken = null;
    },

    ensureAccessToken: async function () {
        if (this.accessToken) return;

        if (window.api && window.api.openExternalBrowser) {
            // ── Electron path ─────────────────────────────────────────────────────
            return new Promise((resolve, reject) => {
                this.authResolve  = resolve;
                this.authReject   = reject;
                const clientId    = "945136094597-4hr21un9ugf9honpt679ohmcnhosq932.apps.googleusercontent.com";
                const redirectUri = "http://127.0.0.1:55892/auth-callback";
                const scope       = "email profile https://www.googleapis.com/auth/drive.file";
                const email       = this.currentUser ? this.currentUser.email : '';
                const authUrl     = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token%20id_token&scope=${encodeURIComponent(scope)}&nonce=edurix123&login_hint=${encodeURIComponent(email)}`;
                window.api.openExternalBrowser(authUrl);
            });

        } else if (isCapacitorNative) {
            // ── Capacitor native: refresh native token ────────────────────────────
            await this.signIn();

        } else {
            // ── Web browser: popup to refresh token ───────────────────────────────
            const provider = new GoogleAuthProvider();
            provider.addScope("https://www.googleapis.com/auth/drive.file");
            provider.setCustomParameters({ login_hint: this.currentUser?.email || '', prompt: "consent" });
            const result     = await signInWithPopup(auth, provider);
            const cred       = GoogleAuthProvider.credentialFromResult(result);
            this.accessToken = cred.accessToken;
        }
    },

    getOrCreateFolder: async function (folderName) {
        const query     = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`);
        const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`, {
            headers: { Authorization: "Bearer " + this.accessToken }
        });
        if (!searchRes.ok) throw new Error("Failed to search for folder");
        const searchData = await searchRes.json();
        if (searchData.files && searchData.files.length > 0) return searchData.files[0].id;

        const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
            method: "POST",
            headers: { Authorization: "Bearer " + this.accessToken, "Content-Type": "application/json" },
            body: JSON.stringify({ name: folderName, mimeType: "application/vnd.google-apps.folder" })
        });
        if (!createRes.ok) throw new Error("Failed to create folder");
        return (await createRes.json()).id;
    },

    uploadFile: async function (file, onProgress, folderName = "Edurix-Papers") {
        onProgress(5, "Preparing upload folder...");
        const folderId = await this.getOrCreateFolder(folderName);

        return new Promise((resolve, reject) => {
            const metadata = { name: file.name, mimeType: file.type || "application/octet-stream", parents: [folderId] };
            const form     = new FormData();
            form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
            form.append("file", file);

            const xhr = new XMLHttpRequest();
            xhr.open("POST", "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name");
            xhr.setRequestHeader("Authorization", "Bearer " + this.accessToken);
            xhr.upload.onprogress = e => {
                if (e.lengthComputable) {
                    const pct = Math.round((e.loaded / e.total) * 90) + 10;
                    onProgress(pct, "Uploading... " + pct + "%");
                }
            };
            xhr.onload  = () => {
                try {
                    const data = JSON.parse(xhr.responseText);
                    if (xhr.status === 200 && data.id) resolve(data.id);
                    else reject(new Error(data.error?.message || "Upload failed"));
                } catch { reject(new Error("Invalid response")); }
            };
            xhr.onerror = () => reject(new Error("Network error"));
            xhr.send(form);
        });
    },

    setPermission: async function (fileId) {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
            method:  "POST",
            headers: { Authorization: "Bearer " + this.accessToken, "Content-Type": "application/json" },
            body:    JSON.stringify({ role: "reader", type: "anyone" })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message || "Failed to set permission");
        }
    }
};

document.addEventListener("DOMContentLoaded", () => {
    window.DriveAuth.init();
});
