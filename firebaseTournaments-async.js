// ===== SYSTÈME DE TOURNOIS ASYNCHRONE - DINO =====

let currentUser = null;
let currentHistoryTab = 'ongoing';
const OWNER_UID = 'VOTRE_UID_ICI'; // Remplacer par ton UID pour commission
const JACKPOT_END_HOUR = 22; // 22h (10h du soir)

// ===== INITIALISATION =====
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    await syncUserBalance(user.uid);
    displayUserInfo(user.uid);
    listenToAllTournaments();
    initJackpot();
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
        document.getElementById('userBalance').textContent = newBalance.toLocaleString();
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
      document.getElementById('userName').textContent = userData.username || 'Jwè';
    }
  } catch (error) {
    console.error("Erreur affichage user:", error);
  }
}

// ===== ÉCOUTER TOUS LES TOURNOIS =====
function listenToAllTournaments() {
  const categories = [
    { prefix: 'test-dino', players: [2], fees: [25, 50, 100] },
    { prefix: 'rapid-dino', players: [10], fees: [25, 50, 100, 250, 500] },
    { prefix: 'pro-dino', players: [50], fees: [25, 50, 100, 250, 500] },
    { prefix: 'elite-dino', players: [100], fees: [5, 25, 50, 100, 250, 500] },
    { prefix: 'master-dino', players: [500], fees: [5, 25, 50, 100, 250] },
    { prefix: 'legend-dino', players: [1000], fees: [5, 25, 50, 100, 250] }
  ];

  categories.forEach(cat => {
    cat.players.forEach(p => {
      cat.fees.forEach(f => {
        const roomKey = `${cat.prefix}-${p}-${f}`;
        const roomsRef = rtdb.ref(`tournaments/${roomKey}/rooms`);
        
        roomsRef.on('value', (snapshot) => {
          const count = snapshot.numChildren();
          updateTournamentStatus(roomKey, count);
        });
      });
    });
  });
}

// ===== MISE À JOUR STATUS TOURNOI =====
function updateTournamentStatus(roomKey, count) {
  const statusDot = document.getElementById(`status-${roomKey}`);
  const countText = document.getElementById(`count-${roomKey}`);
  
  if (statusDot && countText) {
    if (count > 0) {
      statusDot.classList.remove('inactive');
      countText.textContent = `${count} en cours`;
    } else {
      statusDot.classList.add('inactive');
      countText.textContent = '0 en cours';
    }
  }
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
      alert(`❌ Ou pa gen ase lajan! Ou gen ${currentBalance} GDS, men ou bezwen ${entryFee} GDS.`);
      return;
    }

    // Trouver ou créer une room disponible
    const roomsRef = rtdb.ref(`tournaments/${roomKey}/rooms`);
    const roomsSnapshot = await roomsRef.once('value');
    
    let targetRoomId = null;
    let targetRoom = null;

    // Chercher une room active et pas pleine
    roomsSnapshot.forEach(roomSnap => {
      const room = roomSnap.val();
      if (room.status === 'active' && room.currentPlayers < maxPlayers) {
        targetRoomId = roomSnap.key;
        targetRoom = room;
      }
    });

    // Si aucune room disponible, créer une nouvelle
    if (!targetRoomId) {
      targetRoomId = `room-${Date.now()}`;
      await roomsRef.child(targetRoomId).set({
        status: 'active',
        maxPlayers: maxPlayers,
        currentPlayers: 0,
        entryFee: entryFee,
        reward: reward,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        category: category
      });
    }

    // Débiter le joueur
    await rtdb.ref(`users/${currentUser.uid}/balance`).transaction((balance) => {
      if (balance >= entryFee) {
        return balance - entryFee;
      }
      return;
    });

    await db.collection('users').doc(currentUser.uid).update({
      balance: firebase.firestore.FieldValue.increment(-entryFee)
    });

    // Ajouter le joueur à la room
    await roomsRef.child(targetRoomId).child('participants').child(currentUser.uid).set({
      userId: currentUser.uid,
      joinedAt: firebase.database.ServerValue.TIMESTAMP,
      paid: true,
      score: null,
      completedAt: null
    });

    // Incrémenter le compteur
    await roomsRef.child(targetRoomId).child('currentPlayers').transaction((count) => {
      return (count || 0) + 1;
    });

    // Sauvegarder dans l'historique user (ongoing)
    await db.collection('users').doc(currentUser.uid).collection('tournaments').doc(targetRoomId).set({
      roomKey: roomKey,
      roomId: targetRoomId,
      category: category,
      maxPlayers: maxPlayers,
      entryFee: entryFee,
      reward: reward,
      status: 'ongoing',
      joinedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Rediriger vers le jeu
    localStorage.setItem('currentTournament', JSON.stringify({
      roomKey: roomKey,
      roomId: targetRoomId,
      maxPlayers: maxPlayers,
      reward: reward
    }));

    window.location.href = 'dino-tournament.html';

  } catch (error) {
    console.error("Erreur rejoindre tournoi:", error);
    alert("Erè pandan w ap antre nan tounwa a!");
  }
}

// ===== SOUMETTRE SCORE =====
async function submitScore(roomKey, roomId, score) {
  if (!currentUser) return;

  try {
    const participantRef = rtdb.ref(`tournaments/${roomKey}/rooms/${roomId}/participants/${currentUser.uid}`);
    
    await participantRef.update({
      score: score,
      completedAt: firebase.database.ServerValue.TIMESTAMP
    });

    // Vérifier si tous les joueurs ont fini
    const roomRef = rtdb.ref(`tournaments/${roomKey}/rooms/${roomId}`);
    const roomSnap = await roomRef.once('value');
    const room = roomSnap.val();
    
    if (!room) return;

    const participants = room.participants || {};
    const allFinished = Object.values(participants).every(p => p.score !== null);

    if (allFinished && room.currentPlayers >= room.maxPlayers) {
      // Tous ont fini, déterminer le gagnant
      await determineWinner(roomKey, roomId, room);
    } else {
      // Afficher résultats provisoires
      showProvisionalResults(roomKey, roomId, room);
    }

  } catch (error) {
    console.error("Erreur soumission score:", error);
  }
}

// ===== DÉTERMINER GAGNANT =====
async function determineWinner(roomKey, roomId, room) {
  try {
    const participants = Object.entries(room.participants).map(([uid, data]) => ({
      uid,
      ...data
    }));

    // Trier par score (plus haut = meilleur)
    participants.sort((a, b) => b.score - a.score);

    const topScore = participants[0].score;
    const winners = participants.filter(p => p.score === topScore);

    if (winners.length > 1) {
      // Égalité → Mini-tournoi
      await createTiebreakerTournament(roomKey, winners, room.reward);
      showTiebreakerNotification(winners.map(w => w.uid));
    } else {
      // Un seul gagnant
      const winnerId = winners[0].uid;
      await distributeReward(winnerId, room.reward, roomKey, roomId);
      await markTournamentCompleted(roomKey, roomId, winnerId, participants);
      showFinalResults(roomKey, roomId, winnerId, participants, room.reward);
    }

  } catch (error) {
    console.error("Erreur déterminer gagnant:", error);
  }
}

// ===== DISTRIBUER RÉCOMPENSE =====
async function distributeReward(winnerId, reward, roomKey, roomId) {
  try {
    await rtdb.ref(`users/${winnerId}/balance`).transaction((balance) => {
      return (balance || 0) + reward;
    });

    await db.collection('users').doc(winnerId).update({
      balance: firebase.firestore.FieldValue.increment(reward),
      viktwa: firebase.firestore.FieldValue.increment(1),
      pati: firebase.firestore.FieldValue.increment(1)
    });

  } catch (error) {
    console.error("Erreur distribution récompense:", error);
  }
}

// ===== MARQUER TOURNOI TERMINÉ =====
async function markTournamentCompleted(roomKey, roomId, winnerId, participants) {
  try {
    await rtdb.ref(`tournaments/${roomKey}/rooms/${roomId}`).update({
      status: 'completed',
      winnerId: winnerId,
      completedAt: firebase.database.ServerValue.TIMESTAMP
    });

    // Mettre à jour l'historique de tous les participants
    for (const p of participants) {
      await db.collection('users').doc(p.uid).collection('tournaments').doc(roomId).update({
        status: 'completed',
        won: p.uid === winnerId,
        finalPosition: participants.findIndex(pp => pp.uid === p.uid) + 1,
        score: p.score,
        completedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      if (p.uid !== winnerId) {
        await db.collection('users').doc(p.uid).update({
          defet: firebase.firestore.FieldValue.increment(1),
          pati: firebase.firestore.FieldValue.increment(1)
        });
      }
    }

    // Supprimer la room après 5 minutes (nettoyage)
    setTimeout(async () => {
      await rtdb.ref(`tournaments/${roomKey}/rooms/${roomId}`).remove();
    }, 300000);

  } catch (error) {
    console.error("Erreur marquer tournoi terminé:", error);
  }
}

// ===== CRÉER MINI-TOURNOI (ÉGALITÉ) =====
async function createTiebreakerTournament(originalRoomKey, winners, reward) {
  try {
    const tiebreakerRoomKey = `${originalRoomKey}-tiebreaker`;
    const tiebreakerRoomId = `room-${Date.now()}-tie`;

    await rtdb.ref(`tournaments/${tiebreakerRoomKey}/rooms/${tiebreakerRoomId}`).set({
      status: 'active',
      maxPlayers: winners.length,
      currentPlayers: 0,
      entryFee: 0,
      reward: reward,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      isTiebreaker: true
    });

    for (const winner of winners) {
      await rtdb.ref(`tournaments/${tiebreakerRoomKey}/rooms/${tiebreakerRoomId}/participants/${winner.uid}`).set({
        userId: winner.uid,
        joinedAt: firebase.database.ServerValue.TIMESTAMP,
        paid: true,
        score: null
      });
    }

  } catch (error) {
    console.error("Erreur création mini-tournoi:", error);
  }
}

// ===== AFFICHER RÉSULTATS =====
function showFinalResults(roomKey, roomId, winnerId, participants, reward) {
  const modal = document.getElementById('resultsModal');
  const title = document.getElementById('resultsTitle');
  const info = document.getElementById('resultsInfo');
  const list = document.getElementById('resultsList');

  const isWinner = winnerId === currentUser.uid;

  title.textContent = isWinner ? '🎉 OU CHANPYON! 🎉' : '❌ OU PÈDI!';
  title.style.color = isWinner ? '#16a34a' : '#dc2626';

  info.innerHTML = isWinner 
    ? `<strong>Ou genyen ${reward.toLocaleString()} GDS!</strong>`
    : `Rejwe ankò pou w ka Chanpyon!`;

  list.innerHTML = '';

  participants.slice(0, 5).forEach((p, idx) => {
    const item = document.createElement('div');
    item.className = 'leaderboard-item';
    if (idx < 3) item.classList.add('top3');
    if (p.uid === currentUser.uid) item.classList.add('me');

    const medals = ['🥇', '🥈', '🥉'];
    const medal = idx < 3 ? medals[idx] : '';

    item.innerHTML = `
      <div class="rank">#${idx + 1} ${medal}</div>
      <div class="player-name">${p.uid === currentUser.uid ? 'TOI' : 'Joueur ' + (idx + 1)}</div>
      <div class="score">${p.score} pts</div>
    `;
    list.appendChild(item);
  });

  // Afficher position du joueur actuel si pas dans top 5
  const myPosition = participants.findIndex(p => p.uid === currentUser.uid);
  if (myPosition >= 5) {
    const divider = document.createElement('div');
    divider.style.cssText = 'border-top: 2px dashed #cbd5e1; margin: 15px 0;';
    list.appendChild(divider);

    const myItem = document.createElement('div');
    myItem.className = 'leaderboard-item me';
    myItem.innerHTML = `
      <div class="rank">#${myPosition + 1}</div>
      <div class="player-name">TOI</div>
      <div class="score">${participants[myPosition].score} pts</div>
    `;
    list.appendChild(myItem);
  }

  modal.classList.add('active');

  // Confettis si gagnant
  if (isWinner) {
    createConfetti();
  }
}

function showProvisionalResults(roomKey, roomId, room) {
  // Affichage temporaire en attendant les autres
  console.log("En attente des autres joueurs...");
}

function showTiebreakerNotification(playerIds) {
  if (playerIds.includes(currentUser.uid)) {
    alert("⚔️ Égalité! Rejwe pou départaje!");
    // Rediriger vers mini-tournoi
  }
}

// ===== JACKPOT QUOTIDIEN =====
async function initJackpot() {
  const today = new Date().toISOString().split('T')[0];
  const jackpotRef = rtdb.ref(`jackpot/${today}`);

  // Écouter les mises à jour
  jackpotRef.on('value', (snapshot) => {
    const data = snapshot.val();
    if (data) {
      const jackpotAmount = Math.floor(data.totalDeposited * 0.8);
      document.getElementById('jackpotAmount').textContent = jackpotAmount.toLocaleString();
      document.getElementById('modalJackpotAmount').textContent = jackpotAmount.toLocaleString();
      
      const participants = data.participants ? Object.keys(data.participants).length : 0;
      document.getElementById('jackpotPlayers').textContent = participants;

      updateJackpotTimer(data.endsAt);
    } else {
      // Créer le jackpot du jour
      const endTime = new Date();
      endTime.setHours(JACKPOT_END_HOUR, 0, 0, 0);
      
      jackpotRef.set({
        totalDeposited: 0,
        endsAt: endTime.getTime(),
        status: 'active'
      });
    }
  });
}

function updateJackpotTimer(endsAt) {
  const updateTimer = () => {
    const now = Date.now();
    const diff = endsAt - now;

    if (diff <= 0) {
      document.getElementById('jackpotTimer').textContent = '00:00:00';
      document.getElementById('modalJackpotTimer').textContent = '00:00:00';
      // Déclencher fin du jackpot
      endJackpot();
      return;
    }

    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    document.getElementById('jackpotTimer').textContent = timeStr;
    document.getElementById('modalJackpotTimer').textContent = timeStr;
  };

  updateTimer();
  setInterval(updateTimer, 1000);
}

async function joinJackpot() {
  if (!currentUser) {
    alert("Ou dwe konekte!");
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const jackpotRef = rtdb.ref(`jackpot/${today}`);

  try {
    // Vérifier solde
    const balanceSnapshot = await rtdb.ref(`users/${currentUser.uid}/balance`).once('value');
    const currentBalance = balanceSnapshot.val() || 0;

    if (currentBalance < 5) {
      alert("❌ Ou pa gen ase lajan! Ou bezwen 5 GDS.");
      return;
    }

    // Débiter
    await rtdb.ref(`users/${currentUser.uid}/balance`).transaction((balance) => {
      return (balance || 0) - 5;
    });

    await db.collection('users').doc(currentUser.uid).update({
      balance: firebase.firestore.FieldValue.increment(-5)
    });

    // Ajouter au total
    await jackpotRef.child('totalDeposited').transaction((total) => {
      return (total || 0) + 5;
    });

    // Rediriger vers le jeu
    localStorage.setItem('currentTournament', JSON.stringify({
      roomKey: 'jackpot',
      roomId: today,
      isJackpot: true
    }));

    window.location.href = 'dino-tournament.html';

  } catch (error) {
    console.error("Erreur jackpot:", error);
    alert("Erè!");
  }
}

async function showJackpotLeaderboard() {
  const today = new Date().toISOString().split('T')[0];
  const jackpotRef = rtdb.ref(`jackpot/${today}/participants`);
  
  const snapshot = await jackpotRef.once('value');
  const participants = [];

  snapshot.forEach(child => {
    participants.push({
      uid: child.key,
      ...child.val()
    });
  });

  participants.sort((a, b) => b.bestScore - a.bestScore);

  const list = document.getElementById('jackpotLeaderboardList');
  list.innerHTML = '';

  if (participants.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:#64748b;padding:40px;">Okenn patisipan ankò</div>';
  } else {
    participants.slice(0, 10).forEach((p, idx) => {
      const item = document.createElement('div');
      item.className = 'leaderboard-item';
      if (idx < 3) item.classList.add('top3');
      if (p.uid === currentUser.uid) item.classList.add('me');

      const medals = ['🥇', '🥈', '🥉'];
      const medal = idx < 3 ? medals[idx] : '';

      item.innerHTML = `
        <div class="rank">#${idx + 1} ${medal}</div>
        <div class="player-name">${p.uid === currentUser.uid ? 'TOI' : 'Joueur ' + (idx + 1)}</div>
        <div class="score">${p.bestScore} pts</div>
      `;
      list.appendChild(item);
    });

    // Position du joueur
    const myPosition = participants.findIndex(p => p.uid === currentUser.uid);
    if (myPosition >= 10) {
      const divider = document.createElement('div');
      divider.style.cssText = 'border-top: 2px dashed #cbd5e1; margin: 15px 0;';
      list.appendChild(divider);

      const myItem = document.createElement('div');
      myItem.className = 'leaderboard-item me';
      myItem.innerHTML = `
        <div class="rank">#${myPosition + 1}</div>
        <div class="player-name">TOI (${participants[myPosition].attempts} parties)</div>
        <div class="score">${participants[myPosition].bestScore} pts</div>
      `;
      list.appendChild(myItem);
    }
  }

  document.getElementById('jackpotLeaderboardModal').classList.add('active');
}

async function endJackpot() {
  // Appelé automatiquement quand le timer atteint 0
  const today = new Date().toISOString().split('T')[0];
  const jackpotRef = rtdb.ref(`jackpot/${today}`);
  
  const snapshot = await jackpotRef.once('value');
  const data = snapshot.val();
  
  if (!data || !data.participants) return;

  const participants = Object.entries(data.participants).map(([uid, d]) => ({uid, ...d}));
  participants.sort((a, b) => b.bestScore - a.bestScore);

  const topScore = participants[0].bestScore;
  const winners = participants.filter(p => p.bestScore === topScore);

  if (winners.length > 1) {
    // Gérer égalité jackpot
    alert("Égalité jackpot! Mini-tournoi nécessaire");
  } else {
    // Distribuer 80%
    const jackpotAmount = Math.floor(data.totalDeposited * 0.8);
    const commission = data.totalDeposited - jackpotAmount;

    await distributeReward(winners[0].uid, jackpotAmount, 'jackpot', today);
    
    // Commission au owner
    if (OWNER_UID !== 'VOTRE_UID_ICI') {
      await distributeReward(OWNER_UID, commission, 'jackpot-commission', today);
    }

    // Marquer terminé
    await jackpotRef.update({ status: 'completed', winnerId: winners[0].uid });
  }
}

// ===== HISTORIQUE =====
async function openHistory() {
  if (!currentUser) return;

  const ongoingSnap = await db.collection('users').doc(currentUser.uid)
    .collection('tournaments').where('status', '==', 'ongoing').get();
  
  const completedSnap = await db.collection('users').doc(currentUser.uid)
    .collection('tournaments').where('status', '==', 'completed').get();

  document.getElementById('ongoingCount').textContent = ongoingSnap.size;
  document.getElementById('completedCount').textContent = completedSnap.size;

  renderHistoryList('historyOngoing', ongoingSnap.docs, 'ongoing');
  renderHistoryList('historyCompleted', completedSnap.docs, 'completed');

  document.getElementById('historyModal').classList.add('active');
}

function renderHistoryList(elementId, docs, type) {
  const container = document.getElementById(elementId);
  container.innerHTML = '';

  if (docs.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:#64748b;padding:40px;">Okenn tounwa</div>';
    return;
  }

  docs.forEach(doc => {
    const data = doc.data();
    const item = document.createElement('div');
    item.className = 'history-item';
    if (data.won) item.classList.add('won');
    else if (type === 'completed') item.classList.add('lost');

    item.innerHTML = `
      <div class="history-header">
        <div class="history-title">${data.category} - ${data.maxPlayers} joueurs</div>
        <div class="history-result" style="color:${data.won ? '#16a34a' : '#dc2626'}">
          ${data.won ? '✅ GAGNÉ' : type === 'ongoing' ? '⏳ En cours' : '❌ PERDU'}
        </div>
      </div>
      <div class="history-details">
        Frais: ${data.entryFee} GDS | Récompense: ${data.reward} GDS
        ${data.score !== undefined ? ` | Score: ${data.score} pts` : ''}
        ${data.finalPosition ? ` | Position: #${data.finalPosition}` : ''}
      </div>
    `;

    container.appendChild(item);
  });
}

function switchHistoryTab(tab) {
  currentHistoryTab = tab;
  
  document.querySelectorAll('.history-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');

  document.getElementById('historyOngoing').style.display = tab === 'ongoing' ? 'block' : 'none';
  document.getElementById('historyCompleted').style.display = tab === 'completed' ? 'block' : 'none';
}

// ===== UTILITAIRES =====
function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
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

// Export des fonctions
window.tournamentSystem = {
  joinTournament,
  submitScore,
  joinJackpot,
  showJackpotLeaderboard,
  openHistory,
  closeModal,
  switchHistoryTab
};