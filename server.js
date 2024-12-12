const express = require("express");
const mongoose = require("mongoose");
const { S3 } = require("@aws-sdk/client-s3");
const multer = require("multer");
const multerS3 = require("multer-s3");
const sharp = require("sharp");
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

// Configure AWS S3 using AWS SDK v3
const s3 = new S3({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  region: process.env.AWS_REGION || "us-east-2",
});

// Multer S3 configuration
const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: "cookiecounter--uploads", // Your S3 bucket name
    contentType: multerS3.AUTO_CONTENT_TYPE, // Automatically set content type
    key: (req, file, cb) => {
      const uniqueName = `uploads/${Date.now()}-${file.originalname}`;
      console.log(`Generated S3 key: ${uniqueName}`);
      cb(null, uniqueName);
    },
  }),
  fileFilter: (req, file, cb) => {
    const fileTypes = /jpeg|jpg|png|gif/;
    const extName = fileTypes.test(path.extname(file.originalname).toLowerCase());
    const mimeType = fileTypes.test(file.mimetype);

    if (extName && mimeType) {
      console.log("File passed validation:", file.originalname);
      return cb(null, true);
    } else {
      cb(new Error("Only image files are allowed (jpeg, jpg, png, gif)."));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // Limit file size to 5MB
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

  if (!cookies || isNaN(Number(cookies)) || Number(cookies) <= 0 || !city || !state || !country || !cookieType) {
    console.log("Invalid request body:", req.body);
    return res.status(400).send("Invalid data. Ensure all fields are provided.");
  }

  let photoUrl = null;
  if (req.file && req.file.location) {
    photoUrl = req.file.location; // S3 URL to the uploaded image
  }

  try {
    const totalDoc = await Cookie.findOne();
    if (totalDoc) {
      totalDoc.total += Number(cookies);
      await totalDoc.save();
    }

    await CookieType.findOneAndUpdate(
      { type: cookieType },
      { $inc: { count: Number(cookies) } },
      { upsert: true, new: true }
    );

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
