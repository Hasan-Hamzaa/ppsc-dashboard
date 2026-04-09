const express = require('express');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_PATH = path.join(ROOT, 'data.json');
const GITHUB_API_BASE = 'https://api.github.com';

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

function getGitHubConfig() {
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || 'main';
    const filePath = process.env.GITHUB_DATA_PATH || 'data.json';

    if (!token || !owner || !repo) {
        throw new Error('GitHub is not configured. Set GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO.');
    }

    return {
        token,
        owner,
        repo,
        branch,
        filePath
    };
}

function toBase64Utf8(value) {
    return Buffer.from(value, 'utf8').toString('base64');
}

async function githubRequest(url, options) {
    const response = await fetch(url, options);
    let body = null;

    try {
        body = await response.json();
    } catch (error) {
        body = null;
    }

    return { response, body };
}

async function getRemoteFileSha(config) {
    const encodedPath = encodeURIComponent(config.filePath);
    const url = `${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}/contents/${encodedPath}?ref=${encodeURIComponent(config.branch)}`;
    const { response, body } = await githubRequest(url, {
        method: 'GET',
        headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${config.token}`,
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'ppsc-dashboard'
        }
    });

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        const details = body && body.message ? body.message : `status ${response.status}`;
        throw new Error(`GitHub read failed: ${details}`);
    }

    return body && body.sha ? body.sha : null;
}

async function commitFileToGitHub(config, canonical, commitMessage) {
    const sha = await getRemoteFileSha(config);
    const encodedPath = encodeURIComponent(config.filePath);
    const url = `${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}/contents/${encodedPath}`;
    const payload = {
        message: commitMessage,
        content: toBase64Utf8(`${JSON.stringify(canonical, null, 2)}\n`),
        branch: config.branch
    };

    if (sha) {
        payload.sha = sha;
    }

    const { response, body } = await githubRequest(url, {
        method: 'PUT',
        headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${config.token}`,
            'Content-Type': 'application/json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'ppsc-dashboard'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const details = body && body.message ? body.message : `status ${response.status}`;
        throw new Error(`GitHub commit failed: ${details}`);
    }

    return {
        commitSha: body && body.commit && body.commit.sha ? body.commit.sha : null,
        htmlUrl: body && body.commit && body.commit.html_url ? body.commit.html_url : null
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

app.post('/api/github/commit', async (req, res) => {
    try {
        const canonical = buildCanonicalData(req.body);
        const config = getGitHubConfig();
        const message = `dashboard: update maintenance data (${new Date().toISOString()})`;

        const commitResult = await commitFileToGitHub(config, canonical, message);
        await fs.writeFile(DATA_PATH, `${JSON.stringify(canonical, null, 2)}\n`, 'utf8');

        res.status(200).json({
            ok: true,
            updatedAt: canonical.updatedAt,
            commitSha: commitResult.commitSha,
            url: commitResult.htmlUrl
        });
    } catch (error) {
        res.status(400).json({ error: error.message || 'GitHub commit failed' });
    }
});

app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Dashboard running at http://localhost:${PORT}`);
});
