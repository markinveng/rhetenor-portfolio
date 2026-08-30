import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'author',
  title: '著者',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: '名前',
      type: 'string',
    }),
    defineField({
      name: 'slug',
      title: 'URLスラッグ',
      type: 'slug',
      options: {
        source: 'name',
        maxLength: 96,
      },
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
      name: 'bio',
      title: 'プロフィール文',
      type: 'array',
      of: [
        {
          title: 'Block',
          type: 'block',
          styles: [{title: 'Normal', value: 'normal'}],
          lists: [],
        },
      ],
    }),
  ],
  preview: {
    select: {
      title: 'name',
      media: 'image',
    },
  },
})
