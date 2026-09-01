# Third-party notices

Every PWA and Android build also carries
`THIRD_PARTY_NOTICES.txt` beside the compiled assets. It is generated from the
exact installed runtime dependency versions and contains the complete license
texts for Capacitor Android/Core, Model Context Protocol Core/Server,
Phosphor Icons, Lucide React, React, React DOM, Scheduler, tslib, ws and Zod.
The compiled JavaScript banner points to that file so minification cannot
silently separate the notice from the shipped application.

The public Fuyue shell uses selected icons from [Lucide](https://lucide.dev/).
Lucide is distributed under the ISC License; icons inherited from Feather
retain the MIT notice included by the upstream project. The complete bundled
notice is preserved in [`licenses/LUCIDE.txt`](licenses/LUCIDE.txt).

Heart, leaf, butterfly, water-drop, bubble and firefly geometry in the
ambient layer comes from [Phosphor Icons](https://phosphoricons.com/),
distributed under the MIT License. The complete notice is preserved in
[`licenses/PHOSPHOR.txt`](licenses/PHOSPHOR.txt).

Snow, star and paw variants in the ambient layer were exported through the
Iconify API from several upstream icon collections. Their recorded collection
prefixes and provenance are preserved in
[`licenses/AMBIENT_ICON_SOURCES.md`](licenses/AMBIENT_ICON_SOURCES.md); each
shape keeps its upstream license.

Third-party assets keep their upstream licenses and are not relicensed under
this repository's AGPL license.

The optional Engawa reading sidecar installs a pinned copy of
[tsuru0805/engawa-mcp](https://github.com/tsuru0805/engawa-mcp). The adapter,
installer and visible source label preserve its MIT provenance; the complete
notice is in [`licenses/ENGAWA_MCP.txt`](licenses/ENGAWA_MCP.txt).

The text-only travel notebook adapts the public Journey Cards data idea from
[nonchaiovo/journey-cards](https://github.com/nonchaiovo/journey-cards). It does
not include a visual-generation path. The complete MIT notice is in
[`licenses/JOURNEY_CARDS.txt`](licenses/JOURNEY_CARDS.txt).
