import type { PortableTextBlock } from '@portabletext/types';

export type AccentTextColor = 'dark' | 'light';

/**
 * Sanity Image
 */
export interface SanityImage {
  _type: 'image';

  asset: {
    _ref: string;
    _type: 'reference';
  };

  hotspot?: {
    x: number;
    y: number;
  };
}

/**
 * Media
 */

export interface ImageMedia {
  _type: 'mediaItem';
  _key?: string;

  type: 'img';

  image: SanityImage;
  alt?: string;
}

export interface VimeoMedia {
  _type: 'mediaItem';
  _key?: string;

  type: 'vimeo';

  vimeoUrl: string;
}

export type MediaItem =
  | ImageMedia
  | VimeoMedia;

/**
 * Related Link
 */

export interface RelatedLink {
  _key: string;

  label: string;
  url: string;
}

/**
 * Story
 */

export interface StoryItem {
  _key: string;

  title?: string;
  body?: PortableTextBlock[];

  image?: SanityImage;
  caption?: string;
}

export interface Story {
  items?: StoryItem[];
}

/**
 * Concept
 */

export interface Concept {
  body?: PortableTextBlock[];

  image?: SanityImage;
  caption?: string;
}

/**
 * Gallery
 */

export interface GalleryImage {
  _key: string;

  image: SanityImage;
  alt?: string;
}

export interface Gallery {
  images?: GalleryImage[];
}

/**
 * Credit
 */

export interface CreditPerson {
  _key: string;

  name: string;
  role?: string;

  links?: RelatedLink[];
}

export interface Credits {
  people?: CreditPerson[];
}

/**
 * 一覧表示用
 */
export interface PortfolioSummary {
  _id: string;
  _type: 'portfolio';

  slug: {
    current: string;
  };

  title: string;

  publishedAtCustom?: string;

  thumbnailMedia: MediaItem;

  modalDescription?: string;

  themeColor?: string;

  accentTextColor?: AccentTextColor;
}

/**
 * 詳細データ
 */
export interface Portfolio
  extends PortfolioSummary {

  previewMedia?: MediaItem[];

  relatedLinks?: RelatedLink[];

  story?: Story;

  concept?: Concept;

  gallery?: Gallery;

  credits?: Credits;

  metaTitle?: string;

  metaDescription?: string;

  ogpImage?: SanityImage;
}