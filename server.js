const express = require('express');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_PATH = path.join(ROOT, 'data.json');

app.use(express.json({ limit: '1mb' }));
app.use(express.static(ROOT));

function isValidEvent(event) {
    if (!event || typeof event !== 'object') {
        return false;
    }

    const required = ['id', 'type', 'bank', 'system', 'impact', 'start', 'end'];
    const hasRequired = required.every((field) => Boolean(event[field]));
    if (!hasRequired) {
        return false;
    }

    const start = new Date(event.start).getTime();
    const end = new Date(event.end).getTime();
    return Number.isFinite(start) && Number.isFinite(end) && end > start;
}

function sanitizeActivity(entry) {
    if (!entry || typeof entry !== 'object') {
        return null;
    }

    if (typeof entry.title !== 'string' || !Number.isFinite(entry.timestamp)) {
        return null;
    }

    return {
        id: entry.id || `ACT-${Date.now()}`,
        type: entry.type || 'report',
        title: entry.title,
        message: entry.message || '',
        timestamp: entry.timestamp
    };
}

function buildCanonicalData(payload) {
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.events)) {
        throw new Error('Payload must include an events array.');
    }

    const events = payload.events.filter(isValidEvent).map((event) => ({
        id: event.id,
        type: event.type,
        bank: event.bank,
        system: event.system,
        impact: event.impact,
        start: event.start,
        end: event.end,
        notes: event.notes || ''
    }));

    if (!events.length) {
        throw new Error('At least one valid event is required.');
    }

    const activities = Array.isArray(payload.activities)
        ? payload.activities.map(sanitizeActivity).filter(Boolean).slice(0, 100)
        : [];

    return {
        version: 1,
        updatedAt: new Date().toISOString(),
        events,
        activities
    };
}

app.get('/api/data', async (req, res) => {
    try {
        const raw = await fs.readFile(DATA_PATH, 'utf8');
        res.type('application/json').send(raw);
    } catch (error) {
        res.status(500).json({ error: 'Could not read data.json' });
    }
});

app.post('/api/data', async (req, res) => {
    try {
        const canonical = buildCanonicalData(req.body);
        await fs.writeFile(DATA_PATH, `${JSON.stringify(canonical, null, 2)}\n`, 'utf8');
        res.status(200).json({ ok: true, updatedAt: canonical.updatedAt });
    } catch (error) {
        res.status(400).json({ error: error.message || 'Invalid data payload' });
    }
});

app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Dashboard running at http://localhost:${PORT}`);
});
