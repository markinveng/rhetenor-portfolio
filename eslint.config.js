import { FlatCompat } from "@eslint/eslintrc";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import globals from "globals";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath( import.meta.url );
const __dirname = path.dirname( __filename );

const compat = new FlatCompat( { baseDirectory: __dirname } );

export default [
	...compat.extends( "mdcs" ),
	{
		plugins: { "@typescript-eslint": tsPlugin },
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				sourceType: "module",
				project: "./tsconfig.json",
			},
			globals: { ...globals.node, ...globals.es2015 },
		},
	},
];
