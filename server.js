require('dotenv').config();
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

const connectionRoutes = require('./src/routes/connection');
const logRoutes = require('./src/routes/logs');
const TailManager = require('./src/ws/tailManager');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/tail' });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', connectionRoutes);
app.use('/api', logRoutes);

wss.on('connection', (ws) => {
  new TailManager(ws);
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';
server.listen(PORT, HOST, () => {
  console.log(`AIC Sentinel running at http://${HOST}:${PORT}`);
});
