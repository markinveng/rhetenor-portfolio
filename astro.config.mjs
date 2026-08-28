// @ts-check
import { defineConfig } from "astro/config";
import glslify from "vite-plugin-glslify";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig( {
	adapter: cloudflare(),
	vite: {
		// @ts-ignore vite version mismatch between plugin and astro
		plugins: [ glslify() ],
	},
} );
