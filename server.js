const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(__dirname));

const dataFile = path.join(__dirname, "data.json");

// ✅ GET → load data
app.get("/data", (req, res) => {
    try {
        const data = fs.readFileSync(dataFile, "utf-8");
        res.json(JSON.parse(data));
    } catch (err) {
        res.json([]);
    }
});

// ✅ POST → save data
app.post("/data", (req, res) => {
    fs.writeFileSync(dataFile, JSON.stringify(req.body, null, 2));
    res.json({ status: "saved" });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});