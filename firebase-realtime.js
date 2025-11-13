// firebase-realtime.js - Système de matchmaking pour jeu Gomoku
// Version Firebase 8

// Configuration du système
const GAME_CONFIG = {
    ELO_CHANGE: 5,
    QUEUE_TIMEOUT: 180000, // 3 minutes en millisecondes
    AVAILABLE_BETS: [50, 100, 250, 500, 1000],
    DEFAULT_ELO: 550,
    MIN_BALANCE: 50,
    MOVE_TIMEOUT: 15000 // 15 secondes par coup
};

// État local du joueur
let queueListener = null;
let matchListener = null;
let presenceRef = null;

// Initialisation utilisateur et mise à jour des données
async function initializeUser(user) {
    currentUser = user;
    
    try {
        // Vérifier si l'utilisateur existe dans Firestore
        const userDoc = await db.collection('users').doc(user.uid).get();
        
        if (!userDoc.exists) {
            // Créer un nouveau profil utilisateur
            await db.collection('users').doc(user.uid).set({
                email: user.email,
                elo: GAME_CONFIG.DEFAULT_ELO,
                balance: 1000, // Balance de départ
                gamesPlayed: 0,
                gamesWon: 0,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastActive: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            // Mettre à jour lastActive
            await db.collection('users').doc(user.uid).update({
                lastActive: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        // Configurer la présence
        setupPresence();
        
        return true;
    } catch (error) {
        console.error('Erreur lors de l\'initialisation de l\'utilisateur:', error);
        return false;
    }
}

// Configuration du système de présence
function setupPresence() {
    if (!currentUser) return;
    
    presenceRef = database.ref('.info/connected');
    presenceRef.on('value', (snapshot) => {
        if (snapshot.val() === true) {
            const userPresenceRef = database.ref(`presence/${currentUser.uid}`);
            
            // Quand l'utilisateur se déconnecte, supprimer sa présence
            userPresenceRef.onDisconnect().remove();
            
            // Marquer comme présent
            userPresenceRef.set({
                online: true,
                lastSeen: firebase.database.ServerValue.TIMESTAMP
            });
        }
    });
}

// Calculer l'intervalle ELO
function getEloRange(elo) {
    const lowerBound = Math.floor(elo / 100) * 100;
    const upperBound = lowerBound + 99;
    return `${lowerBound}_${upperBound}`;
}

// Rejoindre la file d'attente avec recherche progressive
async function joinQueue(bet, onMatchFound, onError) {
    if (!currentUser) {
        onError('Utilisateur non connecté');
        return false;
    }
    
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (!userDoc.exists) {
            onError('Profil utilisateur non trouvé');
            return false;
        }
        
        const userData = userDoc.data();
        
        if (!GAME_CONFIG.AVAILABLE_BETS.includes(bet)) {
            onError('Mise non valide');
            return false;
        }
        
        if (userData.balance < bet) {
            onError('Solde insuffisant');
            return false;
        }
        
        const eloRange = getEloRange(userData.elo);
        
        // Phase 1 : Recherche dans sa catégorie (30 secondes)
        let matchFound = await searchInCategory(eloRange, bet, userData);
        
        if (matchFound) {
            onMatchFound(matchFound);
            return true;
        }
        
        // Rejoindre la queue de sa catégorie
        const queuePath = `matchmaking/${eloRange}/bet_${bet}/queue`;
        const playerData = {
            uid: currentUser.uid,
            email: currentUser.email,
            elo: userData.elo,
            bet: bet,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };
        
        await database.ref(queuePath).push(playerData);
        
        // Phase 1 : Écouter sa catégorie pendant 30 secondes
        setupQueueListener(eloRange, bet, onMatchFound, onError, false);
        
        // Phase 2 : Après 30 secondes, recherche élargie
        setTimeout(async () => {
            if (queueListener) {
                onError('Recherche élargie...');
                await startExpandedSearch(eloRange, bet, userData, onMatchFound, onError);
            }
        }, 30000);
        
        // Timeout final après 3 minutes
        setTimeout(() => {
            if (queueListener) {
                leaveQueue(bet);
                onError('Temps d\'attente dépassé. Aucun adversaire trouvé.');
            }
        }, GAME_CONFIG.QUEUE_TIMEOUT);
        
        return true;
        
    } catch (error) {
        console.error('Erreur lors de l\'ajout à la queue:', error);
        onError('Erreur lors de la recherche d\'adversaire');
        return false;
    }
}

// Écouter la queue pour un match
function setupQueueListener(eloRange, bet, onMatchFound, onError) {
    const queuePath = `matchmaking/${eloRange}/bet_${bet}/queue`;
    queueListener = database.ref(queuePath);
    
    queueListener.on('child_added', async (snapshot) => {
        const newPlayer = snapshot.val();
        
        // Ignorer notre propre entrée
        if (newPlayer.uid === currentUser.uid) return;
        
        try {
            // Récupérer nos données actuelles
            const userDoc = await db.collection('users').doc(currentUser.uid).get();
            const userData = userDoc.data();
            
            // Supprimer les deux joueurs de la queue
            await database.ref(`${queuePath}/${snapshot.key}`).remove();
            
            // Trouver et supprimer notre entrée
            const ourQueueSnapshot = await database.ref(queuePath).once('value');
            const ourQueueData = ourQueueSnapshot.val();
            if (ourQueueData) {
                for (const [key, player] of Object.entries(ourQueueData)) {
                    if (player.uid === currentUser.uid) {
                        await database.ref(`${queuePath}/${key}`).remove();
                        break;
                    }
                }
            }
            
            // Créer le match
            const matchId = await createMatch({
                uid: currentUser.uid,
                email: currentUser.email,
                elo: userData.elo,
                bet: bet
            }, newPlayer, bet, eloRange);
            
            // Nettoyer le listener
            if (queueListener) {
                queueListener.off();
                queueListener = null;
            }
            
            onMatchFound(matchId);
            
        } catch (error) {
            console.error('Erreur lors de la création du match:', error);
            onError('Erreur lors de la création du match');
        }
    });
}

// Rechercher un match dans une catégorie spécifique
async function searchInCategory(eloRange, bet, userData) {
    const queuePath = `matchmaking/${eloRange}/bet_${bet}/queue`;
    const queueRef = database.ref(queuePath);
    const queueSnapshot = await queueRef.once('value');
    const queueData = queueSnapshot.val();
    
    if (queueData) {
    const waitingPlayers = Object.entries(queueData).filter(([key, player]) => player.uid !== currentUser.uid);
    if (waitingPlayers.length > 0) {
        const [waitingKey, waitingPlayer] = waitingPlayers[0];
    
            // Supprimer le joueur en attente de la queue
            await database.ref(`${queuePath}/${waitingKey}`).remove();
            
            // Créer le match
            const matchId = await createMatch(waitingPlayer, {
                uid: currentUser.uid,
                email: currentUser.email,
                elo: userData.elo,
                bet: bet
            }, bet, eloRange);
            
            return matchId;
            
            // AJOUTER CES LIGNES pour forcer la synchronisation
setTimeout(() => {
    // Notifier les deux joueurs du match trouvé via une mise à jour
    database.ref(`matches/${matchId}/gameState/status`).set('ready');
}, 1000);

return matchId;
        }
    }
    
    return null;
}

// Démarrer la recherche élargie
async function startExpandedSearch(originalEloRange, bet, userData, onMatchFound, onError) {
    const expandedRanges = getExpandedEloRanges(userData.elo);
    
    // Chercher dans les catégories élargies
    for (const range of expandedRanges) {
        const matchId = await searchInCategory(range, bet, userData);
        if (matchId) {
            if (queueListener) {
                queueListener.off();
                queueListener = null;
            }
            onMatchFound(matchId);
            return;
        }
    }
    
    // Écouter les nouvelles catégories + la catégorie originale
    setupExpandedQueueListener([originalEloRange, ...expandedRanges], bet, onMatchFound, onError);
}

// Obtenir les catégories ELO élargies (maximum -50 ELO)
function getExpandedEloRanges(playerElo) {
    const ranges = [];
    const minElo = playerElo - 50;
    
    // Générer les catégories inférieures accessibles
    let currentLowerBound = Math.floor(minElo / 100) * 100;
    
    while (currentLowerBound < playerElo) {
        const range = `${currentLowerBound}_${currentLowerBound + 99}`;
        if (range !== getEloRange(playerElo)) { // Éviter sa propre catégorie
            ranges.push(range);
        }
        currentLowerBound += 100;
    }
    
    return ranges;
}

// Écouter plusieurs catégories à la fois
function setupExpandedQueueListener(eloRanges, bet, onMatchFound, onError) {
    const listeners = [];
    
    eloRanges.forEach(eloRange => {
        const queuePath = `matchmaking/${eloRange}/bet_${bet}/queue`;
        const listener = database.ref(queuePath);
        
        listener.on('child_added', async (snapshot) => {
            const newPlayer = snapshot.val();
            
// Ignorer complètement notre propre entrée
    if (!newPlayer || newPlayer.uid === currentUser.uid) return;
            
            try {
                const userDoc = await db.collection('users').doc(currentUser.uid).get();
                const userData = userDoc.data();
                
                // Vérifier la différence ELO (-50 max)
                if (Math.abs(userData.elo - newPlayer.elo) > 50) return;
                
                // Supprimer les deux joueurs des queues
                await database.ref(`${queuePath}/${snapshot.key}`).remove();
                
                // Supprimer notre entrée de toutes les queues
                for (const range of eloRanges) {
                    const ourQueuePath = `matchmaking/${range}/bet_${bet}/queue`;
                    const ourQueueSnapshot = await database.ref(ourQueuePath).once('value');
                    const ourQueueData = ourQueueSnapshot.val();
                    if (ourQueueData) {
                        for (const [key, player] of Object.entries(ourQueueData)) {
                            if (player.uid === currentUser.uid) {
                                await database.ref(`${ourQueuePath}/${key}`).remove();
                                break;
                            }
                        }
                    }
                }
                
                const matchId = await createMatch({
                    uid: currentUser.uid,
                    email: currentUser.email,
                    elo: userData.elo,
                    bet: bet
                }, newPlayer, bet, getEloRange(userData.elo));
                
                // Nettoyer tous les listeners
                listeners.forEach(l => l.off());
                queueListener = null;
                
                onMatchFound(matchId);
                
            } catch (error) {
                console.error('Erreur lors de la création du match élargi:', error);
                onError('Erreur lors de la création du match');
            }
        });
        
        listeners.push(listener);
    });
    
    queueListener = { off: () => listeners.forEach(l => l.off()) };
}

// Quitter la file d'attente
async function leaveQueue(bet) {
    if (!currentUser || !queueListener) return;
    
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const userData = userDoc.data();
        const eloRange = getEloRange(userData.elo);
        const queuePath = `matchmaking/${eloRange}/bet_${bet}/queue`;
        
        // Trouver et supprimer notre entrée
        const queueSnapshot = await database.ref(queuePath).once('value');
        const queueData = queueSnapshot.val();
        
        if (queueData) {
            for (const [key, player] of Object.entries(queueData)) {
                if (player.uid === currentUser.uid) {
                    await database.ref(`${queuePath}/${key}`).remove();
                    break;
                }
            }
        }
        
        // Nettoyer le listener
        if (queueListener) {
            queueListener.off();
            queueListener = null;
        }
        
    } catch (error) {
        console.error('Erreur lors de la sortie de la queue:', error);
    }
}

// Créer un match
async function createMatch(player1, player2, bet, eloRange) {
    const matchId = database.ref('matches').push().key;
    
    const matchData = {
        matchId: matchId,
        players: {
            player1: player1,
            player2: player2
        },
        gameState: {
            status: 'waiting',
            currentTurn: 'player1',
            moves: [],
            startTime: firebase.database.ServerValue.TIMESTAMP,
            lastActivity: firebase.database.ServerValue.TIMESTAMP,
            board: Array(15).fill().map(() => Array(15).fill(0)) // Plateau 15x15 pour Gomoku
        },
        bet: bet,
        eloRange: eloRange,
        createdAt: firebase.database.ServerValue.TIMESTAMP
    };
    
    await database.ref(`matches/${matchId}`).set(matchData);
    return matchId;
}

// Rejoindre un match
function joinMatch(matchId, onGameStateChange, onError) {
    if (!currentUser) {
        onError('Utilisateur non connecté');
        return;
    }
    
    currentMatch = matchId;
    matchListener = database.ref(`matches/${matchId}`);
    
    matchListener.on('value', (snapshot) => {
        const matchData = snapshot.val();
        if (matchData) {
            onGameStateChange(matchData);
        } else {
            onError('Match non trouvé');
        }
    });
    
    // Marquer le match comme démarré
    database.ref(`matches/${matchId}/gameState/status`).set('playing');
}

// Faire un mouvement
async function makeMove(matchId, row, col) {
    if (!currentUser || !matchId) return false;
    
    try {
        const matchRef = database.ref(`matches/${matchId}`);
        const matchSnapshot = await matchRef.once('value');
        const matchData = matchSnapshot.val();
        
        if (!matchData) return false;
        
        // Vérifier que c'est le tour du joueur
        const isPlayer1 = matchData.players.player1.uid === currentUser.uid;
        const isPlayer2 = matchData.players.player2.uid === currentUser.uid;
        const currentTurn = matchData.gameState.currentTurn;
        
        if ((isPlayer1 && currentTurn !== 'player1') || (isPlayer2 && currentTurn !== 'player2')) {
            return false; // Pas le tour du joueur
        }
        
        // Vérifier que la case est libre
        if (matchData.gameState.board[row][col] !== 0) {
            return false; // Case occupée
        }
        
        // Faire le mouvement
        const playerNumber = isPlayer1 ? 1 : 2;
        const nextTurn = isPlayer1 ? 'player2' : 'player1';
        
        const updates = {};
        updates[`gameState/board/${row}/${col}`] = playerNumber;
        updates[`gameState/currentTurn`] = nextTurn;
        updates[`gameState/lastActivity`] = firebase.database.ServerValue.TIMESTAMP;
        updates[`gameState/moves/${matchData.gameState.moves.length}`] = {
            player: currentTurn,
            row: row,
            col: col,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };
        
        await database.ref(`matches/${matchId}`).update(updates);
        return true;
        
    } catch (error) {
        console.error('Erreur lors du mouvement:', error);
        return false;
    }
}

// Terminer le jeu
async function endGame(matchId, winner, reason = 'normal') {
    if (!matchId) return false;
    
    try {
        const matchRef = database.ref(`matches/${matchId}`);
        const matchSnapshot = await matchRef.once('value');
        const matchData = matchSnapshot.val();
        
        if (!matchData) return false;
        
        const player1 = matchData.players.player1;
        const player2 = matchData.players.player2;
        const bet = matchData.bet;
        
        // Déterminer le gagnant et le perdant
        let winnerData, loserData;
        if (winner === 'player1') {
            winnerData = player1;
            loserData = player2;
        } else if (winner === 'player2') {
            winnerData = player2;
            loserData = player1;
} else if (winner === 'draw') {
    // Match nul - relancer automatiquement après délai
    await database.ref(`matches/${matchId}/gameState`).update({
        status: 'draw_restarting',
        drawMessage: 'Match nul! Relans yon nouvo pati nan 3 segond...',
        lastActivity: firebase.database.ServerValue.TIMESTAMP
    });
    
    // Relancer après 3 secondes
    setTimeout(async () => {
        const newFirstPlayer = matchData.gameState.currentTurn === 'player1' ? 'player2' : 'player1';
        await database.ref(`matches/${matchId}/gameState`).update({
            status: 'playing',
            currentTurn: newFirstPlayer,
            moves: [],
            board: Array(15).fill().map(() => Array(15).fill(0)),
            drawMessage: null,
            drawCount: (matchData.gameState.drawCount || 0) + 1,
            lastActivity: firebase.database.ServerValue.TIMESTAMP
        });
    }, 3000);
    
    return true;
}
        
        // Marquer le match comme terminé
        await database.ref(`matches/${matchId}/gameState`).update({
            status: 'finished',
            winner: winner,
            endReason: reason,
            endTime: firebase.database.ServerValue.TIMESTAMP
        });
        
        // Mettre à jour les ELO et balances
        const batch = db.batch();
        
        // Gagnant
        const winnerRef = db.collection('users').doc(winnerData.uid);
        batch.update(winnerRef, {
            elo: firebase.firestore.FieldValue.increment(GAME_CONFIG.ELO_CHANGE),
            balance: firebase.firestore.FieldValue.increment(bet * 2), // Récupère sa mise + celle de l'adversaire
            gamesPlayed: firebase.firestore.FieldValue.increment(1),
            gamesWon: firebase.firestore.FieldValue.increment(1)
        });
        
        // Perdant
        const loserRef = db.collection('users').doc(loserData.uid);
        batch.update(loserRef, {
            elo: firebase.firestore.FieldValue.increment(-GAME_CONFIG.ELO_CHANGE),
            balance: firebase.firestore.FieldValue.increment(-bet), // Perd sa mise
            gamesPlayed: firebase.firestore.FieldValue.increment(1)
        });
        
        await batch.commit();
        
        // Nettoyer le match après 5 minutes
        setTimeout(() => {
            database.ref(`matches/${matchId}`).remove();
        }, 300000);
        
        return true;
        
    } catch (error) {
        console.error('Erreur lors de la fin du jeu:', error);
        return false;
    }
}

// Quitter un match (déconnexion)
async function leaveMatch(matchId, reason = 'disconnect') {
    if (!currentUser || !matchId) return;
    
    try {
        const matchRef = database.ref(`matches/${matchId}`);
        const matchSnapshot = await matchRef.once('value');
        const matchData = matchSnapshot.val();
        
        if (!matchData || matchData.gameState.status === 'finished') return;
        
        // Déterminer qui quitte
        const isPlayer1 = matchData.players.player1.uid === currentUser.uid;
        const winner = isPlayer1 ? 'player2' : 'player1';
        
        await endGame(matchId, winner, reason);
        
        // Nettoyer les listeners
        if (matchListener) {
            matchListener.off();
            matchListener = null;
        }
        
        currentMatch = null;
        
    } catch (error) {
        console.error('Erreur lors de la sortie du match:', error);
    }
}

// Obtenir les données utilisateur
async function getUserData() {
    if (!currentUser) return null;
    
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        return userDoc.exists ? userDoc.data() : null;
    } catch (error) {
        console.error('Erreur lors de la récupération des données utilisateur:', error);
        return null;
    }
}

// Nettoyer les listeners
function cleanup() {
    if (queueListener) {
        queueListener.off();
        queueListener = null;
    }
    
    if (matchListener) {
        matchListener.off();
        matchListener = null;
    }
    
    if (presenceRef) {
        presenceRef.off();
        presenceRef = null;
    }
    
    currentMatch = null;
}

// Surveiller les déconnexions
firebase.auth().onAuthStateChanged(async (user) => {
    if (user) {
        await initializeUser(user);
    } else {
        cleanup();
        currentUser = null;
    }
});

// Détecter la fermeture de la page
window.addEventListener('beforeunload', () => {
    if (currentMatch) {
        leaveMatch(currentMatch, 'page_close');
    }
    cleanup();
});

// Export des fonctions publiques
window.GameMatchmaking = {
    joinQueue: joinQueue,
    leaveQueue: leaveQueue,
    joinMatch: joinMatch,
    makeMove: makeMove,
    endGame: endGame,
    leaveMatch: leaveMatch,
    getUserData: getUserData,
    cleanup: cleanup,
    GAME_CONFIG: GAME_CONFIG
};