import mongoose from "mongoose";
const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ai-stock-analyzer";
await mongoose.connect(uri);
const db = mongoose.connection.db;
const collections = ["users", "positions", "watchlists", "savedscreens", "passwordresettokens", "emailverificationtokens", "usagelogs"];
for (const c of collections) {
  try {
    const res = await db.collection(c).deleteMany({});
    console.log(`${c}: ${res.deletedCount} gelöscht`);
  } catch (e) {
    console.log(`${c}: ${e.message}`);
  }
}
await mongoose.disconnect();
