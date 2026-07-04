import { createClient } from 'microcms-js-sdk';
import type { MicroCMSListResponse } from 'microcms-js-sdk';
import type { Portfolio } from '../types/portfolio';

const serviceDomain = import.meta.env.MICROCMS_SERVICE_DOMAIN;
const apiKey = import.meta.env.MICROCMS_API_KEY;

if (!serviceDomain || !apiKey) {
  throw new Error('MICROCMS_SERVICE_DOMAIN / MICROCMS_API_KEY is not set in .env');
}

export const client = createClient({ serviceDomain, apiKey });

export const getPortfolioList = () => client.getList<Portfolio>({ endpoint: 'portfolio' });

export const getPortfolioDetail = (contentId: string) =>
  client.getListDetail<Portfolio>({ endpoint: 'portfolio', contentId });

export const getPortfolioBySlug = (slug: string) =>
  client.getList<Portfolio>({
    endpoint: 'portfolio',
    queries: { filters: `slug[equals]${slug}` },
  });

export type PortfolioListResponse = MicroCMSListResponse<Portfolio>;
