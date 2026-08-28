// Usage: SANITY_TOKEN=<your-token> node scripts/migrate-from-microcms.mjs
import { createClient } from "@sanity/client";
import { readFileSync } from "fs";

const token = process.env.SANITY_TOKEN;
if (!token) throw new Error("SANITY_TOKEN environment variable is required");

const client = createClient({
  projectId: "si0urca2",
  dataset: "production",
  token,
  apiVersion: "2024-01-01",
  useCdn: false,
});

const data = JSON.parse(readFileSync("./microcms-export.json", "utf-8"));

const stripHtml = html => html.replace(/<[^>]*>/g, "");

// Cache uploaded images to avoid re-uploading the same URL
const uploadedAssets = new Map();

async function uploadImage(url) {
  if (uploadedAssets.has(url)) return uploadedAssets.get(url);

  const res = await fetch(url);
  const buffer = Buffer.from(await res.arrayBuffer());
  const filename = decodeURIComponent(url.split("/").pop());
  const asset = await client.assets.upload("image", buffer, { filename });
  const ref = { _type: "image", asset: { _type: "reference", _ref: asset._id } };
  uploadedAssets.set(url, ref);
  console.log(`  ↑ uploaded: ${filename}`);
  return ref;
}

async function migrate() {
  for (const item of data.contents) {
    console.log(`\nMigrating: ${item.title}`);

    const [thumbnail, ogpImage] = await Promise.all([
      uploadImage(item.thumbnail.url),
      uploadImage(item.ogpImage.url),
    ]);

    const storySections = [];
    for (let i = 0; i < item.storySections.length; i++) {
      const s = item.storySections[i];
      storySections.push({
        _key: `section-${i}`,
        stepTitle: s.stepTitle,
        image: await uploadImage(s.image.url),
        caption: s.caption,
      });
    }

    const galleryImages = [];
    for (let i = 0; i < item.galleryImages.length; i++) {
      const g = item.galleryImages[i];
      galleryImages.push({
        _key: `gallery-${i}`,
        image: await uploadImage(g.image.url),
        alt: g.alt,
      });
    }

    const doc = {
      _id: `portfolio-${item.id}`,
      _type: "portfolio",
      slug: { _type: "slug", current: item.slug },
      title: item.title,
      publishedAtCustom: item.publishedAtCustom.split("T")[0],
      thumbnail,
      modalDescription: stripHtml(item.modalDescription),
      themeColor: item.themeColor,
      accentTextColor: item.accentTextColor[0],
      storySections,
      galleryImages,
      metaTitle: item.metaTitle.trim(),
      metaDescription: item.metaDescription,
      ogpImage,
    };

    await client.createOrReplace(doc);
    console.log(`✓ Done: ${item.title}`);
  }

  console.log("\nMigration complete!");
}

migrate().catch(console.error);
