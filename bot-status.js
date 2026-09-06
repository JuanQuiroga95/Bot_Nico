import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { createRequire } from 'node:module';
import { normalizeMedia } from './campaign.js';
const require = createRequire(import.meta.url);
// Reutiliza el mismo codificador que qrcode-terminal; sin servicios externos.
const QRCode = require('qrcode-terminal/vendor/QRCode');
const levels = require('qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel');

export function qrToSvg(value) {
    const qr = new QRCode(-1, levels.M);
    qr.addData(value);
    qr.make();
    const size = qr.getModuleCount();
    const border = 4;
    const dimension = size + border * 2;
    const modules = [];
    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            if (qr.isDark(row, col)) modules.push('M' + (col + border) + ' ' + (row + border) + 'h1v1h-1z');
        }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + dimension + ' ' + dimension + '" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d="' + modules.join('') + '" fill="black"/></svg>';
}

export function createBotStatusServer(client, { token = '', keywords = [], campaign = null, now = Date.now } = {}) {
    let state = 'STARTING';
    let qrSvg = null;
    let qrTime = 0;
    const update = next => { state = next; qrSvg = null; qrTime = 0; };
    // La pantalla de carga solo aparece despues de autenticar: el QR pendiente ya fue usado
    // y hay que descartarlo, o el panel seguiria diciendo que espera un escaneo.
    client.on('loading_screen', () => update('LOADING'));
    client.on('qr', qr => {
        state = 'QR';
        qrSvg = qrToSvg(qr);
        qrTime = now();
    });
    client.on('authenticated', () => update('AUTHENTICATED'));
    client.on('ready', () => update('READY'));
    client.on('auth_failure', () => update('AUTH_FAILURE'));
    client.on('disconnected', () => update('DISCONNECTED'));

    const server = createServer(async (request, response) => {
        response.setHeader('Cache-Control', 'no-store, private');
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        const send = (code, value) => { response.writeHead(code); response.end(JSON.stringify(value)); };
        const digest = value => createHash('sha256').update(value).digest();
        const autorizado = () => timingSafeEqual(digest(request.headers.authorization || ''), digest('Bearer ' + token));
        if (request.method === 'GET' && request.url === '/health') return send(200, { ok: true });
        // Encola mensajes de reactivacion. Solo el dashboard, que conoce el token, puede pedirlo.
        if (request.method === 'POST' && request.url === '/send') {
            if (!campaign) return send(404, { error: 'Not found' });
            if (!token) return send(503, { error: 'API_SECRET_TOKEN is not configured' });
            if (!autorizado()) return send(401, { error: 'Unauthorized' });
            let body = '';
            for await (const chunk of request) {
                body += chunk;
                // El tope alto es por la imagen en base64; el texto solo nunca se acerca.
                if (body.length > 16000000) return send(413, { error: 'Payload too large' });
            }
            let payload;
            try { payload = JSON.parse(body || '{}'); } catch { return send(400, { error: 'Invalid JSON' }); }
            const items = payload.items;
            if (!Array.isArray(items) || items.length > 200) return send(400, { error: 'Invalid items' });
            // Una imagen invalida no se ignora en silencio: el vendedor cree que la mando.
            if (payload.media && !normalizeMedia(payload.media)) return send(400, { error: 'La imagen no es valida. Usá JPG, PNG, WEBP o GIF de hasta 8 MB.' });
            return send(200, { queued: campaign.enqueue(items, payload.media ?? null), ...campaign.stats() });
        }
        if (request.method !== 'GET') { response.setHeader('Allow', 'GET, POST'); return send(405, { error: 'Method not allowed' }); }
        if (request.url !== '/status') return send(404, { error: 'Not found' });
        if (!token) return send(503, { error: 'API_SECRET_TOKEN is not configured' });
        if (!autorizado()) return send(401, { error: 'Unauthorized' });
        const fresh = qrSvg && now() - qrTime < 60000;
        return send(200, {
            state, qrSvg: fresh ? qrSvg : null, qrUpdatedAt: fresh ? new Date(qrTime).toISOString() : null,
            keywords, campaign: campaign ? campaign.stats() : null,
        });
    });
    server.requestTimeout = 10000;
    server.headersTimeout = 10000;
    return server;
}
