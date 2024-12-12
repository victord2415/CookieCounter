const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

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
  photo: { type: String }, // Path to the photo file
});

const Cookie = mongoose.model("Cookie", cookieSchema);
const CookieType = mongoose.model("CookieType", cookieTypeSchema);
const CookieLog = mongoose.model("CookieLog", cookieLogSchema);

// Initialize Cookie Count
Cookie.findOne().then((doc) => {
  if (!doc) new Cookie({ total: 0 }).save();
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const fileTypes = /jpeg|jpg|png|gif/;
    const extName = fileTypes.test(path.extname(file.originalname).toLowerCase());
    const mimeType = fileTypes.test(file.mimetype);
    if (extName && mimeType) {
      return cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
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
      photo: log.photo,
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

// Add cookies with optional photo
app.post("/add-cookies", upload.single("photo"), async (req, res) => {
  const { cookies, city, state, country, cookieType } = req.body;

  // Validate fields
  if (!cookies || isNaN(Number(cookies)) || Number(cookies) <= 0 || !city || !state || !country || !cookieType) {
    console.log("Invalid request body:", req.body);
    return res.status(400).send("Invalid data. Ensure all fields are provided.");
  }

  let photoPath = null;
  if (req.file) {
    try {
      const compressedPath = `uploads/compressed-${Date.now()}-${req.file.originalname}`;
      await sharp(req.file.path)
        .resize(800) // Resize to a max width of 800px
        .jpeg({ quality: 80 }) // Compress to 80% quality
        .toFile(compressedPath);
      fs.unlinkSync(req.file.path); // Remove original file to save space
      photoPath = compressedPath;
    } catch (err) {
      console.error("Error processing photo:", err);
      return res.status(500).send("Error processing photo.");
    }
  }

  try {
    // Update total cookie count
    const totalDoc = await Cookie.findOne();
    if (totalDoc) {
      totalDoc.total += Number(cookies);
      await totalDoc.save();
    }

    // Update or create cookie type count
    await CookieType.findOneAndUpdate(
      { type: cookieType },
      { $inc: { count: Number(cookies) } },
      { upsert: true, new: true }
    );

    // Create a new log entry
    const newLog = new CookieLog({
      city,
      state,
      country,
      cookieType,
      cookies: Number(cookies),
      timestamp: new Date(),
      photo: photoPath,
    });
    await newLog.save();

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
    res.status(500).send("Error updating cookie count.");
  }
});

// Start the Server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
