// scripts/migrateVideoMedia.ts
//
// mediaItemに新設した `video` タイプ(直接動画URL)への移行スクリプト。
// 過去に type: 'vimeo' の vimeoUrl フィールドへ、本物のVimeo URLではない
// 動画ファイルの直URL(Cloudflare R2など)を誤って入れてしまったドキュメントを
// type: 'video' / videoUrl に付け替える。
//
// 実行前に必ずデータセットのバックアップ(sanity dataset export)を取ること。

import { getCliClient } from 'sanity/cli'

const client = getCliClient({
  apiVersion: '2025-02-19',
})

const VIMEO_URL_PATTERN = /vimeo\.com\/(?:video\/)?\d+/

interface MediaItemLike {
  type?: string
  vimeoUrl?: string
}

function isRealVimeoUrl(url: string | undefined): boolean {
  return !!url && VIMEO_URL_PATTERN.test(url)
}

function needsMigration(media: MediaItemLike | undefined | null): boolean {
  return (
    !!media &&
    media.type === 'vimeo' &&
    !!media.vimeoUrl &&
    !isRealVimeoUrl(media.vimeoUrl)
  )
}

async function migrateVideoMedia() {
  const portfolios = await client.fetch<
    Array<{
      _id: string
      thumbnailMedia?: MediaItemLike
      previewMedia?: MediaItemLike[]
    }>
  >(
    `*[_type == "portfolio"]{
      _id,
      thumbnailMedia,
      previewMedia
    }`,
  )

  const transaction = client.transaction()
  let patchedDocs = 0
  let patchedFields = 0

  portfolios.forEach((portfolio) => {
    const patch: Record<string, unknown> = {}

    if (needsMigration(portfolio.thumbnailMedia)) {
      patch['thumbnailMedia.type'] = 'video'
      patch['thumbnailMedia.videoUrl'] = portfolio.thumbnailMedia!.vimeoUrl
      patchedFields += 1
    }

    portfolio.previewMedia?.forEach((media, index) => {
      if (needsMigration(media)) {
        patch[`previewMedia[${index}].type`] = 'video'
        patch[`previewMedia[${index}].videoUrl`] = media.vimeoUrl
        patchedFields += 1
      }
    })

    if (Object.keys(patch).length > 0) {
      transaction.patch(portfolio._id, { set: patch })
      patchedDocs += 1
    }
  })

  if (patchedDocs === 0) {
    console.log('✅ 移行対象のドキュメントはありませんでした')
    return
  }

  await transaction.commit()

  console.log(
    `✅ ${patchedDocs}件のドキュメント(${patchedFields}箇所のメディア)を type: 'video' へ移行しました`,
  )
}

migrateVideoMedia().catch((error) => {
  console.error(error)
  process.exit(1)
})
