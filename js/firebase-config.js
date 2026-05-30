// =============================================
// firebase-config.js
// Configuración e inicialización de Firebase
// =============================================
// IMPORTANTE: Reemplazá estos valores con los de tu proyecto Firebase
// Los encontrás en: Firebase Console → Tu proyecto → Configuración del proyecto

const firebaseConfig = {
  apiKey: "AIzaSyATIdjOKj6jQhDmMtmH30-9w6nA8IUrxCo",
authDomain: "pet-stock.firebaseapp.com",
projectId: "pet-stock",
storageBucket: "pet-stock.firebasestorage.app",
messagingSenderId: "44516726598",
appId: "1:44516726598:web:af2b4fe25f45ca52a03747"
};

// Inicialización (solo si no fue inicializado antes)
if (!firebase.apps || !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Instancia de Firestore disponible globalmente
const db = firebase.firestore();
