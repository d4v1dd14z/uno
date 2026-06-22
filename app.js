/* ====================== CONFIG ====================== */
const DEFAULT_SERVER = (location.protocol === 'https:')
  ? 'wss://CAMBIA-ESTO.onrender.com'
  : 'ws://localhost:3000';
let SERVER_URL = localStorage.getItem('uno_server') || DEFAULT_SERVER;
/* ====================== STATE ====================== */
let ws = null;
let myName = '';
let currentHand = [];
let topCard = null;
let isMyTurn = false;
let pendingComodinIndex = null;
/* ====================== HELPERS ====================== */
const $ = (id) => document.getElementById(id);
const colorMap = { Rojo: 'Red', Amarillo: 'Yellow', Verde: 'Green', Azul: 'Blue', 'Comodín': 'Wild' };
const valueMap = {
  '0':'Zero','1':'One','2':'Two','3':'Three','4':'Four','5':'Five',
  '6':'Six','7':'Seven','8':'Eight','9':'Nine',
  'Bloqueo':'SkipTurn','CambioSentido':'Reverse','+2':'DrawTwo',
  '+4':'DrawFour','CambiaColor':'ChangeColor'
};
function cardImage(card) {
  if (!card) return '';
  if (card.value === '+4' || card.value === 'CambiaColor' || card.isComodinReal && (card.value === '+4' || card.value === 'CambiaColor')) {
    if (card.value === '+4') return 'assets/Wild_DrawFour.png';
    if (card.value === 'CambiaColor') return 'assets/Wild_ChangeColor.png';
  }
  const c = colorMap[card.color] || 'Wild';
  const v = valueMap[card.value] || card.value;
  return `assets/${c}_${v}.png`;
}
function renderCard(card) {
  if (!card) return '';
  return `<img src="${cardImage(card)}" alt="${card.color} ${card.value}" onerror="this.style.display='none'"/>`;
}
function isPlayable(card, top) {
  if (!card || !top) return false;
  if (card.color === 'Comodín') return true;
  return card.color === top.color || card.value === top.value;
}
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}
/* ====================== WS CONNECTION ====================== */
function connect() {
  $('lobby-status').textContent = `Conectando a ${SERVER_URL}...`;
  try { ws = new WebSocket(SERVER_URL); }
  catch (e) { $('lobby-status').textContent = 'URL inválida'; return; }
  ws.onopen = () => {
    $('lobby-status').textContent = 'Conectado. Enviando nickname...';
    ws.send(JSON.stringify({ type: 'joinGame', data: myName }));
  };
  ws.onmessage = (ev) => {
    const { type, data } = JSON.parse(ev.data);
    handleMessage(type, data);
  };
  ws.onclose = () => {
    $('lobby-status').textContent = 'Desconectado del servidor.';
  };
  ws.onerror = () => {
    $('lobby-status').textContent = 'Error de conexión. Verifica la URL del servidor.';
  };
}
/* ====================== EVENTS FROM SERVER ====================== */
function handleMessage(type, data) {
  switch (type) {
    case 'waitingRoom': {
      const ul = $('waiting-list');
      ul.innerHTML = data.map(n => `<li>👤 ${n}</li>`).join('');
      $('lobby-status').textContent = `En sala: ${data.length}/4. Esperando jugadores...`;
      break;
    }
    case 'gameState': {
      showScreen('screen-game');
      currentHand = data.hand;
      topCard = data.topCard;
      isMyTurn = data.isMyTurn;
      $('my-name').textContent = myName;
      $('hand-count').textContent = currentHand.length;
      $('direction').textContent = data.direction.includes('Derecha') ? '➡️' : '⬅️';
      const tb = $('turn-badge');
      tb.textContent = `Turno: ${data.currentTurnName}`;
      tb.classList.toggle('mine', isMyTurn);
      $('log').textContent = data.log || '';
      $('top-card').innerHTML = renderCard(topCard);
      $('btn-draw').disabled = !isMyTurn || data.isPaused;
      $('uno-status').style.display = data.dijoUno ? 'inline' : 'none';
      $('btn-uno').style.display = (currentHand.length === 1 && !data.dijoUno && data.mostrarBotoneraUno) ? 'inline-block' : 'none';
      $('btn-corte').style.display = data.mostrarBotoneraUno ? 'inline-block' : 'none';
      renderHand();
      break;
    }
    case 'showPopup':
      openModal('¡Atención!', data, [{ label: 'Aceptar', action: () => { ws.send(JSON.stringify({ type: 'resolvePopup' })); closeModal(); } }]);
      break;
    case 'errorMsg':
      openModal('Error', data, [{ label: 'OK', action: closeModal }]);
      break;
    case 'gameOver':
      openModal('Fin del Juego', data, [{ label: 'Volver al Lobby', action: () => { closeModal(); location.reload(); } }]);
      break;
  }
}
/* ====================== HAND RENDER ====================== */
function renderHand() {
  const hand = $('hand');
  hand.innerHTML = '';
  currentHand.forEach((card, idx) => {
    const div = document.createElement('div');
    div.className = 'card';
    const playable = isMyTurn && isPlayable(card, topCard);
    div.classList.add(playable ? 'playable' : 'disabled');
    div.innerHTML = renderCard(card);
    div.onclick = () => playable && onPlayCard(idx, card);
    hand.appendChild(div);
  });
}
/* ====================== ACTIONS ====================== */
function onPlayCard(idx, card) {
  if (card.color === 'Comodín') {
    pendingComodinIndex = idx;
    openModal('Elige un color', '', ['Rojo', 'Amarillo', 'Verde', 'Azul'].map(c => ({
      el: `<button class="color-btn" data-color="${c}" title="${c}"></button>`,
      action: () => sendPlay(idx, c),
    })));
  } else {
    sendPlay(idx, null);
  }
}
function sendPlay(index, chosenColor) {
  ws.send(JSON.stringify({ type: 'playCard', data: { index, chosenColor } }));
  closeModal();
}
/* ====================== MODAL ====================== */
function openModal(title, text, actions) {
  $('modal-title').textContent = title;
  $('modal-text').textContent = text;
  const wrap = $('modal-actions');
  wrap.innerHTML = '';
  actions.forEach(a => {
    if (a.el) {
      wrap.insertAdjacentHTML('beforeend', a.el);
      wrap.lastElementChild.onclick = a.action;
    } else {
      const b = document.createElement('button');
      b.className = 'btn-primary';
      b.style.width = 'auto';
      b.textContent = a.label;
      b.onclick = a.action;
      wrap.appendChild(b);
    }
  });
  $('modal-bg').classList.add('open');
}
function closeModal() { $('modal-bg').classList.remove('open'); }
/* ====================== UI BINDINGS ====================== */
$('input-server').value = SERVER_URL;
$('btn-save-server').onclick = () => {
  SERVER_URL = $('input-server').value.trim();
  localStorage.setItem('uno_server', SERVER_URL);
  $('lobby-status').textContent = 'Servidor guardado: ' + SERVER_URL;
};
$('btn-join').onclick = () => {
  const name = $('input-name').value.trim();
  if (!name) return alert('Ingresa un nickname');
  myName = name;
  $('btn-join').disabled = true;
  connect();
};
$('input-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-join').click(); });
$('btn-draw').onclick = () => ws && ws.send(JSON.stringify({ type: 'drawCard' }));
$('btn-uno').onclick = () => ws && ws.send(JSON.stringify({ type: 'cantarUno' }));
$('btn-corte').onclick = () => ws && ws.send(JSON.stringify({ type: 'cantarCorte' }));
