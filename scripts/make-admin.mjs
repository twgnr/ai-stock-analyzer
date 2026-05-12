import mongoose from "mongoose";
const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ai-stock-analyzer";
const email = process.argv[2];
if (!email) {
  console.error("Nutzung: node scripts/make-admin.mjs <email>");
  process.exit(1);
}
await mongoose.connect(uri);
const normalized = email.trim().toLowerCase();
const result = await mongoose.connection.db.collection("users").updateOne(
  { email: normalized },
  { $set: { role: "admin", emailVerified: true } }
);
if (result.matchedCount === 0) {
  console.error(`Kein User mit E-Mail "${normalized}" gefunden.`);
  process.exit(1);
}
console.log(`✓ ${normalized} ist jetzt Admin und verifiziert.`);
await mongoose.disconnect();
