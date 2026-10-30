#!/usr/bin/env node
// Smoke-test end-to-end du backend Agbajowo.
// Prérequis : backend démarré + base seedée (npm run prisma:seed).
// Usage : node scripts/smoke.mjs   (ou npm run smoke)
// Variables : SMOKE_BASE_URL, SMOKE_TEL, SMOKE_PWD.
import { randomUUID } from 'node:crypto';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3001/api/v1';
const TEL = process.env.SMOKE_TEL ?? '22990000000';
const PWD = process.env.SMOKE_PWD ?? 'Password123!';

let pass = 0;
let fail = 0;
function ok(name, cond, extra = '') {
  if (cond) {
    pass += 1;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    fail += 1;
    console.log(`  \x1b[31m✗\x1b[0m ${name}${extra ? ` — ${extra}` : ''}`);
  }
}
const J = (r) => r.json();
const post = (path, headers, body) =>
  fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });

async function main() {
  console.log(`\nCible : ${BASE}`);
  let H;
  let HJ;

  console.log('\n▶ Santé & authentification');
  {
    const health = await fetch(`${BASE}/health`);
    ok('GET /health = 200', health.status === 200);

    const login = await post('/auth/login', { 'Content-Type': 'application/json' }, { telephone: TEL, password: PWD });
    const b = await J(login);
    ok('login = 200 + jetons', login.status === 200 && !!b.accessToken && !!b.refreshToken, `status ${login.status}`);
    H = { Authorization: `Bearer ${b.accessToken}` };
    HJ = { ...H, 'Content-Type': 'application/json' };

    const me = await fetch(`${BASE}/auth/me`, { headers: H });
    ok('GET /auth/me (token) = 200', me.status === 200);

    const noauth = await fetch(`${BASE}/auth/me`);
    ok('GET /auth/me (sans token) = 401', noauth.status === 401);

    const bad = await post('/auth/login', { 'Content-Type': 'application/json' }, { telephone: TEL, password: 'faux' });
    const bb = await J(bad);
    ok('login KO = 401 + code normalisé', bad.status === 401 && bb.code === 'UNAUTHENTICATED', JSON.stringify(bb));
  }

  let mediaId;
  console.log('\n▶ Média (photo)');
  {
    const fd = new FormData();
    fd.append('file', new Blob([Buffer.from([1, 2, 3, 4, 5, 6])], { type: 'image/jpeg' }), 'p.jpg');
    const r = await fetch(`${BASE}/media`, { method: 'POST', headers: H, body: fd });
    const b = await J(r);
    mediaId = b.id;
    ok('POST /media = 201 + id', r.status === 201 && !!b.id, `status ${r.status}`);
    const get = await fetch(`${BASE}/media/${mediaId}`, { headers: H });
    ok('GET /media/:id = 200', get.status === 200);
  }

  let membreId;
  let contratG1;
  console.log('\n▶ Membre & contrats');
  {
    const r = await post('/membres', HJ, {
      nom: 'Smoke', prenoms: 'Test', telephone: '22970000123', dateNaissance: '1990-01-01',
      lieuNaissance: 'Cotonou', profession: 'Test', quartier: 'Q', arrondissement: '1', commune: 'C', photoId: mediaId,
    });
    const b = await J(r);
    membreId = b.id;
    ok('POST /membres = 201 + numéro', r.status === 201 && !!b.numeroMembre, `status ${r.status}`);

    const g1 = await J(await post('/contrats', HJ, { membreId, groupe: 'GROUPE_1', miseAmount: 1000, startDate: '2026-07-01' }));
    contratG1 = g1.id;
    ok('contrat G1 : cible 372, journalier', g1.targetMises === 372 && g1.cadence === 'QUOTIDIENNE');

    const g2 = await J(await post('/contrats', HJ, { membreId, groupe: 'GROUPE_2', miseAmount: 500, startDate: '2026-07-01' }));
    ok('contrat G2 : cible 96, tous les 5 j', g2.targetMises === 96 && g2.intervalleJours === 5);
  }

  console.log('\n▶ Collecte');
  {
    const versId = randomUUID();
    const v = await J(await post('/versements', HJ, { id: versId, contratId: contratG1, misesCount: 2 }));
    ok('encaisser 2 mises = 2000 + reçu', Number(v.amount) === 2000 && !!v.receiptNumber);
    const again = await J(await post('/versements', HJ, { id: versId, contratId: contratG1, misesCount: 2 }));
    ok('idempotence (même id → même versement)', again.id === versId);
    const d = await J(await fetch(`${BASE}/contrats/${contratG1}`, { headers: H }));
    ok('dérivées : misesVersées = 2', d.derive.misesVersees === 2);
  }

  console.log('\n▶ Avance, retrait, relevé');
  {
    const a = await J(await post('/avances', HJ, { contratId: contratG1, nbMois: 1, montant: 10000 }));
    ok('avance : intérêt 500, rang 1', Number(a.interet) === 500 && a.rang === 1);
    const trop = await post('/avances', HJ, { contratId: contratG1, nbMois: 1, montant: 999999 });
    ok('avance au-delà du plafond = 422', trop.status === 422);
    const r = await J(await post('/retraits', HJ, { contratId: contratG1, type: 'PARTIEL', montant: 500 }));
    ok('retrait partiel : net 500', Number(r.montantNet) === 500);
    const rel = await J(await fetch(`${BASE}/contrats/${contratG1}/releve?mois=1`, { headers: H }));
    ok('relevé : net à virer présent', typeof rel.montantNetAVirer === 'number');
  }

  console.log('\n▶ Dashboard');
  {
    const s = await J(await fetch(`${BASE}/dashboard/stats?period=today`, { headers: H }));
    ok('stats : contratsActifs présent', typeof s.contratsActifs === 'number');
    const f = await J(await fetch(`${BASE}/dashboard/file`, { headers: H }));
    ok('file : liste triée', Array.isArray(f.data));
  }

  console.log('\n▶ Synchronisation offline');
  {
    const fd = new FormData();
    fd.append('file', new Blob([Buffer.from([9, 8, 7, 6])], { type: 'image/jpeg' }), 's.jpg');
    const media = await J(await fetch(`${BASE}/media`, { method: 'POST', headers: H, body: fd }));
    const mId = randomUUID();
    const cId = randomUUID();
    const vId = randomUUID();
    const now = new Date().toISOString();
    const lot = {
      membres: [{ id: mId, nom: 'Sync', prenoms: 'Push', telephone: '22970000999', dateNaissance: '1990-01-01', lieuNaissance: 'X', profession: 'Y', quartier: 'Z', arrondissement: '1', commune: 'C', photoId: media.id, dateSouscription: '2026-07-01', updatedAt: now }],
      contrats: [{ id: cId, membreId: mId, groupe: 'GROUPE_1', miseAmount: 1000, startDate: '2026-07-01', updatedAt: now }],
      versements: [{ id: vId, contratId: cId, misesCount: 1, paidAt: new Date().toISOString() }],
    };
    const push = await J(await post('/sync/push', HJ, lot));
    ok('push : 1 membre + 1 contrat + 1 versement, 0 conflit', push.applied.membres.length === 1 && push.applied.versements.length === 1 && push.conflicts.length === 0, JSON.stringify(push.conflicts));
    const pull = await J(await fetch(`${BASE}/sync/pull?since=0`, { headers: H }));
    ok('pull : changements + curseur', Array.isArray(pull.changes.membres) && !!pull.nextCursor);
  }

  console.log('\n▶ Erreurs normalisées');
  {
    const r = await fetch(`${BASE}/contrats/${randomUUID()}`, { headers: H });
    const b = await J(r);
    ok('404 = {code:NOT_FOUND, requestId}', r.status === 404 && b.code === 'NOT_FOUND' && !!b.requestId, JSON.stringify(b));
  }

  const bilan = fail === 0 ? '\x1b[32m✔ TOUT PASSE\x1b[0m' : '\x1b[31m✗ ÉCHECS\x1b[0m';
  console.log(`\n${bilan} — ${pass} OK, ${fail} KO\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Erreur fatale du smoke-test :', e.message);
  process.exit(1);
});
