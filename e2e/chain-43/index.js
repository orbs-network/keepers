const fs = require('fs');
const express = require('express');
const app = express();
const port = 8080;
import { getCurrentClockTime } from 'helpers'

let mockState = 'init';

app.get('/metrics', (req, res) => {
  const data = JSON.parse(fs.readFileSync('./metrics1.json'));

  const now = getCurrentClockTime();
  data.BlockStorage.LastCommit.Value = now * 1e9; // always still syncing
  if (mockState == 'synced') {
    data.BlockStorage.InOrderBlock.BlockTime.Value = now * 1e9;
  }

  res.send(JSON.stringify(data));
});

app.get('/change-mock-state/:state', (req, res) => {
  const { state } = req.params;
  mockState = state;
  res.status(200).json({ status: 'ok' });
});

app.listen(port, () => console.log('Mock vchain started.'));

