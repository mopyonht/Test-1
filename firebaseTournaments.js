// ===== SYSTÈME DE TOURNOIS FIREBASE - VERSION SIMPLIFIÉE =====

let currentUser = null;
let currentTournamentData = null;
let statsListeners = [];
let tournamentStartListener = null;

// ===== INITIALISATION =====
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

// ===== SYNC SOLDE =====
async function syncUserBalance(userId) {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
      const balance = userDoc.data().balance || 0;
      await rtdb.ref(`users/${userId}/balance`).set(balance);
      
      rtdb.ref(`users/${userId}/balance`).on('value', (snapshot) => {
        const newBalance = snapshot.val() || 0;
        const el = document.getElementById('userBalance');
        if (el) el.textContent = newBalance;
      });
    }
  } catch (error) {
    console.error("Erreur sync solde:", error);
  }
}

// ===== AFFICHAGE USER =====
async function displayUserInfo(userId) {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      const el = document.getElementById('userName');
      if (el) el.textContent = userData.username || 'Jwè';
    }
  } catch (error) {
    console.error("Erreur affichage user:", error);
  }
}

// ===== ÉCOUTER STATS =====
function listenToAllTournamentStats() {
  statsListeners.forEach(ref => ref.off());
  statsListeners = [];

  const configs = [
    { cat: 'test', players: 2, fees: [25, 50, 100] },
    { cat: 'rapid', players: 10, fees: [25, 50, 100, 250, 500] },
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

// ===== REJOINDRE TOURNOI =====
async function joinTournament(category, maxPlayers, entryFee, reward) {
  if (!currentUser) {
    alert("Ou dwe konekte!");
    return;
  }

  const roomKey = `${category}-${maxPlayers}-${entryFee}`;

  try {
    // Vérifier solde
    const balanceSnapshot = await rtdb.ref(`users/${currentUser.uid}/balance`).once('value');
    const currentBalance = balanceSnapshot.val() || 0;

    if (currentBalance < entryFee) {
      const el = document.getElementById('insufficientFunds');
      if (el) {
        el.style.display = 'block';
        setTimeout(() => { el.style.display = 'none'; }, 3000);
      }
      return;
    }

    // Créer métadonnées si pas existantes
    const metaRef = rtdb.ref(`tournaments/${roomKey}/meta`);
    const metaSnap = await metaRef.once('value');
    if (!metaSnap.exists()) {
      await metaRef.set({
        entryFee: entryFee,
        reward: reward,
        maxPlayers: maxPlayers,
        category: category
      });
    }

    // Ajouter joueur à waiting avec transaction pour éviter doublons
    const playerRef = rtdb.ref(`tournaments/${roomKey}/waiting/${currentUser.uid}`);
    await playerRef.set({
      userId: currentUser.uid,
      joinedAt: firebase.database.ServerValue.TIMESTAMP,
      status: 'waiting',
      balance: currentBalance
    });

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

// ===== MODAL ATTENTE =====
function showWaitingModal(maxPlayers, roomKey) {
  const modal = document.getElementById('waitingModal');
  const maxEl = document.getElementById('maxPlayers');
  if (maxEl) maxEl.textContent = maxPlayers;
  if (modal) modal.classList.add('active');

  const waitingRef = rtdb.ref(`tournaments/${roomKey}/waiting`);
  
  tournamentStartListener = waitingRef.on('value', async (snapshot) => {
    const currentCount = snapshot.numChildren();
    const el = document.getElementById('currentPlayers');
    if (el) el.textContent = currentCount;

    if (currentCount >= maxPlayers) {
      // Essayer de démarrer (un seul joueur réussira grâce au lock)
      await tryStartTournament(roomKey, maxPlayers, snapshot);
    }
  });
}

// ===== DÉMARRAGE AVEC LOCK =====
async function tryStartTournament(roomKey, maxPlayers, snapshot) {
  const lockRef = rtdb.ref(`tournaments/${roomKey}/lock`);
  
  try {
    // Essayer de prendre le lock avec transaction
    const lockResult = await lockRef.transaction((current) => {
      if (current === null) {
        return currentUser.uid; // Prendre le lock
      }
      return; // Abort si déjà pris
    });

    if (!lockResult.committed) {
      console.log("Lock déjà pris par un autre joueur");
      return;
    }

    console.log("Lock acquis, démarrage du tournoi...");

    // On a le lock, on démarre le tournoi
    const players = [];
    snapshot.forEach(child => {
      players.push(child.val());
    });

    const selectedPlayers = players.slice(0, maxPlayers);
    const { entryFee, reward } = currentTournamentData;

    // Vérifier et débiter tous les joueurs
    for (const player of selectedPlayers) {
      const balanceRef = rtdb.ref(`users/${player.userId}/balance`);
      const balSnap = await balanceRef.once('value');
      const bal = balSnap.val() || 0;

      if (bal < entryFee) {
        console.warn(`Joueur ${player.userId} n'a pas assez`);
        await rtdb.ref(`tournaments/${roomKey}/waiting/${player.userId}`).remove();
        throw new Error("Solde insuffisant pour un joueur");
      }

      // Débiter
      await balanceRef.set(bal - entryFee);
      await db.collection('users').doc(player.userId).update({
        balance: firebase.firestore.FieldValue.increment(-entryFee)
      });
    }

    // Créer le tournoi
    const tournamentId = Date.now() + '-' + roomKey;
    await rtdb.ref(`tournaments/${roomKey}/playing/${tournamentId}`).set({
      startedAt: firebase.database.ServerValue.TIMESTAMP,
      players: selectedPlayers.map(p => p.userId),
      status: 'countdown',
      reward: reward
    });

    // Nettoyer
    await rtdb.ref(`tournaments/${roomKey}/waiting`).remove();
    await lockRef.remove();

    // Fermer modal et démarrer
    const modal = document.getElementById('waitingModal');
    if (modal) modal.classList.remove('active');

    if (tournamentStartListener) {
      rtdb.ref(`tournaments/${roomKey}/waiting`).off('value', tournamentStartListener);
      tournamentStartListener = null;
    }

    localStorage.setItem('currentTournament', JSON.stringify({
      tournamentId,
      roomKey,
      reward: reward
    }));

    startCountdown(tournamentId, roomKey);

  } catch (error) {
    console.error("Erreur démarrage:", error);
    // Libérer le lock en cas d'erreur
    await lockRef.remove();
  }
}

// ===== ANNULER =====
async function cancelWaiting() {
  if (!currentUser || !currentTournamentData) return;

  try {
    const { roomKey } = currentTournamentData;
    await rtdb.ref(`tournaments/${roomKey}/waiting/${currentUser.uid}`).remove();

    const modal = document.getElementById('waitingModal');
    if (modal) modal.classList.remove('active');

    if (tournamentStartListener) {
      rtdb.ref(`tournaments/${roomKey}/waiting`).off('value', tournamentStartListener);
      tournamentStartListener = null;
    }

    currentTournamentData = null;
  } catch (error) {
    console.error("Erreur annulation:", error);
  }
}

// ===== COUNTDOWN =====
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
      window.location.href = 'dino-tournament.html';
    }
  }, 1000);
}

// ===== PERTE =====
async function onPlayerLose(tournamentId, roomKey) {
  if (!currentUser) return;

  try {
    const loseTime = Date.now();
    
    await rtdb.ref(`tournaments/${roomKey}/playing/${tournamentId}/results/${currentUser.uid}`).set({
      status: 'lost',
      time: loseTime
    });

    await db.collection('users').doc(currentUser.uid).update({
      defet: firebase.firestore.FieldValue.increment(1),
      pati: firebase.firestore.FieldValue.increment(1)
    });

    showDefeatMessage();

  } catch (error) {
    console.error("Erreur perte:", error);
  }
}

// ===== FIN TOURNOI =====
function listenForTournamentEnd(tournamentId, roomKey, totalPlayers) {
  const resultsRef = rtdb.ref(`tournaments/${roomKey}/playing/${tournamentId}/results`);
  
  resultsRef.on('value', async (snapshot) => {
    const results = snapshot.val();
    if (!results) return;

    const resultsList = Object.entries(results);
    
    if (resultsList.length >= totalPlayers) {
      resultsRef.off();

      const sortedResults = resultsList.sort((a, b) => {
        const timeA = a[1].time || Infinity;
        const timeB = b[1].time || Infinity;
        return timeB - timeA;
      });

      const winner = sortedResults[0];
      await declareWinner(winner[0], roomKey, tournamentId);
    }
  });
}

// ===== GAGNANT =====
async function declareWinner(winnerId, roomKey, tournamentId) {
  try {
    const tournamentSnap = await rtdb.ref(`tournaments/${roomKey}/playing/${tournamentId}`).once('value');
    const td = tournamentSnap.val() || {};
    const reward = td.reward || 0;

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
    }

    await rtdb.ref(`tournaments/${roomKey}/playing/${tournamentId}`).remove();

  } catch (error) {
    console.error("Erreur gagnant:", error);
  }
}

// ===== MESSAGES =====
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
  `;
  
  overlay.innerHTML = `
    <div style="font-size: 4rem; color: #16a34a; font-weight: 900; margin-bottom: 20px;">
      🎉 OU CHANPYON! 🎉
    </div>
    <div style="font-size: 2rem; color: white;">
      Ou genyen ${reward} GDS!
    </div>
    <button onclick="window.location.href='tournaments-home.html'" 
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
  `;
  
  overlay.innerHTML = `
    <div style="font-size: 3rem; color: #dc2626; font-weight: 900; margin-bottom: 20px;">
      OU PÈDI!
    </div>
    <div style="font-size: 1.5rem; color: white; text-align: center; max-width: 600px;">
      Rejwe ankò pou w ka Chanpyon!
    </div>
    <button onclick="window.location.href='tournaments-home.html'" 
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
        transform: translateY(100vh) rotate(360deg);
        opacity: 0;
      }
    }
  `;
  if (!document.getElementById('confettiStyle')) {
    style.id = 'confettiStyle';
    document.head.appendChild(style);
  }
}