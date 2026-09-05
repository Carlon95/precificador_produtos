const $ = (id) => document.getElementById(id);
const money = (v) => new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(Number.isFinite(v) ? v : 0);
const pct = (v) => `${((Number.isFinite(v) ? v : 0) * 100).toFixed(1).replace('.', ',')}%`;
const num = (id) => Math.max(0, parseFloat($(id).value) || 0);
const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

const DEFAULTS = {
  filamento: 89, energia: 1, potencia: 120, maoObra: 15, depreciacao: 1.5,
  refugo: 8, embalagem: 2.5, outrosPadrao: 0, impostos: 0, ads: 0,
  perdas: 2, margem: 25, tipoVendedor: 'CNPJ'
};
const CONFIG_IDS = Object.keys(DEFAULTS);
const PRODUCT_IDS = ['sku','produto','peso','tempo','pos','frete','preco','outrosProduto'];

function getConfig() {
  return {
    filamento: num('filamento'), energia: num('energia'), potencia: num('potencia'),
    maoObra: num('maoObra'), depreciacao: num('depreciacao'), refugo: num('refugo')/100,
    embalagem: num('embalagem'), outrosPadrao: num('outrosPadrao'), impostos: num('impostos')/100,
    ads: num('ads')/100, perdas: num('perdas')/100, margem: num('margem')/100,
    tipoVendedor: $('tipoVendedor').value
  };
}
function getProduct() {
  return {
    sku: $('sku').value.trim(), produto: $('produto').value.trim(), peso: num('peso'),
    tempo: num('tempo'), pos: num('pos'), frete: num('frete'), preco: num('preco'),
    outrosProduto: num('outrosProduto')
  };
}
function feeParts(preco, tipoVendedor) {
  if (!preco) return { commissionRate:0, commission:0, base:0, cpf:0, total:0 };
  const commissionRate = preco < 80 ? 0.20 : 0.14;
  const commission = r2(preco * commissionRate);
  const base = r2(preco < 8 ? preco * 0.50 : preco < 80 ? 4 : preco < 100 ? 16 : preco < 200 ? 20 : 26);
  const cpf = r2(tipoVendedor === 'CPF_HV' ? (preco < 12 ? preco * 0.25 : 3) : 0);
  // A planilha arredonda o total da Shopee depois de somar comissão + tarifa + adicional.
  const total = r2(preco * commissionRate + base + cpf);
  return { commissionRate, commission, base, cpf, total };
}
function costParts(p, c) {
  // Mesmos pontos de arredondamento da planilha XLSX.
  const material = r2(p.peso / 1000 * c.filamento);
  const energia = r2(p.tempo * (c.potencia/1000) * c.energia);
  const manutencao = r2(p.tempo * c.depreciacao);
  const maoObra = r2(p.pos / 60 * c.maoObra);
  const fabricacao = r2(material + energia + manutencao + maoObra);
  const total = r2(fabricacao * (1 + c.refugo) + c.embalagem + c.outrosPadrao + p.outrosProduto + p.frete);
  return { material, energia, manutencao, maoObra, fabricacao, total };
}
function evaluateAtPrice(preco, cost, c) {
  const fees = feeParts(preco, c.tipoVendedor);
  const imposto = r2(preco * c.impostos);
  const ads = r2(preco * c.ads);
  const perdas = r2(preco * c.perdas);
  const variaveis = r2(imposto + ads + perdas);
  const lucro = r2(preco - cost.total - fees.total - imposto - ads - perdas);
  const margem = preco > 0 ? lucro / preco : 0;
  return { fees, imposto, ads, perdas, variaveis, lucro, margem };
}

// Reproduz a lógica por faixas da planilha em vez de usar aproximação iterativa.
function suggestedPrice(cost, c) {
  const variableTotal = c.impostos + c.ads + c.perdas + c.margem;
  const hv = c.tipoVendedor === 'CPF_HV';
  const INF = 999999;
  const candidates = [];
  const valid = (x, min, max) => Number.isFinite(x) && x >= min && x < max ? x : INF;
  const denominator = (commission, cpfPercent=0) => 1 - commission - cpfPercent - variableTotal;

  let d = denominator(.20, hv ? .25 : 0);
  if (d > 0) candidates.push(valid(cost.total / d, 0, 8)); else candidates.push(INF);

  if (hv) {
    d = denominator(.20, .25);
    if (d > 0) candidates.push(valid(Math.max(8, (cost.total + 4) / d), 8, 12)); else candidates.push(INF);
  } else candidates.push(INF);

  d = denominator(.20, 0);
  if (d > 0) {
    const floor = hv ? 12 : 8;
    candidates.push(valid(Math.max(floor, (cost.total + 4 + (hv ? 3 : 0)) / d), floor, 80));
  } else candidates.push(INF);

  d = denominator(.14, 0);
  if (d > 0) candidates.push(valid(Math.max(80, (cost.total + 16 + (hv ? 3 : 0))/d), 80, 100)); else candidates.push(INF);
  if (d > 0) candidates.push(valid(Math.max(100, (cost.total + 20 + (hv ? 3 : 0))/d), 100, 200)); else candidates.push(INF);
  if (d > 0) candidates.push(Math.max(200, (cost.total + 26 + (hv ? 3 : 0))/d)); else candidates.push(INF);

  const price = Math.min(...candidates);
  return price >= INF ? 0 : price;
}

function calculate() {
  const p = getProduct();
  const c = getConfig();
  const cost = costParts(p,c);
  const current = evaluateAtPrice(p.preco, cost, c);
  const suggested = suggestedPrice(cost,c);
  const sugResult = evaluateAtPrice(suggested, cost, c);

  $('kpiCusto').textContent = money(cost.total);
  $('kpiTaxas').textContent = money(current.fees.total);
  $('kpiTaxaEfetiva').textContent = `${pct(p.preco ? current.fees.total/p.preco : 0)} do preço`;
  $('kpiLucro').textContent = money(current.lucro);
  $('kpiMargem').textContent = `${pct(current.margem)} de margem`;
  $('kpiSugerido').textContent = suggested ? money(suggested) : '—';
  $('kpiMeta').textContent = `meta: ${pct(c.margem)} líquida`;

  $('bMaterial').textContent = money(cost.material);
  $('bEnergia').textContent = money(cost.energia);
  $('bManutencao').textContent = money(cost.manutencao);
  $('bMaoObra').textContent = money(cost.maoObra);
  $('bExtras').textContent = money(cost.total - cost.material - cost.energia - cost.manutencao - cost.maoObra);
  $('bTotal').textContent = money(cost.total);

  $('rPreco').textContent = money(p.preco);
  $('rCusto').textContent = money(cost.total);
  $('rComissao').textContent = money(current.fees.commission);
  $('rTarifa').textContent = money(current.fees.base);
  $('rCpf').textContent = money(current.fees.cpf);
  $('rVariaveis').textContent = money(current.variaveis);
  $('rLucro').textContent = money(current.lucro);
  $('rMargem').textContent = pct(current.margem);

  const status = $('statusProduto');
  status.className = 'status-pill';
  const rec = $('recommendation');
  rec.className = 'recommendation';
  if (!p.preco) {
    status.textContent = 'INFORME O PREÇO'; status.classList.add('neutral');
    rec.textContent = `Preço mínimo sugerido para atingir ${pct(c.margem)} de margem líquida: ${suggested ? money(suggested) : 'não calculável com as premissas atuais'}.`;
  } else if (current.lucro < 0) {
    status.textContent = 'PREJUÍZO'; status.classList.add('bad'); rec.classList.add('bad');
    rec.textContent = `Neste preço, você perde ${money(Math.abs(current.lucro))} por unidade. O preço sugerido é ${money(suggested)}.`;
  } else if (current.margem + 1e-8 < c.margem) {
    status.textContent = 'ABAIXO DA META'; status.classList.add('warn'); rec.classList.add('warn');
    rec.textContent = `A venda dá lucro, mas a margem de ${pct(current.margem)} está abaixo da meta de ${pct(c.margem)}. Sugestão: ${money(suggested)}.`;
  } else {
    status.textContent = 'OK'; status.classList.add('ok'); rec.classList.add('ok');
    const diff = p.preco - suggested;
    rec.textContent = diff > .01 ? `Preço atual supera o mínimo calculado em ${money(diff)} e atende à meta de margem.` : `Preço atual atende à meta de ${pct(c.margem)} de margem líquida.`;
  }

  saveState();
  return { p,c,cost,current,suggested,sugResult, status:status.textContent };
}

function saveState(){
  const data = { config:{}, product:{} };
  CONFIG_IDS.forEach(id => data.config[id] = $(id).value);
  PRODUCT_IDS.forEach(id => data.product[id] = $(id).value);
  localStorage.setItem('voltex-precificador-state', JSON.stringify(data));
}
function loadState(){
  try {
    const data = JSON.parse(localStorage.getItem('voltex-precificador-state') || 'null');
    if (!data) return;
    Object.entries(data.config || {}).forEach(([id,v]) => { if ($(id)) $(id).value=v; });
    Object.entries(data.product || {}).forEach(([id,v]) => { if ($(id)) $(id).value=v; });
  } catch(e) {}
}
function resetConfig(){
  Object.entries(DEFAULTS).forEach(([id,v]) => $(id).value = v);
  calculate();
}

function products(){ try { return JSON.parse(localStorage.getItem('voltex-products') || '[]'); } catch(e) { return []; } }
function setProducts(list){ localStorage.setItem('voltex-products', JSON.stringify(list)); renderProducts(); }
function saveProduct(){
  const r = calculate();
  if (!r.p.produto) { alert('Informe o nome do produto.'); return; }
  const sku = r.p.sku || `3D-${Date.now().toString().slice(-5)}`;
  const row = { sku, produto:r.p.produto, inputs:r.p, config:r.c, metrics:{ custo:r.cost.total, taxas:r.current.fees.total, lucro:r.current.lucro, margem:r.current.margem, sugerido:r.suggested, preco:r.p.preco, status:r.status } };
  const list = products();
  const idx = list.findIndex(x => x.sku === sku);
  if (idx >= 0) list[idx] = row; else list.unshift(row);
  setProducts(list);
}
function editProduct(idx){
  const row = products()[idx]; if (!row) return;
  Object.entries(row.inputs || {}).forEach(([k,v]) => { if ($(k)) $(k).value=v; });
  Object.entries(row.config || {}).forEach(([k,v]) => { if ($(k)) $(k).value = ['refugo','impostos','ads','perdas','margem'].includes(k) ? v*100 : v; });
  $('tipoVendedor').value = row.config?.tipoVendedor || 'CNPJ';
  calculate(); window.scrollTo({top:0,behavior:'smooth'});
}
function deleteProduct(idx){ const list=products(); list.splice(idx,1); setProducts(list); }
function renderProducts(){
  const list = products(); const tbody = $('productsTable').querySelector('tbody'); tbody.innerHTML='';
  $('emptyProducts').style.display = list.length ? 'none' : 'block';
  list.forEach((r,i) => {
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(r.sku)}</td><td>${escapeHtml(r.produto)}</td><td>${money(r.metrics.preco)}</td><td>${money(r.metrics.custo)}</td><td>${money(r.metrics.taxas)}</td><td>${money(r.metrics.lucro)}</td><td>${pct(r.metrics.margem)}</td><td>${money(r.metrics.sugerido)}</td><td>${escapeHtml(r.metrics.status)}</td><td><button class="row-btn" data-edit="${i}">Editar</button><button class="row-btn delete" data-delete="${i}">Excluir</button></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>editProduct(+b.dataset.edit)));
  tbody.querySelectorAll('[data-delete]').forEach(b=>b.addEventListener('click',()=>deleteProduct(+b.dataset.delete)));
}
function escapeHtml(s=''){ return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

function exportData(){
  const data = { exportedAt:new Date().toISOString(), state:JSON.parse(localStorage.getItem('voltex-precificador-state')||'{}'), products:products() };
  const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='voltex-precificador-backup.json'; a.click(); URL.revokeObjectURL(a.href);
}
function importData(file){
  const reader=new FileReader(); reader.onload=()=>{ try { const data=JSON.parse(reader.result); if(data.state)localStorage.setItem('voltex-precificador-state',JSON.stringify(data.state)); if(Array.isArray(data.products))localStorage.setItem('voltex-products',JSON.stringify(data.products)); location.reload(); } catch(e){ alert('Arquivo de backup inválido.'); } }; reader.readAsText(file);
}
function resetAll(){ if(confirm('Apagar configurações e produtos salvos neste navegador?')){ localStorage.removeItem('voltex-precificador-state'); localStorage.removeItem('voltex-products'); location.reload(); } }

[...CONFIG_IDS,...PRODUCT_IDS].forEach(id => { const el=$(id); if(el) el.addEventListener('input',calculate); });
$('tipoVendedor').addEventListener('change',calculate);
$('btnPadrao').addEventListener('click',resetConfig);
$('btnAplicarSugerido').addEventListener('click',()=>{ const r=calculate(); if(r.suggested){ $('preco').value=r.suggested.toFixed(2); calculate(); } });
$('btnSalvarProduto').addEventListener('click',saveProduct);
$('btnExportar').addEventListener('click',exportData);
$('btnImportar').addEventListener('click',()=>$('inputImportar').click());
$('inputImportar').addEventListener('change',e=>{ if(e.target.files[0]) importData(e.target.files[0]); });
$('btnResetar').addEventListener('click',resetAll);

loadState(); calculate(); renderProducts();

// Exposto apenas para testes locais.
window.__pricing = { feeParts, costParts, evaluateAtPrice, suggestedPrice };


// ---------- Calculadora integrada ----------
const calcState = {
  current: '0',
  stored: null,
  operator: null,
  waiting: false,
  error: false
};

const calcSymbols = { '+': '+', '-': '−', '*': '×', '/': '÷' };

function calcFormatValue(value) {
  if (!Number.isFinite(value)) return 'Erro';
  const abs = Math.abs(value);
  if ((abs >= 1e12 || (abs > 0 && abs < 1e-8))) {
    return value.toExponential(8).replace('.', ',');
  }
  const rounded = Math.round((value + Number.EPSILON) * 1e10) / 1e10;
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 10,
    useGrouping: true
  }).format(rounded);
}

function calcNumber() {
  const n = Number(calcState.current);
  return Number.isFinite(n) ? n : 0;
}

function calcRender(historyText) {
  $('calcDisplay').textContent = calcState.error ? 'Erro' : calcFormatValue(calcNumber());
  if (typeof historyText === 'string') $('calcHistory').textContent = historyText;
}

function calcReset() {
  calcState.current = '0';
  calcState.stored = null;
  calcState.operator = null;
  calcState.waiting = false;
  calcState.error = false;
  calcRender('Pronta para calcular');
}

function calcStartFreshIfError() {
  if (!calcState.error) return;
  calcReset();
}

function calcInputDigit(digit) {
  calcStartFreshIfError();
  if (calcState.waiting) {
    calcState.current = digit;
    calcState.waiting = false;
  } else if (calcState.current === '0') {
    calcState.current = digit;
  } else if (calcState.current.length < 16) {
    calcState.current += digit;
  }
  calcRender();
}

function calcDecimal() {
  calcStartFreshIfError();
  if (calcState.waiting) {
    calcState.current = '0.';
    calcState.waiting = false;
  } else if (!calcState.current.includes('.')) {
    calcState.current += '.';
  }
  calcRender();
}

function calcCompute(a, b, op) {
  if (op === '+') return a + b;
  if (op === '-') return a - b;
  if (op === '*') return a * b;
  if (op === '/') return b === 0 ? NaN : a / b;
  return b;
}

function calcChooseOperator(nextOperator) {
  calcStartFreshIfError();
  const input = calcNumber();

  if (calcState.operator && calcState.waiting) {
    calcState.operator = nextOperator;
    calcRender(`${calcFormatValue(calcState.stored)} ${calcSymbols[nextOperator]}`);
    return;
  }

  if (calcState.stored === null) {
    calcState.stored = input;
  } else if (calcState.operator) {
    const result = calcCompute(calcState.stored, input, calcState.operator);
    if (!Number.isFinite(result)) {
      calcState.error = true;
      calcRender('Não é possível dividir por zero');
      return;
    }
    calcState.stored = result;
    calcState.current = String(result);
  }

  calcState.operator = nextOperator;
  calcState.waiting = true;
  calcRender(`${calcFormatValue(calcState.stored)} ${calcSymbols[nextOperator]}`);
}

function calcEquals() {
  if (calcState.error || calcState.operator === null || calcState.stored === null) return;
  const b = calcNumber();
  const a = calcState.stored;
  const op = calcState.operator;
  const result = calcCompute(a, b, op);

  if (!Number.isFinite(result)) {
    calcState.error = true;
    calcRender('Não é possível dividir por zero');
    return;
  }

  calcState.current = String(result);
  calcState.stored = null;
  calcState.operator = null;
  calcState.waiting = true;
  calcRender(`${calcFormatValue(a)} ${calcSymbols[op]} ${calcFormatValue(b)} =`);
}

function calcPercent() {
  calcStartFreshIfError();
  calcState.current = String(calcNumber() / 100);
  calcState.waiting = false;
  calcRender('Percentual convertido para decimal');
}

function calcToggleSign() {
  calcStartFreshIfError();
  calcState.current = String(calcNumber() * -1);
  calcRender();
}

function calcBackspace() {
  calcStartFreshIfError();
  if (calcState.waiting) return;
  const negative = calcState.current.startsWith('-');
  const raw = negative ? calcState.current.slice(1) : calcState.current;
  if (raw.length <= 1) calcState.current = '0';
  else calcState.current = (negative ? '-' : '') + raw.slice(0, -1);
  if (calcState.current === '-0') calcState.current = '0';
  calcRender();
}

function calcOpen() {
  $('calcOverlay').hidden = false;
  document.body.classList.add('calc-open');
  $('calcApplyStatus').className = 'calculator-note';
  $('calcApplyStatus').textContent = 'Você também pode usar o teclado: números, +, −, ×, ÷, Enter, Backspace e Esc.';
  setTimeout(() => $('btnFecharCalculadora').focus(), 0);
}

function calcClose() {
  $('calcOverlay').hidden = true;
  document.body.classList.remove('calc-open');
}

function calcApplyResult() {
  if (calcState.error) return;
  const targetId = $('calcTarget').value;
  const target = $(targetId);
  const value = calcNumber();

  if (!target || !Number.isFinite(value)) {
    $('calcApplyStatus').className = 'calculator-note error';
    $('calcApplyStatus').textContent = 'Não foi possível aplicar este resultado.';
    return;
  }

  const step = target.getAttribute('step') || '0.01';
  const decimals = step.includes('.') ? step.split('.')[1].length : 0;
  target.value = value.toFixed(Math.min(decimals, 6));
  target.dispatchEvent(new Event('input', { bubbles:true }));
  calculate();

  const option = $('calcTarget').selectedOptions[0];
  $('calcApplyStatus').className = 'calculator-note success';
  $('calcApplyStatus').textContent = `Resultado aplicado em “${option ? option.textContent : targetId}”.`;
}

$('btnCalculadora').addEventListener('click', calcOpen);
$('btnCalculadoraMobile').addEventListener('click', calcOpen);
$('btnFecharCalculadora').addEventListener('click', calcClose);
$('btnAplicarCalculadora').addEventListener('click', calcApplyResult);
$('calcOverlay').addEventListener('click', (event) => {
  if (event.target === $('calcOverlay')) calcClose();
});

$('calcKeypad').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;

  if (button.dataset.digit !== undefined) {
    calcInputDigit(button.dataset.digit);
    return;
  }
  if (button.dataset.operator) {
    calcChooseOperator(button.dataset.operator);
    return;
  }

  const action = button.dataset.action;
  if (action === 'clear') calcReset();
  else if (action === 'backspace') calcBackspace();
  else if (action === 'percent') calcPercent();
  else if (action === 'sign') calcToggleSign();
  else if (action === 'decimal') calcDecimal();
  else if (action === 'equals') calcEquals();
});

document.addEventListener('keydown', (event) => {
  if ($('calcOverlay').hidden) return;

  const key = event.key;
  if (/^\d$/.test(key)) {
    event.preventDefault();
    calcInputDigit(key);
  } else if (key === '.' || key === ',') {
    event.preventDefault();
    calcDecimal();
  } else if (['+', '-', '*', '/'].includes(key)) {
    event.preventDefault();
    calcChooseOperator(key);
  } else if (key === 'Enter' || key === '=') {
    event.preventDefault();
    calcEquals();
  } else if (key === 'Backspace') {
    event.preventDefault();
    calcBackspace();
  } else if (key === 'Escape') {
    event.preventDefault();
    calcClose();
  } else if (key === '%') {
    event.preventDefault();
    calcPercent();
  } else if (key.toLowerCase() === 'c') {
    event.preventDefault();
    calcReset();
  }
});

calcReset();
