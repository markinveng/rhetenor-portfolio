import {
  defineType,
  defineField,
  defineArrayMember,
} from 'sanity'

export const storyType = defineType({
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

          preview: {
            select: {
              title: 'title',
              media: 'image',
            },
          },
        }),
      ],
    }),
  ],
})