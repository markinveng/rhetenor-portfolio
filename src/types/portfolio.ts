import type { MicroCMSImage, MicroCMSListContent } from 'microcms-js-sdk';

export type AccentTextColor = 'dark' | 'light';

export interface StorySection {
  fieldId: 'storySection';
  stepTitle: string;
  image: MicroCMSImage;
  caption: string;
}

export interface GalleryImage {
  fieldId: 'galleryImages';
  image: MicroCMSImage;
  alt: string;
}

export interface Portfolio extends MicroCMSListContent {
  slug: string;
  title: string;
  publishedAtCustom: string;
  thumbnail: MicroCMSImage;
  modalDescription: string;
  themeColor: string;
  accentTextColor: AccentTextColor[];
  storySections: StorySection[];
  galleryImages: GalleryImage[];
  metaTitle: string;
  metaDescription: string;
  ogpImage: MicroCMSImage;
}
