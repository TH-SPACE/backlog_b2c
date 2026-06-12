document.getElementById('ano').textContent = new Date().getFullYear();

function getClusterParam() {
  const params = new URLSearchParams(window.location.search);
  return params.get('cluster') || '';
}

async function carregarDetalhe() {
  const cluster = getClusterParam();
  const estadoMsg = document.getElementById('estado-msg');
  const thead = document.getElementById('thead-detalhe');
  const tbody = document.getElementById('tbody-detalhe');

  if (!cluster) {
    estadoMsg.innerHTML = '<div class="erro-inline">⚠️ Nenhum cluster informado na URL.</div>';
    return;
  }

  document.getElementById('cluster-nome').textContent = cluster;
  document.getElementById('titulo-cluster').textContent = cluster;
  document.title = `Backlog BDs – Cluster ${cluster}`;

  tbody.innerHTML = '<tr><td class="td-loading">Carregando dados...</td></tr>';
  estadoMsg.innerHTML = '';

  try {
    const res = await fetch(`/api/cluster/${encodeURIComponent(cluster)}`);
    if (!res.ok) throw new Error(`Erro HTTP ${res.status}`);
    const data = await res.json();

    if (data.erro) throw new Error(data.erro);

    document.getElementById('atualizado-em').textContent = data.atualizadoEm;

    const detalhes = data.detalhes || [];
    const total = detalhes.length;
    const ofensores = detalhes.filter(d => d.ofensor).length;
    const ok = total - ofensores;

    document.getElementById('total-cluster').textContent = total;
    document.getElementById('ofensores-cluster').textContent = ofensores;
    document.getElementById('ok-cluster').textContent = ok;

    if (total === 0) {
      thead.innerHTML = '<tr><th>Resultado</th></tr>';
      tbody.innerHTML = '<tr><td class="td-loading">Nenhum registro encontrado para este cluster.</td></tr>';
      return;
    }

    // Colunas dinâmicas (excluindo as que já aparecem como fixas)
    const fixas = ['dias_abertos', 'ofensor', 'DATA_ABERTURA', 'CLUSTER_'];
    const colsDinamicas = Object.keys(detalhes[0]).filter(c => !fixas.includes(c));

    // Cabeçalho
    thead.innerHTML = `
      <tr>
        <th>#</th>
        <th>Data Abertura</th>
        <th>Dias Abertos</th>
        <th>Status</th>
        ${colsDinamicas.map(c => `<th>${c}</th>`).join('')}
      </tr>`;

    // Linhas
    tbody.innerHTML = detalhes.map((row, idx) => {
      const dataFormatada = row.DATA_ABERTURA
        ? new Date(row.DATA_ABERTURA).toLocaleDateString('pt-BR')
        : '—';
      const diasClass = row.ofensor ? 'dias-ofensor' : 'dias-ok';
      const linhaClass = row.ofensor ? 'linha-ofensor' : 'linha-ok';
      const plural = row.dias_abertos !== 1 ? 's' : '';

      return `
        <tr class="${linhaClass}">
          <td class="td-center">${idx + 1}</td>
          <td class="td-center">${dataFormatada}</td>
          <td class="td-center">
            <span class="dias-badge ${diasClass}">${row.dias_abertos} dia${plural}</span>
          </td>
          <td class="td-center">
            ${row.ofensor
              ? '<span class="badge-status badge-status-ofensor">🚨 Ofensor</span>'
              : '<span class="badge-status badge-status-ok">✅ OK</span>'}
          </td>
          ${colsDinamicas.map(c => `<td>${row[c] !== null && row[c] !== undefined ? row[c] : '—'}</td>`).join('')}
        </tr>`;
    }).join('');

  } catch (err) {
    estadoMsg.innerHTML = `<div class="erro-inline">⚠️ Erro: <strong>${err.message}</strong></div>`;
    tbody.innerHTML = '<tr><td class="td-loading">Falha ao carregar.</td></tr>';
  }
}

// Inicia ao carregar a página
carregarDetalhe();
