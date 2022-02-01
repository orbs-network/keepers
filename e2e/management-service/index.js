const fs = require('fs');
const express = require('express');
const app = express();
const port = 8080;

let mockState = 'init';

app.get('/status', (req, res) => {
  const data = JSON.parse(fs.readFileSync('./status1.json'));

  data.Payload.CurrentRefTime = getCurrentClockTime() - 600;
  
  if (mockState == 'in-committee') {
    data.Payload.CurrentCommittee.push({
      EthAddress: '98b4d71c78789637364a70f696227ec89e35626c',
      Weight: 20000,
    });
  }
  
  res.send(JSON.stringify(data));
});

app.get('/change-mock-state/:state', (req, res) => {
  const { state } = req.params;
  mockState = state;
  res.status(200).json({ status: 'ok' });
});

app.listen(port, () => console.log('Mock management-service started.'));

// returns UTC clock time in seconds (similar to unix timestamp / Ethereum block time / RefTime)
function getCurrentClockTime() {
  return Math.round(new Date().getTime() / 1000);
}