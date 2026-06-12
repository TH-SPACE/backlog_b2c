const express = require('express');
const router = express.Router();
const backlogController = require('../controllers/backlogController');

router.get('/regionais', backlogController.apiRegionais.bind(backlogController));
router.get('/tecnologias', backlogController.apiTecnologias.bind(backlogController));
router.get('/dados', backlogController.apiDados.bind(backlogController));
router.get('/export', backlogController.apiExportGeral.bind(backlogController));
router.get('/cluster/:cluster', backlogController.apiCluster.bind(backlogController));
router.get('/tecnica/ordens', backlogController.apiOrdensTecnicas.bind(backlogController));
router.get('/tecnica/ordens/export', backlogController.apiOrdensTecnicasExport.bind(backlogController));
router.get('/cluster/:cluster/ordens', backlogController.apiOrdens.bind(backlogController));
router.get('/cluster/:cluster/ordens/export', backlogController.apiOrdensExport.bind(backlogController));
router.get('/anotacoes', backlogController.apiGetAnotacoesBatch.bind(backlogController));
router.post('/anotacao/:codSs', backlogController.apiSalvarAnotacao.bind(backlogController));
router.get('/agenda', backlogController.apiAgendaDia.bind(backlogController));

module.exports = router;
