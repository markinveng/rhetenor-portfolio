export type AccentTextColor = 'dark' | 'light';

export interface SanityImage {
  _type: 'image';
  asset: { _ref: string; _type: 'reference' };
  hotspot?: { x: number; y: number };
}

export interface StorySection {
  _key: string;
  stepTitle: string;
  image: SanityImage;
  caption: string;
}

export interface GalleryImage {
  _key: string;
  image: SanityImage;
  alt: string;
}

export interface Portfolio {
  _id: string;
  _type: 'portfolio';
  slug: { current: string };
  title: string;
  publishedAtCustom: string;
  thumbnail: SanityImage;
  modalDescription: string;
  themeColor: string;
  accentTextColor: AccentTextColor;
  storySections: StorySection[];
  galleryImages: GalleryImage[];
  metaTitle: string;
  metaDescription: string;
  ogpImage: SanityImage;
}
