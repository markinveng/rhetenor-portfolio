import { sanityClient, urlFor } from './client';

import { PortfolioQuery } from './queries';

import type {
  Portfolio,
  PortfolioSummary,
} from '../../types/portfolio';

export { urlFor };

export class PortfolioApi {
  /**
   * ポートフォリオ一覧取得
   */
  public async getList(): Promise<
    PortfolioSummary[]
  > {
    return sanityClient.fetch<
      PortfolioSummary[]
    >(
      PortfolioQuery.getList()
    );
  }

  /**
   * slugから作品詳細取得
   */
  public async getBySlug(
    slug: string
  ): Promise<Portfolio | null> {

    return sanityClient.fetch<
      Portfolio | null
    >(
      PortfolioQuery.getBySlug(),
      {
        slug,
      }
    );
  }
}