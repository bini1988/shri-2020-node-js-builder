const axios = require('axios');
const conf = require('./agent-conf.json');
const Agent = require('./src/agent');

const {
  port, hostname, serverHost, serverPort,
} = conf;
const api = axios.create({
  baseURL: `http://${serverHost}:${serverPort}`,
});

Agent.create({ port, hostname, api }).run();
