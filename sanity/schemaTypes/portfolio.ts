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
    defineField({
      name: 'slug',
      title: 'URLスラッグ',
      type: 'slug',
      options: {
        source: 'title',
      },
    }),

    defineField({
      name: 'title',
      title: 'タイトル',
      type: 'string',
    }),

    defineField({
      name: 'publishedAtCustom',
      title: '公開日',
      type: 'date',
    }),

    defineField({
      name: 'thumbnailImg',
      title: 'サムネイル画像',
      type: 'image',
      options: {
        hotspot: true,
      },
    }),

    defineField({
      name: 'thumbnailMovie',
      title: 'サムネイル動画',
      type: 'text',
    }),

    defineField({
      name: 'imgList',
      title: 'サムネイル画像リスト',
      type: 'object',

      fields: [
        defineField({
          name: 'images',
          title: 'サムネイル画像リスト',
          type: 'array',

          of: [
            defineArrayMember({
              type: 'object',

              fields: [
                defineField({
                  name: 'image',
                  title: 'サムネイル画像',
                  type: 'image',
                  options: {
                    hotspot: true,
                  },
                  validation: (Rule) => Rule.required(),
                }),

                defineField({
                  name: 'alt',
                  title: '代替テキスト',
                  type: 'string',
                }),
              ],
            }),
          ],
        }),
      ],
    }),

    defineField({
      name: 'themeColor',
      title: 'テーマカラー',
      type: 'string',
    }),

    defineField({
      name: 'accentTextColor',
      title: 'アクセントテキストの色(明暗)',
      type: 'string',
      options: {
        list: [
          { title: 'Dark', value: 'dark' },
          { title: 'Light', value: 'light' },
        ],
      },
    }),

    // -----------------------------
    // Story
    // -----------------------------

    defineField({
      name: 'story',
      title: 'Story',
      type: 'object',

      fields: [
        defineField({
          name: 'items',
          title: '制作過程',
          type: 'array',

          of: [
            defineArrayMember({
              type: 'object',

              fields: [
                defineField({
                  name: 'title',
                  title: 'タイトル',
                  type: 'string',
                }),

                defineField({
                  name: 'body',
                  title: '本文',
                  type: 'array',
                  of: [
                    defineArrayMember({
                      type: 'block',
                    }),
                  ],
                }),

                defineField({
                  name: 'image',
                  title: '画像',
                  type: 'image',
                  options: {
                    hotspot: true,
                  },
                }),

                defineField({
                  name: 'caption',
                  title: '画像キャプション',
                  type: 'string',
                }),
              ],
            }),
          ],
        }),
      ],
    }),

    // -----------------------------
    // Concept
    // -----------------------------

    defineField({
      name: 'concept',
      title: 'Concept',
      type: 'object',

      fields: [
        defineField({
          name: 'body',
          title: 'コンセプト本文',
          type: 'array',
          of: [
            defineArrayMember({
              type: 'block',
            }),
          ],
        }),

        defineField({
          name: 'image',
          title: 'コンセプト画像',
          type: 'image',
          options: {
            hotspot: true,
          },
        }),

        defineField({
          name: 'caption',
          title: '画像キャプション',
          type: 'string',
        }),
      ],
    }),

    // -----------------------------
    // Gallery
    // -----------------------------

    defineField({
      name: 'gallery',
      title: 'Gallery',
      type: 'object',

      fields: [
        defineField({
          name: 'images',
          title: 'ギャラリー画像',
          type: 'array',

          of: [
            defineArrayMember({
              type: 'object',

              fields: [
                defineField({
                  name: 'image',
                  title: '画像',
                  type: 'image',
                  options: {
                    hotspot: true,
                  },
                  validation: (Rule) => Rule.required(),
                }),

                defineField({
                  name: 'alt',
                  title: '代替テキスト',
                  type: 'string',
                }),
              ],
            }),
          ],
        }),
      ],
    }),

    // -----------------------------
    // Credit
    // -----------------------------

    defineField({
      name: 'credits',
      title: 'Credit',
      type: 'object',

      fields: [
        defineField({
          name: 'people',
          title: '制作メンバー',
          type: 'array',

          of: [
            defineArrayMember({
              type: 'object',

              fields: [
                defineField({
                  name: 'name',
                  title: '名前',
                  type: 'string',
                  validation: (Rule) => Rule.required(),
                }),

                defineField({
                  name: 'role',
                  title: '担当',
                  type: 'string',
                }),

                defineField({
                  name: 'links',
                  title: 'SNS・Webサイト',
                  type: 'array',

                  of: [
                    defineArrayMember({
                      type: 'object',

                      fields: [
                        defineField({
                          name: 'label',
                          title: 'サービス名',
                          type: 'string',
                          description:
                            '例：X / Instagram / YouTube / Website',
                        }),

                        defineField({
                          name: 'url',
                          title: 'URL',
                          type: 'url',
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    }),

    // -----------------------------
    // SEO
    // -----------------------------

    defineField({
      name: 'metaTitle',
      title: 'メタタイトル(SEO用タイトル)',
      type: 'string',
    }),

    defineField({
      name: 'metaDescription',
      title: 'メタディスクリプション(SEO用説明文)',
      type: 'text',
    }),

    defineField({
      name: 'ogpImage',
      title: 'OGP画像(SNSシェア用画像)',
      type: 'image',
      options: {
        hotspot: true,
      },
    }),
  ],
})