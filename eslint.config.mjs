import { fixupConfigRules, fixupPluginRules } from "@eslint/compat"
import unicorn from "eslint-plugin-unicorn"
import json from "eslint-plugin-json"
import globals from "globals"
import path from "node:path"
import { fileURLToPath } from "node:url"
import js from "@eslint/js"
import { FlatCompat } from "@eslint/eslintrc"
import stylistic from "@stylistic/eslint-plugin"
import pluginVue from "eslint-plugin-vue"
import vueTsEslintConfig from "@vue/eslint-config-typescript"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const compat = new FlatCompat({
    baseDirectory:     __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig:         js.configs.all,
})

export default [
    ...pluginVue.configs["flat/recommended"],
    ...vueTsEslintConfig(),
    {
        ignores: [
            "**/.dev/",
            "**/.vite/",
            "**/.vscode/",
            "**/node_modules/",
            "**/dist/",
            "**/dist-electron/",
            "scripts/**/*",
        ],
    }, ...fixupConfigRules(compat.extends(
        "eslint:recommended",
        "plugin:import/electron",
        "plugin:json/recommended-legacy",
    )), {
        plugins: {
            unicorn,
            json:         fixupPluginRules(json),
            "@stylistic":  stylistic,
        },

        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
                _:                               true,
                VitePluginConfig:                true,
                VitePluginRuntimeKeys:           true,
                MAIN_WINDOW_VITE_DEV_SERVER_URL: true,
                MAIN_WINDOW_VITE_NAME:           true,
            },

            ecmaVersion: "latest",
            sourceType:  "module",

            parserOptions: {
                parser: "@typescript-eslint/parser",
                lib:    ["dom", "esnext"],
            },
        },

        rules: {
            "json/*":               "error",
            "no-console":           "off",
            "no-debugger":          "off",
        // eslint-disable-next-line no-restricted-syntax
            "no-restricted-syntax": ["warn", "Literal[value=/[а-яё]/i]", "TemplateElement[value.raw=/[а-яё]/i]"],
        // eslint-disable-next-line no-restricted-syntax
            "id-match":             ["error", "^[^а-яА-ЯёЁ]+$", {
                properties:  true,
                classFields: true,
            }],

            "no-self-compare":        "error",
            "require-await":          "warn",
            "no-fallthrough":         "error",
            "no-nested-ternary":      "warn",
            "prefer-regex-literals":  "warn",
            "prefer-const":           "warn",
            "object-curly-spacing":   ["warn", "always"],
            "prefer-template":        "warn",
            "template-curly-spacing": ["warn", "never"],

            "keyword-spacing": ["warn", {
                before: true,
                after:  true,
            }],

            "space-infix-ops":     "warn",
            "space-before-blocks": "warn",
            "space-in-parens":     "warn",

            "space-before-function-paren": ["warn", {
                named:      "never",
                anonymous:  "always",
                asyncArrow: "always",
            }],

            "no-multi-spaces": ["warn", {
                exceptions: {
                    TSTypeAnnotation: true,
                    Property:         true,
                    Program:          true,
                },
            }],

            "@stylistic/function-call-spacing": "warn",
            "@stylistic/space-infix-ops":       "warn",
            "quote-props":                      ["warn", "as-needed"],
            "brace-style":                      "warn",
            "prefer-arrow-callback":            "warn",
            "no-unneeded-ternary":              "warn",

            "nonblock-statement-body-position": ["warn", "beside", {
                overrides: {
                    while: "below",
                },
            }],

            "no-var": "warn",

            "no-multiple-empty-lines": ["warn", {
                max: 2,
            }],

            "key-spacing": ["warn", {
                align: "value",
            }],

            indent: ["warn", 4, {
                ignoreComments: true,

                ignoredNodes: [
                    "FunctionExpression > .params[decorators.length > 0]",
                    "FunctionExpression > .params > :matches(Decorator, :not(:first-child))",
                    "ClassBody.body > PropertyDefinition[decorators.length > 0] > .key",
                ],
            }],

            "linebreak-style": ["warn", "unix"],

            quotes: ["warn", "double", {
                avoidEscape: true,
            }],

            semi:                       ["warn", "never"],
            "no-mixed-spaces-and-tabs": ["warn", "smart-tabs"],
            "comma-dangle":             ["warn", "always-multiline"],

            "vue/max-len": ["warn", {
                code:                      120,
                ignoreComments:            true,
                ignoreRegExpLiterals:      true,
                ignoreStrings:             true,
                ignoreTemplateLiterals:    true,
                ignoreHTMLAttributeValues: true,
            }],

            "vue/no-multi-spaces": ["warn", {
                ignoreProperties: false,
            }],

            "newline-per-chained-call": ["warn", {
                ignoreChainWithDepth: 2,
            }],

            "no-prototype-builtins":                     "off",
            "comma-spacing":                             "warn",
            "arrow-spacing":                             "warn",
            "unicorn/prefer-includes":                   "warn",
            "no-unused-vars":                            "off",
            "@typescript-eslint/no-unused-vars":         ["error"],
            "no-unused-expressions":                     "off",
            "@typescript-eslint/no-unused-expressions":  "error",
            "@typescript-eslint/array-type":             "warn",
            "@typescript-eslint/no-non-null-assertion":  "off",
            "@typescript-eslint/camelcase":              "off",

            "@stylistic/member-delimiter-style": ["warn", {
                multiline: {
                    delimiter: "none",
                },

                singleline: {
                    delimiter: "comma",
                },
            }],

            "@stylistic/type-annotation-spacing": "error",
            "@stylistic/type-generic-spacing":    "error",

            "@typescript-eslint/naming-convention": ["warn", {
                selector: "enum",
                format:   ["PascalCase"],
            }, {
                selector:          "enumMember",
                format:            ["PascalCase", "UPPER_CASE"],
                leadingUnderscore: "allow",
            }],

            "@typescript-eslint/no-require-imports": "off",

            "vue/no-v-text-v-html-on-component": "off",
            "vue/no-v-html":                     "off",
            "vue/html-indent":                   ["warn", 4],
            "vue/this-in-template":              ["error", "never"],
            "vue/no-empty-component-block":      "warn",
            "array-callback-return":             "warn",
            "vue/no-multiple-template-root":     "off",
            "vue/no-v-for-template-key":         "off",
            "vue/define-macros-order":           ["error", {
                order:            ["defineModel", "defineEmits", "defineProps", "defineSlots"],
                defineExposeLast: false,
            }],
            "vue/no-side-effects-in-computed-properties": "error",
            "vue/prefer-import-from-vue":                 "warn",
            "vue/block-lang":                             ["error",
                {
                    script: {
                        lang: "ts",
                    },
                },
            ],
            "vue/block-order": ["error", {
                order: ["template", "script", "style"],
            }],
            "vue/component-api-style": ["error",
                ["script-setup"],
            ],
            "vue/define-emits-declaration":  ["error", "type-based"],
            "vue/define-props-declaration":  ["error", "type-based"],
            "vue/padding-line-between-tags": ["warn", [
                {
                    blankLine: "always",
                    prev:      "*",
                    next:      "*",
                },
            ]],
            "vue/no-deprecated-delete-set": "error",
            "vue/no-unused-refs":           "error",
            "no-restricted-imports": "off",
            "vue/prefer-use-template-ref":    "error",
            "vue/define-props-destructuring": ["error", { destructure: "never" }],
        },
    }]