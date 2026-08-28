import { defineType, defineField, defineArrayMember } from 'sanity'

export const portfolioType = defineType({
  name: 'portfolio',
  title: 'Portfolio',
  type: 'document',
  fields: [
    defineField({ name: 'slug', title: 'Slug', type: 'slug', options: { source: 'title' } }),
    defineField({ name: 'title', title: 'Title', type: 'string' }),
    defineField({ name: 'publishedAtCustom', title: 'Published At', type: 'date' }),
    defineField({ name: 'thumbnail', title: 'Thumbnail', type: 'image', options: { hotspot: true } }),
    defineField({ name: 'modalDescription', title: 'Modal Description', type: 'text' }),
    defineField({ name: 'themeColor', title: 'Theme Color', type: 'string' }),
    defineField({
      name: 'accentTextColor',
      title: 'Accent Text Color',
      type: 'string',
      options: { list: [{ title: 'Dark', value: 'dark' }, { title: 'Light', value: 'light' }] },
    }),
    defineField({
      name: 'storySections',
      title: 'Story Sections',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          fields: [
            defineField({ name: 'stepTitle', title: 'Step Title', type: 'string' }),
            defineField({ name: 'image', title: 'Image', type: 'image', options: { hotspot: true } }),
            defineField({ name: 'caption', title: 'Caption', type: 'string' }),
          ],
        }),
      ],
    }),
    defineField({
      name: 'galleryImages',
      title: 'Gallery Images',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          fields: [
            defineField({ name: 'image', title: 'Image', type: 'image', options: { hotspot: true } }),
            defineField({ name: 'alt', title: 'Alt Text', type: 'string' }),
          ],
        }),
      ],
    }),
    defineField({ name: 'metaTitle', title: 'Meta Title', type: 'string' }),
    defineField({ name: 'metaDescription', title: 'Meta Description', type: 'text' }),
    defineField({ name: 'ogpImage', title: 'OGP Image', type: 'image', options: { hotspot: true } }),
  ],
})
