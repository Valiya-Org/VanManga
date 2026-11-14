import { MangaFactoryService } from './manga-factory.service';

describe('MangaFactoryService', () => {
  it('starts updated_at equal to add_date', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_500);
    const m = new MangaFactoryService().build({
      manga_id: 'id',
      manga_name: 'n',
      artist_name: 'a',
      newest_epi: 'e',
      thumbnail: '/api/library/id/thumbnail',
    });
    expect(m.add_date).toBe(1_700_000_000.5);
    expect(m.updated_at).toBe(m.add_date);
    jest.restoreAllMocks();
  });
});
