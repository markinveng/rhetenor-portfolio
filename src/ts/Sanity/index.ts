import { sanityClient, urlFor } from './client';

import { PortfolioQuery } from './queries';

import type {
  Portfolio,
  PortfolioSummary,
} from '../../types/portfolio';

export { urlFor };

/**
 * @astrojs/cloudflare (workerd) のローカル実行環境では
 * 外部への fetch が断続的に "fetch failed" で失敗することがある
 * (astro側の既知の問題。ソースコード起因ではない)。
 * 影響を緩和するため、失敗時のみ短い間隔でリトライする。
 */
async function fetchWithRetry<T>(
  query: string,
  params: Record<string, unknown> = {},
  retries = 2,
): Promise<T> {
  try {
    return await sanityClient.fetch<T>(query, params);
  } catch (error) {
    if (retries <= 0) {
      throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, 300));

    return fetchWithRetry<T>(query, params, retries - 1);
  }
}

export class PortfolioApi {
  /**
   * ポートフォリオ一覧取得
   */
  public async getList(): Promise<
    PortfolioSummary[]
  > {
    return fetchWithRetry<
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

    return fetchWithRetry<
      Portfolio | null
    >(
      PortfolioQuery.getBySlug(),
      {
        slug,
      }
    );
  }
}