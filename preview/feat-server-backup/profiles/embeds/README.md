# Embed presets

Each file is one preset for an embedded stick2 (`#preset=<file name>`), and an example of how to set one up.
`tip` says what it is for; `cfg` holds only the options it changes from the defaults (every option: [docs/embed.md](../../docs/embed.md)).
Anything in the embed's hash goes on top: `#preset=arcade&p1=bonko&ui=-timer`.

After adding or changing one, run `npm run embed-presets` (writes `src/ui/embed-presets.js`; a test fails while it's out of date).
