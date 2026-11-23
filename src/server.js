require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const authRoutes = require("./modules/utilisateurs/auth.routes");
const absenceRoutes = require("./modules/absence/absence.routes");
const paiementsRoutes = require("./modules/paiements/paiements.routes");

const app = express();
app.use(helmet());

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origine non autorisée par CORS."));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

app.use(express.json({ limit: "1mb" }));

app.get("/api/v1/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    service: "PKEN ONE COMMUNITY - Backend v2.1.2",
    timestamp: new Date().toISOString()
  });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/absence", absenceRoutes);
app.use("/api/v1", paiementsRoutes);

app.use((req, res) => {
  res.status(404).json({
    code: "ROUTE_NOT_FOUND",
    message: `Route introuvable : ${req.method} ${req.originalUrl}`
  });
});

app.use((err, req, res, next) => {
  const status = err.statusCode || 500;
  res.status(status).json({
    code: err.code || "INTERNAL_SERVER_ERROR",
    message: err.message || "Erreur interne du serveur."
  });
});

const PORT = Number(process.env.PORT) || 10000;
app.listen(PORT, () => {
  console.log(`PKEN ONE COMMUNITY Backend v2.1.2 démarré sur le port ${PORT}`);
});
