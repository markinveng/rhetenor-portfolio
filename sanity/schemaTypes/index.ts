import { portfolioType } from './portfolioType'

import { mediaItemType } from './mediaItemType'
import { relatedLinkType } from './relatedLinkType'

import { storyType } from './storyType'
import { conceptType } from './conceptType'
import { galleryType } from './galleryType'
import { creditType } from './creditType'

export const schemaTypes = [
  // Document
  portfolioType,

  // 共通Object
  mediaItemType,
  relatedLinkType,

  // 詳細ページSection
  storyType,
  conceptType,
  galleryType,
  creditType,
]