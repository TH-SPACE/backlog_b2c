document.getElementById('ano').textContent = new Date().getFullYear();

// ── Ícones SVG inline ────────────────────────────────────────────────────
const ICONE_VER = `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3" fill="#16a34a" stroke="#16a34a"/></svg>`;
const ICONE_EDITAR = `<img src="/svg/vivo-formulario-folha-lapis-purpura-esquerda-320x320.svg" width="18" height="18" style="vertical-align:middle;opacity:.7" alt="gerenciar" />`;

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
    const ofensorCls = Number(a.dias_abertos) > 4 ? 'linha-ofensor' : '';
    return `
      <tr class="${ofensorCls}">
        <td class="td-center">
          <button class="btn-anot-icone btn-anot-preenchido" title="Editar anotação"
            onclick="abrirModalAnotacao('${codSs.replace(/'/g, "\\'")}')">            ${ICONE_VER}</button>
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

// ── Modal Anotação ─────────────────────────────────────────────────────────

const anotacaoState = { codSs: '' };

async function abrirModalAnotacao(codSs) {
  anotacaoState.codSs = codSs;
  const modal = document.getElementById('modal-anotacao');
  document.getElementById('anotacao-os-label').textContent = `OS: ${codSs}`;
  document.getElementById('anotacao-previsao').value = '';
  document.getElementById('anotacao-status').value = '';
  document.getElementById('anotacao-obs').value = '';
  document.getElementById('btn-salvar-anotacao').disabled = false;
  document.getElementById('btn-salvar-anotacao').textContent = '💾 Salvar';

  try {
    const res = await fetch(`/api/anotacoes?codSs=${encodeURIComponent(codSs)}`);
    if (res.ok) {
      const mapa = await res.json();
      const a = mapa[codSs];
      if (a) {
        if (a.previsao) {
          const d = new Date(a.previsao);
          const pad = n => String(n).padStart(2, '0');
          document.getElementById('anotacao-previsao').value =
            `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        }
        document.getElementById('anotacao-status').value = a.status_prev || '';
        document.getElementById('anotacao-obs').value = a.observacao || '';
      }
    }
  } catch (_) {}

  modal.classList.remove('hidden');
}

function fecharModalAnotacao(event) {
  if (event && event.target && !event.target.classList.contains('modal-overlay')) return;
  document.getElementById('modal-anotacao').classList.add('hidden');
}

async function salvarAnotacao(event) {
  event.preventDefault();
  const btn = document.getElementById('btn-salvar-anotacao');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  const payload = {
    previsao:    document.getElementById('anotacao-previsao').value || null,
    status_prev: document.getElementById('anotacao-status').value,
    observacao:  document.getElementById('anotacao-obs').value || null
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
    document.getElementById('modal-anotacao').classList.add('hidden');
    carregarAgenda();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = '💾 Salvar';
    alert(`Erro ao salvar: ${err.message}`);
  }
}

// ── Init ───────────────────────────────────────────────────────────────────
(async () => {
  await Promise.all([carregarRegionais(), carregarTecnologias()]);
  await carregarAgenda();
})();
