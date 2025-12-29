require("dotenv").config();
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { formatDateForFolder } = require("./addGamesInTempDb");

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const streamToString = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
};

(async () => {
  try {
    const bucketName = "igdb-logs";
    const folderName = "webhooktotemp-db";
    const dateFolder = formatDateForFolder();
    const fileName = `${dateFolder}.json`;
    const key = `${folderName}/${fileName}`;

    const getCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    const response = await s3Client.send(getCommand);
    const bodyString = await streamToString(response.Body);
    const data = JSON.parse(bodyString);

    console.log("=== JSON File Contents ===");
    console.log("Total entries:", data.length);
    console.log("\n=== First Entry ===");
    console.log(JSON.stringify(data[0], null, 2));
    console.log("\n=== All Entries ===");
    data.forEach((entry, index) => {
      console.log(`\n[Entry ${index + 1}]`);
      console.log(`  ID: ${entry.id || "NO ID"}`);
      console.log(`  Name: ${entry.name || "NO NAME"}`);
      console.log(`  Keys: ${Object.keys(entry).join(", ")}`);
    });
  } catch (error) {
    console.error("Error:", error.message);
    if (error.name === "NoSuchKey") {
      console.log(
        "File doesn't exist yet. Run the test first to create entries."
      );
    }
  }
})();
