import dns from "node:dns";
import { MongoClient, type Db } from "mongodb";

// The sandboxed dev environment's default DNS resolver returns ESERVFAIL for
// SRV lookups (used by mongodb+srv:// URIs). Point Node's resolver at a
// public DNS server that supports SRV records so Atlas connection strings
// resolve correctly.
dns.setServers(["8.8.8.8", "1.1.1.1", ...dns.getServers()]);

const uri = process.env["MONGODB_URI"];

let _db: Db | null = null;
let _connectPromise: Promise<Db> | null = null;

export async function getDb(): Promise<Db> {
  if (_db) return _db;
  // Guard against concurrent first-calls creating multiple clients
  if (!_connectPromise) {
    if (!uri) throw new Error("MONGODB_URI environment variable is required");
    _connectPromise = (async () => {
      const client = new MongoClient(uri);
      await client.connect();
      _db = client.db("ta7edi30");
      return _db;
    })();
  }
  return _connectPromise;
}
