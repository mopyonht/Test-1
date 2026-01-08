// ===== CONFIGURATION FIREBASE V8 =====
const firebaseConfig = {
  apiKey: "AIzaSyDpylenTapoLXwbMsEavlLt0po5M_bVDBo",
  authDomain: "mopyonsiteweb.firebaseapp.com",
  databaseURL: "https://mopyonsiteweb-default-rtdb.firebaseio.com/",
  projectId: "mopyonsiteweb",
  storageBucket: "mopyonsiteweb.firebasestorage.app",
  messagingSenderId: "535172052074",
  appId: "1:535172052074:web:c30cefea18ffed7a27c613",
  measurementId: "G-CLYT5CXJ79"
};

// Initialisation Firebase v8
firebase.initializeApp(firebaseConfig);

// Services Firebase v8
const auth = firebase.auth();
const db = firebase.firestore();

// UID du chef admin (REMPLACE PAR TON UID APRÈS CRÉATION DE TON COMPTE)
const CHIEF_ADMIN_UID = 'wZPpF7FesvVcjrZvXAHRZhsxoSz2'; // Tu le trouveras dans Firebase Console > Authentication

// Configuration globale
const CONFIG = {
  HOURLY_TOURNAMENT_FEE: 25,
  DAILY_JACKPOT_FEE: 25,
  PRIZE_PERCENTAGE: 0.80,
  COMMISSION_PERCENTAGE: 0.20,
  JACKPOT_END_HOUR: 22,
  NORMAL_RATIO_MAX: 20,
  SUSPICIOUS_RATIO_MAX: 24,
  CHEAT_RATIO_MAX: 17,
  AUTO_PAYMENT_DELAY_MS: 24 * 60 * 60 * 1000,
};

// Utilitaires
const utils = {
  formatGDS: function(amount) {
    return amount.toLocaleString() + ' GDS';
  },
  
  getTournamentKey: function(type, date, hour) {
    const dateStr = date.toISOString().split('T')[0];
    return type === 'hourly' 
      ? 'hourly-' + dateStr + '-' + hour + 'h'
      : 'daily-' + dateStr;
  },
  
  getCurrentHour: function() {
    return new Date().getHours();
  },
  
  calculateRatio: function(score, durationMs) {
    const seconds = durationMs / 1000;
    return seconds > 0 ? (score / seconds).toFixed(2) : 0;
  },
  
  getRatioStatus: function(ratio) {
    const numRatio = parseFloat(ratio);
    if (numRatio <= CONFIG.NORMAL_RATIO_MAX) {
      return { status: 'normal', color: '#16a34a', icon: '🟢' };
    }
    if (numRatio <= CONFIG.SUSPICIOUS_RATIO_MAX) {
      return { status: 'suspicious', color: '#f59e0b', icon: '🟡' };
    }
    return { status: 'cheat', color: '#dc2626', icon: '🔴' };
  },
  
  formatDuration: function(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return hours + 'h ' + (minutes % 60) + 'm';
    if (minutes > 0) return minutes + 'm ' + (seconds % 60) + 's';
    return seconds + 's';
  },
  
  formatTimeLeft: function(endTime) {
    const now = Date.now();
    const diff = endTime - now;
    
    if (diff <= 0) return 'Terminé';
    
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    
    return hours.toString().padStart(2, '0') + ':' + 
           minutes.toString().padStart(2, '0') + ':' + 
           seconds.toString().padStart(2, '0');
  }
};

// Export global
window.firebaseApp = { 
  auth: auth, 
  db: db, 
  CONFIG: CONFIG, 
  utils: utils,
  CHIEF_ADMIN_UID: CHIEF_ADMIN_UID
};

firebase.auth().onAuthStateChanged(async (user) => {
  if (!user) return;

  try {
    // Requête normale
    const fichesSnap = await db.collection('fiches')
      .where('userId', '==', user.uid)
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get();

    updateProfileUI(fichesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  } catch (err) {
    console.warn("⚠️ v8 SDK bug interne, récupération fallback:", err);
    // Fallback sans orderBy pour éviter le crash interne
    const fallbackSnap = await db.collection('fiches')
      .where('userId', '==', user.uid)
      .limit(50)
      .get();

    updateProfileUI(fallbackSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  }
});

console.log('✅ Firebase v8 initialisé'); 
console.log("CURRENT USER AU LOAD:", auth.currentUser);