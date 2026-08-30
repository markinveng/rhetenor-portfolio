import {
  defineType,
  defineField,
  defineArrayMember,
} from 'sanity'

export const conceptType = defineType({
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
})