import { c as createComponent } from './astro-component_fkA9uaMe.mjs';
import 'piccolore';
import { h as addAttribute, k as renderTemplate, o as renderHead, p as renderSlot, q as renderComponent, m as maybeRenderHead } from './entrypoint_CbYZzpXs.mjs';
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
const client = createClient({ serviceDomain, apiKey });
const getPortfolioBySlug = (slug) => client.getList({
  endpoint: "portfolio",
  queries: { filters: `slug[equals]${slug}` }
});

const prerender = false;
const $$Discover = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$Discover;
  const requestUrl = new URL(Astro2.request.url);
  const slug = requestUrl.searchParams.get("name");
  if (!slug) {
    return Astro2.redirect("/");
  }
  const { contents } = await getPortfolioBySlug(slug);
  const portfolio = contents[0];
  if (!portfolio) {
    return Astro2.redirect("/");
  }
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": portfolio.metaTitle, "metaDescription": portfolio.metaDescription, "ogpImage": portfolio.ogpImage.url }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<main> <h1>${portfolio.title}</h1> <p>${portfolio.modalDescription}</p> </main> ` })}`;
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
