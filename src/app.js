const express = require('express');
const cors = require('cors');
const routes = require('./routes/index');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({ message: 'DT22M Backend đang hoạt động' });
});

app.use('/api', routes);

module.exports = app;