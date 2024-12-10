const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const axios = require("axios"); // Import Axios
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

// Define Schemas and Models
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
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
});

const Cookie = mongoose.model("Cookie", cookieSchema);
const CookieType = mongoose.model("CookieType", cookieTypeSchema);
const CookieLog = mongoose.model("CookieLog", cookieLogSchema);

// Initialize the Cookie Counter if it doesn't exist
Cookie.findOne().then((doc) => {
  if (!doc) new Cookie({ total: 0 }).save();
});

// Routes

// Fetch cookie stats
app.get("/get-cookies", async (req, res) => {
  try {
    const totalDoc = await Cookie.findOne(); // Fetch total cookie count
    const types = await CookieType.find({}); // Fetch types and counts
    const logs = await CookieLog.find({}); // Fetch all logs with city and state

    // Format locations from logs
    const locations = logs.map((log) => ({
      city: log.city,
      state: log.state,
      country: log.country,
      type: log.cookieType,
      count: log.cookies,
      latitude: log.latitude,
      longitude: log.longitude,
    }));

    // Send back all data
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
    // Use OpenCage Geocoding API to get latitude and longitude
    const apiKey = process.env.OPENCAGE_API_KEY; // Store your OpenCage API key in .env
    const geocodeUrl = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(
      `${city}, ${state}, ${country}`
    )}&key=${apiKey}`;

    const geocodeResponse = await axios.get(geocodeUrl);
    const locationData = geocodeResponse.data.results[0]?.geometry;

    if (!locationData) {
      return res.status(400).send("Unable to geocode location.");
    }

    const latitude = locationData.lat;
    const longitude = locationData.lng;

    // Update total cookie count
    const totalDoc = await Cookie.findOne();
    if (!totalDoc) {
      throw new Error("Total cookie document not found");
    }
    totalDoc.total += cookies;
    await totalDoc.save();

    // Update cookie type count
    await CookieType.findOneAndUpdate(
      { type: cookieType },
      { $inc: { count: cookies } },
      { upsert: true, new: true }
    );

    // Log the city, state, country, and cookie type with coordinates
    await new CookieLog({ city, state, country, cookieType, cookies, latitude, longitude }).save();

    res.json({
      total: totalDoc.total,
      types: await CookieType.find({}),
      locations: await CookieLog.find({}),
    });
  } catch (err) {
    console.error("Error updating cookies:", err);
    res.status(500).send("Error updating cookie count");
  }
});

// Start the server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
