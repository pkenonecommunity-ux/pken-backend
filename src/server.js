const express = require("express");
const cors = require("cors");

const authRoutes = require("./modules/utilisateurs/auth.routes");
const absenceRoutes = require("./routes/absence/absence.routes");
const paiementsRoutes = require("./routes/paiements/paiements.routes");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  return res.status(200).json({ status: "ok" });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/absence", absenceRoutes);
app.use("/api/v1", paiementsRoutes);

// Gestion des erreurs
app.use((err, req, res, next) => {
  const status = err.statusCode || 500;
  return res.status(status).json({
    message: err.message || "Erreur interne du serveur.",
    code: err.code || "INTERNAL_ERROR"
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur PKEN démarré sur le port ${PORT}`);
});

module.exports = app;
