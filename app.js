
// ================= ÉTAT GLOBAL =================
let antiparyajMatches = [];
let userChoices = {};
let currentMatchId = null;
let selectedCountries = [];
let selectedLeagues = [];
let currentFicheFilter = 'pending';

// Variables utilisateur Firebase
let currentUser = null;
let userBalance = 0;
let userSubscription = null;
let userTransactions = [];
let userFiches = [];

// Attendre que Firebase soit chargé
document.addEventListener('DOMContentLoaded', () => {
    // Vérifier que Firebase est disponible
    if (window.firebaseApp) {
        console.log('✅ Firebase connecté à Anti-Paryaj');
        
        // Écouter les changements d'authentification
        window.firebaseApp.auth.onAuthStateChanged((user) => {
            currentUser = user;
            updateProfileUI();
            if (user) {
                loadUserData(user.uid);
            }
        });
    } else {
        console.error('❌ Firebase non trouvé');
    }
    
    // Initialiser l'app
    loadMatches();
    updateProgressBar();
    updateFilterBadge();
});

// ================= UTILS =================
const $ = (id) => document.getElementById(id);
const bindClick = (id, handler) => {
    const el = $(id);
    if (el) el.addEventListener('click', handler);
};

const getCountryFlag = (country) => {
    const flags = {
        'Espagne': '🇪🇸',
        'Angleterre': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
        'France': '🇫🇷',
        'Allemagne': '🇩🇪',
        'Italie': '🇮🇹',
        'Portugal': '🇵🇹',
        'Pays-Bas': '🇳🇱',
        'Belgique': '🇧🇪',
        'Turquie': '🇹🇷',
        'Brésil': '🇧🇷',
        'Europe': '🇪🇺'
    };
    return flags[country] || '🌍';
};

// ================= MODALS =================
function showModal(id) {
    const modal = $(id);
    if (modal) {
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
}

function hideModal(id) {
    const modal = $(id);
    if (modal) {
        modal.classList.remove('show');
        document.body.style.overflow = 'auto';
    }
}

// ================= MENU / PROFIL / MODALS =================
bindClick('menuBtn', () => showModal('menuModal'));
bindClick('closeMenu', () => hideModal('menuModal'));
bindClick('profileBtn', () => showModal('profileModal'));
bindClick('closeProfile', () => hideModal('profileModal'));
bindClick('gratisBtn', () => showModal('gratisModal'));
bindClick('closeGratis', () => hideModal('gratisModal'));
bindClick('closeMatch', () => hideModal('matchModal'));

bindClick('quizBtn', () => {
    window.location.href = 'scoreexact.html';
});


// ================= FIREBASE AUTH & PROFILE =================
function updateProfileUI() {
    const userInfo = $('profileUserInfo');
    const logoutBtn = $('btnLogout');
    
    if (!userInfo) return;
    
    if (currentUser) {
        const displayName = currentUser.displayName || currentUser.email.split('@')[0];
        userInfo.innerHTML = `
            <div class="profile-user-connected">
                <div class="profile-user-name">${displayName}</div>
                <div class="profile-user-balance">
                    <span>💰</span>
                    <span>${userBalance.toFixed(2)} Goud</span>
                </div>
            </div>
        `;
        if (logoutBtn) logoutBtn.style.display = 'block';
    } else {
        userInfo.innerHTML = `
            <div class="profile-auth-buttons">
                <button class="btn-login" onclick="showLoginForm()">Konekte</button>
                <button class="btn-register" onclick="showRegisterForm()">Enskri</button>
            </div>
        `;
        if (logoutBtn) logoutBtn.style.display = 'none';
    }
}

// ================= MODALS CONNEXION/INSCRIPTION =================
function showLoginForm() {
    hideModal('profileModal');
    
    // Créer le modal de connexion
    const loginModal = document.createElement('div');
    loginModal.className = 'modal-overlay show';
    loginModal.id = 'loginModalAP';
    loginModal.innerHTML = `
        <div class="auth-modal">
            <button class="close-modal" onclick="closeAuthModal('loginModalAP')">✕</button>
            <h2 class="auth-title">Koneksyon</h2>
            <form id="loginFormAP" class="auth-form">
                <div class="form-group">
                    <label>Email</label>
                    <input type="email" id="loginEmail" required placeholder="Antre email ou">
                </div>
                <div class="form-group">
                    <label>Modpas</label>
                    <input type="password" id="loginPassword" required placeholder="Antre modpas ou">
                </div>
                <button type="submit" class="btn-auth">Konekte</button>
                <p class="auth-switch">
                    Ou pa gen kont? <span onclick="switchToRegister()">Enskri</span>
                </p>
            </form>
        </div>
    `;
    document.body.appendChild(loginModal);
    
    // Gérer la soumission
    document.getElementById('loginFormAP').onsubmit = handleLogin;
}

function showRegisterForm() {
    hideModal('profileModal');
    
    const registerModal = document.createElement('div');
    registerModal.className = 'modal-overlay show';
    registerModal.id = 'registerModalAP';
    registerModal.innerHTML = `
        <div class="auth-modal">
            <button class="close-modal" onclick="closeAuthModal('registerModalAP')">✕</button>
            <h2 class="auth-title">Kreye Kont</h2>
            <form id="registerFormAP" class="auth-form">
                <div class="form-group">
                    <label>Non Itilizatè</label>
                    <input type="text" id="registerName" required placeholder="Chwazi yon non">
                </div>
                <div class="form-group">
                    <label>Email</label>
                    <input type="email" id="registerEmail" required placeholder="Antre email ou">
                </div>
                <div class="form-group">
                    <label>Modpas</label>
                    <input type="password" id="registerPassword" required minlength="6" placeholder="Minimòm 6 karaktè">
                </div>
                <div class="form-group">
                    <label>Konfime Modpas</label>
                    <input type="password" id="confirmPassword" required placeholder="Retape modpas la">
                </div>
                <button type="submit" class="btn-auth">Kreye Kont</button>
                <p class="auth-switch">
                    Ou gen kont deja? <span onclick="switchToLogin()">Konekte</span>
                </p>
            </form>
        </div>
    `;
    document.body.appendChild(registerModal);
    
    document.getElementById('registerFormAP').onsubmit = handleRegister;
}

function closeAuthModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.remove();
        document.body.style.overflow = 'auto';
    }
}

function switchToRegister() {
    closeAuthModal('loginModalAP');
    showRegisterForm();
}

function switchToLogin() {
    closeAuthModal('registerModalAP');
    showLoginForm();
}

// ================= GESTION CONNEXION =================
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    if (!window.firebaseApp || !window.firebaseApp.auth) {
        showToast('❌ Erè koneksyon Firebase');
        return;
    }
    
    try {
        await window.firebaseApp.auth.signInWithEmailAndPassword(email, password);
        showToast('✅ Koneksyon reyisi!');
        closeAuthModal('loginModalAP');
    } catch (error) {
        console.error('Erreur login:', error);
        let message = '❌ Erè koneksyon';
        
        if (error.code === 'auth/user-not-found') {
            message = '❌ Itilizatè pa egziste';
        } else if (error.code === 'auth/wrong-password') {
            message = '❌ Modpas enkòrèk';
        } else if (error.code === 'auth/invalid-email') {
            message = '❌ Email pa valid';
        }
        
        showToast(message);
    }
}

// ================= GESTION INSCRIPTION =================
async function handleRegister(e) {
    e.preventDefault();
    
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    if (password !== confirmPassword) {
        showToast('❌ Modpas yo pa menm!');
        return;
    }
    
    if (!window.firebaseApp || !window.firebaseApp.auth || !window.firebaseApp.db) {
        showToast('❌ Erè koneksyon Firebase');
        return;
    }
    
    try {
        const userCredential = await window.firebaseApp.auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Générer le code ambassadeur basé sur le nom d'utilisateur
        const ambassadorCode = name.toUpperCase().replace(/\s+/g, '');
        
        // Créer le document utilisateur
        await window.firebaseApp.db.collection('users').doc(user.uid).set({
            username: name,
            email: email,
            balance: 0,
            pati: 0,
            viktwa: 0,
            defet: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            subscription: {
                isActive: false,
                expiresAt: null,
                startedAt: null
            },
            ambassadorCode: ambassadorCode,
            referrals: 0
        });
        
        showToast('✅ Kont kreye avèk siksè!');
        closeAuthModal('registerModalAP');
        
    } catch (error) {
        console.error('Erreur register:', error);
        let message = '❌ Erè kreye kont';
        
        if (error.code === 'auth/email-already-in-use') {
            message = '❌ Email deja itilize';
        } else if (error.code === 'auth/invalid-email') {
            message = '❌ Email pa valid';
        } else if (error.code === 'auth/weak-password') {
            message = '❌ Modpas twò fèb';
        }
        
        showToast(message);
    }
}
    
async function loadUserData(userId) {
    if (!window.firebaseApp || !window.firebaseApp.db) return;
    
    try {
        const userDoc = await window.firebaseApp.db.collection('users').doc(userId).get();
        
        if (userDoc.exists) {
            const data = userDoc.data();
            userBalance = data.balance || 0;
            userSubscription = data.subscription || null;
        }
        
        const transactionsSnap = await window.firebaseApp.db.collection('transactions')
            .where('userId', '==', userId)
            .limit(50)
            .get();

        // Tri manuel côté JS
        userTransactions = transactionsSnap.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0));
        
        // === AJOUT OBLIGATOIRE : créer la collection si vide ===
        const testSnap = await window.firebaseApp.db
            .collection('fiches')
            .limit(1)
            .get();

        if (testSnap.empty) {
            await window.firebaseApp.db.collection('fiches').add({
                userId: userId,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        const fichesSnap = await window.firebaseApp.db.collection('fiches')
            .where('userId', '==', userId)
            .limit(50)
            .get();

        // Et trie manuellement :
        userFiches = fichesSnap.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0));
        
        updateProfileUI();
    } catch (error) {
        console.error('Erreur chargement données:', error);
        if (error.code === 'failed-precondition') {
            console.log('Collection fiches pas encore créée');
            userFiches = [];
        }
    }
}

// ================= DÉCONNEXION =================
bindClick('btnLogout', async () => {
    if (!window.firebaseApp || !window.firebaseApp.auth) return;
    
    try {
        await window.firebaseApp.auth.signOut();
        showToast('✅ Dekonekte avèk siksè');
        hideModal('profileModal');
        
        userBalance = 0;
        userSubscription = null;
        userTransactions = [];
        userFiches = [];
    } catch (error) {
        console.error('Erreur déconnexion:', error);
        showToast('❌ Erè pandan dekoneksyon');
    }
});

// ================= PANIER =================
bindClick('panierIcon', () => {
    const panier = $('panier');
    if (panier) panier.classList.add('show');
});

bindClick('closePanier', () => {
    const panier = $('panier');
    if (panier) panier.classList.remove('show');
});

// ================= FILTRE MODAL =================
bindClick('openFilterModal', () => {
    populateFilterModal();
    showModal('filterModal');
});

bindClick('closeFilter', () => hideModal('filterModal'));

bindClick('applyFilter', () => {
    displayMatches();
    updateFilterBadge();
    hideModal('filterModal');
});

bindClick('resetAllFilters', () => {
    selectedCountries = [];
    selectedLeagues = [];
    populateFilterModal();
    updateFilterBadge();
});

// ================= FILTRES =================
function populateFilterModal() {
    const container = $('countryLeagueList');
    if (!container) return;

    const dataByCountry = {};
    
    matches.forEach(m => {
        if (!isMatchAvailable(m.datetime)) return;
        
        if (!dataByCountry[m.country]) {
            dataByCountry[m.country] = {};
        }
        if (!dataByCountry[m.country][m.league]) {
            dataByCountry[m.country][m.league] = 0;
        }
        dataByCountry[m.country][m.league]++;
    });

    container.innerHTML = '';
    
    Object.keys(dataByCountry).sort().forEach(country => {
        const leagues = dataByCountry[country];
        const totalMatches = Object.values(leagues).reduce((a, b) => a + b, 0);
        const hasSelection = Object.keys(leagues).some(lg => selectedLeagues.includes(lg));
        
        const countryGroup = document.createElement('div');
        countryGroup.className = 'country-group';
        
        const countryHeader = document.createElement('div');
        countryHeader.className = 'country-header' + (hasSelection ? ' has-selection' : '');
        countryHeader.innerHTML = `
            <span class="country-flag">${getCountryFlag(country)}</span>
            <div class="country-info">
                <div class="country-name">${country}</div>
                <div class="country-match-count">${totalMatches} match${totalMatches > 1 ? 's' : ''}</div>
            </div>
            <span class="country-chevron">▼</span>
        `;
        
        const leaguesList = document.createElement('div');
        leaguesList.className = 'leagues-list';
        
        Object.keys(leagues).sort().forEach(league => {
            const leagueItem = document.createElement('div');
            leagueItem.className = 'league-item' + (selectedLeagues.includes(league) ? ' selected' : '');
            leagueItem.innerHTML = `
                <span class="league-icon">🏆</span>
                <span class="league-name">${league}</span>
                <span class="league-count">${leagues[league]}</span>
            `;
            
            leagueItem.onclick = (e) => {
                e.stopPropagation();
                toggleLeagueSelection(league, leagueItem);
            };
            
            leaguesList.appendChild(leagueItem);
        });
        
        countryHeader.onclick = () => {
            const isExpanded = countryHeader.classList.contains('expanded');
            
            document.querySelectorAll('.country-header').forEach(h => {
                h.classList.remove('expanded');
            });
            document.querySelectorAll('.leagues-list').forEach(l => {
                l.classList.remove('expanded');
            });
            
            if (!isExpanded) {
                countryHeader.classList.add('expanded');
                leaguesList.classList.add('expanded');
            }
        };
        
        countryGroup.appendChild(countryHeader);
        countryGroup.appendChild(leaguesList);
        container.appendChild(countryGroup);
    });
    
    updateActiveFiltersBar();
}

function toggleLeagueSelection(league, element) {
    element.classList.toggle('selected');
    
    const index = selectedLeagues.indexOf(league);
    if (index > -1) {
        selectedLeagues.splice(index, 1);
    } else {
        selectedLeagues.push(league);
    }
    
    updateActiveFiltersBar();
}

function updateActiveFiltersBar() {
    const bar = $('activeFiltersBar');
    if (!bar) return;
    
    if (selectedLeagues.length === 0) {
        bar.innerHTML = '<span style="color: var(--text-secondary); font-size: 13px;">Chwazi yon lig</span>';
        return;
    }
    
    bar.innerHTML = '';
    selectedLeagues.forEach(league => {
        const chip = document.createElement('div');
        chip.className = 'active-filter-chip';
        chip.innerHTML = `
            <span>${league}</span>
            <span class="remove-chip">✕</span>
        `;
        chip.querySelector('.remove-chip').onclick = () => removeFilterChip(league);
        bar.appendChild(chip);
    });
}

function removeFilterChip(league) {
    const index = selectedLeagues.indexOf(league);
    if (index > -1) {
        selectedLeagues.splice(index, 1);
    }
    populateFilterModal();
}

function updateFilterBadge() {
    const badge = $('filterBadge');
    const total = selectedLeagues.length;
    if (badge) badge.textContent = total ? `${total} lig${total > 1 ? 's' : ''}` : 'Tout';
}

// ================= MATCHS =================
async function loadMatches() {
    try {
        // Charger depuis votre GitHub
        const res = await fetch('https://raw.githubusercontent.com/mopyonht/Test-1/main/matches.json?t=' + Date.now());
        
        if (!res.ok) {
            throw new Error('Erreur HTTP: ' + res.status);
        }
        
        const data = await res.json();
        console.log('✅ Matchs chargés depuis GitHub:', data.matches?.length);
        
        matches = data.matches;
        displayMatches();
    } catch (error) {
        console.error('❌ Erreur chargement matches:', error);
    }
}

function isMatchAvailable(datetime) {
    return new Date(datetime) > new Date();
}

function displayMatches() {
    const container = $('matchesContainer');
    if (!container) return;

    container.innerHTML = '';
    
    const filtered = matches.filter(m => {
    if (!isMatchAvailable(m.datetime)) return false;
    if (selectedLeagues.length && !selectedLeagues.includes(m.league)) return false;
    return true;
}).sort((a, b) => new Date(a.datetime) - new Date(b.datetime)); // Tri par date croissante

    const matchCount = $('matchCount');
    if (matchCount) matchCount.textContent = filtered.length;

    if (!filtered.length) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">⚽</div>
                <div class="empty-state-text">Pa gen match ki disponib</div>
            </div>
        `;
        return;
    }

    filtered.forEach(match => {
        const card = document.createElement('div');
        card.className = 'match-card';
        card.onclick = () => openMatchModal(match.id);

        const matchDate = new Date(match.datetime);

        const today = new Date();
today.setHours(0, 0, 0, 0);
const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);
const matchDay = new Date(matchDate);
matchDay.setHours(0, 0, 0, 0);

let dateStr;
if (matchDay.getTime() === today.getTime()) {
    dateStr = "Jodi a";
} else if (matchDay.getTime() === tomorrow.getTime()) {
    dateStr = "Demen";
} else {
    dateStr = matchDate.toLocaleDateString('fr-FR', { 
        weekday: 'short', 
        day: 'numeric', 
        month: 'short' 
    });
}
        const timeStr = matchDate.toLocaleTimeString('fr-FR', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });

        const choice = userChoices[match.id];
        const selected1 = choice?.resultat === '1' ? 'selected' : '';
        const selectedX = choice?.resultat === 'X' ? 'selected' : '';
        const selected2 = choice?.resultat === '2' ? 'selected' : '';

        card.innerHTML = `
            <div class="match-header">
                <div>${match.country} - ${match.league}</div>
                <div class="match-time">${dateStr} - ${timeStr}</div>
            </div>
            <div class="match-content">
                <div class="team-name">${match.team1}</div>
                <div class="vs">VS</div>
                <div class="team-name">${match.team2}</div>
            </div>
            <div class="bet-options">
                <button class="bet-btn ${selected1}" onclick="event.stopPropagation(); quickChoice('${match.id}','1')">1</button>
                <button class="bet-btn ${selectedX}" onclick="event.stopPropagation(); quickChoice('${match.id}','X')">X</button>
                <button class="bet-btn ${selected2}" onclick="event.stopPropagation(); quickChoice('${match.id}','2')">2</button>
            </div>
        `;
        container.appendChild(card);
    });
}

function updateDoubleChanceUI() {
    const maxDC = 3;
    const usedDC = countDoubleChance();
    const maxTotal = 5;
    const usedTotal = countTotalGoals();

    // Double Chance
    document.querySelectorAll('.option-btn[data-type="doublechance"]').forEach(btn => {
        const matchId = currentMatchId;
        const matchHasDC = userChoices[matchId]?.doublechance;

        if (usedDC >= maxDC && !matchHasDC) {
            btn.classList.add('disabled');
            btn.disabled = true;
        } else {
            btn.classList.remove('disabled');
            btn.disabled = false;
        }
    });
    
    // Total Goals
    document.querySelectorAll('.option-btn[data-type="total"]').forEach(btn => {
        const matchId = currentMatchId;
        const matchHasTotal = userChoices[matchId]?.total;

        if (usedTotal >= maxTotal && !matchHasTotal) {
            btn.classList.add('disabled');
            btn.disabled = true;
        } else {
            btn.classList.remove('disabled');
            btn.disabled = false;
        }
    });
}

function countDoubleChance() {
    return Object.values(userChoices)
        .filter(choice => choice.doublechance)
        .length;
}

function countTotalGoals() {
    return Object.values(userChoices)
        .filter(choice => choice.total)
        .length;
}

// ================= MODAL MATCH =================
function openMatchModal(matchId) {
    currentMatchId = matchId;
    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    const matchTeams = $('matchTeams');
    const matchTime = $('matchTime');
    
    if (matchTeams) matchTeams.textContent = `${match.team1} vs ${match.team2}`;
    if (matchTime) {
        const date = new Date(match.datetime);
        matchTime.textContent = date.toLocaleString('fr-FR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    document.querySelectorAll('.match-modal .option-btn')
        .forEach(b => b.classList.remove('selected'));

    if (userChoices[matchId]) {
        Object.entries(userChoices[matchId]).forEach(([k, v]) => {
            if (k !== 'matchName') {
                const btn = document.querySelector(
                    `.match-modal .option-btn[data-type="${k}"][data-value="${v}"]`
                );
                if (btn) btn.classList.add('selected');
            }
        });
    }

    updateDoubleChanceUI();
    showModal('matchModal');
}

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('option-btn') && e.target.closest('.match-modal')) {
        const type = e.target.dataset.type;
        const value = e.target.dataset.value;
        
        if (!currentMatchId) return;
        
        // Vérifier la limite de double chance
        if (type === 'doublechance') {
            const currentCount = countDoubleChance();
            const currentMatchHasDC = userChoices[currentMatchId]?.doublechance;
            
            if (currentCount >= 3 && !currentMatchHasDC) {
                showToast('⚠️ Ou ka sèlman itilize 3 doub chans pa fich!');
                return;
            }
        }
        
        // Vérifier la limite de total goals
if (type === 'total') {
    const currentCount = countTotalGoals();
    const currentMatchHasTotal = userChoices[currentMatchId]?.total;
    
    if (currentCount >= 5 && !currentMatchHasTotal) {
        showToast('⚠️ Ou ka sèlman itilize 5 total gòl pa fich!');
        return;
    }
}
        
        if (!userChoices[currentMatchId]) {
            userChoices[currentMatchId] = {};
        }
        
        const match = matches.find(m => m.id === currentMatchId);
        if (match) {
            userChoices[currentMatchId].matchName = `${match.team1} vs ${match.team2}`;
        }
        
        if (e.target.classList.contains('selected')) {
            e.target.classList.remove('selected');
            delete userChoices[currentMatchId][type];
            
            const keys = Object.keys(userChoices[currentMatchId]);
            if (keys.length === 1 && keys[0] === 'matchName') {
                delete userChoices[currentMatchId];
            }
        } else {
            // Gestion spéciale : resultat et doublechance sont mutuellement exclusifs
            if (type === 'resultat') {
                document.querySelectorAll(`.match-modal .option-btn[data-type="doublechance"]`)
                    .forEach(btn => btn.classList.remove('selected'));
                delete userChoices[currentMatchId].doublechance;
            } else if (type === 'doublechance') {
                document.querySelectorAll(`.match-modal .option-btn[data-type="resultat"]`)
                    .forEach(btn => btn.classList.remove('selected'));
                delete userChoices[currentMatchId].resultat;
            }
            
            document.querySelectorAll(`.match-modal .option-btn[data-type="${type}"]`)
                .forEach(btn => btn.classList.remove('selected'));
            
            e.target.classList.add('selected');
            userChoices[currentMatchId][type] = value;
        }
        
        updateDoubleChanceUI();
        updatePanier();
        displayMatches();
    }
});

console.log(typeof updateDoubleChanceUI);

// ================= CHOIX RAPIDES =================
function quickChoice(matchId, value) {
    if (!userChoices[matchId]) {
        userChoices[matchId] = {};
    }
    
    const match = matches.find(m => m.id === matchId);
    if (!match) return;
    
    if (userChoices[matchId].resultat === value) {
        delete userChoices[matchId].resultat;
        const keys = Object.keys(userChoices[matchId]);
        if (keys.length === 1 && keys[0] === 'matchName') {
            delete userChoices[matchId];
        }
    } else {
        userChoices[matchId].resultat = value;
        userChoices[matchId].matchName = `${match.team1} vs ${match.team2}`;
    }
    
    updatePanier();
    displayMatches();
}

// ================= PANIER =================
function updatePanier() {
    const count = Object.keys(userChoices).length;
    
    const choixCount = $('choixCount');
    const panierBadge = $('panierBadge');
    const validerBtn = $('validerBtn');
    const panierContent = $('panierContent');
    
    if (choixCount) choixCount.textContent = count;
    if (panierBadge) panierBadge.textContent = count;
    if (validerBtn) validerBtn.disabled = count < 18;
    
    if (!panierContent) return;
    
    if (count === 0) {
        panierContent.innerHTML = '<p class="panier-empty">Ou poko chwazi anyen</p>';
        return;
    }
    
    panierContent.innerHTML = '';
    Object.keys(userChoices).forEach(matchId => {
        const choice = userChoices[matchId];
        const item = document.createElement('div');
        item.className = 'choix-item';
        
        const labels = {
            'resultat': 'Rezilta',
            'doublechance': 'Doub Chans',
            'btts': 'Tou de ekip',
            'total': 'Total gòl',
            'mit1': '1ère mi-tan',
            'mt2': '2èm mi-tan'
        };
        
        let detailsHTML = '';
        Object.keys(choice).forEach(key => {
            if (key !== 'matchName' && choice[key]) {
                detailsHTML += `<span class="choix-tag">${labels[key]}: ${choice[key]}</span>`;
            }
        });
        
        item.innerHTML = `
            <div>
                <div class="choix-match">${choice.matchName}</div>
                <div class="choix-details">${detailsHTML}</div>
                <span class="remove-choix" onclick="removeChoice('${matchId}')">🗑️ Efase</span>
            </div>
        `;
        panierContent.appendChild(item);
    });
    
    updateProgressBar();
}

function removeChoice(matchId) {
    delete userChoices[matchId];
    updatePanier();
    displayMatches();
}

// ================= PROGRESS BAR =================
function updateProgressBar() {
    const count = Object.keys(userChoices).length;
    const percentage = (count / 18) * 100;
    
    let progressBar = document.querySelector('.progress-bar');
    if (!progressBar) {
        const container = document.createElement('div');
        container.className = 'progress-container';
        container.innerHTML = '<div class="progress-bar"></div>';
        document.body.appendChild(container);
        progressBar = document.querySelector('.progress-bar');
    }
    
    if (progressBar) {
        progressBar.style.width = percentage + '%';
    }
}

// ================= TOAST NOTIFICATIONS =================
function showToast(message, duration = 2500) {
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = 'toast show';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.transform = 'translateX(-50%) translateY(200px)';
        setTimeout(() => toast.remove(), 500);
    }, duration);
}

// ================= FICHES MODAL =================

bindClick('mesFichesBtn', () => {
    if (!currentUser) {
        showToast('⚠️ Ou dwe konekte dabò');
        return;
    }
    currentFicheFilter = 'pending'; // Reset au filtre par défaut
    
    // Réinitialiser visuellement les onglets
    document.querySelectorAll('.fiches-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.status === 'pending') {
            tab.classList.add('active');
        }
    });
    
    displayFiches();
    showModal('fichesModal');
});

bindClick('closeFiches', () => hideModal('fichesModal'));

// ================= CHARGER RÉSULTATS DES MATCHS =================
async function loadMatchResults() {
    if (!window.firebaseApp || !window.firebaseApp.db) return {};
    
    try {
        const resultsSnapshot = await window.firebaseApp.db.collection('match_results').get();
        const resultsMap = {};
        
        resultsSnapshot.forEach(doc => {
            resultsMap[doc.id] = doc.data();
        });
        
        return resultsMap;
    } catch (error) {
        console.error('Erreur chargement résultats:', error);
        return {};
    }
}

// ================= VÉRIFIER STATUT D'UNE PRÉDICTION =================
function getPredictionStatus(choice, matchResult) {
    if (!matchResult) return '◻️'; // En attente
    
    const statuses = [];
    
    // Vérifier résultat
    if (choice.resultat) {
        if (matchResult.finalResult === choice.resultat) {
            statuses.push('✅');
        } else {
            statuses.push('❌');
        }
    }
    
    // Vérifier double chance
    if (choice.doublechance) {
        const dcOptions = choice.doublechance.split('');
        if (dcOptions.includes(matchResult.finalResult)) {
            statuses.push('✅');
        } else {
            statuses.push('❌');
        }
    }
    
    // Vérifier BTTS
    if (choice.btts) {
        if (matchResult.btts === choice.btts) {
            statuses.push('✅');
        } else {
            statuses.push('❌');
        }
    }
    
    // Vérifier Total
    if (choice.total && matchResult.totalGoals !== undefined) {
        const threshold = parseFloat(choice.total.replace('<', '').replace('>', ''));
        const operator = choice.total[0];
        const isCorrect = operator === '<' ? matchResult.totalGoals < threshold : matchResult.totalGoals > threshold;
        
        if (isCorrect) {
            statuses.push('✅');
        } else {
            statuses.push('❌');
        }
    }
    
    // Vérifier MT1
    if (choice.mt1 && matchResult.htResult) {
        if (matchResult.htResult === choice.mt1) {
            statuses.push('✅');
        } else {
            statuses.push('❌');
        }
    }
    
    // Vérifier MT2
    if (choice.mt2 && matchResult.mt2Result) {
        if (matchResult.mt2Result === choice.mt2) {
            statuses.push('✅');
        } else {
            statuses.push('❌');
        }
    }
    
    // Si toutes les prédictions sont correctes
    if (statuses.length > 0 && statuses.every(s => s === '✅')) {
        return '✅';
    }
    // Si au moins une est incorrecte
    if (statuses.includes('❌')) {
        return '❌';
    }
    // Sinon en attente
    return '◻️';
}

// ================= FILTRER FICHES PAR STATUT =================
function filterFichesByStatus(status) {
    currentFicheFilter = status;
    
    // Mettre à jour les onglets
    document.querySelectorAll('.fiches-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.status === status) {
            tab.classList.add('active');
        }
    });
    
    // Réafficher les fiches filtrées
    displayFiches();
} 

async function displayFiches() {
    const content = $('fichesContent');
    if (!content) return;
    
    // Filtrer selon l'onglet actif
    const filteredFiches = userFiches.filter(fiche => {
        const status = fiche.status || 'pending';
        return status === currentFicheFilter;
    });
    
    if (filteredFiches.length === 0) {
        const emptyMessages = {
            pending: 'Ou poko gen okenn fich an kou',
            won: 'Ou poko genyen okenn fich',
            lost: 'Ou poko pèdi okenn fich'
        };
        
        content.innerHTML = `
            <div class="fiches-empty">
                <div class="fiches-empty-icon">📋</div>
                <div>${emptyMessages[currentFicheFilter]}</div>
            </div>
        `;
        return;
    }
    
    // Charger tous les résultats des matchs
    const matchResults = await loadMatchResults();
    
    const fichesList = document.createElement('div');
    fichesList.className = 'fiches-list';
    
    filteredFiches.forEach(fiche => {
        const ficheCard = document.createElement('div');
        ficheCard.className = 'fiche-card';
        
        const statusClass = fiche.status || 'pending';
        const statusText = {
            won: 'Genyen',
            lost: 'Pèdi'
        }[statusClass] || null;
        
        let matchesHTML = '';
        if (fiche.choices && typeof fiche.choices === 'object') {
            const matchArray = Object.keys(fiche.choices)
                .map(matchId => ({
                    matchId: matchId,
                    ...fiche.choices[matchId]
                }))
                .sort((a, b) => {
                    const matchA = matches.find(m => m.id === a.matchId);
                    const matchB = matches.find(m => m.id === b.matchId);
                    if (!matchA || !matchB) return 0;
                    return new Date(matchA.datetime) - new Date(matchB.datetime);
                });
            
            const toShow = matchArray.slice(0, 5);
            const hasMore = matchArray.length > 5;
            
            toShow.forEach(choice => {
                if (choice.matchName) {
                    const match = matches.find(m => m.id === choice.matchId);
                    let matchDateStr = match ? new Date(match.datetime).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                    }) : '';

                    // Obtenir le résultat du match
                    const matchResult = matchResults[choice.matchId];
                    
                    // Ajouter le score final si disponible
                    if (matchResult && matchResult.scoreHome !== undefined && matchResult.scoreAway !== undefined) {
                        matchDateStr += ` / Score final : ${matchResult.scoreHome}-${matchResult.scoreAway}`;
                    }
                    
                    const status = getPredictionStatus(choice, matchResult);
                    
                    let allChoices = [];
                    if (choice.resultat) allChoices.push(choice.resultat);
                    if (choice.doublechance) allChoices.push(`DC: ${choice.doublechance}`);
                    if (choice.btts) allChoices.push(`BTTS: ${choice.btts}`);
                    if (choice.total) allChoices.push(`Total: ${choice.total}`);
                    if (choice.mt1) allChoices.push(`MT1: ${choice.mt1}`);
                    if (choice.mt2) allChoices.push(`MT2: ${choice.mt2}`);
                    
                    const displayChoice = allChoices.length > 0 ? allChoices.join(', ') : '-';
                    
                    matchesHTML += `
                        <div class="fiche-match-row">
                            <div class="fiche-match-info">
                                <div class="fiche-match-teams">${status} ${choice.matchName}</div>
                                ${matchDateStr ? `<div class="fiche-match-date">${matchDateStr}</div>` : ''}
                            </div>
                            <div class="fiche-match-prediction">${displayChoice}</div>
                        </div>
                    `;
                }
            });
            
            if (hasMore) {
                const hiddenMatchesHTML = matchArray.slice(5).map(choice => {
                    if (!choice.matchName) return '';
                    
                    const match = matches.find(m => m.id === choice.matchId);
                    let matchDateStr = match ? new Date(match.datetime).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                    }) : '';

                    // Obtenir le résultat du match
                    const matchResult = matchResults[choice.matchId];

                    // Ajouter le score final si disponible
                    if (matchResult && matchResult.scoreHome !== undefined && matchResult.scoreAway !== undefined) {
                        matchDateStr += ` / Score final : ${matchResult.scoreHome}-${matchResult.scoreAway}`;
                    }
                    
                    const status = getPredictionStatus(choice, matchResult);
                    
                    let allChoices = [];
                    if (choice.resultat) allChoices.push(choice.resultat);
                    if (choice.doublechance) allChoices.push(`DC: ${choice.doublechance}`);
                    if (choice.btts) allChoices.push(`BTTS: ${choice.btts}`);
                    if (choice.total) allChoices.push(`Total: ${choice.total}`);
                    if (choice.mt1) allChoices.push(`MT1: ${choice.mt1}`);
                    if (choice.mt2) allChoices.push(`MT2: ${choice.mt2}`);
                    const displayChoice = allChoices.length > 0 ? allChoices.join(', ') : '-';
                    
                    return `
                        <div class="fiche-match-row">
                            <div class="fiche-match-info">
                                <div class="fiche-match-teams">${status} ${choice.matchName}</div>
                                ${matchDateStr ? `<div class="fiche-match-date">${matchDateStr}</div>` : ''}
                            </div>
                            <div class="fiche-match-prediction">${displayChoice}</div>
                        </div>
                    `;
                }).join('');
                
                matchesHTML += `
                    <div class="fiche-matches-hidden" id="fiche-${fiche.id}-hidden" style="display:none;">
                        ${hiddenMatchesHTML}
                    </div>
                `;
            }
        }
        
        const date = fiche.timestamp ? 
            new Date(fiche.timestamp.toDate()).toLocaleDateString('fr-FR') : 
            'Date inconnue';
        
        const totalChoices = fiche.choices ? Object.keys(fiche.choices).length : 0;
        
        ficheCard.innerHTML = `
            <div class="fiche-header-new">
                <span class="fiche-date-new">${date}</span>
                ${statusText ? `<span class="fiche-status ${statusClass}">${statusText}</span>` : `<button class="btn-reklame" onclick="reklameFiche('${fiche.id}')">Reklame Kòb Ou</button>`}
            </div>
            <div class="fiche-id">ID: ${fiche.id}</div>
            
            <div class="fiche-body">
                ${matchesHTML}
            </div>
            <div class="fiche-footer">
                <div class="fiche-info-row">
                    <span class="fiche-label">Gains potentiels</span>
                    <span class="fiche-gains">100,000 Goud</span>
                </div>
                ${totalChoices > 5 ? `
                    <button class="fiche-voir-plus" onclick="toggleFicheDetails('${fiche.id}')">
                        <span class="voir-plus-text">Voir plus (${totalChoices - 5})</span>
                        <span class="voir-moins-text" style="display:none;">Voir moins</span>
                    </button>
                ` : ''}
            </div>
        `;
        
        fichesList.appendChild(ficheCard);
    });
    
    content.innerHTML = '';
    content.appendChild(fichesList);
}

function toggleFicheDetails(ficheId) {
    const hidden = document.getElementById(`fiche-${ficheId}-hidden`);
    const btn = event.target.closest('.fiche-voir-plus');
    const plusText = btn.querySelector('.voir-plus-text');
    const moinsText = btn.querySelector('.voir-moins-text');
    
    if (hidden.style.display === 'none') {
        hidden.style.display = 'block';
        plusText.style.display = 'none';
        moinsText.style.display = 'inline';
    } else {
        hidden.style.display = 'none';
        plusText.style.display = 'inline';
        moinsText.style.display = 'none';
    }
}

function reklameFiche(ficheId) {
    // Créer le modal de réclamation
    const reklameModal = document.createElement('div');
    reklameModal.className = 'modal-overlay show';
    reklameModal.id = 'reklameModal';
    reklameModal.innerHTML = `
        <div class="reklame-modal">
            <button class="close-modal" onclick="closeReklameModal()">✕</button>
            <div class="reklame-content">
                <div class="reklame-icon">🎉🎊</div>
                <h2 class="reklame-title">Felisitasyon !!</h2>
                <p class="reklame-text">
                    Tout chwa ekip ou yo pase ? Fich ou an pase ?<br><br>
                    <strong>Felisitasyon !!</strong> 🎉🎊<br><br>
                    Peze <strong>REKLAME</strong> pou w ka fè demand rekonpans 100,000 goud ou an.
                </p>
                <div class="reklame-fiche-id">Fich: ${ficheId}</div>
                <button class="btn-reklame-whatsapp" onclick="sendReklameWhatsApp('${ficheId}')">
                    <span class="whatsapp-icon">📱</span>
                    REKLAME
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(reklameModal);
}

function closeReklameModal() {
    const modal = document.getElementById('reklameModal');
    if (modal) {
        modal.remove();
        document.body.style.overflow = 'auto';
    }
}

function sendReklameWhatsApp(ficheId) {
    const phoneNumber = '50934125103';
    const message = encodeURIComponent(`Fich mw an pase ! Mw vin reklame kòb mw an.\n\nID Fich: ${ficheId}`);
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`;
    
    window.open(whatsappUrl, '_blank');
    closeReklameModal();
}


// ================= ABONNEMENT MODAL =================
bindClick('abonnementBtn', () => {
    if (!currentUser) {
        showToast('⚠️ Ou dwe konekte dabò');
        return;
    }
    displayAbonnement();
    showModal('abonnementModal');
});

bindClick('closeAbonnement', () => hideModal('abonnementModal'));

function displayAbonnement() {
    const statusDiv = $('subscriptionStatus');
    const btnSubscribe = $('btnSubscribe');
    
    if (!statusDiv || !btnSubscribe) return;

    const now = new Date();

    // Vérifier si abonnement actif
    if (userSubscription?.expiresAt) {
        const expiryDate = userSubscription.expiresAt.toDate();

        if (expiryDate > now) {
            statusDiv.className = 'subscription-status active';
            statusDiv.textContent = `✅ Aktif jiska ${expiryDate.toLocaleDateString('fr-FR')}`;
            btnSubscribe.textContent = 'Abònman Aktif';
            btnSubscribe.disabled = true;
        } else {
            statusDiv.className = 'subscription-status inactive';
            statusDiv.textContent = '❌ Abònman ekspire';
            btnSubscribe.textContent = 'Peye Abònman (150 Goud)';
            btnSubscribe.disabled = false;
        }
    } else {
        statusDiv.className = 'subscription-status inactive';
        statusDiv.textContent = '❌ Abònman pa aktif (lè w peye abònman an tou lap pran ti tan pou li aktive)';
        btnSubscribe.textContent = 'Peye Abònman (150 Goud)';
        btnSubscribe.disabled = false;
    }
}

// ================= ACTIVATION ABONNEMENT =================
bindClick('btnSubscribe', () => {
    if (!currentUser) {
        showToast('⚠️ Ou dwe konekte dabò');
        return;
    }
    // Rediriger vers la page de paiement
    window.location.href = 'ezipay-paiement.html';
});

// ================= TRANSACTIONS MODAL =================
bindClick('transactionsBtn', () => {
    if (!currentUser) {
        showToast('⚠️ Ou dwe konekte dabò');
        return;
    }
    displayTransactions();
    showModal('transactionsModal');
});

bindClick('closeTransactions', () => hideModal('transactionsModal'));

function displayTransactions() {
    const content = $('transactionsContent');
    if (!content) return;
    
    if (userTransactions.length === 0) {
        content.innerHTML = `
            <div class="transactions-empty">
                <div class="transactions-empty-icon">💳</div>
                <div>Ou poko gen okenn transaksyon</div>
            </div>
        `;
        return;
    }
    
    const transactionsList = document.createElement('div');
    transactionsList.className = 'transactions-list';
    
    userTransactions.forEach(transaction => {
        const item = document.createElement('div');
        item.className = 'transaction-item';
        
        const typeLabels = {
            deposit: 'Depo',
            withdrawal: 'Retrè',
            subscription: 'Abònman',
            win: 'Genyen',
            refund: 'Ranbousman'
        };
        
        const typeText = typeLabels[transaction.type] || transaction.type;
        const isPositive = transaction.amount >= 0;
        const date = transaction.timestamp ? 
            new Date(transaction.timestamp.toDate()).toLocaleDateString('fr-FR') : 
            'Date inconnue';
        
        item.innerHTML = `
            <div class="transaction-info">
                <div class="transaction-type">${typeText}</div>
                <div class="transaction-date">${date}</div>
            </div>
            <div class="transaction-amount ${isPositive ? 'positive' : 'negative'}">
                ${isPositive ? '+' : ''}${transaction.amount.toFixed(2)} Goud
                </div>
        `;
        
        transactionsList.appendChild(item);
    });
    
    content.innerHTML = '';
    content.appendChild(transactionsList);
}

// ================= VALIDATION =================
bindClick('validerBtn', async () => {
    const count = Object.keys(userChoices).length;
    if (count < 18) {
        showToast('⚠️ Ou dwe chwazi 18 match anvan valide!');
        return;
    }
    
    if (!currentUser) {
        showToast('⚠️ Ou dwe konekte dabò');
        hideModal('panier');
        setTimeout(() => {
            showModal('profileModal');
        }, 500);
        return;
    }
    
    if (!userSubscription || (!userSubscription.isActive && !userSubscription.active)) {
        showToast('❌ Ou dwe gen yon abònman aktif pou soumèt fich');
        hideModal('panier');
        setTimeout(() => {
            showModal('abonnementModal');
        }, 500);
        return;
    }
    
    // CONFIRMATION DES CONDITIONS
    const confirmModal = document.createElement('div');
    confirmModal.className = 'modal-overlay show';
    confirmModal.id = 'confirmConditionsModal';
    confirmModal.innerHTML = `
        <div class="auth-modal" style="max-width:400px;">
            <h2 class="auth-title" style="color:#10b981;margin-bottom:20px;">⚠️ Konfirmasyon</h2>
            <div style="padding:20px;background:#f8f9fa;border-radius:10px;margin-bottom:20px;">
                <p style="line-height:1.8;color:#333;margin-bottom:15px;">
                    Mwen li e mwen aksepte <strong>kondisyon Anti-Paryaj yo</strong>.
                </p>
                <p style="font-size:13px;color:#666;line-height:1.6;">
                    • Pèman rekonpans lan depann de kantite moun ki abone sou Anti-Paryaj<br>
                    • Pèman an kapab fèt sòti 5,000 goud minimum jiska 100,000 maximum, sa depann de kantite moun ki abòne<br>
                    • Kondisyon sa yo mete an plas sèlman pou lansman sit la. Lè nou gen plis kliyan nap ka respekte yon montan rekonpans byen defini.<br>
                    • Ou dwe genyen 18 match pou jwenn rekonpans la
                </p>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                <button onclick="closeConfirmModal()" style="padding:12px;background:#e0e0e0;color:#333;border:none;border-radius:8px;font-weight:600;cursor:pointer;">
                    Anile
                </button>
                <button onclick="confirmAndSubmitFiche()" style="padding:12px;background:#10b981;color:white;border:none;border-radius:8px;font-weight:600;cursor:pointer;">
                    ✅ Aksepte
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(confirmModal);
});

// Fonction pour fermer le modal de confirmation
window.closeConfirmModal = function() {
    const modal = document.getElementById('confirmConditionsModal');
    if (modal) {
        modal.remove();
        document.body.style.overflow = 'auto';
    }
};

// Fonction pour confirmer et soumettre la fiche
window.confirmAndSubmitFiche = async function() {
    closeConfirmModal();
    
    if (!window.firebaseApp || !window.firebaseApp.db) {
        showToast('❌ Erè koneksyon');
        return;
    }
    
    try {
        await window.firebaseApp.db.collection('fiches').add({
            userId: currentUser.uid,
            choices: userChoices,
            status: 'pending',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showToast('✅ Chwa ou yo anrejistre! Bon chans!');
        
        userChoices = {};
        updatePanier();
        displayMatches();
        
        const panier = $('panier');
        if (panier) panier.classList.remove('show');
        
        await loadUserData(currentUser.uid);
        displayFiches();
        
    } catch (error) {
        console.error('Erreur validation:', error);
        showToast('❌ Erè pandan anrejistreman');
    }
};

bindClick('btnDeposit', () => {
    if (!currentUser) {
        showToast('⚠️ Ou dwe konekte dabò');
        return;
    }
    window.location.href = 'ezipay-paiement.html';
});

bindClick('btnWithdraw', () => {
    if (!currentUser) {
        showToast('⚠️ Ou dwe konekte dabò');
        return;
    }
    window.location.href = 'ezipay-paiement.html';
});

document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            hideModal(overlay.id);
        }
    });
});

setInterval(() => {
    displayMatches();
}, 60000);

// ================= PARRAINAGE =================
async function voterParrain() {
    if (!currentUser) {
        showToast('⚠️ Ou dwe konekte dabò');
        return;
    }
    
    // VÉRIFIER QUE L'UTILISATEUR A UN ABONNEMENT ACTIF
    if (!userSubscription?.isActive && !userSubscription?.active) {
        showToast('❌ Ou dwe peye abònman ou anvan vote pou yon anbasadè');
        hideModal('parrainageModal');
        setTimeout(() => {
            showModal('abonnementModal');
        }, 500);
        return;
    }
    
    const parrainCode = document.getElementById('parrainCode').value.trim().toUpperCase();
    
    if (!parrainCode) {
        showToast('⚠️ Antre kòd anbasadè a');
        return;
    }
    
    try {
        const userDoc = await window.firebaseApp.db.collection('users').doc(currentUser.uid).get();
        
        if (userDoc.data().referredBy) {
            showToast('⚠️ Ou deja vote pou yon anbasadè');
            return;
        }
        
        // Chercher l'ambassadeur par CODE
        const ambassadorSnap = await window.firebaseApp.db.collection('users')
            .where('ambassadorCode', '==', parrainCode)
            .limit(1)
            .get();
        
        if (ambassadorSnap.empty) {
            showToast('❌ Kòd anbasadè sa pa egziste');
            return;
        }
        
        const ambassadorId = ambassadorSnap.docs[0].id;
        
        // Vérifier que ce n'est pas son propre code
        if (ambassadorId === currentUser.uid) {
            showToast('❌ Ou pa ka vote pou tèt ou!');
            return;
        }
        
        // Mettre à jour filleul
        await window.firebaseApp.db.collection('users').doc(currentUser.uid).update({
            referredBy: parrainCode,
            referredByUserId: ambassadorId,
            hasVoted: true
        });
        
        // Incrémenter ambassadeur
        await window.firebaseApp.db.collection('users').doc(ambassadorId).update({
            referrals: firebase.firestore.FieldValue.increment(1)
        });
        
        showToast('✅ Vote anrejistre! Mèsi!');
        await loadUserData(currentUser.uid);
        displayParrainageModal();
        
    } catch (error) {
        console.error('Erreur vote:', error);
        showToast('❌ Erè pandan vote');
    }
}

function copyAmbassadorCode() {
    if (!currentUser) return;
    
    const codeElement = document.getElementById('userAmbassadorCode');
    const code = codeElement.textContent;
    
    if (code === '-') {
        showToast('❌ Kòd pa disponib');
        return;
    }
    
    navigator.clipboard.writeText(code).then(() => {
        showToast('✅ Kòd kopye!');
    }).catch(() => {
        showToast('❌ Erè pandan kopi');
    });
}

function displayParrainageModal() {
    if (!currentUser) return;
    
    const userAmbassadorCode = document.getElementById('userAmbassadorCode');
    const referralCount = document.getElementById('referralCount');
    const voteSection = document.getElementById('voteSection');
    const voteConfirmed = document.getElementById('voteConfirmed');
    const confirmedParrain = document.getElementById('confirmedParrain');
    
    window.firebaseApp.db.collection('users').doc(currentUser.uid).get().then(doc => {
        const data = doc.data();
        const referrals = data.referrals || 0;
        const ambassadorCode = data.ambassadorCode || '-';
        
        if (userAmbassadorCode) userAmbassadorCode.textContent = ambassadorCode;
        if (referralCount) referralCount.textContent = referrals;
        
        if (data.referredBy) {
            voteSection.style.display = 'none';
            voteConfirmed.style.display = 'block';
            confirmedParrain.textContent = data.referredBy;
        } else {
            voteSection.style.display = 'block';
            voteConfirmed.style.display = 'none';
        }
    });
}
