// scripts/clearSeed.ts

import { getCliClient } from 'sanity/cli'

const client = getCliClient({
  apiVersion: '2025-02-19',
})

async function clearSeed() {
  const ids = Array.from(
    { length: 20 },
    (_, index) =>
      `sample-portfolio-${String(index + 1).padStart(2, '0')}`,
  )

  const transaction = client.transaction()

  ids.forEach((id) => {
    transaction.delete(id)
  })

  await transaction.commit()

  console.log('✅ サンプルデータ20件を削除しました')
}

clearSeed().catch((error) => {
  console.error(error)
  process.exit(1)
})