/**
 * CryptoPredict Hub - Core Client-Side Logic Controller
 * * DESIGNED FOR EASY BACKEND INTEGRATION:
 * Search for "BACKEND INTEGRATION POINT" to hook this frontend script
 * up to databases, payment APIs, or cloud auth providers.
 */

/* ==========================================
   1. GLOBAL STATE & CONFIGURATION CONFIG
   ========================================== */
// Static mock users
const communityUsers = {
    'WhaleWatcher': { username: 'WhaleWatcher', bio: 'Hunting the largest whale moves in the crypto ocean. Long-term positions.', location: 'Dubai, UAE', points: 1850, color: 'from-amber-500 to-orange-600' },
    'MoonShot99': { username: 'MoonShot99', bio: 'DeFi yield farmer & high-leverage enthusiast.', location: 'Lunar Base Alpha', points: 1200, color: 'from-purple-500 to-pink-600' },
    'PepeLord': { username: 'PepeLord', bio: 'Meme coin expert. HODLing until zero or Valhalla.', location: 'Digital Web', points: 950, color: 'from-green-500 to-emerald-600' }
};

// Default assets watch list 
let watchlist = ['bitcoin', 'ethereum', 'binancecoin', 'solana', 'ripple', 'cardano', 'dogecoin', 'polkadot', 'tron', 'chainlink', 'polygon', 'shiba-inu', 'litecoin', 'avalanche-2', 'near', 'uniswap', 'stellar', 'kaspa', 'pepe', 'aptos', 'monero'];

// User profile active state
const userProfile = {
    username: "Trader_X",
    bio: "Ruling the blockchain markets, one high value signal at a time.",
    location: "Digital Frontier",
    points: 1000
};

// Predictions storage (loaded into LocalStorage for user session persistence)
let predictions = [
    { id: 101, user: 'WhaleWatcher', assetId: 'bitcoin', assetSymbol: 'BTC', direction: 'UP', entryPrice: 95400, deadline: new Date(Date.now() + 3600000).toISOString(), reason: 'Target: $98,000 | SL: $93,000. Institutional flow looks incredibly solid.', status: 'ACTIVE' },
    { id: 102, user: 'MoonShot99', assetId: 'ethereum', assetSymbol: 'ETH', direction: 'UP', entryPrice: 3200, deadline: new Date(Date.now() - 3600000).toISOString(), reason: 'EIP-4844 momentum reducing layer-2 fees. Target $3400.', status: 'SETTLED', finalPrice: 3450, isCorrect: true, pnl: 7.81 },
    { id: 103, user: 'PepeLord', assetId: 'pepe', assetSymbol: 'PEPE', direction: 'DOWN', entryPrice: 0.00001, deadline: new Date(Date.now() - 7200000).toISOString(), reason: 'Overbought on the 4-hour RSI. Squeezing down.', status: 'SETTLED', finalPrice: 0.000009, isCorrect: true, pnl: 10.0 }
];

let copiedTraders = JSON.parse(localStorage.getItem('copiedTraders')) || [];
let currentPrices = {};
let selectedDirection = null;
let selectedAsset = null;
let refreshSecs = 30;
let viewingUserScope = null;

/* ==========================================
   2. DOM ELEMENT BINDINGS
   ========================================== */
const assetSelector = document.getElementById('asset-selector');
const assetDropdown = document.getElementById('asset-dropdown');
const assetLabel = document.getElementById('asset-label');
const assetSearchInput = document.getElementById('asset-search');
const dropdownCoinsList = document.getElementById('dropdown-coins-list');
const screenerSearch = document.getElementById('screener-search');
const screenerResults = document.getElementById('screener-search-results');
const priceList = document.getElementById('price-list');
const feedContainer = document.getElementById('prediction-feed');
const historyContainer = document.getElementById('profile-history');
const pointsDisplay = document.getElementById('points-val');
const deadlineInput = document.getElementById('deadline');

/* ==========================================
   3. AUDIO SYNTH ENGINE (WEB AUDIO API)
   ========================================== */
function playAlertSound(isCorrect = true) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        if (isCorrect) {
            osc.frequency.setValueAtTime(523.25, ctx.currentTime);
            osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            osc.start();
            osc.stop(ctx.currentTime + 0.3);
        } else {
            osc.frequency.setValueAtTime(220, ctx.currentTime);
            osc.frequency.setValueAtTime(147, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            osc.start();
            osc.stop(ctx.currentTime + 0.3);
        }
    } catch (e) { /* Browser Audio Auto-Play Policy Block Safeguard */ }
}

/* ==========================================
   4. SYSTEM UTILITIES & SANITIZATION (SECURITY)
   ========================================== */
// Clean markup inputs to avoid XSS security injections from user edits
function sanitizeInput(str) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', '/': '&#x2F;' };
    return str.replace(/[&<>"'/]/g, (m) => map[m]);
}

function showToast(msg, isError = false, title = "System Alert") {
    const toast = document.getElementById('toast');
    const icon = document.getElementById('toast-icon');
    document.getElementById('toast-title').innerText = title;
    document.getElementById('toast-msg').innerText = msg;
    
    if (isError) {
        icon.className = 'fa-solid fa-circle-exclamation text-red-500 text-lg';
        toast.style.borderColor = '#ef4444';
    } else if (title.includes("Copy") || title.includes("Follow") || title.includes("Screener")) {
        icon.className = 'fa-solid fa-clone text-blue-400 text-lg';
        toast.style.borderColor = '#3b82f6';
    } else {
        icon.className = 'fa-solid fa-circle-check text-emerald-500 text-lg';
        toast.style.borderColor = '#10b981';
    }
    
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 4000);
}

function getUserWinRate(username) {
    const userPreds = predictions.filter(p => p.user === username && p.status === 'SETTLED');
    if (userPreds.length === 0) return 0;
    const wins = userPreds.filter(p => p.isCorrect).length;
    return Math.round((wins / userPreds.length) * 100);
}

function getLocalISOString(date) {
    const tzOffset = date.getTimezoneOffset() * 60000;
    return new Date(date - tzOffset).toISOString().slice(0, 16);
}

function initDeadlineInput() {
    const now = new Date();
    deadlineInput.setAttribute('min', getLocalISOString(now));
    const defaultFuture = new Date(now.getTime() + 60 * 60000); // 1-hour out default
    deadlineInput.value = getLocalISOString(defaultFuture);
}

/* ==========================================
   5. ROUTING & VIEW CONTROLLER
   ========================================== */
function switchView(view) {
    const hub = document.getElementById('view-hub');
    const profile = document.getElementById('view-profile');
    const navHub = document.getElementById('nav-hub');
    const navProfile = document.getElementById('nav-profile');

    if (view === 'hub') {
        hub.classList.remove('hidden');
        profile.classList.add('hidden');
        navHub.classList.add('active');
        navProfile.classList.remove('active');
        viewingUserScope = null;
    } else {
        hub.classList.add('hidden');
        profile.classList.remove('hidden');
        navHub.classList.remove('active');
        navProfile.classList.add('active');
        renderCopiedTradersDashboard();
    }
}

function viewOwnProfile() {
    renderProfileData(userProfile.username);
    switchView('profile');
}

/* ==========================================
   6. USER PROFILE & EDITING CONTROLLERS
   ========================================== */
function toggleEditProfile() {
    const modal = document.getElementById('edit-profile-modal');
    modal.classList.toggle('hidden');
    if (!modal.classList.contains('hidden')) {
        document.getElementById('edit-username').value = userProfile.username;
        document.getElementById('edit-bio').value = userProfile.bio;
        document.getElementById('edit-location').value = userProfile.location;
    }
}

function saveProfile() {
    // BACKEND INTEGRATION POINT: Sync updated profile stats securely to DB
    userProfile.username = sanitizeInput(document.getElementById('edit-username').value);
    userProfile.bio = sanitizeInput(document.getElementById('edit-bio').value);
    userProfile.location = sanitizeInput(document.getElementById('edit-location').value);
    
    document.getElementById('nav-username').innerText = userProfile.username;
    renderProfileData(userProfile.username);
    toggleEditProfile();
    showToast("Your profile was updated successfully!");
}

/* ==========================================
   7. COPY TRADING SYSTEMS (LOCAL STORAGE CACHE)
   ========================================== */
function toggleCopyTrader() {
    if (!viewingUserScope || viewingUserScope === userProfile.username) return;

    const index = copiedTraders.indexOf(viewingUserScope);
    if (index > -1) {
        copiedTraders.splice(index, 1);
        showToast(`You stopped copying signals from @${viewingUserScope}.`, true, "Copy Stopped");
    } else {
        copiedTraders.push(viewingUserScope);
        playAlertSound(true);
        showToast(`You are now copy-trading @${viewingUserScope}! All signals from this user will show up below.`, false, "Copy Mode Active 📈");
    }
    // BACKEND INTEGRATION POINT: Update user follow list in database table
    localStorage.setItem('copiedTraders', JSON.stringify(copiedTraders));
    updateCopyButtonUI();
    renderLeaders();
    renderCopiedTradersDashboard();
}

function updateCopyButtonUI() {
    const btn = document.getElementById('btn-copy-action');
    const btnText = document.getElementById('btn-copy-text');
    
    if (copiedTraders.includes(viewingUserScope)) {
        btn.className = "bg-red-500 hover:bg-red-600 text-white px-5 py-2 rounded-xl text-xs font-black transition-all shadow-lg shadow-red-500/20 uppercase tracking-wider";
        btnText.innerText = "Stop Copying";
    } else {
        btn.className = "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-5 py-2 rounded-xl text-xs font-black transition-all shadow-lg shadow-blue-500/20 uppercase tracking-wider";
        btnText.innerText = "Copy Trader";
    }
}

function renderCopiedTradersDashboard() {
    const listContainer = document.getElementById('copied-traders-list');
    const feedContainer = document.getElementById('copied-signals-feed');

    if (!listContainer || !feedContainer) return;

    if (copiedTraders.length === 0) {
        listContainer.innerHTML = `
            <div class="text-center py-8 text-slate-500 border border-dashed border-slate-800 rounded-xl p-4">
                <i class="fa-solid fa-user-plus text-lg mb-2 block text-slate-600"></i>
                <span class="text-[11px] block">No copied traders saved yet.</span>
                <button onclick="switchView('hub')" class="mt-2 text-[10px] text-blue-400 font-extrabold uppercase hover:underline">Find Traders on Hub</button>
            </div>
        `;
    } else {
        listContainer.innerHTML = copiedTraders.map(username => {
            const trader = communityUsers[username] || { username, points: 0, color: 'from-slate-500 to-slate-700' };
            const wr = getUserWinRate(username);
            return `
                <div class="glass-card p-3 rounded-xl border border-slate-800 flex items-center justify-between gap-2 hover:border-blue-500/30 transition-all">
                    <div class="flex items-center gap-2 cursor-pointer" onclick="openUserProfile('${username}')">
                        <div class="w-8 h-8 rounded-lg bg-gradient-to-br ${trader.color || 'from-blue-500 to-indigo-600'} flex items-center justify-center text-[10px] shadow-lg"><i class="fa-solid fa-user"></i></div>
                        <div>
                            <h5 class="text-xs font-bold text-slate-200">@${username}</h5>
                            <span class="text-[9px] text-emerald-400 font-bold font-mono">WR: ${wr}% | ${trader.points} pts</span>
                        </div>
                    </div>
                    <button onclick="removeCopiedTrader('${username}')" class="text-red-400 hover:text-red-500 p-2 text-xs" title="Remove">
                        <i class="fa-solid fa-user-minus"></i>
                    </button>
                </div>
            `;
        }).join('');
    }

    const copiedSignals = predictions.filter(p => copiedTraders.includes(p.user));

    if (copiedSignals.length === 0) {
        feedContainer.innerHTML = `
            <div class="text-center py-16 text-slate-500 border border-dashed border-slate-800 rounded-2xl p-6">
                <i class="fa-solid fa-chart-line text-2xl mb-2 block text-slate-600"></i>
                <span class="text-xs">No active or historic signals from saved traders.</span>
            </div>
        `;
    } else {
        feedContainer.innerHTML = copiedSignals.map(p => {
            let statusLabel = '';
            let borderClass = '';
            
            if (p.status === 'SETTLED') {
                borderClass = 'border-l-4 border-slate-500';
                statusLabel = `<span class="font-extrabold text-[10px] ${p.isCorrect ? 'text-emerald-400' : 'text-red-400'}">${p.isCorrect ? 'PROFIT +150' : 'LOSS -50'}</span>`;
            } else if (p.status === 'SETTLING') {
                borderClass = 'settling-pulse border-l-4 border-blue-500';
                statusLabel = `<span class="text-[9px] text-blue-400 font-bold flex items-center gap-1"><span class="custom-loader !w-3 !h-3"></span> RESOLVING...</span>`;
            } else {
                borderClass = p.direction === 'UP' ? 'border-l-4 border-emerald-500' : 'border-l-4 border-red-500';
                statusLabel = `<span class="text-[9px] text-blue-400 animate-pulse font-bold">LIVE SIGNAL</span>`;
            }

            const traderColor = communityUsers[p.user]?.color || 'from-blue-500 to-indigo-600';

            return `
                <div class="bg-slate-900/40 p-4 rounded-xl border border-slate-800 ${borderClass}">
                    <div class="flex justify-between items-center mb-2">
                        <div class="flex items-center gap-2 cursor-pointer" onclick="openUserProfile('${p.user}')">
                            <div class="w-6 h-6 rounded-md bg-gradient-to-br ${traderColor} flex items-center justify-center text-[8px]"><i class="fa-solid fa-user"></i></div>
                            <span class="text-xs font-bold text-slate-300">@${p.user}</span>
                        </div>
                        <span class="bg-slate-800 text-[10px] text-blue-400 font-bold px-2 py-0.5 rounded border border-slate-700 font-mono uppercase">${p.assetSymbol}</span>
                    </div>
                    <div class="my-3">
                        <div class="flex justify-between items-center mb-1">
                            <span class="text-[9px] font-black uppercase px-2 py-0.5 rounded ${p.direction === 'UP' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}">
                                <i class="fa-solid fa-${p.direction === 'UP' ? 'arrow-trend-up' : 'arrow-trend-down'} mr-1"></i> ${p.direction === 'UP' ? 'LONG / BUY' : 'SHORT / SELL'}
                            </span>
                            ${statusLabel}
                        </div>
                        <p class="text-[11px] text-slate-400 italic font-medium pl-2 border-l border-slate-800 mt-2">"${p.reason || 'No specific reasoning was provided.'}"</p>
                    </div>
                    <div class="flex justify-between items-center pt-2 border-t border-slate-800/30 text-[10px]">
                        <div class="flex flex-col">
                            <span class="text-[8px] text-slate-500 font-bold uppercase">Entry -> Deadline</span>
                            <span class="text-[9px] text-slate-400 font-mono">$${p.entryPrice.toLocaleString()} -> ${new Date(p.deadline).toLocaleTimeString()}</span>
                        </div>
                        ${p.status === 'SETTLED' ? `
                            <div class="text-right">
                                <span class="text-[8px] block text-slate-500">Exit: $${p.finalPrice.toLocaleString()}</span>
                                <span class="font-bold ${p.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'} font-mono">${p.pnl.toFixed(2)}%</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }
}

function removeCopiedTrader(username) {
    const index = copiedTraders.indexOf(username);
    if (index > -1) {
        copiedTraders.splice(index, 1);
        localStorage.setItem('copiedTraders', JSON.stringify(copiedTraders));
        showToast(`Removed @${username} from your list.`, true, "Copy Stopped");
        renderCopiedTradersDashboard();
        if (viewingUserScope === username) updateCopyButtonUI();
    }
}

function openUserProfile(username) {
    renderProfileData(username);
    switchView('profile');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderProfileData(username) {
    viewingUserScope = username;
    const isMe = username === userProfile.username;
    const data = isMe ? userProfile : (communityUsers[username] || { username, bio: 'A quiet crypto observer.', location: 'Earth', points: 0, color: 'from-slate-500 to-slate-700' });

    document.getElementById('profile-display-name').innerText = data.username;
    document.getElementById('profile-display-bio').innerText = data.bio;
    document.getElementById('profile-display-loc').innerText = data.location;
    document.getElementById('profile-score').innerText = data.points;
    document.getElementById('history-label').innerText = isMe ? "My Signal Log" : `Signal Log of @${data.username}`;

    document.getElementById('copied-traders-panel').style.display = isMe ? 'block' : 'none';
    document.getElementById('btn-edit-profile').style.display = isMe ? 'block' : 'none';
    
    const copyBtn = document.getElementById('btn-copy-action');
    if (isMe) {
        copyBtn.classList.add('hidden');
    } else {
        copyBtn.classList.remove('hidden');
        updateCopyButtonUI();
    }

    const avatar = document.getElementById('profile-avatar');
    avatar.className = `w-32 h-32 rounded-3xl bg-gradient-to-br ${data.color || 'from-blue-500 to-indigo-600'} flex items-center justify-center text-4xl shadow-2xl border-4 border-slate-800 transition-all`;

    const userPreds = predictions.filter(p => p.user === username);
    const settled = userPreds.filter(p => p.status === 'SETTLED');
    const wins = settled.filter(p => p.isCorrect).length;
    const losses = settled.length - wins;
    const winRate = getUserWinRate(username);

    document.getElementById('profile-win-rate').innerText = `${winRate}%`;
    document.getElementById('p-stat-total').innerText = userPreds.length;
    document.getElementById('p-stat-wins').innerText = wins;
    document.getElementById('p-stat-loss').innerText = losses;

    renderFeed(username);
    renderCopiedTradersDashboard();
}

/* ==========================================
   8. COINGECKO LIVE API MARKET DECK & PINNING
   ========================================== */
async function searchCoins(query, callback) {
    if (!query || query.trim().length < 2) return callback([]);
    try {
        const response = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`);
        const data = await response.json();
        callback(data.coins ? data.coins.slice(0, 8) : []);
    } catch (e) {
        console.error("CoinGecko Search Error", e);
        callback([]);
    }
}

function handleSelectCoin(id, symbol) {
    const cleanId = id.toLowerCase();
    selectedAsset = { id: cleanId, symbol: symbol.toUpperCase() };
    assetLabel.innerText = symbol.toUpperCase().replace(/-/g, ' ');
    assetLabel.classList.remove('text-slate-400');
    assetLabel.classList.add('text-blue-400', 'font-bold');
    assetSelector.classList.add('asset-active');
    assetDropdown.classList.remove('open');
    
    if (!watchlist.includes(cleanId)) {
        watchlist.unshift(cleanId);
        renderPriceList(); 
        fetchMarketData();
    }
}

// Global Click Dropdown Closures
document.addEventListener('click', (e) => {
    if (!assetSelector.contains(e.target) && !assetDropdown.contains(e.target)) {
        assetDropdown.classList.remove('open');
    }
    if (!screenerSearch.contains(e.target) && !screenerResults.contains(e.target)) {
        screenerResults.classList.add('hidden');
    }
});

assetSelector.onclick = (e) => {
    e.stopPropagation();
    assetDropdown.classList.toggle('open');
    renderAssetOptions("");
    setTimeout(() => assetSearchInput.focus(), 50);
};

assetSearchInput.oninput = (e) => {
    const val = e.target.value.trim();
    renderAssetOptions(val);
};

function renderAssetOptions(filterStr) {
    dropdownCoinsList.innerHTML = '';
    const filteredWatchlist = watchlist.filter(id => id.toLowerCase().includes(filterStr.toLowerCase()));

    if (filteredWatchlist.length > 0 || filterStr === "") {
        filteredWatchlist.forEach(id => {
            const item = document.createElement('div');
            item.className = 'p-3 hover:bg-slate-700 cursor-pointer flex items-center justify-between border-b border-slate-700 last:border-0 transition-colors';
            const price = currentPrices[id]?.usd ? `$${currentPrices[id].usd.toLocaleString()}` : '--';
            item.innerHTML = `
                <div class="flex flex-col text-left">
                    <span class="text-xs font-bold text-slate-100 uppercase">${id.replace(/-/g, ' ')}</span>
                    <span class="text-[10px] text-slate-500">${price}</span>
                </div>
                <span class="text-[9px] text-blue-500 border border-blue-500/20 px-1.5 py-0.5 rounded">Pinned</span>
            `;
            item.onclick = (e) => {
                e.stopPropagation();
                handleSelectCoin(id, id);
            };
            dropdownCoinsList.appendChild(item);
        });
    }

    if (filterStr.length >= 2) {
        const searchNotice = document.createElement('div');
        searchNotice.className = 'p-2 text-center text-[10px] text-slate-500 bg-slate-900 border-y border-slate-800';
        searchNotice.innerHTML = `<i class="fa-solid fa-spinner animate-spin mr-1"></i> Searching CoinGecko index...`;
        dropdownCoinsList.appendChild(searchNotice);

        searchCoins(filterStr, (globalCoins) => {
            const uniqueGlobals = globalCoins.filter(gc => !watchlist.includes(gc.id.toLowerCase()));
            
            if (searchNotice.parentNode) dropdownCoinsList.removeChild(searchNotice);

            if (uniqueGlobals.length > 0) {
                const globalHeading = document.createElement('div');
                globalHeading.className = 'p-1.5 text-[8px] font-bold text-slate-500 uppercase tracking-widest bg-slate-900/60 pl-3';
                globalHeading.innerText = "Global Results";
                dropdownCoinsList.appendChild(globalHeading);

                uniqueGlobals.forEach(c => {
                    const item = document.createElement('div');
                    item.className = 'p-3 hover:bg-slate-700 cursor-pointer flex items-center justify-between border-b border-slate-700 last:border-0 transition-colors';
                    item.innerHTML = `
                        <div class="flex items-center gap-2">
                            <img src="${c.thumb}" class="w-4 h-4 rounded-full" onerror="this.style.display='none'">
                            <div class="flex flex-col text-left">
                                <span class="text-xs font-bold text-slate-100 capitalize">${c.name}</span>
                                <span class="text-[9px] text-slate-500 uppercase">${c.symbol}</span>
                            </div>
                        </div>
                        <span class="text-[8px] text-indigo-400 border border-indigo-400/20 px-1.5 py-0.5 rounded font-bold uppercase">Add</span>
                    `;
                    item.onclick = (e) => {
                        e.stopPropagation();
                        handleSelectCoin(c.id, c.symbol);
                    };
                    dropdownCoinsList.appendChild(item);
                });
            } else if (filteredWatchlist.length === 0) {
                const noResults = document.createElement('div');
                noResults.className = 'p-4 text-center text-xs text-slate-500';
                noResults.innerText = "No assets found";
                dropdownCoinsList.appendChild(noResults);
            }
        });
    }
}

screenerSearch.oninput = (e) => {
    const val = e.target.value.trim();
    if (val.length < 2) {
        screenerResults.classList.add('hidden');
        return;
    }
    searchCoins(val, (coins) => {
        if (coins.length === 0) {
            screenerResults.innerHTML = '<div class="p-3 text-xs text-slate-500 text-center">No assets found</div>';
        } else {
            screenerResults.innerHTML = coins.map(c => `
                <div onclick="pinCoinToScreener('${c.id}', '${c.symbol}')" class="p-2.5 hover:bg-slate-700/80 cursor-pointer flex items-center justify-between border-b border-slate-700 last:border-0 transition-colors">
                    <div class="flex items-center gap-2">
                        <img src="${c.thumb}" class="w-4 h-4 rounded-full" onerror="this.style.display='none'">
                        <span class="text-xs font-bold text-white capitalize">${c.name} (${c.symbol.toUpperCase()})</span>
                    </div>
                    <span class="text-[9px] text-blue-400 font-bold uppercase">Pin Live</span>
                </div>
            `).join('');
        }
        screenerResults.classList.remove('hidden');
    });
};

function pinCoinToScreener(coinId, symbol) {
    const cleanId = coinId.toLowerCase();
    screenerResults.classList.add('hidden');
    screenerSearch.value = '';
    
    if (!watchlist.includes(cleanId)) {
        watchlist.unshift(cleanId); 
        showToast(`Pinned ${symbol.toUpperCase()} to your Market Overview list!`, false, "Screener Updates");
        renderPriceList(); 
        fetchMarketData(); 
    } else {
        watchlist = watchlist.filter(id => id !== cleanId);
        watchlist.unshift(cleanId);
        showToast(`Moved ${symbol.toUpperCase()} to the top!`, false, "Screener Updates");
        renderPriceList();
        fetchMarketData();
    }
}

async function fetchMarketData() {
    try {
        const ids = watchlist.join(',');
        const resp = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
        const data = await resp.json();
        
        // Merge loaded prices
        currentPrices = { ...currentPrices, ...data };
        renderPriceList();
        updateStats();
    } catch (err) { 
        console.error("API rate limited, executing automatic fallback simulations.", err); 
        // Robust Fallback pricing mock data
        watchlist.forEach(id => {
            if (!currentPrices[id]) {
                currentPrices[id] = {
                    usd: Math.random() * 25000 + 10,
                    usd_24h_change: Math.random() * 12 - 6
                };
            }
        });
        renderPriceList();
        updateStats();
    }
}

function renderPriceList() {
    priceList.innerHTML = '';
    watchlist.forEach(id => {
        const data = currentPrices[id];
        const displayName = id.replace(/-/g, ' ');
        const row = document.createElement('div');
        row.className = 'flex justify-between items-center group cursor-pointer hover:bg-slate-800 p-2.5 rounded-xl transition-all border border-transparent hover:border-slate-700';
        
        if (!data) {
            row.innerHTML = `
                <div class="flex items-center gap-2">
                    <span class="custom-loader !w-3 !h-3"></span>
                    <span class="font-bold text-xs text-slate-400 capitalize">${displayName}</span>
                </div>
                <div class="text-right">
                    <div class="font-mono text-xs font-semibold text-slate-500">Loading...</div>
                </div>
            `;
        } else {
            const price = data.usd !== undefined ? `$${data.usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}` : '--';
            const change = data.usd_24h_change !== undefined ? data.usd_24h_change.toFixed(1) : '0.0';
            const changeClass = data.usd_24h_change >= 0 ? 'text-emerald-400' : 'text-red-400';
            const dotClass = data.usd_24h_change >= 0 ? 'bg-emerald-500' : 'bg-red-500';

            row.innerHTML = `
                <div class="flex items-center gap-2">
                    <div class="w-2 h-2 rounded-full ${dotClass}"></div>
                    <span class="font-bold text-xs text-slate-200 capitalize">${displayName}</span>
                </div>
                <div class="text-right">
                    <div class="font-mono text-xs font-semibold">${price}</div>
                    <div class="text-[10px] ${changeClass} font-bold">
                        ${data.usd_24h_change >= 0 ? '+' : ''}${change}%
                    </div>
                </div>
            `;
        }
        row.onclick = () => handleSelectCoin(id, id);
        priceList.appendChild(row);
    });
}

/* ==========================================
   9. SIGNAL GENERATION FORM LOGIC
   ========================================== */
document.getElementById('btn-up').onclick = () => {
    selectedDirection = 'UP';
    document.getElementById('btn-up').className = 'flex-1 py-3.5 rounded-xl bg-emerald-500 text-white border border-emerald-500 shadow-lg transition-all';
    document.getElementById('btn-down').className = 'flex-1 py-3.5 rounded-xl bg-red-500/10 text-red-500 border border-red-500/30 transition-all';
};

document.getElementById('btn-down').onclick = () => {
    selectedDirection = 'DOWN';
    document.getElementById('btn-down').className = 'flex-1 py-3.5 rounded-xl bg-red-500 text-white border border-red-500 shadow-lg transition-all';
    document.getElementById('btn-up').className = 'flex-1 py-3.5 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 transition-all';
};

document.getElementById('prediction-form').onsubmit = (e) => {
    e.preventDefault();
    const deadlineValue = deadlineInput.value;
    const reasoning = sanitizeInput(document.getElementById('reasoning').value);

    if (!selectedAsset) return showToast("Please select a target coin first!", true);
    if (!selectedDirection) return showToast("Select trading direction: Long or Short!", true);
    if (!deadlineValue) return showToast("Please set an expiry deadline!", true);

    if (new Date(deadlineValue) <= new Date()) {
        return showToast("Expiry deadline must be set in the future!", true);
    }

    const entryPrice = currentPrices[selectedAsset.id]?.usd || 0;
    const newSignal = {
        id: Date.now(),
        user: userProfile.username,
        assetId: selectedAsset.id,
        assetSymbol: selectedAsset.symbol,
        direction: selectedDirection,
        entryPrice,
        deadline: deadlineValue,
        reason: reasoning,
        status: 'ACTIVE'
    };

    // BACKEND INTEGRATION POINT: Add custom signal insert query securely inside DB tables
    predictions.unshift(newSignal);
    userProfile.points -= 10;
    pointsDisplay.innerText = userProfile.points;
    
    showToast("Your signal is now broadcasted & active!", false, "Signal Sent");

    renderFeed();
    updateStats();
    renderLeaders();
    renderCopiedTradersDashboard();

    // Reset components UI
    e.target.reset();
    selectedAsset = null;
    selectedDirection = null;
    assetLabel.innerText = "Choose...";
    assetLabel.className = "text-sm text-slate-400";
    assetSelector.classList.remove('asset-active');
    document.getElementById('btn-up').className = 'flex-1 py-3.5 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 transition-all';
    document.getElementById('btn-down').className = 'flex-1 py-3.5 rounded-xl bg-red-500/10 text-red-500 border border-red-500/30 transition-all';
    
    initDeadlineInput();
};

/* ==========================================
   10. SIGNAL RESOLUTIONS (AUTONOMOUS CLOCK)
   ========================================== */
async function autoCheckDeadlines() {
    const now = new Date();
    const toSettle = predictions.filter(p => p.status === 'ACTIVE' && new Date(p.deadline) <= now);
    
    if (toSettle.length === 0) return;

    toSettle.forEach(p => p.status = 'SETTLING');
    renderFeed();
    
    let settledCount = 0;
    for (let p of toSettle) {
        try {
            let finalPrice = 0;
            try {
                const resp = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${p.assetId}&vs_currencies=usd`);
                const data = await resp.json();
                finalPrice = data[p.assetId].usd;
            } catch (err) {
                // Calculation fallback if API gets rate limited
                finalPrice = p.entryPrice * (1 + (Math.random() * 0.1 - 0.05));
            }
            
            const isCorrect = (p.direction === 'UP' && finalPrice > p.entryPrice) || (p.direction === 'DOWN' && finalPrice < p.entryPrice);
            
            p.status = 'SETTLED';
            p.finalPrice = finalPrice;
            p.isCorrect = isCorrect;
            p.pnl = ((finalPrice - p.entryPrice) / p.entryPrice) * 100;
            
            let pointDifference = isCorrect ? 150 : -50;
            
            // BACKEND INTEGRATION POINT: Compute securely via Server Cron Job to prevent client mutations
            if(p.user === userProfile.username) {
                userProfile.points += pointDifference;
                playAlertSound(isCorrect);
            } else if (communityUsers[p.user]) {
                communityUsers[p.user].points += pointDifference;
            }

            if (copiedTraders.includes(p.user)) {
                const statusColor = isCorrect ? "✅ TAKE PROFIT" : "❌ STOP LOSS";
                showToast(`@${p.user} resolved ${p.assetSymbol}! Result: ${statusColor}`, isCorrect ? false : true, "Signal Resolution");
            }

            settledCount++;
        } catch (e) { 
            p.status = 'ACTIVE';
        }
    }

    if (settledCount > 0) {
        showToast(`Resolved ${settledCount} active signal(s)!`, false, "Settlement Finalized");
        pointsDisplay.innerText = userProfile.points;
        renderFeed();
        updateStats();
        renderLeaders();
        renderCopiedTradersDashboard();
    }
}

/* ==========================================
   11. DATA RENDERING & RENDER PIPELINES
   ========================================== */
function renderFeed(filterUser = null) {
    const isProfileView = !!filterUser;
    const targetPreds = isProfileView ? predictions.filter(p => p.user === filterUser) : predictions;
    const container = isProfileView ? historyContainer : feedContainer;

    container.innerHTML = targetPreds.map(p => {
        let statusClass = '';
        let statusLabel = '';
        
        if (p.status === 'SETTLED') {
            statusClass = 'prediction-settled';
            statusLabel = `<span class="font-extrabold text-xs ${p.isCorrect ? 'text-emerald-400' : 'text-red-400'}">${p.isCorrect ? 'SUCCESS +150' : 'FAILED -50'}</span>`;
        } else if (p.status === 'SETTLING') {
            statusClass = 'settling-pulse';
            statusLabel = `<span class="text-[10px] text-blue-400 font-bold flex items-center gap-1"><span class="custom-loader !w-3 !h-3"></span> RESOLVING...</span>`;
        } else {
            statusClass = p.direction === 'UP' ? 'prediction-up' : 'prediction-down';
            statusLabel = `<span class="text-[10px] text-blue-400 animate-pulse font-bold">LIVE SIGNAL</span>`;
        }

        const userColor = communityUsers[p.user]?.color || 'from-blue-500 to-indigo-600';
        const isCopied = copiedTraders.includes(p.user);

        return `
            <div class="glass-card rounded-2xl p-5 border border-slate-800 transition-all ${statusClass}">
                <div class="flex justify-between items-start mb-3">
                    <div class="flex items-center gap-2 cursor-pointer group" onclick="openUserProfile('${p.user}')">
                        <div class="w-8 h-8 rounded-lg bg-gradient-to-br ${userColor} flex items-center justify-center text-[10px] shadow-lg"><i class="fa-solid fa-user"></i></div>
                        <div>
                            <h4 class="text-sm font-bold text-slate-200 group-hover:text-blue-400 transition-colors">
                                @${p.user}
                                ${isCopied ? '<span class="ml-1 text-[8px] bg-blue-500/30 text-blue-400 border border-blue-500/50 px-1.5 py-0.5 rounded font-black tracking-widest uppercase">Copied</span>' : ''}
                            </h4>
                            <p class="text-[10px] text-slate-500 uppercase font-mono">Entry: $${p.entryPrice.toLocaleString()}</p>
                        </div>
                    </div>
                    <span class="bg-slate-800 px-3 py-1 rounded-full text-[10px] font-bold text-blue-400 border border-slate-700 uppercase font-mono">${p.assetSymbol}</span>
                </div>
                <div class="mb-4">
                    <div class="flex items-center justify-between mb-2">
                        <span class="px-2 py-0.5 rounded text-[9px] font-black uppercase ${p.direction === 'UP' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}">
                            <i class="fa-solid fa-${p.direction === 'UP' ? 'arrow-trend-up' : 'arrow-trend-down'} mr-1"></i> ${p.direction === 'UP' ? 'LONG / BUY' : 'SHORT / SELL'}
                        </span>
                        ${statusLabel}
                    </div>
                    <p class="text-xs text-slate-300 italic border-l-2 border-slate-700 pl-3">${p.reason || 'No specific reasoning was provided.'}</p>
                </div>
                <div class="flex justify-between items-center pt-3 border-t border-slate-800/50">
                    <div class="flex flex-col">
                        <span class="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Expiry Deadline</span>
                        <span class="text-[10px] text-slate-400 font-mono">${new Date(p.deadline).toLocaleString()}</span>
                    </div>
                    ${p.status === 'SETTLED' ? `
                        <div class="text-right">
                            <span class="text-[9px] block text-slate-500">Exit: $${p.finalPrice.toLocaleString()}</span>
                            <span class="text-[10px] font-bold ${p.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'} font-mono">${p.pnl.toFixed(2)}%</span>
                        </div>
                    ` : `
                        <button onclick="openUserProfile('${p.user}')" class="bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border border-blue-500/20 transition-all">
                            <i class="fa-solid fa-clone mr-1"></i> Copy Trade
                        </button>
                    `}
                </div>
            </div>
        `;
    }).join('') || `<div class="text-center py-20 opacity-30"><p class="text-xs">No active signals.</p></div>`;
}

function updateStats() {
    document.getElementById('stat-assets').innerText = watchlist.length;
    document.getElementById('stat-active').innerText = predictions.filter(p => p.status === 'ACTIVE').length;
    document.getElementById('stat-settled').innerText = predictions.filter(p => p.status === 'SETTLED').length;
}

function renderLeaders() {
    const list = Object.values(communityUsers).concat([userProfile]).sort((a,b) => b.points - a.points);
    document.getElementById('leaderboard').innerHTML = list.map((u, i) => {
        const wr = getUserWinRate(u.username);
        const isMyRank = u.username === userProfile.username;
        const isCopied = copiedTraders.includes(u.username);
        
        return `
            <div onclick="openUserProfile('${u.username}')" class="flex justify-between items-center p-3 rounded-xl cursor-pointer hover:bg-slate-700/50 transition-all ${isMyRank ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-slate-800/20 border border-slate-800/40'}">
                <div class="flex items-center gap-2">
                    <span class="text-[10px] text-slate-500 font-bold">#${i + 1}</span>
                    <div class="flex flex-col">
                        <span class="text-xs font-bold ${isMyRank ? 'text-blue-400' : 'text-slate-200'}">
                            @${u.username}
                            ${isCopied ? ' 👥' : ''}
                        </span>
                        <span class="text-[9px] text-emerald-400 font-bold font-mono">Win Rate: ${wr}%</span>
                    </div>
                </div>
                <div class="text-right">
                    <span class="text-xs font-black text-yellow-500 font-mono">${u.points}</span>
                    <span class="block text-[8px] text-slate-500 uppercase font-black">Points</span>
                </div>
            </div>
        `;
    }).join('');
}

/* ==========================================
   12. PLATFORM INTERVAL TIMER & STARTUP
   ========================================== */
setInterval(() => {
    refreshSecs--;
    if (refreshSecs <= 0) { 
        fetchMarketData(); 
        refreshSecs = 30; 
    }
    document.getElementById('refresh-timer').innerText = `${refreshSecs}s`;
    document.getElementById('timer-progress').style.width = `${(refreshSecs / 30) * 100}%`;
    autoCheckDeadlines();
}, 1000);

window.onload = () => {
    fetchMarketData();
    renderLeaders();
    initDeadlineInput();
    renderFeed();
    renderCopiedTradersDashboard();
    document.getElementById('nav-username').innerText = userProfile.username;
};
