import {
  defineType,
  defineField,
} from 'sanity'

export const relatedLinkType = defineType({
  name: 'relatedLink',
  title: '関連リンク',
  type: 'object',

  fields: [
    defineField({
      name: 'label',
      title: '表示テキスト',
      type: 'string',

      description:
        '例：Spotify / YouTube / Instagram / Website',

      validation: (Rule) =>
        Rule.required(),
    }),

    defineField({
      name: 'url',
      title: 'URL',
      type: 'url',

      validation: (Rule) =>
        Rule.required(),
    }),
  ],

  preview: {
    select: {
      title: 'label',
      subtitle: 'url',
    },
  },
})