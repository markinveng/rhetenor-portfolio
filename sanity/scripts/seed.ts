// scripts/seed.ts

import { getCliClient } from 'sanity/cli'
import { createReadStream } from 'node:fs'
import { resolve } from 'node:path'

const client = getCliClient()

const COUNT = 40

const portableText = (text: string, key: string) => [
  {
    _type: 'block',
    _key: `${key}-block`,
    style: 'normal',
    markDefs: [],
    children: [
      {
        _type: 'span',
        _key: `${key}-span`,
        text,
        marks: [],
      },
    ],
  },
]

async function seed() {
  console.log('サンプル画像をアップロード中...')

  const imagePath = resolve(
    process.cwd(),
    'scripts/assets/sample.png',
  )

  const imageAsset = await client.assets.upload(
    'image',
    createReadStream(imagePath),
    {
      filename: 'sample.png',
    },
  )

  console.log('画像アップロード完了:', imageAsset._id)

  const transaction = client.transaction()

  for (let i = 1; i <= COUNT; i++) {
    const number = String(i).padStart(2, '0')

    const hasStory = i % 4 !== 0
    const hasConcept = i % 3 !== 0
    const hasGallery = i % 5 !== 0
    const hasCredits = i % 6 !== 0

    const image = {
      _type: 'image',
      asset: {
        _type: 'reference',
        _ref: imageAsset._id,
      },
    }

    transaction.createOrReplace({
      _id: `sample-portfolio-${number}`,

      _type: 'portfolio',

      slug: {
        _type: 'slug',
        current: `sample-work-${number}`,
      },

      title: `Sample Project ${number}`,

      publishedAtCustom: `2026-08-${String(
        Math.min(i, 28),
      ).padStart(2, '0')}`,

      // サムネイルは画像/Vimeo動画をランダムで割り当てる
      thumbnailMedia:
        Math.random() < 0.3
          ? {
            _type: 'mediaItem',
            type: 'video',
            videoUrl: 'https://pub-5f1b1ff8ec354c9e9343d8b70a84e334.r2.dev/mov_hts-samp005.mp4',
          }
          : {
            _type: 'mediaItem',
            type: 'img',
            image,
            alt: `Sample Project ${number}`,
          },

      // サムネイルクリック後のメディア一覧(先頭はVimeo動画、2番目は直接動画URL)
      previewMedia: [
        {
          _type: 'mediaItem',
          _key: `preview-${i}-vimeo`,
          type: 'vimeo',
          vimeoUrl: 'https://vimeo.com/1094266104',
        },
        {
          _type: 'mediaItem',
          _key: `preview-${i}-video`,
          type: 'video',
          videoUrl: 'https://pub-5f1b1ff8ec354c9e9343d8b70a84e334.r2.dev/mov_hts-samp005.mp4',
        },
        {
          _type: 'mediaItem',
          _key: `preview-${i}-01`,
          type: 'img',
          image,
          alt: `Sample Project ${number} Preview 1`,
        },
        {
          _type: 'mediaItem',
          _key: `preview-${i}-02`,
          type: 'img',
          image,
          alt: `Sample Project ${number} Preview 2`,
        },
      ],

      modalDescription:
        `サンプル作品${number}の説明文です。ポートフォリオ一覧・モーダル表示確認用のダミーテキストです。`,

      themeColor:
        i % 3 === 0
          ? '#D9EAF7'
          : i % 3 === 1
            ? '#F1E4D1'
            : '#E5DDEF',

      accentTextColor:
        i % 2 === 0 ? 'dark' : 'light',

      // 関連URL(Spotify / YouTube / Websiteなど)
      relatedLinks: [
        {
          _type: 'relatedLink',
          _key: `related-${i}-youtube`,
          label: 'YouTube',
          url: 'https://youtube.com/',
        },
        {
          _type: 'relatedLink',
          _key: `related-${i}-web`,
          label: 'Website',
          url: 'https://example.com/',
        },
      ],

      // Story
      ...(hasStory && {
        story: {
          _type: 'story',

          items: [
            {
              _type: 'object',
              _key: `story-${i}-01`,

              title: '企画・アイデア',

              body: portableText(
                '作品の方向性やコンセプトを整理し、制作する内容を決定しました。',
                `story-${i}-01`,
              ),

              image,

              caption: '初期アイデア・ラフ',
            },

            {
              _type: 'object',
              _key: `story-${i}-02`,

              title: 'デザイン',

              body: portableText(
                'ラフをもとに配色や構図を調整しながら、最終的なビジュアルを制作しました。',
                `story-${i}-02`,
              ),

              image,

              caption: 'デザイン制作過程',
            },

            {
              _type: 'object',
              _key: `story-${i}-03`,

              title: '仕上げ',

              body: portableText(
                '細部を調整しながら完成度を高め、最終的な作品として仕上げました。',
                `story-${i}-03`,
              ),

              image,

              caption: '完成直前の状態',
            },
          ],
        },
      }),

      // Concept
      ...(hasConcept && {
        concept: {
          _type: 'concept',

          body: portableText(
            `Sample Project ${number}では、日常の中にある小さな発見を視覚的に表現することをコンセプトとしています。`,
            `concept-${i}`,
          ),

          image,

          caption: 'コンセプトビジュアル',
        },
      }),

      // Gallery
      ...(hasGallery && {
        gallery: {
          _type: 'gallery',

          images: Array.from(
            { length: 6 },
            (_, galleryIndex) => ({
              _type: 'object',
              _key: `gallery-${i}-${galleryIndex}`,

              image,

              alt:
                `Sample Project ${number} Gallery ${galleryIndex + 1
                }`,
            }),
          ),
        },
      }),

      // Credits
      ...(hasCredits && {
        credits: {
          _type: 'credit',

          people: [
            {
              _type: 'object',
              _key: `credit-${i}-01`,

              name: 'Taro Yamada',

              role: 'Art Direction / Design',

              links: [
                {
                  _type: 'relatedLink',
                  _key: `credit-${i}-01-x`,
                  label: 'X',
                  url: 'https://x.com/',
                },

                {
                  _type: 'relatedLink',
                  _key: `credit-${i}-01-web`,
                  label: 'Website',
                  url: 'https://example.com/',
                },
              ],
            },

            {
              _type: 'object',
              _key: `credit-${i}-02`,

              name: 'Hanako Sato',

              role: 'Illustration',

              links: [
                {
                  _type: 'relatedLink',
                  _key: `credit-${i}-02-instagram`,
                  label: 'Instagram',
                  url: 'https://instagram.com/',
                },
              ],
            },
          ],
        },
      }),

      metaTitle:
        `Sample Project ${number} | Portfolio`,

      metaDescription:
        `Sample Project ${number}のポートフォリオ詳細ページです。`,

      ogpImage: image,
    })
  }

  console.log(`${COUNT}件をSanityへ登録中...`)

  await transaction.commit()

  console.log('✅ サンプルデータ作成完了')
}

seed().catch((error) => {
  console.error(error)
  process.exit(1)
})