import express from 'express';

const app = express();
app.use(express.json());

let balances: Record<string, any> = {
  'EMP-001_LOC-1': { employeeId: 'EMP-001', locationId: 'LOC-1', totalDays: 20, usedDays: 5 },
  'EMP-002_LOC-1': { employeeId: 'EMP-002', locationId: 'LOC-1', totalDays: 10, usedDays: 0 },
};

app.get('/balances', (req, res) => {
  const { employeeId, locationId } = req.query;
  const key = `${employeeId}_${locationId}`;
  const balance = balances[key] || { employeeId, locationId, totalDays: 0, usedDays: 0 };
  console.log(`[HCM] GET /balances for ${key} -> ${balance.totalDays} total`);
  res.json(balance);
});

app.post('/balances/deduct', (req, res) => {
  const { employeeId, locationId, days, requestId } = req.body;
  const key = `${employeeId}_${locationId}`;
  console.log(`[HCM] POST /balances/deduct for ${key}, days: ${days}, req: ${requestId}`);
  
  if (locationId === 'LOC-INVALID') {
    return res.status(400).send({ code: 'INVALID_DIMENSION', message: 'Invalid location' });
  }

  const balance = balances[key];
  if (!balance || (balance.totalDays - balance.usedDays) < days) {
    return res.status(400).send({ code: 'INSUFFICIENT_BALANCE', message: 'Insufficient balance' });
  }
  
  balance.usedDays += days;
  res.json({ success: true, hcmReference: `HCM-${Math.random().toString(36).substr(2, 9)}` });
});

app.post('/balances/restore', (req, res) => {
  const { employeeId, locationId, days, requestId } = req.body;
  const key = `${employeeId}_${locationId}`;
  console.log(`[HCM] POST /balances/restore for ${key}, days: ${days}, req: ${requestId}`);
  if (balances[key]) {
    balances[key].usedDays -= days;
  }
  res.json({ success: true });
});

app.post('/admin/anniversary-bonus', (req, res) => {
  const { employeeId, locationId, bonusDays } = req.body;
  const key = `${employeeId}_${locationId}`;
  console.log(`[HCM] Anniversary Bonus for ${key}: +${bonusDays} days`);
  if (balances[key]) {
    balances[key].totalDays += bonusDays;
  }
  res.json({ success: true });
});

const PORT = 4001;
app.listen(PORT, () => {
  console.log(`[HCM Mock] Source of Truth HCM running on http://localhost:${PORT}`);
});
