const pool = require('../config/database');

// Garante a tabela de anotações ao iniciar
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS backlog_anotacoes (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        cod_ss         VARCHAR(100) NOT NULL,
        previsao       DATETIME     NULL,
        status_prev    VARCHAR(100) NOT NULL DEFAULT '',
        observacao     TEXT         NULL,
        criado_em      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizado_em  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_cod_ss (cod_ss),
        INDEX idx_cod_ss (cod_ss)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (e) {
    console.error('[backlog_anotacoes] Erro ao criar tabela:', e.message);
  }
})();

// Colunas usadas nos modais de ordens (evita SELECT * em listas grandes)
const COLUNAS_MODAL = 'COD_SS, CLUSTER_, REGIONAL, STATUS, DATA_ABERTURA';

class BacklogModel {
  // ÚNICO lugar que define o que é RETIRADO da base antes de exibir no painel.
  // Editar aqui reflete em: dashboard, filtros, agenda, modais e exports.
  _condicoesBase(alias = '') {
    const p = alias ? `${alias}.` : '';
    return [
      `UPPER(TRIM(COALESCE(${p}STATUS, ''))) NOT IN ('CANCELADA', 'ENCERRADA')`,
      `UPPER(TRIM(COALESCE(${p}STATUS_REASON, ''))) <> 'ABERTA MASSIVA'`,
      `UPPER(TRIM(COALESCE(${p}DETAIL, ''))) NOT LIKE 'PREV%'`
    ];
  }

  // ÚNICO lugar que define o que conta como "pendência técnica"
  _condicoesTecnica() {
    return [
      "UPPER(TRIM(STATUS)) = 'PENDENTE'",
      "UPPER(TRIM(STATUS_REASON)) IN ('TECNICA', 'TECNICA + CABEAMENTO')"
    ];
  }

  _buildWhere(filtros = {}) {
    const conds = this._condicoesBase();
    const params = [];
    if (filtros.regionais && filtros.regionais.length > 0) {
      conds.push(`REGIONAL IN (${filtros.regionais.map(() => '?').join(',')})`);
      params.push(...filtros.regionais);
    }
    if (filtros.tecnologias && filtros.tecnologias.length > 0) {
      conds.push(`PHYSICAL_LINK_MEDIA_TYPE IN (${filtros.tecnologias.map(() => '?').join(',')})`);
      params.push(...filtros.tecnologias);
    }
    return {
      where: conds.length > 0 ? 'WHERE ' + conds.join(' AND ') : '',
      params
    };
  }

  async getRegionais() {
    const query = `
      SELECT DISTINCT REGIONAL
      FROM backlog_elos
      WHERE REGIONAL IS NOT NULL
        AND REGIONAL <> ''
        AND ${this._condicoesBase().join('\n        AND ')}
      ORDER BY REGIONAL ASC
    `;
    const [rows] = await pool.query(query);
    return rows.map(r => r.REGIONAL);
  }

  async getTecnologias() {
    const query = `
      SELECT DISTINCT PHYSICAL_LINK_MEDIA_TYPE
      FROM backlog_elos
      WHERE PHYSICAL_LINK_MEDIA_TYPE IS NOT NULL
        AND TRIM(PHYSICAL_LINK_MEDIA_TYPE) <> ''
        AND ${this._condicoesBase().join('\n        AND ')}
      ORDER BY PHYSICAL_LINK_MEDIA_TYPE ASC
    `;
    const [rows] = await pool.query(query);
    return rows.map(r => r.PHYSICAL_LINK_MEDIA_TYPE);
  }

  async getBacklogPorCluster(filtros = {}) {
    const { where, params } = this._buildWhere(filtros);
    const query = `
      SELECT
        CLUSTER_,
        COUNT(*) AS total,
        SUM(CASE WHEN DATEDIFF(NOW(), DATA_ABERTURA) = 0 THEN 1 ELSE 0 END) AS faixa_hoje,
        SUM(CASE WHEN DATEDIFF(NOW(), DATA_ABERTURA) = 1 THEN 1 ELSE 0 END) AS faixa_1_dia,
        SUM(CASE WHEN DATEDIFF(NOW(), DATA_ABERTURA) = 2 THEN 1 ELSE 0 END) AS faixa_2_dias,
        SUM(CASE WHEN DATEDIFF(NOW(), DATA_ABERTURA) = 3 THEN 1 ELSE 0 END) AS faixa_3_dias,
        SUM(CASE WHEN DATEDIFF(NOW(), DATA_ABERTURA) = 4 THEN 1 ELSE 0 END) AS faixa_4_dias,
        SUM(CASE WHEN DATEDIFF(NOW(), DATA_ABERTURA) BETWEEN 5 AND 7 THEN 1 ELSE 0 END) AS faixa_5_7,
        SUM(CASE WHEN DATEDIFF(NOW(), DATA_ABERTURA) BETWEEN 8 AND 15 THEN 1 ELSE 0 END) AS faixa_8_15,
        SUM(CASE WHEN DATEDIFF(NOW(), DATA_ABERTURA) > 15 THEN 1 ELSE 0 END) AS faixa_15_mais,
        SUM(CASE WHEN DATEDIFF(NOW(), DATA_ABERTURA) > 4 THEN 1 ELSE 0 END) AS ofensores,
        SUM(CASE WHEN DATEDIFF(NOW(), DATA_ABERTURA) <= 4 THEN 1 ELSE 0 END) AS dentro_prazo
      FROM backlog_elos
      ${where}
      GROUP BY CLUSTER_
      ORDER BY ofensores DESC, CLUSTER_ ASC
    `;
    const [rows] = await pool.query(query, params);
    return rows;
  }

  async getOrdensGeral(filtros = {}) {
    const { where, params } = this._buildWhere(filtros);
    const query = `
      SELECT
        *,
        DATEDIFF(NOW(), DATA_ABERTURA) AS dias_abertos,
        CASE WHEN DATEDIFF(NOW(), DATA_ABERTURA) > 4 THEN 1 ELSE 0 END AS ofensor
      FROM backlog_elos
      ${where}
      ORDER BY DATEDIFF(NOW(), DATA_ABERTURA) DESC, DATA_ABERTURA ASC
    `;
    const [rows] = await pool.query(query, params);
    return rows;
  }

  async getDetalhesPorCluster(cluster, filtros = {}) {
    const { where, params } = this._buildWhere(filtros);
    const clusterCond = where ? `${where} AND CLUSTER_ = ?` : 'WHERE CLUSTER_ = ?';
    const query = `
      SELECT
        *,
        DATEDIFF(NOW(), DATA_ABERTURA) AS dias_abertos,
        CASE WHEN DATEDIFF(NOW(), DATA_ABERTURA) > 4 THEN 1 ELSE 0 END AS ofensor
      FROM backlog_elos
      ${clusterCond}
      ORDER BY DATEDIFF(NOW(), DATA_ABERTURA) DESC
    `;
    const [rows] = await pool.query(query, [...params, cluster]);
    return rows;
  }

  async getResumoGeral(filtros = {}) {
    const { where, params } = this._buildWhere(filtros);
    const query = `
      SELECT
        COUNT(*) AS total_geral,
        SUM(CASE WHEN DATEDIFF(NOW(), DATA_ABERTURA) > 4 THEN 1 ELSE 0 END) AS total_ofensores,
        SUM(CASE WHEN DATEDIFF(NOW(), DATA_ABERTURA) <= 4 THEN 1 ELSE 0 END) AS total_dentro_prazo,
        COUNT(DISTINCT CLUSTER_) AS total_clusters,
        ROUND(AVG(DATEDIFF(NOW(), DATA_ABERTURA)), 1) AS media_dias_geral
      FROM backlog_elos
      ${where}
    `;
    const [rows] = await pool.query(query, params);
    return rows[0];
  }

  async getDistribuicaoDias(filtros = {}) {
    const { where, params } = this._buildWhere(filtros);
    const query = `
      SELECT
        CASE
          WHEN DATEDIFF(NOW(), DATA_ABERTURA) = 0 THEN 'Hoje'
          WHEN DATEDIFF(NOW(), DATA_ABERTURA) = 1 THEN '1 dia'
          WHEN DATEDIFF(NOW(), DATA_ABERTURA) = 2 THEN '2 dias'
          WHEN DATEDIFF(NOW(), DATA_ABERTURA) = 3 THEN '3 dias'
          WHEN DATEDIFF(NOW(), DATA_ABERTURA) = 4 THEN '4 dias'
          WHEN DATEDIFF(NOW(), DATA_ABERTURA) BETWEEN 5 AND 7 THEN '5-7 dias'
          WHEN DATEDIFF(NOW(), DATA_ABERTURA) BETWEEN 8 AND 15 THEN '8-15 dias'
          ELSE 'Acima de 15 dias'
        END AS faixa,
        COUNT(*) AS quantidade,
        CASE
          WHEN DATEDIFF(NOW(), DATA_ABERTURA) > 4 THEN 1 ELSE 0
        END AS eh_ofensor
      FROM backlog_elos
      ${where}
      GROUP BY faixa, eh_ofensor
      ORDER BY MIN(DATEDIFF(NOW(), DATA_ABERTURA))
    `;
    const [rows] = await pool.query(query, params);
    return rows;
  }

  async getPendenciasTecnicas(filtros = {}) {
    const { where, params } = this._buildWhere(filtros);
    const baseConds = [];
    const paramsTecnica = [...params];
    if (where) {
      baseConds.push(where.replace(/^WHERE\s+/i, ''));
    }
    if (filtros.clustersTecnica && filtros.clustersTecnica.length > 0) {
      baseConds.push(`CLUSTER_ IN (${filtros.clustersTecnica.map(() => '?').join(',')})`);
      paramsTecnica.push(...filtros.clustersTecnica);
    }
    baseConds.push(...this._condicoesTecnica());
    const whereTecnica = `WHERE ${baseConds.join(' AND ')}`;

    const resumoQuery = `
      SELECT
        COUNT(*) AS total_pendencias_tecnicas,
        SUM(CASE WHEN UPPER(TRIM(STATUS_REASON)) = 'TECNICA' THEN 1 ELSE 0 END) AS total_tecnica,
        SUM(CASE WHEN UPPER(TRIM(STATUS_REASON)) = 'TECNICA + CABEAMENTO' THEN 1 ELSE 0 END) AS total_tecnica_cabeamento
      FROM backlog_elos
      ${whereTecnica}
    `;

    const causasQuery = `
      SELECT
        COALESCE(NULLIF(TRIM(NOTDONEREASON), ''), 'SEM INFORMACAO') AS causa,
        SUM(CASE WHEN UPPER(TRIM(STATUS_REASON)) = 'TECNICA' THEN 1 ELSE 0 END) AS qtd_tecnica,
        SUM(CASE WHEN UPPER(TRIM(STATUS_REASON)) = 'TECNICA + CABEAMENTO' THEN 1 ELSE 0 END) AS qtd_tecnica_cabeamento,
        COUNT(*) AS total
      FROM backlog_elos
      ${whereTecnica}
      GROUP BY COALESCE(NULLIF(TRIM(NOTDONEREASON), ''), 'SEM INFORMACAO')
      ORDER BY total DESC, causa ASC
      LIMIT 30
    `;

    const [[resumoRows], [causasRows]] = await Promise.all([
      pool.query(resumoQuery, paramsTecnica),
      pool.query(causasQuery, paramsTecnica)
    ]);

    return {
      resumo: resumoRows[0] || {
        total_pendencias_tecnicas: 0,
        total_tecnica: 0,
        total_tecnica_cabeamento: 0
      },
      causas: causasRows
    };
  }

  _getFaixaCondition(faixaKey) {
    const expr = 'DATEDIFF(NOW(), DATA_ABERTURA)';
    const mapa = {
      total: '1=1',
      hoje: `${expr} = 0`,
      dia_1: `${expr} = 1`,
      dia_2: `${expr} = 2`,
      dia_3: `${expr} = 3`,
      dia_4: `${expr} = 4`,
      dia_5_7: `${expr} BETWEEN 5 AND 7`,
      dia_8_15: `${expr} BETWEEN 8 AND 15`,
      dia_15_mais: `${expr} > 15`,
      ofensores: `${expr} > 4`
    };
    return mapa[faixaKey] || null;
  }

  async getOrdensPorClusterFaixa(cluster, faixaKey, filtros = {}, opcoes = {}) {
    const faixaCondition = this._getFaixaCondition(faixaKey);
    if (!faixaCondition) {
      throw new Error('Faixa inválida');
    }

    const { where, params } = this._buildWhere(filtros);
    const conds = [];
    if (where) {
      conds.push(where.replace(/^WHERE\s+/i, ''));
    }
    conds.push('CLUSTER_ = ?');
    conds.push(faixaCondition);

    const colunas = opcoes.todasColunas ? '*' : COLUNAS_MODAL;
    const query = `
      SELECT
        ${colunas},
        DATEDIFF(NOW(), DATA_ABERTURA) AS dias_abertos
      FROM backlog_elos
      WHERE ${conds.join(' AND ')}
      ORDER BY DATEDIFF(NOW(), DATA_ABERTURA) DESC, DATA_ABERTURA ASC
    `;

    const [rows] = await pool.query(query, [...params, cluster]);
    return rows;
  }

  async getAgendaDia(filtros = {}) {
    const periodo = filtros.periodo || 'hoje';
    const periodoCondicao = {
      hoje:   'DATE(a.previsao) = CURDATE()',
      amanha: 'DATE(a.previsao) = DATE_ADD(CURDATE(), INTERVAL 1 DAY)',
      semana: 'DATE(a.previsao) BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)',
      todos:  'a.previsao IS NOT NULL'
    }[periodo] || 'DATE(a.previsao) = CURDATE()';

    const conds = [
      ...this._condicoesBase('e'),
      periodoCondicao
    ];
    const params = [];
    if (filtros.regionais && filtros.regionais.length > 0) {
      conds.push(`e.REGIONAL IN (${filtros.regionais.map(() => '?').join(',')})`);
      params.push(...filtros.regionais);
    }
    if (filtros.tecnologias && filtros.tecnologias.length > 0) {
      conds.push(`e.PHYSICAL_LINK_MEDIA_TYPE IN (${filtros.tecnologias.map(() => '?').join(',')})`);
      params.push(...filtros.tecnologias);
    }
    const query = `
      SELECT
        a.cod_ss,
        a.previsao,
        a.status_prev,
        a.observacao,
        e.CLUSTER_,
        e.REGIONAL,
        e.STATUS,
        e.DATA_ABERTURA,
        DATEDIFF(NOW(), e.DATA_ABERTURA) AS dias_abertos
      FROM backlog_anotacoes a
      INNER JOIN backlog_elos e ON e.COD_SS = a.cod_ss COLLATE utf8mb4_general_ci
      WHERE ${conds.join(' AND ')}
      ORDER BY a.previsao ASC
    `;
    const [rows] = await pool.query(query, params);
    return rows;
  }

  async getOrdensTecnicasPorCausa(causa, statusReason, filtros = {}, opcoes = {}) {
    const { where, params } = this._buildWhere(filtros);
    const baseParams = [...params];
    const baseConds = [];
    if (where) baseConds.push(where.replace(/^WHERE\s+/i, ''));
    if (filtros.clustersTecnica && filtros.clustersTecnica.length > 0) {
      baseConds.push(`CLUSTER_ IN (${filtros.clustersTecnica.map(() => '?').join(',')})`);
      baseParams.push(...filtros.clustersTecnica);
    }
    baseConds.push(...this._condicoesTecnica());

    if (statusReason) {
      baseConds.push('UPPER(TRIM(STATUS_REASON)) = ?');
      baseParams.push(String(statusReason).toUpperCase());
    }
    if (causa === 'SEM INFORMACAO') {
      baseConds.push("(NOTDONEREASON IS NULL OR TRIM(NOTDONEREASON) = '')");
    } else if (causa) {
      baseConds.push('UPPER(TRIM(NOTDONEREASON)) = ?');
      baseParams.push(String(causa).toUpperCase());
    }

    const colunas = opcoes.todasColunas ? '*' : COLUNAS_MODAL;
    const query = `
      SELECT ${colunas}, DATEDIFF(NOW(), DATA_ABERTURA) AS dias_abertos
      FROM backlog_elos
      WHERE ${baseConds.join(' AND ')}
      ORDER BY DATEDIFF(NOW(), DATA_ABERTURA) DESC, DATA_ABERTURA ASC
    `;
    const [rows] = await pool.query(query, baseParams);
    return rows;
  }

  // ── Anotações ─────────────────────────────────────────────────────────────

  async getAnotacoesBatch(codSsList = []) {
    if (!codSsList.length) return {};
    const placeholders = codSsList.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT cod_ss, previsao, status_prev, observacao, atualizado_em
       FROM backlog_anotacoes
       WHERE cod_ss IN (${placeholders})`,
      codSsList
    );
    const mapa = {};
    for (const r of rows) mapa[r.cod_ss] = r;
    return mapa;
  }

  async upsertAnotacao(codSs, { previsao, status_prev, observacao }) {
    await pool.query(
      `INSERT INTO backlog_anotacoes (cod_ss, previsao, status_prev, observacao)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         previsao      = VALUES(previsao),
         status_prev   = VALUES(status_prev),
         observacao    = VALUES(observacao),
         atualizado_em = CURRENT_TIMESTAMP`,
      [
        String(codSs),
        previsao || null,
        String(status_prev || ''),
        observacao || null
      ]
    );
  }
}

module.exports = new BacklogModel();
