---
    name: MongoDB SRV DNS resolution in Replit dev sandbox
    description: mongodb+srv:// connection strings fail DNS SRV lookup in the dev sandbox even with a valid MONGODB_URI secret
    ---

    The Replit dev sandbox's default Node DNS resolver returns `ESERVFAIL` for SRV record
    queries (used by `mongodb+srv://` Atlas connection strings), even though the URI/credentials
    are correct and the same lookup succeeds against a public resolver like 8.8.8.8.

    **Why:** the sandbox's local/default DNS resolver doesn't support SRV record types; A/AAAA
    lookups work fine, so this only breaks the `+srv` shorthand DNS-based service discovery.

    **How to apply:** before creating the `MongoClient`, call
    `dns.setServers(["8.8.8.8", "1.1.1.1", ...dns.getServers()])` (Node's `node:dns` module) so
    the SRV lookup succeeds. This is a dev-sandbox-only symptom — check if it's still needed if
    debugging the same error in a deployed/production environment, which may not have this
    resolver limitation.
    