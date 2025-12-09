// À la TOP du fichier

const GAME_ID = 'dino';  // ← Change pour chaque jeu
const GAME_NAME = 'dino'; 

// ===== SYSTÈME DE TOURNOIS CONNECTÉ À ADMIN =====

let currentUser = null;
let currentHistoryTab = 'ongoing';

// ===== INITIALISATION =====
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    await displayUserInfo(user.uid);
    await loadJackpots();
  } else {
    alert("Ou dwe konekte!");
    window.location.href = 'login.html';
  }
});

// ===== AFFICHER INFO USER =====
async function displayUserInfo(userId) {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      document.getElementById('userName').textContent = userData.username || 'Jwè';
      document.getElementById('userBalance').textContent = (userData.balance || 0).toLocaleString();
    }
  } catch (error) {
    console.error("Erreur affichage user:", error);
  }
}

// ===== CHARGER JACKPOTS =====
async function loadJackpots() {
  try {
    // Charger Jackpot Quotidien
    const dailySnap = await db.collection('tournaments')
      .where('type', '==', 'daily')
      .where('status', '==', 'active')
        .where('game', '==', GAME_ID)  // ✅ AJOUTE CETTE LIGNE
      .orderBy('startTime', 'desc')
      .limit(1)
      .get();
    
    if (dailySnap.empty) {
      document.getElementById('dailyJackpotContent').innerHTML = `
        <div class="no-jackpot">
          <h3>⏳ Okenn jackpot jounalyè disponib</h3>
          <p>Admin ap prepare pwochen jackpot la</p>
        </div>
      `;
    } else {
      displayJackpot(dailySnap.docs[0], 'daily');
    }
    
    // Charger Jackpots Horaires
    const hourlySnap = await db.collection('tournaments')
      .where('type', '==', 'hourly')
      .where('status', '==', 'active')
        .where('game', '==', GAME_ID)  // ✅ AJOUTE CETTE LIGNE
      .orderBy('startTime', 'asc')
      .limit(1)
      .get();
    
    if (hourlySnap.empty) {
      document.getElementById('hourlyJackpotContent').innerHTML = `
        <div class="no-jackpot">
          <h3>⏳ Okenn tounwa orè disponib</h3>
          <p>Admin ap prepare pwochen tounwa a</p>
        </div>
      `;
    } else {
      displayJackpot(hourlySnap.docs[0], 'hourly');
    }
    
  } catch (error) {
    console.error("Erreur chargement jackpots:", error);
  }
}

// ===== AFFICHER JACKPOT =====
function displayJackpot(doc, type) {
  const tournament = doc.data();
  const tournamentId = doc.id;
  const prize = Math.floor(tournament.totalPot * 0.8);
  const containerId = type === 'daily' ? 'dailyJackpotContent' : 'hourlyJackpotContent';
  
  const html = `
    <div class="jackpot-info">
      <div class="jackpot-stat">
        <div class="jackpot-stat-label">💰 Cagnotte </div>
        <div class="jackpot-stat-value"><span id="${type}Prize">${formatGDS(prize)}</span></div>
      </div>
      <div class="jackpot-stat">
        <div class="jackpot-stat-label">👥 Participations</div>
        <div class="jackpot-stat-value"><span id="${type}Players">${tournament.participantCount || 0}</span></div>
      </div>
      <div class="jackpot-stat">
        <div class="jackpot-stat-label">⏰ Fin dans</div>
        <div class="jackpot-stat-value" id="${type}Timer">--:--:--</div>
      </div>
    </div>
    <div class="jackpot-actions">
      <button class="jackpot-btn" onclick="joinJackpot('${tournamentId}', ${tournament.entryFee})">
        Rejoindre - ${tournament.entryFee} GDS
      </button>
      <button class="jackpot-btn secondary" onclick="showLeaderboard('${tournamentId}', '${tournament.name}')">
        📊 Classement
      </button>
    </div>
  `;
  
  document.getElementById(containerId).innerHTML = html;
  
  // Démarrer timer
const endTimeMs = tournament.endTime.seconds * 1000;
startTimer(tournamentId, endTimeMs, type + 'Timer');

  
  // Écouter mises à jour
  listenTournamentUpdates(tournamentId, type);
}

// ===== TIMER =====
function startTimer(tournamentId, endTimeMs, elementId) {
  const updateTimer = () => {
    const diff = endTimeMs - Date.now();
    const timerEl = document.getElementById(elementId);
    if (!timerEl) return;
    
    if (diff <= 0) {
      timerEl.textContent = 'FINI';
      timerEl.style.color = '#dc2626';
      return;
    }
    
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    timerEl.textContent = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  };
  
  updateTimer();
  setInterval(updateTimer, 1000);
}

// ===== ÉCOUTER MISES À JOUR =====
function listenTournamentUpdates(tournamentId, type) {
  db.collection('tournaments').doc(tournamentId).onSnapshot(doc => {
    if (!doc.exists) {
      // Tournoi supprimé
      loadJackpots();
      return;
    }
    
    const tournament = doc.data();
    
    // Si tournoi fermé, recharger la page
    if (tournament.status !== 'active' || tournament.closedAt) {
      loadJackpots();
      return;
    }
    
    const prize = Math.floor(tournament.totalPot * 0.8);
    
    const prizeEl = document.getElementById(type + 'Prize');
    const playersEl = document.getElementById(type + 'Players');
    
    if (prizeEl) prizeEl.textContent = formatGDS(prize);
    if (playersEl) playersEl.textContent = tournament.participantCount || 0;
  });
}

// ===== REJOINDRE JACKPOT =====
async function joinJackpot(tournamentId, entryFee) {
  if (!currentUser) {
    alert("Ou dwe konekte!");
    return;
  }
  
  try {
    // Vérifier abonnement/parties gratuites
    const userDoc = await db.collection('users').doc(auth.currentUser.uid).get();
    const userData = userDoc.data();
    
    // Vérifier reset mensuel des essais gratuits
    const now = new Date();
    const lastReset = userData.lastFreeTrialReset ? userData.lastFreeTrialReset.toDate() : null;
    let partiCount = userData.pati || 0;
    
    if (lastReset) {
      const daysSinceReset = Math.floor((now - lastReset) / (1000 * 60 * 60 * 24));
      if (daysSinceReset >= 30) {
        // Réinitialiser les essais
        await db.collection('users').doc(auth.currentUser.uid).update({
          pati: 0,
          lastFreeTrialReset: firebase.firestore.FieldValue.serverTimestamp()
        });
        partiCount = 0;
      }
    }
    
    // Si moins de 10 parties ce mois, c'est gratuit
    if (partiCount < 10) {
      console.log(`Essai gratuit ${partiCount + 1}/10 ce mois`);
    } else {
      // Vérifier l'abonnement
      const subscription = userData.subscription || {};
      
      if (!subscription.isActive) {
        alert("Ou te itilize 10 esè gratis ou pou mwa sa!\n\nAchte yon abonman 125 goud pou kontinye jwe.\n\nAle nan pwofil ou.");
        return;
      }
      
      // Vérifier si pas expiré
      if (subscription.expiresAt) {
        const expiryDate = subscription.expiresAt.toDate();
        if (new Date() > expiryDate) {
          alert("Abonman ou fini! Renouvle li nan pwofil ou pou 125 goud.");
          return;
        }
      }
    }
    
    
    // Vérifier si tournoi toujours actif
    const tournamentDoc = await db.collection('tournaments').doc(tournamentId).get();
    if (!tournamentDoc.exists || tournamentDoc.data().status !== 'active') {
      alert("❌ Tounwa sa pa disponib ankò!");
      await loadJackpots();
      return;
    }
    
    const tournament = tournamentDoc.data();
    
    // NOUVEAU: Vérifier si pas fermé manuellement
    if (tournament.status !== 'active') {
      alert("❌ Tounwa sa fèmen deja!");
      await loadJackpots();
      return;
    }
    
    // NOUVEAU: Vérifier si pas fermé par l'admin
    if (tournament.closedAt) {
      alert("❌ Tounwa sa te fèmen pa Admin!");
      await loadJackpots();
      return;
    }
    
    
    // Vérifier si pas expiré
    const endTimeMs = tournament.endTime.seconds * 1000;
    if (endTimeMs < Date.now()) {
      alert("❌ Tounwa sa fini deja!");
      await loadJackpots();
      return;
    }

    // Vérifier solde
    const balance = userDoc.data().balance || 0;
    
    if (balance < entryFee) {
      alert(`❌ Ou pa gen ase lajan! Ou gen ${balance} GDS, men ou bezwen ${entryFee} GDS.`);
      return;
    }
    
    // Débiter
    await db.collection('users').doc(currentUser.uid).update({
      balance: firebase.firestore.FieldValue.increment(-entryFee)
    });
    
    // Ajouter/update participant
    const participantRef = db.collection('tournaments')
      .doc(tournamentId)
      .collection('participants')
      .doc(currentUser.uid);
    
    const participantDoc = await participantRef.get();
    
    if (participantDoc.exists) {
      // Joueur rejoue
      await participantRef.update({
        totalPaid: firebase.firestore.FieldValue.increment(entryFee),
        lastPlayed: firebase.firestore.FieldValue.serverTimestamp()
      });
    } else {
      // Première fois
      await participantRef.set({
        bestScore: 0,
        bestGameDuration: null,
        totalGamesPlayed: 0,
        totalPaid: entryFee,
        joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastPlayed: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      // Incrémenter participantCount
      await db.collection('tournaments').doc(tournamentId).update({
        participantCount: firebase.firestore.FieldValue.increment(1)
      });
    }
    
    
    // Incrémenter totalPot
    await db.collection('tournaments').doc(tournamentId).update({
      totalPot: firebase.firestore.FieldValue.increment(entryFee)
    });
    
    // Transaction
    await db.collection('transactions').add({
      userId: currentUser.uid,
      type: 'tournament_entry',
      amount: -entryFee,
      tournamentId: tournamentId,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Rediriger vers le jeu
    localStorage.setItem('currentTournament', JSON.stringify({
      tournamentId: tournamentId,
      entryFee: entryFee,
      tournamentName: tournament.name
    }));
    
    window.location.href = 'dino-tournament.html';
    
  } catch (error) {
    console.error("Erreur rejoindre tournoi:", error);
    alert("Erè pandan w ap antre nan tounwa a!");
  }
}

// ===== VOIR CLASSEMENT =====
async function showLeaderboard(tournamentId, tournamentName) {
  try {
    const participantsSnap = await db.collection('tournaments')
      .doc(tournamentId)
      .collection('participants')
      .orderBy('bestScore', 'desc')
      .limit(10)
      .get();
    
    const modal = document.getElementById('leaderboardModal');
    const title = document.getElementById('leaderboardTitle');
    const list = document.getElementById('leaderboardList');
    
    title.textContent = '🏆 ' + tournamentName;
    list.innerHTML = '';
    
    if (participantsSnap.empty) {
      list.innerHTML = '<div style="text-align:center;padding:40px;color:#64748b;">Okenn skor ankò</div>';
    } else {
      const medals = ['🥇', '🥈', '🥉'];
      let rank = 0;
      
      // ✅ RÉCUPÉRER LES USERNAMES
      for (const doc of participantsSnap.docs) {
        const p = doc.data();
        const isMe = doc.id === currentUser.uid;
        
        // Récupérer le username depuis la collection users
        let displayName = 'Jwè ' + (rank + 1);
        try {
          const userDoc = await db.collection('users').doc(doc.id).get();
          if (userDoc.exists && userDoc.data().username) {
            displayName = userDoc.data().username;
          }
        } catch (err) {
          console.warn("Impossible de charger username pour:", doc.id);
        }
        
        const item = document.createElement('div');
        item.className = 'leaderboard-item' + (isMe ? ' me' : '') + (rank < 3 ? ' top3' : '');
        item.innerHTML = `
          <span class="rank">${rank < 3 ? medals[rank] : '#' + (rank + 1)}</span>
          <span class="player-name">${isMe ? '👤 ' + displayName + ' (TOI)' : displayName}</span>
          <span class="score">${p.bestScore} pts</span>
        `;
        list.appendChild(item);
        rank++;
      }
      
      // Afficher position du joueur si pas dans top 10
      const myDoc = await db.collection('tournaments')
        .doc(tournamentId)
        .collection('participants')
        .doc(currentUser.uid)
        .get();
      
      if (myDoc.exists) {
        const allParticipants = await db.collection('tournaments')
          .doc(tournamentId)
          .collection('participants')
          .orderBy('bestScore', 'desc')
          .get();
        
        let myPosition = -1;
        allParticipants.forEach((doc, idx) => {
          if (doc.id === currentUser.uid) {
            myPosition = idx + 1;
          }
        });
        
        if (myPosition > 10) {
          const divider = document.createElement('div');
          divider.style.cssText = 'border-top:2px dashed #cbd5e1;margin:15px 0;';
          list.appendChild(divider);
          
          // ✅ RÉCUPÉRER LE USERNAME DU JOUEUR
          let myDisplayName = 'Ou';
          try {
            const myUserDoc = await db.collection('users').doc(currentUser.uid).get();
            if (myUserDoc.exists && myUserDoc.data().username) {
              myDisplayName = myUserDoc.data().username;
            }
          } catch (err) {
            console.warn("Impossible de charger votre username");
          }
          
          const myItem = document.createElement('div');
          myItem.className = 'leaderboard-item me';
          myItem.innerHTML = `
            <span class="rank">#${myPosition}</span>
            <span class="player-name">👤 ${myDisplayName} (TOI)</span>
            <span class="score">${myDoc.data().bestScore} pts</span>
          `;
          list.appendChild(myItem);
        }
      }
    }
    
    modal.classList.add('active');
    
  } catch (error) {
    console.error("Erreur classement:", error);
    alert("Erè chajman klasman!");
  }
}

// ===== PARTAGER JACKPOT =====
function shareJackpot(type) {
  const text = type === 'daily' ? 'Jackpot Quotidien' : 'Jackpot Horaire';
  const shareUrl = `${window.location.origin}/tournaments-home-dino.html`;
  const shareText = `Antre nan ${text}! 🏆`;
  
  if (navigator.share) {
    navigator.share({
      title: text,
      text: shareText,
      url: shareUrl
    }).catch(err => console.log('Erreur:', err));
  } else {
    const input = document.createElement('input');
    input.value = shareUrl;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    alert('✅ Lyen kopye!');
  }
}

// ===== HISTORIQUE =====
async function openHistory() {
  if (!currentUser) return;
  
  try {
    const modal = document.getElementById('historyModal');
    
    // Charger tournois en cours
    const ongoingSnap = await db.collection('tournaments')
      .where('status', '==', 'active')
      .get();
    
    let ongoingTournaments = [];
    
    for (const tournamentDoc of ongoingSnap.docs) {
      const participantDoc = await db.collection('tournaments')
        .doc(tournamentDoc.id)
        .collection('participants')
        .doc(currentUser.uid)
        .get();
      
      if (participantDoc.exists) {
        // Charger tous les scores
        const scoresSnap = await db.collection('tournaments')
          .doc(tournamentDoc.id)
          .collection('scores')
          .where('userId', '==', currentUser.uid)
          .orderBy('timestamp', 'desc')
          .get();
        
        const scores = [];
        scoresSnap.forEach(scoreDoc => {
          scores.push(scoreDoc.data());
        });
        
        ongoingTournaments.push({
          id: tournamentDoc.id,
          tournament: tournamentDoc.data(),
          participant: participantDoc.data(),
          scores: scores
        });
      }
    }
    
    // Charger tournois terminés
    const completedSnap = await db.collection('tournaments')
      .where('status', '==', 'completed')
      .orderBy('completedAt', 'desc')
      .limit(20)
      .get();
    
    let completedTournaments = [];
    
    for (const tournamentDoc of completedSnap.docs) {
      const participantDoc = await db.collection('tournaments')
        .doc(tournamentDoc.id)
        .collection('participants')
        .doc(currentUser.uid)
        .get();
      
      if (participantDoc.exists) {
        // Charger tous les scores
        const scoresSnap = await db.collection('tournaments')
          .doc(tournamentDoc.id)
          .collection('scores')
          .where('userId', '==', currentUser.uid)
          .orderBy('timestamp', 'desc')
          .get();
        
        const scores = [];
        scoresSnap.forEach(scoreDoc => {
          scores.push(scoreDoc.data());
        });
        
        completedTournaments.push({
          id: tournamentDoc.id,
          tournament: tournamentDoc.data(),
          participant: participantDoc.data(),
          scores: scores,
          won: tournamentDoc.data().winnerId === currentUser.uid
        });
      }
    }
    
    document.getElementById('ongoingCount').textContent = ongoingTournaments.length;
    document.getElementById('completedCount').textContent = completedTournaments.length;
    
    renderHistoryList('historyOngoing', ongoingTournaments, 'ongoing');
    renderHistoryList('historyCompleted', completedTournaments, 'completed');
    
    modal.classList.add('active');
    
  } catch (error) {
    console.error("Erreur historique:", error);
    alert("Erè chajman istorik!");
  }
}

function renderHistoryList(containerId, tournaments, type) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  
  if (tournaments.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#64748b;">Okenn tounwa</div>';
    return;
  }
  
  tournaments.forEach(t => {
    const item = document.createElement('div');
    item.className = 'history-item';
    if (type === 'completed') {
      item.classList.add(t.won ? 'won' : 'lost');
    }
    
    let html = `
      <div class="history-header">
        <div class="history-title">${t.tournament.name}</div>
        <div class="history-result" style="color:${t.won ? '#16a34a' : type === 'ongoing' ? '#2563eb' : '#dc2626'}">
          ${t.won ? '✅ GAGNÉ' : type === 'ongoing' ? '⏳ En cours' : '❌ PERDU'}
        </div>
      </div>
      <div class="history-details">
        Frais: ${t.tournament.entryFee} GDS | Prize: ${Math.floor(t.tournament.totalPot * 0.8).toLocaleString()} GDS
        | Parties jouées: ${t.participant.totalGamesPlayed} | Meilleur: ${t.participant.bestScore} pts
      </div>
    `;
    
    // Afficher tous les scores
    if (t.scores && t.scores.length > 0) {
      html += `
        <div class="history-scores">
          <div class="history-scores-title">📊 Historique des scores:</div>
      `;
      
      t.scores.slice(0, 5).forEach((score, idx) => {
        const isBest = score.score === t.participant.bestScore;
        html += `
          <div class="score-entry ${isBest ? 'best' : ''}">
            <span>Partie #${idx + 1} ${isBest ? '🏆' : ''}</span>
            <span><strong>${score.score} pts</strong> - ${formatDuration(score.duration)}</span>
          </div>
        `;
      });
      
      if (t.scores.length > 5) {
        html += `<div style="text-align:center;color:#64748b;font-size:0.85rem;margin-top:5px;">+ ${t.scores.length - 5} autres parties</div>`;
      }
      
      html += '</div>';
    }
    
    item.innerHTML = html;
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

// ===== FERMER MODAL =====
function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

// ===== UTILITAIRES =====
function formatGDS(amount) {
  return amount.toLocaleString() + ' GDS';
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Export global
window.tournamentSystem = {
  joinJackpot,
  showLeaderboard,
  shareJackpot,
  openHistory,
  closeModal,
  switchHistoryTab
};