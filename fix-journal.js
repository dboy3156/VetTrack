const fs = require("fs");

const files = fs.readdirSync("migrations")
  .filter(f => f.endsWith(".sql"))
  .sort();

const journal = {
  version: "5",
  dialect: "postgresql",
  entries: files.map((f, i) => ({
    idx: i,
    version: f.split("_")[0],
    when: Date.now(),
    tag: f.replace(".sql", "")
  }))
};

fs.writeFileSync("migrations/meta/_journal.json", JSON.stringify(journal, null, 2));
console.log("Journal fixed ✅");
