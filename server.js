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
mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.log("MongoDB connection error:", err));

// Schemas and Models
const cookieSchema = new mongoose.Schema({
  total: { type: Number, default: 0 },
});

const cookieTypeSchema = new mongoose.Schema({
  type: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
});

const cookieLogSchema = new mongoose.Schema({
  city: { type: String, required: true },
  state: { type: String, required: true },
  country: { type: String, required: true },
  cookieType: { type: String, required: true },
  cookies: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now },
});

const Cookie = mongoose.model("Cookie", cookieSchema);
const CookieType = mongoose.model("CookieType", cookieTypeSchema);
const CookieLog = mongoose.model("CookieLog", cookieLogSchema);

// Initialize Cookie Count
Cookie.findOne().then((doc) => {
  if (!doc) new Cookie({ total: 0 }).save();
});

// Routes
// Fetch cookie stats
app.get("/get-cookies", async (req, res) => {
  try {
    const totalDoc = await Cookie.findOne();
    const types = await CookieType.find({});
    const logs = await CookieLog.find({});

    const locations = logs.map((log) => ({
      city: log.city,
      state: log.state,
      country: log.country,
      cookieType: log.cookieType,
      cookies: log.cookies,
      timestamp: log.timestamp,
    }));

    res.json({
      total: totalDoc ? totalDoc.total : 0,
      types,
      locations,
    });
  } catch (err) {
    console.error("Error fetching cookie data:", err);
    res.status(500).send("Error fetching cookie data");
  }
});

// Add cookies
app.post("/add-cookies", async (req, res) => {
  const { cookies, city, state, country, cookieType } = req.body;

  if (!cookies || cookies <= 0 || typeof cookies !== "number" || !city || !state || !country || !cookieType) {
    return res.status(400).send("Invalid data. Ensure all fields are provided.");
  }

  try {
    // Update total cookie count
    const totalDoc = await Cookie.findOne();
    if (totalDoc) {
      totalDoc.total += cookies;
      await totalDoc.save();
    }

    // Update or create cookie type count
    await CookieType.findOneAndUpdate(
      { type: cookieType },
      { $inc: { count: cookies } },
      { upsert: true, new: true }
    );

    // Update or create log for city, state, and cookie type, with timestamp
    await CookieLog.findOneAndUpdate(
      { city, state, country, cookieType },
      { $inc: { cookies }, $set: { timestamp: new Date() } },
      { upsert: true, new: true }
    );

    // Fetch updated data to send back
    const updatedTypes = await CookieType.find({});
    const updatedLocations = await CookieLog.find({});

    res.json({
      total: totalDoc ? totalDoc.total : 0,
      types: updatedTypes,
      locations: updatedLocations,
    });
  } catch (err) {
    console.error("Error updating cookies:", err);
    res.status(500).send("Error updating cookie count");
  }
});

// Start the Server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
