const express = require("express");
const mongoose = require("mongoose");
const AWS = require("aws-sdk");
const multer = require("multer");
const multerS3 = require("multer-s3");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const cors = require("cors");

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
  photo: { type: String }, // This will now be the S3 URL
});

const Cookie = mongoose.model("Cookie", cookieSchema);
const CookieType = mongoose.model("CookieType", cookieTypeSchema);
const CookieLog = mongoose.model("CookieLog", cookieLogSchema);

// Initialize Cookie Count
Cookie.findOne().then((doc) => {
  if (!doc) new Cookie({ total: 0 }).save();
});

// Configure AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

// Multer S3 configuration
const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: "cookiecounter--uploads", // Your S3 bucket name
    acl: "public-read", // Allows public access to files
    contentType: multerS3.AUTO_CONTENT_TYPE, // Automatically set content type
    key: (req, file, cb) => {
      try {
        // Generate a unique name for the uploaded file
        const uniqueName = `uploads/${Date.now()}-${file.originalname}`;
        console.log(`Generated S3 key: ${uniqueName}`);
        cb(null, uniqueName);
      } catch (err) {
        console.error("Error generating S3 key:", err);
        cb(err); // Pass the error to Multer
      }
    },
  }),
  fileFilter: (req, file, cb) => {
    try {
      // Allowed file types
      const fileTypes = /jpeg|jpg|png|gif/;
      const extName = fileTypes.test(path.extname(file.originalname).toLowerCase());
      const mimeType = fileTypes.test(file.mimetype);

      if (extName && mimeType) {
        console.log("File passed validation:", file.originalname);
        return cb(null, true);
      } else {
        console.error("Invalid file type:", file.originalname);
        cb(new Error("Only image files are allowed (jpeg, jpg, png, gif)."));
      }
    } catch (err) {
      console.error("Error during file validation:", err);
      cb(err); // Pass the error to Multer
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // Limit file size to 5MB
  },
});

module.exports = upload;

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
      photo: log.photo, // Now a S3 URL
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

  if (!cookies || isNaN(Number(cookies)) || Number(cookies) <= 0 || !city || !state || !country || !cookieType) {
    console.log("Invalid request body:", req.body);
    return res.status(400).send("Invalid data. Ensure all fields are provided.");
  }

  let photoUrl = null;
  if (req.file && req.file.location) {
    photoUrl = req.file.location; // S3 URL to the uploaded image
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
      photo: photoUrl,
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
