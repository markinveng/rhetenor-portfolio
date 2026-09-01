import {
  defineType,
  defineField,
  defineArrayMember,
} from 'sanity'

export const portfolioType = defineType({
  name: 'portfolio',
  title: 'ポートフォリオ',
  type: 'document',

  fields: [
    /**
     * 基本情報
     */

    defineField({
      name: 'slug',
      title: 'URLスラッグ',
      type: 'slug',

      options: {
        source: 'title',
      },

      validation: (Rule) =>
        Rule.required(),
    }),

    defineField({
      name: 'title',
      title: 'タイトル',
      type: 'string',

      validation: (Rule) =>
        Rule.required(),
    }),

    defineField({
      name: 'publishedAtCustom',
      title: '公開日',
      type: 'date',
    }),

    /**
     * サムネイル
     */

    defineField({
      name: 'thumbnailMedia',
      title: 'サムネイル',
      type: 'mediaItem',

      description:
        '画像または動画のどちらかを選択してください',

      validation: (Rule) =>
        Rule.required(),
    }),

    /**
     * サムネイルクリック後のメディア
     */

    defineField({
      name: 'previewMedia',
      title:
        'サムネイルクリック後のメディア',
      type: 'array',

      description:
        'ここで設定した順番でサイトに表示されます',

      of: [
        defineArrayMember({
          type: 'mediaItem',
        }),
      ],
    }),

    /**
     * 関連URL
     */

    defineField({
      name: 'relatedLinks',
      title: '関連URL',
      type: 'array',

      description:
        'Spotify / YouTube / Websiteなど',

      of: [
        defineArrayMember({
          type: 'relatedLink',
        }),
      ],
    }),

    /**
     * モーダル・デザイン設定
     */

    defineField({
      name: 'modalDescription',
      title: 'モーダル説明文',
      type: 'text',
    }),

    defineField({
      name: 'themeColor',
      title: 'テーマカラー',
      type: 'string',

      description:
        '例：#FFFFFF',
    }),

    defineField({
      name: 'accentTextColor',
      title:
        'アクセントテキストの色(明暗)',
      type: 'string',

      options: {
        list: [
          {
            title: 'Dark',
            value: 'dark',
          },
          {
            title: 'Light',
            value: 'light',
          },
        ],

        layout: 'radio',
      },
    }),

    /**
     * 詳細ページ
     */

    defineField({
      name: 'story',
      title: 'Story',
      type: 'story',
    }),

    defineField({
      name: 'concept',
      title: 'Concept',
      type: 'concept',
    }),

    defineField({
      name: 'gallery',
      title: 'Gallery',
      type: 'gallery',
    }),

    defineField({
      name: 'credits',
      title: 'Credit',
      type: 'credit',
    }),

    /**
     * SEO
     */

    defineField({
      name: 'metaTitle',
      title:
        'メタタイトル（SEO用タイトル）',
      type: 'string',
    }),

    defineField({
      name: 'metaDescription',
      title:
        'メタディスクリプション（SEO用説明文）',
      type: 'text',
    }),

    defineField({
      name: 'ogpImage',
      title:
        'OGP画像（SNSシェア用画像）',
      type: 'image',

      options: {
        hotspot: true,
      },
    }),
  ],

  preview: {
    select: {
      title: 'title',
      media:
        'thumbnailMedia.image',
    },
  },
})