// scripts/migrateVideoMedia.ts
//
// mediaItemを "cloudflareVideo" タイプ(cloudflareVideoUrlフィールド)に
// 統一するための移行スクリプト。
//
// 対象:
// - type: 'video' / videoUrl (以前の直接URL用タイプ。廃止し cloudflareVideo に統合)
// - type: 'vimeo' / vimeoUrl で、実際のvimeo.com URLではないもの
//   (Cloudflare R2などの直URLを誤ってvimeoUrlに入れてしまった過去データ)
//
// 実際のvimeo.com URLが入っている type: 'vimeo' のドキュメントは
// 対応する動画ファイルが無いため自動移行できない。見つかった場合は
// コンソールに警告を出すのみで、データはそのまま残す(手動でCloudflare動画に
// 差し替えてください)。
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
  videoUrl?: string
}

function isRealVimeoUrl(url: string | undefined): boolean {
  return !!url && VIMEO_URL_PATTERN.test(url)
}

function getMigratableUrl(media: MediaItemLike | undefined | null): string | null {
  if (!media) {
    return null
  }

  if (media.type === 'video' && media.videoUrl) {
    return media.videoUrl
  }

  if (media.type === 'vimeo' && media.vimeoUrl && !isRealVimeoUrl(media.vimeoUrl)) {
    return media.vimeoUrl
  }

  return null
}

function isUnmigratableVimeo(media: MediaItemLike | undefined | null): boolean {
  return (
    !!media &&
    media.type === 'vimeo' &&
    isRealVimeoUrl(media.vimeoUrl)
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
  const unmigratable: string[] = []

  portfolios.forEach((portfolio) => {
    const patch: Record<string, unknown> = {}

    const thumbnailUrl = getMigratableUrl(portfolio.thumbnailMedia)

    if (thumbnailUrl) {
      patch['thumbnailMedia.type'] = 'cloudflareVideo'
      patch['thumbnailMedia.cloudflareVideoUrl'] = thumbnailUrl
      patchedFields += 1
    } else if (isUnmigratableVimeo(portfolio.thumbnailMedia)) {
      unmigratable.push(`${portfolio._id} / thumbnailMedia`)
    }

    portfolio.previewMedia?.forEach((media, index) => {
      const url = getMigratableUrl(media)

      if (url) {
        patch[`previewMedia[${index}].type`] = 'cloudflareVideo'
        patch[`previewMedia[${index}].cloudflareVideoUrl`] = url
        patchedFields += 1
      } else if (isUnmigratableVimeo(media)) {
        unmigratable.push(`${portfolio._id} / previewMedia[${index}]`)
      }
    })

    if (Object.keys(patch).length > 0) {
      transaction.patch(portfolio._id, { set: patch })
      patchedDocs += 1
    }
  })

  if (patchedDocs > 0) {
    await transaction.commit()

    console.log(
      `✅ ${patchedDocs}件のドキュメント(${patchedFields}箇所のメディア)を type: 'cloudflareVideo' へ移行しました`,
    )
  } else {
    console.log('✅ 移行対象のドキュメントはありませんでした')
  }

  if (unmigratable.length > 0) {
    console.warn(
      `⚠️ 本物のVimeo URLのため自動移行できなかった箇所が${unmigratable.length}件あります。Cloudflareにアップロードした動画に手動で差し替えてください:`,
    )
    unmigratable.forEach((entry) => console.warn(`  - ${entry}`))
  }
}

migrateVideoMedia().catch((error) => {
  console.error(error)
  process.exit(1)
})
