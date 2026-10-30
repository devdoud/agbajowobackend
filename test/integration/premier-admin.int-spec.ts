import request from 'supertest';
import type { App } from 'supertest/types';
import { creerPremierAdmin } from '@/modules/agents/premier-admin';
import { corps, creerAppDeTest, type AppDeTest } from '../support/app';
import { viderBase } from '../support/base';

/** Premier compte ADMIN d'une base de prod (spec 0004, mise en ligne AC-7). */
describe('creerPremierAdmin', () => {
  let ctx: AppDeTest;
  let http: App;

  beforeAll(async () => {
    ctx = await creerAppDeTest();
    http = ctx.app.getHttpServer() as App;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await viderBase(ctx.prisma);
  });

  it('crée un ADMIN numéroté qui doit changer son mot de passe, et qui peut se connecter', async () => {
    const { agent, motDePasse } = await creerPremierAdmin(ctx.prisma, {
      telephone: ' 22990001111 ',
      nom: 'Responsable Pilote',
    });

    const enBase = await ctx.prisma.agent.findUniqueOrThrow({
      where: { id: agent.id },
    });
    expect(enBase).toMatchObject({
      telephone: '22990001111',
      role: 'ADMIN',
      mustChangePassword: true,
      actif: true,
    });
    expect(enBase.numeroAgent).toEqual(expect.any(Number));
    expect(motDePasse).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    const login = await request(http)
      .post('/api/v1/auth/login')
      .send({ telephone: '22990001111', password: motDePasse });
    expect(login.status).toBe(200);
    expect(
      corps<{ agent: { mustChangePassword: boolean } }>(login).agent
        .mustChangePassword,
    ).toBe(true);
  });

  it('refuse un téléphone déjà pris, sans rien créer', async () => {
    await creerPremierAdmin(ctx.prisma, {
      telephone: '22990002222',
      nom: 'Premier',
    });

    await expect(
      creerPremierAdmin(ctx.prisma, {
        telephone: '22990002222',
        nom: 'Second',
      }),
    ).rejects.toThrow('Un compte existe déjà avec ce téléphone.');
    expect(await ctx.prisma.agent.count()).toBe(1);
  });

  it('refuse un téléphone ou un nom trop courts', async () => {
    await expect(
      creerPremierAdmin(ctx.prisma, { telephone: '123', nom: 'Nom' }),
    ).rejects.toThrow('Téléphone invalide');
    await expect(
      creerPremierAdmin(ctx.prisma, { telephone: '22990003333', nom: 'X' }),
    ).rejects.toThrow('Nom invalide');
  });
});
