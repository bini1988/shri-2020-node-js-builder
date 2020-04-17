const express = require('express');
const bodyParser = require('body-parser');
const asyncHandler = require('express-async-handler');
const conf = require('./server-conf.json');

const app = express();
const router = express.Router();

app.use(bodyParser.json());

router.post('/notify-agent', asyncHandler(async (req, res) => {
  res.status(200).json({ data: '/notify-agent' });
}));
router.post('/notify-build-result', asyncHandler(async (req, res) => {
  res.status(200).json({ data: '/notify-build-result' });
}));

app.use(router);

app.listen(conf.port, conf.hostname, () => {
  console.log(`Server was successfully started at ${conf.hostname}:${conf.port}`);
});
