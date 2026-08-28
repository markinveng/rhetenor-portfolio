// @ts-check
import { defineConfig } from "astro/config";
import glslify from "vite-plugin-glslify";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig( {
	session: false,
	adapter: cloudflare( {
		imageService: "passthrough",
		// @ts-ignore
		platformProxy: { enabled: false },
	} ),
	vite: {
		// @ts-ignore vite version mismatch between plugin and astro
		plugins: [ glslify() ],
		optimizeDeps: {
			// suppress vite-plugin-glslify esbuildOptions deprecation warning
			rolldownOptions: {},
		},
	},
} );
