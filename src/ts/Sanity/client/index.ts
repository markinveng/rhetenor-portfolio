import { createClient } from '@sanity/client';
import { createImageUrlBuilder } from '@sanity/image-url';
import type { SanityImage } from '../../../types/portfolio';

export const sanityClient = createClient({
  projectId: import.meta.env.PUBLIC_SANITY_PROJECT_ID,
  dataset: import.meta.env.PUBLIC_SANITY_DATASET,
  apiVersion: '2026-08-30',
  useCdn: true,
});

const imageBuilder = createImageUrlBuilder(sanityClient);

export const urlFor = (source: SanityImage) =>
  imageBuilder.image(source);