# Game objects

The object layer owns lifecycle, placement, collision descriptors, world-runtime
updates, and engine-neutral draw commands. The registry is flat: relationships
such as vehicle occupants, projectile ownership, and attached hazards belong to
the relevant domain objects instead of a generic parent/child hierarchy. Client
rendering consumes object draw commands without being imported by shared code.
