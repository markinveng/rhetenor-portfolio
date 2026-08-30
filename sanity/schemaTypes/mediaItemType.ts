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
            title: 'Vimeo動画',
            value: 'vimeo',
          },
          {
            title: '動画(直接URL)',
            value: 'video',
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
      name: 'vimeoUrl',
      title: 'Vimeo URL',
      type: 'url',

      hidden: ({ parent }) =>
        parent?.type !== 'vimeo',
    }),

    defineField({
      name: 'videoUrl',
      title: '動画URL(mp4など、直接再生できるファイルのURL)',
      type: 'url',

      description:
        'Cloudflare R2などにアップロードした動画ファイルの公開URL',

      hidden: ({ parent }) =>
        parent?.type !== 'video',
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
        value.type === 'vimeo' &&
        !value.vimeoUrl
      ) {
        return 'Vimeo URLを入力してください'
      }

      if (
        value.type === 'video' &&
        !value.videoUrl
      ) {
        return '動画URLを入力してください'
      }

      return true
    }),

  preview: {
    select: {
      type: 'type',
      image: 'image',
      vimeoUrl: 'vimeoUrl',
      videoUrl: 'videoUrl',
    },

    prepare({
      type,
      image,
      vimeoUrl,
      videoUrl,
    }) {
      if (type === 'img') {
        return {
          title: '画像',
          media: image,
        }
      }

      if (type === 'video') {
        return {
          title: '動画(直接URL)',
          subtitle: videoUrl,
        }
      }

      return {
        title: 'Vimeo動画',
        subtitle: vimeoUrl,
      }
    },
  },
})