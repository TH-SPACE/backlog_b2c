const ExcelJS = require('exceljs');
const backlogModel = require('../models/backlogModel');

function parseFiltros(query) {
  const filtros = {};
  if (query.regionais) {
    filtros.regionais = Array.isArray(query.regionais) ? query.regionais : [query.regionais];
  }
  if (query.tecnologias) {
    filtros.tecnologias = Array.isArray(query.tecnologias) ? query.tecnologias : [query.tecnologias];
  }
  return filtros;
}

function parseClustersTecnica(query) {
  if (!query.clustersTecnica) return [];
  return Array.isArray(query.clustersTecnica) ? query.clustersTecnica : [query.clustersTecnica];
}

// Gera e envia um .xlsx com uma aba por item de `abas` ({ nome, rows })
async function enviarXlsx(res, filename, abas) {
  const workbook = new ExcelJS.Workbook();

  for (const { nome, rows } of abas) {
    const ws = workbook.addWorksheet(nome);
    if (!rows || rows.length === 0) {
      ws.addRow(['Sem dados para os filtros atuais']);
      continue;
    }

    const headers = Object.keys(rows[0]);
    ws.columns = headers.map(h => ({ header: h, key: h }));
    for (const row of rows) ws.addRow(row);

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF660099' } };
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

    // Largura das colunas pelo conteúdo (amostra das primeiras 200 linhas)
    const amostra = rows.slice(0, 200);
    headers.forEach((h, i) => {
      let max = h.length;
      let temData = false;
      for (const row of amostra) {
        const v = row[h];
        if (v instanceof Date) { temData = true; if (max < 16) max = 16; }
        else { const len = String(v ?? '').length; if (len > max) max = len; }
      }
      const col = ws.getColumn(i + 1);
      col.width = Math.min(Math.max(max + 2, 10), 45);
      if (temData) col.numFmt = 'dd/mm/yyyy hh:mm';
    });
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
}

class BacklogController {
  async apiRegionais(req, res) {
    try {
      const regionais = await backlogModel.getRegionais();
      res.json({ regionais });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  }

  async apiTecnologias(req, res) {
    try {
      const tecnologias = await backlogModel.getTecnologias();
      res.json({ tecnologias });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  }

  async apiDados(req, res) {
    try {
      const filtros = parseFiltros(req.query);
      const clustersTecnica = parseClustersTecnica(req.query);
      const filtrosTecnica = { ...filtros, clustersTecnica };
      const [resumo, porCluster, pendenciasTecnicas] = await Promise.all([
        backlogModel.getResumoGeral(filtros),
        backlogModel.getBacklogPorCluster(filtros),
        backlogModel.getPendenciasTecnicas(filtrosTecnica)
      ]);
      res.json({
        resumo,
        porCluster,
        pendenciasTecnicas,
        atualizadoEm: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      });
    } catch (err) {
      console.error('Erro ao carregar dashboard:', err);
      res.status(500).json({ erro: err.message });
    }
  }

  async apiExportGeral(req, res) {
    try {
      const filtros = parseFiltros(req.query);
      const [resumoCluster, ordens] = await Promise.all([
        backlogModel.getBacklogPorCluster(filtros),
        backlogModel.getOrdensGeral(filtros)
      ]);
      const dataArquivo = new Date().toISOString().slice(0, 10);
      await enviarXlsx(res, `backlog_${dataArquivo}.xlsx`, [
        { nome: 'Resumo por Cluster', rows: resumoCluster },
        { nome: 'Ordens', rows: ordens }
      ]);
    } catch (err) {
      if (res.headersSent) return res.end();
      res.status(500).json({ erro: err.message });
    }
  }

  async apiCluster(req, res) {
    try {
      const { cluster } = req.params;
      const filtros = parseFiltros(req.query);
      const detalhes = await backlogModel.getDetalhesPorCluster(cluster, filtros);
      res.json({
        cluster,
        detalhes,
        atualizadoEm: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      });
    } catch (err) {
      console.error('Erro ao carregar cluster:', err);
      res.status(500).json({ erro: err.message });
    }
  }

  async apiPainelTecnica(req, res) {
    try {
      const filtros = parseFiltros(req.query);
      const painel = await backlogModel.getPainelTecnica(filtros);
      res.json({
        ...painel,
        atualizadoEm: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      });
    } catch (err) {
      console.error('Erro ao carregar painel técnica:', err);
      res.status(500).json({ erro: err.message });
    }
  }

  async apiOrdensPainelTecnica(req, res) {
    try {
      const filtros = parseFiltros(req.query);
      const { faixa, cluster, gerenciado } = req.query;
      const ordens = await backlogModel.getOrdensPainelTecnica(filtros, { faixa, cluster, gerenciado });
      res.json({ faixa, cluster, gerenciado, total: ordens.length, ordens });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  }

  async apiOrdensPainelTecnicaExport(req, res) {
    try {
      const filtros = parseFiltros(req.query);
      const { faixa, cluster, gerenciado } = req.query;
      const ordens = await backlogModel.getOrdensPainelTecnica(filtros, { faixa, cluster, gerenciado, todasColunas: true });
      const safeFaixa = String(faixa || 'total').replace(/[^a-zA-Z0-9_-]/g, '_');
      await enviarXlsx(res, `pendencias_tecnicas_${safeFaixa}.xlsx`, [
        { nome: 'Ordens', rows: ordens }
      ]);
    } catch (err) {
      if (res.headersSent) return res.end();
      res.status(500).json({ erro: err.message });
    }
  }

  async apiOrdensTecnicas(req, res) {
    try {
      const { causa, statusReason } = req.query;
      const filtros = parseFiltros(req.query);
      const clustersTecnica = parseClustersTecnica(req.query);
      if (clustersTecnica.length) filtros.clustersTecnica = clustersTecnica;
      const ordens = await backlogModel.getOrdensTecnicasPorCausa(causa || null, statusReason || null, filtros);
      res.json({ causa, statusReason, total: ordens.length, ordens });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  }

  async apiOrdensTecnicasExport(req, res) {
    try {
      const { causa, statusReason } = req.query;
      const filtros = parseFiltros(req.query);
      const clustersTecnica = parseClustersTecnica(req.query);
      if (clustersTecnica.length) filtros.clustersTecnica = clustersTecnica;
      const ordens = await backlogModel.getOrdensTecnicasPorCausa(causa || null, statusReason || null, filtros, { todasColunas: true });
      const safeCausa = String(causa || 'tecnica').replace(/[^a-zA-Z0-9_-]/g, '_');
      await enviarXlsx(res, `ordens_tecnica_${safeCausa}.xlsx`, [
        { nome: 'Ordens', rows: ordens }
      ]);
    } catch (err) {
      if (res.headersSent) return res.end();
      res.status(500).json({ erro: err.message });
    }
  }

  async apiOrdens(req, res) {
    try {
      const { cluster } = req.params;
      const { faixa } = req.query;
      const filtros = parseFiltros(req.query);
      const ordens = await backlogModel.getOrdensPorClusterFaixa(cluster, faixa, filtros);
      res.json({
        cluster,
        faixa,
        total: ordens.length,
        ordens
      });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  }

  async apiOrdensExport(req, res) {
    try {
      const { cluster } = req.params;
      const { faixa } = req.query;
      const filtros = parseFiltros(req.query);
      const ordens = await backlogModel.getOrdensPorClusterFaixa(cluster, faixa, filtros, { todasColunas: true });
      const safeCluster = String(cluster || 'cluster').replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeFaixa = String(faixa || 'faixa').replace(/[^a-zA-Z0-9_-]/g, '_');
      await enviarXlsx(res, `ordens_${safeCluster}_${safeFaixa}.xlsx`, [
        { nome: 'Ordens', rows: ordens }
      ]);
    } catch (err) {
      if (res.headersSent) return res.end();
      res.status(500).json({ erro: err.message });
    }
  }
  async apiAgendaDia(req, res) {
    try {
      const filtros = parseFiltros(req.query);
      if (req.query.periodo) filtros.periodo = req.query.periodo;
      const agenda = await backlogModel.getAgendaDia(filtros);
      res.json({ agenda });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  }

  async apiGetAnotacoesBatch(req, res) {
    try {
      const lista = req.query.codSs
        ? (Array.isArray(req.query.codSs) ? req.query.codSs : [req.query.codSs])
        : [];
      const mapa = await backlogModel.getAnotacoesBatch(lista);
      res.json(mapa);
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  }

  async apiHistoricoAnotacoes(req, res) {
    try {
      const { codSs } = req.params;
      const historico = await backlogModel.getHistoricoAnotacoes(codSs);
      res.json({ historico });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  }

  async apiSalvarAnotacao(req, res) {
    try {
      const { codSs } = req.params;
      const { previsao, status_prev, observacao } = req.body;
      if (!codSs) return res.status(400).json({ erro: 'codSs é obrigatório' });
      await backlogModel.upsertAnotacao(codSs, { previsao, status_prev, observacao });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  }
}

module.exports = new BacklogController();
