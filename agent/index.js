const conf = require('./agent-conf.json');
const Agent = require('./src/agent');
const api = require('./src/server-api');

const { port, hostname } = conf;

Agent.create({ port, hostname, api }).run();
