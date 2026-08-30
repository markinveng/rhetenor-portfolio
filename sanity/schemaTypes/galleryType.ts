import {
  defineType,
  defineField,
  defineArrayMember,
} from 'sanity'

export const galleryType = defineType({
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

              validation: (Rule) =>
                Rule.required(),
            }),

            defineField({
              name: 'alt',
              title: '代替テキスト',
              type: 'string',
            }),
          ],

          preview: {
            select: {
              title: 'alt',
              media: 'image',
            },

            prepare({
              title,
              media,
            }) {
              return {
                title:
                  title ||
                  'ギャラリー画像',
                media,
              }
            },
          },
        }),
      ],
    }),
  ],
})