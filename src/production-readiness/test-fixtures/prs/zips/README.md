# Zip inventory fixture catalog

`ZipInventoryFixtureCatalog` is the behavioral fixture catalog for the PRS candidate inventory.
The focused test builds each archive in memory with `fflate`, so the repository does not carry
opaque or potentially sensitive zip binaries.

| Fixture                           | Purpose                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------- |
| normalized text                   | Strips the Bolt `project/` root, sorts paths, hashes bytes, and counts lines. |
| ignored and unsafe paths          | Excludes vendor/generated paths and reports traversal-shaped names.           |
| package lockfiles                 | Keeps npm, pnpm, and Yarn lockfiles available to dependency analysis.         |
| budget and duplicate cases        | Stops before unsafe inflation and reports exact or normalized collisions.     |
| binary, large, and UTF-8 boundary | Keeps metadata without misclassifying a split multibyte character.            |

All contents are small, synthetic, deterministic, and created without network or extension APIs.
