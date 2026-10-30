/**
 * Chemical Finance — backend (Google Apps Script + Google Sheets).
 *
 * Toda chamada traz um ID token do Google (login no app). O script confere com o Google
 * se o token é válido, se foi emitido para o SEU Client ID e se o e-mail é o autorizado.
 * Sem isso, nada é lido nem gravado.
 *
 * Instalação: veja o README do projeto. Resumo:
 *   1. Crie uma planilha vazia > Extensões > Apps Script > cole este arquivo.
 *   2. Em "Configurações do projeto" > Propriedades do script, crie:
 *        CLIENT_ID      = <seu OAuth Client ID>.apps.googleusercontent.com
 *        EMAIL_LIBERADO = seu.email@gmail.com
 *   3. Rode a função `prepararPlanilha` uma vez (cria as abas).
 *   4. Implantar > Nova implantação > App da Web: Executar como "Eu", Acesso "Qualquer pessoa".
 */

var VERSAO = '1.0.0';

var TABELAS = {
  lancamentos: ['id', 'tipo', 'desc', 'valor', 'data', 'mes', 'categoria', 'origem', 'natureza', 'recorrente', 'fimMes', 'parcelas', 'antigo', 'padrao', 'ajustes', 'chave', 'importId', 'obs', 'alertaVisto', 'criadoEm', 'editadoEm'],
  categorias: ['id', 'nome', 'simbolo', 'numero', 'cor', 'ativa'],
  orcamento: ['id', 'categoria', 'desde', 'valor'],
  regras: ['id', 'contem', 'categoria', 'natureza', 'recorrente', 'criadaEm', 'usos'],
  salario: ['id', 'desde', 'liquido', 'obs'],
  importacoes: ['id', 'vencimento', 'arquivo', 'linhas', 'novas', 'duplicadas', 'total', 'pagamentoAnterior', 'conferenciaAnterior', 'criados', 'ajustes', 'status', 'em'],
  plano: ['id', 'data', 'titulo', 'tipo', 'feito'],
  caixinha: ['id', 'data', 'saldo', 'obs'],
  patrimonio: ['id', 'mes', 'produto', 'classe', 'saldo'],
  dividas: ['id', 'mes', 'nome', 'saldo', 'parcela', 'restantes', 'fim'],
  config: ['id', 'valor'],
};
// Colunas guardadas como JSON (objetos e listas).
var JSON_COLS = { ajustes: 1, criados: 1 };
var NUM_COLS = { valor: 1, parcelas: 1, numero: 1, liquido: 1, saldo: 1, parcela: 1, restantes: 1, linhas: 1, novas: 1, duplicadas: 1, total: 1, usos: 1 };
var BOOL_COLS = { recorrente: 1, antigo: 1, ativa: 1, feito: 1, alertaVisto: 1 };

// ---------- HTTP ----------
function doGet() {
  return json_({ ok: true, app: 'chemical-finance', versao: VERSAO });
}

function doPost(e) {
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var email = autenticar_(req.token);
    var r = executar_(req, email);
    return json_({ ok: true, dados: r });
  } catch (err) {
    return json_({ ok: false, erro: String(err && err.message || err), codigo: err && err.codigo || 'erro' });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function erro_(msg, codigo) { var e = new Error(msg); e.codigo = codigo; return e; }

// ---------- autenticação ----------
function autenticar_(token) {
  if (!token) throw erro_('Faça login com o Google.', 'sem_login');
  var props = PropertiesService.getScriptProperties();
  var clientId = props.getProperty('CLIENT_ID');
  var liberado = String(props.getProperty('EMAIL_LIBERADO') || '').toLowerCase().trim();
  if (!clientId || !liberado) throw erro_('Backend sem CLIENT_ID ou EMAIL_LIBERADO nas propriedades do script.', 'sem_config');

  var cache = CacheService.getScriptCache();
  var chaveCache = 'tok_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token));
  var emCache = cache.get(chaveCache);
  if (emCache) return emCache;

  var resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) throw erro_('Login expirado. Entre de novo.', 'token_invalido');
  var info = JSON.parse(resp.getContentText());
  var agora = Math.floor(Date.now() / 1000);
  if (info.aud !== clientId) throw erro_('Token emitido para outro aplicativo.', 'token_invalido');
  if (String(info.email_verified) !== 'true') throw erro_('E-mail do Google não verificado.', 'token_invalido');
  if (Number(info.exp) <= agora) throw erro_('Login expirado. Entre de novo.', 'token_invalido');
  var email = String(info.email || '').toLowerCase();
  if (email !== liberado) throw erro_('Esta conta não tem acesso a este Chemical Finance.', 'sem_acesso');

  var ttl = Math.max(1, Math.min(300, Number(info.exp) - agora - 30));
  cache.put(chaveCache, email, ttl);
  return email;
}

// ---------- ações ----------
function executar_(req, email) {
  var acao = req.acao;
  if (acao === 'ping') return { email: email, versao: VERSAO };
  if (acao === 'carregar') return carregarTudo_();
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (acao === 'lote') {
      var res = [];
      (req.ops || []).forEach(function (op) { res.push(operar_(op)); });
      SpreadsheetApp.flush();
      return { ops: res.length };
    }
    var r = operar_(req);
    SpreadsheetApp.flush();
    return r;
  } finally {
    lock.releaseLock();
  }
}

function operar_(op) {
  var t = op.tabela;
  if (!TABELAS[t]) throw erro_('Tabela desconhecida: ' + t, 'tabela');
  if (op.acao === 'salvar') return salvar_(t, op.linhas || []);
  if (op.acao === 'excluir') return excluir_(t, op.ids || []);
  throw erro_('Ação desconhecida: ' + op.acao, 'acao');
}

function aba_(t) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(t);
  if (!sh) {
    sh = ss.insertSheet(t);
    sh.getRange(1, 1, 1, TABELAS[t].length).setValues([TABELAS[t]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  // Garante colunas novas no fim (atualizações do app).
  var cab = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0];
  var faltam = TABELAS[t].filter(function (c) { return cab.indexOf(c) < 0; });
  if (faltam.length) sh.getRange(1, cab.filter(String).length + 1, 1, faltam.length).setValues([faltam]).setFontWeight('bold');
  return sh;
}

function cabecalho_(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
}

function paraCelula_(t, col, v) {
  if (v === undefined || v === null) return '';
  if (JSON_COLS[col] || (t === 'config' && col === 'valor') || typeof v === 'object') return JSON.stringify(v);
  return v;
}

function daCelula_(t, col, v) {
  if (v === '' || v === null) return (BOOL_COLS[col] ? false : (JSON_COLS[col] ? null : ''));
  if (JSON_COLS[col] || (t === 'config' && col === 'valor')) { try { return JSON.parse(v); } catch (e) { return v; } }
  if (BOOL_COLS[col]) return v === true || v === 'TRUE' || v === 'true';
  if (NUM_COLS[col] && t !== 'config') return Number(v);
  if (v instanceof Date) return Utilities.formatDate(v, 'UTC', 'yyyy-MM-dd');
  return v;
}

function lerTabela_(t) {
  var sh = aba_(t);
  var n = sh.getLastRow() - 1;
  if (n < 1) return [];
  var cab = cabecalho_(sh);
  var vals = sh.getRange(2, 1, n, cab.length).getValues();
  return vals.filter(function (r) { return r[0] !== ''; }).map(function (r) {
    var o = {};
    cab.forEach(function (c, i) { if (c) o[c] = daCelula_(t, c, r[i]); });
    return o;
  });
}

function carregarTudo_() {
  var out = {};
  Object.keys(TABELAS).forEach(function (t) { out[t] = lerTabela_(t); });
  return out;
}

function salvar_(t, linhas) {
  if (!linhas.length) return { salvos: 0 };
  var sh = aba_(t);
  var cab = cabecalho_(sh);
  var n = Math.max(0, sh.getLastRow() - 1);
  var ids = n ? sh.getRange(2, 1, n, 1).getValues().map(function (r) { return String(r[0]); }) : [];
  var pos = {}; ids.forEach(function (id, i) { pos[id] = i + 2; });
  var novas = [];
  linhas.forEach(function (o) {
    if (!o.id) throw erro_('Linha sem id em ' + t, 'sem_id');
    var row = cab.map(function (c) { return paraCelula_(t, c, o[c]); });
    var p = pos[String(o.id)];
    if (p) sh.getRange(p, 1, 1, row.length).setNumberFormat('@').setValues([row]);
    else novas.push(row);
  });
  if (novas.length) {
    var inicio = sh.getLastRow() + 1, precisa = inicio + novas.length - 1 - sh.getMaxRows();
    if (precisa > 0) sh.insertRowsAfter(sh.getMaxRows(), precisa);
    // Texto puro: impede o Sheets de transformar "2026-10" em data.
    sh.getRange(inicio, 1, novas.length, cab.length).setNumberFormat('@').setValues(novas);
  }
  return { salvos: linhas.length };
}

function excluir_(t, ids) {
  var sh = aba_(t);
  var n = sh.getLastRow() - 1;
  if (n < 1 || !ids.length) return { excluidos: 0 };
  var alvo = {}; ids.forEach(function (id) { alvo[String(id)] = 1; });
  var col = sh.getRange(2, 1, n, 1).getValues();
  var c = 0;
  for (var i = col.length - 1; i >= 0; i--) {
    if (alvo[String(col[i][0])]) { sh.deleteRow(i + 2); c++; }
  }
  return { excluidos: c };
}

// ---------- instalação ----------
/** Rode uma vez pelo editor: cria todas as abas com cabeçalho. */
function prepararPlanilha() {
  Object.keys(TABELAS).forEach(aba_);
  var ss = SpreadsheetApp.getActive();
  var padrao = ss.getSheetByName('Página1') || ss.getSheetByName('Sheet1');
  if (padrao && ss.getSheets().length > 1 && padrao.getLastRow() === 0) ss.deleteSheet(padrao);
  var p = PropertiesService.getScriptProperties();
  Logger.log('Abas prontas. CLIENT_ID: %s · EMAIL_LIBERADO: %s', p.getProperty('CLIENT_ID') || '(falta)', p.getProperty('EMAIL_LIBERADO') || '(falta)');
}
