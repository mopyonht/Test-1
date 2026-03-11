// ===== CONCOURS.JS - Anti-Paryaj =====

const CONTEST_END = new Date('2026-04-10T23:59:59');
const BASE_URL = 'https://chanpyon509.com/anti-paryaj.html';

let currentUser = null;
let userData = null;

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
    if (!window.firebaseApp) {
        console.error('Firebase non trouvé');
        return;
    }

    startCountdown();
    loadLeaderboard();

    window.firebaseApp.auth.onAuthStateChanged(async (user) => {
        currentUser = user;
        if (user) {
            await loadMyData(user.uid);
        }
        renderMySection();
    });
});

// ===== COUNTDOWN =====
function startCountdown() {
    function update() {
        const now = new Date();
        const diff = CONTEST_END - now;

        if (diff <= 0) {
            document.getElementById('cdDays').textContent = '00';
            document.getElementById('cdHours').textContent = '00';
            document.getElementById('cdMins').textContent = '00';
            document.getElementById('cdSecs').textContent = '00';
            return;
        }

        const days  = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const mins  = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const secs  = Math.floor((diff % (1000 * 60)) / 1000);

        document.getElementById('cdDays').textContent  = String(days).padStart(2, '0');
        document.getElementById('cdHours').textContent = String(hours).padStart(2, '0');
        document.getElementById('cdMins').textContent  = String(mins).padStart(2, '0');
        document.getElementById('cdSecs').textContent  = String(secs).padStart(2, '0');
    }

    update();
    setInterval(update, 1000);
}

// ===== CHARGER MES DONNÉES =====
async function loadMyData(userId) {
    try {
        const doc = await window.firebaseApp.db.collection('users').doc(userId).get();
        if (doc.exists) {
            userData = doc.data();
        }
    } catch (e) {
        console.error('Erreur loadMyData:', e);
    }
}

// ===== AFFICHER MA SECTION =====
function renderMySection() {
    const section = document.getElementById('mySection');
    if (!section) return;

    if (!currentUser || !userData) {
        section.innerHTML = `
            <div class="login-prompt">
                <p>🔐 Konekte pou wè lyen parenn ou ak pwen ou yo</p>
                <a href="anti-paryaj.html" class="btn-login">← Retounen nan Anti-Paryaj</a>
            </div>
        `;
        return;
    }

    const code = userData.ambassadorCode || '';
    const referralLink = `${BASE_URL}?ref=${code}`;
    const referrals = userData.referrals || 0;
    const subReferrals = userData.subscriptionReferrals || 0;
    const points = userData.referralPoints || 0;

    section.innerHTML = `
        <div class="my-link-card">
            <h3>🎯Pèfòmans Ou</h3>

            <div class="my-stats-row">
                <div class="my-stat">
                    <span class="my-stat-val">${points}</span>
                    <span class="my-stat-label">Pwen Total</span>
                </div>
                <div class="my-stat">
                    <span class="my-stat-val">${referrals}</span>
                    <span class="my-stat-label">Enskripsyon</span>
                </div>
                <div class="my-stat">
                    <span class="my-stat-val">${subReferrals}</span>
                    <span class="my-stat-label">Abònman</span>
                </div>
            </div>

            <div style="font-size:11px; color:#4ade80; margin-bottom:12px; background:rgba(0,0,0,0.3); padding:8px 12px; border-radius:8px; line-height:1.6;">
                💡 ${referrals} enskri × 1 pt + ${subReferrals} abònman × 3 pts = <strong style="color:#facc15;">${points} pwen</strong>
            </div>

            <div style="font-size:11px; color:#64748b; margin-bottom:6px; text-transform:uppercase; letter-spacing:1px;">Lyen Ou</div>
            <div class="link-display" id="myLink">${referralLink}</div>

            <button class="btn-copy" onclick="copyLink('${referralLink}')">
                📋 Kopye Lyen An
            </button>
            <button class="btn-share-wa" onclick="shareWhatsApp('${referralLink}', '${userData.username || ''}')">
                💬 Pataje sou WhatsApp
            </button>
        </div>
    `;
}

// ===== LEADERBOARD =====
async function loadLeaderboard() {
    const list = document.getElementById('leaderboardList');
    if (!list) return;

    list.innerHTML = '<div class="lb-loading">Chajman klasman</div>';

    try {
        const snap = await window.firebaseApp.db
            .collection('users')
            .orderBy('referralPoints', 'desc')
            .limit(10)
            .get();

        if (snap.empty) {
            list.innerHTML = '<div class="lb-empty">⚽ Pa gen patisipan ankò — Ou ka #1 !</div>';
            return;
        }

        list.innerHTML = '';
        const medals = ['🥇', '🥈', '🥉'];
        let myRankFound = false;
        const allDocs = snap.docs;

        allDocs.forEach((doc, idx) => {
            if (currentUser && doc.id === currentUser.uid) {
                myRankFound = true;
            }
        });

        allDocs.forEach((doc, idx) => {
            const data = doc.data();
            const points = data.referralPoints || 0;
            const username = data.username || 'Jwè ' + (idx + 1);
            const isMe = currentUser && doc.id === currentUser.uid;
            const rankNum = idx + 1;

            const item = document.createElement('div');
            item.className = `lb-item rank-${rankNum <= 3 ? rankNum : 'other'}${isMe ? ' is-me' : ''}`;

            const rankDisplay = rankNum <= 3 ? medals[rankNum - 1] : `#${rankNum}`;

            item.innerHTML = `
                <div class="lb-rank">${rankDisplay}</div>
                <div class="lb-name">
                    ${username}
                    ${isMe ? '<span class="me-badge">OU</span>' : ''}
                </div>
                <div class="lb-points">
                    ${points}
                    <small>pwen</small>
                </div>
            `;
            list.appendChild(item);
        });

        // Si je ne suis pas dans le top 10, afficher ma position en bas
        if (currentUser && !myRankFound) {
            await appendMyPosition(list);
        }

    } catch (e) {
        console.error('Erreur leaderboard:', e);

        // Fallback sans orderBy si index pas encore créé
        try {
            const snap2 = await window.firebaseApp.db
                .collection('users')
                .limit(50)
                .get();

            const users = [];
            snap2.forEach(doc => {
                const d = doc.data();
                if ((d.referralPoints || 0) > 0) {
                    users.push({ id: doc.id, ...d });
                }
            });

            users.sort((a, b) => (b.referralPoints || 0) - (a.referralPoints || 0));
            const top10 = users.slice(0, 10);

            if (top10.length === 0) {
                list.innerHTML = '<div class="lb-empty">⚽ Pa gen patisipan ankò — Ou ka #1 !</div>';
                return;
            }

            list.innerHTML = '';
            const medals = ['🥇', '🥈', '🥉'];

            top10.forEach((data, idx) => {
                const isMe = currentUser && data.id === currentUser.uid;
                const rankNum = idx + 1;
                const item = document.createElement('div');
                item.className = `lb-item rank-${rankNum <= 3 ? rankNum : 'other'}${isMe ? ' is-me' : ''}`;
                const rankDisplay = rankNum <= 3 ? medals[rankNum - 1] : `#${rankNum}`;

                item.innerHTML = `
                    <div class="lb-rank">${rankDisplay}</div>
                    <div class="lb-name">
                        ${data.username || 'Jwè ' + rankNum}
                        ${isMe ? '<span class="me-badge">OU</span>' : ''}
                    </div>
                    <div class="lb-points">
                        ${data.referralPoints || 0}
                        <small>pwen</small>
                    </div>
                `;
                list.appendChild(item);
            });

        } catch (e2) {
            list.innerHTML = '<div class="lb-empty">❌ Erè chajman — Eseye ankò</div>';
        }
    }
}

// ===== MA POSITION SI PAS DANS TOP 10 =====
async function appendMyPosition(list) {
    if (!currentUser || !userData) return;

    try {
        const myPoints = userData.referralPoints || 0;

        const snap = await window.firebaseApp.db
            .collection('users')
            .where('referralPoints', '>', myPoints)
            .get();

        const myRank = snap.size + 1;

        const separator = document.createElement('div');
        separator.className = 'lb-separator';
        list.appendChild(separator);

        const item = document.createElement('div');
        item.className = 'lb-item is-me';
        item.innerHTML = `
            <div class="lb-rank">#${myRank}</div>
            <div class="lb-name">
                ${userData.username || 'Mwen'}
                <span class="me-badge">OU</span>
            </div>
            <div class="lb-points">
                ${myPoints}
                <small>pwen</small>
            </div>
        `;
        list.appendChild(item);

    } catch (e) {
        console.log('Position personnelle non disponible');
    }
}

// ===== COPIER LYEN =====
function copyLink(link) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(link).then(() => {
            showToast('✅ Lyen kopye !');
        }).catch(() => fallbackCopy(link));
    } else {
        fallbackCopy(link);
    }
}

function fallbackCopy(text) {
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    try {
        document.execCommand('copy');
        showToast('✅ Lyen kopye !');
    } catch (e) {
        showToast('❌ Kopye manyèlman: ' + text);
    }
    document.body.removeChild(el);
}

// ===== PARTAGER WHATSAPP =====
function shareWhatsApp(link, username) {
    const msg = encodeURIComponent(
        `🏆 Anti-Paryaj — Konkou\n\n` +
        `Jwenn Anti-Paryaj gratis epi ede m genyen 250,000 Goud!\n\n` +
        `✅ 2 premye fich ou yo gratis\n` +
        `⚽ Fè prediksyon sou match yo\n\n` +
        `👉 Enskri isit: ${link}`
    );
    window.open(`https://wa.me/?text=${msg}`, '_blank');
}

// ===== TOAST =====
function showToast(message, duration = 2500) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast show';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.transform = 'translateX(-50%) translateY(100px)';
        setTimeout(() => toast.remove(), 400);
    }, duration);
}

// ===== CAPTURER REF À L'ARRIVÉE =====
(function captureRef() {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
        sessionStorage.setItem('pendingRef', ref.toUpperCase());
    }
})();
