## Question

What are the current (2026) ESLint best practices for a Node.js CommonJS project with Prettier?

## Findings

- **Flat config** (`eslint.config.js`) is the standard format. CommonJS projects use `eslint.config.cjs` or `require()` syntax in `.config.js`
- **Base config**: `@eslint/js` with `js.configs.recommended`
- **Node-specific**: `eslint-plugin-n` — official successor to `eslint-plugin-node`, covers process/path/require rules
- **Prettier integration**: `eslint-config-prettier` (goes last in config array) disables formatting rules that conflict with Prettier
- **`eslint-plugin-prettier` is discouraged** — causes conflicts with certain rules. Run tools separately instead
- **Packages needed**: `eslint`, `@eslint/js`, `eslint-plugin-n`, `eslint-config-prettier`

## Implications

- Use flat config format (`eslint.config.cjs` since project is CommonJS)
- Prettier config must be last in the array to override formatting rules
- ESLint handles logic/quality, Prettier handles formatting — separate concerns, separate commands
- `eslint-plugin-n` adds Node-specific checks (unsupported features, deprecated APIs, etc.)

## Risks and Uncertainties

- Existing code may have lint violations requiring initial fix pass
- `eslint-plugin-n` version compatibility with ESLint 10+ should be verified at install time

## Sources

- ESLint documentation (eslint.org)
- eslint-config-prettier documentation
- eslint-plugin-n documentation

## Open Questions

None — straightforward setup.
