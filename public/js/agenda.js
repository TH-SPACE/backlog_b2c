document.getElementById('ano').textContent = new Date().getFullYear();

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const DEFAULT_REGIONAIS  = ['CENTRO OESTE'];
const DEFAULT_TECNOLOGIAS = ['GPON'];

const filtros = {
  regional:   new Set(),
  tecnologia: new Set()
};

let periodoAtual = 'hoje';

// ── Dropdown helpers ───────────────────────────────────────────────────────

function toggleDropdown(id) {
  const menu = document.getElementById(`menu-${id}`);
  const isOpen = menu.classList.contains('open');
  document.querySelectorAll('.dropdown-check-menu.open').forEach(m => m.classList.remove('open'));
  if (!isOpen) menu.classList.add('open');
}

document.addEventListener('click', e => {
  if (!e.target.closest('.dropdown-check')) {
    document.querySelectorAll('.dropdown-check-menu.open').forEach(m => m.classList.remove('open'));
  }
});

function selecionarTodos(id) {
  document.querySelectorAll(`#list-${id} input[type=checkbox]`).forEach(cb => {
    cb.checked = true;
    filtros[id].add(cb.value);
  });
  atualizarLabel(id);
  agendarReload();
}

function limparTodos(id) {
  document.querySelectorAll(`#list-${id} input[type=checkbox]`).forEach(cb => {
    cb.checked = false;
    filtros[id].delete(cb.value);
  });
  atualizarLabel(id);
  agendarReload();
}

function limparFiltros() {
  limparTodos('regional');
  limparTodos('tecnologia');
}

function atualizarLabel(id) {
  const selecionados = [...filtros[id]];
  const label = document.getElementById(`${id}-label`);
  if (selecionados.length === 0) {
    label.textContent = 'Todas';
  } else if (selecionados.length <= 2) {
    label.textContent = selecionados.join(', ');
  } else {
    label.textContent = `${selecionados.length} selecionadas`;
  }
}

function onCheckboxChange(id, value, checked) {
  if (checked) filtros[id].add(value);
  else filtros[id].delete(value);
  atualizarLabel(id);
  agendarReload();
}

function onPeriodoChange(value) {
  periodoAtual = value;
  const labels = { hoje: 'Hoje', amanha: 'Amanhã', semana: 'Próximos 7 dias', todos: 'Todos com previsão' };
  document.getElementById('periodo-label').textContent = labels[value] || value;
  document.querySelectorAll('.dropdown-check-menu.open').forEach(m => m.classList.remove('open'));
  carregarAgenda();
}

// debounce – aguarda 350 ms após última mudança para disparar
let _reloadTimer = null;
function agendarReload() {
  clearTimeout(_reloadTimer);
  _reloadTimer = setTimeout(() => carregarAgenda(), 350);
}

function buildQueryString() {
  const params = new URLSearchParams();
  filtros.regional.forEach(r => params.append('regionais', r));
  filtros.tecnologia.forEach(t => params.append('tecnologias', t));
  params.set('periodo', periodoAtual);
  return '?' + params.toString();
}

// ── Carregadores de filtros ────────────────────────────────────────────────

async function carregarRegionais() {
  try {
    const res = await fetch('/api/regionais');
    const data = await res.json();
    const list = document.getElementById('list-regional');
    list.innerHTML = data.regionais.map(r => {
      const checked = DEFAULT_REGIONAIS.includes(r.toUpperCase());
      if (checked) filtros.regional.add(r);
      return `<label class="check-item">
        <input type="checkbox" value="${r}" ${checked ? 'checked' : ''}
          onchange="onCheckboxChange('regional', this.value, this.checked)" />
        <span>${r}</span></label>`;
    }).join('');
    atualizarLabel('regional');
  } catch (_) {
    document.getElementById('list-regional').innerHTML = '<span class="td-loading">Erro</span>';
  }
}

async function carregarTecnologias() {
  try {
    const res = await fetch('/api/tecnologias');
    const data = await res.json();
    const list = document.getElementById('list-tecnologia');
    list.innerHTML = data.tecnologias.map(t => {
      const checked = DEFAULT_TECNOLOGIAS.includes(String(t).toUpperCase());
      if (checked) filtros.tecnologia.add(t);
      return `<label class="check-item">
        <input type="checkbox" value="${t}" ${checked ? 'checked' : ''}
          onchange="onCheckboxChange('tecnologia', this.value, this.checked)" />
        <span>${t}</span></label>`;
    }).join('');
    atualizarLabel('tecnologia');
  } catch (_) {
    document.getElementById('list-tecnologia').innerHTML = '<span class="td-loading">Erro</span>';
  }
}

// ── Agenda ─────────────────────────────────────────────────────────────────

const STATUS_PREV_CORES = {
  'EM ANDAMENTO':         'agenda-status-andamento',
  'AGENDADO':             'agenda-status-agendado',
  'AGUARDANDO MATERIAL':  'agenda-status-aguardando',
  'AGUARDANDO CLIENTE':   'agenda-status-aguardando',
  'AGUARDANDO PARCEIRO':  'agenda-status-aguardando',
  'AGUARDANDO APROVACAO': 'agenda-status-aguardando',
  'IMPEDIDO':             'agenda-status-impedido',
  'REPASSADO':            'agenda-status-repassado',
  'RESOLVIDO':            'agenda-status-resolvido',
};

async function carregarAgenda() {
  const tbody = document.getElementById('tbody-agenda');
  const estadoMsg = document.getElementById('estado-msg');
  tbody.innerHTML = '<tr><td colspan="9" class="td-loading">Carregando agenda...</td></tr>';
  estadoMsg.innerHTML = '';
  document.querySelectorAll('.dropdown-check-menu.open').forEach(m => m.classList.remove('open'));

  // Atualiza título da seção
  const titulos = { hoje: '📅 Agenda do Dia', amanha: '📅 Agenda de Amanhã', semana: '📅 Próximos 7 Dias', todos: '📅 Todas as Previsões' };
  document.getElementById('agenda-titulo-secao').textContent = titulos[periodoAtual] || '📅 Agenda';

  // Exibe data de referência
  const hoje = new Date();
  const fmt = d => d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const labels = {
    hoje: `Referência: ${fmt(hoje)}`,
    amanha: (() => { const d = new Date(hoje); d.setDate(d.getDate()+1); return `Referência: ${fmt(d)}`; })(),
    semana: `Próximos 7 dias a partir de ${hoje.toLocaleDateString('pt-BR')}`,
    todos:  'Todas as OS com previsão cadastrada'
  };
  document.getElementById('agenda-data-label').textContent = labels[periodoAtual] || '';

  try {
    const res = await fetch(`/api/agenda${buildQueryString()}`);
    if (!res.ok) throw new Error(`Erro HTTP ${res.status}`);
    const data = await res.json();
    if (data.erro) throw new Error(data.erro);
    renderAgenda(data.agenda || []);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" class="td-loading">Erro: ${err.message}</td></tr>`;
    estadoMsg.innerHTML = `<div class="erro-inline">⚠️ ${err.message}</div>`;
  }
}

function renderAgenda(agenda) {
  const tbody = document.getElementById('tbody-agenda');

  // Atualiza cards de resumo
  const total = agenda.length;
  const emAndamento = agenda.filter(a => ['EM ANDAMENTO','AGENDADO'].includes(String(a.status_prev || '').toUpperCase())).length;
  const impedido    = agenda.filter(a => ['IMPEDIDO','AGUARDANDO MATERIAL','AGUARDANDO CLIENTE','AGUARDANDO PARCEIRO','AGUARDANDO APROVACAO'].includes(String(a.status_prev || '').toUpperCase())).length;
  const semStatus   = agenda.filter(a => !a.status_prev).length;

  document.getElementById('agenda-total').textContent       = total;
  document.getElementById('agenda-em-andamento').textContent = emAndamento;
  document.getElementById('agenda-impedido').textContent    = impedido;
  document.getElementById('agenda-sem-status').textContent  = semStatus;

  if (!agenda.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="td-loading">Nenhuma OS encontrada para o período selecionado.</td></tr>';
    return;
  }

  tbody.innerHTML = agenda.map(a => {
    const corCls = STATUS_PREV_CORES[String(a.status_prev || '').toUpperCase()] || 'agenda-status-vazio';
    const previsaoDtHr = a.previsao
      ? new Date(a.previsao).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
      : '—';
    const statusBadge = a.status_prev
      ? `<span class="agenda-badge ${corCls}">${a.status_prev}</span>`
      : '<span class="agenda-badge agenda-status-vazio">—</span>';
    const codSs = a.cod_ss || '';
    const designator   = (a.DESIGNATOR ?? '').replace(/'/g, "\\'");
    const diasAberto   = (a.dias_aberto ?? '').toString();
    const dataAbertura = a.DATA_ABERTURA ? new Date(a.DATA_ABERTURA).toISOString().slice(0, 10) : '';
    const ofensorCls = Number(a.dias_abertos) >= 4 ? 'linha-ofensor' : '';
    return `
      <tr class="${ofensorCls}">
        <td class="td-center">
          <button class="btn-gerenciar btn-gerenciado" title="Ver e enviar gerenciamento"
            onclick="abrirModalAnotacao('${codSs.replace(/'/g, "\\'")}','${designator}','${diasAberto}','${dataAbertura}')">✓ Gerenciado</button>
        </td>
        <td>${codSs || '—'}</td>
        <td>${a.CLUSTER_ ?? '—'}</td>
        <td>${a.REGIONAL ?? '—'}</td>
        <td class="td-center"><strong>${previsaoDtHr}</strong></td>
        <td class="td-center">${statusBadge}</td>
        <td>${a.STATUS ?? '—'}</td>
        <td class="td-center">${a.dias_abertos ?? '—'}</td>
        <td class="td-obs">${a.observacao || '—'}</td>
      </tr>`;
  }).join('');
}

// ── Modal Gerenciamento (anotação + histórico) ─────────────────────────────

const anotacaoState = { codSs: '', designator: '', diasAberto: '', dataAbertura: '' };

// Popula o select de hora (06:00 às 22:00, de 30 em 30 min)
(function popularHoras() {
  const sel = document.getElementById('anotacao-hora');
  const opcoes = [];
  for (let h = 6; h <= 22; h++) {
    for (const m of ['00', '30']) {
      if (h === 22 && m === '30') continue;
      const hora = `${String(h).padStart(2, '0')}:${m}`;
      opcoes.push(`<option value="${hora}"${hora === '18:00' ? ' selected' : ''}>${hora}</option>`);
    }
  }
  sel.innerHTML = opcoes.join('');
})();

function setHoraSelect(hora) {
  const sel = document.getElementById('anotacao-hora');
  if (![...sel.options].some(opt => opt.value === hora)) {
    sel.insertAdjacentHTML('beforeend', `<option value="${hora}">${hora}</option>`);
  }
  sel.value = hora;
}

function setPrevisaoRapida(diasAFrente) {
  const d = new Date();
  d.setDate(d.getDate() + diasAFrente);
  const pad = n => String(n).padStart(2, '0');
  document.getElementById('anotacao-data').value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function limparPrevisao() {
  document.getElementById('anotacao-data').value = '';
  document.getElementById('anotacao-hora').value = '18:00';
}

function mostrarFormGerenciamento() {
  document.getElementById('acao-novo-gerenciamento').classList.add('hidden');
  document.getElementById('form-anotacao').classList.remove('hidden');
}

function cancelarFormGerenciamento() {
  document.getElementById('form-anotacao').classList.add('hidden');
  document.getElementById('acao-novo-gerenciamento').classList.remove('hidden');
}

function renderHistorico(itens) {
  const div = document.getElementById('anotacao-historico');
  if (!itens || !itens.length) {
    div.innerHTML = '<span class="historico-vazio">Nenhum gerenciamento registrado ainda.</span>';
    return;
  }
  div.innerHTML = itens.map(h => {
    const quando = h.criado_em
      ? new Date(h.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
      : '—';
    const prev = h.previsao
      ? new Date(h.previsao).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
      : null;
    return `
      <div class="historico-item">
        <div class="historico-meta">
          <span class="historico-quando">${quando}</span>
          ${h.status_prev ? `<span class="historico-status">${escapeHtml(h.status_prev)}</span>` : ''}
          ${prev ? `<span class="historico-prev">Prev: ${prev}</span>` : ''}
        </div>
        ${h.observacao ? `<div class="historico-obs">${escapeHtml(h.observacao)}</div>` : ''}
      </div>`;
  }).join('');
}

async function carregarHistorico(codSs) {
  const div = document.getElementById('anotacao-historico');
  div.innerHTML = '<span class="td-loading">Carregando...</span>';
  try {
    const res = await fetch(`/api/anotacao/${encodeURIComponent(codSs)}/historico`);
    if (!res.ok) throw new Error(`Erro HTTP ${res.status}`);
    const data = await res.json();
    renderHistorico(data.historico || []);
  } catch (err) {
    div.innerHTML = `<span class="historico-vazio">Erro ao carregar histórico: ${err.message}</span>`;
  }
}

function abrirModalAnotacao(codSs, designator = '', diasAberto = '', dataAbertura = '') {
  anotacaoState.codSs = codSs;
  anotacaoState.designator = designator;
  anotacaoState.diasAberto = diasAberto;
  anotacaoState.dataAbertura = dataAbertura;
  const modal = document.getElementById('modal-anotacao');
  document.getElementById('anotacao-os-label').textContent = `OS: ${codSs}`;
  limparPrevisao();
  document.getElementById('anotacao-status').value = '';
  document.getElementById('anotacao-obs').value = '';
  document.getElementById('btn-salvar-anotacao').disabled = false;
  document.getElementById('btn-salvar-anotacao').textContent = '💾 Enviar Status';

  // Abre mostrando só o histórico; o formulário aparece ao clicar em "novo gerenciamento"
  cancelarFormGerenciamento();

  modal.classList.remove('hidden');
  carregarHistorico(codSs);
}

function fecharModalAnotacao(event) {
  if (event && event.target && !event.target.classList.contains('modal-overlay')) return;
  document.getElementById('modal-anotacao').classList.add('hidden');
}

async function salvarAnotacao(event) {
  event.preventDefault();
  const btn = document.getElementById('btn-salvar-anotacao');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  const dataPrev = document.getElementById('anotacao-data').value;
  const horaPrev = document.getElementById('anotacao-hora').value || '18:00';
  const payload = {
    previsao:    dataPrev ? `${dataPrev}T${horaPrev}` : null,
    status_prev: document.getElementById('anotacao-status').value,
    observacao:  document.getElementById('anotacao-obs').value || null,
    designator:    anotacaoState.designator   || null,
    dias_aberto:   anotacaoState.diasAberto   !== '' ? Number(anotacaoState.diasAberto) : null,
    data_abertura: anotacaoState.dataAbertura || null
  };

  try {
    const res = await fetch(`/api/anotacao/${encodeURIComponent(anotacaoState.codSs)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`Erro HTTP ${res.status}`);
    const data = await res.json();
    if (data.erro) throw new Error(data.erro);

    // Mantém a tela aberta, atualiza histórico e recarrega a agenda atrás
    carregarHistorico(anotacaoState.codSs);
    carregarAgenda();
    btn.textContent = '✓ Enviado!';
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = '💾 Enviar Status';
      cancelarFormGerenciamento();
    }, 1200);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = '💾 Enviar Status';
    alert(`Erro ao enviar: ${err.message}`);
  }
}

// ── Init ───────────────────────────────────────────────────────────────────
(async () => {
  await Promise.all([carregarRegionais(), carregarTecnologias()]);
  await carregarAgenda();
})();
