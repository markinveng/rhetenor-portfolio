import { c as createComponent } from './astro-component_DDUYitOb.mjs';
import 'piccolore';
import { h as addAttribute, k as renderTemplate, o as renderHead, p as renderSlot, q as renderComponent, m as maybeRenderHead, u as unescapeHTML } from './entrypoint_DPuH0idw.mjs';
import 'clsx';
import { createClient } from 'microcms-js-sdk';

const $$Layout = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$Layout;
  const {
    title = "Rhetenor",
    metaDescription,
    ogpImage
  } = Astro2.props;
  return renderTemplate`<html lang="en" data-astro-cid-sckkx6r4> <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="icon" href="/favicon.ico"><meta name="generator"${addAttribute(Astro2.generator, "content")}><title>${title}</title>${metaDescription && renderTemplate`<meta name="description"${addAttribute(metaDescription, "content")}>`}${metaDescription && renderTemplate`<meta property="og:description"${addAttribute(metaDescription, "content")}>`}${ogpImage && renderTemplate`<meta property="og:image"${addAttribute(ogpImage, "content")}>`}<meta property="og:title"${addAttribute(title, "content")}>${renderHead()}</head> <body data-astro-cid-sckkx6r4> ${renderSlot($$result, $$slots["default"])}</body></html>`;
}, "C:/Users/marki/Documents/rhetenor-portfolio/src/layouts/Layout.astro", void 0);

const serviceDomain = "70v3xlkfyr";
const apiKey = "wTwQhMLIrxElem92oVhdJRJD3fTTbzMUpLSj";
console.log("[microcms] serviceDomain:", "set" );
console.log("[microcms] apiKey:", "set" );
const client = createClient({ serviceDomain, apiKey });
const getPortfolioBySlug = (slug) => {
  console.log("[microcms] getPortfolioBySlug called with slug:", slug);
  return client.getList({
    endpoint: "portfolio",
    queries: { filters: `slug[equals]${slug}` }
  });
};

const prerender = false;
const $$Discover = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$Discover;
  const slug = Astro2.url.searchParams.get("name");
  console.log("[discover.astro] slug:", slug);
  console.log("[discover.astro] Full URL:", Astro2.url.href);
  console.log("[discover.astro] Environment check:");
  console.log("[discover.astro] MICROCMS_SERVICE_DOMAIN:", "set" );
  console.log("[discover.astro] MICROCMS_API_KEY:", "set" );
  if (!slug) {
    console.log("[discover.astro] No slug, redirecting to /");
    return Astro2.redirect("/");
  }
  let portfolioData;
  let errorMessage = "";
  try {
    console.log("[discover.astro] Fetching portfolio for slug:", slug);
    const { contents } = await getPortfolioBySlug(slug);
    console.log("[discover.astro] API response contents length:", contents?.length);
    const portfolio = contents[0];
    if (!portfolio) {
      console.log("[discover.astro] No portfolio found, redirecting to /");
      return Astro2.redirect("/");
    }
    portfolioData = portfolio;
    console.log("[discover.astro] Portfolio found:", portfolioData.title);
  } catch (error) {
    console.error("[discover.astro] Error fetching portfolio:", error);
    if (error instanceof Error) {
      console.error("[discover.astro] Error message:", error.message);
      console.error("[discover.astro] Error stack:", error.stack);
      errorMessage = error.message;
    } else {
      errorMessage = String(error);
    }
    return new Response(`
    <html>
      <head><title>Error - Debug</title></head>
      <body>
        <h1>Error loading portfolio</h1>
        <p>Slug: ${slug}</p>
        <p>Error: ${errorMessage}</p>
        <p>Check Vercel function logs for more details</p>
        <p><a href="/">Back to home</a></p>
      </body>
    </html>
  `, {
      status: 500,
      headers: { "Content-Type": "text/html" }
    });
  }
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": portfolioData.metaTitle, "metaDescription": portfolioData.metaDescription, "ogpImage": portfolioData.ogpImage.url }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<main> <h1>${portfolioData.title}</h1> <div>${unescapeHTML(portfolioData.modalDescription)}</div> </main> ` })} `;
}, "C:/Users/marki/Documents/rhetenor-portfolio/src/pages/discover.astro", void 0);
const $$file = "C:/Users/marki/Documents/rhetenor-portfolio/src/pages/discover.astro";
const $$url = "/discover";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
	__proto__: null,
	default: $$Discover,
	file: $$file,
	prerender,
	url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
