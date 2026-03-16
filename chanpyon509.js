// ================= ÉTAT GLOBAL =================
let matches = [];
let userChoices = {};
let currentMatchId = null;
let selectedCountries = [];
let selectedLeagues = [];
let currentFicheFilter = 'pending';
let userData = null;
let transactionsLoaded = false;
let fichesLoaded = false;
let cachedTournaments = null;
let tournamentsCacheTime = 0;
const TOURNAMENTS_CACHE_TTL = 60 * 60 * 1000; // 5 minutes

// Tournoi actif
let activeTournament = null;
let activeTournamentId = null;
let isSubmitting = false;

// ================= MULTIPLICATEURS CHANPYON509 =================
// Système multiplicatif pur — base 2 × produit des bons multiplicateurs
// Mauvaises réponses = ×1 (neutres)
// Scores exacts plafonnés à ×15

const MULTIPLICATEURS = {
    resultat: {
        // Lus depuis matches.json (match.cotes)
        // Définis par match, pas ici
    },
    doublechance: {
        // Lus depuis matches.json (match.cotes)
    },
    total: {
        '<0.5': 8.5,
        '<1.5': 4.2,
        '<2.5': 1.8,
        '<3.5': 3.1,
        '>0.5': 1.05,
        '>1.5': 1.3,
        '>2.5': 2.2,
        '>3.5': 1.5,
        '>4.5': 1.2
    },
    btts: {
        'Wi':  2.1,
        'Non': 1.6
    },
    scoreexact: {
        '0-0': 7.0,
        '1-0': 4.5,
        '0-1': 4.5,
        '1-1': 6.5,
        '2-0': 6.0,
        '0-2': 6.0,
        '2-1': 5.5,
        '1-2': 5.5,
        '3-0': 8.0,
        '0-3': 8.0,
        '3-1': 7.5,
        '1-3': 7.5,
        '2-2': 12.0,
        '3-3': 15.0,  // plafonné
        '4-0': 15.0,  // plafonné
        '0-4': 15.0,  // plafonné
        '4-4': 15.0,  // plafonné
        '5-0': 15.0,  // plafonné
        '0-5': 15.0,  // plafonné
        '3-2': 15.0,
        '2-3': 15.0
    }
};

const SCORE_BASE = 2;

// ================= CALCUL SCORE =================

function getMultiplicateurMatch(matchId, type, value) {
    const match = matches.find(m => m.id === matchId);
    if (!match) return 1;

    // Résultat et double chance : lus depuis match.cotes
    if (type === 'resultat' && match.cotes?.[value]) {
        return match.cotes[value];
    }
    if (type === 'doublechance' && match.cotes?.[value]) {
        return match.cotes[value];
    }

    return MULTIPLICATEURS[type]?.[value] || 1;
}


// Score potentiel — si TOUT passe
function calculerScorePotentiel(choices) {
    let multiplicateurCombine = 1;
    let hasChoix = false;

    Object.entries(choices).forEach(([matchId, choice]) => {
        ['resultat', 'doublechance', 'total', 'btts'].forEach(type => {
            if (choice[type]) {
                const mult = getMultiplicateurMatch(matchId, type, choice[type]);
                multiplicateurCombine *= mult;
                hasChoix = true;
            }
        });
        // scoreexact : tableau — on multiplie chaque valeur choisie
        if (choice.scoreexact) {
            const arr = Array.isArray(choice.scoreexact) ? choice.scoreexact : [choice.scoreexact];
            arr.forEach(val => {
                const mult = getMultiplicateurMatch(matchId, 'scoreexact', val);
                multiplicateurCombine *= mult;
                hasChoix = true;
            });
        }
    });

    if (!hasChoix) return 0;
    return Math.round(SCORE_BASE * multiplicateurCombine * 100) / 100;
}

// Variables utilisateur Firebase
let currentUser = null;
let userBalance = 0;
let userKredi = 0;
let userSubscription = null;
let userTransactions = [];
let userFiches = [];

// Cache résultats matchs
let cachedMatchResults = null;
let matchResultsCacheTime = 0;

// ================= INIT =================
document.addEventListener('DOMContentLoaded', () => {
    if (window.firebaseApp) {
        console.log('✅ Firebase connecté à Chanpyon509');

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

    loadMatches();
    loadActiveTournament();
    updateProgressBar();
    updateFilterBadge();
});

// Capturer ref depuis URL
(function() {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
        sessionStorage.setItem('pendingRef', ref.toUpperCase());
    }
})();

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

// ================= TOURNOI ACTIF ================
async function loadActiveTournament() {
    if (!window.firebaseApp?.db) return;

    // ✅ Cache toujours valide
    if (cachedTournaments && (Date.now() - tournamentsCacheTime) < TOURNAMENTS_CACHE_TTL) {
        processTournaments(cachedTournaments);
        return;
    }

    try {
        // 🔥 OPTIMISATION 1: Limiter à 10 documents maximum
        // 🔥 OPTIMISATION 2: Ne charger que les champs nécessaires
        const snap = await window.firebaseApp.db.collection('tournaments')
            .where('status', '==', 'active')
            .orderBy('startTime', 'desc')
            .limit(10)  // ← AJOUTER CETTE LIGNE
            .get();

        // Ne garder que les champs utiles
        cachedTournaments = snap.docs.map(d => {
            const data = d.data();
            return {
                id: d.id,
                type: data.type,
                endTime: data.endTime,
                entryFee: data.entryFee,
                participantCount: data.participantCount || 0,
                status: data.status,
                // Ignorer les champs lourds inutiles
            };
        });
        
        tournamentsCacheTime = Date.now();
        processTournaments(cachedTournaments);

    } catch (error) {
        console.error('Erreur chargement tournoi:', error);
    }
}


// ✅ Nouvelle fonction séparée
function processTournaments(list) {
    list.forEach(data => {
        activeTournamentId = data.id;
        activeTournament = data;
        if (data.type === 'chanpyon509-t100') startTournamentTimer(data.endTime, 'timerT100');
        else if (data.type === 'chanpyon509-t500') startTournamentTimer(data.endTime, 'timerT500');
    });
}

function startTournamentTimer(endTime, elementId) {
    const updateTimer = () => {
        const el = $(elementId);
        if (!el) return;

        const endMs = endTime.seconds ? endTime.seconds * 1000 : new Date(endTime).getTime();
        const diff = endMs - Date.now();

        if (diff <= 0) {
            el.textContent = 'FINI';
            el.style.color = '#ef4444';
            return;
        }

        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        el.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    };

    updateTimer();
    setInterval(updateTimer, 1000);
}

async function joinTournament() {
    if (!currentUser) {
        showToast('⚠️ Ou dwe konekte dabò');
        return;
    }

    if (!activeTournament || !activeTournamentId) {
        showToast('⚠️ Pa gen tounwa aktif');
        return;
    }

    const entryFee = activeTournament.entryFee || 150;

    if (userBalance < entryFee) {
        showToast(`❌ Balans ou ensifisan — ou bezwen ${entryFee} Goud`);
        return;
    }

    // Vérifier si déjà inscrit
    const participantDoc = await window.firebaseApp.db
        .collection('tournaments').doc(activeTournamentId)
        .collection('participants').doc(currentUser.uid).get();

    if (participantDoc.exists) {
        showToast('✅ Ou deja enskri nan tounwa sa');
        return;
    }

    try {
        const batch = window.firebaseApp.db.batch();

        // Débiter le joueur
        const userRef = window.firebaseApp.db.collection('users').doc(currentUser.uid);
        batch.update(userRef, {
            balance: firebase.firestore.FieldValue.increment(-entryFee)
        });

        // Créer le participant
        const participantRef = window.firebaseApp.db
            .collection('tournaments').doc(activeTournamentId)
            .collection('participants').doc(currentUser.uid);
        batch.set(participantRef, {
            userId: currentUser.uid,
            bestScore: 0,
            fichesSubmitted: 0,
            joinedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Mettre à jour le tournoi
        const tournamentRef = window.firebaseApp.db.collection('tournaments').doc(activeTournamentId);
        batch.update(tournamentRef, {
            totalPot: firebase.firestore.FieldValue.increment(entryFee),
            participantCount: firebase.firestore.FieldValue.increment(1)
        });

        // Transaction
        const transRef = window.firebaseApp.db.collection('transactions').doc();
        batch.set(transRef, {
            userId: currentUser.uid,
            type: 'tournament_entry',
            amount: -entryFee,
            tournamentId: activeTournamentId,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        await batch.commit();

        userBalance -= entryFee;
        showToast('✅ Ou antre nan tounwa a! Bon chans!');
        updateProfileUI();

    } catch (error) {
        console.error('Erreur joinTournament:', error);
        showToast('❌ Erè pandan anrejistreman');
    }
}

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

// ================= MENU / PROFIL =================
bindClick('menuBtn', () => showModal('menuModal'));
bindClick('closeMenu', () => hideModal('menuModal'));
bindClick('profileBtn', () => showModal('profileModal'));
bindClick('closeProfile', () => hideModal('profileModal'));
bindClick('closeMatch', () => hideModal('matchModal'));

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
                <div class="profile-user-credit">
        <span>🎟️</span>
        <span>${userKredi} Kredi</span>
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

// ================= AUTH MODALS =================
function showLoginForm() {
    hideModal('profileModal');

    const loginModal = document.createElement('div');
    loginModal.className = 'modal-overlay show';
    loginModal.id = 'loginModalC509';
    loginModal.innerHTML = `
        <div class="auth-modal">
            <button class="close-modal" onclick="closeAuthModal('loginModalC509')">✕</button>
            <h2 class="auth-title">Koneksyon</h2>
            <form id="loginFormC509" class="auth-form">
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
    document.getElementById('loginFormC509').onsubmit = handleLogin;
}

function showRegisterForm() {
    hideModal('profileModal');

    const registerModal = document.createElement('div');
    registerModal.className = 'modal-overlay show';
    registerModal.id = 'registerModalC509';
    registerModal.innerHTML = `
        <div class="auth-modal">
            <button class="close-modal" onclick="closeAuthModal('registerModalC509')">✕</button>
            <h2 class="auth-title">Kreye Kont</h2>
            <form id="registerFormC509" class="auth-form">
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
                <div class="form-group">
                    <label>Nimewo Telefòn</label>
                    <input type="tel" id="registerPhone" placeholder="Ex: 34125103" required maxlength="11">
                </div>
                <button type="submit" class="btn-auth">Kreye Kont</button>
                <p class="auth-switch">
                    Ou gen kont deja? <span onclick="switchToLogin()">Konekte</span>
                </p>
            </form>
        </div>
    `;
    document.body.appendChild(registerModal);
    document.getElementById('registerFormC509').onsubmit = handleRegister;
}

function closeAuthModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.remove();
        document.body.style.overflow = 'auto';
    }
}

function switchToRegister() {
    closeAuthModal('loginModalC509');
    showRegisterForm();
}

function switchToLogin() {
    closeAuthModal('registerModalC509');
    showLoginForm();
}

// ================= LOGIN =================
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    if (!window.firebaseApp?.auth) { showToast('❌ Erè koneksyon Firebase'); return; }

    try {
        await window.firebaseApp.auth.signInWithEmailAndPassword(email, password);
        showToast('✅ Koneksyon reyisi!');
        closeAuthModal('loginModalC509');
    } catch (error) {
        const msgs = {
            'auth/user-not-found': '❌ Itilizatè pa egziste',
            'auth/wrong-password': '❌ Modpas enkòrèk',
            'auth/invalid-email': '❌ Email pa valid'
        };
        showToast(msgs[error.code] || '❌ Erè koneksyon');
    }
}

// ================= REGISTER =================
async function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const phone = document.getElementById('registerPhone').value;

    if (password !== confirmPassword) { showToast('❌ Modpas yo pa menm!'); return; }

    const phoneClean = phone.replace(/\s+/g, '').replace('+', '');
    const phoneRegex = /^(509)?\d{8}$/;
    if (!phoneRegex.test(phoneClean)) {
        showToast('❌ Nimewo pa valid — 8 chif apre 509');
        return;
    }

    if (!window.firebaseApp?.auth || !window.firebaseApp?.db) {
        showToast('❌ Erè koneksyon Firebase'); return;
    }

    const phoneDoc = await window.firebaseApp.db.collection('phones').doc(phone).get();
    if (phoneDoc.exists) { showToast('❌ Nimewo telefòn sa deja itilize'); return; }

    try {
        const userCredential = await window.firebaseApp.auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        const ambassadorCode = name.toUpperCase().replace(/\s+/g, '');

        await window.firebaseApp.db.collection('users').doc(user.uid).set({
            username: name,
            email: email,
            balance: 0,
            pati: 0,
            viktwa: 0,
            defet: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            subscription: { isActive: false, expiresAt: null },
            ambassadorCode: ambassadorCode,
            referrals: 0,
            referralPoints: 0,
            phone: phone || ''
        });

        await window.firebaseApp.db.collection('phones').doc(phone).set({ userId: user.uid });

        // Parrainage
        const pendingRef = sessionStorage.getItem('pendingRef');
        if (pendingRef) {
            try {
                const parainSnap = await window.firebaseApp.db.collection('users')
                    .where('ambassadorCode', '==', pendingRef).limit(1).get();
                if (!parainSnap.empty) {
                    const parainId = parainSnap.docs[0].id;
                    await window.firebaseApp.db.collection('users').doc(user.uid).update({
                        referredBy: pendingRef, referredByUserId: parainId
                    });
                    await window.firebaseApp.db.collection('users').doc(parainId).update({
                        referrals: firebase.firestore.FieldValue.increment(1),
                        referralPoints: firebase.firestore.FieldValue.increment(1)
                    });
                }
                sessionStorage.removeItem('pendingRef');
            } catch (refError) {
                sessionStorage.removeItem('pendingRef');
            }
        }

        showToast('✅ Kont kreye avèk siksè!');
        closeAuthModal('registerModalC509');

    } catch (error) {
        const msgs = {
            'auth/email-already-in-use': '❌ Email deja itilize',
            'auth/invalid-email': '❌ Email pa valid',
            'auth/weak-password': '❌ Modpas twò fèb'
        };
        showToast(msgs[error.code] || '❌ Erè kreye kont');
    }
}

// ================= LOAD USER DATA =================
async function loadUserData(userId) {
    if (!window.firebaseApp?.db) return;

    try {
        const userDoc = await window.firebaseApp.db.collection('users').doc(userId).get();
        if (userDoc.exists) {
            const data = userDoc.data();
            userBalance = data.balance || 0;
            userKredi = data.kredi || 0;
            userSubscription = data.subscription || null;
            userData = data;
        }
        updateProfileUI();
    } catch (error) {
        console.error('Erreur chargement données:', error);
    }
}

// ================= DÉCONNEXION =================
bindClick('btnLogout', async () => {
    if (!window.firebaseApp?.auth) return;
    try {
        await window.firebaseApp.auth.signOut();
        showToast('✅ Dekonekte avèk siksè');
        hideModal('profileModal');
        userBalance = 0;
        userSubscription = null;
        userTransactions = [];
        userFiches = [];
        transactionsLoaded = false;
        fichesLoaded = false;
        userData = null;
    } catch (error) {
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
        if (!dataByCountry[m.country]) dataByCountry[m.country] = {};
        if (!dataByCountry[m.country][m.league]) dataByCountry[m.country][m.league] = 0;
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
            document.querySelectorAll('.country-header').forEach(h => h.classList.remove('expanded'));
            document.querySelectorAll('.leagues-list').forEach(l => l.classList.remove('expanded'));
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
    if (index > -1) selectedLeagues.splice(index, 1);
    else selectedLeagues.push(league);
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
        chip.innerHTML = `<span>${league}</span><span class="remove-chip">✕</span>`;
        chip.querySelector('.remove-chip').onclick = () => removeFilterChip(league);
        bar.appendChild(chip);
    });
}

function removeFilterChip(league) {
    const index = selectedLeagues.indexOf(league);
    if (index > -1) selectedLeagues.splice(index, 1);
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
        const res = await fetch('https://raw.githubusercontent.com/mopyonht/Test-1/main/matches.json?t=' + Date.now());
        if (!res.ok) throw new Error('Erreur HTTP: ' + res.status);
        const data = await res.json();
        matches = data.matches;
        displayMatches();
    } catch (error) {
        console.error('❌ Erreur chargement matches:', error);
    }
}

function isMatchAvailable(datetime) {
    const matchDate = new Date(datetime);
    const now = new Date();

    // Calculer le lundi de la semaine prochaine
    const day = now.getDay(); // 0 = dimanche, 1 = lundi, ..., 6 = samedi
    // Décalage jusqu'au lundi suivant
    const daysUntilNextMonday = ((8 - day) % 7) || 7;

    const nextMonday = new Date(now);
    nextMonday.setDate(now.getDate() + daysUntilNextMonday);
    nextMonday.setHours(0, 0, 0, 0); // début de lundi prochain

    // Le match doit être après maintenant et avant lundi prochain
    return matchDate > now && matchDate < nextMonday;
}



function displayMatches() {
    const container = $('matchesContainer');
    if (!container) return;

    container.innerHTML = '';

    const filtered = matches.filter(m => {
        if (!isMatchAvailable(m.datetime)) return false;
        if (selectedLeagues.length && !selectedLeagues.includes(m.league)) return false;
        return true;
    }).sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

    const matchCount = $('matchCount');
    if (matchCount) matchCount.textContent = filtered.length;

    if (!filtered.length) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">⚽</div>
                <div class="empty-state-text">Tann demen pou match lòt semèn</div>
            </div>
        `;
        return;
    }

    filtered.forEach(match => {
        const card = document.createElement('div');
        card.className = 'match-card';
        card.onclick = () => openMatchModal(match.id);

        const matchDate = new Date(match.datetime);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
        const matchDay = new Date(matchDate); matchDay.setHours(0, 0, 0, 0);

        let dateStr;
        if (matchDay.getTime() === today.getTime()) dateStr = "Jodi a";
        else if (matchDay.getTime() === tomorrow.getTime()) dateStr = "Demen";
        else dateStr = matchDate.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

        const timeStr = matchDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
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
                <button class="bet-btn ${selected1}" onclick="event.stopPropagation(); quickChoice('${match.id}','1')">
                    1 <span class="cote-badge">×${match.cotes?.['1'] ?? '—'}</span>
                </button>
                <button class="bet-btn ${selectedX}" onclick="event.stopPropagation(); quickChoice('${match.id}','X')">
                    X <span class="cote-badge">×${match.cotes?.['X'] ?? '—'}</span>
                </button>
                <button class="bet-btn ${selected2}" onclick="event.stopPropagation(); quickChoice('${match.id}','2')">
                    2 <span class="cote-badge">×${match.cotes?.['2'] ?? '—'}</span>
                </button>
            </div>
        `;
        container.appendChild(card);
    });
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
            weekday: 'long', day: 'numeric', month: 'long',
            hour: '2-digit', minute: '2-digit'
        });
    }

    document.querySelectorAll('.match-modal .option-btn').forEach(b => b.classList.remove('selected'));

    if (userChoices[matchId]) {
    Object.entries(userChoices[matchId]).forEach(([k, v]) => {
        if (k !== 'matchName') {
            if (k === 'scoreexact' && Array.isArray(v)) {
                v.forEach(val => {
                    const btn = document.querySelector(`.match-modal .option-btn[data-type="scoreexact"][data-value="${val}"]`);
                    if (btn) btn.classList.add('selected');
                });
            } else {
                const btn = document.querySelector(`.match-modal .option-btn[data-type="${k}"][data-value="${v}"]`);
                if (btn) btn.classList.add('selected');
            }
        }
    });
}

    // Remplir les cotes depuis match.cotes
    const coteMap = match.cotes || {};
    ['1','X','2'].forEach(v => {
        const el = document.getElementById(`cote-${v}`);
        if (el) el.textContent = coteMap[v] ? `×${coteMap[v].toFixed(2)}` : '×—';
    });
    ['1X','12','X2'].forEach(v => {
        const el = document.getElementById(`cote-${v}`);
        if (el) el.textContent = coteMap[v] ? `×${coteMap[v].toFixed(2)}` : '×—';
    });

    showModal('matchModal');
}

document.addEventListener('click', (e) => {
    const btn = e.target.closest('.option-btn');
    if (btn && e.target.closest('.match-modal')) {
        const type = btn.dataset.type;
        const value = btn.dataset.value;
        if (!currentMatchId) return;

        if (!userChoices[currentMatchId]) userChoices[currentMatchId] = {};

        const match = matches.find(m => m.id === currentMatchId);
        if (match) userChoices[currentMatchId].matchName = `${match.team1} vs ${match.team2}`;

        if (btn.classList.contains('selected')) {
            btn.classList.remove('selected');
            if (type === 'scoreexact') {
                userChoices[currentMatchId].scoreexact = userChoices[currentMatchId].scoreexact.filter(v => v !== value);
                if (userChoices[currentMatchId].scoreexact.length === 0) {
                    delete userChoices[currentMatchId].scoreexact;
                }
            } else {
                delete userChoices[currentMatchId][type];
            }
            const keys = Object.keys(userChoices[currentMatchId]);
            if (keys.length === 1 && keys[0] === 'matchName') delete userChoices[currentMatchId];
            updatePanier();
            displayMatches();
            return;
        }

        // Exclusivité résultat / double chance
        if (type === 'resultat') {
            document.querySelectorAll('.match-modal .option-btn[data-type="doublechance"]').forEach(b => b.classList.remove('selected'));
            delete userChoices[currentMatchId].doublechance;
        } else if (type === 'doublechance') {
            document.querySelectorAll('.match-modal .option-btn[data-type="resultat"]').forEach(b => b.classList.remove('selected'));
            delete userChoices[currentMatchId].resultat;
    } else if (type === 'scoreexact') {
    const selectedScores = document.querySelectorAll('.match-modal .option-btn[data-type="scoreexact"].selected');
    if (selectedScores.length >= 2) {
        showToast('⚠️ Maksimòm 2 skor egzak');
        return;
    }
    btn.classList.add('selected');
    if (!userChoices[currentMatchId].scoreexact) {
        userChoices[currentMatchId].scoreexact = [];
    }
    if (!userChoices[currentMatchId].scoreexact.includes(value)) {
        userChoices[currentMatchId].scoreexact.push(value);
    }
    updatePanier();
    displayMatches();
    return;
}

        document.querySelectorAll(`.match-modal .option-btn[data-type="${type}"]`).forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        userChoices[currentMatchId][type] = value;

        updatePanier();
        displayMatches();
    }
});


// ================= CHOIX RAPIDES =================
function quickChoice(matchId, value) {
    if (!userChoices[matchId]) userChoices[matchId] = {};
    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    if (userChoices[matchId].resultat === value) {
        delete userChoices[matchId].resultat;
        const keys = Object.keys(userChoices[matchId]);
        if (keys.length === 1 && keys[0] === 'matchName') delete userChoices[matchId];
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
    if (validerBtn) validerBtn.disabled = count < 1 || count > 5;

    if (!panierContent) return;

    if (count === 0) {
        panierContent.innerHTML = '<p class="panier-empty">Ou poko chwazi anyen</p>';
        const pb = $('panierProgressBar');
        const pl = $('panierProgressLabel');
        if (pb) pb.style.width = '0%';
        if (pl) pl.textContent = '0 chwa';
        const se = $('soldePreview');
        if (se) { se.textContent = '0'; se.style.color = '#ef4444'; }
        return;
    }

    panierContent.innerHTML = '';

    const labels = {
        'resultat': 'Rezilta',
        'doublechance': 'Doub Chans',
        'btts': 'Tou de ekip',
        'total': 'Total gòl',
        'scoreexact': 'Skor Egzak'
    };

    Object.keys(userChoices).forEach(matchId => {
        const choice = userChoices[matchId];
        const item = document.createElement('div');
        item.className = 'choix-item';

        let detailsHTML = '';
        Object.keys(choice).forEach(key => {
    if (key !== 'matchName' && choice[key]) {
        if (key === 'scoreexact' && Array.isArray(choice[key])) {
            choice[key].forEach(val => {
                const multVal = getMultiplicateurMatch(matchId, 'scoreexact', val);
                detailsHTML += `<span class="choix-tag">Skor Egzak: ${val} <span class="cote-tag">×${multVal.toFixed(2)}</span></span>`;
            });
        } else {
            const multVal = getMultiplicateurMatch(matchId, key, choice[key]);
            detailsHTML += `<span class="choix-tag">${labels[key] || key}: ${choice[key]} <span class="cote-tag">×${multVal.toFixed(2)}</span></span>`;
        }
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


// Calculer multiplicateur combiné
    let multCombine = 1;
    Object.entries(userChoices).forEach(([matchId, choice]) => {
        ['resultat', 'doublechance', 'total', 'btts'].forEach(type => {
            if (choice[type]) {
                const mult = getMultiplicateurMatch(matchId, type, choice[type]);
                multCombine *= mult;
            }
        });
        if (choice.scoreexact && Array.isArray(choice.scoreexact)) {
            choice.scoreexact.forEach(val => {
                const mult = getMultiplicateurMatch(matchId, 'scoreexact', val);
                multCombine *= mult;
            });
        }
    });

    const scorePotentiel = Math.round(SCORE_BASE * multCombine * 100) / 100;

    const progressBar = $('panierProgressBar');
    const progressLabel = $('panierProgressLabel');
    const soldeEl = $('soldePreview');
    const coteTotalEl = $('coteTotal');
if (progressBar) progressBar.style.width = Math.min(count * 20, 100) + '%';
    if (progressLabel) progressLabel.textContent = count + ' chwa';

    if (soldeEl) {
        soldeEl.textContent = scorePotentiel.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
        soldeEl.style.color = '#f59e0b'; // Or pour Chanpyon509
    }

    if (coteTotalEl) {
        coteTotalEl.innerHTML = count > 0
            ? `${count} chwa <span class="cote-combinee-badge">×${multCombine.toFixed(2)}</span>`
            : '—';
    }
}

function removeChoice(matchId) {
    delete userChoices[matchId];
    updatePanier();
    displayMatches();
}

// ================= PROGRESS BAR =================
function updateProgressBar() {
    const count = Object.keys(userChoices).length;
    const progressBar = document.querySelector('.progress-bar');
    if (progressBar) progressBar.style.width = (count * 10) + '%';
}

// ================= TOAST =================
function showToast(message, duration = 2500) {
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = 'toast show';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.transform = 'translateX(-50%) translateY(200px)';
        setTimeout(() => toast.remove(), 5000);
    }, duration);
}

// ================= FICHES MODAL =================
bindClick('mesFichesBtn', async () => {
    if (!currentUser) { showToast('⚠️ Ou dwe konekte dabò'); return; }
    currentFicheFilter = 'pending';
    document.querySelectorAll('.fiches-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.status === 'pending') tab.classList.add('active');
    });
    showModal('fichesModal');
    showFichesLoading();
    await loadFiches();
    displayFiches();
});

bindClick('closeFiches', () => hideModal('fichesModal'));

// ================= CHARGER RÉSULTATS MATCHS =================
async function loadMatchResults() {
    const CACHE_DURATION = 5 * 60 * 1000;
    const REPLIT_URL = 'https://ezipay-backend--jynnjaisy.replit.app/api/match-results';

    if (cachedMatchResults && (Date.now() - matchResultsCacheTime) < CACHE_DURATION) {
        return cachedMatchResults;
    }

    try {
        const response = await fetch(REPLIT_URL);
        const json = await response.json();
        const data = json.results;

        cachedMatchResults = {};
        data.forEach(doc => { cachedMatchResults[doc.id] = doc; });
        matchResultsCacheTime = Date.now();
        return cachedMatchResults;
    } catch (error) {
        console.error('Erreur chargement résultats:', error);
        return cachedMatchResults || {};
    }
}

// ================= STATUT PRÉDICTION =================
function getPredictionStatus(choice, matchResult) {
    if (!matchResult) return '◻️';

    const statuses = [];

    if (choice.resultat) statuses.push(matchResult.finalResult === choice.resultat ? '✅' : '❌');

    if (choice.doublechance) {
        const dcOptions = choice.doublechance.split('');
        statuses.push(dcOptions.includes(matchResult.finalResult) ? '✅' : '❌');
    }

    if (choice.btts) statuses.push(matchResult.btts === choice.btts ? '✅' : '❌');

    if (choice.total && matchResult.totalGoals !== undefined) {
        const threshold = parseFloat(choice.total.replace('<', '').replace('>', ''));
        const operator = choice.total[0];
        const isCorrect = operator === '<' ? matchResult.totalGoals < threshold : matchResult.totalGoals > threshold;
        statuses.push(isCorrect ? '✅' : '❌');
    }

    if (choice.scoreexact && matchResult.scoreHome !== undefined) {
        const scoreReel = `${matchResult.scoreHome}-${matchResult.scoreAway}`;
        statuses.push(scoreReel === choice.scoreexact ? '✅' : '❌');
    }

    if (statuses.length > 0 && statuses.every(s => s === '✅')) return '✅';
    if (statuses.includes('❌')) return '❌';
    return '◻️';
}

// ================= FILTRER FICHES =================
function filterFichesByStatus(status) {
    currentFicheFilter = status;
    document.querySelectorAll('.fiches-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.status === status) tab.classList.add('active');
    });
    displayFiches();
}

// ================= AFFICHER FICHES =================
async function displayFiches() {
    const content = $('fichesContent');
    if (!content) return;
    
    // Garder le loading visible pendant que matchResults charge
    const matchResults = await loadMatchResults();

    const filteredFiches = userFiches.filter(fiche => (fiche.status || 'pending') === currentFicheFilter);

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

    const fichesList = document.createElement('div');
    fichesList.className = 'fiches-list';

    filteredFiches.forEach(fiche => {
        const ficheCard = document.createElement('div');
        ficheCard.className = 'fiche-card';

        const statusClass = fiche.status || 'pending';
        const statusText = { won: 'Genyen', lost: 'Pèdi' }[statusClass] || null;

        let matchesHTML = '';
        if (fiche.choices && typeof fiche.choices === 'object') {
            const matchArray = Object.keys(fiche.choices).map(matchId => ({
                matchId, ...fiche.choices[matchId]
            })).sort((a, b) => {
                const mA = matches.find(m => m.id === a.matchId);
                const mB = matches.find(m => m.id === b.matchId);
                if (!mA || !mB) return 0;
                return new Date(mA.datetime) - new Date(mB.datetime);
            });

            const toShow = matchArray.slice(0, 5);
            const hasMore = matchArray.length > 5;

            toShow.forEach(choice => {
                if (!choice.matchName) return;
                const match = matches.find(m => m.id === choice.matchId);
                let matchDateStr = match ? new Date(match.datetime).toLocaleDateString('fr-FR', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                }) : '';

                const matchResult = matchResults[choice.matchId];
                if (matchResult?.scoreHome !== undefined) {
                    matchDateStr += ` / Score: ${matchResult.scoreHome}-${matchResult.scoreAway}`;
                }

                
                
let allChoices = [];

if (choice.resultat) {
    const correct = matchResult ? (matchResult.finalResult === choice.resultat ? '✅' : '❌') : '◻️';
    allChoices.push(`<span style="color:${correct==='✅'?'#4ade80':correct==='❌'?'#f87171':'#94a3b8'}">${correct} ${choice.resultat}</span>`);
}
if (choice.doublechance) {
    const dcOptions = choice.doublechance.split('');
    const correct = matchResult ? (dcOptions.includes(matchResult.finalResult) ? '✅' : '❌') : '◻️';
    allChoices.push(`<span style="color:${correct==='✅'?'#4ade80':correct==='❌'?'#f87171':'#94a3b8'}">${correct} DC: ${choice.doublechance}</span>`);
}
if (choice.btts) {
    const correct = matchResult ? (matchResult.btts === choice.btts ? '✅' : '❌') : '◻️';
    allChoices.push(`<span style="color:${correct==='✅'?'#4ade80':correct==='❌'?'#f87171':'#94a3b8'}">${correct} BTTS: ${choice.btts}</span>`);
}
if (choice.total) {
    let correct = '◻️';
    if (matchResult && matchResult.totalGoals !== undefined) {
        const threshold = parseFloat(choice.total.replace('<','').replace('>',''));
        const operator = choice.total[0];
        correct = (operator === '<' ? matchResult.totalGoals < threshold : matchResult.totalGoals > threshold) ? '✅' : '❌';
    }
    allChoices.push(`<span style="color:${correct==='✅'?'#4ade80':correct==='❌'?'#f87171':'#94a3b8'}">${correct} Total: ${choice.total}</span>`);
}
if (choice.scoreexact) {
    const scoreExactArray = Array.isArray(choice.scoreexact) ? choice.scoreexact : [choice.scoreexact];
    const scoreReel = matchResult ? `${matchResult.scoreHome}-${matchResult.scoreAway}` : null;
    scoreExactArray.forEach(val => {
        const correct = scoreReel ? (scoreReel === val ? '✅' : '❌') : '◻️';
        allChoices.push(`<span style="color:${correct==='✅'?'#4ade80':correct==='❌'?'#f87171':'#94a3b8'}">${correct} Skor: ${val}</span>`);
    });
}

                matchesHTML += `
                    <div class="fiche-match-row">
                        <div class="fiche-match-info">
                            <div class="fiche-match-teams">${choice.matchName}</div>
                            ${matchDateStr ? `<div class="fiche-match-date">${matchDateStr}</div>` : ''}
                        </div>
                        <div class="fiche-match-prediction">${allChoices.join('<br>')}</div>
                    </div>
                `;
            });

            if (hasMore) {
                const hiddenHTML = matchArray.slice(5).map(choice => {
    if (!choice.matchName) return '';
    const matchResult = matchResults[choice.matchId];

    let allChoices = [];
    if (choice.resultat) {
        const correct = matchResult ? (matchResult.finalResult === choice.resultat ? '✅' : '❌') : '◻️';
        allChoices.push(`<span style="color:${correct==='✅'?'#4ade80':correct==='❌'?'#f87171':'#94a3b8'}">${correct} ${choice.resultat}</span>`);
    }
    if (choice.doublechance) {
        const dcOptions = choice.doublechance.split('');
        const correct = matchResult ? (dcOptions.includes(matchResult.finalResult) ? '✅' : '❌') : '◻️';
        allChoices.push(`<span style="color:${correct==='✅'?'#4ade80':correct==='❌'?'#f87171':'#94a3b8'}">${correct} DC: ${choice.doublechance}</span>`);
    }
    if (choice.btts) {
        const correct = matchResult ? (matchResult.btts === choice.btts ? '✅' : '❌') : '◻️';
        allChoices.push(`<span style="color:${correct==='✅'?'#4ade80':correct==='❌'?'#f87171':'#94a3b8'}">${correct} BTTS: ${choice.btts}</span>`);
    }
    if (choice.total) {
        let correct = '◻️';
        if (matchResult && matchResult.totalGoals !== undefined) {
            const threshold = parseFloat(choice.total.replace('<','').replace('>',''));
            const operator = choice.total[0];
            correct = (operator === '<' ? matchResult.totalGoals < threshold : matchResult.totalGoals > threshold) ? '✅' : '❌';
        }
        allChoices.push(`<span style="color:${correct==='✅'?'#4ade80':correct==='❌'?'#f87171':'#94a3b8'}">${correct} Total: ${choice.total}</span>`);
    }
    if (choice.scoreexact) {
        const scoreExactArray = Array.isArray(choice.scoreexact) ? choice.scoreexact : [choice.scoreexact];
        const scoreReel = matchResult ? `${matchResult.scoreHome}-${matchResult.scoreAway}` : null;
        scoreExactArray.forEach(val => {
            const correct = scoreReel ? (scoreReel === val ? '✅' : '❌') : '◻️';
            allChoices.push(`<span style="color:${correct==='✅'?'#4ade80':correct==='❌'?'#f87171':'#94a3b8'}">${correct} Skor: ${val}</span>`);
        });
    }

    const status = getPredictionStatus(choice, matchResult);
    let statusBadge = status === '✅' ? '✅' : status === '❌' ? '❌' : '◻️';
    return `
        <div class="fiche-match-row">
            <div class="fiche-match-info">
                <div class="fiche-match-teams">${statusBadge} ${choice.matchName}</div>
            </div>
            <div class="fiche-match-prediction">${allChoices.join('<br>')}</div>
        </div>
    `;
}).join('');
                matchesHTML += `
                    <div class="fiche-matches-hidden" id="fiche-${fiche.id}-hidden" style="display:none;">
                        ${hiddenHTML}
                    </div>
                `;
            }
        }

        const date = fiche.timestamp
            ? new Date(fiche.timestamp.toDate()).toLocaleDateString('fr-FR')
            : 'Date inconnue';

        const totalChoices = fiche.choices ? Object.keys(fiche.choices).length : 0;

        // Calculer multiplicateur combiné pour affichage
        let multCombine = 1;
if (fiche.choices) {
    Object.entries(fiche.choices).forEach(([matchId, choice]) => {
        ['resultat','doublechance','total','btts'].forEach(type => {
            if (choice[type]) multCombine *= getMultiplicateurMatch(matchId, type, choice[type]);
        });
        if (choice.scoreexact) {
            const arr = Array.isArray(choice.scoreexact) ? choice.scoreexact : [choice.scoreexact];
            arr.forEach(val => {
                multCombine *= getMultiplicateurMatch(matchId, 'scoreexact', val);
            });
        }
    });
}
        

        const scorePotentiel = Math.round(SCORE_BASE * multCombine * 100) / 100;
        const scoreReel = fiche.scoreTournoi ? fiche.scoreTournoi.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '—';

        ficheCard.innerHTML = `
            <div class="fiche-header-new">
                <span class="fiche-date-new">${date}</span>
                ${statusText
                    ? `<span class="fiche-status ${statusClass}">${statusText}</span>`
                    : `<span class="fiche-status pending">An kou</span>`
                }
            </div>
            <div class="fiche-id">ID: ${fiche.id}</div>
            ${fiche.tournamentId ? `<div class="fiche-tournament-badge">🏆 Tounwa</div>` : ''}
            <div class="fiche-body">${matchesHTML}</div>
            <div class="fiche-footer">
                <div class="fiche-info-row">
                    <span class="fiche-label">Miltiply kombiné</span>
                    <span class="cote-combinee-badge">×${multCombine.toFixed(2)}</span>
                </div>
                <div class="fiche-info-row">
                    <span class="fiche-label">Skor Potansyèl</span>
                    <span class="fiche-gains" style="color:#f59e0b;">${scorePotentiel.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}</span>
                </div>
                <div class="fiche-info-row">
    <span class="fiche-label">Skor Reyèl</span>
    <span class="fiche-gains" style="color:#4ade80;">${scoreReel}</span>
</div>
<div class="fiche-info-row">
    <span class="fiche-label">Rekonpans Tounwa</span>
    <span class="fiche-gains" style="color:#a78bfa;">
        ${(() => {
            const type = fiche.tournoiType;
            if (type === 'chanpyon509-t100') return '🏆 10,000 Goud';
            if (type === 'chanpyon509-t500') return '💎 50,000 Goud';
            return '—';
        })()}
    </span>
</div>

                ${totalChoices > 5 ? `
                    <button class="fiche-voir-plus" onclick="toggleFicheDetails('${fiche.id}')">
                        <span class="voir-plus-text">Wè plis (${totalChoices - 5})</span>
                        <span class="voir-moins-text" style="display:none;">Wè mwens</span>
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

// ================= CLASSEMENT TOURNOI =================
bindClick('classementBtn', () => {
    window.location.href = 'classement.html';
});

bindClick('closeClassement', () => hideModal('classementModal'));

async function displayClassement() {
    const content = $('classementContent');
    if (!content) return;

    content.innerHTML = '<div style="text-align:center;padding:40px;">Chajman...</div>';

    try {
        const snap = await window.firebaseApp.db
            .collection('tournaments').doc(activeTournamentId)
            .collection('participants')
            .orderBy('bestScore', 'desc')
            .limit(20)
            .get();

        if (snap.empty) {
            content.innerHTML = '<div style="text-align:center;padding:40px;color:#64748b;">Pa gen jwè ankò</div>';
            return;
        }

        const medals = ['🥇', '🥈', '🥉'];
        let html = '<div class="classement-list">';

        let rank = 0;
        for (const doc of snap.docs) {
            const p = doc.data();
            const isMe = currentUser && doc.id === currentUser.uid;

            let displayName = p.username;

            html += `
                <div class="classement-item ${isMe ? 'classement-me' : ''} ${rank < 3 ? 'classement-top3' : ''}">
                    <span class="classement-rank">${rank < 3 ? medals[rank] : '#' + (rank + 1)}</span>
                    <span class="classement-name">${isMe ? '👤 ' : ''}${displayName}${isMe ? ' (Ou)' : ''}</span>
                    <span class="classement-score">${p.bestScore ? p.bestScore.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '—'}</span>
                </div>
            `;
            rank++;
        }

        html += '</div>';
        content.innerHTML = html;

    } catch (error) {
        console.error('Erreur classement:', error);
        content.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444;">Erè chajman klasman</div>';
    }
}

// ================= VALIDATION FICHE =================
    bindClick('validerBtn', async () => {
    const count = Object.keys(userChoices).length;
    if (count < 1) {
        showToast('⚠️ Ou dwe chwazi omwen 1 match');
        return;
    }
    if (count > 5) {
        showToast('⚠️ Maksimòm 5 match sèlman');
        return;
    }

    if (!currentUser) {
        showToast('⚠️ Ou dwe konekte dabò');
        const panier = $('panier');
        if (panier) panier.classList.remove('show');
        setTimeout(() => showModal('profileModal'), 500);
        return;
    }
    await refreshTournoiSpots();
    showModal('choixTournoiModal');
});

// ================= TRANSACTIONS =================

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

    const list = document.createElement('div');
    list.className = 'transactions-list';

    userTransactions.forEach(transaction => {
        const item = document.createElement('div');
        item.className = 'transaction-item';

        const typeLabels = {
            deposit: 'Depo',
            withdrawal: 'Retrè',
            tournament_entry: 'Frè Tounwa',
            win: 'Genyen',
            refund: 'Ranbousman'
        };

        const typeText = typeLabels[transaction.type] || transaction.type;
        const isPositive = transaction.amount >= 0;
        const date = transaction.timestamp
            ? new Date(transaction.timestamp.toDate()).toLocaleDateString('fr-FR')
            : 'Date inconnue';

        item.innerHTML = `
            <div class="transaction-info">
                <div class="transaction-type">${typeText}</div>
                <div class="transaction-date">${date}</div>
            </div>
            <div class="transaction-amount ${isPositive ? 'positive' : 'negative'}">
                ${isPositive ? '+' : ''}${transaction.amount.toFixed(2)} Goud
            </div>
        `;
        list.appendChild(item);
    });

    content.innerHTML = '';
    content.appendChild(list);
}

async function loadTransactions() {
    if (transactionsLoaded) return;
    try {
        const snap = await window.firebaseApp.db.collection('transactions')
            .where('userId', '==', currentUser.uid)
            .limit(10)
            .get();

        userTransactions = snap.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0));

        transactionsLoaded = true;
    } catch (error) {
        console.error('Erreur transactions:', error);
    }
}

async function loadFiches() {
    if (fichesLoaded) return;
    try {
        const snap = await window.firebaseApp.db.collection('fiches')
            .where('userId', '==', currentUser.uid)
            .where('type', '==', 'tournoi')
            .limit(20)
            .get();

        userFiches = snap.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0));

        fichesLoaded = true;
    } catch (error) {
        console.error('Erreur fiches:', error);
    }
}

// ================= DEPOSIT =================
bindClick('btnDeposit', () => {
    if (!currentUser) { showToast('⚠️ Ou dwe konekte dabò'); return; }
    window.location.href = 'ezipay-paiement.html';
});

bindClick('btnWithdraw', () => {
    if (!currentUser) { showToast('⚠️ Ou dwe konekte dabò'); return; }
    window.location.href = 'ezipay-paiement.html';
});

// Fermer modals en cliquant dehors
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) hideModal(overlay.id);
    });
});

// ================= CONFIGURATION TOURNOIS =================
const TOURNOI_CONFIG = {
    t100: {
        label: 'RAPID 100',
        maxParticipants: 100,
        entryFee: 150,
        reward: 10000,
        commission: 5000,
        type: 'chanpyon509-t100'
    },
    t500: {
        label: 'ELITE 500',
        maxParticipants: 500,
        entryFee: 150,
        reward: 50000,
        commission: 25000,
        type: 'chanpyon509-t500'
    }
};

// ================= RAFRAICHIR PLACES DISPONIBLES =================
async function refreshTournoiSpots() {
    if (!window.firebaseApp?.db) return;

    // Utiliser le cache s'il est encore valide
    if (cachedTournaments && (Date.now() - tournamentsCacheTime) < TOURNAMENTS_CACHE_TTL) {
        updateSpotsFromCache();
        return;
    }

    // Sinon, recharger les tournois actifs des deux types en une seule requête
    try {
        const snap = await window.firebaseApp.db.collection('tournaments')
            .where('status', '==', 'active')
            .where('type', 'in', ['chanpyon509-t100', 'chanpyon509-t500'])
            .limit(2)
            .get();

        // Mettre à jour le cache global
        cachedTournaments = snap.docs.map(d => {
            const data = d.data();
            return {
                id: d.id,
                type: data.type,
                participantCount: data.participantCount || 0,
                status: data.status,
                entryFee: data.entryFee // optionnel, si besoin
            };
        });
        tournamentsCacheTime = Date.now();

        updateSpotsFromCache();
    } catch (error) {
        console.error('Erreur refresh spots:', error);
        // Fallback : afficher "Pa aktif"
        for (const key of Object.keys(TOURNOI_CONFIG)) {
            const spotsEl = $(`spots${key.charAt(0).toUpperCase() + key.slice(1)}`);
            const statusEl = $(`status${key.charAt(0).toUpperCase() + key.slice(1)}`);
            if (spotsEl) spotsEl.textContent = 'Pa aktif';
            if (statusEl) statusEl.innerHTML = '<span class="status-dot-small" style="background:#ef4444;animation:none;"></span> Inaktif';
        }
    }
}

// Nouvelle fonction utilitaire
function updateSpotsFromCache() {
    for (const [key, config] of Object.entries(TOURNOI_CONFIG)) {
        const spotsEl = $(`spots${key.charAt(0).toUpperCase() + key.slice(1)}`);
        const statusEl = $(`status${key.charAt(0).toUpperCase() + key.slice(1)}`);

        const tournoiData = cachedTournaments?.find(t => t.type === config.type);
        if (!tournoiData) {
            if (spotsEl) spotsEl.textContent = 'Pa aktif';
            if (statusEl) statusEl.innerHTML = '<span class="status-dot-small" style="background:#ef4444;animation:none;"></span> Inaktif';
            continue;
        }

        const taken = tournoiData.participantCount || 0;
        const remaining = config.maxParticipants - taken;
        if (spotsEl) spotsEl.textContent = `${remaining} plas lib`;
        if (statusEl) statusEl.innerHTML = `<span class="status-dot-small"></span> ${taken}/${config.maxParticipants}`;
    }
}



// ================= SÉLECTIONNER ET SOUMETTRE =================
async function selectAndSubmitTournoi(tournoiKey) {
    const config = TOURNOI_CONFIG[tournoiKey];
    if (!config) return;

    hideModal('choixTournoiModal');

    // Vérifier balance
    if (userBalance < config.entryFee) {
        showToast(`❌ Balans ensifisan — ou bezwen ${config.entryFee} Goud`);
        return;
    }

    // Trouver tournoi actif
    // ✅ Lire depuis le cache — 0 lecture Firestore
const cached = cachedTournaments?.find(t => t.type === config.type);
if (!cached) {
    showToast('⚠️ Pa gen tounwa aktif pou kounye a');
    return;
}
const tournoiId = cached.id;
const tournoiData = cached;


    // Vérifier si déjà inscrit
    try {
    } catch (e) {}

    // Vérifier places disponibles
    const taken = tournoiData.participantCount || 0;
    if (taken >= config.maxParticipants) {
        showToast('⚠️ Tounwa sa plen — tann yon lòt kreye nan kèk minit silvouplè epi aktyalize paj ou a');
        return;
    }

    // Modal de confirmation
    const confirmModal = document.createElement('div');
    confirmModal.className = 'modal-overlay show';
    confirmModal.id = 'confirmTournoiModal';
    confirmModal.innerHTML = `
        <div class="auth-modal" style="max-width:380px;">
            <h2 class="auth-title" style="color:var(--gold);">⚠️ Konfimasyon</h2>
            <div style="background:rgba(245,158,11,0.06);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:20px;">
                <div style="font-size:13px;color:var(--text-secondary);line-height:1.8;">
                    <div style="margin-bottom:6px;">🏆 <strong style="color:var(--text);">Tounwa ${config.label}</strong></div>
                    <div>💰 Frè antrè: <strong style="color:var(--gold);">${config.entryFee} Goud</strong></div>
                    <div>🎁 Rekonpans: <strong style="color:#4ade80;">${config.reward.toLocaleString('fr-FR')} Goud</strong></div>
                    <div>👥 Max: <strong style="color:var(--text);">${config.maxParticipants} patisipan</strong></div>
                </div>
            </div>
            <p style="font-size:12px;color:var(--text-secondary);margin-bottom:16px;line-height:1.6;">
                Mwen aksepte kondisyon Chanpyon509 yo. <strong style="color:var(--gold);">${config.entryFee} Goud</strong> ap debite sou balans mwen.
            </p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                <button onclick="closeConfirmTournoiModal()" style="padding:12px;background:rgba(255,255,255,0.06);color:var(--text-secondary);border:none;border-radius:10px;font-weight:600;cursor:pointer;">
                    Anile
                </button>
                <button onclick="confirmTournoiEntry('${tournoiKey}','${tournoiId}')" style="padding:12px;background:linear-gradient(135deg,#f59e0b,#d97706);color:white;border:none;border-radius:10px;font-weight:700;cursor:pointer;">
                    ✅ Aksepte
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(confirmModal);
}

window.closeConfirmTournoiModal = function() {
    const m = document.getElementById('confirmTournoiModal');
    if (m) { m.remove(); document.body.style.overflow = 'auto'; }
};

window.confirmTournoiEntry = async function(tournoiKey, tournoiId) {
    if (isSubmitting) return;
    isSubmitting = true;
    closeConfirmTournoiModal();
    const config = TOURNOI_CONFIG[tournoiKey];
    if (!config) return;

    try {
        const batch = window.firebaseApp.db.batch();

        // Débiter le joueur
        const userRef = window.firebaseApp.db.collection('users').doc(currentUser.uid);
        batch.update(userRef, {
            balance: firebase.firestore.FieldValue.increment(-config.entryFee)
        });

        // Créer le participant
        const participantRef = window.firebaseApp.db
    .collection('tournaments').doc(tournoiId)
    .collection('participants').doc();
batch.set(participantRef, {
    userId: currentUser.uid,
    username: userData?.username || currentUser.email.split('@')[0],
    bestScore: 0,
    fichesSubmitted: 0,
    joinedAt: firebase.firestore.FieldValue.serverTimestamp()
});

        // Mettre à jour le tournoi
        const tournoiRef = window.firebaseApp.db.collection('tournaments').doc(tournoiId);
        batch.update(tournoiRef, {
            participantCount: firebase.firestore.FieldValue.increment(1),
            totalPot: firebase.firestore.FieldValue.increment(config.entryFee)
        });

        // Transaction
        const transRef = window.firebaseApp.db.collection('transactions').doc();
        batch.set(transRef, {
            userId: currentUser.uid,
            type: 'tournament_entry',
            amount: -config.entryFee,
            tournamentId: tournoiId,
            label: config.label,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        await batch.commit();

        userBalance -= config.entryFee;
        updateProfileUI();

        // Soumettre la fiche
        await submitFicheForTournoi(tournoiId, config, true, participantRef.id);
        isSubmitting = false;

    } catch (error) {
        console.error('Erreur entry tournoi:', error);
        showToast('❌ Erè pandan anrejistreman');
        isSubmitting = false;
    }
};

// ================= SOUMETTRE LA FICHE =================
    async function submitFicheForTournoi(tournoiId, config, isNewEntry, participantId) {
    if (!window.firebaseApp?.db) return;
    if (Object.keys(userChoices).length < 1) return;

    const scorePotentiel = calculerScorePotentiel(userChoices);

    try {
        const newFicheRef = await window.firebaseApp.db.collection('fiches').add({
            userId: currentUser.uid,
            username: userData?.username || currentUser.email.split('@')[0],
            choices: { ...userChoices },
            scorePotentiel: scorePotentiel,
            scoreTournoi: null,
            tournamentId: tournoiId,
            tournoiType: config.type,
            type: 'tournoi',
            status: 'pending',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
          // 🔁 Appel à l'API Replit pour rafraîchir le cache du classement
        try {
            await fetch(`https://ezipay-backend--jynnjaisy.replit.app/api/classement/refresh/${tournoiId}`, {
                method: 'POST'
            });
            console.log('✅ Cache classement rafraîchi');
        } catch (refreshError) {
            console.warn('⚠️ Erreur refresh classement (non bloquante):', refreshError);
        }
        
        // Incrémenter fiches soumises
        await window.firebaseApp.db
            .collection('tournaments').doc(tournoiId)
            .collection('participants').doc(participantId)
            .update({
                fichesSubmitted: firebase.firestore.FieldValue.increment(1),
                scorePotentiel: scorePotentiel
            });

        // Mettre à jour en mémoire
        userFiches.unshift({
            id: newFicheRef.id,
            userId: currentUser.uid,
            choices: { ...userChoices },
            scorePotentiel: scorePotentiel,
            scoreTournoi: null,
            tournamentId: tournoiId,
            tournoiType: config.type,
            type: 'tournoi',
            status: 'pending',
            timestamp: { toDate: () => new Date() }
        });

        showToast(isNewEntry
            ? `✅ Ou antre nan tounwa ${config.label}! Fich anrejistre!`
            : `✅ Fich anrejistre nan tounwa ${config.label}!`
        );

        userChoices = {};
        updatePanier();
        displayMatches();
        const panier = $('panier');
        if (panier) panier.classList.remove('show');
        displayFiches();

    } catch (error) {
        console.error('Erreur soumission fiche:', error);
        showToast('❌ Erè pandan anrejistreman fich');
    }
}

function showFichesLoading() {
    const content = $('fichesContent');
    if (!content) return;
    content.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;gap:16px;">
            <div style="
                width:40px;height:40px;
                border:3px solid rgba(245,158,11,0.15);
                border-top:3px solid #f59e0b;
                border-radius:50%;
                animation:ficheSpin 0.8s linear infinite;
            "></div>
            <div style="color:#64748b;font-size:13px;font-weight:500;">Chajman fich yo...</div>
        </div>
    `;
}
    

(function(){

function startIntro(){

const style=document.createElement("style");
style.innerHTML=`

#ap-overlay{
position:fixed;
top:0;
left:0;
width:100%;
height:100%;
background:#050a12;
display:flex;
align-items:center;
justify-content:center;
z-index:9999999;
font-family:'Montserrat', sans-serif;
}

#ap-box{
text-align:center;
}

#ap-title{
font-family:'Montserrat', sans-serif;
font-size:52px;
font-weight:800;
letter-spacing:5px;
color:#f7b733;
opacity:0;
animation:apFade 1.2s ease forwards;
}

#ap-small{
font-family:'Montserrat', sans-serif;
font-size:13px;
letter-spacing:6px;
color:#cfa24d;
margin-top:-6px;
opacity:0;
animation:apFade 1.2s ease forwards;
animation-delay:.8s;
}

#ap-sub{
font-family:'Montserrat', sans-serif;
margin-top:20px;
font-size:20px;
font-weight:500;
letter-spacing:1px;
color:#ffd98a;
opacity:0;
animation:apFade 1.2s ease forwards;
animation-delay:1.6s;
}

@keyframes apFade{
from{opacity:0;transform:translateY(10px)}
to{opacity:1;transform:translateY(0)}
}

@keyframes apFadeOut{
to{opacity:0}
}

`;

document.head.appendChild(style);

const overlay=document.createElement("div");
overlay.id="ap-overlay";

overlay.innerHTML=`
<div id="ap-box">
<div id="ap-title">ANTI-PARYAJ</div>
<div id="ap-small">TOUNWA</div>
<div id="ap-sub">Nou ranmase l, ou touche l</div>
</div>
`;

document.body.appendChild(overlay);

setTimeout(()=>{
overlay.style.animation="apFadeOut .8s forwards";
setTimeout(()=>overlay.remove(),800);
},5000);

}

function waitBody(){
if(document.body){
startIntro();
}else{
setTimeout(waitBody,10);
}
}

waitBody();

})();

// ================= ONBOARDING SLIDES (1 seule fois) =================
(function showOnboardingOnce() {
  // Vérifier si l'utilisateur a déjà vu les slides
  if (localStorage.getItem('c509_onboarding_seen') === 'true') return;

  // Créer le conteneur overlay
  const overlay = document.createElement('div');
  overlay.id = 'onboarding-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.95);
    backdrop-filter: blur(8px);
    z-index: 999999;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'DM Sans', sans-serif;
    transition: opacity 0.4s ease;
  `;

  // Slides data (sans images, uniquement du texte stylisé)
  const slides = [
    {
      emoji: '🎊🎊',
      title: 'Byenvini kliyan. Kisa Anti-Paryaj Tounwa ye menm ?',
      desc: 'Anti-Paryaj Tounwa se yon nouvo sistèm paryaj ekilibre ak jis kote wap jwe sou 5 match epi wap ka fè 10,000 ak 50,000 goud fasil',
      color: '#f59e0b'
    },
    {
      emoji: '🎯',
      title: 'Kijan pou w jwe?',
      desc: 'Chwazi sèlman 5 match, ou ka fè plizyè chwa nan yon match e ou ka chwazi 2 skò egzak pou chak match, rantre nan yon tounwa kap fini lè dènye match semèn nan ap fini, si fich ou gen plis evènman ki pase, ou genyen. Se kot chwa w ki pase yo kap ba ou plis pwen pou w genyen.',
      color: '#4ade80'
    },
    {
      emoji: '💵💵💵💵',
      title: 'Poukisa tout moun ap toujou touche nan Anti-Paryaj?',
      desc: 'Paske kòb rekonpans lan pa sòti nan pòch nou e nou gentan ranmase l nan men tout moun ki patisipe nan tounwa a. Nou ranmase l, ou touche l.',
      color: '#a78bfa'
    }
  ];

  let currentSlide = 0;

  // Création HTML
  overlay.innerHTML = `
    <div class="onboarding-container" style="
      background: #111827;
      border: 1px solid rgba(245,158,11,0.15);
      border-radius: 28px;
      max-width: 380px;
      width: 90%;
      padding: 30px 20px 25px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.6);
      text-align: center;
    ">
      <!-- Indicateurs de slides -->
      <div class="slide-dots" style="
        display: flex;
        gap: 8px;
        justify-content: center;
        margin-bottom: 25px;
      ">
        ${slides.map((_, i) => `<span class="dot" data-index="${i}" style="
          width: 8px;
          height: 8px;
          border-radius: 20px;
          background: ${i === 0 ? slides[0].color : '#334155'};
          transition: all 0.3s ease;
          cursor: pointer;
        "></span>`).join('')}
      </div>

      <!-- Slide content -->
      <div class="slide-content" style="min-height: 200px;">
        <div style="font-size: 64px; margin-bottom: 10px; line-height: 1;">${slides[0].emoji}</div>
        <h3 style="
          font-size: 24px;
          font-weight: 700;
          margin-bottom: 12px;
          background: linear-gradient(135deg, ${slides[0].color}, #fff);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        ">${slides[0].title}</h3>
        <p style="
          color: #94a3b8;
          font-size: 15px;
          line-height: 1.6;
          margin-bottom: 25px;
          padding: 0 10px;
        ">${slides[0].desc}</p>
      </div>

      <!-- Navigation buttons -->
      <div style="display: flex; gap: 12px; justify-content: center; margin-top: 15px;">
        <button class="onboarding-prev" style="
          background: transparent;
          border: 1px solid #334155;
          color: #94a3b8;
          padding: 12px 20px;
          border-radius: 40px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
          display: ${slides.length > 1 ? 'block' : 'none'};
        ">◀ Anvan</button>
        
        <button class="onboarding-next" style="
          background: ${slides[0].color};
          border: none;
          color: #000;
          padding: 12px 30px;
          border-radius: 40px;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 4px 15px ${slides[0].color}40;
        ">Apre ▶</button>

        <button class="onboarding-finish" style="
          background: #4ade80;
          border: none;
          color: #000;
          padding: 12px 25px;
          border-radius: 40px;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
          display: none;
        ">✓ Mwen konprann</button>
      </div>

      <!-- Petit texte optionnel -->
      <p style="color: #334155; font-size: 11px; margin-top: 20px;">
        Klike sou "Mwen konprann" pou w kòmanse
      </p>
    </div>
  `;

  document.body.appendChild(overlay);

  // Éléments DOM
  const container = overlay.querySelector('.onboarding-container');
  const dots = overlay.querySelectorAll('.dot');
  const contentDiv = overlay.querySelector('.slide-content');
  const prevBtn = overlay.querySelector('.onboarding-prev');
  const nextBtn = overlay.querySelector('.onboarding-next');
  const finishBtn = overlay.querySelector('.onboarding-finish');

  // Fonction de mise à jour du slide
  function updateSlide(index) {
    const slide = slides[index];
    
    // Mise à jour du contenu avec animation fade
    contentDiv.style.opacity = '0';
    setTimeout(() => {
      contentDiv.innerHTML = `
        <div style="font-size: 64px; margin-bottom: 10px; line-height: 1;">${slide.emoji}</div>
        <h3 style="
          font-size: 24px;
          font-weight: 700;
          margin-bottom: 12px;
          background: linear-gradient(135deg, ${slide.color}, #fff);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        ">${slide.title}</h3>
        <p style="
          color: #94a3b8;
          font-size: 15px;
          line-height: 1.6;
          margin-bottom: 25px;
          padding: 0 10px;
        ">${slide.desc}</p>
      `;
      contentDiv.style.opacity = '1';
    }, 200);

    // Mise à jour des dots
    dots.forEach((dot, i) => {
      dot.style.background = i === index ? slide.color : '#334155';
      dot.style.width = i === index ? '20px' : '8px';
    });

    // Mise à jour des boutons
    if (index === slides.length - 1) {
      nextBtn.style.display = 'none';
      finishBtn.style.display = 'block';
      finishBtn.style.background = slide.color;
    } else {
      nextBtn.style.display = 'block';
      finishBtn.style.display = 'none';
      nextBtn.style.background = slide.color;
      nextBtn.style.boxShadow = `0 4px 15px ${slide.color}40`;
    }
    prevBtn.style.display = index === 0 ? 'none' : 'block';
  }

  // Événements
  nextBtn.addEventListener('click', () => {
    if (currentSlide < slides.length - 1) {
      currentSlide++;
      updateSlide(currentSlide);
    }
  });

  prevBtn.addEventListener('click', () => {
    if (currentSlide > 0) {
      currentSlide--;
      updateSlide(currentSlide);
    }
  });

  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => {
      currentSlide = i;
      updateSlide(currentSlide);
    });
  });

  finishBtn.addEventListener('click', () => {
    // Animation de sortie
    overlay.style.opacity = '0';
    setTimeout(() => {
      overlay.remove();
      document.body.style.overflow = 'auto';
    }, 400);
    localStorage.setItem('c509_onboarding_seen', 'true');
  });

  // Initialisation
  updateSlide(0);
  document.body.style.overflow = 'hidden'; // Empêche le scroll pendant l'onboarding
})();


// Rafraîchir matchs toutes les 60s
setInterval(() => displayMatches(), 60000);
