document.getElementById('ano').textContent = new Date().getFullYear();

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

const MODAL_THEAD_BASE = '<th>Gerenciar</th><th>OS</th><th>Cluster</th><th>Status</th><th>Status Reason</th><th>Data Abertura</th><th>Dias Abertos</th>';
const MODAL_THEAD_ANOT = '<th>Previsão</th><th>Status Prev.</th>';
const MODAL_THEAD_PADRAO = MODAL_THEAD_BASE + MODAL_THEAD_ANOT;                              // 9 colunas
const MODAL_THEAD_TECNICA = MODAL_THEAD_BASE + '<th>Dias na Pendência</th>' + MODAL_THEAD_ANOT; // 10 colunas

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Gerenciadas (com anotação) primeiro; dentro de cada grupo mantém a ordem da query
function ordenarPorGerenciamento(ordens, anotacoesMap) {
  const temAnot = o => {
    const a = anotacoesMap[o.COD_SS];
    return (a && (a.status_prev || a.previsao || a.observacao)) ? 1 : 0;
  };
  return [...ordens].sort((a, b) => temAnot(b) - temAnot(a));
}

// Células de Previsão / Status da anotação de uma OS (observação fica no Gerenciar)
function celulasAnotacao(anot) {
  const prev = anot && anot.previsao
    ? new Date(anot.previsao).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : '—';
  const status = anot && anot.status_prev ? escapeHtml(anot.status_prev) : '—';
  return `
        <td class="td-center td-anot-prev">${prev}</td>
        <td class="td-center td-anot-status">${status}</td>`;
}

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
  document.getElementById('tbody-cluster-tecnica').innerHTML = '<tr><td colspan="10" class="td-loading">Carregando...</td></tr>';
  document.getElementById('aging-grid').innerHTML = '<div class="td-loading">Carregando...</div>';
  estadoMsg.innerHTML = '';

  document.querySelectorAll('.dropdown-check-menu.open').forEach(m => m.classList.remove('open'));

  try {
    const [res, resPainel] = await Promise.all([
      fetch(`/api/dados${buildQueryString()}`),
      fetch(`/api/tecnica/painel${buildQueryString()}`)
    ]);
    if (!res.ok) throw new Error(`Erro HTTP ${res.status}`);
    const data = await res.json();

    if (data.erro) throw new Error(data.erro);

    if (resPainel.ok) {
      const painel = await resPainel.json();
      if (!painel.erro) renderVisaoGestao(painel);
    }

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

// ── Visão de Gestão — Pendências Técnicas ─────────────────────────────────

function renderVisaoGestao(painel) {
  const r = painel.resumo || {};
  const total = Number(r.total || 0);
  const gerenciadas = Number(r.gerenciadas || 0);

  document.getElementById('pt-gerenciadas').textContent = gerenciadas;
  document.getElementById('pt-faltam').textContent = total - gerenciadas;
  document.getElementById('pt-media').textContent = r.media_dias ?? '—';
  document.getElementById('pt-max').textContent = r.max_dias ?? '—';

  // Cards de envelhecimento (clicáveis quando há ordens)
  const faixas = [
    { key: 'f0_2', label: '0-2 dias', valor: Number(r.faixa_0_2 || 0), classe: 'aging-ok' },
    { key: 'f3_5', label: '3-5 dias', valor: Number(r.faixa_3_5 || 0), classe: 'aging-alerta' },
    { key: 'f6_10', label: '6-10 dias', valor: Number(r.faixa_6_10 || 0), classe: 'aging-grave' },
    { key: 'f10_mais', label: 'Acima de 10 dias', valor: Number(r.faixa_10_mais || 0), classe: 'aging-critico' }
  ];
  document.getElementById('aging-grid').innerHTML = faixas.map(f => {
    const pct = total > 0 ? ((f.valor / total) * 100).toFixed(1) : '0.0';
    const clicavel = f.valor > 0 ? ` aging-click" onclick="abrirModalPainel('${f.key}')" title="Ver ordens dessa faixa` : '';
    return `
      <div class="aging-card ${f.classe}${clicavel}">
        <span class="aging-num">${f.valor}</span>
        <span class="aging-label">${f.label}</span>
        <span class="aging-pct">${pct}% do total</span>
      </div>`;
  }).join('');

  // Tabela por cluster
  const tbody = document.getElementById('tbody-cluster-tecnica');
  const porCluster = painel.porCluster || [];
  if (!porCluster.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="td-loading">Sem pendências técnicas para os filtros atuais.</td></tr>';
    return;
  }
  tbody.innerHTML = porCluster.map(row => {
    const tot = Number(row.total || 0);
    const ger = Number(row.gerenciadas || 0);
    const faltam = tot - ger;
    const pct = tot > 0 ? ((ger / tot) * 100).toFixed(1) : 0;
    const barraClass = pct >= 80 ? 'barra-normal' : pct >= 40 ? 'barra-alerta' : 'barra-critica';
    const acima10 = Number(row.faixa_10_mais || 0);
    const clusterEnc = encodeURIComponent(row.CLUSTER_ || '');
    const fmtP = (val, faixaKey, gerenciado = '') => {
      const n = Number(val || 0);
      if (!n) return '<span class="num-zero">0</span>';
      return `<button class="num-link" type="button" onclick="abrirModalPainel('${faixaKey}','${clusterEnc}'${gerenciado !== '' ? `,'${gerenciado}'` : ''})">${n}</button>`;
    };
    return `
      <tr class="${faltam > 0 ? 'linha-ofensor' : 'linha-ok'}">
        <td class="td-cluster"><strong>${row.CLUSTER_ || '(sem cluster)'}</strong></td>
        <td class="td-center"><strong>${fmtP(tot, 'total')}</strong></td>
        <td class="td-center">${fmtP(row.faixa_0_2, 'f0_2')}</td>
        <td class="td-center">${fmtP(row.faixa_3_5, 'f3_5')}</td>
        <td class="td-center">${fmtP(row.faixa_6_10, 'f6_10')}</td>
        <td class="td-center">${acima10 > 0 ? `<span class="faixa-chip faixa-ofensor-critico">${fmtP(acima10, 'f10_mais')}</span>` : '<span class="num-zero">0</span>'}</td>
        <td class="td-center">${row.media_dias ?? '—'}</td>
        <td class="td-center">${fmtP(ger, 'total', '1')}</td>
        <td class="td-center">${faltam > 0 ? `<strong>${fmtP(faltam, 'total', '0')}</strong>` : '<span class="num-zero">0</span>'}</td>
        <td class="td-center">
          <div class="barra-wrapper">
            <div class="barra-progresso ${barraClass}" style="width:${Math.min(pct, 100)}%"></div>
            <span class="barra-label">${pct}%</span>
          </div>
        </td>
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
  modalOrdensState._painel = null;
  document.getElementById('modal-thead-row').innerHTML = MODAL_THEAD_PADRAO;
  titulo.textContent = `Ordens de Reparo - ${cluster}`;
  subtitulo.textContent = `Faixa: ${faixaLabel[faixaKey] || faixaKey}`;
  body.innerHTML = '<tr><td colspan="9" class="td-loading">Carregando...</td></tr>';

  try {
    const queryFiltros = buildQueryString();
    const sep = queryFiltros ? '&' : '?';
    const res = await fetch(`/api/cluster/${encodeURIComponent(cluster)}/ordens${queryFiltros}${sep}faixa=${faixaKey}`);
    if (!res.ok) throw new Error(`Erro HTTP ${res.status}`);
    const data = await res.json();
    if (data.erro) throw new Error(data.erro);

    if (!data.ordens || data.ordens.length === 0) {
      body.innerHTML = '<tr><td colspan="9" class="td-loading">Nenhuma ordem encontrada.</td></tr>';
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

    body.innerHTML = ordenarPorGerenciamento(data.ordens, anotacoesMap).map(o => {
      const codSs = o.COD_SS ?? '';
      const anot = anotacoesMap[codSs];
      const temAnotacao = !!(anot && (anot.status_prev || anot.previsao || anot.observacao));
      const btnCls = temAnotacao ? 'btn-gerenciar btn-gerenciado' : 'btn-gerenciar';
      const btnTitle = temAnotacao
        ? `Gerenciado: ${anot.status_prev || ''}${anot.previsao ? ' | Prev: ' + new Date(anot.previsao).toLocaleString('pt-BR') : ''}`
        : 'Enviar gerenciamento';
      return `
      <tr>
        <td class="td-center">
          <button class="${btnCls}" title="${btnTitle.replace(/"/g, '&quot;')}"
            onclick="abrirModalAnotacao('${codSs.replace(/'/g, "\\'")}')">
            ${temAnotacao ? '✓ Gerenciado' : 'Gerenciar'}
          </button>
        </td>
        <td>${codSs || '—'}</td>
        <td>${o.CLUSTER_ ?? '—'}</td>
        <td>${o.STATUS ?? '—'}</td>
        <td>${o.STATUS_REASON ?? '—'}</td>
        <td>${o.DATA_ABERTURA ? new Date(o.DATA_ABERTURA).toLocaleDateString('pt-BR') : '—'}</td>
        <td class="td-center">${o.dias_abertos ?? '—'}</td>${celulasAnotacao(anot)}
      </tr>`;
    }).join('');
  } catch (err) {
    body.innerHTML = `<tr><td colspan="9" class="td-loading">Erro ao carregar: ${err.message}</td></tr>`;
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
  if (modalOrdensState._painel) {
    url = `/api/tecnica/painel/ordens/export${montarQueryPainel()}`;
  } else if (modalOrdensState._tecnica) {
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
  modalOrdensState._painel = null;

  titulo.textContent    = causa ? `Pendências Técnicas — ${causa}` : 'Pendências Técnicas — Todas as causas';
  subtitulo.textContent = statusReason ? `Status Reason: ${statusReason}` : 'Todos os Status Reasons';
  document.getElementById('modal-thead-row').innerHTML = MODAL_THEAD_TECNICA;
  body.innerHTML = '<tr><td colspan="10" class="td-loading">Carregando...</td></tr>';
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');

  const qs = buildQueryString();
  const sep = qs ? '&' : '?';
  carregarOrdensTecnicaModal(`/api/tecnica/ordens${qs}${sep}causa=${encodeURIComponent(causa)}&statusReason=${encodeURIComponent(statusReason)}`);
}

// Busca ordens de pendência técnica e preenche o modal (usado pela tabela de causas e pela visão de gestão)
async function carregarOrdensTecnicaModal(url) {
  const body = document.getElementById('modal-ordens-body');
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Erro HTTP ${res.status}`);
    const data = await res.json();
    if (data.erro) throw new Error(data.erro);

    if (!data.ordens || data.ordens.length === 0) {
      body.innerHTML = '<tr><td colspan="10" class="td-loading">Nenhuma ordem encontrada.</td></tr>';
      return;
    }

    const codSsList = data.ordens.map(o => o.COD_SS).filter(Boolean);
    let anotacoesMap = {};
    if (codSsList.length) {
      const aQs = codSsList.map(c => `codSs=${encodeURIComponent(c)}`).join('&');
      const aRes = await fetch(`/api/anotacoes?${aQs}`);
      if (aRes.ok) anotacoesMap = await aRes.json();
    }

    body.innerHTML = ordenarPorGerenciamento(data.ordens, anotacoesMap).map(o => {
      const codSs = o.COD_SS ?? '';
      const anot = anotacoesMap[codSs];
      const temAnotacao = !!(anot && (anot.status_prev || anot.previsao || anot.observacao));
      const btnCls = temAnotacao ? 'btn-gerenciar btn-gerenciado' : 'btn-gerenciar';
      const btnTitle = temAnotacao
        ? `Gerenciado: ${anot.status_prev || ''}${anot.previsao ? ' | Prev: ' + new Date(anot.previsao).toLocaleString('pt-BR') : ''}`
        : 'Enviar gerenciamento';
      return `
      <tr>
        <td class="td-center">
          <button class="${btnCls}" title="${btnTitle.replace(/"/g, '&quot;')}"
            onclick="abrirModalAnotacao('${codSs.replace(/'/g, "\\'")}')">
            ${temAnotacao ? '✓ Gerenciado' : 'Gerenciar'}
          </button>
        </td>
        <td>${codSs || '—'}</td>
        <td>${o.CLUSTER_ ?? '—'}</td>
        <td>${o.STATUS ?? '—'}</td>
        <td>${o.STATUS_REASON ?? '—'}</td>
        <td>${o.DATA_ABERTURA ? new Date(o.DATA_ABERTURA).toLocaleDateString('pt-BR') : '—'}</td>
        <td class="td-center">${o.dias_abertos ?? '—'}</td>
        <td class="td-center"><strong>${o.dias_pendencia ?? '—'}</strong></td>${celulasAnotacao(anot)}
      </tr>`;
    }).join('');
  } catch (err) {
    body.innerHTML = `<tr><td colspan="10" class="td-loading">Erro ao carregar: ${err.message}</td></tr>`;
  }
}

// ── Modal da Visão de Gestão (faixas de tempo na pendência) ───────────────

const FAIXA_PENDENCIA_LABEL = {
  total: 'Todas as faixas',
  f0_2: '0-2 dias',
  f3_5: '3-5 dias',
  f6_10: '6-10 dias',
  f10_mais: 'Acima de 10 dias'
};

function montarQueryPainel() {
  const { faixa, cluster, gerenciado } = modalOrdensState._painel;
  const qs = buildQueryString();
  const sep = qs ? '&' : '?';
  let url = `${qs}${sep}faixa=${encodeURIComponent(faixa)}`;
  if (cluster) url += `&cluster=${encodeURIComponent(cluster)}`;
  if (gerenciado === '0' || gerenciado === '1') url += `&gerenciado=${gerenciado}`;
  return url;
}

function abrirModalPainel(faixaKey, clusterEnc = '', gerenciado = '') {
  const cluster = clusterEnc ? decodeURIComponent(clusterEnc) : '';
  const modal = document.getElementById('modal-ordens');
  const body = document.getElementById('modal-ordens-body');

  modalOrdensState.cluster = '';
  modalOrdensState.faixa = '';
  modalOrdensState._tecnica = null;
  modalOrdensState._painel = { faixa: faixaKey, cluster, gerenciado: String(gerenciado) };

  document.getElementById('modal-titulo').textContent = `Pendências Técnicas — ${cluster || 'Todos os clusters'}`;
  const partes = [`Tempo na pendência: ${FAIXA_PENDENCIA_LABEL[faixaKey] || faixaKey}`];
  if (String(gerenciado) === '1') partes.push('Somente gerenciadas');
  if (String(gerenciado) === '0') partes.push('Faltam gerenciar');
  document.getElementById('modal-subtitulo').textContent = partes.join(' | ');
  document.getElementById('modal-thead-row').innerHTML = MODAL_THEAD_TECNICA;
  body.innerHTML = '<tr><td colspan="10" class="td-loading">Carregando...</td></tr>';
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');

  carregarOrdensTecnicaModal(`/api/tecnica/painel/ordens${montarQueryPainel()}`);
}

// ── Modal Gerenciamento (anotação + histórico) ────────────────────────────

const anotacaoState = { codSs: '' };

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

async function abrirModalAnotacao(codSs) {
  anotacaoState.codSs = codSs;
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

  // Carrega o último gerenciamento para facilitar a edição
  try {
    const res = await fetch(`/api/anotacoes?codSs=${encodeURIComponent(codSs)}`);
    if (res.ok) {
      const mapa = await res.json();
      const a = mapa[codSs];
      if (a) {
        if (a.previsao) {
          const d = new Date(a.previsao);
          const pad = n => String(n).padStart(2, '0');
          document.getElementById('anotacao-data').value =
            `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
          setHoraSelect(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
        }
        document.getElementById('anotacao-status').value = a.status_prev || '';
        document.getElementById('anotacao-obs').value = a.observacao || '';
      }
    }
  } catch (_) { /* ignora erro de carregamento */ }
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
    previsao: dataPrev ? `${dataPrev}T${horaPrev}` : null,
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

    // Atualiza o botão e as colunas de anotação na linha sem recarregar o modal
    const btnLinha = document.querySelector(`button.btn-gerenciar[onclick*="${CSS.escape(anotacaoState.codSs)}"]`);
    if (btnLinha) {
      btnLinha.classList.add('btn-gerenciado');
      btnLinha.textContent = '✓ Gerenciado';
      const linha = btnLinha.closest('tr');
      if (linha) {
        const prevCell = linha.querySelector('.td-anot-prev');
        const statusCell = linha.querySelector('.td-anot-status');
        if (prevCell) prevCell.textContent = payload.previsao
          ? new Date(payload.previsao).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
          : '—';
        if (statusCell) statusCell.textContent = payload.status_prev || '—';
      }
    }

    // Mantém a tela aberta, atualiza o histórico e volta para a visão de histórico
    carregarHistorico(anotacaoState.codSs);
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

// ── Init ──────────────────────────────────────────────────────────────────
(async () => {
  await carregarRegionais();
  await carregarTecnologias();
  await carregarDados();
})();
