
    let hasAccount = false;
    let playerName = "Jwè San Kont";
    let isLoggedIn = false;
    let currentPage = 'home';
    
    // NOUVELLES VARIABLES POUR DONNÉES RÉELLES
let userRealData = {
  pseudo: "Jwè San Kont",
  elo: 0,
  solde: 0,
  pati: 0,
  viktwa: 0,
  defet: 0
};

    // Solo Training Game Variables
    let soloCurrentPlayer = "O";
    let soloGameOver = false;
    let soloGrid;
    const soloSize = 15;
  


    function showLoginModal() {
      document.getElementById('loginModal').style.display = 'flex';
    }

    function hideLoginModal() {
      document.getElementById('loginModal').style.display = 'none';
    }

    function showRegisterModal() {
      document.getElementById('registerModal').style.display = 'flex';
    }

    function hideRegisterModal() {
      document.getElementById('registerModal').style.display = 'none';
    }

    function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  auth.signInWithEmailAndPassword(email, password)
    .then((userCredential) => {
      alert("Koneksyon reyisi!");
      hasAccount = true;
      isLoggedIn = true;
      hideLoginModal();
      showPage('page3');
    })
    .catch((error) => {
      alert("Erè koneksyon: " + error.message);
    });
}

function handleRegister(event) {
  event.preventDefault();
  const name = document.getElementById('registerName').value;
  const email = document.getElementById('registerEmail').value;
  const password = document.getElementById('registerPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  if (password !== confirmPassword) {
    alert('Modpas yo pa menm!');
    return;
  }

auth.createUserWithEmailAndPassword(email, password)
    .then((userCredential) => {
      const user = userCredential.user;

      // CORRECTION: Tout dans collection "users" maintenant
      return db.collection("users").doc(user.uid).set({
        username: name,
        email: email,
        elo: 550,
        balance: 0,
        pati: 0,
        viktwa: 0,
        defet: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        // Pas d'abonnement au début
        subscription: {
          isActive: false,
          expiresAt: null,
          startedAt: null
        }
      });
    })
    .then(() => {
      alert("Kont kreye ak siksè!");
      hasAccount = true;
      isLoggedIn = true;
      hideRegisterModal();
      showPage('page3');
    })
    .catch((error) => {
      alert("Erè kreye kont: " + error.message);
    });
}

auth.onAuthStateChanged(async function(user) {
  if (user) {
    isLoggedIn = true;
    hasAccount = true;

    await loadUserData(user.uid);
  } else {
    isLoggedIn = false;
    hasAccount = false;
    playerName = "Jwè San Kont";
    userRealData = {
      pseudo: "Jwè San Kont",
      elo: 0,
      solde: 0,
      pati: 0,
      viktwa: 0,
      defet: 0
    };
    subscriptionStatus = {
      isActive: false,
      expiresAt: null,
      startedAt: null,
      daysLeft: 0
    };
  }
});



    function showTrainingPage() {
      document.getElementById('trainingPage').classList.remove('hidden');
    }

    function hideTrainingPage() {
      document.getElementById('trainingPage').classList.add('hidden');
    }

    function showLearnPage() {
      document.getElementById('learnPage').classList.remove('hidden');
    }

    function hideLearnPage() {
      document.getElementById('learnPage').classList.add('hidden');
    }

    function showAboutPage() {
      document.getElementById('aboutPage').classList.remove('hidden');
    }

    function hideAboutPage() {
      document.getElementById('aboutPage').classList.add('hidden');
    }

    function startSoloTraining() {
      // Cacher complètement toutes les autres pages
      document.getElementById('page3').style.display = 'none';
      document.getElementById('trainingPage').classList.add('hidden');
      document.getElementById('soloGamePage').classList.remove('hidden');
      document.getElementById('soloGamePage').style.display = 'flex';
      initSoloGame();
    }

    function hideSoloGame() {
      document.getElementById('soloGamePage').classList.add('hidden');
      document.getElementById('soloGamePage').style.display = 'none';
      document.getElementById('page3').style.display = 'flex';
      document.getElementById('trainingPage').classList.remove('hidden');
    }

    function showTrainingPage() {
      document.getElementById('trainingPage').classList.remove('hidden');
    }

    function hideTrainingPage() {
      document.getElementById('trainingPage').classList.add('hidden');
    }

    // Solo Training Game Functions
    function initSoloGrid() {
      soloGrid = Array(soloSize).fill().map(() => Array(soloSize).fill(""));
    }

    function createSoloBoard() {
      const board = document.getElementById("soloBoard");
      board.innerHTML = "";
      for (let i = 0; i < soloSize; i++) {
        for (let j = 0; j < soloSize; j++) {
          const cell = document.createElement("div");
          cell.className = "game-cell";
          cell.dataset.x = i;
          cell.dataset.y = j;
          cell.addEventListener("click", makeSoloMove);
          board.appendChild(cell);
        }
      }
    }

    function checkSoloWin(x, y) {
      const dirs = [
        [[0, 1], [0, -1]], // horizontal
        [[1, 0], [-1, 0]], // vertical  
        [[1, 1], [-1, -1]], // diagonal
        [[1, -1], [-1, 1]]  // anti-diagonal
      ];
      
      for (const dir of dirs) {
        let count = 1;
        let line = [[x, y]];
        
        for (const [dx, dy] of dir) {
          let nx = x + dx, ny = y + dy;
          while (nx >= 0 && nx < soloSize && ny >= 0 && ny < soloSize && soloGrid[nx][ny] === soloCurrentPlayer) {
            count++;
            line.push([nx, ny]);
            nx += dx; 
            ny += dy;
          }
        }
        
        if (count >= 5) {
          const sorted = line.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
          return sorted.length ? [sorted[0], sorted[sorted.length - 1]] : null;
        }
      }
      return null;
    }

    function drawSoloStrikeLine(x1, y1, x2, y2) {
      const board = document.getElementById("soloBoard");
      const cell1 = document.querySelector(`#soloBoard [data-x='${x1}'][data-y='${y1}']`).getBoundingClientRect();
      const cell2 = document.querySelector(`#soloBoard [data-x='${x2}'][data-y='${y2}']`).getBoundingClientRect();
      const boardRect = board.getBoundingClientRect();

      const xStart = cell1.left + cell1.width / 2 - boardRect.left;
      const yStart = cell1.top + cell1.height / 2 - boardRect.top;
      const xEnd = cell2.left + cell2.width / 2 - boardRect.left;
      const yEnd = cell2.top + cell2.height / 2 - boardRect.top;

      const length = Math.hypot(xEnd - xStart, yEnd - yStart);
      const angle = Math.atan2(yEnd - yStart, xEnd - xStart) * 180 / Math.PI;

      const line = document.createElement("div");
      line.className = "game-strike-line";
      line.style.width = `${length}px`;
      line.style.left = `${xStart}px`;
      line.style.top = `${yStart}px`;
      line.style.transform = `rotate(${angle}deg)`;

      board.appendChild(line);
    }

    function showSoloWinner(winner, line = null) {
      soloGameOver = true;
      if (line) drawSoloStrikeLine(...line[0], ...line[1]);
      
      document.getElementById("soloWinnerText").textContent = `${winner} genyen!`;
      document.getElementById("soloEndModal").style.display = "flex";
    }

    function makeSoloMove(e) {
      if (soloGameOver) return;
      const cell = e.target;
      const x = +cell.dataset.x;
      const y = +cell.dataset.y;
      if (soloGrid[x][y]) return;
      
      soloGrid[x][y] = soloCurrentPlayer;
      cell.textContent = soloCurrentPlayer;
      cell.style.color = soloCurrentPlayer === "O" ? "red" : "blue";
      
      const line = checkSoloWin(x, y);
      if (line) {
        showSoloWinner(soloCurrentPlayer === "O" ? "Jwè 1" : "Jwè 2", line);
        return;
      }
      
      soloCurrentPlayer = soloCurrentPlayer === "O" ? "X" : "O";
    }

    function initSoloGame() {
      soloGameOver = false;
      soloCurrentPlayer = "O";
      initSoloGrid();
      createSoloBoard();
      
      // S'assurer que les modales sont fermées
      document.getElementById("soloMenuModal").style.display = "none";
      document.getElementById("soloEndModal").style.display = "none";
      
      // Configurer le bouton menu
      const menuBtn = document.getElementById("soloMenuButton");
      if (menuBtn) {
        menuBtn.onclick = () => document.getElementById("soloMenuModal").style.display = "flex";
      }
    }

    function restartSoloGame() {
      document.querySelectorAll("#soloBoard .game-strike-line").forEach(e => e.remove());
      document.getElementById("soloEndModal").style.display = "none";
      document.getElementById("soloMenuModal").style.display = "none";
      initSoloGame();
    }

    function hideProfile() {
      document.getElementById('profilePage').classList.add('hidden');
    }

    function switchTab(tabName) {
      // Remove active class from all tabs
      document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
      });
      
      // Add active class to clicked tab
      event.target.classList.add('active');
      
      // Hide all tab contents
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
      });
      
      // Show selected tab content
      document.getElementById(tabName + 'Content').classList.remove('hidden');
    }

    function showDepositWithdraw() {
      alert('Page depo ak retire ap vini byento!');
    }

    function toggleMenu(show) {
      document.getElementById("menuModal").style.display = show ? "flex" : "none";
    }

    function toggleAlert(show) {
      document.getElementById("alertModal").style.display = show ? "flex" : "none";
    }

function handlePlayClick() {
  if (!hasAccount) {
    toggleAlert(true);
  } else {
    // Vérifier si l'utilisateur est authentifié avec Firebase
    const user = firebase.auth().currentUser;
    
    if (user) {
      // Utilisateur connecté, lancer le jeu
      window.location.href = 'anons.html';
    } else {
      // Utilisateur a un compte mais pas connecté à Firebase
      alert("Pwoblèm koneksyon. Tanpri konekte w ankò.");
    }
  }
}
    
  function enregistrerJwè(uid, pseudo) {
    db.collection("users").doc(uid).set({
      pseudo: username,
      elo: 550,
      solde: 0,
      pati: 0,
      viktwa: 0,
      defet: 0
    })
    .then(() => {
      console.log("Jwè anrejistre avèk siksè !");
    })
    .catch((error) => {
      console.error("Erè pandan anrejistreman :", error);
    });
  }
  
  function kreyeKont(email, password, pseudo) {
    auth.createUserWithEmailAndPassword(email, password)
      .then((userCredential) => {
        const user = userCredential.user;

        // Ajouter les infos dans Firestore
        db.collection("users").doc(user.uid).set({
          pseudo: username,
          elo: 550,
          solde: 0,
          pati: 0,
          viktwa: 0,
          defet: 0
        })
        .then(() => {
          alert("Kont kreye avèk siksè !");
        })
        .catch((error) => {
          alert("Erè Firestore: " + error.message);
        });

      })
      .catch((error) => {
        alert("Erè kreasyon kont: " + error.message);
      });
  }
  

  function testeFirestore() {
    db.collection("test").add({
      message: "Firestore mache!",
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(() => {
      alert("Dokiman an ajoute avèk siksè!");
    })
    .catch((error) => {
      alert("Erè pandan ekriti Firestore: " + error.message);
    });
  }
  
  function testFirestoreConnection() {
  const db = firebase.firestore();
  const docRef = db.collection("testFirestore").doc("doc1");

  // Créer un document
  docRef.set({
    test: "Firestore fonctionne",
    timestamp: new Date().toISOString()
  })
  .then(() => {
    console.log("✅ Document ajouté avec succès !");
    
    // Lire ce document
    return docRef.get();
  })
  .then((doc) => {
    if (doc.exists) {
      console.log("📄 Données lues :", doc.data());
    } else {
      console.warn("❌ Aucun document trouvé !");
    }
  })
  .catch((error) => {
    console.error("❌ Erreur Firestore :", error);
  });
}

// Appeler la fonction au chargement de la page
window.addEventListener('load', testFirestoreConnection);

function startGame() {
  // Vérifier si l'utilisateur est connecté
  const user = firebase.auth().currentUser;
  
  if (user) {
    // Utilisateur connecté, rediriger vers le jeu
    window.location.href = 'anons.html';
  } else {
    // Utilisateur non connecté, afficher message
    alert('Ou dwe konekte w pou ka jwe');
    // Ou rediriger vers la page de connexion
  }
}

// ==================== SYSTÈME D'ABONNEMENT ====================

// Variables globales pour l'abonnement
let subscriptionStatus = {
  isActive: false,
  expiresAt: null,
  startedAt: null,
  daysLeft: 0
};

// FONCTION 1: Vérifier le statut d'abonnement
async function checkSubscriptionStatus(userId) {
  try {
    const userDoc = await db.collection("users").doc(userId).get();
    
    if (userDoc.exists) {
      const userData = userDoc.data();
      const subscription = userData.subscription || {};
      
      if (subscription.isActive && subscription.expiresAt) {
        const now = new Date();
        const expiryDate = subscription.expiresAt.toDate();
        
        if (now < expiryDate) {
          // Abonnement actif
          const timeDiff = expiryDate - now;
          const daysLeft = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
          
          subscriptionStatus = {
            isActive: true,
            expiresAt: expiryDate,
            startedAt: subscription.startedAt?.toDate() || null,
            daysLeft: daysLeft
          };
          
          return true;
        } else {
          // Abonnement expiré
          await db.collection("users").doc(userId).update({
            'subscription.isActive': false
          });
        }
      }
    }
    
    // Pas d'abonnement ou expiré
    subscriptionStatus = {
      isActive: false,
      expiresAt: null,
      startedAt: null,
      daysLeft: 0
    };
    
    return false;
    
  } catch (error) {
    console.error("Erreur vérification abonnement:", error);
    return false;
  }
}

// FONCTION 2: Créer/Renouveler abonnement
async function updateSubscription(userId) {
  try {
    const now = new Date();
    const expiryDate = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000)); // 30 jours
    
    const subscriptionData = {
      isActive: true,
      startedAt: firebase.firestore.FieldValue.serverTimestamp(),
      expiresAt: firebase.firestore.Timestamp.fromDate(expiryDate)
    };
    
    // Créer ou mettre à jour l'utilisateur avec l'abonnement
    await db.collection("users").doc(userId).set({
      subscription: subscriptionData,
      email: firebase.auth().currentUser.email,
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    // Mettre à jour le statut local
    subscriptionStatus = {
      isActive: true,
      expiresAt: expiryDate,
      startedAt: now,
      daysLeft: 30
    };
    
    console.log("Abonnement mis à jour avec succès");
    return true;
    
  } catch (error) {
    console.error("Erreur mise à jour abonnement:", error);
    return false;
  }
}

// FONCTION 3: Gérer les modals d'abonnement
function showSubscriptionModal() {
  document.getElementById('subscriptionModal').style.display = 'flex';
}

function hideSubscriptionModal() {
  document.getElementById('subscriptionModal').style.display = 'none';
}

// FONCTION 4: Traitement du paiement (simulation)
async function processSubscriptionPayment() {
  const user = firebase.auth().currentUser;
  
  if (!user) {
    alert("Erè: Ou pa konekte!");
    return;
  }
  
  // Simulation du paiement
  const confirmPayment = confirm("Konfime peman 500 Gdes pou 30 jou abonman?");
  
  if (confirmPayment) {
    const success = await updateSubscription(user.uid);
    
    if (success) {
      alert("Abonman ou aktive! Ou gen 30 jou pou jwe.");
      hideSubscriptionModal();
      
      // Rafraîchir l'affichage du profil si ouvert
      if (!document.getElementById('profilePage').classList.contains('hidden')) {
        showProfile();
      }
    } else {
      alert("Erè pandan peman. Tanpri eseye ankò.");
    }
  }
}

// FONCTION 5: MODIFIER handlePlayClick() EXISTANTE
// REMPLACE ta fonction handlePlayClick() par celle-ci :
async function handlePlayClick() {
  if (!hasAccount) {
    toggleAlert(true);
    return;
  }
  
  const user = firebase.auth().currentUser;
  
  if (!user) {
    alert("Pwoblèm koneksyon. Tanpri konekte w ankò.");
    return;
  }
  
  // Charger les données utilisateur d'abord
  await loadUserData(user.uid);
  
  // Vérifier si le joueur a encore des parties gratuites
  if (userRealData.pati < 5) {
    // 5 premières parties gratuites
    console.log(`Partie gratuite ${userRealData.pati + 1}/5`);
    window.location.href = 'anons.html';
    return;
  }
  
  // Vérifier l'abonnement
  const hasActiveSubscription = await checkSubscriptionStatus(user.uid);
  
  if (!hasActiveSubscription) {
    // Pas d'abonnement actif, montrer la modal
    showSubscriptionModal();
    return;
  }
  
  // Abonnement actif, lancer le jeu
  window.location.href = 'j.html';
}

// FONCTION 6: MODIFIER showProfile() EXISTANTE
// REMPLACE ta fonction showProfile() par celle-ci :
async function showProfile() {
  const profilePage = document.getElementById('profilePage');
  
  if (!hasAccount) {
    // Mode sans compte (garde ton code existant)
    profilePage.innerHTML = `
      <header>
        <div></div>
        <div class="logo">CHANPYON</div>
        <button class="nav-button" onclick="hideProfile()">Fèmen</button>
      </header>
      <main>
        <div class="simple-profile">
          <h3>Konekte oswa kreye yon kont pou aksè pwofil ou</h3>
          <button class="button" onclick="showLoginModal(); hideProfile()">Konekte</button>
          <button class="button" onclick="showRegisterModal(); hideProfile()">Kreye kont</button>
        </div>
      </main>
      <footer>
        <p>&copy; 2025 Mòpyon. Tout dwa rezève.</p>
      </footer>
    `;
  } else {
    // Mode avec compte - vérifier l'abonnement
    const user = firebase.auth().currentUser;
    let transactionHTML = '<h3>Istwa Transaksyon</h3><p>Poko gen transaksyon</p>'; // ← AJOUTER CETTE LIGNE
  
    if (user) {
      await loadUserData(user.uid);
      await checkSubscriptionStatus(user.uid);
      const transactionHTML = await loadUserTransactions(user.uid);
    }
    
    
    // Générer l'affichage du statut d'abonnement
let subscriptionHTML = '';
if (subscriptionStatus.isActive) {
  subscriptionHTML = `
    <div class="subscription-status subscription-active">
      <h3>🎮 Abonman Aktif</h3>
      <div class="countdown-display">
        <span class="days-left">${subscriptionStatus.daysLeft}</span> jou ki rete
      </div>
      <p>Abonman ou ap fini nan: ${subscriptionStatus.expiresAt?.toLocaleDateString('fr-HT')}</p>
    </div>
  `;
} else {
  // Vérifier si le joueur a encore des parties gratuites
  if (userRealData.pati < 5) {
    const partiesRestantes = 5 - userRealData.pati;
    subscriptionHTML = `
      <div class="subscription-status" style="background: linear-gradient(45deg, #22c55e, #16a34a); color: white;">
        <h3>🎁 Pèyod Esè Gratis</h3>
        <div class="countdown-display">
          <span class="days-left">${partiesRestantes}</span> pati gratis, san abònman ki rete pou w jwe epi fè lajan.
        </div>
        <p>Aprè ${partiesRestantes} pati, w ap gen bezwen yon abonman pou sèlman 125 goud</p>
      </div>
    `;
  } else {
    subscriptionHTML = `
      <div class="subscription-status subscription-expired">
        <h3>⚠️ Pèyod Esè Fini</h3>
        <p>Ou dwe achte yon abonman pou kontinye jwe</p>
        <button class="renew-button" onclick="showSubscriptionModal(); hideProfile()">Achte Abonman</button>
      </div>
    `;
  }
}

    // Affichage complet du profil avec abonnement
    profilePage.innerHTML = `
      <header>
        <div></div>
        <div class="logo">CHANPYON</div>
        <button class="nav-button" onclick="hideProfile()">Fèmen</button>
      </header>

      <main>
        ${subscriptionHTML}
        
        <div class="money-container">
          <div>
            <div>Lajan ou:</div>
            <div class="money-amount">$${userRealData.solde.toFixed(2)}</div>
          </div>
          <button class="add-money-btn" onclick="showDepositWithdraw()">+</button>
        </div>

        <div class="player-info">
          <div class="player-name">${playerName}</div>
          <div class="player-elo">Elo: ${userRealData.elo}</div>
        </div>

        <div class="tabs-container">
          <div class="tabs">
            <button class="tab active" onclick="switchTab('estatistik')">Estatistik</button>
            <button class="tab" onclick="switchTab('transaksyon')">Transaksyon</button>
          </div>

          <div id="estatistikContent" class="tab-content">
  <h3>Estatistik Jwè</h3>
  <p>Kantite Pati: ${userRealData.pati}</p>
  <p>Viktwa: ${userRealData.viktwa}</p>
  <p>Defèt: ${userRealData.defet}</p>
  <p>Pousantaj viktwa: ${userRealData.pati > 0 ? Math.round((userRealData.viktwa / userRealData.pati) * 100) : 0}%</p>
</div>

<div id="transaksyonContent" class="tab-content hidden">
  ${transactionHTML}
</div>
        </div>
      </main>

      <footer>
        <p>&copy; 2025 Chanpyon / WIN-EARN HAÏTI. Tout dwa rezève.</p>
      </footer>
    `;
  }
  
  profilePage.classList.remove('hidden');
}

// Créer/Renouveler abonnement dans Firestore
async function updateSubscription(userId) {
  try {
    const now = new Date();
    const expiryDate = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000)); // 30 jours
    
    const subscriptionData = {
      isActive: true,
      startedAt: firebase.firestore.FieldValue.serverTimestamp(),
      expiresAt: firebase.firestore.Timestamp.fromDate(expiryDate)
    };
    
    await db.collection("users").doc(userId).set({
      subscription: subscriptionData,
      email: firebase.auth().currentUser.email,
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    // Mettre à jour le statut local
    subscriptionStatus = {
      isActive: true,
      expiresAt: expiryDate,
      startedAt: now,
      daysLeft: 30
    };
    
    return true;
    
  } catch (error) {
    console.error("Erreur mise à jour abonnement:", error);
    return false;
  }
}

// FONCTION POUR CHARGER LES VRAIES TRANSACTIONS
async function loadUserTransactions(userId) {
  try {
    const transactionsQuery = await db.collection("transactions")
      .where("userId", "==", userId)
      .limit(10)
      .get();
    
    let transactionHTML = '<h3>Istwa Transaksyon</h3>';
    
    if (transactionsQuery.empty) {
      transactionHTML += '<p>Pa gen transaksyon ankò</p>';
    } else {
      transactionsQuery.forEach(doc => {
        const transaction = doc.data();
        const date = transaction.timestamp.toDate().toLocaleDateString('fr-HT');
        const amount = transaction.amount;
        const type = transaction.type;
        const sign = amount > 0 ? '+' : '';
        
        // Types de transactions en créole
        let typeText = '';
        switch(type) {
          case 'deposit': typeText = 'Depo'; break;
          case 'withdrawal': typeText = 'Retire'; break;
          case 'game_win': typeText = 'Jwèt genyen'; break;
          case 'game_loss': typeText = 'Jwèt pèdi'; break;
          case 'subscription': typeText = 'Abonman'; break;
          default: typeText = type;
        }
        
        transactionHTML += `<p>${date} - ${typeText}: ${sign}$${Math.abs(amount).toFixed(2)}</p>`;
      });
    }
    
    return transactionHTML;
  } catch (error) {
    console.error("Erreur chargement transactions:", error);
    return '<h3>Istwa Transaksyon</h3><p>Erè chajman transaksyon</p>';
  }
}

// FONCTION POUR AJOUTER UNE TRANSACTION
async function addTransaction(userId, type, amount, description = '') {
  try {
    await db.collection("transactions").add({
      userId: userId,
      type: type,
      amount: amount,
      description: description,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Mettre à jour le solde de l'utilisateur
    await db.collection("users").doc(userId).update({
      solde: firebase.firestore.FieldValue.increment(amount)
    });
    
    console.log("Transaction ajoutée avec succès");
    return true;
  } catch (error) {
    console.error("Erreur ajout transaction:", error);
    return false;
  }
}

// FONCTION QUI MANQUE
async function loadUserData(userId) {
  try {
    const userDoc = await db.collection("users").doc(userId).get();
    
    if (userDoc.exists) {
      const userData = userDoc.data();
      
      userRealData = {
        pseudo: userData.username || userData.email || "Jwè",
        elo: userData.elo || 550,
        solde: userData.balance || 0,
        pati: userData.pati || 0,
        viktwa: userData.viktwa || 0,
        defet: userData.defet || 0
      };
      
      playerName = userRealData.pseudo;
      
      // Charger aussi l'abonnement
      await checkSubscriptionStatus(userId);
    }
  } catch (error) {
    console.error("Erreur chargement données:", error);
  }
}
  