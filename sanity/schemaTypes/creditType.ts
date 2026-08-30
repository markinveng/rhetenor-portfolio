import {
  defineType,
  defineField,
  defineArrayMember,
} from 'sanity'

export const creditType = defineType({
  name: 'credit',
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

              validation: (Rule) =>
                Rule.required(),
            }),

            defineField({
              name: 'role',
              title: '担当',
              type: 'string',

              description:
                '例：Illustration / Music / Direction',
            }),

            defineField({
              name: 'links',
              title: 'SNS・Webサイト',
              type: 'array',

              of: [
                defineArrayMember({
                  type: 'relatedLink',
                }),
              ],
            }),
          ],

          preview: {
            select: {
              title: 'name',
              subtitle: 'role',
            },
          },
        }),
      ],
    }),
  ],
})