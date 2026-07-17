import express from "express";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config({ override: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 4173);

app.disable("x-powered-by");
app.use(express.static(path.join(__dirname, "dist"), { extensions: ["html"] }));
app.get("*", (_request, response) => {
  response.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(port, host, () => {
  console.log(`RevoMail demo is running at http://${host}:${port}`);
});
