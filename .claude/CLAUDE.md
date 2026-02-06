# ChatPT

## Setup

- Package manager: **bun** (at `~/.bun/bin/bun` -- add to PATH: `export PATH="$HOME/.bun/bin:$PATH"`)
- Frontend: Next.js 16, React 19, Tailwind v4, Biome (in `frontend/`)
- Backend: Convex (in `frontend/convex/`)
- Auth: Clerk
- 3D: React Three Fiber + drei + three
- Run `npx convex dev` to generate `convex/_generated/` types (required before builds work)

## Convex

When doing any database work (schema changes, queries, mutations, actions), always use the relevant Convex skill first:
- `/convex` -- general Convex guidance
- `/convex-schema-validator` -- when writing or modifying schema/validators
- `/convex-functions` -- when writing queries, mutations, or actions
- `/convex-best-practices` -- when making architectural decisions about data modeling or patterns
