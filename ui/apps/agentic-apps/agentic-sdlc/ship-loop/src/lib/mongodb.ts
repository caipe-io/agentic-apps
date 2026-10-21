import { MongoClient, type Collection, type Document } from "mongodb";
let client: MongoClient | undefined;
export async function getCollection<T extends Document = Document>(
  name: string,
): Promise<Collection<T>> {
  const uri = process.env.AGENTIC_SDLC_MONGODB_URI;
  if (!uri) throw new Error("Agentic SDLC storage is not configured");
  client ??= new MongoClient(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
  });
  await client.connect();
  return client
    .db(process.env.AGENTIC_SDLC_MONGODB_DATABASE || "agentic_sdlc")
    .collection<T>(name);
}
