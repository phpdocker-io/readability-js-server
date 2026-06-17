const js = require("@eslint/js");
const n = require("eslint-plugin-n").default;
const eslintConfigPrettier = require("eslint-config-prettier/flat");

const nodeRecommendedScript = n.configs["flat/recommended-script"];

module.exports = [
  {
    ignores: ["**/node_modules/**", "**/coverage/**", "**/dist/**"],
  },
  js.configs.recommended,
  {
    files: ["src/**/*.js", "test/**/*.js", "scripts/**/*.js"],
    ...nodeRecommendedScript,
    settings: {
      ...(nodeRecommendedScript.settings || {}),
      node: {
        version: ">=24.0.0",
      },
    },
    rules: {
      ...nodeRecommendedScript.rules,
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["test/**/*.js"],
    rules: {
      "n/no-unpublished-import": "off",
      "n/no-unpublished-require": "off",
    },
  },
  eslintConfigPrettier,
];
