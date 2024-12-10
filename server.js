const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.log("MongoDB connection error:", err));

// Define Cookie Schema and Model
const cookieSchema = new mongoose.Schema({
  total: { type: Number, default: 0 },
});
const Cookie = mongoose.model("Cookie", cookieSchema);

// Initialize the Cookie Counter if it doesn't exist
Cookie.findOne().then((doc) => {
  if (!doc) new Cookie({ total: 0 }).save();
});

// Routes
app.get("/get-cookies", async (req, res) => {
  try {
    const doc = await Cookie.findOne();
    res.json({ total: doc ? doc.total : 0 });
  } catch (err) {
    res.status(500).send("Error fetching cookie count");
  }
});

app.post("/add-cookies", async (req, res) => {
  const { cookies } = req.body;

  if (!cookies || cookies <= 0 || typeof cookies !== "number") {
    return res.status(400).send("Invalid number of cookies");
  }

  try {
    const doc = await Cookie.findOne();
    doc.total += cookies;
    await doc.save();
    res.json({ total: doc.total });
  } catch (err) {
    res.status(500).send("Error updating cookie count");
  }
});

// Start the server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
