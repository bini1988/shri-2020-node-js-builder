const https = require('https');
const axios = require('axios');
const conf = require('./server-conf.json');
const Server = require('./src/server');

const {
  port, hostname, apiBaseUrl, apiToken,
} = conf;
const api = axios.create({
  baseURL: apiBaseUrl,
  headers: { Authorization: `Bearer ${apiToken}` },
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
});

Server.create({ port, hostname, api }).run();
