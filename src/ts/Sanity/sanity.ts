import { createClient } from '@sanity/client';
import imageUrlBuilder from '@sanity/image-url';
import type { SanityImage, Portfolio } from '../types/portfolio';

export const client = createClient({
  projectId: import.meta.env.SANITY_PROJECT_ID,
  dataset: 'production',
  useCdn: true,
  apiVersion: '2024-01-01',
});

const builder = imageUrlBuilder(client);
export const urlFor = (source: SanityImage) => builder.image(source);

export const getPortfolioList = (): Promise<Portfolio[]> =>
  client.fetch(`*[_type == "portfolio"] | order(_createdAt desc)`);

export const getPortfolioDetail = (id: string): Promise<Portfolio> =>
  client.fetch(`*[_type == "portfolio" && _id == $id][0]`, { id });

export const getPortfolioBySlug = (slug: string): Promise<Portfolio> =>
  client.fetch(`*[_type == "portfolio" && slug.current == $slug][0]`, { slug });
