document.getElementById('ano').textContent = new Date().getFullYear();

// ── Ícones SVG inline ────────────────────────────────────────────────────
const ICONE_EDITAR = `<img src="/svg/vivo-notebook-engrenagens-purpura-centro-320x320.svg" width="18" height="18" style="vertical-align:middle;opacity:.7" alt="gerenciar" />`;
const ICONE_VER    = `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3" fill="#16a34a" stroke="#16a34a"/></svg>`;

// Padrão: Centro Oeste pré-selecionado
const DEFAULT_REGIONAIS = ['CENTRO OESTE'];
const DEFAULT_TECNOLOGIAS = ['GPON'];

const filtros = {
  regional: new Set(),
  tecnologia: new Set(),
  clusterTecnica: new Set()
};

const modalOrdensState = {
  cluster: '',
  faixa: ''
};

// ── Dropdown com checkbox ──────────────────────────────────────────────────

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
  limparTodos('clusterTecnica');
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

// debounce – aguarda 350 ms após última mudança para disparar
let _reloadTimer = null;
function agendarReload() {
  clearTimeout(_reloadTimer);
  _reloadTimer = setTimeout(() => carregarDados(), 350);
}

// ── Carrega lista de regionais da API ─────────────────────────────────────

async function carregarRegionais() {
  try {
    const res = await fetch('/api/regionais');
    const data = await res.json();
    const list = document.getElementById('list-regional');

    list.innerHTML = data.regionais.map(r => {
      const checked = DEFAULT_REGIONAIS.includes(r.toUpperCase());
      if (checked) filtros.regional.add(r);
      return `
        <label class="check-item">
          <input type="checkbox" value="${r}" ${checked ? 'checked' : ''}
            onchange="onCheckboxChange('regional', this.value, this.checked)" />
          <span>${r}</span>
        </label>`;
    }).join('');

    atualizarLabel('regional');
  } catch (err) {
    document.getElementById('list-regional').innerHTML = '<span class="td-loading">Erro ao carregar</span>';
  }
}

// ── Monta query string com filtros ativos ──────────────────────────────────

function buildQueryString() {
  const params = new URLSearchParams();
  filtros.regional.forEach(r => params.append('regionais', r));
  filtros.tecnologia.forEach(t => params.append('tecnologias', t));
  filtros.clusterTecnica.forEach(c => params.append('clustersTecnica', c));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function atualizarFiltroClusterTecnica(porCluster = []) {
  const list = document.getElementById('list-clusterTecnica');
  const clusters = [...new Set((porCluster || [])
    .map(r => String(r.CLUSTER_ || '').trim())
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));

  [...filtros.clusterTecnica].forEach(c => {
    if (!clusters.includes(c)) filtros.clusterTecnica.delete(c);
  });

  if (!clusters.length) {
    list.innerHTML = '<span class="td-loading">Sem clusters disponíveis</span>';
    atualizarLabel('clusterTecnica');
    return;
  }

  list.innerHTML = clusters.map(c => {
    const checked = filtros.clusterTecnica.has(c);
    return `
      <label class="check-item">
        <input type="checkbox" value="${c}" ${checked ? 'checked' : ''}
          onchange="onCheckboxChange('clusterTecnica', this.value, this.checked)" />
        <span>${c}</span>
      </label>`;
  }).join('');

  atualizarLabel('clusterTecnica');
}

async function carregarTecnologias() {
  try {
    const res = await fetch('/api/tecnologias');
    const data = await res.json();
    const list = document.getElementById('list-tecnologia');

    list.innerHTML = data.tecnologias.map(t => {
      const checked = DEFAULT_TECNOLOGIAS.includes(String(t).toUpperCase());
      if (checked) filtros.tecnologia.add(t);
      return `
        <label class="check-item">
          <input type="checkbox" value="${t}" ${checked ? 'checked' : ''}
            onchange="onCheckboxChange('tecnologia', this.value, this.checked)" />
          <span>${t}</span>
        </label>`;
    }).join('');

    atualizarLabel('tecnologia');
  } catch (err) {
    document.getElementById('list-tecnologia').innerHTML = '<span class="td-loading">Erro ao carregar</span>';
  }
}

// ── Carrega dados do dashboard ─────────────────────────────────────────────

async function carregarDados() {
  const tbody = document.getElementById('tbody-cluster');
  const tbodyTecnica = document.getElementById('tbody-tecnica');
  const estadoMsg = document.getElementById('estado-msg');

  tbody.innerHTML = '<tr><td colspan="12" class="td-loading">Carregando dados...</td></tr>';
  tbodyTecnica.innerHTML = '<tr><td colspan="5" class="td-loading">Carregando pendências técnicas...</td></tr>';
  estadoMsg.innerHTML = '';

  document.querySelectorAll('.dropdown-check-menu.open').forEach(m => m.classList.remove('open'));

  try {
    const res = await fetch(`/api/dados${buildQueryString()}`);
    if (!res.ok) throw new Error(`Erro HTTP ${res.status}`);
    const data = await res.json();

    if (data.erro) throw new Error(data.erro);

    // Resumo
    document.getElementById('atualizado-em').textContent = data.atualizadoEm;
    document.getElementById('total-geral').textContent = data.resumo.total_geral ?? '—';
    document.getElementById('total-ofensores').textContent = data.resumo.total_ofensores ?? '—';
    document.getElementById('total-dentro-prazo').textContent = data.resumo.total_dentro_prazo ?? '—';
    document.getElementById('media-dias').textContent = data.resumo.media_dias_geral ?? '—';
    document.getElementById('total-clusters').textContent = data.resumo.total_clusters ?? '—';

    // Tabela por cluster
    atualizarFiltroClusterTecnica(data.porCluster);
    renderTabelaCluster(data.porCluster);
    renderPendenciasTecnicas(data.pendenciasTecnicas);

  } catch (err) {
    estadoMsg.innerHTML = `<div class="erro-inline">⚠️ Erro ao carregar dados: <strong>${err.message}</strong></div>`;
    tbody.innerHTML = '<tr><td colspan="12" class="td-loading">Falha ao carregar.</td></tr>';
    tbodyTecnica.innerHTML = '<tr><td colspan="5" class="td-loading">Falha ao carregar.</td></tr>';
  }
}

function renderPendenciasTecnicas(payload) {
  const tbody = document.getElementById('tbody-tecnica');
  const resumo = payload?.resumo || {};
  const causas = payload?.causas || [];

  const total = Number(resumo.total_pendencias_tecnicas || 0);
  const tecnica = Number(resumo.total_tecnica || 0);
  const cabeamento = Number(resumo.total_tecnica_cabeamento || 0);

  const elTotal = document.getElementById('tec-total');
  if (total > 0) {
    elTotal.innerHTML = `<button class="num-link" type="button" title="Ver todas as pendências técnicas" onclick="abrirModalTecnica('','')">${total}</button>`;
  } else {
    elTotal.textContent = total;
  }
  document.getElementById('tec-tecnica').textContent = tecnica;
  document.getElementById('tec-cabeamento').textContent = cabeamento;

  if (!causas.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="td-loading">Sem pendências técnicas para os filtros atuais.</td></tr>';
    return;
  }

  tbody.innerHTML = causas.map((c, idx) => {
    const pct = total > 0 ? ((Number(c.total || 0) / total) * 100).toFixed(1) : '0.0';
    const causa = encodeURIComponent(c.causa || 'SEM INFORMACAO');
    const fmt = (val, sr) => {
      const n = Number(val || 0);
      if (n === 0) return '<span class="num-zero">0</span>';
      return `<button class="num-link" type="button" onclick="abrirModalTecnica('${causa}','${encodeURIComponent(sr)}')"><strong>${n}</strong></button>`;
    };
    return `
      <tr class="${idx % 2 === 0 ? 'linha-ok' : ''}">
        <td class="td-cluster">${c.causa || 'SEM INFORMACAO'}</td>
        <td class="td-center">${fmt(c.qtd_tecnica, 'TECNICA')}</td>
        <td class="td-center">${fmt(c.qtd_tecnica_cabeamento, 'TECNICA + CABEAMENTO')}</td>
        <td class="td-center">${fmt(c.total, '')}</td>
        <td class="td-center">${pct}%</td>
      </tr>`;
  }).join('');
}

function formatNumeroCelula(valor, cluster, faixaKey) {
  const num = Number(valor || 0);
  if (num === 0) {
    return '<span class="num-zero">0</span>';
  }
  return `<button class="num-link" type="button" onclick="abrirModalOrdens('${encodeURIComponent(cluster || '')}','${faixaKey}')">${num}</button>`;
}

function formatFaixaColorida(valor, cluster, faixaKey, classe) {
  const num = Number(valor || 0);
  if (num === 0) {
    return '<span class="num-zero">0</span>';
  }
  return `<span class="faixa-chip ${classe}">${formatNumeroCelula(num, cluster, faixaKey)}</span>`;
}

function renderTabelaCluster(porCluster) {
  const tbody = document.getElementById('tbody-cluster');

  if (!porCluster || porCluster.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12" class="td-loading">Nenhum dado encontrado.</td></tr>';
    return;
  }

  const totais = porCluster.reduce((acc, row) => {
    acc.total += Number(row.total || 0);
    acc.faixa_hoje += Number(row.faixa_hoje || 0);
    acc.faixa_1_dia += Number(row.faixa_1_dia || 0);
    acc.faixa_2_dias += Number(row.faixa_2_dias || 0);
    acc.faixa_3_dias += Number(row.faixa_3_dias || 0);
    acc.faixa_4_dias += Number(row.faixa_4_dias || 0);
    acc.faixa_5_7 += Number(row.faixa_5_7 || 0);
    acc.faixa_8_15 += Number(row.faixa_8_15 || 0);
    acc.faixa_15_mais += Number(row.faixa_15_mais || 0);
    acc.ofensores += Number(row.ofensores || 0);
    return acc;
  }, {
    total: 0,
    faixa_hoje: 0,
    faixa_1_dia: 0,
    faixa_2_dias: 0,
    faixa_3_dias: 0,
    faixa_4_dias: 0,
    faixa_5_7: 0,
    faixa_8_15: 0,
    faixa_15_mais: 0,
    ofensores: 0
  });

  const pctTotal = totais.total > 0 ? ((totais.ofensores / totais.total) * 100).toFixed(1) : 0;

  const linhas = porCluster.map(row => {
    const pct = row.total > 0 ? ((row.ofensores / row.total) * 100).toFixed(1) : 0;
    const barraClass = pct > 50 ? 'barra-critica' : pct > 20 ? 'barra-alerta' : 'barra-normal';
    const linhaClass = row.ofensores > 0 ? 'linha-ofensor' : 'linha-ok';

    return `
      <tr class="${linhaClass}">
        <td class="td-cluster"><strong>${row.CLUSTER_ || '(sem cluster)'}</strong></td>
        <td class="td-center">${formatNumeroCelula(row.total, row.CLUSTER_, 'total')}</td>
        <td class="td-center">${formatNumeroCelula(row.faixa_hoje, row.CLUSTER_, 'hoje')}</td>
        <td class="td-center">${formatNumeroCelula(row.faixa_1_dia, row.CLUSTER_, 'dia_1')}</td>
        <td class="td-center">${formatNumeroCelula(row.faixa_2_dias, row.CLUSTER_, 'dia_2')}</td>
        <td class="td-center">${formatNumeroCelula(row.faixa_3_dias, row.CLUSTER_, 'dia_3')}</td>
        <td class="td-center">${formatFaixaColorida(row.faixa_4_dias, row.CLUSTER_, 'dia_4', 'faixa-limite')}</td>
        <td class="td-center">${formatFaixaColorida(row.faixa_5_7, row.CLUSTER_, 'dia_5_7', 'faixa-ofensor-leve')}</td>
        <td class="td-center">${formatFaixaColorida(row.faixa_8_15, row.CLUSTER_, 'dia_8_15', 'faixa-ofensor-medio')}</td>
        <td class="td-center">${formatFaixaColorida(row.faixa_15_mais, row.CLUSTER_, 'dia_15_mais', 'faixa-ofensor-critico')}</td>
        <td class="td-center">
          ${Number(row.ofensores) > 0
            ? `<span class="badge-num badge-num-ofensor">${formatNumeroCelula(row.ofensores, row.CLUSTER_, 'ofensores')}</span>`
            : `<span class="badge-num badge-num-zero"><span class="num-zero">0</span></span>`}
        </td>
        <td class="td-center">
          <div class="barra-wrapper">
            <div class="barra-progresso ${barraClass}" style="width:${Math.min(pct, 100)}%"></div>
            <span class="barra-label">${pct}%</span>
          </div>
        </td>
      </tr>`;
  }).join('');

  const linhaTotal = `
    <tr class="linha-total">
      <td class="td-cluster"><strong>Total Geral</strong></td>
      <td class="td-center"><strong>${totais.total}</strong></td>
      <td class="td-center"><strong>${totais.faixa_hoje}</strong></td>
      <td class="td-center"><strong>${totais.faixa_1_dia}</strong></td>
      <td class="td-center"><strong>${totais.faixa_2_dias}</strong></td>
      <td class="td-center"><strong>${totais.faixa_3_dias}</strong></td>
      <td class="td-center"><strong>${totais.faixa_4_dias}</strong></td>
      <td class="td-center"><strong>${totais.faixa_5_7}</strong></td>
      <td class="td-center"><strong>${totais.faixa_8_15}</strong></td>
      <td class="td-center"><strong>${totais.faixa_15_mais}</strong></td>
      <td class="td-center"><strong>${totais.ofensores}</strong></td>
      <td class="td-center"><strong>${pctTotal}%</strong></td>
    </tr>`;

  tbody.innerHTML = linhas + linhaTotal;
}

async function abrirModalOrdens(clusterEnc, faixaKey) {
  const cluster = decodeURIComponent(clusterEnc);
  const modal = document.getElementById('modal-ordens');
  const body = document.getElementById('modal-ordens-body');
  const titulo = document.getElementById('modal-titulo');
  const subtitulo = document.getElementById('modal-subtitulo');
  const faixaLabel = {
    total: 'Total',
    hoje: 'Hoje',
    dia_1: '1 dia',
    dia_2: '2 dias',
    dia_3: '3 dias',
    dia_4: '4 dias',
    dia_5_7: '5-7 dias',
    dia_8_15: '8-15 dias',
    dia_15_mais: 'Acima de 15 dias',
    ofensores: 'Ofensores (>4 dias)'
  };

  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');
  modalOrdensState.cluster = cluster;
  modalOrdensState.faixa = faixaKey;
  modalOrdensState._tecnica = null;
  titulo.textContent = `Ordens de Reparo - ${cluster}`;
  subtitulo.textContent = `Faixa: ${faixaLabel[faixaKey] || faixaKey}`;
  body.innerHTML = '<tr><td colspan="7" class="td-loading">Carregando...</td></tr>';

  try {
    const queryFiltros = buildQueryString();
    const sep = queryFiltros ? '&' : '?';
    const res = await fetch(`/api/cluster/${encodeURIComponent(cluster)}/ordens${queryFiltros}${sep}faixa=${faixaKey}`);
    if (!res.ok) throw new Error(`Erro HTTP ${res.status}`);
    const data = await res.json();
    if (data.erro) throw new Error(data.erro);

    if (!data.ordens || data.ordens.length === 0) {
      body.innerHTML = '<tr><td colspan="7" class="td-loading">Nenhuma ordem encontrada.</td></tr>';
      return;
    }

    // Carrega anotações existentes para esse lote de OS
    const codSsList = data.ordens.map(o => o.COD_SS).filter(Boolean);
    let anotacoesMap = {};
    if (codSsList.length) {
      const qs = codSsList.map(c => `codSs=${encodeURIComponent(c)}`).join('&');
      const aRes = await fetch(`/api/anotacoes?${qs}`);
      if (aRes.ok) anotacoesMap = await aRes.json();
    }

    body.innerHTML = data.ordens.map(o => {
      const codSs = o.COD_SS ?? '';
      const anot = anotacoesMap[codSs];
      const temAnotacao = !!(anot && (anot.status_prev || anot.previsao || anot.observacao));
      const iconeCls = temAnotacao ? 'btn-anot-icone btn-anot-preenchido' : 'btn-anot-icone btn-anot-vazio';
      const iconeTitle = temAnotacao
        ? `Anotado: ${anot.status_prev || ''}${anot.previsao ? ' | Prev: ' + new Date(anot.previsao).toLocaleString('pt-BR') : ''}`
        : 'Adicionar anotação';
      return `
      <tr>
        <td class="td-center">
          <button class="${iconeCls}" title="${iconeTitle.replace(/"/g, '&quot;')}"
            onclick="abrirModalAnotacao('${codSs.replace(/'/g, "\\'")}')">
            ${temAnotacao ? ICONE_VER : ICONE_EDITAR}
          </button>
        </td>
        <td>${codSs || '—'}</td>
        <td>${o.CLUSTER_ ?? '—'}</td>
        <td>${o.REGIONAL ?? '—'}</td>
        <td>${o.STATUS ?? '—'}</td>
        <td>${o.DATA_ABERTURA ? new Date(o.DATA_ABERTURA).toLocaleDateString('pt-BR') : '—'}</td>
        <td class="td-center">${o.dias_abertos ?? '—'}</td>
      </tr>`;
    }).join('');
  } catch (err) {
    body.innerHTML = `<tr><td colspan="7" class="td-loading">Erro ao carregar: ${err.message}</td></tr>`;
  }
}

function fecharModalOrdens(event) {
  if (event && event.target && !event.target.classList.contains('modal-overlay')) return;
  document.getElementById('modal-ordens').classList.add('hidden');
  document.body.classList.remove('modal-open');
}

function baixarExcelGeral() {
  window.location.href = `/api/export${buildQueryString()}`;
}

function baixarExcelModal() {
  const qs = buildQueryString();
  const sep = qs ? '&' : '?';
  let url;
  if (modalOrdensState._tecnica) {
    const { causa, statusReason } = modalOrdensState._tecnica;
    url = `/api/tecnica/ordens/export${qs}${sep}causa=${encodeURIComponent(causa)}&statusReason=${encodeURIComponent(statusReason)}`;
  } else {
    if (!modalOrdensState.cluster || !modalOrdensState.faixa) return;
    url = `/api/cluster/${encodeURIComponent(modalOrdensState.cluster)}/ordens/export${qs}${sep}faixa=${modalOrdensState.faixa}`;
  }
  window.location.href = url;
}

async function abrirModalTecnica(causaEnc, statusReasonEnc) {
  const causa = decodeURIComponent(causaEnc);
  const statusReason = decodeURIComponent(statusReasonEnc);
  const modal = document.getElementById('modal-ordens');
  const body  = document.getElementById('modal-ordens-body');
  const titulo    = document.getElementById('modal-titulo');
  const subtitulo = document.getElementById('modal-subtitulo');

  modalOrdensState.cluster = '';
  modalOrdensState.faixa   = '';
  modalOrdensState._tecnica = { causa, statusReason };

  titulo.textContent    = causa ? `Pendências Técnicas — ${causa}` : 'Pendências Técnicas — Todas as causas';
  subtitulo.textContent = statusReason ? `Status Reason: ${statusReason}` : 'Todos os Status Reasons';
  body.innerHTML = '<tr><td colspan="7" class="td-loading">Carregando...</td></tr>';
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');

  try {
    const qs = buildQueryString();
    const sep = qs ? '&' : '?';
    const url = `/api/tecnica/ordens${qs}${sep}causa=${encodeURIComponent(causa)}&statusReason=${encodeURIComponent(statusReason)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Erro HTTP ${res.status}`);
    const data = await res.json();
    if (data.erro) throw new Error(data.erro);

    if (!data.ordens || data.ordens.length === 0) {
      body.innerHTML = '<tr><td colspan="7" class="td-loading">Nenhuma ordem encontrada.</td></tr>';
      return;
    }

    const codSsList = data.ordens.map(o => o.COD_SS).filter(Boolean);
    let anotacoesMap = {};
    if (codSsList.length) {
      const aQs = codSsList.map(c => `codSs=${encodeURIComponent(c)}`).join('&');
      const aRes = await fetch(`/api/anotacoes?${aQs}`);
      if (aRes.ok) anotacoesMap = await aRes.json();
    }

    body.innerHTML = data.ordens.map(o => {
      const codSs = o.COD_SS ?? '';
      const anot = anotacoesMap[codSs];
      const temAnotacao = !!(anot && (anot.status_prev || anot.previsao || anot.observacao));
      const iconeCls = temAnotacao ? 'btn-anot-icone btn-anot-preenchido' : 'btn-anot-icone btn-anot-vazio';
      const iconeTitle = temAnotacao
        ? `Anotado: ${anot.status_prev || ''}${anot.previsao ? ' | Prev: ' + new Date(anot.previsao).toLocaleString('pt-BR') : ''}`
        : 'Adicionar anotação';
      return `
      <tr>
        <td class="td-center">
          <button class="${iconeCls}" title="${iconeTitle.replace(/"/g, '&quot;')}"
            onclick="abrirModalAnotacao('${codSs.replace(/'/g, "\\'")}')">
            ${temAnotacao ? ICONE_VER : ICONE_EDITAR}
          </button>
        </td>
        <td>${codSs || '—'}</td>
        <td>${o.CLUSTER_ ?? '—'}</td>
        <td>${o.REGIONAL ?? '—'}</td>
        <td>${o.STATUS ?? '—'}</td>
        <td>${o.DATA_ABERTURA ? new Date(o.DATA_ABERTURA).toLocaleDateString('pt-BR') : '—'}</td>
        <td class="td-center">${o.dias_abertos ?? '—'}</td>
      </tr>`;
    }).join('');
  } catch (err) {
    body.innerHTML = `<tr><td colspan="7" class="td-loading">Erro ao carregar: ${err.message}</td></tr>`;
  }
}

// ── Modal Anotação ────────────────────────────────────────────────────────

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

  // Carrega dado existente
  try {
    const res = await fetch(`/api/anotacoes?codSs=${encodeURIComponent(codSs)}`);
    if (res.ok) {
      const mapa = await res.json();
      const a = mapa[codSs];
      if (a) {
        if (a.previsao) {
          // datetime-local espera "YYYY-MM-DDTHH:MM"
          const d = new Date(a.previsao);
          const pad = n => String(n).padStart(2, '0');
          document.getElementById('anotacao-previsao').value =
            `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        }
        document.getElementById('anotacao-status').value = a.status_prev || '';
        document.getElementById('anotacao-obs').value = a.observacao || '';
      }
    }
  } catch (_) { /* ignora erro de carregamento */ }

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
    previsao: document.getElementById('anotacao-previsao').value || null,
    status_prev: document.getElementById('anotacao-status').value,
    observacao: document.getElementById('anotacao-obs').value || null
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

    // Atualiza o ícone na linha sem recarregar o modal
    const icon = document.querySelector(`button[onclick*="${CSS.escape(anotacaoState.codSs)}"]`);
    if (icon) {
      icon.classList.remove('btn-anot-vazio');
      icon.classList.add('btn-anot-preenchido');
      icon.innerHTML = ICONE_VER;
    }
    document.getElementById('modal-anotacao').classList.add('hidden');
  } catch (err) {
    btn.disabled = false;
    btn.textContent = '💾 Salvar';
    alert(`Erro ao salvar: ${err.message}`);
  }
}

// ── Init ──────────────────────────────────────────────────────────────────
(async () => {
  await carregarRegionais();
  await carregarTecnologias();
  await carregarDados();
})();
