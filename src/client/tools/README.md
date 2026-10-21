# Client tools

This directory contains standalone browser tools used to inspect or validate
the game visually. `scenarios.ts` is the gameplay/vehicle scenario entrypoint
and `sprites.ts` is the sprite inspection entrypoint. Tools may reuse
production loaders, shared simulation, and renderers, but they should not
become hidden alternate gameplay implementations.
