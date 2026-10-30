import type { ExecutionContext } from '@nestjs/common';
import { suivreIpClient } from './ip-client';

const contexte = {} as ExecutionContext;

function requete(headers: Record<string, unknown>, ip = '10.0.0.1') {
  return { headers, ip };
}

describe('suivreIpClient', () => {
  it("garde req.ip quand aucun en-tête n'est configuré", () => {
    const suivre = suivreIpClient(undefined);
    const req = requete({ 'true-client-ip': '41.85.1.2' });
    expect(suivre(req, contexte)).toBe('10.0.0.1');
  });

  it("lit l'IP du client dans l'en-tête configuré (nom insensible à la casse)", () => {
    const suivre = suivreIpClient('True-Client-IP');
    expect(suivre(requete({ 'true-client-ip': ' 41.85.1.2 ' }), contexte)).toBe(
      '41.85.1.2',
    );
    expect(suivre(requete({ 'true-client-ip': '2001:db8::1' }), contexte)).toBe(
      '2001:db8::1',
    );
  });

  it('prend la première valeur si l’en-tête est répété', () => {
    const suivre = suivreIpClient('true-client-ip');
    const req = requete({ 'true-client-ip': ['41.85.1.2', '9.9.9.9'] });
    expect(suivre(req, contexte)).toBe('41.85.1.2');
  });

  it("revient à req.ip si l'en-tête manque ou n'est pas une IP", () => {
    const suivre = suivreIpClient('true-client-ip');
    expect(suivre(requete({}), contexte)).toBe('10.0.0.1');
    expect(suivre(requete({ 'true-client-ip': 'pas-une-ip' }), contexte)).toBe(
      '10.0.0.1',
    );
    expect(
      suivre(requete({ 'true-client-ip': '41.85.1.2, 9.9.9.9' }), contexte),
    ).toBe('10.0.0.1');
  });
});
