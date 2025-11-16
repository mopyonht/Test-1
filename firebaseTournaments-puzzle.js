// ===== SYSTÈME DE TOURNOIS FIREBASE REALTIME - PUZZLE =====

let currentUser = null;
let currentTournamentData = null;
let statsListeners = [];

// Initialiser le système au chargement
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    await syncUserBalance(user.uid);
    displayUserInfo(user.uid);
    listenToAllTournamentStats();
  } else {
    alert("Ou dwe konekte pou patisipe nan tounwa yo!");
  }
});

// ===== SYNCHRONISATION DU SOLDE =====
async function syncUserBalance(userId) {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
      const balance = userDoc.data().balance || 0;
      await rtdb.ref(`users/${userId}/balance`).set(balance);
      rtdb.ref(`users/${userId}/balance`).on('value', (snapshot) => {
        const newBalance = snapshot.val() || 0;
        document.getElementById('userBalance').textContent = newBalance;
      });
    }
  } catch (error) {
    console.error("Erreur sync solde:", error);
  }
}

// ===== AFFICHAGE INFOS UTILISATEUR =====
async function displayUserInfo(userId) {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      document.getElementById('userName').textContent = userData.username || 'Jwè';
    }
  } catch (error) {
    console.error("Erreur affichage user:", error);
  }
}

// ===== ÉCOUTER LES STATS DES TOURNOIS =====
function listenToAllTournamentStats() {
  statsListeners.forEach(ref => ref.off());
  statsListeners = [];

  const configs = [
    { cat: 'test-puzzle', players: 2, fees: [25, 50, 100] },
    { cat: 'rapid-puzzle', players: 10, fees: [25, 50, 100, 250, 500] },
  ];

  configs.forEach(config => {
    config.fees.forEach(fee => {
      const roomKey = `${config.cat}-${config.players}-${fee}`;
      const waitRef = rtdb.ref(`tournaments/${roomKey}/waiting`);
      const playRef = rtdb.ref(`tournaments/${roomKey}/playing`);

      waitRef.on('value', (snapshot) => {
        const count = snapshot.numChildren();
        const el = document.getElementById(`wait-${roomKey}`);
        if (el) el.textContent = count;
      });

      playRef.on('value', (snapshot) => {
        const count = snapshot.numChildren();
        const el = document.getElementById(`play-${roomKey}`);
        if (el) el.textContent = count;
      });

      statsListeners.push(waitRef, playRef);
    });
  });
}

// ===== REJOINDRE UN TOURNOI =====
async function joinTournament(category, maxPlayers, entryFee, reward) {
  if (!currentUser) {
    alert("Ou dwe konekte!");
    return;
  }

  const roomKey = `${category}-${maxPlayers}-${entryFee}`;
  
  try {
    const balanceSnapshot = await rtdb.ref(`users/${currentUser.uid}/balance`).once('value');
    const currentBalance = balanceSnapshot.val() || 0;

    if (currentBalance < entryFee) {
      document.getElementById('insufficientFunds').style.display = 'block';
      setTimeout(() => {
        document.getElementById('insufficientFunds').style.display = 'none';
      }, 3000);
      return;
    }

    const playerData = {
      userId: currentUser.uid,
      joinedAt: firebase.database.ServerValue.TIMESTAMP,
      status: 'waiting'
    };

    const waitingRef = rtdb.ref(`tournaments/${roomKey}/waiting/${currentUser.uid}`);
    await waitingRef.set(playerData);

    currentTournamentData = {
      roomKey,
      category,
      maxPlayers,
      entryFee,
      reward
    };

    showWaitingModal(maxPlayers, roomKey);

  } catch (error) {
    console.error("Erreur rejoindre tournoi:", error);
    alert("Erè pandan w ap antre nan tounwa a!");
  }
}

// ===== AFFICHER MODAL D'ATTENTE =====
function showWaitingModal(maxPlayers, roomKey) {
  const modal = document.getElementById('waitingModal');
  document.getElementById('maxPlayers').textContent = maxPlayers;
  modal.classList.add('active');

  const waitingRef = rtdb.ref(`tournaments/${roomKey}/waiting`);
  
  waitingRef.on('value', async (snapshot) => {
    const currentCount = snapshot.numChildren();
    document.getElementById('currentPlayers').textContent = currentCount;

    if (currentCount >= maxPlayers) {
      waitingRef.off();
      await startTournament(roomKey, snapshot);
    }
  });
}

// ===== ANNULER L'ATTENTE =====
async function cancelWaiting() {
  if (!currentUser || !currentTournamentData) return;

  try {
    const { roomKey } = currentTournamentData;
    await rtdb.ref(`tournaments/${roomKey}/waiting/${currentUser.uid}`).remove();
    
    document.getElementById('waitingModal').classList.remove('active');
    currentTournamentData = null;
  } catch (error) {
    console.error("Erreur annulation:", error);
  }
}

// ===== DÉMARRER LE TOURNOI =====
async function startTournament(roomKey, playersSnapshot) {
  try {
    const players = [];
    playersSnapshot.forEach(child => {
      players.push({
        uid: child.key,
        ...child.val()
      });
    });

    const tournamentId = Date.now() + '-' + roomKey;
    const { entryFee, reward } = currentTournamentData;
    
    for (let player of players) {
      const balanceRef = rtdb.ref(`users/${player.uid}/balance`);
      const snapshot = await balanceRef.once('value');
      const currentBalance = snapshot.val() || 0;
      await balanceRef.set(currentBalance - entryFee);

      await db.collection('users').doc(player.uid).update({
        balance: firebase.firestore.FieldValue.increment(-entryFee)
      });
    }

    const playingRef = rtdb.ref(`tournaments/${roomKey}/playing/${tournamentId}`);
    await playingRef.set({
      startedAt: firebase.database.ServerValue.TIMESTAMP,
      players: players.map(p => p.uid),
      status: 'countdown',
      reward: reward
    });

    await rtdb.ref(`tournaments/${roomKey}/waiting`).remove();

    document.getElementById('waitingModal').classList.remove('active');
    
    startCountdown(tournamentId, roomKey);

  } catch (error) {
    console.error("Erreur démarrage tournoi:", error);
    alert("Erè pandan demaraj tounwa a!");
  }
}

// ===== COMPTE À REBOURS =====
function startCountdown(tournamentId, roomKey) {
  let countdown = 10;
  
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    color: white;
    font-size: 8rem;
    font-weight: 900;
  `;
  overlay.textContent = countdown;
  document.body.appendChild(overlay);

  const interval = setInterval(() => {
    countdown--;
    overlay.textContent = countdown;

    if (countdown <= 0) {
      clearInterval(interval);
      overlay.remove();
      
      localStorage.setItem('currentTournament', JSON.stringify({
        tournamentId,
        roomKey,
        reward: currentTournamentData.reward
      }));
      
      window.location.href = 'puzzle-tournament.html';
    }
  }, 1000);
}

// ===== FONCTIONS POUR LE JEU PUZZLE =====

// Mettre à jour le pourcentage de complétion en temps réel
async function updateProgress(tournamentId, roomKey, percentage) {
  if (!currentUser) return;

  try {
    await rtdb.ref(`tournaments/${roomKey}/playing/${tournamentId}/progress/${currentUser.uid}`).set({
      percentage: percentage,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });
  } catch (error) {
    console.error("Erreur mise à jour progression:", error);
  }
}

// Appelé quand le joueur complète le puzzle
async function onPlayerWin(tournamentId, roomKey) {
  if (!currentUser) return;

  try {
    const winTime = Date.now();
    
    await rtdb.ref(`tournaments/${roomKey}/playing/${tournamentId}/results/${currentUser.uid}`).set({
      status: 'completed',
      time: winTime,
      percentage: 100
    });

    // Le premier à 100% gagne automatiquement
    checkForWinner(tournamentId, roomKey);

  } catch (error) {
    console.error("Erreur enregistrement victoire:", error);
  }
}

// Vérifier s'il y a un gagnant (premier à 100%)
async function checkForWinner(tournamentId, roomKey) {
  try {
    const resultsRef = rtdb.ref(`tournaments/${roomKey}/playing/${tournamentId}/results`);
    const snapshot = await resultsRef.once('value');
    const results = snapshot.val();
    
    if (!results) return;

    // Chercher le premier joueur à 100%
    const winner = Object.entries(results).find(([uid, data]) => data.percentage === 100);
    
    if (winner) {
      const [winnerId, winData] = winner;
      await declareWinner(winnerId, roomKey, tournamentId);
    }
  } catch (error) {
    console.error("Erreur vérification gagnant:", error);
  }
}

// Écouter les progressions pour calculer le rang
function listenForRankings(tournamentId, roomKey, totalPlayers) {
  const progressRef = rtdb.ref(`tournaments/${roomKey}/playing/${tournamentId}/progress`);
  
  progressRef.on('value', (snapshot) => {
    const progressData = snapshot.val();
    if (!progressData) return;

    // Calculer le rang du joueur actuel
    const progressList = Object.entries(progressData).map(([uid, data]) => ({
      uid,
      percentage: data.percentage || 0
    }));

    // Trier par pourcentage décroissant
    progressList.sort((a, b) => b.percentage - a.percentage);

    // Trouver le rang du joueur actuel
    const myRank = progressList.findIndex(p => p.uid === currentUser.uid) + 1;
    
    // Mettre à jour l'affichage du rang
    if (window.updatePlayerRank) {
      window.updatePlayerRank(myRank, totalPlayers);
    }
  });
}

// Déclarer le gagnant
async function declareWinner(winnerId, roomKey, tournamentId) {
  try {
    const tournamentData = await rtdb.ref(`tournaments/${roomKey}/playing/${tournamentId}`).once('value');
    const reward = tournamentData.val().reward;

    const balanceRef = rtdb.ref(`users/${winnerId}/balance`);
    const snapshot = await balanceRef.once('value');
    const currentBalance = snapshot.val() || 0;
    await balanceRef.set(currentBalance + reward);

    await db.collection('users').doc(winnerId).update({
      balance: firebase.firestore.FieldValue.increment(reward),
      viktwa: firebase.firestore.FieldValue.increment(1),
      pati: firebase.firestore.FieldValue.increment(1)
    });

    if (winnerId === currentUser.uid) {
      showVictoryMessage(reward);
    } else {
      showDefeatMessage();
    }

    await rtdb.ref(`tournaments/${roomKey}/playing/${tournamentId}`).remove();

  } catch (error) {
    console.error("Erreur déclaration gagnant:", error);
  }
}

// Messages de victoire/défaite
function showVictoryMessage(reward) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.85);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    animation: fadeIn 0.3s;
  `;
  
  overlay.innerHTML = `
    <div style="font-size: 4rem; color: #16a34a; font-weight: 900; margin-bottom: 20px;">
      🎉 OU CHANPYON! 🎉
    </div>
    <div style="font-size: 2rem; color: white;">
      Ou genyen ${reward} GDS!
    </div>
    <button onclick="window.location.href='tournaments-home-puzzle.html'" 
      style="margin-top: 40px; padding: 15px 40px; font-size: 1.2rem; background: #16a34a; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 700;">
      Retounen
    </button>
  `;
  
  document.body.appendChild(overlay);
  createConfetti();
}

function showDefeatMessage() {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.85);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    animation: fadeIn 0.3s;
  `;
  
  overlay.innerHTML = `
    <div style="font-size: 3rem; color: #dc2626; font-weight: 900; margin-bottom: 20px;">
      OU PÈDI!
    </div>
    <div style="font-size: 1.5rem; color: white; text-align: center; max-width: 600px;">
      Yon lòt jwè fini puzzle la anvan ou!
    </div>
    <button onclick="window.location.href='tournaments-home-puzzle.html'" 
      style="margin-top: 40px; padding: 15px 40px; font-size: 1.2rem; background: #dc2626; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 700;">
      Soti
    </button>
  `;
  
  document.body.appendChild(overlay);
}

function createConfetti() {
  for (let i = 0; i < 50; i++) {
    const confetti = document.createElement('div');
    confetti.style.cssText = `
      position: fixed;
      width: 10px;
      height: 10px;
      background: ${['#16a34a', '#fbbf24', '#2563eb', '#dc2626'][Math.floor(Math.random() * 4)]};
      left: ${Math.random() * 100}%;
      top: -20px;
      animation: confettiFall ${2 + Math.random() * 2}s ease-out forwards;
      z-index: 10000;
    `;
    document.body.appendChild(confetti);
    setTimeout(() => confetti.remove(), 4000);
  }
  
  const style = document.createElement('style');
  style.textContent = `
    @keyframes confettiFall {
      to {
        transform: translateY(100vh) rotate(${Math.random() * 360}deg);
        opacity: 0;
      }
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}