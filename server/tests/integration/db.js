const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

let replSet;

// Single-node REPLICA SET (not a plain mongod) so transactions work.
async function connect() {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri(), { dbName: 'citycart_test' });
}

async function disconnect() {
  await mongoose.disconnect();
  if (replSet) {
    await replSet.stop();
  }
}

// Empties collections but keeps their indexes.
async function clearAll() {
  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

module.exports = { connect, disconnect, clearAll };