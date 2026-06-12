require('dotenv').config();
const express = require('express');
const path = require('path');
const backlogRoutes = require('./routes/backlogRoutes');

const app = express();
const PORT = process.env.PORT || 6262;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api', backlogRoutes);

app.listen(PORT, () => {
  console.log(`✅ Servidor rodando em http://localhost:${PORT}`);
});
