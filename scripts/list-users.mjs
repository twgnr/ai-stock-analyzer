import mongoose from "mongoose";
const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ai-stock-analyzer";
await mongoose.connect(uri);
const users = await mongoose.connection.db.collection("users").find({}, { projection: { email: 1, name: 1, role: 1, emailVerified: 1, createdAt: 1 } }).toArray();
console.log(`\nGefundene User (${users.length}):\n`);
for (const u of users) {
  const created = u.createdAt ? new Date(u.createdAt).toISOString().slice(0, 19) : "?";
  console.log(`  ${u.email}  role=${u.role || "user"}  verified=${u.emailVerified || false}  erstellt=${created}`);
}
await mongoose.disconnect();
