// APP_MODE is set once, externally, by the npm script that launched this whole test
// process (test:personal / test:commercial) — see package.json. Tests read it, they never
// set it, so the exact same test code runs unmodified under both modes across two separate
// `vitest run` invocations, per prompt-dla-claude-code.md's literal requirement.
export const currentAppMode = (process.env.APP_MODE ?? 'personal') as 'personal' | 'commercial';
