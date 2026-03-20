# Technical Debt Roadmap

## Done

- removed duplicated auth token/user storage from client-managed `localStorage`
- fixed admin feedback reply server bug
- closed Starter auto-assignment loophole for users with subscription history
- removed unsafe default export token secret fallback
- expanded smoke coverage for auth, admin feedback reply, and PDF export
- ignored local uploads/python cache artifacts and removed duplicate `package-lock 2.json` files
- restored production-like fullscreen navigation loader behavior without route blink
- added dedicated editor smoke coverage for journey edit + autosave + reload persistence
- completed `client` lint/runtime stabilization across `App.jsx`, key pages, journey editor components, and persona UI

## In Progress

- keep smoke coverage green while validating editor behavior manually after the stabilization pass

## Next

- add dedicated smoke coverage for portrait generation so the parallel persona/portrait flow is protected
- decide whether tracked build artifacts under `server/public/client/assets` and `server/public/admin/assets` should remain in git
- split `server/index.js` into smaller route/service modules after the UI debt is stabilized
- clean up remaining deployment/tooling noise such as the local admin build notifier issue

## Validation Rule

- after each meaningful code change, run the smoke suite and keep it green
