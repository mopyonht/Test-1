// ===== SYSTÈME DE TOURNOIS FIREBASE REALTIME / Dino =====

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
    // Rediriger vers page de login si nécessaire
  }
});

// ===== SYNCHRONISATION DU SOLDE =====
async function syncUserBalance(userId) {
  try {
    // Récupérer le solde depuis Firestore
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
      const balance = userDoc.data().balance || 0;
      
      // Synchroniser avec Realtime Database pour le temps réel
      await rtdb.ref(`users/${userId}/balance`).set(balance);
      
      // Écouter les changements en temps réel
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
  // Nettoyer les anciens listeners
  statsListeners.forEach(ref => ref.off());
  statsListeners = [];

  // Catégories et leurs configurations
  const configs = [
    { cat: 'test', players: 2, fees: [25, 50, 100] },
    { cat: 'rapid', players: 10, fees: [25, 50, 100, 250, 500] },
    // Ajouter les autres catégories ici quand prêt
  ];

  configs.forEach(config => {
    config.fees.forEach(fee => {
      const roomKey = `${config.cat}-${config.players}-${fee}`;
      const waitRef = rtdb.ref(`tournaments/${roomKey}/waiting`);
      const playRef = rtdb.ref(`tournaments/${roomKey}/playing`);

      // Listener pour joueurs en attente
      waitRef.on('value', (snapshot) => {
        const count = snapshot.numChildren();
        const el = document.getElementById(`wait-${roomKey}`);
        if (el) el.textContent = count;
      });

      // Listener pour parties en cours
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
    // Vérifier le solde
    const balanceSnapshot = await rtdb.ref(`users/${currentUser.uid}/balance`).once('value');
    const currentBalance = balanceSnapshot.val() || 0;

    if (currentBalance < entryFee) {
      document.getElementById('insufficientFunds').style.display = 'block';
      setTimeout(() => {
        document.getElementById('insufficientFunds').style.display = 'none';
      }, 3000);
      return;
    }

    // Ajouter le joueur à la file d'attente
    const playerData = {
      userId: currentUser.uid,
      joinedAt: firebase.database.ServerValue.TIMESTAMP,
      status: 'waiting'
    };

    const waitingRef = rtdb.ref(`tournaments/${roomKey}/waiting/${currentUser.uid}`);
    await waitingRef.set(playerData);

    // Sauvegarder les données du tournoi actuel
    currentTournamentData = {
      roomKey,
      category,
      maxPlayers,
      entryFee,
      reward
    };

    // Afficher la modal d'attente
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

  // Écouter les changements dans la salle d'attente
  const waitingRef = rtdb.ref(`tournaments/${roomKey}/waiting`);
  
  waitingRef.on('value', async (snapshot) => {
    const currentCount = snapshot.numChildren();
    document.getElementById('currentPlayers').textContent = currentCount;

    // Si on atteint le nombre requis, démarrer le tournoi
    if (currentCount >= maxPlayers) {
      waitingRef.off(); // Arrêter d'écouter
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

    // Créer un ID unique pour ce tournoi
    const tournamentId = Date.now() + '-' + roomKey;

    // Déduire les frais de tous les joueurs
    const { entryFee, reward } = currentTournamentData;
    
    for (let player of players) {
      // Déduire dans Realtime Database
      const balanceRef = rtdb.ref(`users/${player.uid}/balance`);
      const snapshot = await balanceRef.once('value');
      const currentBalance = snapshot.val() || 0;
      await balanceRef.set(currentBalance - entryFee);

      // Aussi mettre à jour Firestore
      await db.collection('users').doc(player.uid).update({
        balance: firebase.firestore.FieldValue.increment(-entryFee)
      });
    }

    // Déplacer les joueurs de "waiting" vers "playing"
    const playingRef = rtdb.ref(`tournaments/${roomKey}/playing/${tournamentId}`);
    await playingRef.set({
      startedAt: firebase.database.ServerValue.TIMESTAMP,
      players: players.map(p => p.uid),
      status: 'countdown',
      reward: reward
    });

    // Nettoyer la salle d'attente
    await rtdb.ref(`tournaments/${roomKey}/waiting`).remove();

    // Fermer la modal et démarrer le compte à rebours
    document.getElementById('waitingModal').classList.remove('active');
    
    // Démarrer le compte à rebours puis le jeu
    startCountdown(tournamentId, roomKey);

  } catch (error) {
    console.error("Erreur démarrage tournoi:", error);
    alert("Erè pandan demaraj tounwa a!");
  }
}

// ===== COMPTE À REBOURS =====
function startCountdown(tournamentId, roomKey) {
  let countdown = 10;
  
  // Créer un overlay de compte à rebours
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
      
      // Stocker les infos du tournoi et rediriger vers le jeu
      localStorage.setItem('currentTournament', JSON.stringify({
        tournamentId,
        roomKey,
        reward: currentTournamentData.reward
      }));
      
      // Rediriger vers le jeu (adapter selon le jeu choisi)
      window.location.href = 'dino-tournament.html';
    }
  }, 1000);
}

// ===== FONCTIONS POUR LE JEU =====

// Appelé quand le joueur perd dans le jeu
async function onPlayerLose(tournamentId, roomKey) {
  if (!currentUser) return;

  try {
    const loseTime = Date.now();
    
    // Enregistrer la perte avec le timestamp
    await rtdb.ref(`tournaments/${roomKey}/playing/${tournamentId}/results/${currentUser.uid}`).set({
      status: 'lost',
      time: loseTime
    });

    // Mettre à jour Firestore (stats)
    await db.collection('users').doc(currentUser.uid).update({
      defet: firebase.firestore.FieldValue.increment(1),
      pati: firebase.firestore.FieldValue.increment(1)
    });

    // Afficher message de défaite
    showDefeatMessage();

  } catch (error) {
    console.error("Erreur enregistrement perte:", error);
  }
}

// Écouter les résultats du tournoi pour détecter le gagnant
function listenForTournamentEnd(tournamentId, roomKey, totalPlayers) {
  const resultsRef = rtdb.ref(`tournaments/${roomKey}/playing/${tournamentId}/results`);
  
  resultsRef.on('value', async (snapshot) => {
    const results = snapshot.val();
    if (!results) return;

    const resultsList = Object.entries(results);
    
    // Si tous les joueurs ont un résultat
    if (resultsList.length >= totalPlayers) {
      resultsRef.off(); // Arrêter d'écouter

      // Trouver le(s) gagnant(s) (derniers à perdre ou pas de perte)
      const sortedResults = resultsList.sort((a, b) => {
        const timeA = a[1].time || Infinity;
        const timeB = b[1].time || Infinity;
        return timeB - timeA; // Plus grand temps = dernier à perdre
      });

      const winner = sortedResults[0];
      
      // Vérifier s'il y a égalité
      const winnersWithSameTime = sortedResults.filter(r => r[1].time === winner[1].time);

      if (winnersWithSameTime.length > 1) {
        // Relancer le tournoi avec ces joueurs
        await relaunchTournament(roomKey, winnersWithSameTime.map(w => w[0]));
      } else {
        // Un seul gagnant
        await declareWinner(winner[0], roomKey, tournamentId);
      }
    }
  });
}

// Déclarer le gagnant
async function declareWinner(winnerId, roomKey, tournamentId) {
  try {
    // Récupérer la récompense
    const tournamentData = await rtdb.ref(`tournaments/${roomKey}/playing/${tournamentId}`).once('value');
    const reward = tournamentData.val().reward;

    // Donner la récompense au gagnant
    const balanceRef = rtdb.ref(`users/${winnerId}/balance`);
    const snapshot = await balanceRef.once('value');
    const currentBalance = snapshot.val() || 0;
    await balanceRef.set(currentBalance + reward);

    // Mettre à jour Firestore
    await db.collection('users').doc(winnerId).update({
      balance: firebase.firestore.FieldValue.increment(reward),
      viktwa: firebase.firestore.FieldValue.increment(1),
      pati: firebase.firestore.FieldValue.increment(1)
    });

    // Afficher message de victoire si c'est nous
    if (winnerId === currentUser.uid) {
      showVictoryMessage(reward);
    }

    // Nettoyer le tournoi
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
    <button onclick="window.location.href='tournaments-home.html'" 
      style="margin-top: 40px; padding: 15px 40px; font-size: 1.2rem; background: #16a34a; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 700;">
      Retounen
    </button>
  `;
  
  document.body.appendChild(overlay);
  
  // Confettis effect
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
      Rejwe ankò pou w ka Chanpyon!
    </div>
    <button onclick="window.location.href='tournaments-home.html'" 
      style="margin-top: 40px; padding: 15px 40px; font-size: 1.2rem; background: #dc2626; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 700;">
      Soti
    </button>
  `;
  
  document.body.appendChild(overlay);
}

// Effet confettis simple
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