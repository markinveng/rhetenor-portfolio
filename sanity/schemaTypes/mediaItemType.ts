import {
  defineType,
  defineField,
} from 'sanity'

export const mediaItemType = defineType({
  name: 'mediaItem',
  title: 'メディア',
  type: 'object',

  fields: [
    defineField({
      name: 'type',
      title: 'メディアタイプ',
      type: 'string',

      options: {
        list: [
          {
            title: '画像',
            value: 'img',
          },
          {
            title: '動画',
            value: 'cloudflareVideo',
          },
        ],
        layout: 'radio',
      },

      validation: (Rule) =>
        Rule.required(),
    }),

    defineField({
      name: 'image',
      title: '画像',
      type: 'image',

      options: {
        hotspot: true,
      },

      hidden: ({ parent }) =>
        parent?.type !== 'img',
    }),

    defineField({
      name: 'alt',
      title: '代替テキスト',
      type: 'string',

      hidden: ({ parent }) =>
        parent?.type !== 'img',
    }),

    defineField({
      name: 'cloudflareVideoUrl',
      title: '動画URL(mp4など、直接再生できるファイルのURL)',
      type: 'url',

      description:
        'Cloudflare R2などにアップロードした動画ファイルの公開URL',

      hidden: ({ parent }) =>
        parent?.type !== 'cloudflareVideo',
    }),
  ],

  validation: (Rule) =>
    Rule.custom((value) => {
      if (!value) {
        return true
      }

      if (
        value.type === 'img' &&
        !value.image
      ) {
        return '画像を選択してください'
      }

      if (
        value.type === 'cloudflareVideo' &&
        !value.cloudflareVideoUrl
      ) {
        return '動画URLを入力してください'
      }

      return true
    }),

  preview: {
    select: {
      type: 'type',
      image: 'image',
      cloudflareVideoUrl: 'cloudflareVideoUrl',
    },

    prepare({
      type,
      image,
      cloudflareVideoUrl,
    }) {
      if (type === 'img') {
        return {
          title: '画像',
          media: image,
        }
      }

      return {
        title: '動画',
        subtitle: cloudflareVideoUrl,
      }
    },
  },
})