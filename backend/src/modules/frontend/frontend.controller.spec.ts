import { FrontendController } from './frontend.controller';

function controller(values: Record<string, unknown>) {
  return new FrontendController({ get: (k: string) => values[k] } as never);
}

describe('FrontendController GET /api/config', () => {
  it('reports Kavita and admin-token state', () => {
    const c = controller({
      'kavita.enabled': true,
      'kavita.exposeUrl': 'https://kavita.example',
      'security.adminToken': 'x',
    });
    expect(c.getConfig()).toEqual({
      code: 200,
      data: { kavitaEnabled: true, kavitaExposeUrl: 'https://kavita.example', adminRequired: true },
    });
  });

  it('exposes no Kavita URL when Kavita is off, and adminRequired false without a token', () => {
    const c = controller({
      'kavita.enabled': false,
      'kavita.exposeUrl': 'https://half-configured',
      'security.adminToken': '',
    });
    expect(c.getConfig().data).toEqual({
      kavitaEnabled: false,
      kavitaExposeUrl: null,
      adminRequired: false,
    });
  });
});
